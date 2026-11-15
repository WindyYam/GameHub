const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8').replace(/\r\n/g, '\n');
}

function section(source, start, end) {
    const first = source.indexOf(start);
    const last = source.indexOf(end, first);
    assert.ok(first >= 0 && last > first, `Missing section: ${start}`);
    return source.slice(first, last);
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
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    lengthSq() { return this.dot(this); }
    normalize() { const n = Math.sqrt(this.lengthSq()); return n ? this.multiplyScalar(1 / n) : this; }
    crossVectors(a, b) { return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
    distanceToSquared(v) { return this.clone().sub(v).lengthSq(); }
    applyQuaternion() { return this; }
}

class Quaternion {
    setFromUnitVectors() { return this; }
    copy() { return this; }
}

function createHarness(randomValues = []) {
    const soldiers = readScript('soldiers.js');
    const physics = readScript('physics.js');
    const math = Object.create(Math);
    math.random = () => randomValues.length ? randomValues.shift() : 0.5;
    const scene = { add(mesh) { mesh.parent = this; }, remove() {} };
    const context = {
        Math: math,
        THREE: { Vector3, Quaternion, MathUtils: { clamp: (x, min, max) => Math.max(min, Math.min(max, x)) } },
        window: { scene, activeSoldiers: [], activeEnemyTanks: [], worldObstacles: [], swayTrees: [] },
        tracers: [], tracerPool: [], PROJECTILE_POOL_LIMIT: 50,
        spawnParticle() {},
        createTracerObject: () => ({ position: new Vector3(), quaternion: new Quaternion() }),
        getTerrainHeight: () => -1000,
        _obstacleRaycaster: { set() {}, intersectObject: () => [] }
    };
    vm.createContext(context);
    vm.runInContext(section(physics, 'function getTankHitboxDims(', '// Spawns shell projectile from Enemy Tank'), context);
    vm.runInContext(section(physics, 'function spawnTracerRound(', '// Fire Coaxial'), context);
    context.window.spawnTracerRound = context.spawnTracerRound;
    context.shoot = vm.runInContext(`(class { ${
        section(soldiers, '        shoot(target, distToPlayer) {', '        takeDamage(amount) {')
    } }).prototype.shoot`, context);
    context.update = vm.runInContext(`(function(dt) { ${
        section(physics, '    // 2. Update machine-gun and rifle tracers', '    // 3. Update Reactive Targets Recovery')
    } })`, context);
    return context;
}

function makeSoldier(x, z, isEnemy) {
    return {
        x, y: 0, z, isEnemy, isDead: false, damage: 0,
        takeDamage(amount) { this.damage += amount; }
    };
}

function fireAtPlayer(harness) {
    const shooter = { ...makeSoldier(0, 0, true), rig: { rifle: null } };
    const player = makeSoldier(0, 20, false);
    harness.window.playerMode = 'soldier';
    harness.window.playerSoldier = player;
    harness.window.activeSoldiers.push(shooter);
    harness.shoot.call(shooter, { type: 'soldier', ref: player, x: 0, y: 1.2, z: 20, dist: 20 }, 20);
    return { shooter, player };
}

test('enemy rifle fires a real tracer and spread changes whether it collides', () => {
    for (const [yawRoll, expectedDamage] of [[0.5, 35], [1, 0]]) {
        const h = createHarness([0.5, yawRoll, 0.5]);
        const { player } = fireAtPlayer(h);
        assert.equal(h.tracers.length, 1);
        assert.equal(player.damage, 0);
        h.update(0.01);
        h.update(0.01);
        h.update(0.01);
        assert.equal(player.damage, expectedDamage);
    }
});

test('enemy tracers do not hit their shooter or other enemy soldiers', () => {
    const h = createHarness([0.5, 0.5, 0.5]);
    const { shooter, player } = fireAtPlayer(h);
    const friendly = makeSoldier(0, 5, true);
    h.window.activeSoldiers.push(friendly);
    h.update(0.03);
    assert.equal(shooter.damage, 0);
    assert.equal(friendly.damage, 0);
    assert.equal(player.damage, 35);
});

test('a moving target is not damaged after leaving the projectile path', () => {
    const h = createHarness([0.5, 0.5, 0.5]);
    const { player } = fireAtPlayer(h);
    h.update(0.01);
    player.x = 5;
    h.update(0.03);
    assert.equal(player.damage, 0);
});

test('cover stops a tracer before it reaches an infantry target within the same frame', () => {
    const h = createHarness([0.5, 0.5, 0.5]);
    const { player } = fireAtPlayer(h);
    h.window.worldObstacles.push({ x: 0, y: 0, z: 10, radius: 1, height: 3 });
    h.update(0.03);
    assert.equal(player.damage, 0);
    assert.equal(h.tracers.length, 0);
});

test('a target in front of cover is still hit', () => {
    const h = createHarness([0.5, 0.5, 0.5]);
    const { player } = fireAtPlayer(h);
    h.window.worldObstacles.push({ x: 0, y: 0, z: 22, radius: 1, height: 3 });
    h.update(0.03);
    assert.equal(player.damage, 35);
});

test('enemy tracers ignore friendly tanks and ricochet from the player tank', () => {
    const h = createHarness([0.5, 0.5, 0.5]);
    const { player } = fireAtPlayer(h);
    h.window.activeEnemyTanks.push({ x: 0, y: 0, z: 5, heading: 0 });
    h.window.tankState = { x: 0, y: 0, z: 10, heading: 0 };
    h.update(0.03);
    assert.equal(player.damage, 0);
    assert.equal(h.tracers.length, 0);
});

test('a nearer soldier is hit before a tank farther along the same segment', () => {
    const h = createHarness([0.5, 0.5, 0.5]);
    const { player } = fireAtPlayer(h);
    player.z = 10;
    h.window.tankState = { x: 0, y: 0, z: 20, heading: 0 };
    h.update(0.03);
    assert.equal(player.damage, 35);
});

test('tree trunks stop fast tracers before a target', () => {
    const h = createHarness([0.5, 0.5, 0.5]);
    const { player } = fireAtPlayer(h);
    const tree = { x: 0, y: 0, z: 10, radius: 1, trunkHeight: 5, isFallen: false };
    h.window.swayTrees.push(tree);
    h.update(0.03);
    assert.equal(player.damage, 0);
    assert.equal(tree.bulletHits, 1);
    assert.equal(h.tracers.length, 0);
});

test('terrain stops projectiles before infantry in the same frame', () => {
    const h = createHarness([0.5, 0.5, 0.5]);
    const { player } = fireAtPlayer(h);
    player.y = 0.3;
    h.getTerrainHeight = (x, z) => z >= 8 ? 1.4 : 0;
    h.update(0.03);
    assert.equal(player.damage, 0);
    assert.equal(h.tracers.length, 0);
});

test('allied rifle tracers can damage enemy infantry without friendly fire', () => {
    const h = createHarness([0.5]);
    const shooter = { ...makeSoldier(0, 0, false), rig: { rifle: null } };
    const enemy = makeSoldier(0, 20, true);
    h.window.activeSoldiers.push(shooter, enemy);
    h.shoot.call(shooter, { type: 'soldier', ref: enemy, x: 0, y: 1.2, z: 20, dist: 20 }, 20);
    h.update(0.03);
    assert.equal(shooter.damage, 0);
    assert.equal(enemy.damage, 35);
});

test('player rifle damage is applied once on projectile impact', () => {
    const h = createHarness();
    const enemy = makeSoldier(0, 20, true);
    enemy.takeDamage = function(amount) { this.damage += amount; this.isDead = true; };
    h.window.activeSoldiers.push(enemy);
    let banners = 0;
    h.window.showKillFeedBanner = () => banners++;
    h.playerMode = 'soldier';
    h.playerSoldier = {
        isDead: false, fireCooldown: 0,
        rig: { rifle: {
            userData: { muzzleOffset: new Vector3(0, 1.2, 0) },
            updateWorldMatrix() {}, localToWorld(v) { return v; }, getWorldQuaternion() {}
        } }
    };
    const playerSource = readScript('playerSoldier.js');
    const fire = vm.runInContext(`(${section(playerSource, '    function firePlayerRifle()', '    // ------------------------------------------------------------------------\n    // 5. UPDATE PLAYER SOLDIER')})`, h);
    fire();
    assert.equal(enemy.damage, 0);
    assert.equal(h.tracers.length, 1);
    h.update(0.03);
    assert.equal(enemy.damage, 52);
    assert.equal(banners, 1);
    assert.equal(h.tracers.length, 0);
});

test('machine-gun damage defaults remain unchanged', () => {
    const h = createHarness();
    const player = makeSoldier(0, 20, false);
    h.window.playerMode = 'soldier';
    h.window.playerSoldier = player;
    h.spawnTracerRound(new Vector3(0, 1.2, 0), new Vector3(0, 0, 1), new Quaternion(), true);
    h.update(0.03);
    assert.equal(player.damage, 25);
});
