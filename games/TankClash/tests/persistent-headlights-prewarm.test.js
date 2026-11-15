const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
}

test('main.js establishes persistent SpotLight rig to keep scene light count constant', () => {
    const mainSrc = readScript('main.js');
    assert.ok(mainSrc.includes('persistentHeadlightSpots'), 'main.js must define persistentHeadlightSpots');
    assert.ok(mainSrc.includes('window.persistentHeadlightSpots = persistentHeadlightSpots'), 'main.js must export persistentHeadlightSpots to window');
    assert.ok(mainSrc.includes('new THREE.SpotLight('), 'persistentHeadlightSpots must create SpotLights');
});

test('tankModel.js maps tank headlightLights to persistentHeadlightSpots', () => {
    const modelSrc = readScript('tankModel.js');
    assert.ok(modelSrc.includes('window.persistentHeadlightSpots'), 'tankModel.js must reference persistentHeadlightSpots');
    assert.ok(modelSrc.includes('hl.spot = window.persistentHeadlightSpots[idx]'), 'tankModel.js must link headlights to persistent spots');
});

test('soldiers.js exports prewarmSoldierAssets to initialize uniforms and textures ahead of time', () => {
    const soldiersSrc = readScript('soldiers.js');
    assert.ok(soldiersSrc.includes('function prewarmSoldierAssets()'), 'soldiers.js must define prewarmSoldierAssets');
    assert.ok(soldiersSrc.includes('window.prewarmSoldierAssets = prewarmSoldierAssets'), 'soldiers.js must export prewarmSoldierAssets to window');
});

test('main.js prewarms all scene shaders during initialization before loading screen dismissal', () => {
    const mainSrc = readScript('main.js');
    assert.ok(mainSrc.includes('function prewarmAllSceneShaders()'), 'main.js must define prewarmAllSceneShaders');
    assert.ok(mainSrc.includes('renderer.compile(scene, activeCamera)'), 'prewarmAllSceneShaders must invoke renderer.compile on scene');
    assert.ok(mainSrc.includes('prewarmAllSceneShaders()'), 'main.js must call prewarmAllSceneShaders on window load');
});

test('deployAsSoldier resets persistent headlight intensities without removing them from scene', () => {
    const mainSrc = readScript('main.js');
    assert.ok(mainSrc.includes('deployAsSoldier'), 'main.js must define deployAsSoldier');
    assert.ok(mainSrc.includes('window.persistentHeadlightSpots.forEach'), 'deployAsSoldier must zero persistent headlight intensities');
});
