const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
}

test('physics.js initializes tankState with hasTank = false', () => {
    const physicsSrc = readScript('physics.js');
    assert.ok(physicsSrc.includes('hasTank: false'), 'tankState must initialize with hasTank: false');
});

test('main.js keeps tankRoot invisible and away until player deploys', () => {
    const mainSrc = readScript('main.js');
    assert.ok(
        mainSrc.includes('if (window.tankState) {\n    window.tankState.hasTank = false;\n}') ||
        mainSrc.includes('window.tankState.hasTank = false'),
        'main.js must ensure tankState.hasTank is initially false'
    );
    assert.ok(
        mainSrc.includes('window.tankRoot.visible = false') &&
        mainSrc.includes('window.tankRoot.position.set(0, -9999, 0)'),
        'main.js must ensure tankRoot is initially hidden and positioned out of view'
    );
});

test('reticles and weapons remain inactive when hasTank is false', () => {
    const mainSrc = readScript('main.js');
    const physicsSrc = readScript('physics.js');
    assert.ok(mainSrc.includes('window.tankState.hasTank === false'), 'reticles must be hidden when hasTank is false');
    assert.ok(physicsSrc.includes('tankState.hasTank === false'), 'cannon/MGs must not fire when hasTank is false');
});
