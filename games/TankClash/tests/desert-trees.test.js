const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const envSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'environment.js'), 'utf8');

test('environment.js defines diverse desert tree and flora generator functions', () => {
    assert.ok(envSrc.includes('function createDatePalmGeometry(variant = 0)'), 'createDatePalmGeometry must accept variant');
    assert.ok(envSrc.includes('function createDesertAcaciaGeometry()'), 'createDesertAcaciaGeometry must be defined');
    assert.ok(envSrc.includes('function createDesertCactusGeometry(variant = 0)'), 'createDesertCactusGeometry must accept variant');

    // Check shared geometries initialization
    assert.ok(envSrc.includes('sharedPalmGeos = ['), 'sharedPalmGeos array must be defined');
    assert.ok(envSrc.includes('createDatePalmGeometry(0)'), 'Palm variant 0 (classic oasis) must be instantiated');
    assert.ok(envSrc.includes('createDatePalmGeometry(1)'), 'Palm variant 1 (tall royal) must be instantiated');
    assert.ok(envSrc.includes('createDatePalmGeometry(2)'), 'Palm variant 2 (windswept leaning) must be instantiated');
    assert.ok(envSrc.includes('createDatePalmGeometry(3)'), 'Palm variant 3 (compact fan) must be instantiated');

    assert.ok(envSrc.includes('sharedAcaciaGeo = createDesertAcaciaGeometry()'), 'Desert acacia must be instantiated');
    assert.ok(!envSrc.includes('bGeo.applyQuaternion'), 'BufferGeometry bGeo must not call applyQuaternion');
    assert.ok(envSrc.includes('bGeo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion'), 'bGeo must use applyMatrix4 with makeRotationFromQuaternion');
    assert.ok(envSrc.includes('sharedCactusGeos = ['), 'sharedCactusGeos array must be defined');
    assert.ok(envSrc.includes('createDesertCactusGeometry(0)'), 'Cactus variant 0 (classic 2-arm) must be instantiated');
    assert.ok(envSrc.includes('createDesertCactusGeometry(1)'), 'Cactus variant 1 (giant 4-arm) must be instantiated');
    assert.ok(envSrc.includes('createDesertCactusGeometry(2)'), 'Cactus variant 2 (multi-column organ pipe) must be instantiated');
});

test('environment.js exports shared tree variants to window for engine access', () => {
    assert.ok(envSrc.includes('window.sharedPalmGeo = sharedPalmGeo;'), 'sharedPalmGeo must be on window');
    assert.ok(envSrc.includes('window.sharedPalmGeos = sharedPalmGeos;'), 'sharedPalmGeos must be on window');
    assert.ok(envSrc.includes('window.sharedAcaciaGeo = sharedAcaciaGeo;'), 'sharedAcaciaGeo must be on window');
    assert.ok(envSrc.includes('window.sharedCactusGeo = sharedCactusGeo;'), 'sharedCactusGeo must be on window');
    assert.ok(envSrc.includes('window.sharedCactusGeos = sharedCactusGeos;'), 'sharedCactusGeos must be on window');
});

test('desert tree spawning in terrain chunks generates varied tree types and random rotations', () => {
    // Check that desert chunk creation handles palm variants, acacia and cactus variants
    assert.ok(envSrc.includes("treeType = 'palm'"), "Must spawn palm trees");
    assert.ok(envSrc.includes("treeType = 'acacia'"), "Must spawn umbrella acacia trees");
    assert.ok(envSrc.includes("treeType = 'cactus'"), "Must spawn cacti");
    assert.ok(envSrc.includes('sharedPalmGeos['), 'Must sample from palm variants');
    assert.ok(envSrc.includes('sharedCactusGeos['), 'Must sample from cactus variants');

    // Check that tree meshes are given random rotation around Y axis
    assert.ok(envSrc.includes('treeMesh.rotation.y = rng() * Math.PI * 2;'), 'Trees must have randomized Y rotation');
});

test('desert oasis static palms are framed with alternating palm variants and radial orientation', () => {
    // Check oasis palm generation around (58, 78)
    assert.ok(envSrc.includes('sharedPalmGeos[p % sharedPalmGeos.length]'), 'Oasis palms must alternate variants');
    assert.ok(envSrc.includes('pMesh.rotation.y = ang + Math.PI * 0.5'), 'Oasis palms must orient naturally around water pool');
});
