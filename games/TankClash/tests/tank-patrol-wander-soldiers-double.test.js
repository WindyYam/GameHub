const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readScript(fileName) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', fileName), 'utf8');
}

test('enemyAI.js implements wandering behavior during PATROL state when not detecting player', () => {
    const aiSrc = readScript('enemyAI.js');
    const patrolIdx = aiSrc.indexOf("State: PATROL");
    assert.ok(patrolIdx !== -1, 'enemyAI.js must have PATROL section');
    const engagingIdx = aiSrc.indexOf("State: ENGAGING");
    assert.ok(engagingIdx !== -1 && engagingIdx > patrolIdx, 'PATROL section must precede ENGAGING');
    const snippet = aiSrc.slice(patrolIdx, engagingIdx);

    assert.ok(snippet.includes('e.patrolState'), 'PATROL must track patrolState');
    assert.ok(snippet.includes('WANDER'), 'PATROL must support WANDER state');
    assert.ok(snippet.includes('SCAN'), 'PATROL must support SCAN state');
    assert.ok(snippet.includes('e.speed'), 'PATROL must drive the tank forward with speed');
    assert.ok(snippet.includes('e.enemyRoot.position.set'), 'PATROL must update tank position');
    assert.ok(snippet.includes('updateTracksGeometry'), 'PATROL must animate tracks when wandering');
    assert.ok(snippet.includes('worldObstacles'), 'PATROL must avoid obstacles while wandering');
});

test('soldiers.js doubles the number of escort soldiers per tank to 4', () => {
    const soldiersSrc = readScript('soldiers.js');
    const escortFnIdx = soldiersSrc.indexOf('function spawnSoldierEscortForTank');
    assert.ok(escortFnIdx !== -1, 'soldiers.js must define spawnSoldierEscortForTank');
    const snippet = soldiersSrc.slice(escortFnIdx, escortFnIdx + 600);

    const matchOffsets = snippet.match(/dx:\s*[-0-9.]+/g);
    assert.ok(matchOffsets && matchOffsets.length === 4, 'Must define 4 escort offsets per tank (2x previous 2)');
});

test('enemyAI.js increases dynamic soldier spawn cap to 28 (2x from 14)', () => {
    const aiSrc = readScript('enemyAI.js');
    assert.ok(aiSrc.includes('currentSoldiers < 28'), 'enemyAI.js must have 28 soldier cap (2x previous 14)');
});
