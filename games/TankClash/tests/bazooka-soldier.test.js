const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
}

class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
    sub(v) { return this.set(this.x - v.x, this.y - v.y, this.z - v.z); }
    subVectors(a, b) { return this.set(a.x - b.x, a.y - b.y, a.z - b.z); }
    length() { return Math.hypot(this.x, this.y, this.z); }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    multiplyScalar(value) { return this.set(this.x * value, this.y * value, this.z * value); }
    addScaledVector(v, scale) { return this.set(this.x + v.x * scale, this.y + v.y * scale, this.z + v.z * scale); }
    normalize() { const length = Math.hypot(this.x, this.y, this.z); return length ? this.multiplyScalar(1 / length) : this; }
    crossVectors(a, b) {
        const ax = a.x, ay = a.y, az = a.z;
        const bx = b.x, by = b.y, bz = b.z;
        this.x = ay * bz - az * by;
        this.y = az * bx - ax * bz;
        this.z = ax * by - ay * bx;
        return this;
    }
}

class Quaternion {
    constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
    setFromUnitVectors() { return this; }
}

test('tankModel.js sets bazooka price to 350 and index.html includes bazooka soldier option', () => {
    const tankModelSrc = readScript('tankModel.js');
    assert.ok(tankModelSrc.includes('bazooka: 350'), 'TANK_PRICES must include bazooka: 350');

    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('data-soldier-type="bazooka"'), 'index.html must include data-soldier-type="bazooka"');
    assert.ok(html.includes('id="btn-soldier-type-bazooka"'), 'index.html must include btn-soldier-type-bazooka');
    assert.ok(html.includes('Bazooka Soldier'), 'index.html must display Bazooka Soldier');
    assert.ok(html.includes('$350'), 'index.html must display $350 price tag');
    assert.ok(html.includes('id="hud-soldier-reload-container"'), 'index.html must include hud-soldier-reload-container');
});

test('main.js handles bazooka soldier pricing, selection, and deployment charging $350', () => {
    const mainSrc = readScript('main.js');
    assert.ok(mainSrc.includes("window.selectedSoldierType === 'bazooka'"), 'main.js must handle bazooka soldier type selection');

    const soldierPriceStart = mainSrc.indexOf('function getSelectedSoldierPrice()');
    const soldierPriceEnd = mainSrc.indexOf('\nfunction setSpawnModalStage', soldierPriceStart);
    const deployStart = mainSrc.indexOf('function deployAsSoldier(');
    const deployEnd = mainSrc.indexOf('\nwindow.deployAsSoldier = deployAsSoldier;', deployStart);

    assert.ok(soldierPriceStart >= 0 && soldierPriceEnd > soldierPriceStart, 'getSelectedSoldierPrice must exist');
    assert.ok(deployStart >= 0 && deployEnd > deployStart, 'deployAsSoldier must exist');

    const banners = [];
    const window = {
        selectedSoldierType: 'bazooka',
        TANK_PRICES: { bazooka: 350, mortar: 250 },
        money: 500,
        deductPlayerMoney(amount) {
            if (this.money < amount) return false;
            this.money -= amount;
            return true;
        },
        showKillFeedBanner(msg) { banners.push(msg); },
        tankState: { hasTank: true, isKnockedOut: false, speed: 0, turnRate: 0, x: 0, z: 0 }
    };
    const context = {
        window,
        hideSpawnSelectionModal() {},
        updateSpawnModalUI() {},
        setSpawnModalStage() {}
    };

    vm.runInNewContext(`${mainSrc.slice(soldierPriceStart, soldierPriceEnd)}\n${mainSrc.slice(deployStart, deployEnd)}`, context);

    // Initial price check
    assert.equal(context.getSelectedSoldierPrice(), 350, 'bazooka soldier price must be 350');

    // Deploy with sufficient funds ($500 >= $350)
    assert.equal(context.deployAsSoldier(), true);
    assert.equal(window.money, 150, 'remaining money must be 150 after paying 350');
    assert.ok(banners.at(-1).includes('(-$350)'), 'banner must indicate -$350');
    assert.ok(banners.at(-1).includes('Bazooka Soldier'), 'banner must name Bazooka Soldier');

    // Deploy with insufficient funds ($150 < $350)
    assert.equal(context.deployAsSoldier(), false, 'must reject deployment when funds are insufficient');
    assert.equal(window.money, 150, 'money must not be deducted when deployment rejected');
    assert.ok(banners.at(-1).includes('Requires $350'), 'banner must inform required $350 funds');
});

test('soldiers.js defines realistic scratched rocket launcher texture maps and 3D model builder', () => {
    const soldiersSrc = readScript('soldiers.js');
    assert.ok(soldiersSrc.includes('createRocketLauncherMaps'), 'TextureFactory must define createRocketLauncherMaps');
    assert.ok(soldiersSrc.includes('buildRocketLauncher'), 'soldiers.js must define buildRocketLauncher');
    assert.ok(soldiersSrc.includes('MATS.bazookaMetal'), 'initMaterials must register MATS.bazookaMetal');

    // Verify scratches texture logic
    assert.ok(soldiersSrc.includes('scratchCount') || soldiersSrc.includes('scratch'), 'must include scratch rendering in canvas texture');
    assert.ok(soldiersSrc.includes('hCtx.strokeStyle') || soldiersSrc.includes('heightC'), 'must generate scratch height/normal map grooves');

    // Verify rocket launcher 3D components
    assert.ok(soldiersSrc.includes('muzzleRing'), 'launcher model must include front muzzle ring/collar');
    assert.ok(soldiersSrc.includes('rearBell') || soldiersSrc.includes('tailRing'), 'launcher model must include rear flared exhaust bell/ring');
    assert.ok(soldiersSrc.includes('shoulderRest'), 'launcher model must include shoulder rest');
    assert.ok(soldiersSrc.includes('pistolGrip'), 'launcher model must include pistol grip');
    assert.ok(soldiersSrc.includes('fwdGrip'), 'launcher model must include forward handgrip');
    assert.ok(soldiersSrc.includes('warhead'), 'launcher model must include loaded rocket warhead');
});

test('physics.js defines spawnPlayerRocket with precision slightly worse than T-34, slow projectile velocity, trace particles, and blast radius', () => {
    const physicsSrc = readScript('physics.js');
    const start = physicsSrc.indexOf('function spawnPlayerRocket(');
    const end = physicsSrc.indexOf('\nwindow.spawnPlayerRocket = spawnPlayerRocket;', start);
    assert.ok(start >= 0 && end > start, 'spawnPlayerRocket must exist in physics.js');
    assert.ok(physicsSrc.includes('t34Spread'), 'spawnPlayerRocket must reference t34 spread');

    const addedShells = [];
    const context = {
        THREE: { Vector3, Quaternion },
        window: {
            scene: { add() {} },
            TANK_SPECS: { t34: { spread: 0.006 } }
        },
        rocketPool: [],
        createRocketObject: () => ({ visible: false, position: new Vector3(), quaternion: new Quaternion() }),
        shells: addedShells
    };
    vm.createContext(context);
    vm.runInNewContext(physicsSrc.slice(start, end), context);

    const muzzlePos = new Vector3(0, 1.5, 0);
    const fireDir = new Vector3(0, 0, 1);
    const owner = { soldierType: 'bazooka' };

    // Fire multiple rockets to verify spread (calibrated to be a little worse than T-34)
    const firedDirections = [];
    for (let i = 0; i < 50; i++) {
        context.spawnPlayerRocket(muzzlePos, fireDir, owner);
        const rocket = addedShells[i];
        assert.equal(rocket.isRocket, true, 'projectile must have isRocket = true');
        assert.equal(rocket.blastRadius >= 10.0, true, 'rocket blast radius must be >= 10m');
        assert.equal(rocket.cannonDamage, 1, 'rocket cannon damage must be exactly 1 HP to tanks');

        // Slow velocity check (~40-45 m/s vs cannon shells 150-773 m/s)
        const speed = rocket.vel.length();
        assert.ok(speed >= 30 && speed <= 55, `rocket velocity must be slow (~42 m/s), got ${speed}`);

        const dir = rocket.vel.clone().normalize();
        firedDirections.push(dir);
    }

    // Verify precision: angular deviation is tight (~0.008 rad, slightly worse than T-34's 0.006, not wildly inaccurate)
    const angles = firedDirections.map(d => Math.acos(Math.max(-1, Math.min(1, d.z))));
    const maxAngle = Math.max(...angles);
    const avgAngle = angles.reduce((a, b) => a + b, 0) / angles.length;
    assert.ok(maxAngle < 0.05, `rocket dispersion cone must remain controlled (< 0.05 rad), got ${maxAngle}`);
    assert.ok(avgAngle > 0.001, `rocket must exhibit dispersion, got average ${avgAngle}`);

    // Verify trace emission in updateProjectiles
    assert.ok(physicsSrc.includes('s.isRocket'), 'updateProjectiles must check s.isRocket');
    assert.ok(physicsSrc.includes('smoke') && physicsSrc.includes('fire'), 'updateProjectiles must emit smoke and fire trace particles for rockets');
});

test('playerSoldier.js implements 6 second reload time and allows firing on bicycle for bazooka soldier', () => {
    const playerSrc = readScript('playerSoldier.js');

    assert.ok(playerSrc.includes('firePlayerBazooka'), 'firePlayerBazooka must exist');
    assert.ok(playerSrc.includes('s.fireCooldown = 6.0'), 'firing bazooka must enforce exactly 6 sec reload time');
    assert.ok(!playerSrc.includes('DISMOUNT TO FIRE BAZOOKA'), 'firing bazooka must be allowed while mounted on bicycle (no dismount restriction)');
    assert.ok(playerSrc.includes("hud-soldier-reload"), 'HUD must update soldier reload element');

    // Verify firePlayerRifle routes to firePlayerBazooka
    const fireRifleStart = playerSrc.indexOf('function firePlayerRifle() {');
    const fireRifleEnd = playerSrc.indexOf('\n    function updatePlayerSoldier(', fireRifleStart);
    const fireRifleBody = playerSrc.slice(fireRifleStart, fireRifleEnd);
    assert.ok(fireRifleBody.includes("playerSoldier.soldierType === 'bazooka'"), 'firePlayerRifle must check bazooka soldier type');
    assert.ok(fireRifleBody.includes('firePlayerBazooka()'), 'firePlayerRifle must invoke firePlayerBazooka');
});

test('audio.js replaces rocket reload sound with tank cannon stage 2 reload sound (playShellSlide)', () => {
    const audioSrc = readScript('audio.js');
    assert.ok(audioSrc.includes('playRocketReload'), 'audio.js must define playRocketReload');
    assert.ok(audioSrc.includes('playShellSlide'), 'audio.js must define playShellSlide');

    const start = audioSrc.indexOf('playRocketReload(posOrDist = 0) {');
    const end = audioSrc.indexOf('playT34Cannon(', start);
    assert.ok(start >= 0 && end > start, 'playRocketReload must exist');

    const methodBody = audioSrc.slice(start, end);
    assert.ok(methodBody.includes('playShellSlide'), 'playRocketReload must delegate to playShellSlide (stage 2 reload sound)');

    let shellSlideCalled = false;
    const dummySoundFX = {
        playShellSlide() { shellSlideCalled = true; }
    };
    const fn = new Function('soundFX', `soundFX.playRocketReload = function(posOrDist = 0) { ${methodBody.slice(methodBody.indexOf('{') + 1, methodBody.lastIndexOf('}'))} };`);
    fn(dummySoundFX);
    dummySoundFX.playRocketReload();
    assert.equal(shellSlideCalled, true, 'playRocketReload must invoke playShellSlide');
});

test('physics.js rocket projectile starts to drift randomly after 64m (80% of 80m)', () => {
    const physicsSrc = readScript('physics.js');
    assert.ok(physicsSrc.includes('s.distanceTraveled > 64') || physicsSrc.includes('s.distanceTraveled > 80'), 'updateProjectiles must check if rocket distance exceeds drift threshold');
    assert.ok(physicsSrc.includes('driftImpulse'), 'updateProjectiles must calculate random transverse drift impulse');

    // Isolate shell physics update loop from updateProjectiles
    const start = physicsSrc.indexOf('    // 1. Update Cannon Shells (Player shells and Enemy combat shells)');
    const end = physicsSrc.indexOf('\n    // 2. Update machine-gun and rifle tracers', start);
    assert.ok(start >= 0 && end > start, 'cannon and rocket shells loop must exist in physics.js');

    const dt = 0.05;
    const mesh = { position: new Vector3(), quaternion: new Quaternion(), visible: true };
    const rocket = {
        mesh,
        pos: new Vector3(0, 50, 0),
        vel: new Vector3(0, 0, 42), // Pure Z velocity (42 m/s)
        life: 5.0,
        isEnemy: false,
        isRocket: true,
        distanceTraveled: 0,
        cannonDamage: 1,
        blastRadius: 11.5,
        blastDamage: 135
    };

    const context = {
        THREE: { Vector3, Quaternion },
        shells: [rocket],
        shellPool: [],
        rocketPool: [],
        getTerrainHeight: () => 0,
        PROJECTILE_POOL_LIMIT: 20,
        window: {
            activeEnemyTanks: [],
            tankState: { isKnockedOut: false, hasTank: true },
            scene: { remove() {} }
        }
    };
    vm.createContext(context);
    vm.runInNewContext(`function updateShells(dt) {\n${physicsSrc.slice(start, end)}\n}`, context);

    // Simulate flight up to 60m (1.4s, 28 steps)
    for (let step = 0; step < 28; step++) {
        context.updateShells(dt);
    }

    assert.ok(rocket.distanceTraveled < 64.0, `distanceTraveled must be < 64m, got ${rocket.distanceTraveled}`);
    assert.equal(rocket.vel.x, 0, 'rocket X velocity must remain strictly 0 before 64m (no lateral drift)');
    assert.ok(Math.abs(rocket.pos.x) < 0.0001, 'rocket X position must remain 0 before 64m');

    // Simulate flight past 64m (next 25 steps, ~50m more)
    for (let step = 0; step < 25; step++) {
        context.updateShells(dt);
    }

    assert.ok(rocket.distanceTraveled > 64.0, `distanceTraveled must exceed 64m, got ${rocket.distanceTraveled}`);
    assert.notEqual(rocket.vel.x, 0, 'rocket X velocity must drift away from 0 after 64m');
    assert.notEqual(rocket.pos.x, 0, 'rocket X position must demonstrate lateral drift after 64m');
});

test('environment.js applies lighter grass color in desert zone', () => {
    const envSrc = readScript('environment.js');

    // Check grass shader in environment.js defines lighter desert grass colors
    assert.ok(envSrc.includes('lightDesertGrass'), 'grass shader must define lightDesertGrass');
    assert.ok(envSrc.includes('vGrassZoneWeights.y > 0.02'), 'grass shader must apply light grass specifically for desert zone');
    assert.ok(envSrc.includes('vec3(0.68, 0.60, 0.38)'), 'grass shader must use light golden straw base tone');
    assert.ok(envSrc.includes('vec3(0.85, 0.78, 0.52)'), 'grass shader must use sun-bleached golden tip tone');
    assert.ok(envSrc.includes('colDesertOasisGrass'), 'desert chunk terrain vertex colors must use lighter oasis grass');
});

test('soldiers.js and physics.js support enemy bazooka and mortar soldiers that fire accurately', () => {
    const soldiersSrc = readScript('soldiers.js');
    const physicsSrc = readScript('physics.js');

    // 1. Enemy Escort Offsets include bazooka and mortar
    assert.ok(soldiersSrc.includes("type: 'bazooka'"), 'TACTICAL_ESCORT_OFFSETS must include bazooka type');
    assert.ok(soldiersSrc.includes("type: 'mortar'"), 'TACTICAL_ESCORT_OFFSETS must include mortar type');

    // 2. spawnEjectedDriver includes bazooka and mortar
    assert.ok(soldiersSrc.includes("'bazooka'") && soldiersSrc.includes("'mortar'"), 'driverTypes must include bazooka and mortar');

    // 3. Projectile enemy attribution in physics.js
    assert.ok(physicsSrc.includes('const isEnemyProjectile = owner ? !!owner.isEnemy : false'), 'spawnPlayerRocket and spawnPlayerMortarShell must compute owner.isEnemy status');

    // 4. Enemy splash damage applies to player (ignorePlayer = !s.isEnemy && !!(s.isMortar || s.isRocket))
    assert.ok(physicsSrc.includes('!s.isEnemy && !!(s.isMortar || s.isRocket)'), 'updateProjectiles must only ignore player damage for FRIENDLY mortars/rockets');

    // 5. SoldierAI handles mortar positioning and firing
    assert.ok(soldiersSrc.includes("this.soldierType === 'mortar'"), 'SoldierAI must branch for mortar soldierType');
    assert.ok(soldiersSrc.includes('spawnPlayerMortarShell'), 'SoldierAI must invoke spawnPlayerMortarShell when shooting as mortar');
    assert.ok(soldiersSrc.includes('elevAngle'), 'SoldierAI must compute ballistic mortar elevation angle');

    // 6. SoldierAI handles bazooka firing directly without gravity drop
    assert.ok(soldiersSrc.includes('isBazooka'), 'SoldierAI must handle bazooka shooting');

    // 7. SoldierAI die() kill banner names
    assert.ok(soldiersSrc.includes('Bazooka Soldier') && soldiersSrc.includes('Mortar Crew'), 'SoldierAI die() must announce Bazooka Soldier and Mortar Crew');
});
