const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readScript(fileName) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', fileName), 'utf8');
}

test('playerSoldier.js hijackTank properly re-activates tankState.hasTank, visibility and weapon states', () => {
    const soldierSrc = readScript('playerSoldier.js');
    const hijackIdx = soldierSrc.indexOf('function hijackTank(enemyTank)');
    assert.ok(hijackIdx !== -1, 'playerSoldier.js must define hijackTank');

    const nextFuncIdx = soldierSrc.indexOf('function firePlayerSMGRound()', hijackIdx);
    const hijackSnippet = soldierSrc.slice(hijackIdx, nextFuncIdx !== -1 ? nextFuncIdx : hijackIdx + 4000);

    // Tank must not disappear
    assert.ok(hijackSnippet.includes('window.tankState.hasTank = true'), 'hijackTank must mark hasTank as true');
    assert.ok(hijackSnippet.includes('window.tankRoot.visible = true'), 'hijackTank must make tankRoot visible');

    // Tank weapons must be operational immediately
    assert.ok(hijackSnippet.includes('window.tankState.isKnockedOut = false'), 'hijackTank must reset isKnockedOut to false');
    assert.ok(hijackSnippet.includes('window.tankState.reloadTimer = 0'), 'hijackTank must reset main cannon reload timer to 0');
    assert.ok(hijackSnippet.includes('window.tankState.mgHeat = 0'), 'hijackTank must reset MG heat to 0');

    // UI and controls must switch to tank mode
    assert.ok(hijackSnippet.includes("playerMode = 'tank'"), 'hijackTank must set playerMode to tank');
    assert.ok(hijackSnippet.includes('syncInfantryUI(false)'), 'hijackTank must deactivate infantry UI');
    assert.ok(hijackSnippet.includes('updateArmorHUD'), 'hijackTank must refresh armor HUD');
});

test('main.js deployPurchasedTank resets tank position to spawn (0, 0) and re-enables tankRoot and weapons', () => {
    const mainSrc = readScript('main.js');
    const deployIdx = mainSrc.indexOf('function deployPurchasedTank(tankId)');
    assert.ok(deployIdx !== -1, 'main.js must define deployPurchasedTank');

    const nextFuncIdx = mainSrc.indexOf('function deployAsSoldier()', deployIdx);
    const snippet = mainSrc.slice(deployIdx, nextFuncIdx !== -1 ? nextFuncIdx : deployIdx + 3000);

    assert.ok(snippet.includes('window.tankState.x = 0'), 'deployPurchasedTank must reset tankState.x to 0');
    assert.ok(snippet.includes('window.tankState.z = 0'), 'deployPurchasedTank must reset tankState.z to 0');
    assert.ok(snippet.includes('window.tankState.hasTank = true'), 'deployPurchasedTank must mark hasTank true');
    assert.ok(snippet.includes('window.tankRoot.visible = true'), 'deployPurchasedTank must make tankRoot visible');
    assert.ok(snippet.includes('window.tankState.reloadTimer = 0'), 'deployPurchasedTank must clear reloadTimer');
});

test('main.js animate loop ensures tankRoot is visible when hasTank is true', () => {
    const mainSrc = readScript('main.js');
    const animIdx = mainSrc.indexOf('Apply transforms to Tank Root & Chassis');
    assert.ok(animIdx !== -1, 'main.js must have tank root transform section');

    const snippet = mainSrc.slice(animIdx, animIdx + 600);
    assert.ok(snippet.includes('tankRoot.visible = true'), 'must explicitly set tankRoot.visible to true when hasTank is not false');
});

test('environment.js restartGame preserves activeChunks in the same world to prevent 10+ seconds chunk reload lag', () => {
    const envSrc = readScript('environment.js');
    const restartIdx = envSrc.indexOf('function restartGame(customSeed, customZone)');
    assert.ok(restartIdx !== -1, 'environment.js must define restartGame');

    const snippet = envSrc.slice(restartIdx, restartIdx + 3500);

    assert.ok(snippet.includes('isSameWorld'), 'restartGame must check if seed and zone match existing world');
    assert.ok(snippet.includes('if (!isSameWorld)'), 'restartGame must only dispose active chunks if world changed');
    assert.ok(snippet.includes('updateTerrainChunks(0, 0, false)'), 'restartGame must keep existing chunks when world is the same');
});
