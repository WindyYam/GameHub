const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('shaders.js configures faster cloud flow drift in sky fragment shader', () => {
    const shadersPath = path.join(__dirname, '..', 'js', 'shaders.js');
    const source = fs.readFileSync(shadersPath, 'utf8');

    // Verify sampleCloudDensity exists
    assert.ok(source.includes('sampleCloudDensity(vec2 uv)'), 'shaders.js should define sampleCloudDensity');

    // Check wind velocity in sampleCloudDensity
    const windMatch = source.match(/vec2\s+wind\s*=\s*vec2\(uTime\s*\*\s*([0-9.]+),\s*uTime\s*\*\s*([0-9.]+)\);/);
    assert.ok(windMatch, 'shaders.js must define wind vector based on uTime');

    const uSpeed = parseFloat(windMatch[1]);
    const vSpeed = parseFloat(windMatch[2]);

    // Originally 0.0028 and 0.0010 (nearly static). Should be >= 0.012 for visibly flowing clouds.
    assert.ok(uSpeed >= 0.012, `Primary cloud flow speed ${uSpeed} should be >= 0.012 for noticeably faster flow`);
    assert.ok(vSpeed >= 0.004, `Secondary cloud flow speed ${vSpeed} should be >= 0.004 for noticeably faster flow`);
});
