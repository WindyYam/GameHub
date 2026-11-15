const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('shaders.js uses alpha transparency for smoke effect', () => {
    const shadersPath = path.join(__dirname, '..', 'js', 'shaders.js');
    const source = fs.readFileSync(shadersPath, 'utf8');

    // Verify smoke material existence
    const matStart = source.indexOf('function createHaltonSmokeMaterial');
    assert.ok(matStart !== -1, 'createHaltonSmokeMaterial must exist');
    const matEnd = source.indexOf('return mat;', matStart);
    const matSnippet = source.slice(matStart, matEnd + 50);

    // Verify alpha transparency settings for smoke
    assert.ok(matSnippet.includes('transparent: true'), 'Smoke material must have transparent: true for smooth alpha blending');
    assert.ok(matSnippet.includes('depthWrite: false'), 'Smoke material must have depthWrite: false');
    assert.ok(matSnippet.includes('blending: THREE.NormalBlending'), 'Smoke material must use THREE.NormalBlending');
    assert.ok(matSnippet.includes('smoothAlpha'), 'Smoke fragment shader must output smoothAlpha');
});
