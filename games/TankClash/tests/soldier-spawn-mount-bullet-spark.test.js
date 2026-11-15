const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readScript(fileName) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', fileName), 'utf8');
}

test('playerSoldier.js updateInteractProximity requires an operational visible tank to show mount prompt', () => {
    const soldierSrc = readScript('playerSoldier.js');
    assert.ok(soldierSrc.includes('hasOperationalTank'), 'must define hasOperationalTank check');
    assert.ok(soldierSrc.includes('window.tankState.hasTank !== false'), 'must verify hasTank is not false');
    assert.ok(soldierSrc.includes('window.tankRoot.visible'), 'must verify tankRoot is visible');
    assert.ok(!soldierSrc.includes('dOwn < 4.2 && !ownTankDestroyed'), 'must not trigger mount solely on dOwn < 4.2 without checking operational tank');
});

test('main.js deployAsSoldier moves tankState and tankRoot away and marks hasTank false', () => {
    const mainSrc = readScript('main.js');
    const deployIdx = mainSrc.indexOf('function deployAsSoldier()');
    assert.ok(deployIdx !== -1, 'main.js must define deployAsSoldier');
    const deploySnippet = mainSrc.slice(deployIdx, deployIdx + 800);

    assert.ok(deploySnippet.includes('window.tankState.hasTank = false'), 'must mark hasTank as false');
    assert.ok(deploySnippet.includes('window.tankRoot.visible = false'), 'must hide tankRoot');
    assert.ok(deploySnippet.includes('window.tankState.x = 99999'), 'must move tankState x coordinate away');
});

test('main.js exhaust smoke checks canEmitExhaust so no smoke puffs at spawn when deploying as soldier', () => {
    const mainSrc = readScript('main.js');
    const exhaustIdx = mainSrc.indexOf('Realistic Twin Armored Exhaust Puffs');
    assert.ok(exhaustIdx !== -1, 'main.js must define exhaust section');
    const snippet = mainSrc.slice(exhaustIdx, exhaustIdx + 300);

    assert.ok(snippet.includes('canEmitExhaust'), 'must guard exhaust with canEmitExhaust');
    assert.ok(snippet.includes('hasTank !== false'), 'exhaust must require hasTank');
    assert.ok(snippet.includes('tankRoot.visible'), 'exhaust must require tankRoot.visible');
});

test('enemyAI.js onHit does not spawn smoke or deal armor damage on bullet hits (damage <= 0)', () => {
    const aiSrc = readScript('enemyAI.js');
    const onHitIdx = aiSrc.indexOf('onHit(impactPos, hitDir, damage = 1)');
    assert.ok(onHitIdx !== -1, 'enemyAI.js must have onHit method');
    const onHitSnippet = aiSrc.slice(onHitIdx, onHitIdx + 800);

    assert.ok(onHitSnippet.includes('if (dmg <= 0)'), 'must check for non-damaging bullet hit');
    assert.ok(onHitSnippet.includes('this.wasHitAlert = true'), 'must alert enemy AI on bullet hit');
    const returnIdx = onHitSnippet.indexOf('return;');
    const smokeIdx = onHitSnippet.indexOf("'smoke'");
    assert.ok(returnIdx !== -1 && (smokeIdx === -1 || returnIdx < smokeIdx), 'bullet hit must return before any smoke particles are spawned');
});

test('physics.js tracers hitting tanks only spawn sparks without smoke', () => {
    const physicsSrc = readScript('physics.js');
    const tracerHitIdx = physicsSrc.indexOf("if (closestActor.type === 'tank')");
    assert.ok(tracerHitIdx !== -1, 'physics.js must handle closestActor.type === tank');
    const snippet = physicsSrc.slice(tracerHitIdx, tracerHitIdx + 600);

    assert.ok(snippet.includes("'spark'"), 'tank bullet hit must spawn spark particles');
    assert.ok(!snippet.includes("'smoke'"), 'tank bullet hit in physics must not spawn smoke particles');
});
