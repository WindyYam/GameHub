const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
}

test('index.html includes money display in combat-mini-hud', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('id="hud-money"'), 'index.html must include hud-money element');
    assert.ok(html.includes('id="combat-mini-hud"'), 'index.html must have combat-mini-hud');
    const miniHudIdx = html.indexOf('id="combat-mini-hud"');
    const moneyIdx = html.indexOf('id="hud-money"');
    const closeDivIdx = html.indexOf('</div>', miniHudIdx);
    assert.ok(moneyIdx > miniHudIdx && moneyIdx < closeDivIdx, 'hud-money must be within combat-mini-hud');
});

test('audio.js does not play money chime sound', () => {
    const audioSrc = readScript('audio.js');
    assert.ok(!audioSrc.includes('playMoneyChime'), 'audio.js must not define playMoneyChime');
});

test('physics.js defines money system state and operations without money sound', () => {
    const physicsSrc = readScript('physics.js');
    assert.ok(!physicsSrc.includes('playMoneyChime'), 'physics.js must not invoke playMoneyChime');
    const dom = {
        'hud-money': { textContent: '' }
    };
    const ctx = {
        window: {},
        document: {
            getElementById: (id) => dom[id] || null
        },
        THREE: {
            MathUtils: { degToRad: d => d * Math.PI / 180 },
            Vector3: class { constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; } },
            Quaternion: class { constructor() {} },
            Raycaster: class { constructor() {} set() {} intersectObjects() { return []; } },
            DodecahedronGeometry: class { constructor() {} rotateX() {} },
            BoxGeometry: class { constructor() {} rotateX() {} },
            RingGeometry: class { constructor() {} rotateX() {} },
            CylinderGeometry: class { constructor() {} rotateX() {} },
            MeshBasicMaterial: class { constructor() {} },
            Mesh: class { constructor() {} }
        }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(physicsSrc, ctx);

    // Initial state: starts with $500
    assert.equal(ctx.getPlayerMoney(), 500, 'Initial money must be 500');
    assert.equal(ctx.tankState.money, 500, 'tankState.money must be initialized to 500');
    assert.equal(ctx.window.playerMoney, 500, 'window.playerMoney must be 500');
    assert.equal(ctx.window.UNIT_KILL_REWARDS.soldier, 10, 'Soldier kill reward must match the configured amount');
    assert.deepEqual({ ...ctx.window.UNIT_KILL_REWARDS.tank.byArmor }, { 1: 50, 2: 65, 3: 80 }, 'Tank rewards must vary by armor');

    // Add money
    ctx.addPlayerMoney(50, 'Bonus');
    assert.equal(ctx.getPlayerMoney(), 550, 'Money must be 550 after adding 50');
    assert.equal(ctx.tankState.money, 550, 'tankState.money must synchronize with money');
    assert.equal(dom['hud-money'].textContent, '$550', 'HUD must display $550');

    // Deduct money
    const deducted = ctx.deductPlayerMoney(500);
    assert.equal(deducted, true, 'deductPlayerMoney must return true when sufficient funds');
    assert.equal(ctx.getPlayerMoney(), 50, 'Money must be 50 after deducting 500');
    assert.equal(dom['hud-money'].textContent, '$50', 'HUD must display $50');

    const failedDeduct = ctx.deductPlayerMoney(100);
    assert.equal(failedDeduct, false, 'deductPlayerMoney must return false when insufficient funds');
    assert.equal(ctx.getPlayerMoney(), 50, 'Money must remain unchanged on failed deduction');

    // Set money
    ctx.setPlayerMoney(100);
    assert.equal(ctx.getPlayerMoney(), 100, 'Money must be 100');
    assert.equal(dom['hud-money'].textContent, '$100', 'HUD must display $100');

    // No halving money on player death: 100 remains 100
    ctx.onPlayerDeath();
    assert.equal(ctx.getPlayerMoney(), 100, 'Money must not be halved on death');
    assert.equal(dom['hud-money'].textContent, '$100', 'HUD must display $100');

    // Repeated onPlayerDeath call before respawn
    ctx.onPlayerDeath();
    assert.equal(ctx.getPlayerMoney(), 100, 'Money remains unchanged on repeated onPlayerDeath');

    // Death after respawn also preserves money
    ctx.window.playerIsDead = false;
    ctx.onPlayerDeath();
    assert.equal(ctx.getPlayerMoney(), 100, 'Death after respawn preserves full money');
});

test('soldiers.js uses the configured reward on enemy soldier death', () => {
    const soldiersSrc = readScript('soldiers.js');
    assert.ok(soldiersSrc.includes('window.UNIT_KILL_REWARDS.soldier'), 'soldiers.js must read the centralized soldier reward');
    assert.ok(soldiersSrc.includes('addPlayerMoney(reward'), 'soldiers.js must award the configured reward when enemy soldier dies');
    assert.ok(soldiersSrc.includes('this.rewardAwarded = true'), 'soldiers.js must guard against multiple reward calls');
});

test('playerSoldier.js kill notifications use the centralized soldier reward', () => {
    const playerSoldierSrc = readScript('playerSoldier.js');
    assert.ok(!playerSoldierSrc.includes('(+$5)'), 'playerSoldier.js must not hard-code the soldier kill reward');
    assert.ok(playerSoldierSrc.includes('window.UNIT_KILL_REWARDS.soldier'), 'playerSoldier.js must read the centralized soldier reward');
});

test('enemyAI.js uses the centralized tank reward table', () => {
    const enemyAISrc = readScript('enemyAI.js');
    assert.ok(enemyAISrc.includes('window.UNIT_KILL_REWARDS.tank.byArmor[maxHp]'), 'enemyAI.js must read the centralized tank reward');
    assert.ok(enemyAISrc.includes('addPlayerMoney(tankReward'), 'enemyAI.js must call addPlayerMoney with tankReward');
});

test('playerSoldier.js and enemyAI.js trigger onPlayerDeath when player is dead', () => {
    const psSrc = readScript('playerSoldier.js');
    assert.ok(psSrc.includes('onPlayerDeath()'), 'playerSoldier.js must call onPlayerDeath when infantry soldier dies');

    const enemyAISrc = readScript('enemyAI.js');
    assert.ok(enemyAISrc.includes('onPlayerDeath()'), 'enemyAI.js must call onPlayerDeath on knockout modal');
});

test('status bar is simplified without cannon ready or enemies indications', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const miniHudIdx = html.indexOf('id="combat-mini-hud"');
    const closeDivIdx = html.indexOf('</div>', miniHudIdx);
    const hudSnippet = html.slice(miniHudIdx, closeDivIdx);

    assert.ok(!hudSnippet.includes('id="mob-reload"'), 'combat-mini-hud must not include mob-reload');
    assert.ok(!hudSnippet.includes('READY'), 'combat-mini-hud must not include READY label');
    assert.ok(!hudSnippet.includes('id="mob-hits"'), 'combat-mini-hud must not include enemies or mob-hits');
    assert.ok(!hudSnippet.includes('Enemies:'), 'combat-mini-hud must not include Enemies label');
    assert.ok(hudSnippet.includes('id="hud-armor"'), 'combat-mini-hud must retain armor indicator');
    assert.ok(hudSnippet.includes('id="mob-speed"'), 'combat-mini-hud must retain speed indicator');
    assert.ok(hudSnippet.includes('id="hud-money"'), 'combat-mini-hud must retain money indicator');

    const mainSrc = readScript('main.js');
    assert.ok(!mainSrc.includes('mob-reload'), 'main.js must not reference mob-reload');
    assert.ok(!mainSrc.includes('mob-hits'), 'main.js must not reference mob-hits');

    assert.ok(!html.includes('id="hud-zone-label"'), 'top bar must not include hud-zone-label');
    assert.ok(!html.includes('id="hud-zone-icon"'), 'top bar must not include hud-zone-icon');

    const playerSoldierSrc = readScript('playerSoldier.js');
    assert.ok(!playerSoldierSrc.includes('btn-dismount-toggle'), 'playerSoldier.js must not inject btn-dismount-toggle to top bar');
});
