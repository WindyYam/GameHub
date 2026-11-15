const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
const start = source.indexOf('function updateCelestialShadows(');
const end = source.indexOf("\nrenderer.domElement.addEventListener('webglcontextrestored'", start);
assert.ok(start >= 0 && end > start);

function createHarness() {
    const calls = [];
    const shadow = { autoUpdate: true, needsUpdate: true, map: { name: 'shadow' } };
    const oldTarget = { name: 'previous' };
    const oldColor = { name: 'previous color' };
    const renderer = {
        getRenderTarget: () => oldTarget,
        getActiveCubeFace: () => 2,
        getActiveMipmapLevel: () => 3,
        getClearColor: () => oldColor,
        getClearAlpha: () => 0.4,
        getScissorTest: () => true,
        setRenderTarget: (...args) => calls.push(['target', ...args]),
        setClearColor: (...args) => calls.push(['color', ...args]),
        setScissorTest: (...args) => calls.push(['scissor', ...args]),
        clear: (...args) => calls.push(['clear', ...args])
    };
    const context = vm.createContext({ sunLight: { castShadow: true, shadow }, renderer, THREE: { Color: class Color {} } });
    vm.runInContext(source.slice(start, end), context);
    return { shadow, calls, context, oldTarget, oldColor };
}

test('horizon clears the shadow map once without changing the shader variant', () => {
    const { shadow, calls, context, oldTarget, oldColor } = createHarness();
    context.updateCelestialShadows(false);
    assert.deepEqual(calls, [
        ['target', shadow.map],
        ['scissor', false],
        ['color', 0xffffff, 1],
        ['clear', true, true, false],
        ['target', oldTarget, 2, 3],
        ['color', oldColor, 0.4],
        ['scissor', true]
    ]);
    assert.equal(shadow.autoUpdate, false);
    assert.equal(shadow.needsUpdate, false);
    assert.equal(context.sunLight.castShadow, true);
    context.updateCelestialShadows(false);
    assert.equal(calls.length, 7);
    context.updateCelestialShadows(true);
    assert.equal(shadow.autoUpdate, true);
    context.updateCelestialShadows(false);
    assert.equal(calls.length, 14);
});

test('waits for the initial shadow map before disabling updates', () => {
    const { shadow, calls, context } = createHarness();
    shadow.map = null;
    context.updateCelestialShadows(false);
    assert.equal(shadow.autoUpdate, true);
    assert.equal(calls.length, 0);
    shadow.map = { name: 'new shadow' };
    context.updateCelestialShadows(false);
    assert.equal(shadow.autoUpdate, false);
    assert.equal(calls.length, 7);
});

test('restores renderer state if clearing fails', () => {
    const { shadow, calls, context, oldTarget, oldColor } = createHarness();
    context.renderer.clear = () => { throw new Error('clear failed'); };
    assert.throws(() => context.updateCelestialShadows(false), /clear failed/);
    assert.equal(shadow.autoUpdate, true);
    assert.deepEqual(calls.slice(-3), [
        ['target', oldTarget, 2, 3],
        ['color', oldColor, 0.4],
        ['scissor', true]
    ]);
});
