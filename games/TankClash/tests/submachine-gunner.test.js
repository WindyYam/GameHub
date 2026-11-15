const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
}

test('index.html provides top soldier type selection and bottom tank or none deployment', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    // Modal structure
    assert.ok(html.includes('id="spawn-modal"'), 'Modal must exist');
    assert.ok(html.includes('id="spawn-soldier-type-list"'), 'Top section must have soldier type list');
    assert.ok(html.includes('data-soldier-type="rifle"'), 'Must have Rifleman soldier option');
    assert.ok(html.includes('data-soldier-type="smg"'), 'Must have Submachine Gunner soldier option');
    assert.ok(html.includes('Submachine Gunner'), 'Must display Submachine Gunner title');

    // Bottom section: tank or none
    assert.ok(html.includes('id="btn-deploy-soldier"'), 'Bottom section must have None (deploy on foot) button');
    assert.ok(html.includes('None (Deploy on Foot)'), 'Button text must specify None / Deploy on Foot');
    assert.ok(html.includes('id="spawn-vehicle-list"'), 'Bottom section must have vehicle list for tanks');
    assert.ok(html.includes('data-tank-deploy="sherman"'), 'Must include tank deployment cards');
});

test('soldiers.js defines submachine gun builder for all campaigns and supports SMG soldier rig', () => {
    const soldiersSrc = readScript('soldiers.js');

    // Submachine gun builder for all campaigns (US Thompson, Soviet PPSh-41, German MP 40)
    assert.ok(soldiersSrc.includes('function buildSubmachineGun(faction)'), 'Must define buildSubmachineGun(faction)');
    assert.ok(soldiersSrc.includes("faction === 'us'"), 'SMG builder must handle US campaign');
    assert.ok(soldiersSrc.includes("faction === 'soviet'"), 'SMG builder must handle Soviet campaign');
    assert.ok(soldiersSrc.includes('thompson') || soldiersSrc.includes('Thompson'), 'US SMG must model Thompson');
    assert.ok(soldiersSrc.includes('ppsh41') || soldiersSrc.includes('PPSh-41'), 'Soviet SMG must model PPSh-41');
    assert.ok(soldiersSrc.includes('mp40') || soldiersSrc.includes('MP 40'), 'German SMG must model MP 40');

    // buildSoldierRaw and buildSoldier support soldierType
    assert.ok(soldiersSrc.includes('function buildSoldierRaw(faction, soldierType'), 'buildSoldierRaw must accept soldierType parameter');
    assert.ok(soldiersSrc.includes('function buildSoldier(faction, soldierType'), 'buildSoldier must accept soldierType parameter');

    // SoldierAI fires machine gun (playMG34Shot) when soldierType is SMG
    assert.ok(soldiersSrc.includes('playMG34Shot'), 'Submachine gunners must fire machine gun sound same as tank machine gun');
    assert.ok(soldiersSrc.includes("type: 'smg'") || soldiersSrc.includes("soldierType: 'smg'"), 'Escort soldiers must include submachine gunners');
});

test('playerSoldier.js implements rapid machine gun fire for submachine gunner same as tank MG', () => {
    const psSrc = readScript('playerSoldier.js');

    // Firing function for SMG
    assert.ok(psSrc.includes('function firePlayerSMGRound()'), 'Must define firePlayerSMGRound');
    assert.ok(psSrc.includes('playerSoldier.fireCooldown = 0.075'), 'SMG fire rate must match tank machine gun cooldown 0.075s');
    assert.ok(psSrc.includes('playMG34Shot'), 'SMG fire must use playMG34Shot audio, same as tank machine gun');
    assert.ok(psSrc.includes('window.isFiringSoldierWeapon'), 'updatePlayerSoldier must support continuous fire while button held');
    assert.ok(psSrc.includes('SMG MG'), 'syncInfantryUI must indicate SMG MG weapon');
});

test('controls.js binds LMB, F key, and mobile buttons to continuous soldier fire', () => {
    const controlsSrc = readScript('controls.js');

    assert.ok(controlsSrc.includes('window.isFiringSoldierWeapon = true'), 'LMB/controls must set isFiringSoldierWeapon on active fire');
    assert.ok(controlsSrc.includes('window.isFiringSoldierWeapon = false'), 'Mouseup/keyup/blur must reset isFiringSoldierWeapon');
});

test('main.js handles soldier class selection and deployment flow', () => {
    const mainSrc = readScript('main.js');

    assert.ok(mainSrc.includes('selectSoldierType'), 'main.js must define selectSoldierType');
    assert.ok(mainSrc.includes('window.selectedSoldierType'), 'main.js must manage window.selectedSoldierType');
    assert.ok(mainSrc.includes('.soldier-type-card'), 'initSpawnModal must bind soldier type cards');
    assert.ok(mainSrc.includes('deployAsSoldier'), 'main.js must define deployAsSoldier');
    assert.ok(mainSrc.includes('deployPurchasedTank'), 'main.js must define deployPurchasedTank');
});

test('submachine gunner implements faster heat up mechanism than tank MG and blocks on overheat', () => {
    const psSrc = readScript('playerSoldier.js');
    const physicsSrc = readScript('physics.js');

    // Tank MG heat accumulation (+1.8 per shot in physics.js)
    assert.ok(physicsSrc.includes('tankState.mgHeat = Math.min(100, tankState.mgHeat + 1.8)'), 'Tank MG must accumulate +1.8 heat per shot');

    // SMG heat accumulation in playerSoldier.js (accumulates faster: +3.6 per shot)
    assert.ok(psSrc.includes('smgHeat'), 'playerSoldier.js must track smgHeat');
    assert.ok(psSrc.includes('playerSoldier.smgHeat = Math.min(100, (playerSoldier.smgHeat || 0) + 3.6)'), 'SMG must heat up faster (+3.6 per shot, 2x tank rate)');

    // Overheat block: cannot fire when heat >= 100
    assert.ok(psSrc.includes('(playerSoldier.smgHeat || 0) >= 100'), 'SMG must block firing when heat >= 100');

    // Cooling down: dissipates heat when not firing
    assert.ok(psSrc.includes('s.smgHeat = Math.max(0, (s.smgHeat || 0) - 25 * dt)'), 'SMG must cool down when not firing');
});

test('submachine gunner has much worse accuracy than rifle and tank MG', () => {
    const psSrc = readScript('playerSoldier.js');
    const soldiersSrc = readScript('soldiers.js');

    // Player SMG spread is substantially wider than rifle (0.005)
    assert.ok(psSrc.includes('spreadH = 0.072') || psSrc.includes('spreadH = 0.07'), 'Player SMG must have wide conical spread (> 0.07)');
    assert.ok(psSrc.includes('heatBloom'), 'Player SMG must incorporate heat bloom under sustained fire');

    // SoldierAI SMG accuracy has wider dispersion
    assert.ok(soldiersSrc.includes('spreadH = isSMG ? 0.16 : 0.07'), 'AI SMG must have wider spread than rifle');
});

test('index.html and HUD telemetry display SMG heat gauge and overheat alerts', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const psSrc = readScript('playerSoldier.js');

    assert.ok(html.includes('id="hud-soldier-heat"'), 'index.html must include hud-soldier-heat indicator');
    assert.ok(html.includes('id="hud-soldier-heat-container"'), 'index.html must include heat container');
    assert.ok(psSrc.includes('OVERHEAT!'), 'playerSoldier.js must display OVERHEAT alert on high heat');
});

test('handleCombat and startSoldierDeathAnimation safely execute without ReferenceError or null dereference', () => {
    const soldiersSrc = readScript('soldiers.js');
    const psSrc = readScript('playerSoldier.js');

    // handleCombat definition must declare isSMG so hitting an enemy soldier does not throw ReferenceError
    const handleCombatIdx = soldiersSrc.indexOf('handleCombat(dt, distToPlayer) {');
    assert.ok(handleCombatIdx > 0, 'soldiers.js must define handleCombat');
    const handleCombatBlock = soldiersSrc.slice(handleCombatIdx, handleCombatIdx + 600);
    assert.ok(handleCombatBlock.includes('const isSMG ='), 'handleCombat must define isSMG locally');

    // startSoldierDeathAnimation must safely check joint existence before accessing coordinates
    assert.ok(psSrc.includes('function addPose(') || psSrc.includes('safePush'), 'startSoldierDeathAnimation must safely check joint existence');
});
