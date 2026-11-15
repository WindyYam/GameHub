const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class BufferGeometry {
    constructor() { this.attributes = {}; }
    setAttribute(name, attribute) { this.attributes[name] = attribute; }
    setIndex(index) { this.index = index; }
    computeVertexNormals() { this.normalsComputed = true; }
}

class Float32BufferAttribute {
    constructor(values, itemSize) {
        this.array = new Float32Array(values);
        this.itemSize = itemSize;
        this.count = values.length / itemSize;
    }
    getX(index) { return this.array[index * this.itemSize]; }
    getY(index) { return this.array[index * this.itemSize + 1]; }
    getZ(index) { return this.array[index * this.itemSize + 2]; }
}

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'soldiers.js'), 'utf8');
const start = source.indexOf('const SculptEngine = {');
const end = source.indexOf('const TextureFactory = {', start);
assert.ok(start >= 0 && end > start, 'Soldier sculpt engine must be present');
const context = {
    THREE: {
        BufferGeometry,
        Float32BufferAttribute,
        MathUtils: {
            lerp: (a, b, t) => a + (b - a) * t,
            clamp: (value, min, max) => Math.max(min, Math.min(max, value))
        }
    }
};
const engine = vm.runInNewContext(`${source.slice(start, end)}; SculptEngine`, context);

test('all soldier face variants produce smooth, finite, indexed head meshes', () => {
    const meshes = [0, 1, 2].map(variant => engine.createRealisticHeadGeometry(variant));
    for (const mesh of meshes) {
        const positions = mesh.attributes.position;
        const uvs = mesh.attributes.uv;
        assert.ok(positions.count >= 1500, 'Head should have sufficient vertices for facial contours');
        assert.equal(uvs.count, positions.count);
        assert.ok(mesh.normalsComputed);
        assert.equal(mesh.index.length % 3, 0);
        assert.ok(Array.from(positions.array).every(Number.isFinite));
        assert.ok(Array.from(uvs.array).every(value => value >= 0 && value <= 1));
        assert.ok(mesh.index.every(index => index >= 0 && index < positions.count));
    }
    assert.notDeepEqual(meshes[0].attributes.position.array, meshes[2].attributes.position.array);
});

test('hair follows each head variant with a higher front hairline and a lower nape', () => {
    for (const variant of [0, 1, 2]) {
        const head = engine.createRealisticHeadGeometry(variant);
        const hair = engine.createHairGeometry(head);
        const positions = hair.attributes.position;
        const uvs = hair.attributes.uv;
        assert.ok(hair.normalsComputed);
        assert.equal(positions.count, uvs.count);
        assert.ok(Array.from(positions.array).every(Number.isFinite));
        assert.ok(hair.index.every(index => index >= 0 && index < positions.count));
        assert.ok(uvs.getY(24) > uvs.getY(0) + 0.2, 'Front hairline should sit above the nape');
        assert.ok(positions.getY(24) > positions.getY(0));
    }
});

test('head assembly is shortened without changing its width or depth', () => {
    const first = source.indexOf('const head = new THREE.Group();');
    const last = source.indexOf('// Anatomically Sculpted Male Head Mesh', first);
    assert.ok(first >= 0 && last > first, 'Head assembly setup must be present');
    class Group {
        constructor() {
            this.scale = { x: 1, y: 1, z: 1 };
            this.position = { set() {} };
        }
    }
    const neck = { add(child) { this.head = child; } };
    vm.runInNewContext(source.slice(first, last), { THREE: { Group }, neck });
    assert.equal(neck.head.scale.x, 1);
    assert.equal(neck.head.scale.y, 0.9);
    assert.equal(neck.head.scale.z, 1);
});
