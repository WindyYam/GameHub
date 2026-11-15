const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readScript(fileName) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', fileName), 'utf8');
}

test('enemyAI.js only emits player wreck smoke when tank is actually visible and owned', () => {
    const enemyAISrc = readScript('enemyAI.js');
    const smokeLineIdx = enemyAISrc.indexOf('Player tank wreck smoke');
    assert.ok(smokeLineIdx !== -1, 'enemyAI.js must have player wreck smoke section');
    const smokeSnippet = enemyAISrc.slice(smokeLineIdx, smokeLineIdx + 600);

    assert.ok(smokeSnippet.includes('window.tankRoot'), 'smoke snippet must check tankRoot');
    assert.ok(smokeSnippet.includes('window.tankRoot.visible'), 'smoke snippet must check tankRoot.visible');
    assert.ok(smokeSnippet.includes('pState.hasTank !== false'), 'smoke snippet must check hasTank');
});

test('physics.js exports clearParticles to wipe leftover particles on respawn', () => {
    const physicsSrc = readScript('physics.js');
    assert.ok(physicsSrc.includes('function clearParticles()'), 'physics.js must define clearParticles');
    assert.ok(physicsSrc.includes('window.clearParticles = clearParticles'), 'physics.js must export clearParticles');
});

test('main.js deployAsSoldier cleans up particles and does not mark isKnockedOut on infantry deployment', () => {
    const mainSrc = readScript('main.js');
    const deployIdx = mainSrc.indexOf('function deployAsSoldier()');
    assert.ok(deployIdx !== -1, 'main.js must define deployAsSoldier');
    const deploySnippet = mainSrc.slice(deployIdx, deployIdx + 600);

    assert.ok(deploySnippet.includes('window.clearParticles'), 'deployAsSoldier must clear lingering particles');
    assert.ok(deploySnippet.includes('window.tankState.isKnockedOut = false'), 'deployAsSoldier must not mark tank as knocked out');
    assert.ok(deploySnippet.includes('window.tankState.hasTank = false'), 'deployAsSoldier must mark hasTank as false');
});
