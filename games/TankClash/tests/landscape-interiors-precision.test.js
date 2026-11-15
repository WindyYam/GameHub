const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const envSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'environment.js'), 'utf8').replace(/\r\n/g, '\n');
const enemyAISrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'enemyAI.js'), 'utf8').replace(/\r\n/g, '\n');
const soldiersSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'soldiers.js'), 'utf8').replace(/\r\n/g, '\n');

function extractSection(src, startMarker, endMarker) {
    const start = src.indexOf(startMarker);
    const end = src.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, `Could not find section ${startMarker} -> ${endMarker}`);
    return src.slice(start, end);
}

test('desert sky and fog colors are crisp pale blue (less yellow) with natural sand tones', () => {
    const zoneBlock = extractSection(envSrc, 'const ZONE_CONFIGS = {', 'const ALL_ZONES = [');
    const ctx = vm.createContext({});
    vm.runInContext(`${zoneBlock}; this.ZONE_CONFIGS = ZONE_CONFIGS;`, ctx);

    const desert = ctx.ZONE_CONFIGS.desert;
    const fogR = (desert.fogColor >> 16) & 0xff;
    const fogG = (desert.fogColor >> 8) & 0xff;
    const fogB = desert.fogColor & 0xff;
    assert.ok(fogB > fogR && fogG > fogR, `Desert fog/sky should be cool blue-tinted rather than yellow (got 0x${desert.fogColor.toString(16)})`);

    const skyR = (desert.dayHorizonTint >> 16) & 0xff;
    const skyG = (desert.dayHorizonTint >> 8) & 0xff;
    const skyB = desert.dayHorizonTint & 0xff;
    assert.ok(skyB > skyR && skyG > skyR, `Desert dayHorizonTint should be blue rather than yellow (got 0x${desert.dayHorizonTint.toString(16)})`);
});

test('environment.js defines expanded plant, house, and terrain landscape variety', () => {
    // New flora generators
    const plantFns = [
        'createBirchTreeGeometry',
        'createCypressTreeGeometry',
        'createWillowTreeGeometry',
        'createAlpineLarchGeometry',
        'createJoshuaTreeGeometry',
        'createDesertAgaveGeometry',
        'createPricklyPearGeometry',
        'createWildflowerBushGeometry',
        'createFernClusterGeometry'
    ];
    for (const fn of plantFns) {
        assert.ok(envSrc.includes(`function ${fn}(`), `Missing plant generator: ${fn}`);
    }

    // New enterable house generators
    const houseFns = [
        'buildHollowHouseShell',
        'createVillageTownhouseGeometry',
        'createStoneFarmhouseGeometry',
        'createDesertAdobeHouseGeometry',
        'createAlpineChaletGeometry'
    ];
    for (const fn of houseFns) {
        assert.ok(envSrc.includes(`function ${fn}(`), `Missing house generator: ${fn}`);
    }

    // Check CPU & GPU terrain height functions both include the new landscape features
    assert.ok(envSrc.includes('float terraceStep = smoothstep(0.22, 0.34, mesaNoise)'), 'GPU desert terraceStep missing');
    assert.ok(envSrc.includes('const terraceStep = smoothstep(0.22, 0.34, mesaNoise)'), 'CPU desert terraceStep missing');
    assert.ok(envSrc.includes('float lynchet = smoothstep(2.0, 6.5, bigHills) * 2.4 * hillOuter'), 'GPU hills lynchet missing');
    assert.ok(envSrc.includes('const lynchet = smoothstep(2.0, 6.5, bigHills) * 2.4 * hillOuter'), 'CPU hills lynchet missing');
});

test('new tree foliage cards use alpha-cutout UVs, house shells avoid tiled window UVs, and carpet avoids Z-fighting', () => {
    const newTreesBlock = extractSection(
        envSrc,
        'function createBirchTreeGeometry()',
        'function createDesertAgaveGeometry()'
    );
    // Every createCurvedFoliageCard call in birch, cypress, willow, larch, and joshua must map to vMin = 0.52 (Q0/Q1 alpha cutout), never vMin = 0.02 (Q2/Q3 opaque)
    const cardMatches = [...newTreesBlock.matchAll(/createCurvedFoliageCard\([^)]+\)/g)].map(m => m[0]);
    assert.ok(cardMatches.length >= 6, 'Expected at least 6 createCurvedFoliageCard calls across the new tree generators');
    for (const call of cardMatches) {
        assert.ok(
            call.includes('0.52, 0.98)') && !call.includes('0.02, 0.48)'),
            `Foliage card must use alpha-cutout upper atlas quadrants (v: 0.52..0.98), got: ${call}`
        );
    }

    // buildHollowHouseShell must default to Village Atlas Q2 (v0: 0.02, v1: 0.48) so walls don't tile painted windows
    const houseShellBlock = extractSection(
        envSrc,
        'function buildHollowHouseShell(parts, opts)',
        'function createEuropeanCottageGeometry()'
    );
    assert.ok(houseShellBlock.includes('const v0 = opts.v0 !== undefined ? opts.v0 : 0.02;'), 'House shell must default v0 to 0.02 (Q2 masonry)');
    assert.ok(houseShellBlock.includes('const v1 = opts.v1 !== undefined ? opts.v1 : 0.48;'), 'House shell must default v1 to 0.48 (Q2 masonry)');
    assert.ok(houseShellBlock.includes('floorSlab.translate(0, floorY - 0.06, 0);'), 'Floor slab top must sit at floorY (center at floorY - 0.06) to prevent Z-fighting');

    // Interior carpet must sit well above floorY (py >= 0.022)
    const interiorBlock = extractSection(
        envSrc,
        'function loadBuildingInterior(bldg)',
        'function unloadBuildingInterior(bldg)'
    );
    assert.ok(interiorBlock.includes('addFurnPart(rugW, 0.026, rugL, 0, 0.036, -0.2'), 'Interior rug must be elevated above floorY to prevent Z-fighting');

    // Fast GPU shader compilation: getTerrainSurfaceHeight_gpu evaluates getTerrainHeight_gpu once
    const surfBlock = extractSection(
        envSrc,
        'float getTerrainSurfaceHeight_gpu(',
        'function getRoadDistance(x, z)'
    );
    const heightCalls = [...surfBlock.matchAll(/getTerrainHeight_gpu\(/g)];
    assert.equal(heightCalls.length, 1, 'getTerrainSurfaceHeight_gpu should call getTerrainHeight_gpu once for fast D3D11 shader compilation');
});

test('enterable houses allow soldier walk-in through open doorway while blocking walls and tanks', () => {
    const collisionSection = extractSection(
        envSrc,
        'function getGeometryFootprint(geo)',
        'function ensureSharedGeometries()'
    );

    const addedChildren = [];
    const removedChildren = [];
    let disposedCount = 0;

    class MockBufferAttribute {
        constructor(arr, itemSize) {
            this.array = arr;
            this.itemSize = itemSize;
            this.count = arr.length / itemSize;
        }
        getX(i) { return this.array[i * 3]; }
        getY(i) { return this.array[i * 3 + 1]; }
        getZ(i) { return this.array[i * 3 + 2]; }
        setXYZ(i, x, y, z) {
            this.array[i * 3] = x;
            this.array[i * 3 + 1] = y;
            this.array[i * 3 + 2] = z;
        }
        setXY(i, u, v) {
            this.array[i * 2] = u;
            this.array[i * 2 + 1] = v;
        }
    }

    class MockBoxGeometry {
        constructor(w = 1, h = 1, d = 1) {
            const hw = w * 0.5, hh = h * 0.5, hd = d * 0.5;
            const verts = new Float32Array([
                -hw, -hh, -hd,  hw, -hh, -hd,  hw,  hh, -hd, -hw,  hh, -hd,
                -hw, -hh,  hd,  hw, -hh,  hd,  hw,  hh,  hd, -hw,  hh,  hd
            ]);
            const norms = new Float32Array(24);
            const uvs = new Float32Array(16);
            this.attributes = {
                position: new MockBufferAttribute(verts, 3),
                normal: new MockBufferAttribute(norms, 3),
                uv: new MockBufferAttribute(uvs, 2)
            };
            this.index = { array: new Uint32Array([0, 1, 2, 2, 3, 0]), count: 6 };
        }
        translate(dx, dy, dz) {
            const p = this.attributes.position.array;
            for (let i = 0; i < p.length; i += 3) {
                p[i] += dx; p[i + 1] += dy; p[i + 2] += dz;
            }
        }
        rotateY() {}
        computeVertexNormals() {}
        computeBoundingBox() {
            const p = this.attributes.position;
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (let i = 0; i < p.count; i++) {
                minX = Math.min(minX, p.getX(i));
                maxX = Math.max(maxX, p.getX(i));
                minZ = Math.min(minZ, p.getZ(i));
                maxZ = Math.max(maxZ, p.getZ(i));
            }
            this.boundingBox = { min: { x: minX, z: minZ }, max: { x: maxX, z: maxZ } };
        }
        setAttribute(name, attr) { this.attributes[name] = attr; }
        dispose() { disposedCount++; }
    }

    const ctx = vm.createContext({
        window: {},
        Math,
        worldObstacles: [],
        worldBuildings: [],
        currentSeed: 12345,
        GROUND_ENV_MAP_INTENSITY: 0.2,
        createChunkRNG: () => {
            let s = 42;
            return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
        },
        setGeometryUVBox: () => {},
        tintBuildingPart: (g) => g,
        mergeBufferGeometries: (parts) => {
            const g = parts[0] || new MockBoxGeometry(1, 1, 1);
            return g;
        },
        THREE: {
            BoxGeometry: MockBoxGeometry,
            BufferAttribute: MockBufferAttribute,
            MeshStandardMaterial: function () {},
            Mesh: function (geo, mat) {
                this.geometry = geo;
                this.material = mat;
                this.children = [];
                this.add = (c) => { this.children.push(c); addedChildren.push(c); };
                this.remove = (c) => { removedChildren.push(c); };
            }
        }
    });

    vm.runInContext(collisionSection, ctx);

    // Create a mock enterable house geometry (5m wide, 6.6m long, 1.68m doorway on +Z front wall)
    const houseGeo = new MockBoxGeometry(5.0, 3.5, 6.6);
    houseGeo.userData = {
        enterableSpec: { w: 5.0, h: 3.5, l: 6.6, wallThick: 0.34, doorW: 1.68, doorH: 2.45, floorY: 0.16 }
    };
    const houseMesh = new ctx.THREE.Mesh(houseGeo, {});
    const bldg = ctx.attachObstacleBox({
        mesh: houseMesh,
        x: 0,
        y: 0,
        z: 0,
        height: 6.6,
        isRuin: false,
        isWall: false,
        type: 'cottage'
    }, houseGeo, 1.0, 0.0);

    ctx.worldBuildings.push(bldg);
    ctx.worldObstacles.push(bldg);

    assert.equal(bldg.enterable, true, 'House with enterableSpec must be marked enterable');
    assert.equal(bldg.wallBoxes.length, 5, 'Hollow house shell must have 5 wall collision boxes (back, left, right, front-left, front-right)');

    // 1. Soldier (pad = 0.45) walking straight through open doorway at (x = 0, z = 3.15) is NOT pushed out
    const doorwayPush = ctx.obstaclePushOut(bldg, 0, 3.15, 0.45);
    assert.equal(doorwayPush, null, 'Soldier must be able to walk through the open front doorway without collision');

    // 2. Soldier standing inside the center of the house (x = 0, z = 0.8) is NOT pushed out
    const insidePush = ctx.obstaclePushOut(bldg, 0, 0.8, 0.45);
    assert.equal(insidePush, null, 'Soldier must be able to stand inside the hollow house room');

    // 3. Soldier trying to walk through the solid back wall (x = 0, z = -3.2) IS pushed out
    const backWallPush = ctx.obstaclePushOut(bldg, 0, -3.2, 0.45);
    assert.ok(backWallPush !== null, 'Soldier must be blocked by the solid back wall');

    // 4. Soldier trying to walk through the front wall beside the door (x = 1.8, z = 3.2) IS pushed out
    const frontFlankPush = ctx.obstaclePushOut(bldg, 1.8, 3.2, 0.45);
    assert.ok(frontFlankPush !== null, 'Soldier must be blocked by the front wall beside the open doorway');

    // 5. Tank (pad = 2.0) collides with the outer house box even at the doorway
    const tankPush = ctx.obstaclePushOut(bldg, 0, 3.15, 2.0);
    assert.ok(tankPush !== null, 'Tank must still collide with the outer house footprint');

    // 6. Floor height inside the house is elevated above ground (0.04m)
    const floorH = ctx.getBuildingFloorHeight(0, 0, 0);
    assert.ok(floorH > 0.01, 'getBuildingFloorHeight must return elevated interior floor height inside the house');

    // 7. Distance-based procedural interior loading & unloading
    assert.equal(bldg.interiorLoaded, false, 'Interior must start unloaded');

    // Far away (60m): remains unloaded
    ctx.updateBuildingInteriors(0, 60);
    assert.equal(bldg.interiorLoaded, false, 'Interior must remain unloaded when player is far away (60m)');

    // Close in (20m <= 38m): procedurally generates and attaches interior mesh & furniture collision
    ctx.updateBuildingInteriors(0, 20);
    assert.equal(bldg.interiorLoaded, true, 'Interior must load when player closes in (20m)');
    assert.ok(bldg.interiorMesh !== null, 'Procedural interior mesh must be created');
    assert.ok(bldg.interiorBoxes.length >= 3, 'Procedural furniture collision boxes must be populated');
    assert.equal(addedChildren.length, 1, 'Interior mesh must be added to building mesh');

    // Move away (55m > 48m): unloads and disposes interior geometry to save resources
    ctx.updateBuildingInteriors(0, 55);
    assert.equal(bldg.interiorLoaded, false, 'Interior must unload when player moves beyond 48m');
    assert.equal(bldg.interiorMesh, null, 'Interior mesh reference must be cleared on unload');
    assert.equal(bldg.interiorBoxes.length, 0, 'Interior furniture boxes must be cleared on unload');
    assert.ok(disposedCount >= 1, 'Interior geometry must be disposed when unloaded');
});

test('enemy detection range for player tank is larger and enemy precision is improved', () => {
    // 1. enemyAI.js tank detection range for player tank increased (120 * 1.2 = 144m, LOS 155 * 1.2 = 186m)
    assert.ok(
        enemyAISrc.includes('const maxDetectRange = playerShotRecently ? TANK_FIRE_PROVOKE_RANGE : (isInfantry ? 22 * 1.2 : 120 * 1.2);'),
        'enemyAI.js must use larger 120 * 1.2 base detection range for player tank'
    );
    assert.ok(
        enemyAISrc.includes('const hasLOS = (distToPlayer < 155 * 1.2) && clearObstacleSight;'),
        'enemyAI.js must use larger 155 * 1.2 LOS range for player tank'
    );

    // 2. enemyAI.js improved precision (reduced aim error and shell dispersion)
    assert.ok(
        enemyAISrc.includes('e.aimErrorYaw = (Math.random() - 0.5) * (spr * 5.0);'),
        'enemyAI.js must have tighter aimErrorYaw'
    );
    assert.ok(
        enemyAISrc.includes('const shotYaw = e.heading + e.turretYaw + (Math.random() - 0.5) * 0.06;'),
        'enemyAI.js must have tighter shot dispersionYaw'
    );

    // 3. soldiers.js detection range for player tank increased (155 * 1.2 = 186m) and tighter rifle/SMG spread
    assert.ok(
        soldiersSrc.includes('const normalDetectDist = isPlayerOnFoot ? (playerFiredRecently ? 80 : (22 * 1.2)) : (155 * 1.2);'),
        'soldiers.js must use larger 155 * 1.2 detection range for player tank'
    );
    assert.ok(
        soldiersSrc.includes('const spreadH = isSMG ? 0.125 : 0.062;'),
        'soldiers.js must use improved horizontal firing precision'
    );
});
