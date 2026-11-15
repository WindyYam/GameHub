const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function readScript(name) {
    return fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
}

test('King Tiger is registered in TANK_SPECS with authentic specifications', () => {
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
    assert.ok(specs.kingtiger, 'kingtiger spec must exist');
    assert.equal(specs.kingtiger.id, 'kingtiger');
    assert.equal(specs.kingtiger.nation, 'Germany');
    assert.equal(specs.kingtiger.flag, '🇩🇪');
    assert.equal(specs.kingtiger.enemyArmor, 3);
    assert.equal(specs.kingtiger.playerArmor, 6);
    assert.equal(specs.kingtiger.cannonDamage, 3);
    assert.equal(specs.kingtiger.gunName, '8.8 cm KwK 43 L/71');
    assert.equal(specs.kingtiger.shellVel, 1000);
    assert.equal(specs.kingtiger.hasMuzzleBrake, true);

    // Verify aliases
    assert.equal(specs.tiger2, specs.kingtiger);
    assert.equal(specs.king_tiger, specs.kingtiger);
});

test('Faction detection identifies King Tiger as German across systems', () => {
    // 1. Check playerSoldier.js
    const playerSoldierSrc = readScript('playerSoldier.js');
    const startPs = playerSoldierSrc.indexOf('function getPlayerFaction()');
    const endPs = playerSoldierSrc.indexOf('function initPlayerSoldierUI()', startPs);
    assert.ok(startPs >= 0 && endPs > startPs);

    const ctxPs = { window: { currentTankId: 'kingtiger' } };
    ctxPs.window = ctxPs;
    vm.createContext(ctxPs);
    vm.runInContext(playerSoldierSrc.slice(startPs, endPs), ctxPs);
    assert.equal(ctxPs.getPlayerFaction(), 'german');

    // 2. Check soldiers.js
    const soldiersSrc = readScript('soldiers.js');
    const startS = soldiersSrc.indexOf('function getFactionsForPlayerTank(');
    const endS = soldiersSrc.indexOf('function clearSoldiers()', startS);
    assert.ok(startS >= 0 && endS > startS);

    const ctxS = {};
    vm.createContext(ctxS);
    vm.runInContext(soldiersSrc.slice(startS, endS), ctxS);
    const factions = ctxS.getFactionsForPlayerTank('kingtiger');
    assert.equal(factions.allied, 'german');
    assert.equal(factions.enemy, 'us');
});

test('tankKingTiger script defines buildKingTigerTank on window', () => {
    const kingTigerSrc = readScript('tankKingTiger.js');
    assert.ok(kingTigerSrc.includes('function buildKingTigerTank'), 'buildKingTigerTank must be defined');
    assert.ok(kingTigerSrc.includes('window.buildKingTigerTank = buildKingTigerTank'), 'buildKingTigerTank must be exported on window');
    assert.ok(kingTigerSrc.includes('Hinterhalt'), 'Ambush camo must be referenced');
    assert.ok(kingTigerSrc.includes("fillText('100'"), 'reference tactical number must be present');
});

test('King Tiger rear hull and side armor overhang their lower edges', () => {
    const source = readScript('tankKingTiger.js');
    class Shape {
        constructor() { this.points = []; }
        moveTo(z, y) { this.points.push({ z, y }); }
        lineTo(z, y) { this.points.push({ z, y }); }
        closePath() {}
    }

    function profile(name, nextDeclaration) {
        const start = source.indexOf(`const ${name} = new THREE.Shape();`);
        const end = source.indexOf(nextDeclaration, start);
        assert.ok(start >= 0 && end > start, `${name} construction must exist`);
        return vm.runInNewContext(`${source.slice(start, end)}\n${name}.points`, {
            THREE: { Shape }
        });

    }

    for (const [name, nextDeclaration] of [
        ['hullShape', 'const hullExtrudeSettings'],
        ['sponsonShape', 'const sponsonGeo']
    ]) {
        const points = profile(name, nextDeclaration);
        const lowerRear = points[0];
        const upperRear = points.filter(p => p.z < 0).reduce((a, b) => a.y > b.y ? a : b);
        assert.ok(upperRear.z < lowerRear.z - 0.5,
            `${name} must extend rearward at the top, not at the bottom`);
    }
});

test('King Tiger front fender has a rounded descending profile over each track', () => {
    const source = readScript('tankKingTiger.js');
    const start = source.indexOf('const fenderShape = new THREE.Shape();');
    const end = source.indexOf('const fenderGeo', start);
    assert.ok(start >= 0 && end > start);
    class Shape {
        constructor() { this.points = []; }
        moveTo(z, y) { this.points.push({ z, y }); }
        lineTo(z, y) { this.points.push({ z, y }); }
        closePath() {}
    }
    const points = vm.runInNewContext(`${source.slice(start, end)}\nfenderShape.points`, {
        THREE: { Shape }
    });
    const top = points.filter(p => p.y > 0.4);
    const front = points.reduce((a, b) => a.z > b.z ? a : b);
    assert.ok(top.length >= 2 && top[1].z - top[0].z >= 0.4, 'broad upper guard');
    assert.ok(front.z > 3.4 && front.y < 0.2, 'front guard drops over the track');
    assert.ok(points.some(p => p.z > 3.2 && p.y > 0.25 && p.y < 0.4),
        'intermediate curved nose');
});

test('King Tiger turret height and roof fittings match its hull proportions', () => {
    const source = readScript('tankKingTiger.js');
    const start = source.indexOf('function createHenschelTurretGeometry()');
    const end = source.indexOf('const turretMesh =', start);
    assert.ok(start >= 0 && end > start);
    class BufferGeometry {
        constructor() { this.attributes = {}; }
        setAttribute(name, attribute) { this.attributes[name] = attribute; }
        computeVertexNormals() {}
    }
    class Float32BufferAttribute {
        constructor(values) { this.array = values; }
    }
    const widthScale = source.match(/const turretWidthScale = ([\d.]+);/);
    assert.ok(widthScale, 'turret width scale must be defined');
    const geometry = vm.runInNewContext(
        `${source.slice(start, end)}\ncreateHenschelTurretGeometry()`,
        { THREE: { BufferGeometry, Float32BufferAttribute }, turretWidthScale: Number(widthScale[1]) }
    );
    const ys = geometry.attributes.position.array.filter((_, index) => index % 3 === 1);
    const xs = geometry.attributes.position.array.filter((_, index) => index % 3 === 0);
    assert.ok(Math.max(...ys) >= 1.05 && Math.max(...ys) <= 1.10,
        'turret roof should be about 1.08 units above the hull');
    const overallHeight = 0.92 + 0.88 + Math.max(...ys) + 0.16;
    assert.ok(overallHeight >= 3.0 && overallHeight <= 3.1,
        'overall height including the cupola should remain proportional');
    assert.ok(Math.max(...xs) - Math.min(...xs) >= 2.28 &&
        Math.max(...xs) - Math.min(...xs) <= 2.4,
        'turret should be slightly wider than its original 2.08-unit body');
    const positions = geometry.attributes.position.array;
    const front = [];
    for (let i = 0; i < 18; i += 3) {
        front.push({ x: positions[i], y: positions[i + 1] });
    }
    const frontBottom = front.filter(p => p.y === 0).map(p => p.x);
    const frontTop = front.filter(p => p.y > 0).map(p => p.x);
    const frontTaper = (Math.max(...frontTop) - Math.min(...frontTop)) /
        (Math.max(...frontBottom) - Math.min(...frontBottom));
    assert.ok(frontTaper >= 0.65 && frontTaper <= 0.72,
        'front plate should taper clearly from its base towards the roof');
    const roofHeightAt = z => Math.max(...positions.filter((_, index) =>
        index % 3 === 1 && positions[index + 1] === z));
    assert.ok(roofHeightAt(-1.95) < roofHeightAt(-1.65) &&
        roofHeightAt(-1.65) < roofHeightAt(0.15),
        'rear roof should rise through its shoulders toward the turret center');
    assert.ok(roofHeightAt(1.28) < roofHeightAt(0.15),
        'front roof should slope down towards the mantlet');
    assert.ok(source.includes('cupolaGroup.position.set(0.36 * turretWidthScale, 1.06, -0.22)'),
        'cupola should sit on the raised turret roof');
    assert.ok(source.includes('gunElevationPivot.position.set(0, 0.54, 1.40)'),
        'gun pivot should stay centered on the taller turret');
});

test('King Tiger rear track wraps around the idler without cutting through its rim', () => {
    const source = readScript('tankKingTiger.js');
    const start = source.indexOf('const KING_TIGER_TRACK_WAYPOINTS = [');
    const end = source.indexOf('const totalWaypoints', start);
    assert.ok(start >= 0 && end > start);
    class Vector2 {
        constructor(x, y) { this.x = x; this.y = y; }
    }
    const points = vm.runInNewContext(
        `${source.slice(start, end)}\nKING_TIGER_TRACK_WAYPOINTS`,
        { THREE: { Vector2 } }
    );
    const match = source.match(/idler\.position\.set\(trackCenterX,\s*([-\d.]+),\s*([-\d.]+)\)/);
    assert.ok(match, 'idler position must be defined');
    const center = { x: Number(match[2]), y: Number(match[1]) };
    assert.ok(center.x - (-3.55) >= 0.7,
        'rear idler must sit forward of the overhanging rear hull');
    const stations = source.match(/const wheelZPositions = \[([^\]]+)\]/);
    assert.ok(stations, 'road wheel stations must be defined');
    const wheelZ = stations[1].split(',').map(Number);
    assert.ok(Math.min(...wheelZ) - center.x >= 0.6,
        'rear road wheel must leave the idler visibly exposed');
    const upperRun = points.findIndex((point, index) => index > 1 && point.x > center.x);
    assert.ok(upperRun > 4, 'track should wrap around the rear and top of the idler');
    for (let i = 1; i < upperRun; i++) {
        const a = points[i];
        const b = points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((center.x - a.x) * dx + (center.y - a.y) * dy) / (dx * dx + dy * dy)));
        const distance = Math.hypot(a.x + t * dx - center.x, a.y + t * dy - center.y);
        assert.ok(distance >= 0.42, `track segment ${i} cuts into the idler rim`);
    }
    assert.ok(points[1].y === -0.92 && points[0].y === -0.92,
        'the road wheel contact run must remain at ground level');
});

test('King Tiger painted armor and steel parts retain distinct metallic finishes', () => {
    const source = readScript('tankKingTiger.js');
    const start = source.indexOf('const armorMat = new THREE.MeshStandardMaterial');
    const end = source.indexOf('const assets = {', start);
    assert.ok(start >= 0 && end > start);
    class Material {
        constructor(options) { Object.assign(this, options); }
    }
    class Vector2 {
        constructor(x, y) { this.x = x; this.y = y; }
    }
    const textures = {};
    for (const name of ['camoTex', 'armorNormalTex', 'zimmeritTex', 'skirtTex',
        'skirtNormalTex', 'castNormalTex', 'trackNormalTex', 'wheelTex',
        'wheelNormalTex', 'decalTex']) {
        textures[name] = { name };
    }
    const materials = vm.runInNewContext(
        `${source.slice(start, end)}\n({ armorMat, gunMat, trackSteelMat, wheelRimMat, wheelFaceMat, decalMat })`,
        { THREE: { MeshStandardMaterial: Material, MeshBasicMaterial: Material, Vector2 }, ...textures }
    );
    assert.equal(materials.armorMat.map, textures.camoTex, 'painted armor retains its camouflage');
    assert.ok(materials.armorMat.metalness >= 0.3 && materials.armorMat.roughness <= 0.55);
    for (const name of ['armorMat', 'gunMat', 'trackSteelMat', 'wheelRimMat', 'wheelFaceMat']) {
        assert.ok(materials[name].envMapIntensity >= 0.8, `${name} reflects the game environment`);
    }
    assert.ok(materials.trackSteelMat.metalness > materials.armorMat.metalness,
        'exposed track steel should be more metallic than painted armor');
    assert.ok(materials.wheelRimMat.metalness > materials.wheelFaceMat.metalness,
        'wheel rims should be more metallic than painted wheel faces');
    assert.equal(materials.decalMat.envMapIntensity, 0.3, 'decals remain subdued');
});

test('King Tiger rear turret has a broad beveled hatch and horizontal spare tracks', () => {
    const source = readScript('tankKingTiger.js');
    const start = source.indexOf('const rearHatchShape = new THREE.Shape();');
    const end = source.indexOf('const rearHatchGeo', start);
    assert.ok(start >= 0 && end > start);
    class Shape {
        constructor() { this.points = []; }
        moveTo(x, y) { this.points.push({ x, y }); }
        lineTo(x, y) { this.points.push({ x, y }); }
        closePath() {}
    }
    const points = vm.runInNewContext(`${source.slice(start, end)}\nrearHatchShape.points`, {
        THREE: { Shape }
    });
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    assert.ok(Math.max(...xs) - Math.min(...xs) >= 0.9, 'hatch should span the rear plate');
    assert.ok(Math.max(...ys) - Math.min(...ys) >= 0.54, 'hatch should fill the rear plate vertically');
    assert.equal(points.length, 8, 'hatch should have beveled corners');
    assert.ok(source.includes('hatchHinge.position.set(0, -0.29, -0.04)'),
        'hatch hinge should run along its lower edge');
    assert.ok(source.includes('for (const zPos of [0.82, -1.22])') &&
        source.includes('for (let row = 0; row < 4; row++)') &&
        source.includes('new THREE.BoxGeometry(0.68, 0.11, 0.06)'),
        'spare tracks should form horizontal banks on the turret sides');
});
