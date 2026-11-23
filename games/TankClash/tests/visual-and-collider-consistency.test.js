const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8').replace(/\r\n/g, '\n');
}

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
    sub(v) { return this.set(this.x - v.x, this.y - v.y, this.z - v.z); }
    addScaledVector(v, s) { return this.set(this.x + v.x * s, this.y + v.y * s, this.z + v.z * s); }
    multiplyScalar(s) { return this.set(this.x * s, this.y * s, this.z * s); }
}

const THREE_MATH = {
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    lerp: (a, b, t) => a + (b - a) * t
};

function loadPhysicsHitboxHelpers() {
    const src = readScript('physics.js');
    const start = src.indexOf('function isTransparentVillageHit(');
    const end = src.indexOf('\n// Spawns shell projectile', start);
    assert.ok(start >= 0 && end > start, 'hitbox helper block must exist in physics.js');
    const windowObj = {};
    const context = {
        THREE: { Vector3, MathUtils: THREE_MATH },
        window: windowObj,
        Math
    };
    vm.createContext(context);
    vm.runInContext(src.slice(start, end), context);
    return { ctx: context, win: windowObj };
}

function loadEnvironmentObstacleHelpers() {
    const src = readScript('environment.js');
    const start = src.indexOf('function getGeometryFootprint(');
    const end = src.indexOf('// ---------------------------------------------------------------------------\n// PROCEDURAL DISTANCE-STREAMED HOUSE INTERIORS', start);
    assert.ok(start >= 0 && end > start, 'obstacle helper block must exist in environment.js');
    const windowObj = { worldObstacles: [] };
    const context = {
        THREE: { Vector3, MathUtils: THREE_MATH },
        window: windowObj,
        worldObstacles: windowObj.worldObstacles,
        getTerrainHeight: () => 0,
        Math
    };
    vm.createContext(context);
    vm.runInContext(src.slice(start, end), context);
    return { ctx: context, win: windowObj };
}

test('testSegmentVsTank uses positive heading rotation sign across 0/45/90/135 deg', () => {
    const { ctx } = loadPhysicsHitboxHelpers();

    // 1. 45 degrees: tank nose points toward (+0.707, +0.707), right flank points toward (+0.707, -0.707).
    const h45 = Math.PI / 4;
    const noseHit45 = ctx.testSegmentVsTank(
        new Vector3(2.0, 1.0, 2.0),
        new Vector3(2.2, 1.0, 2.2),
        0, 0, 0, h45, 1.80, 1.40, 3.30
    );
    assert.ok(noseHit45 !== null, 'Segment inside 45-deg rotated nose (2.97m < 3.30m halfL) must hit');

    const flankMiss45 = ctx.testSegmentVsTank(
        new Vector3(-2.1, 1.0, 2.1),
        new Vector3(-2.0, 1.0, 2.0),
        0, 0, 0, h45, 1.80, 1.40, 3.30
    );
    assert.equal(flankMiss45, null, 'Segment 2.97m outside perpendicular flank (> 1.80m halfW) at 45 deg must miss');

    // 2. 135 degrees: tank nose points toward (+0.707, -0.707)
    const h135 = (3 * Math.PI) / 4;
    const noseHit135 = ctx.testSegmentVsTank(
        new Vector3(2.0, 1.0, -2.0),
        new Vector3(2.2, 1.0, -2.2),
        0, 0, 0, h135, 1.80, 1.40, 3.30
    );
    assert.ok(noseHit135 !== null, 'Segment inside 135-deg rotated nose must hit');

    const flankMiss135 = ctx.testSegmentVsTank(
        new Vector3(2.1, 1.0, 2.1),
        new Vector3(2.2, 1.0, 2.2),
        0, 0, 0, h135, 1.80, 1.40, 3.30
    );
    assert.equal(flankMiss135, null, 'Segment 2.97m off perpendicular flank at 135 deg must miss');
});

test('getTankHitboxDims models all 6 tanks and dual-box hull vs turret OBBs', () => {
    const { ctx } = loadPhysicsHitboxHelpers();

    const tiger = ctx.getTankHitboxDims('tiger');
    assert.equal(tiger.halfW, 1.80);
    assert.equal(tiger.halfH, 1.40);
    assert.equal(tiger.halfL, 3.30);

    const kt = ctx.getTankHitboxDims('kingtiger');
    const kv2 = ctx.getTankHitboxDims({ tankType: 'kv2' });
    const sherman = ctx.getTankHitboxDims('sherman');
    const pershing = ctx.getTankHitboxDims({ id: 'pershing' });
    const t34 = ctx.getTankHitboxDims('t34');

    assert.ok(kt.halfL > tiger.halfL, 'King Tiger should be longer than Tiger I');
    assert.ok(kv2.turretTop > 3.1, 'KV-2 tall turret box must extend above 3.1m');
    assert.ok(pershing.halfW < tiger.halfW && pershing.halfW > sherman.halfW);
    assert.ok(t34.turretZ > 0, 'T-34 turret sits forward on hull');

    // Dual-box precision: shot at y=2.5m over King Tiger rear engine deck (z=-2.8) must pass over hull and miss
    const overEngineDeck = ctx.testSegmentVsTank(
        new Vector3(-4, 2.5, -2.8),
        new Vector3(4, 2.5, -2.8),
        0, 0, 0, 0, kt.halfW, kt.halfH, kt.halfL, kt
    );
    assert.equal(overEngineDeck, null, 'High shot over rear engine deck must not hit invisible air');

    // Low shot at y=0.9m across rear engine deck hits hull
    const rearHullHit = ctx.testSegmentVsTank(
        new Vector3(-4, 0.9, -2.8),
        new Vector3(4, 0.9, -2.8),
        0, 0, 0, 0, kt.halfW, kt.halfH, kt.halfL, kt
    );
    assert.equal(rearHullHit && rearHullHit.hitZone, 'hull');

    // High shot at y=2.5m across turret (z=0) hits turret
    const turretHit = ctx.testSegmentVsTank(
        new Vector3(-4, 2.5, 0),
        new Vector3(4, 2.5, 0),
        0, 0, 0, 0, kt.halfW, kt.halfH, kt.halfL, kt
    );
    assert.equal(turretHit && turretHit.hitZone, 'turret');
});

test('testSegmentVsSoldier handles posture heights and detects headshots', () => {
    const { ctx } = loadPhysicsHitboxHelpers();

    const standing = { x: 0, y: 0, z: 0 };
    const headHit = ctx.testSegmentVsSoldier(new Vector3(0, 1.64, -3), new Vector3(0, 1.64, 3), standing);
    assert.ok(headHit && headHit.isHeadshot === true, 'Shot at head sphere y=1.64 must register headshot');

    const torsoHit = ctx.testSegmentVsSoldier(new Vector3(0, 0.95, -3), new Vector3(0, 0.95, 3), standing);
    assert.ok(torsoHit && torsoHit.isHeadshot === false, 'Shot at chest y=0.95 must hit body without headshot');

    const nearMiss = ctx.testSegmentVsSoldier(new Vector3(0.42, 0.95, -3), new Vector3(0.42, 0.95, 3), standing);
    assert.equal(nearMiss, null, 'Shot 0.42m beside standing torso must miss tightly');

    const kneelingMortar = { x: 0, y: 0, z: 0, mortarDeployed: true };
    const overKneelingHead = ctx.testSegmentVsSoldier(new Vector3(0, 1.64, -3), new Vector3(0, 1.64, 3), kneelingMortar);
    assert.equal(overKneelingHead, null, 'Shot at standing head height must miss kneeling mortar operator');
    const kneelingHeadHit = ctx.testSegmentVsSoldier(new Vector3(0, 1.22, -3), new Vector3(0, 1.22, 3), kneelingMortar);
    assert.ok(kneelingHeadHit && kneelingHeadHit.isHeadshot === true, 'Shot at kneeling head y=1.22 must register headshot');

    const swimmer = { x: 0, y: 0, z: 0, isSwimming: true };
    const swimmerMissHigh = ctx.testSegmentVsSoldier(new Vector3(0, 1.0, -3), new Vector3(0, 1.0, 3), swimmer);
    assert.equal(swimmerMissHigh, null, 'Shot above swimming waterline must miss');
    const swimmerHeadHit = ctx.testSegmentVsSoldier(new Vector3(0, 0.55, -3), new Vector3(0, 0.55, 3), swimmer);
    assert.ok(swimmerHeadHit && swimmerHeadHit.isHeadshot === true);
});

test('environment obstacle helpers enforce vertical maxY in segments, tight house bounds, and mesh.position.y windows', () => {
    const { ctx } = loadEnvironmentObstacleHelpers();

    // 1. obstacleSegmentEntry respects cb.maxY when ay/by are passed
    const obsLedge = {
        x: 0, y: 0, z: 0, rot: 0, c: 1, s: 0, radius: 4,
        box: { c: 1, s: 0, rot: 0 },
        collisionBoxes: [{ minX: -2, maxX: 2, minZ: -1, maxZ: 1, maxY: 1.2 }]
    };
    assert.equal(ctx.obstacleSegmentEntry(obsLedge, 0, -5, 0, 5, 0, 1.7, 1.7, 0), -1, 'Shot at y=1.7 must pass above 1.2m maxY ledge');
    assert.ok(ctx.obstacleSegmentEntry(obsLedge, 0, -5, 0, 5, 0, 0.8, 0.8, 0) >= 0, 'Shot at y=0.8 must hit 1.2m maxY ledge');

    // 2. attachObstacleBox tightens enterable house box & preserves 5 walls + exteriorBoxes, and honors mesh.position.y on windows
    const mockGeo = {
        boundingBox: { min: { x: -6, y: -1, z: -6 }, max: { x: 6, y: 7.4, z: 6 } },
        userData: {
            enterableSpec: {
                w: 6.0, h: 4.0, l: 8.0, wallThick: 0.34, doorW: 1.7, doorH: 2.5, floorY: 0.16,
                winW: 1.4, winH: 1.0, winSillH: 1.15, sideWinL: 1.5,
                exteriorBoxes: [{ minX: -4.5, maxX: 4.5, minZ: 5.8, maxZ: 6.0, maxY: 1.3 }]
            }
        }
    };
    const bldgMesh = { position: new Vector3(0, 9.85, 0), rotation: { y: 0 }, userData: {} };
    const bldg = ctx.attachObstacleBox({ mesh: bldgMesh, x: 0, y: 10.0, z: 0, height: 1.0 }, mockGeo, 1.0, 0);

    assert.equal(bldg.wallBoxes.length, 5, 'Enterable houses must retain exactly 5 wallBoxes');
    assert.equal(bldg.box.minX, -3.0, 'obs.box must be tightened to house walls, not fence inflation');
    assert.equal(bldg.box.maxZ, 4.0);
    assert.ok(Math.abs(bldg.height - 7.4) < 1e-6, 'obs.height must auto-derive from geometry boundingBox.max.y');
    assert.equal(bldg.exteriorBoxes.length, 1);

    // Window baseY is mesh.position.y = 9.85; win center y = 9.85 + 0.16 + 1.15 + 0.50 = 11.66
    assert.equal(ctx.isPointInObstacleWindow(bldg, new Vector3(0, 11.66, -3.95)), true, 'Window check must use obs.mesh.position.y');
});

test('enemyAI checkObstacleLineOfSight detects large off-center monuments and clears windows/low ledges', () => {
    const { ctx: obsCtx } = loadEnvironmentObstacleHelpers();
    const aiSrc = readScript('enemyAI.js');
    const losStart = aiSrc.indexOf('    // Check if line of sight between two positions');
    const losEnd = aiSrc.indexOf('\n    window.checkObstacleLineOfSight', losStart);
    assert.ok(losStart >= 0 && losEnd > losStart, 'checkObstacleLineOfSight block must exist');

    const windowObj = {
        worldObstacles: [],
        activeEnemyTanks: [],
        isPointInObstacleWindow: obsCtx.isPointInObstacleWindow
    };
    const context = {
        THREE: { Vector3, MathUtils: THREE_MATH },
        window: windowObj,
        activeEnemyTanks: windowObj.activeEnemyTanks,
        obstacleSegmentEntry: obsCtx.obstacleSegmentEntry,
        isPointInObstacleWindow: obsCtx.isPointInObstacleWindow,
        getTerrainHeight: () => 0,
        Math
    };
    vm.createContext(context);
    vm.runInContext(aiSrc.slice(losStart, losEnd), context);

    // Large monument center at x=14, z=20 (outside old +-6m broadphase!) with radius 22
    windowObj.worldObstacles.push({
        x: 14, y: 0, z: 20, radius: 22, height: 18, rot: 0,
        box: { c: 1, s: 0, rot: 0 },
        collisionCircles: [{ x: 0, z: 0, r: 20 }]
    });
    assert.equal(context.checkObstacleLineOfSight(0, 0, 0, 40), false, 'Large monument must block LOS along x=0');

    // Low 1.1m sandbag/fence wall does NOT block standing 1.55m eye-level LOS
    windowObj.worldObstacles.length = 0;
    windowObj.worldObstacles.push({
        x: 0, y: 0, z: 10, radius: 4, height: 1.2, rot: 0,
        box: { c: 1, s: 0, rot: 0 },
        collisionBoxes: [{ minX: -3, maxX: 3, minZ: -0.5, maxZ: 0.5, maxY: 1.1 }]
    });
    assert.equal(context.checkObstacleLineOfSight(0, 0, 0, 20, 1.6, 1.6), true, 'Eye-level LOS at y=1.6m must clear 1.1m low cover');
});

test('Phase 1-5 source invariants remain intact across modules', () => {
    const envSrc = readScript('environment.js');
    assert.equal(envSrc.includes('submergeDepth * 1.2'), false, 'Underwater seabed must match terrain height exactly');
    assert.ok(envSrc.includes('function getTreeBaseTrunkRadius('), 'Species trunk radius helper must be present');
    assert.ok(envSrc.includes('rx: rxOuter + 0.8, rz: rzOuter + 0.8'), 'Colosseum platform must be elliptical');

    const bunkerStart = envSrc.indexOf('function createMountainBunkerGeometry(');
    const bunkerEnd = envSrc.indexOf('\n// 5Q.', bunkerStart);
    const bunkerSrc = envSrc.slice(bunkerStart, bunkerEnd);
    assert.ok(bunkerSrc.includes('useMeshRaycastOnly: true') && bunkerSrc.includes('collisionBoxes:'), 'Mountain bunker must have tight collisionBoxes and mesh raycast');

    const soldiersSrc = readScript('soldiers.js');
    assert.ok(soldiersSrc.includes('createEyeIrisTexture('), 'Soldier iris texture factory must exist');
    assert.equal(soldiersSrc.includes('* 0.45 * (tree.scale || 1.0)'), false, 'Tree trunkRadius must not double-scale in soldiers.js');

    const bikeSrc = readScript('bicycle.js');
    assert.ok(bikeSrc.includes('getBuildingFloorHeight'), 'Bicycle must sample building floor & platform heights');
    assert.equal(bikeSrc.includes('* 0.45 * (tree.scale || 1)'), false, 'Tree trunkRadius must not double-scale in bicycle.js');
});
