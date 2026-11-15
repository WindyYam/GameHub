const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
}

test('shaders.js defines volumetric dust geometry and material generators', () => {
    const shadersSrc = readScript('shaders.js');

    assert.ok(shadersSrc.includes('function createVolumetricDustGeometry()'), 'createVolumetricDustGeometry must be defined');
    assert.ok(shadersSrc.includes('function createVolumetricDustMaterial('), 'createVolumetricDustMaterial must be defined');
    assert.ok(shadersSrc.includes('function createDustDiffuseTexture()'), 'createDustDiffuseTexture must be defined');
    assert.ok(shadersSrc.includes('function createDustNormalTexture()'), 'createDustNormalTexture must be defined');

    // Check window exports
    assert.ok(shadersSrc.includes('window.createVolumetricDustGeometry = createVolumetricDustGeometry;'));
    assert.ok(shadersSrc.includes('window.createVolumetricDustMaterial = createVolumetricDustMaterial;'));
    assert.ok(shadersSrc.includes('window.createDustDiffuseTexture = createDustDiffuseTexture;'));
    assert.ok(shadersSrc.includes('window.createDustNormalTexture = createDustNormalTexture;'));

    // Check that shader eliminates hard circles with soft edge feathering
    assert.ok(shadersSrc.includes('smoothstep(1.42, 0.15, r)'), 'Shader must apply smooth core-to-perimeter decay');
    assert.ok(shadersSrc.includes('mieForward'), 'Shader must implement forward Mie scattering for sunlit dust glow');
});

test('physics.js manages dustPool, handles dust particle lifecycle, and shapes dirt clods', () => {
    const physicsSrc = readScript('physics.js');

    // dustPool exists
    assert.ok(physicsSrc.includes('const dustPool = [];'), 'dustPool must be defined');
    assert.ok(physicsSrc.includes('window.dustPool = dustPool;'), 'dustPool must be exposed on window');

    // Dirt particles use irregular clod geometry and shaded material (no flat unlit circles)
    assert.ok(physicsSrc.includes('function createDirtClodGeometry()'), 'createDirtClodGeometry must be defined');
    assert.ok(physicsSrc.includes('new THREE.MeshLambertMaterial'), 'Dirt clods must use shaded MeshLambertMaterial');

    // spawnParticle handles 'dust' type
    assert.ok(physicsSrc.includes("if (type === 'dust')"), "spawnParticle must have dedicated 'dust' branch");
    assert.ok(physicsSrc.includes('isDust: true'), 'dust particles must be flagged for pooling');

    // updateParticles handles dust expansion, ground interaction, and recycling
    assert.ok(physicsSrc.includes("if (p.type === 'dust')"), "updateParticles must update 'dust' particles");
    assert.ok(physicsSrc.includes('if (p.isDust)'), 'updateParticles must recycle dust particles to dustPool');

    // Gun muzzle ground shockwave kicks up dust particles
    assert.ok(physicsSrc.includes("spawnParticle(groundUnderMuzzle, dustVel, groundDustCol, 0.45, 3.8"), 'Main cannon muzzle blast must kick up ground dust');
});

test('main.js emits dynamic track dust plumes when driving or turning', () => {
    const mainSrc = readScript('main.js');

    assert.ok(mainSrc.includes("spawnParticle(kickPos, kickVel, puffCol, startSize, endSize, life, false, 'dust'"), 'Driving in the wild must spawn dust particles');
    assert.ok(mainSrc.includes('treeDustCol'), 'Falling tree impacts must spawn dust particles');
});

test('enemyAI.js emits track dust plumes when driving and under cannon muzzle blast', () => {
    const enemySrc = readScript('enemyAI.js');

    assert.ok(enemySrc.includes("window.spawnParticle(kickPos, kickVel, dustCol, 0.35, 2.5"), 'Enemy tank movement must kick up dust plumes');
    assert.ok(enemySrc.includes("window.spawnParticle(groundUnderMuzzle, dVel, groundDustCol, 0.38, 3.4"), 'Enemy cannon fire must kick up ground dust shockwave');
});
