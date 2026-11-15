const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
}

test('index.html contains spawn modal with all tank prices and soldier option', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('id="spawn-modal"'), 'must include spawn-modal');
    assert.ok(html.includes('id="spawn-modal-money"'), 'must include spawn-modal-money');
    assert.ok(html.includes('id="btn-deploy-soldier"'), 'must include btn-deploy-soldier');
    assert.ok(html.includes('id="spawn-soldier-stage"'), 'must include soldier selection stage');
    assert.ok(html.includes('id="spawn-vehicle-stage"'), 'must include vehicle selection stage');
    assert.ok(html.includes('id="btn-spawn-choose-vehicle"'), 'must include continue-to-vehicle button');
    assert.ok(html.includes('id="btn-spawn-back-to-soldier"'), 'must include back-to-soldier button');
    assert.ok(html.includes('data-vehicle-id="bicycle"'), 'bicycle purchase card must be present');
    assert.ok(html.includes('spawn-soldier-deploy-status'), 'soldier deployment price must be displayed');
    assert.ok(html.includes('soldier-price-tag text-xs font-extrabold text-emerald-400 mono">$250</span>'), 'mortar crew price must use vehicle price styling');
    assert.ok(html.includes('Deployable mortar • Explosive shells • 150 m maximum range</p>'), 'mortar description must not include the price');
    assert.ok(html.includes('data-tank-deploy="tiger"'), 'must include tiger option');
    assert.ok(html.includes('data-tank-deploy="sherman"'), 'must include sherman option');
    assert.ok(html.includes('data-tank-deploy="t34"'), 'must include t34 option');
    assert.ok(html.includes('data-tank-deploy="kingtiger"'), 'must include kingtiger option');
    assert.ok(html.includes('data-tank-deploy="pershing"'), 'must include pershing option');
    assert.ok(html.includes('data-tank-deploy="kv2"'), 'must include kv2 option');
    assert.ok(html.includes('id="hud-money" class="text-emerald-400 font-extrabold">$500</strong>'), 'starting money in HUD is $500');
});

test('tankModel.js registers TANK_PRICES with specified values', () => {
    const tankModelSrc = readScript('tankModel.js');
    assert.ok(tankModelSrc.includes('tiger: 800'), 'Tiger price must be 800');
    assert.ok(tankModelSrc.includes('sherman: 500'), 'Sherman price must be 500');
    assert.ok(tankModelSrc.includes('t34: 500'), 'T-34 price must be 500');
    assert.ok(tankModelSrc.includes('kingtiger: 1400'), 'King Tiger price must be 1400');
    assert.ok(tankModelSrc.includes('pershing: 1200'), 'Pershing price must be 1200');
    assert.ok(tankModelSrc.includes('kv2: 1000'), 'KV-2 price must be 1000');
    assert.ok(tankModelSrc.includes('soldier: 0'), 'Soldier price must be 0');
    assert.ok(tankModelSrc.includes('mortar: 250'), 'Mortar crew price must be 250');
    assert.ok(tankModelSrc.includes('bicycle: 400'), 'Bicycle price must be 400');
});

test('deploying a mortar crew charges $250 and rejects insufficient funds', () => {
    const mainSrc = readScript('main.js');
    const soldierPriceStart = mainSrc.indexOf('function getSelectedSoldierPrice()');
    const soldierPriceEnd = mainSrc.indexOf('\nfunction setSpawnModalStage', soldierPriceStart);
    const start = mainSrc.indexOf('function deployAsSoldier(');
    const end = mainSrc.indexOf('\nwindow.deployAsSoldier = deployAsSoldier;', start);
    assert.ok(soldierPriceStart >= 0 && soldierPriceEnd > soldierPriceStart, 'selected soldier price helper must exist');
    assert.ok(start >= 0 && end > start, 'deployAsSoldier must exist');

    const banners = [];
    const window = {
        selectedSoldierType: 'mortar',
        TANK_PRICES: { mortar: 250 },
        money: 500,
        deductPlayerMoney(amount) {
            if (this.money < amount) return false;
            this.money -= amount;
            return true;
        },
        showKillFeedBanner(message) { banners.push(message); },
        tankState: { hasTank: true, isKnockedOut: false, speed: 0, turnRate: 0, x: 0, z: 0 }
    };
    const context = {
        window,
        hideSpawnSelectionModal() {},
        updateSpawnModalUI() {},
        setSpawnModalStage() {}
    };
    vm.runInNewContext(`${mainSrc.slice(soldierPriceStart, soldierPriceEnd)}\n${mainSrc.slice(start, end)}`, context);

    assert.equal(context.deployAsSoldier(), true);
    assert.equal(window.money, 250);
    assert.ok(banners.at(-1).includes('(-$250)'));

    window.money = 100;
    assert.equal(context.deployAsSoldier(), false);
    assert.equal(window.money, 100);
    assert.ok(banners.at(-1).includes('Requires $250'));
});

test('mortar soldier budget disables unaffordable vehicles without charging when returning', () => {
    const mainSrc = readScript('main.js');
    const start = mainSrc.indexOf('function getSpawnPlayerMoney()');
    const end = mainSrc.indexOf('\nfunction deployPurchasedTank', start);
    assert.ok(start >= 0 && end > start, 'spawn budget UI functions must exist');

    function makeVehicle(id) {
        const status = { textContent: '', className: '' };
        return {
            disabled: false,
            status,
            classes: new Set(),
            getAttribute(name) { return name === 'data-vehicle-id' ? id : null; },
            querySelector() { return status; },
            classList: {
                toggle(name, enabled) {
                    if (enabled) this.owner.classes.add(name);
                    else this.owner.classes.delete(name);
                },
                owner: null
            }
        };
    }

    const bicycle = makeVehicle('bicycle');
    const sherman = makeVehicle('sherman');
    bicycle.classList.owner = bicycle;
    sherman.classList.owner = sherman;
    const moneyBadge = { textContent: '' };
    const window = {
        selectedSoldierType: 'mortar',
        TANK_PRICES: { mortar: 250, bicycle: 400, sherman: 500 },
        getPlayerMoney() { return 500; }
    };
    const context = {
        window,
        document: {
            querySelectorAll(selector) {
                if (selector === '.soldier-type-card') return [];
                if (selector === '.spawn-vehicle-card') return [bicycle, sherman];
                return [];
            },
            getElementById(id) {
                if (id === 'spawn-modal-money') return moneyBadge;
                return null;
            }
        }
    };
    vm.runInNewContext(`${mainSrc.slice(start, end)}`, context);

    context.updateSpawnModalUI();
    assert.equal(moneyBadge.textContent, '$250');
    assert.equal(bicycle.disabled, true);
    assert.equal(sherman.disabled, true);
    assert.match(sherman.status.textContent, /Need \$250 more/);

    window.selectedSoldierType = 'smg';
    context.updateSpawnModalUI();
    assert.equal(moneyBadge.textContent, '$500');
    assert.equal(sherman.disabled, false);
    assert.equal(window.getPlayerMoney(), 500, 'previewing and returning must not spend money');
});

test('tank deployment charges mortar and vehicle together only after affordability check', () => {
    const mainSrc = readScript('main.js');
    const soldierPriceStart = mainSrc.indexOf('function getSelectedSoldierPrice()');
    const soldierPriceEnd = mainSrc.indexOf('\nfunction setSpawnModalStage', soldierPriceStart);
    const start = mainSrc.indexOf('function deployPurchasedTank(');
    const end = mainSrc.indexOf('\nwindow.deployPurchasedTank = deployPurchasedTank;', start);
    assert.ok(start >= 0 && end > start, 'deployPurchasedTank must exist');

    const window = {
        selectedSoldierType: 'mortar',
        TANK_PRICES: { mortar: 250, sherman: 500 },
        money: 500,
        tankState: {},
        deductPlayerMoney(amount) {
            if (this.money < amount) return false;
            this.money -= amount;
            return true;
        },
        showKillFeedBanner() {}
    };
    const context = {
        window,
        hideSpawnSelectionModal() {},
        updateSpawnModalUI() {}
    };
    vm.runInNewContext(`${mainSrc.slice(soldierPriceStart, soldierPriceEnd)}\n${mainSrc.slice(start, end)}`, context);

    assert.equal(context.deployPurchasedTank('sherman'), false);
    assert.equal(window.money, 500, 'failed combined purchase must not deduct funds');
    window.money = 900;
    assert.equal(context.deployPurchasedTank('sherman'), true);
    assert.equal(window.money, 150, 'successful deployment charges vehicle and soldier once');
});

test('physics.js sets starting money to 500 and preserves funds on death', () => {
    const physicsSrc = readScript('physics.js');
    assert.ok(physicsSrc.includes('var playerMoney = 500;'), 'starting playerMoney must be 500');
    assert.ok(physicsSrc.includes('money: 500'), 'tankState initial money must be 500');
    assert.ok(physicsSrc.includes('deductPlayerMoney'), 'physics.js must define deductPlayerMoney');
    assert.ok(!physicsSrc.includes('Math.floor(current / 2)'), 'onPlayerDeath must not halve money');
});

test('controls.js has removed keys 1-6 tank switching', () => {
    const controlsSrc = readScript('controls.js');
    assert.ok(!controlsSrc.includes("k === '1'"), 'controls.js must not bind Key 1 to tank switching');
    assert.ok(!controlsSrc.includes("k === '2'"), 'controls.js must not bind Key 2 to tank switching');
    assert.ok(!controlsSrc.includes("k === '3'"), 'controls.js must not bind Key 3 to tank switching');
    assert.ok(!controlsSrc.includes("k === '4'"), 'controls.js must not bind Key 4 to tank switching');
    assert.ok(!controlsSrc.includes("k === '5'"), 'controls.js must not bind Key 5 to tank switching');
    assert.ok(!controlsSrc.includes("k === '6'"), 'controls.js must not bind Key 6 to tank switching');
});

test('main.js exports deployment functions', () => {
    const mainSrc = readScript('main.js');
    assert.ok(mainSrc.includes('showSpawnSelectionModal'), 'main.js must define showSpawnSelectionModal');
    assert.ok(mainSrc.includes('hideSpawnSelectionModal'), 'main.js must define hideSpawnSelectionModal');
    assert.ok(mainSrc.includes('deployPurchasedTank'), 'main.js must define deployPurchasedTank');
    assert.ok(mainSrc.includes('deployAsSoldier'), 'main.js must define deployAsSoldier');
});
