const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('index.html has removed the seed indicator from the top right bar', () => {
    const htmlPath = path.join(__dirname, '..', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert.equal(html.includes('id="hud-seed-display"'), false, 'index.html must not contain hud-seed-display');
});

test('restartGame in environment.js preserves the current world seed and biome zone on respawn', () => {
    const envPath = path.join(__dirname, '..', 'js', 'environment.js');
    const envSrc = fs.readFileSync(envPath, 'utf8');

    // Find restartGame implementation
    const restartIdx = envSrc.indexOf('function restartGame(');
    assert.ok(restartIdx > 0, 'environment.js must define restartGame');
    const restartBlock = envSrc.slice(restartIdx, restartIdx + 500);

    // Verify it defaults to currentSeed and currentZone instead of generating random ones
    assert.ok(restartBlock.includes('currentSeed'), 'restartGame must preserve currentSeed on respawn');
    assert.ok(restartBlock.includes('currentZone'), 'restartGame must preserve currentZone on respawn');
    assert.equal(restartBlock.includes('Math.floor(Math.random() * 900000)'), false, 'restartGame must not randomize seed on respawn');
    assert.equal(restartBlock.includes('otherZones = ALL_ZONES.filter'), false, 'restartGame must not cycle away from currentZone on respawn');
});
