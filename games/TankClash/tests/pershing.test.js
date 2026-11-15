const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
}

test('Pershing is registered in TANK_SPECS with exact specified stats', () => {
    const tankModelSrc = readScript('tankModel.js');
    const ctx = {
        window: {},
        document: {
            getElementById: () => null,
            querySelectorAll: () => []
        },
        THREE: {
            MathUtils: { degToRad: d => d * Math.PI / 180 }
        }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(tankModelSrc, ctx);

    const specs = ctx.TANK_SPECS;
    assert.ok(specs.pershing, 'pershing spec must exist in TANK_SPECS');
    assert.equal(specs.pershing.id, 'pershing');
    assert.equal(specs.pershing.nation, 'United States');
    assert.equal(specs.pershing.flag, '🇺🇸');

    // 1. Slightly faster than M4 Sherman
    assert.ok(
        specs.pershing.maxSpeed > specs.sherman.maxSpeed,
        `Pershing max speed (${specs.pershing.maxSpeed}) must be faster than Sherman (${specs.sherman.maxSpeed})`
    );
    assert.ok(
        specs.pershing.reverseSpeed > specs.sherman.reverseSpeed,
        `Pershing reverse speed (${specs.pershing.reverseSpeed}) must be faster than Sherman (${specs.sherman.reverseSpeed})`
    );

    // 2. Cannon same as Tiger I
    assert.equal(
        specs.pershing.cannonDamage,
        specs.tiger.cannonDamage,
        'Pershing cannon damage must match Tiger I (2 HP)'
    );
    assert.equal(
        specs.pershing.shellVel,
        specs.tiger.shellVel,
        'Pershing shell velocity must match Tiger I (810 m/s)'
    );
    assert.equal(
        specs.pershing.blastRadius,
        specs.tiger.blastRadius,
        'Pershing blast radius must match Tiger I (8.0m)'
    );
    assert.equal(
        specs.pershing.blastDamage,
        specs.tiger.blastDamage,
        'Pershing blast damage must match Tiger I (100)'
    );
    assert.equal(
        specs.pershing.spread,
        specs.tiger.spread,
        'Pershing precision/spread must match Tiger I'
    );

    // 3. Reload speed same as M4 Sherman
    assert.equal(
        specs.pershing.reloadTime,
        specs.sherman.reloadTime,
        'Pershing reload speed must match M4 Sherman (2.7s)'
    );

    // 4. 2 HP in the enemy side
    assert.equal(specs.pershing.enemyArmor, 2, 'Pershing enemy armor must be 2 HP');
    assert.equal(specs.pershing.playerArmor, 4, 'Pershing player armor must be 4 HP (2x multiplier)');
});

test('Faction detection assigns Pershing to American campaign across systems', () => {
    // 1. Check playerSoldier.js getPlayerFaction
    const playerSoldierSrc = readScript('playerSoldier.js');
    const startPs = playerSoldierSrc.indexOf('function getPlayerFaction()');
    const endPs = playerSoldierSrc.indexOf('function initPlayerSoldierUI()', startPs);
    assert.ok(startPs >= 0 && endPs > startPs);

    const ctxPs = { currentTankId: 'pershing' };
    ctxPs.window = ctxPs;
    vm.createContext(ctxPs);
    vm.runInContext(playerSoldierSrc.slice(startPs, endPs), ctxPs);
    assert.equal(ctxPs.getPlayerFaction(), 'us', 'Pershing player soldier faction must be "us"');

    // 2. Check soldiers.js getFactionsForPlayerTank
    const soldiersSrc = readScript('soldiers.js');
    const startS = soldiersSrc.indexOf('function getFactionsForPlayerTank(');
    const endS = soldiersSrc.indexOf('function clearSoldiers()', startS);
    assert.ok(startS >= 0 && endS > startS);

    const ctxS = {};
    vm.createContext(ctxS);
    vm.runInContext(soldiersSrc.slice(startS, endS), ctxS);
    const factions = ctxS.getFactionsForPlayerTank('pershing');
    assert.equal(factions.allied, 'us', 'Pershing allied infantry must be US');
    assert.equal(factions.enemy, 'german', 'Pershing enemy infantry must be German');

    // 3. Check enemyAI.js campaign list
    const enemyAISrc = readScript('enemyAI.js');
    assert.ok(enemyAISrc.includes("'pershing'"), 'enemyAI.js must include pershing in ALL_CAMPAIGNS');
    assert.ok(enemyAISrc.includes("tankType === 'pershing'"), 'enemyAI.js must handle pershing tank spawn');

    // 4. Check main.js and environment.js
    const mainSrc = readScript('main.js');
    assert.ok(mainSrc.includes("'pershing'"), 'main.js must include pershing in ALL_CAMPAIGNS');

    const envSrc = readScript('environment.js');
    assert.ok(envSrc.includes("'pershing'"), 'environment.js must include pershing in ALL_CAMPAIGNS');
});

test('controls.js does not bind number keys 1-6 to switch tank and pershing is priced at 1200', () => {
    const controlsSrc = readScript('controls.js');
    assert.ok(!controlsSrc.includes("k === '6'"), 'controls.js must not check Key 6 for tank switching');
    assert.ok(!controlsSrc.includes("k === '1'"), 'controls.js must not check Key 1 for tank switching');

    const tankModelSrc = readScript('tankModel.js');
    assert.ok(tankModelSrc.includes("pershing: 1200"), 'tankModel.js must price Pershing at 1200');
});

test('buildPershingTank constructs complete model with PBR materials, instanced tracks and headlights', () => {
    // Mock minimal Three.js environment in Node
    const mockThree = {
        Group: class {
            constructor() {
                this.children = [];
                this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
                this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
            }
            add(child) { this.children.push(child); }
            traverse(cb) {
                cb(this);
                this.children.forEach(c => c.traverse && c.traverse(cb));
            }
        },
        Object3D: class {
            constructor() {
                this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
                this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
                this.matrix = {};
            }
            updateMatrix() {}
        },
        Mesh: class {
            constructor(geo, mat) {
                this.geometry = geo;
                this.material = mat;
                this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
                this.rotation = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
                this.scale = { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
                this.userData = {};
            }
            traverse(cb) { cb(this); }
        },
        InstancedMesh: class {
            constructor(geo, mat, count) {
                this.geometry = geo;
                this.material = mat;
                this.count = count;
                this.isInstancedMesh = true;
                this.instanceMatrix = { needsUpdate: false, setUsage: () => {} };
            }
            setMatrixAt() {}
            traverse(cb) { cb(this); }
        },
        Shape: class {
            constructor() { this.pts = []; }
            moveTo(x, y) { this.pts.push({ x, y }); }
            lineTo(x, y) { this.pts.push({ x, y }); }
            closePath() {}
        },
        ExtrudeGeometry: class {
            constructor(shape, opts) { this.shape = shape; this.opts = opts; }
            translate() {}
            rotateY() {}
            computeVertexNormals() {}
        },
        SphereGeometry: class {
            constructor() {}
            scale() {}
        },
        BoxGeometry: class { constructor() {} translate() {} },
        CylinderGeometry: class {
            constructor() {}
            rotateX() {}
            rotateZ() {}
            rotateY() {}
            scale() {}
        },
        TorusGeometry: class {
            constructor() {}
            rotateX() {}
            rotateY() {}
            rotateZ() {}
        },
        CircleGeometry: class { constructor() {} },
        PlaneGeometry: class { constructor() {} },
        MeshStandardMaterial: class {
            constructor(opts = {}) { Object.assign(this, opts); this.userData = {}; }
        },
        MeshBasicMaterial: class {
            constructor(opts = {}) { Object.assign(this, opts); this.userData = {}; }
        },
        CanvasTexture: class {
            constructor() { this.repeat = { set: () => {} }; }
        },
        SpotLight: class {
            constructor() {
                this.position = { set: () => {} };
                this.target = { position: { set: () => {} } };
            }
        },
        Vector2: class { constructor(x, y) { this.x = x; this.y = y; } },
        Vector3: class { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } },
        MathUtils: {
            clamp: (v, min, max) => Math.max(min, Math.min(max, v))
        },
        RepeatWrapping: 1000,
        DynamicDrawUsage: 35048
    };

    const mockDoc = {
        createElement: (tag) => {
            if (tag === 'canvas') {
                return {
                    width: 512,
                    height: 512,
                    getContext: () => ({
                        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
                        putImageData: () => {},
                        fillRect: () => {},
                        beginPath: () => {},
                        arc: () => {},
                        fill: () => {},
                        createRadialGradient: () => ({ addColorStop: () => {} }),
                        createLinearGradient: () => ({ addColorStop: () => {} }),
                        save: () => {},
                        restore: () => {},
                        translate: () => {},
                        moveTo: () => {},
                        lineTo: () => {},
                        closePath: () => {},
                        strokeRect: () => {},
                        clearRect: () => {},
                        fillText: () => {},
                        drawImage: () => {}
                    })
                };
            }
            return {};
        }
    };

    const pershingSrc = readScript('tankPershing.js');
    const ctx = {
        THREE: mockThree,
        document: mockDoc,
        window: {}
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(pershingSrc, ctx);

    assert.equal(typeof ctx.buildPershingTank, 'function', 'buildPershingTank must be exported');
    assert.equal(typeof ctx.getPershingSharedAssets, 'function', 'getPershingSharedAssets must be exported');

    // Build model
    const mockScene = new mockThree.Group();
    const model = ctx.buildPershingTank(mockScene, null, { isEnemy: false });

    assert.ok(model.tankRoot, 'model.tankRoot must exist');
    assert.ok(model.hullGroup, 'model.hullGroup must exist');
    assert.ok(model.turretGroup, 'model.turretGroup must exist');
    assert.ok(model.gunElevationPivot, 'model.gunElevationPivot must exist');
    assert.ok(model.barrelRecoilGroup, 'model.barrelRecoilGroup must exist');
    assert.ok(model.mainGunMuzzleTip, 'model.mainGunMuzzleTip must exist');
    assert.ok(model.coaxMuzzleRef, 'model.coaxMuzzleRef must exist');
    assert.ok(model.bowMgGroup, 'model.bowMgGroup must exist');
    assert.ok(model.bowMgBarrel, 'model.bowMgBarrel must exist');

    // Suspension and tracks
    assert.equal(model.roadWheelStations.left.length, 6, 'Left track must have 6 road wheel stations');
    assert.equal(model.roadWheelStations.right.length, 6, 'Right track must have 6 road wheel stations');
    assert.equal(model.idlerWheels.length, 2, 'Must have 2 idler wheels');
    assert.equal(model.driveSprockets.length, 2, 'Must have 2 drive sprockets');
    assert.ok(model.trackChains.left, 'Must have left track chain');
    assert.ok(model.trackChains.right, 'Must have right track chain');
    assert.equal(typeof model.evaluateTrackPoint, 'function', 'evaluateTrackPoint must be a function');
    assert.equal(typeof model.updateTracksGeometry, 'function', 'updateTracksGeometry must be a function');

    // Headlights
    assert.equal(model.headlightLights.length, 2, 'Player tank must have 2 working headlights registered with SpotLight');
    assert.ok(model.headlightLights[0].spot, 'Player headlight must have SpotLight');
    assert.ok(model.headlightLights[0].slitMat, 'Player headlight must have slitMat');

    // Enemy model: Must NOT register SpotLights to keep scene light count constant and avoid WebGL shader recompilations!
    const enemyModel = ctx.buildPershingTank(mockScene, null, { isEnemy: true });
    assert.equal(enemyModel.headlightLights.length, 0, 'Enemy Pershing must NOT create SpotLights (prevents WebGL shader recompile lag)');

    // Shared geometry reuse: Both player and enemy must share cached geometries
    assert.ok(pershingSrc.includes('getPershingGeometries'), 'tankPershing must use getPershingGeometries to eliminate allocation lag');
    assert.ok(pershingSrc.includes('rotateY(-Math.PI / 2)'), 'Hull extrusion must be rotated by -Math.PI / 2 to face sloped glacis along +Z');
    assert.ok(pershingSrc.includes('0x5a6048'), 'Pershing materials must use Tamiya 35254 Olive Drab color palette (0x5a6048)');
});
