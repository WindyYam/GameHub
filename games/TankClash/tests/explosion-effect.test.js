const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8').replace(/\r\n/g, '\n');
}

function createThreeMock() {
    class Color {
        constructor(hex = 0xffffff) {
            this.isColor = true;
            this.hex = typeof hex === 'number' ? hex : 0xffffff;
        }
        setHex(hex) { this.hex = hex; return this; }
        copy(c) { this.hex = c.hex; return this; }
        clone() { return new Color(this.hex); }
    }
    class Vector2 {
        constructor(x = 0, y = 0) { this.x = x; this.y = y; }
        set(x, y) { this.x = x; this.y = y; return this; }
    }
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        copy(v) { return this.set(v.x, v.y, v.z); }
        clone() { return new Vector3(this.x, this.y, this.z); }
        add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
        addScaledVector(v, s) { return this.set(this.x + v.x * s, this.y + v.y * s, this.z + v.z * s); }
        multiplyScalar(s) { return this.set(this.x * s, this.y * s, this.z * s); }
        lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
        length() { return Math.sqrt(this.lengthSq()); }
        normalize() { const l = this.length(); return l ? this.multiplyScalar(1 / l) : this; }
    }
    class Vector4 {
        constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
    }
    class Quaternion {
        constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
        setFromUnitVectors() { return this; }
        copy() { return this; }
    }
    class Euler {
        constructor() { this.x = 0; this.y = 0; this.z = 0; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    }
    class BufferGeometry {
        constructor() { this.attributes = { position: { count: 4, getX: () => 1, getY: () => 1, getZ: () => 1, setXYZ: () => {} } }; }
        setAttribute() {}
        setIndex() {}
        computeVertexNormals() {}
        rotateX() { return this; }
    }
    class BaseMaterial {
        constructor(opts = {}) {
            Object.assign(this, opts);
            if (!this.color) this.color = new Color(opts.color !== undefined ? opts.color : 0xffffff);
            else if (typeof this.color === 'number') this.color = new Color(this.color);
        }
        dispose() {}
        clone() { return new BaseMaterial({ ...this, color: this.color.clone() }); }
    }
    class ShaderMaterial extends BaseMaterial {
        constructor(opts = {}) {
            super(opts);
            this.uniforms = opts.uniforms || {};
        }
        clone() {
            const clonedUniforms = {};
            for (const [k, u] of Object.entries(this.uniforms)) {
                const v = u.value;
                clonedUniforms[k] = { value: (v && typeof v.clone === 'function') ? v.clone() : v };
            }
            return new ShaderMaterial({ ...this, uniforms: clonedUniforms });
        }
    }
    class Object3D {
        constructor(geometry, material) {
            this.geometry = geometry;
            this.material = material;
            this.position = new Vector3();
            this.rotation = new Euler();
            this.quaternion = new Quaternion();
            const scaleVec = new Vector3(1, 1, 1);
            scaleVec.setScalar = (s) => scaleVec.set(s, s, s);
            this.scale = scaleVec;
            this.visible = true;
            this.children = [];
            this.layers = { mask: 0, set() {} };
            this.parent = null;
        }
        add(c) { c.parent = this; this.children.push(c); }
        remove(c) { c.parent = null; }
        traverse(fn) { fn(this); this.children.forEach(c => c.traverse(fn)); }
    }
    class Layers {
        constructor() { this.mask = 0; }
        set(layer) { this.mask = 1 << layer; }
    }
    class PointLight extends Object3D {
        constructor(col, intensity, distance) {
            super();
            this.color = new Color(col);
            this.intensity = intensity;
            this.distance = distance;
        }
    }
    class CanvasTexture {
        constructor() { this.wrapS = 0; this.wrapT = 0; }
    }

    return {
        RepeatWrapping: 1000,
        NearestFilter: 1003,
        DoubleSide: 2,
        AdditiveBlending: 2,
        NormalBlending: 1,
        sRGBEncoding: 3001,
        MathUtils: {
            clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
            lerp: (a, b, t) => a + (b - a) * t,
            degToRad: (d) => d * Math.PI / 180
        },
        Color,
        Vector2,
        Vector3,
        Vector4,
        Quaternion,
        Euler,
        BufferAttribute: class { constructor(arr, itemSize) { this.array = arr; this.itemSize = itemSize; } },
        Float32BufferAttribute: class { constructor(arr, itemSize) { this.array = arr; this.itemSize = itemSize; } },
        BufferGeometry,
        PlaneGeometry: class extends BufferGeometry {},
        RingGeometry: class extends BufferGeometry {},
        DodecahedronGeometry: class extends BufferGeometry {},
        BoxGeometry: class extends BufferGeometry {},
        CylinderGeometry: class extends BufferGeometry {},
        ConeGeometry: class extends BufferGeometry {},
        MeshBasicMaterial: class extends BaseMaterial {},
        MeshLambertMaterial: class extends BaseMaterial {},
        ShaderMaterial,
        Group: Object3D,
        Mesh: Object3D,
        Scene: class extends Object3D { constructor() { super(); this.fog = null; } },
        PointLight,
        CanvasTexture,
        Raycaster: class {},
        Layers
    };
}

function createFakeCanvasContext() {
    const imgData = { data: new Uint8ClampedArray(256 * 256 * 4) };
    return {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        fillRect() {},
        clearRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        arc() {},
        closePath() {},
        fill() {},
        stroke() {},
        putImageData() {},
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        createRadialGradient: () => ({ addColorStop() {} }),
        getImageData: () => imgData
    };
}

function createShadersAndPhysicsContext(terrainHeight = 0.0) {
    const THREE = createThreeMock();
    const document = {
        getElementById: () => null,
        createElement: () => ({ width: 256, height: 256, getContext: () => createFakeCanvasContext() })
    };
    const scene = new THREE.Scene();
    const context = {
        THREE,
        document,
        Math,
        Number,
        Map,
        Set,
        Float32Array,
        Uint8Array,
        Uint8ClampedArray,
        console,
        SEA_LEVEL: -2.5,
        SSAO_FX_LAYER: 1,
        excludeFromSSAO: () => {},
        getTerrainHeight: () => terrainHeight,
        soundFX: { playImpactExplosion() {} }
    };
    context.window = context;
    context.scene = scene;
    vm.createContext(context);

    // Run only the volumetric smoke/fire/shockwave section + canvas helpers from shaders.js for fast, isolated material verification
    vm.runInContext(readScript('shaders.js'), context);
    vm.runInContext(readScript('physics.js'), context);
    return context;
}

test('shaders.js defines loopless volumetric fireball and Mach shockwave shaders', () => {
    const shadersSrc = readScript('shaders.js');

    const fbStart = shadersSrc.indexOf('function createVolumetricFireballMaterial(');
    const fbEnd = shadersSrc.indexOf('function createShockwaveMaterial(', fbStart);
    const swEnd = shadersSrc.indexOf('return mat;\n}', fbEnd);
    assert.ok(fbStart !== -1 && fbEnd > fbStart && swEnd > fbEnd, 'Fireball and shockwave material generators must exist');

    const fbSrc = shadersSrc.slice(fbStart, fbEnd);
    const swSrc = shadersSrc.slice(fbEnd, swEnd + 15);

    // Zero loops in GLSL for fast D3D11/ANGLE shader compilation
    assert.ok(!fbSrc.includes('for (') && !fbSrc.includes('while ('), 'Fireball shader must be loopless');
    assert.ok(!swSrc.includes('for (') && !swSrc.includes('while ('), 'Shockwave shader must be loopless');

    // Blackbody temperature gradient and Mach wave features
    assert.ok(fbSrc.includes('whiteHot') && fbSrc.includes('solarGold') && fbSrc.includes('orangeFire') && fbSrc.includes('sootRim'),
        'Fireball shader must implement multi-stop blackbody temperature ramp');
    assert.ok(fbSrc.includes('THREE.AdditiveBlending'), 'Fireball shader must use AdditiveBlending');
    assert.ok(swSrc.includes('machFront') && swSrc.includes('innerWave') && swSrc.includes('bounds'),
        'Shockwave shader must render soft-feathered dual-front Mach wave');

    assert.ok(shadersSrc.includes('window.createVolumetricFireballMaterial = createVolumetricFireballMaterial;'));
    assert.ok(shadersSrc.includes('window.createShockwaveMaterial = createShockwaveMaterial;'));
});

test('physics.js pools, prewarms, and updates upgraded fireball, smoke, shockwave, and spark systems cleanly', () => {
    const physicsSrc = readScript('physics.js');
    assert.ok(physicsSrc.includes('DYNAMIC_FLASH_POOL_SIZE = 2'), 'Must preserve fixed 2-light pool to avoid material recompiles');
    assert.ok(physicsSrc.includes('MAX_SCENE_PARTICLES = 360'), 'Must preserve MAX_SCENE_PARTICLES budget');
    assert.ok(physicsSrc.includes('window.createVolumetricFireballMaterial'), 'physics.js must wire volumetric fireball shader');
    assert.ok(physicsSrc.includes('window.createShockwaveMaterial'), 'physics.js must wire procedural shockwave shader');

    const ctx = createShadersAndPhysicsContext(0.0);

    // Test material wrappers (opacity, color, clone preserving celestialLighting.time)
    const fireMat = ctx.createVolumetricFireballMaterial(0xf59e0b);
    fireMat.opacity = 0.72;
    assert.equal(fireMat.uniforms.opacity.value, 0.72);
    fireMat.color = 0xfffbeb;
    assert.equal(fireMat.uniforms.diffuse.value.hex, 0xfffbeb);
    const clonedFire = fireMat.clone();
    assert.equal(clonedFire.uniforms.uTime, ctx.celestialLighting.time, 'Cloned fireball material must keep shared uTime');

    const swMat = ctx.createShockwaveMaterial(0xfde68a);
    swMat.opacity = 0.65;
    assert.equal(swMat.uniforms.opacity.value, 0.65);

    // Prewarm pools and shader pipeline
    ctx.prewarmParticlePools();
    let compiled = 0;
    const mockRenderer = { compile() { compiled++; } };
    const mockCamera = { layers: new ctx.THREE.Layers() };
    ctx.prewarmParticleShaders(mockRenderer, mockCamera);
    assert.equal(compiled, 1, 'prewarmParticleShaders must compile particle shaders once');

    // Position player tank nearby to test shockwave suspension impulse
    ctx.window.tankState.hasTank = true;
    ctx.window.tankState.isKnockedOut = false;
    ctx.window.tankState.x = 12;
    ctx.window.tankState.z = 0;
    ctx.window.tankState.heaveVel = 0;

    // Trigger detonation on dry terrain
    const blastPos = new ctx.THREE.Vector3(0, 0.2, 0);
    ctx.triggerHeavyDetonation(blastPos, true, 10.0, 100);

    const activeTypes = {};
    for (let i = 0; i < ctx.particles.length; i++) {
        const p = ctx.particles[i];
        activeTypes[p.type] = (activeTypes[p.type] || 0) + 1;
    }

    assert.ok(activeTypes.fire >= 8, `Expected detonation core + fireball plume (>=8), got ${activeTypes.fire}`);
    assert.ok(activeTypes.smoke >= 6, `Expected rising mushroom smoke column (>=6), got ${activeTypes.smoke}`);
    assert.ok(activeTypes.dust >= 8, `Expected ground dust crater plume (>=8), got ${activeTypes.dust}`);
    assert.ok(activeTypes.spark >= 16, `Expected shrapnel sparks (>=16), got ${activeTypes.spark}`);
    assert.ok(activeTypes.dirt >= 7, `Expected dirt clods (>=7), got ${activeTypes.dirt}`);
    assert.equal(ctx.shockwaves.length, 2, 'Detonation must spawn dual supersonic/combustion shockwave rings');
    assert.ok(ctx.shockwaves[0].mat.uniforms && ctx.shockwaves[0].mat.uniforms.uProgress !== undefined,
        'Shockwave must use procedural uProgress uniform');
    assert.ok(ctx.window.tankState.heaveVel > 0, 'Nearby detonation must apply subtle suspension impulse to nearby tank');

    // Advance particle lifecycle and check shader/stretch updates
    ctx.updateParticles(0.08);

    const sampleFire = ctx.particles.find(p => p.type === 'fire');
    assert.ok(sampleFire.mat.uniforms.uAgeProgress.value > 0, 'updateParticles must advance fireball uAgeProgress');
    const sampleSpark = ctx.particles.find(p => p.type === 'spark');
    assert.ok(sampleSpark.mesh.scale.z > sampleSpark.mesh.scale.x, 'High-velocity sparks must stretch along velocity vector');
    assert.ok(ctx.shockwaves[0].mat.uniforms.uProgress.value > 0, 'updateParticles must advance shockwave uProgress');
});

test('detonation in river or sea emits concentric water ripples and spray plumes', () => {
    // Terrain submerged at -4.2m below SEA_LEVEL (-2.5m)
    const ctx = createShadersAndPhysicsContext(-4.2);
    ctx.prewarmParticlePools();

    ctx.triggerHeavyDetonation(new ctx.THREE.Vector3(0, -2.4, 0), true, 16.5, 100);
    assert.equal(ctx.waterRipples.length, 2, 'Water detonation must emit two concentric water ripples');
    assert.ok(ctx.particles.some(p => p.type === 'dust' && p.mat && p.mat.uniforms && p.mat.uniforms.diffuse.value.hex === 0xe2f1f8),
        'Water detonation must emit bright water spray plume particles');
});
