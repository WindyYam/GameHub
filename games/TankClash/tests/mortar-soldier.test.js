const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const physics = fs.readFileSync(path.join(__dirname, '..', 'js', 'physics.js'), 'utf8');
const start = physics.indexOf('function spawnPlayerMortarShell(');
const end = physics.indexOf('\nwindow.spawnPlayerMortarShell = spawnPlayerMortarShell;', start);
assert.ok(start >= 0 && end > start, 'mortar shell spawner must exist');

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
    subVectors(a, b) { return this.set(a.x - b.x, a.y - b.y, a.z - b.z); }
    length() { return Math.hypot(this.x, this.y, this.z); }
    multiplyScalar(value) { return this.set(this.x * value, this.y * value, this.z * value); }
    addScaledVector(v, scale) { return this.set(this.x + v.x * scale, this.y + v.y * scale, this.z + v.z * scale); }
    normalize() { const length = Math.hypot(this.x, this.y, this.z); return length ? this.multiplyScalar(1 / length) : this; }
}

test('mortar shells use a low-velocity trajectory with a 150 m range at 45 degrees', () => {
    const shell = { position: new Vector3(), quaternion: { setFromUnitVectors() {} } };
    const whistleCalls = [];
    const soundHandle = { setPosition() {}, stop() {} };
    const context = {
        THREE: { Vector3 },
        window: {
            scene: { add(object) { object.parent = this; } },
            soundFX: { playBombWhistle(duration, position) { whistleCalls.push({ duration, position }); return soundHandle; } }
        },
        shellPool: [],
        shells: [],
        getTerrainHeight: () => 0,
        createShellObject: () => shell
    };
    vm.createContext(context);
    vm.runInContext(physics.slice(start, end), context);

    const direction = new Vector3(0, Math.SQRT1_2, Math.SQRT1_2);
    const owner = {};
    const muzzlePosition = new Vector3(0, 1, 0);
    context.spawnPlayerMortarShell(muzzlePosition, direction, owner);

    const projectile = context.shells[0];
    assert.equal(projectile.isMortar, true);
    assert.equal(projectile.sourceSoldier, owner);
    assert.equal(projectile.soundHandle, soundHandle);
    assert.equal(projectile.blastRadius, 16.5, 'mortar explosion radius must match T-34-85 cannon fire radius (16.5m)');
    const launchHeight = 1;
    const flightTime = (projectile.vel.y + Math.sqrt(projectile.vel.y ** 2 + 2 * 9.81 * launchHeight)) / 9.81;
    const impactRange = Math.hypot(projectile.vel.x, projectile.vel.z) * flightTime;
    assert.ok(Math.abs(impactRange - 150) < 1e-8);
    assert.ok(projectile.life > flightTime);
    assert.equal(whistleCalls[0].position, muzzlePosition);
    assert.ok(Math.abs(whistleCalls[0].duration - flightTime) < 1e-12);

    const lowAngleDirection = new Vector3(0, 0.5, Math.sqrt(0.75));
    context.spawnPlayerMortarShell(new Vector3(0, 1, 0), lowAngleDirection, owner);
    const lowAngleProjectile = context.shells[1];
    const lowAngleFlightTime = (lowAngleProjectile.vel.y + Math.sqrt(lowAngleProjectile.vel.y ** 2 + 2 * 9.81)) / 9.81;
    assert.ok(Math.hypot(lowAngleProjectile.vel.x, lowAngleProjectile.vel.z) * lowAngleFlightTime < 150);
});

test('mortar cannot be deployed or fired while riding a bicycle', () => {
    const playerSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'playerSoldier.js'), 'utf8');
    const deployStart = playerSource.indexOf('    function deployPlayerMortar(s) {');
    const deployEnd = playerSource.indexOf('\n    function applyMortarElevationPose(', deployStart);
    const fireStart = playerSource.indexOf('    function firePlayerRifle() {');
    const fireEnd = playerSource.indexOf('\n    function ', fireStart + 10);
    assert.ok(playerSource.slice(deployStart, deployEnd).includes('if (s.isMountedBicycle)'), 'mortar deployment must be blocked while mounted');
    assert.ok(playerSource.slice(fireStart, fireEnd).includes('if (s.isMountedBicycle)'), 'mortar firing must be blocked while mounted');
});

test('bomb whistle uses a positional source that follows grenade and mortar flight', () => {
    const audioSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'audio.js'), 'utf8').replace(/\r\n/g, '\n');
    const methodStart = audioSource.indexOf('    updateListenerPosition() {');
    const methodEnd = audioSource.indexOf('\n};\n\nwindow.soundFX', methodStart);
    assert.ok(methodStart >= 0 && methodEnd > methodStart, 'bomb whistle method must exist');

    const positionCalls = [];
    const oscillatorStops = [];
    const makeParam = axis => ({
        value: 0.1,
        setTargetAtTime(value) { positionCalls.push([axis, value]); },
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
        cancelScheduledValues() {}
    });
    const panner = {
        positionX: makeParam('x'),
        positionY: makeParam('y'),
        positionZ: makeParam('z'),
        connect() {}
    };
    const listenerPositionCalls = [];
    const makeListenerParam = axis => ({
        setTargetAtTime(value) { listenerPositionCalls.push([axis, value]); }
    });
    const makeOscillator = () => ({
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop(time) { oscillatorStops.push(time); }
    });
    const ctx = {
        currentTime: 3,
        listener: {
            positionX: makeListenerParam('listener-x'),
            positionY: makeListenerParam('listener-y'),
            positionZ: makeListenerParam('listener-z')
        },
        destination: {},
        createPanner: () => panner,
        createOscillator: makeOscillator,
        createGain: () => ({ gain: makeParam('gain'), connect() {} })
    };
    const methodSource = audioSource.slice(methodStart, methodEnd);
    const soundMethods = vm.runInNewContext(`({${methodSource}})`, {
        Math,
        window: { playerMode: 'soldier', playerSoldier: { x: 10, y: 2, z: 30 } }
    });
    const soundFX = { enabled: true, ctx, init() {}, ...soundMethods };
    soundFX.updateListenerPosition();
    assert.deepEqual(listenerPositionCalls, [['listener-x', 10], ['listener-y', 3.5], ['listener-z', 30]]);

    const sourcePosition = new Vector3(1, 2, 3);
    const handle = soundFX.playBombWhistle(5.5, sourcePosition);

    assert.deepEqual(listenerPositionCalls.slice(3), [['listener-x', 10], ['listener-y', 3.5], ['listener-z', 30]]);
    assert.equal(panner.distanceModel, 'inverse');
    assert.deepEqual(positionCalls.slice(0, 3), [['x', 1], ['y', 2], ['z', 3]]);
    handle.setPosition(new Vector3(4, 5, 6));
    assert.deepEqual(positionCalls.slice(3), [['x', 4], ['y', 5], ['z', 6]]);
    assert.ok(Math.abs(oscillatorStops[0] - 8.55) < 1e-12);
    handle.stop();

    const playerSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'playerSoldier.js'), 'utf8');
    const grenadeStart = playerSource.indexOf('    function throwPlayerGrenade()');
    const grenadeEnd = playerSource.indexOf('    function detonateGrenade(', grenadeStart);
    const grenadeUpdateStart = playerSource.indexOf('    function updateGrenades(', grenadeEnd);
    const grenadeUpdateEnd = playerSource.indexOf('    window.updateGrenades = updateGrenades;', grenadeUpdateStart);
    assert.ok(playerSource.slice(grenadeStart, grenadeEnd).includes('playBombWhistle(1.6, grenade.pos)'));
    assert.ok(playerSource.slice(grenadeUpdateStart, grenadeUpdateEnd).includes('g.soundHandle.setPosition(g.pos)'));

    const physicsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'physics.js'), 'utf8');
    assert.ok(physicsSource.includes('playBombWhistle(flightTime, muzzlePos)'));
    assert.ok(physicsSource.includes('s.soundHandle.setPosition(s.pos)'));
    assert.ok(physicsSource.includes('s.soundHandle.stop()'));
});

test('mortar tripod legs articulate with elevation changes', () => {
    const playerSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'playerSoldier.js'), 'utf8');
    const start = playerSource.indexOf('    function applyMortarElevationPose(');
    const end = playerSource.indexOf('\n    function adjustMortarElevation(', start);
    assert.ok(start >= 0 && end > start, 'mortar leg articulation must exist');

    const sideLegs = [-1, 1].map(side => ({ mesh: { rotation: { z: 0 }, position: { x: side * 0.18, y: 0.24, z: -0.08 } }, side }));
    const thirdLeg = { rotation: { x: 0 }, position: { x: 0, y: 0.24, z: 0.18 } };
    const makeStrut = () => ({
        position: { copy() { return this; }, add() { return this; }, multiplyScalar() { return this; } },
        quaternion: { setFromUnitVectors() {} },
        scale: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } }
    });
    const supportStruts = [makeStrut(), makeStrut(), makeStrut()];
    const emplacement = { userData: { barrelPivot: { rotation: { x: 0 } }, sideLegs, thirdLeg, supportStruts } };
    const context = { Math, Number, THREE: { Vector3 } };
    vm.createContext(context);
    vm.runInContext(playerSource.slice(start, end), context);

    context.applyMortarElevationPose(emplacement, Math.PI / 4);
    const neutralSideSplay = sideLegs[0].mesh.rotation.z;
    const neutralForwardTilt = thirdLeg.rotation.x;
    const neutralStrutLengths = supportStruts.map(strut => strut.scale.y);
    context.applyMortarElevationPose(emplacement, Math.PI * 5 / 12);

    assert.ok(sideLegs[0].mesh.rotation.z < neutralSideSplay);
    assert.ok(sideLegs[1].mesh.rotation.z > -neutralSideSplay);
    assert.ok(thirdLeg.rotation.x < neutralForwardTilt);
    assert.ok(supportStruts.every((strut, index) => strut.scale.y > 0 && strut.scale.y !== neutralStrutLengths[index]));
    assert.equal(emplacement.userData.barrelPivot.rotation.x, -Math.PI * 5 / 12);
});

test('carried mortar reuses the emplacement model with folded legs and a wrap', () => {
    const playerSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'playerSoldier.js'), 'utf8');
    const start = playerSource.indexOf('    function createCarriedMortar(');
    const end = playerSource.indexOf('\n    function createMortarEmplacement(', start);
    assert.ok(start >= 0 && end > start, 'carried mortar builder must exist');

    const carried = {
        rotation: { x: 0 },
        position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
        children: [],
        userData: {
            barrelPivot: { rotation: { x: -Math.PI / 4 } },
            baseRing: { position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: { x: Math.PI / 2 } },
            basePlate: { position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: { x: 0 } },
            baseBolts: Array.from({ length: 6 }, () => ({ position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, rotation: { x: 0 } })),
            sideLegs: [-1, 1].map(side => ({ mesh: {
                position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
                rotation: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } }
            }, side })),
            thirdLeg: {
                position: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
                rotation: { set(x, y, z) { this.x = x; this.y = y; this.z = z; } }
            },
            supportStruts: [{ visible: true }, { visible: true }, { visible: true }]
        },
        add(child) { this.children.push(child); }
    };
    const root = { add(child) { this.child = child; } };
    const torso = { add(child) { this.child = child; } };
    const context = {
        Math,
        createMortarEmplacement: () => carried,
        document: { createElement: () => ({
            width: 0,
            height: 0,
            getContext: () => ({
                fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}
            })
        }) },
        THREE: {
            CylinderGeometry: class { constructor(...args) { this.args = args; } },
            MeshStandardMaterial: class { constructor(options) { this.options = options; } },
            CanvasTexture: class { constructor(canvas) { this.image = canvas; } },
            Mesh: class { constructor(geometry, material) { this.geometry = geometry; this.material = material; this.rotation = { x: 0 }; this.position = { set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; } }
        }
    };
    vm.createContext(context);
    vm.runInContext(playerSource.slice(start, end), context);
    context.createCarriedMortar({ root, torso });

    assert.equal(torso.child, carried);
    assert.equal(root.child, undefined);
    assert.equal(carried.name, 'CarriedMortarPack');
    assert.equal(carried.rotation.x, -Math.PI / 2);
    assert.deepEqual([carried.position.x, carried.position.y, carried.position.z], [0, -0.13, 0.34]);
    assert.equal(carried.userData.barrelPivot.rotation.x, 0);
    assert.deepEqual([carried.userData.baseRing.position.x, carried.userData.baseRing.position.y, carried.userData.baseRing.position.z], [0, 0.49, 0.02]);
    assert.ok(carried.userData.supportStruts.every(strut => !strut.visible));
    assert.equal(carried.children.length, 3);
    assert.ok(carried.children[0].material.options.map instanceof context.THREE.CanvasTexture);
    assert.equal(carried.children[0].geometry.args[0], 0.105);
    assert.ok(carried.children.slice(1).every(item => item.geometry.args[0] === 0.11));
});

test('first mortar fire press deploys and the next launches a 45 degree shell', () => {
    const playerSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'playerSoldier.js'), 'utf8');
    const fireStart = playerSource.indexOf('    function firePlayerRifle()');
    const fireEnd = playerSource.indexOf('    // ------------------------------------------------------------------------\n    // 5. UPDATE PLAYER SOLDIER', fireStart);
    assert.ok(fireStart >= 0 && fireEnd > fireStart, 'player weapon handler must exist');

    const launches = [];
    let deployCount = 0;
    const expectedMuzzle = new Vector3(1, 2, 3);
    const expectedDirection = new Vector3(0, Math.SQRT1_2, Math.SQRT1_2);
    const emplacement = {
        updateMatrixWorld() {},
        userData: {
            muzzle: { getWorldPosition(target) { return target.copy(expectedMuzzle); } },
            barrelPivot: { getWorldDirection(target) { return target.copy(expectedDirection); } }
        }
    };
    const soldier = { isDead: false, soldierType: 'mortar', mortarDeployed: false, mortarElevation: Math.PI / 4, fireCooldown: 0, x: 0, y: 0, z: 0, heading: 0, rig: {} };
    const context = {
        THREE: { Vector3 },
        playerMode: 'soldier',
        playerSoldier: soldier,
        window: {
            performance: { now: () => 1000 },
            getTerrainHeight: () => 0,
            spawnPlayerMortarShell: (position, direction, owner) => launches.push({ position, direction, owner })
        },
        deployPlayerMortar: (target) => { target.mortarDeployed = true; target.rig.deployedMortar = emplacement; deployCount++; }
    };
    vm.createContext(context);
    vm.runInContext(playerSource.slice(fireStart, fireEnd), context);

    context.firePlayerRifle();
    assert.equal(deployCount, 1);
    assert.equal(launches.length, 0);

    context.firePlayerRifle();
    assert.equal(launches.length, 1);
    assert.equal(launches[0].owner, soldier);
    assert.deepEqual([launches[0].position.x, launches[0].position.y, launches[0].position.z], [1, 2, 3]);
    assert.ok(Math.abs(launches[0].direction.x) < 1e-12);
    assert.ok(Math.abs(launches[0].direction.y - Math.SQRT1_2) < 1e-12);
    assert.ok(Math.abs(launches[0].direction.z - Math.SQRT1_2) < 1e-12);
    assert.ok(Math.abs(Math.atan2(launches[0].direction.y, Math.hypot(launches[0].direction.x, launches[0].direction.z)) - Math.PI / 4) < 1e-10);
});

test('forward and backward input adjusts mortar elevation within its aiming limits', () => {
    const playerSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'playerSoldier.js'), 'utf8');
    const start = playerSource.indexOf('    function adjustMortarElevation(');
    const end = playerSource.indexOf('\n    function initPlayerSoldierUI', start);
    assert.ok(start >= 0 && end > start, 'mortar elevation controller must exist');

    const context = { THREE: { MathUtils: { clamp: (value, min, max) => Math.max(min, Math.min(max, value)) } } };
    vm.createContext(context);
    vm.runInContext(playerSource.slice(start, end), context);
    const soldier = { mortarDeployed: true, mortarElevation: Math.PI / 4 };

    context.adjustMortarElevation(soldier, 1, 0.5);
    assert.ok(soldier.mortarElevation > Math.PI / 4);
    context.adjustMortarElevation(soldier, -1, 0.5);
    assert.ok(Math.abs(soldier.mortarElevation - Math.PI / 4) < 1e-10);
    context.adjustMortarElevation(soldier, -1, 10);
    assert.equal(soldier.mortarElevation, Math.PI / 36);
});
test('mortar explosion radius dynamically matches T-34-85 blast radius from tankModel specs', () => {
    const tankModelSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'tankModel.js'), 'utf8');
    const tankSpecsMatch = tankModelSource.match(/t34:\s*\{[\s\S]*?blastRadius:\s*([0-9.]+)/);
    assert.ok(tankSpecsMatch, 'T-34 blastRadius must be defined in tankModel.js');
    const t34BlastRadius = parseFloat(tankSpecsMatch[1]);
    assert.equal(t34BlastRadius, 16.5, 'T-34 85 blast radius should be 16.5m');

    const shell = { position: new Vector3(), quaternion: { setFromUnitVectors() {} } };
    const context = {
        THREE: { Vector3 },
        window: {
            scene: { add(object) { object.parent = this; } },
            soundFX: { playBombWhistle() { return { setPosition() {}, stop() {} }; } },
            TANK_SPECS: { t34: { blastRadius: t34BlastRadius } }
        },
        shellPool: [],
        shells: [],
        getTerrainHeight: () => 0,
        createShellObject: () => shell
    };
    vm.createContext(context);
    vm.runInContext(physics.slice(start, end), context);

    context.spawnPlayerMortarShell(new Vector3(0, 1, 0), new Vector3(0, 1, 0), {});
    assert.equal(context.shells[0].blastRadius, t34BlastRadius, 'mortar shell must adopt T-34 blast radius');
});

test('mortar launcher is placed at a fixed offset to the soldier matching soldier height instead of terrain surface', () => {
    const playerSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'playerSoldier.js'), 'utf8');
    const startPos = playerSource.indexOf('    function getMortarPosition(s) {');
    const endPos = playerSource.indexOf('\n    function packPlayerMortar()', startPos);
    assert.ok(startPos >= 0 && endPos > startPos, 'getMortarPosition must exist');

    const context = { window: {}, Math };
    vm.createContext(context);
    vm.runInContext(playerSource.slice(startPos, endPos), context);

    const elevatedSoldier = { x: 12, y: 18.5, z: -30, heading: 0.5 };
    const pos = context.getMortarPosition(elevatedSoldier);

    assert.equal(pos.y, 18.5, 'mortar launcher vertical position must match soldier height');
    const expectedX = 12 + Math.sin(0.5) * 0.15 - Math.cos(0.5) * 0.72;
    const expectedZ = -30 + Math.cos(0.5) * 0.15 + Math.sin(0.5) * 0.72;
    assert.ok(Math.abs(pos.x - expectedX) < 1e-10, 'mortar launcher X must maintain fixed horizontal offset');
    assert.ok(Math.abs(pos.z - expectedZ) < 1e-10, 'mortar launcher Z must maintain fixed horizontal offset');

    // Also verify deployPlayerMortar sets emplacement position to this fixed offset immediately
    const deployStart = playerSource.indexOf('    function deployPlayerMortar(s) {');
    const deployEnd = playerSource.indexOf('\n    function applyMortarElevationPose(', deployStart);
    assert.ok(deployStart >= 0 && deployEnd > deployStart, 'deployPlayerMortar must exist');

    const mockEmplacement = {
        position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
        rotation: { y: 0 }
    };
    const deployCtx = {
        getMortarPosition: context.getMortarPosition,
        createMortarEmplacement: () => mockEmplacement,
        applyMortarElevationPose: () => {},
        syncInfantryUI: () => {},
        window: {
            scene: { add() {} },
            getTerrainHeight: () => 0 // Terrain is at 0, while soldier is elevated at 18.5
        }
    };
    vm.createContext(deployCtx);
    vm.runInContext(playerSource.slice(deployStart, deployEnd), deployCtx);

    const deploySoldier = {
        x: 12,
        y: 18.5,
        z: -30,
        heading: 0.5,
        rig: { carriedMortar: {}, rifle: {} },
        isMountedBicycle: false,
        isSwimming: false,
        mortarDeployed: false
    };
    deployCtx.deployPlayerMortar(deploySoldier);
    assert.equal(deploySoldier.rig.deployedMortar.position.y, 18.5, 'deployed mortar must be at soldier height, not terrain surface (0)');
    assert.equal(deploySoldier.rig.deployedMortar.rotation.y, 0.5);

    // Verify update loop does not overwrite Y with getTerrainHeight
    const updateSrc = playerSource;
    assert.ok(!updateSrc.includes('window.getTerrainHeight(mortarX, mortarZ) : s.y'), 'playerSoldier.js must not overwrite mortar Y with terrain height');

    // Verify soldiers.js also anchors mortar launcher to this.y
    const soldiersSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'soldiers.js'), 'utf8');
    assert.ok(soldiersSrc.includes('const mY = (typeof this.y === \'number\') ? this.y'), 'soldiers.js must anchor enemy mortar launcher to soldier height');
});
