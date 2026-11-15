const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
}

test('KV-2 is registered in TANK_SPECS with exact specified stats', () => {
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
    assert.ok(specs.kv2, 'kv2 spec must exist in TANK_SPECS');
    assert.equal(specs.kv2.id, 'kv2');
    assert.equal(specs.kv2.nation, 'Soviet Union');
    assert.equal(specs.kv2.flag, '🇷🇺');

    // 1. Damage is 4
    assert.equal(specs.kv2.cannonDamage, 4, 'KV-2 cannon damage must be exactly 4');

    // 2. Same speed as tiger tank
    assert.equal(specs.kv2.maxSpeed, specs.tiger.maxSpeed, 'KV-2 max speed must match Tiger tank');
    assert.equal(specs.kv2.reverseSpeed, specs.tiger.reverseSpeed, 'KV-2 reverse speed must match Tiger tank');
    assert.equal(specs.kv2.turnSpeed, specs.tiger.turnSpeed, 'KV-2 turn speed must match Tiger tank');

    // 3. Projectile is slowest in the game
    assert.ok(specs.kv2.shellVel < specs.sherman.shellVel, 'KV-2 shell velocity must be slower than Sherman (slowest in game)');
    assert.ok(specs.kv2.shellVel < specs.tiger.shellVel, 'KV-2 shell velocity must be slower than Tiger');
    assert.ok(specs.kv2.shellVel < specs.t34.shellVel, 'KV-2 shell velocity must be slower than T-34');
    assert.ok(specs.kv2.shellVel < specs.kingtiger.shellVel, 'KV-2 shell velocity must be slower than King Tiger');

    // 4. Explosion radius is the biggest in the game
    assert.ok(specs.kv2.blastRadius > specs.t34.blastRadius, 'KV-2 blast radius must be larger than T-34 (previously largest)');
    assert.ok(specs.kv2.blastRadius > specs.tiger.blastRadius, 'KV-2 blast radius must be larger than Tiger');
    assert.ok(specs.kv2.blastRadius > specs.kingtiger.blastRadius, 'KV-2 blast radius must be larger than King Tiger');
    assert.ok(specs.kv2.blastRadius > specs.sherman.blastRadius, 'KV-2 blast radius must be larger than Sherman');
    assert.equal(specs.kv2.blastRadius, 24.0, 'KV-2 blast radius is 24.0m colossal HE blast');

    // 5. Precision is the same level as M4 Sherman
    assert.equal(specs.kv2.spread, specs.sherman.spread, 'KV-2 precision (spread) must match M4 Sherman');

    // 6. Turret turning speed is slow
    assert.ok(specs.kv2.turretTurnSpeed < specs.sherman.turretTurnSpeed, 'KV-2 turret turning speed must be slower than Sherman');
    assert.ok(specs.kv2.turretTurnSpeed < specs.tiger.turretTurnSpeed, 'KV-2 turret turning speed must be slower than Tiger');
    assert.ok(specs.kv2.turretTurnSpeed < specs.t34.turretTurnSpeed, 'KV-2 turret turning speed must be slower than T-34');
    assert.ok(specs.kv2.turretTurnSpeed < specs.kingtiger.turretTurnSpeed, 'KV-2 turret turning speed must be slower than King Tiger');
    assert.equal(specs.kv2.turretTurnSpeed, 0.45, 'KV-2 turret turning speed must be 0.45 rad/s');
});

test('Faction detection assigns KV-2 to Soviet Russia campaign across systems', () => {
    // 1. Check playerSoldier.js getPlayerFaction
    const playerSoldierSrc = readScript('playerSoldier.js');
    const startPs = playerSoldierSrc.indexOf('function getPlayerFaction()');
    const endPs = playerSoldierSrc.indexOf('function initPlayerSoldierUI()', startPs);
    assert.ok(startPs >= 0 && endPs > startPs);

    const ctxPs = { currentTankId: 'kv2' };
    ctxPs.window = ctxPs;
    vm.createContext(ctxPs);
    vm.runInContext(playerSoldierSrc.slice(startPs, endPs), ctxPs);
    assert.equal(ctxPs.getPlayerFaction(), 'soviet');

    // 2. Check soldiers.js getFactionsForPlayerTank
    const soldiersSrc = readScript('soldiers.js');
    const startS = soldiersSrc.indexOf('function getFactionsForPlayerTank(');
    const endS = soldiersSrc.indexOf('function clearSoldiers()', startS);
    assert.ok(startS >= 0 && endS > startS);

    const ctxS = {};
    vm.createContext(ctxS);
    vm.runInContext(soldiersSrc.slice(startS, endS), ctxS);
    const factions = ctxS.getFactionsForPlayerTank('kv2');
    assert.equal(factions.allied, 'soviet');
    assert.equal(factions.enemy, 'german');

    // 3. Check enemyAI.js campaign list
    const enemyAISrc = readScript('enemyAI.js');
    assert.ok(enemyAISrc.includes("'kv2'"), 'enemyAI.js must include kv2 in ALL_CAMPAIGNS');
    assert.ok(enemyAISrc.includes("tankType === 'kv2'"), 'enemyAI.js must handle kv2 tank spawn');

    // 4. Check main.js and environment.js
    const mainSrc = readScript('main.js');
    assert.ok(mainSrc.includes("'kv2'"), 'main.js must include kv2 in ALL_CAMPAIGNS');

    const envSrc = readScript('environment.js');
    assert.ok(envSrc.includes("'kv2'"), 'environment.js must include kv2 in ALL_CAMPAIGNS');
});

test('tankKV2 script defines and exports buildKV2Tank and getKV2SharedAssets', () => {
    const kv2Src = readScript('tankKV2.js');
    assert.ok(kv2Src.includes('function buildKV2Tank'), 'buildKV2Tank must be defined');
    assert.ok(kv2Src.includes('window.buildKV2Tank = buildKV2Tank'), 'buildKV2Tank must be exported on window');
    assert.ok(kv2Src.includes('function getKV2SharedAssets'), 'getKV2SharedAssets must be defined');
    assert.ok(kv2Src.includes('ЗА РОДИНУ'), 'Inscription ЗА РОДИНУ must be present');
});

test('KV-2 turret side back plate geometry is correctly oriented with flat rear and front angled cheeks', () => {
    const source = readScript('tankKV2.js');
    class Shape {
        constructor() { this.points = []; }
        moveTo(x, y) { this.points.push({ x, y }); }
        lineTo(x, y) { this.points.push({ x, y }); }
        closePath() {}
    }

    const start = source.indexOf('const tFootprint = new THREE.Shape();');
    const end = source.indexOf('const turretCoreGeo =', start);
    assert.ok(start >= 0 && end > start, 'turret footprint definition must exist');

    const points = vm.runInNewContext(`${source.slice(start, end)}\ntFootprint.points`, {
        THREE: { Shape }
    });

    // After rotateX(-PI/2), 3D Z = -Shape Y
    // Shape Y = +1.18 -> 3D Z = -1.18 (Rear Left & Rear Right: flat rear back wall)
    const rearLeft = points.find(p => p.x === -0.84 && p.y === 1.18);
    const rearRight = points.find(p => p.x === 0.84 && p.y === 1.18);
    assert.ok(rearLeft, 'Rear Left must be at Y = 1.18 (-1.18 in 3D Z) for flat back plate');
    assert.ok(rearRight, 'Rear Right must be at Y = 1.18 (-1.18 in 3D Z) for flat back plate');

    // Angled cheeks must be at Y = -1.05 (+1.05 in 3D Z) at the FRONT
    const frontCheekLeft = points.find(p => p.x === -0.62 && p.y === -1.05);
    const frontCheekRight = points.find(p => p.x === 0.62 && p.y === -1.05);
    assert.ok(frontCheekLeft, 'Front Cheek Left must be at Y = -1.05 (+1.05 in 3D Z)');
    assert.ok(frontCheekRight, 'Front Cheek Right must be at Y = -1.05 (+1.05 in 3D Z)');

    // Mid-front transition points
    const midFrontLeft = points.find(p => p.x === -0.84 && p.y === -0.56);
    const midFrontRight = points.find(p => p.x === 0.84 && p.y === -0.56);
    assert.ok(midFrontLeft, 'Mid-Front Left must be at Y = -0.56 (+0.56 in 3D Z)');
    assert.ok(midFrontRight, 'Mid-Front Right must be at Y = -0.56 (+0.56 in 3D Z)');
});

test('audio.js defines 152mm howitzer sound and handles kv2 sound profile', () => {
    const audioSrc = readScript('audio.js');
    assert.ok(audioSrc.includes('playKV2Howitzer'), 'playKV2Howitzer must be defined');
    assert.ok(audioSrc.includes("this.currentProfile === 'kv2'"), 'kv2 engine sound profile must be handled');
    assert.ok(audioSrc.includes("id === 'kv2'"), 'kv2 cannon dispatch must be handled');
});

test('KV-2 tank includes functional headlights with SpotLight and slitMat', () => {
    const kv2Src = readScript('tankKV2.js');
    assert.ok(kv2Src.includes('headlightLights.push({ spot, slitMat })'), 'KV-2 must push spot and slitMat to headlightLights');
    assert.ok(kv2Src.includes('new THREE.SpotLight('), 'KV-2 must create SpotLight for headlight');
    assert.ok(kv2Src.includes('new THREE.MeshBasicMaterial({ color: isLit ? 0xfef08a : 0x334155 })'), 'KV-2 slitMat must reflect headlight toggle state');
});

test('FPV view uses mouse cursor raycast and camOrbit mechanism matching Follow view', () => {
    const controlsSrc = readScript('controls.js');
    const mainSrc = readScript('main.js');

    // controls.js updates camOrbit in FPV just like orbit view
    assert.ok(controlsSrc.includes("if (cameraMode === 'fpv')"), 'controls.js must handle cameraMode === fpv');
    assert.ok(controlsSrc.includes("camOrbit.theta -= dx * sens"), 'controls.js must rotate camOrbit.theta in FPV');

    assert.ok(mainSrc.includes('sightPos.addScaledVector(lookDir, 1.0)'), 'FPV camera must be moved forward beyond the turret');

    // main.js includes fpv in raycast aiming and bore reticle display
    assert.ok(mainSrc.includes("} else if (cameraMode === 'orbit' || cameraMode === 'fpv')"), 'main.js must share 3D raycast aiming between orbit and fpv');
    assert.ok(mainSrc.includes("} else if (cameraMode === 'orbit' || cameraMode === 'fpv' || cameraMode === 'inspect')"), 'main.js must display dynamic gun bore reticle in fpv');
});

test('right-click fires the coax MG in FPV without changing zoom', () => {
    const controlsSrc = readScript('controls.js');
    const mouseDownHandler = controlsSrc.slice(
        controlsSrc.indexOf("renderer.domElement.addEventListener('mousedown'"),
        controlsSrc.indexOf("window.addEventListener('mouseup'")
    );
    const mouseUpHandler = controlsSrc.slice(
        controlsSrc.indexOf("window.addEventListener('mouseup'"),
        controlsSrc.indexOf("window.addEventListener('blur'")
    );

    assert.ok(mouseDownHandler.includes("} else if (e.button === 2)"), 'right-click must be handled');
    assert.ok(mouseDownHandler.includes('isFiringCoaxMG = true'), 'tank right-click must start coax MG fire in FPV');
    assert.ok(!mouseDownHandler.includes('perspCamera.fov'), 'right-click must not change FPV zoom');
    assert.ok(mouseUpHandler.includes('isFiringCoaxMG = false'), 'releasing right-click must stop coax MG fire');
    assert.ok(!mouseUpHandler.includes('perspCamera.fov'), 'releasing right-click must not reset FPV zoom');
});

test('V key and mobile zoom button both cycle the tank zoom levels', () => {
    const controlsSrc = readScript('controls.js');
    const keydownHandler = controlsSrc.slice(
        controlsSrc.indexOf("window.addEventListener('keydown'"),
        controlsSrc.indexOf("window.addEventListener('keyup'")
    );
    const mobileZoomHandler = controlsSrc.slice(
        controlsSrc.indexOf("const mobZoom = document.getElementById('mob-btn-zoom')"),
        controlsSrc.indexOf("const mobSmoke = document.getElementById('mob-btn-smoke')")
    );

    assert.match(keydownHandler, /if \(k === 'v'\) \{\s*cycleZoom\(\);/);
    assert.ok(mobileZoomHandler.includes('cycleZoom();'), 'mobile zoom button must use the same zoom cycle');
});

test('Entering FPV preserves the current camera view direction', () => {
    const controlsSrc = readScript('controls.js');
    const setCameraMode = controlsSrc.slice(
        controlsSrc.indexOf('function setCameraMode(mode)'),
        controlsSrc.indexOf('const FPV_ZOOM_FOVS')
    );
    const fpvMode = setCameraMode.slice(
        setCameraMode.indexOf("if (mode === 'fpv')"),
        setCameraMode.indexOf('} else {', setCameraMode.indexOf("if (mode === 'fpv')"))
    );

    assert.ok(fpvMode.includes("if (mode === 'fpv')"), 'FPV camera mode must still initialize');
    assert.ok(!fpvMode.includes('camOrbit.theta ='), 'entering FPV must preserve camera yaw');
    assert.ok(!fpvMode.includes('camOrbit.phi ='), 'entering FPV must preserve camera pitch');
});

test('Direct projectile hits on enemy and player tanks trigger heavy detonation effect', () => {
    const physicsSrc = readScript('physics.js');
    const enemyTankBlock = physicsSrc.slice(
        physicsSrc.indexOf("if (closestHit.type === 'enemyTank')"),
        physicsSrc.indexOf("} else if (closestHit.type === 'tree')")
    );
    assert.ok(enemyTankBlock.includes('triggerHeavyDetonation(imp, !!s.isMortar, bRad, bDmg)'), 'Direct hits must detonate and only mortar blasts must ignore the operator');
    assert.ok(physicsSrc.includes('isMortar: true'), 'Player mortar shells must be marked for operator-safe detonation');
    assert.ok(enemyTankBlock.includes("closestHit.type === 'playerTank'"), 'Must handle playerTank');
});

test('Tank selector UI element is removed and score state HUD has expanded room', () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(!indexHtml.includes('id="panel-tank-selector"'), 'panel-tank-selector must be removed from index.html');
    assert.ok(!indexHtml.includes('class="hud-btn tank-select-btn"'), 'tank select buttons must be removed from HTML');
    assert.ok(indexHtml.includes('id="combat-mini-hud"'), 'combat-mini-hud must exist');
    assert.ok(indexHtml.includes('flex-1 max-w-2xl'), 'combat-mini-hud must have expanded room');
});

test('Water layer renderOrder is lower than transparent particle effect layers', () => {
    const envSrc = readScript('environment.js');
    const physicsSrc = readScript('physics.js');

    assert.ok(envSrc.includes('oceanMesh.renderOrder = -10'), 'Coastal water mesh must have negative renderOrder');
    assert.ok(physicsSrc.includes('mesh.renderOrder = 20'), 'Smoke particles must have higher renderOrder than water');
    assert.ok(physicsSrc.includes('mesh.renderOrder = 25'), 'Shockwave must have higher renderOrder than water');
});

test('Player soldier survives tank destruction with 1s invulnerability', () => {
    const playerSoldierSrc = readScript('playerSoldier.js');
    assert.ok(playerSoldierSrc.includes('invulnerableTimer: isTankDestroyed ? 1.0 : 0.0'), 'Must grant 1s invulnerability on tank destruction');
    assert.ok(playerSoldierSrc.includes('if (playerSoldier.invulnerableTimer > 0) return;'), 'Must block damage while invulnerable');

    const enemyAISrc = readScript('enemyAI.js');
    assert.ok(enemyAISrc.includes('dismountTank(true)'), 'enemyAI.js must signal bailout/destruction to dismountTank');
    assert.ok(enemyAISrc.includes('triggerHeavyDetonation(playerHullPos, true)'), 'Secondary ammo explosion must ignore player');
});
