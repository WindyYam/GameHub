const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const indexHtmlPath = path.join(__dirname, '../index.html');
const networkJsPath = path.join(__dirname, '../js/network.js');
const physicsJsPath = path.join(__dirname, '../js/physics.js');
const mainJsPath = path.join(__dirname, '../js/main.js');

test('index.html contains multiplayer modal, scoreboard overlay, and HUD action buttons', () => {
    const html = fs.readFileSync(indexHtmlPath, 'utf8');

    // Buttons
    assert.ok(html.includes('id="btn-multiplayer"'), 'Should have MP Lobby HUD button');
    assert.ok(html.includes('id="btn-scoreboard"'), 'Should have Scoreboard HUD button');

    // Modals
    assert.ok(html.includes('id="multiplayer-modal"'), 'Should include multiplayer modal');
    assert.ok(html.includes('id="scoreboard-overlay"'), 'Should include scoreboard overlay');

    // Lobby Elements
    assert.ok(html.includes('id="mp-callsign-input"'), 'Should have player name/callsign input');
    assert.ok(html.includes('id="btn-mp-dice-callsign"'), 'Should have randomize callsign button');
    assert.ok(html.includes('id="mp-tab-btn-host"'), 'Should have host game tab');
    assert.ok(html.includes('id="mp-tab-btn-join"'), 'Should have join game tab');
    assert.ok(html.includes('id="mp-mode-card-coop"'), 'Should have Co-op mode selector card');
    assert.ok(html.includes('id="mp-mode-card-pvp"'), 'Should have PvP mode selector card');
    assert.ok(html.includes('id="mp-host-code-display"'), 'Should have host room code display');
    assert.ok(html.includes('id="btn-mp-copy-code"'), 'Should have copy room code button');
    assert.ok(html.includes('id="mp-join-code-input"'), 'Should have join room code input');

    // Scripts
    assert.ok(html.includes('peerjs.min.js'), 'Should include peerjs.min.js');
    assert.ok(html.includes('network.js'), 'Should include network.js');
});

test('network.js configures Google Free STUN servers and room code generation', () => {
    const code = fs.readFileSync(networkJsPath, 'utf8');

    // Google Free STUN servers & PeerJS default TURN fallback
    assert.ok(code.includes('stun:stun.l.google.com:19302'), 'Must include Google primary STUN server');
    assert.ok(code.includes('stun:stun1.l.google.com:19302'), 'Must include Google secondary STUN server');
    assert.ok(code.includes('turn:eu-0.turn.peerjs.com:3478'), 'Must include PeerJS EU TURN fallback');
    assert.ok(code.includes('turn:us-0.turn.peerjs.com:3478'), 'Must include PeerJS US TURN fallback');

    // Room code structure: TC-XXXX
    assert.ok(code.includes('TC-'), 'Must generate host room code with TC- prefix');
    assert.ok(code.includes('generateRoomCode'), 'Must define generateRoomCode function');

    // Modes
    assert.ok(code.includes('coop'), 'Must support coop mode');
    assert.ok(code.includes('pvp'), 'Must support pvp mode');

    // Callsign management
    assert.ok(code.includes('tankclash_player_callsign'), 'Must persist callsign in localStorage');
});

test('network.js defines NetworkManager, RemotePlayer with billboard 3D nameplates, and state synchronization', () => {
    // Setup mock browser environment
    global.window = {
        scene: { add: () => {}, remove: () => {} },
        document: {
            createElement: (tag) => {
                if (tag === 'canvas') {
                    return {
                        width: 256,
                        height: 64,
                        getContext: () => ({
                            clearRect: () => {},
                            beginPath: () => {},
                            moveTo: () => {},
                            lineTo: () => {},
                            quadraticCurveTo: () => {},
                            closePath: () => {},
                            fill: () => {},
                            stroke: () => {},
                            fillText: () => {}
                        })
                    };
                }
                return {
                    addEventListener: () => {},
                    classList: { add: () => {}, remove: () => {}, contains: () => false }
                };
            },
            getElementById: () => null,
            addEventListener: () => {}
        },
        localStorage: {
            store: {},
            getItem(k) { return this.store[k] || null; },
            setItem(k, v) { this.store[k] = v; }
        },
        performance: { now: () => 1000 },
        THREE: {
            Group: class {
                constructor() { this.position = { set: () => {}, x: 0, y: 0, z: 0 }; this.rotation = { y: 0 }; }
                add() {}
                remove() {}
            },
            Vector3: class {
                constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
                clone() { return new global.window.THREE.Vector3(this.x, this.y, this.z); }
                normalize() { return this; }
            },
            CanvasTexture: class {
                constructor() { this.needsUpdate = false; }
                dispose() {}
            },
            SpriteMaterial: class {},
            Sprite: class {
                constructor() { this.scale = { set: () => {} }; this.position = { set: () => {} }; }
            },
            LinearFilter: 1
        }
    };
    global.document = global.window.document;
    global.localStorage = global.window.localStorage;
    global.THREE = global.window.THREE;
    global.navigator = { clipboard: { writeText: async () => {} } };

    // Execute network.js
    const netSource = fs.readFileSync(networkJsPath, 'utf8');
    eval(netSource);

    assert.ok(global.window.networkManager, 'networkManager must be exported to window');
    assert.ok(global.window.multiplayerState, 'multiplayerState must be exported to window');

    // Test callsign
    assert.ok(global.window.multiplayerState.callsign, 'Should have initial callsign');
    const customName = 'AceTiger_99';
    global.window.multiplayerState.callsign = customName;
    assert.strictEqual(global.window.multiplayerState.callsign, customName);

    // Test modes
    assert.strictEqual(global.window.multiplayerState.gameMode, 'coop');
    global.window.multiplayerState.gameMode = 'pvp';
    assert.strictEqual(global.window.multiplayerState.gameMode, 'pvp');

    // Test stats tracking
    assert.strictEqual(global.window.multiplayerState.stats.kills, 0);
    assert.strictEqual(global.window.multiplayerState.stats.deaths, 0);
    assert.strictEqual(global.window.multiplayerState.stats.score, 0);
});

test('physics.js integrates network weapon fire events and PvP remote player hit testing', () => {
    const physicsCode = fs.readFileSync(physicsJsPath, 'utf8');

    // Cannon fire packet dispatch
    assert.ok(physicsCode.includes('networkManager.sendFireCannon'), 'physics.js should dispatch sendFireCannon');

    // Machine gun tracer dispatch
    assert.ok(physicsCode.includes('networkManager.sendFireMG'), 'physics.js should dispatch sendFireMG');

    // Mortar shell dispatch
    assert.ok(physicsCode.includes('networkManager.sendFireMortar'), 'physics.js should dispatch sendFireMortar');

    // Rocket dispatch
    assert.ok(physicsCode.includes('networkManager.sendFireRocket'), 'physics.js should dispatch sendFireRocket');

    // PvP collision test against remote players
    assert.ok(physicsCode.includes("type: 'remotePlayer'"), 'physics.js should register hits on remote players');
    assert.ok(physicsCode.includes('networkManager.sendDamageToPlayer'), 'physics.js should send damage to remote player');
});

test('main.js updates network manager state every simulation frame', () => {
    const mainCode = fs.readFileSync(mainJsPath, 'utf8');
    assert.ok(mainCode.includes('networkManager.update(dt)'), 'main.js must update networkManager each frame');
});

test('network.js syncs host worldSeed and worldZone on welcome and calls restartGame on client', () => {
    const netSource = fs.readFileSync(networkJsPath, 'utf8');
    assert.ok(netSource.includes('worldSeed: window.currentSeed'), 'Host welcome packet must include worldSeed');
    assert.ok(netSource.includes('worldZone:'), 'Host welcome packet must include worldZone');
    assert.ok(netSource.includes('window.restartGame(pkg.worldSeed, pkg.worldZone)'), 'Client must regenerate map with host worldSeed and worldZone');

    // Behavioral check: simulate welcome packet triggering restartGame
    let restartedArgs = null;
    global.window = {
        scene: { add: () => {}, remove: () => {} },
        document: {
            createElement: () => ({
                width: 256,
                height: 64,
                getContext: () => ({
                    clearRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
                    quadraticCurveTo: () => {}, closePath: () => {}, fill: () => {}, stroke: () => {}, fillText: () => {}
                })
            }),
            getElementById: () => null,
            addEventListener: () => {}
        },
        localStorage: { store: {}, getItem() { return null; }, setItem() {} },
        performance: { now: () => 1000 },
        restartGame: (seed, zone) => { restartedArgs = { seed, zone }; },
        THREE: {
            Group: class { constructor() { this.position = { set: () => {} }; this.rotation = {}; } add() {} remove() {} },
            Vector3: class { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } clone() { return this; } normalize() { return this; } },
            Quaternion: class { setFromUnitVectors() { return this; } },
            CanvasTexture: class { constructor() { this.needsUpdate = false; } dispose() {} },
            SpriteMaterial: class {},
            Sprite: class { constructor() { this.scale = { set: () => {} }; this.position = { set: () => {} }; } },
            LinearFilter: 1
        }
    };
    global.document = global.window.document;
    global.localStorage = global.window.localStorage;
    global.THREE = global.window.THREE;
    global.navigator = { clipboard: { writeText: async () => {} } };

    eval(netSource);

    global.window.networkManager.handlePacket({
        type: 'welcome',
        gameMode: 'coop',
        hostName: 'HostAce',
        worldSeed: 543210,
        worldZone: 'desert'
    }, 'host-peer-id');

    assert.deepStrictEqual(restartedArgs, { seed: 543210, zone: 'desert' });
});

test('remote weapon fire in Co-op mode does not re-broadcast or cause infinite effect loop', () => {
    const netSource = fs.readFileSync(networkJsPath, 'utf8');
    const physicsSource = fs.readFileSync(physicsJsPath, 'utf8');
    const soldiersSource = fs.readFileSync(path.join(__dirname, '../js/soldiers.js'), 'utf8');

    // Verify physics.js guards against re-broadcasting remote and AI fire
    assert.ok(physicsSource.includes('options.isRemote || options.isAI'), 'spawnTracerRound must not broadcast remote or AI tracers');
    assert.ok(physicsSource.includes('isRemoteProjectile'), 'Mortar and rocket spawners must not broadcast remote projectiles');
    assert.ok(soldiersSource.includes('isAI: true'), 'AI soldiers must tag tracers with isAI: true');

    // Behavioral check: onRemoteFireMG / Mortar / Rocket pass isRemote: true and never call sendFire*
    let mgCalls = [];
    let mortarCalls = [];
    let rocketCalls = [];
    let rebroadcastCount = 0;

    global.window = {
        scene: { add: () => {}, remove: () => {} },
        document: {
            createElement: () => ({
                width: 256, height: 64,
                getContext: () => ({
                    clearRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
                    quadraticCurveTo: () => {}, closePath: () => {}, fill: () => {}, stroke: () => {}, fillText: () => {}
                })
            }),
            getElementById: () => null,
            addEventListener: () => {}
        },
        localStorage: { store: {}, getItem() { return null; }, setItem() {} },
        performance: { now: () => 1000 },
        spawnTracerRound: (pos, dir, quat, isEnemy, opts) => { mgCalls.push({ isEnemy, opts }); },
        spawnPlayerMortarShell: (pos, dir, owner) => { mortarCalls.push(owner); },
        spawnPlayerRocket: (pos, dir, owner) => { rocketCalls.push(owner); },
        THREE: {
            Group: class { constructor() { this.position = { set: () => {} }; this.rotation = {}; } add() {} remove() {} },
            Vector3: class { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } clone() { return this; } normalize() { return this; } },
            Quaternion: class { setFromUnitVectors() { return this; } },
            CanvasTexture: class { constructor() { this.needsUpdate = false; } dispose() {} },
            SpriteMaterial: class {},
            Sprite: class { constructor() { this.scale = { set: () => {} }; this.position = { set: () => {} }; } },
            LinearFilter: 1
        }
    };
    global.document = global.window.document;
    global.localStorage = global.window.localStorage;
    global.THREE = global.window.THREE;
    global.navigator = { clipboard: { writeText: async () => {} } };

    eval(netSource);

    global.window.multiplayerState.isActive = true;
    global.window.multiplayerState.gameMode = 'coop';
    global.window.multiplayerState.peerId = 'local-peer';
    global.window.networkManager.broadcast = () => { rebroadcastCount++; };

    global.window.networkManager.onRemoteFireMG({ shooterId: 'remote-peer', pos: { x: 1, y: 2, z: 3 }, dir: { x: 0, y: 0, z: 1 } });
    global.window.networkManager.onRemoteFireMortar({ shooterId: 'remote-peer', pos: { x: 1, y: 2, z: 3 }, dir: { x: 0, y: 1, z: 0 } });
    global.window.networkManager.onRemoteFireRocket({ shooterId: 'remote-peer', pos: { x: 1, y: 2, z: 3 }, dir: { x: 0, y: 0, z: 1 } });

    assert.strictEqual(mgCalls.length, 1);
    assert.strictEqual(mgCalls[0].isEnemy, false);
    assert.strictEqual(mgCalls[0].opts.isRemote, true);
    assert.strictEqual(mortarCalls.length, 1);
    assert.strictEqual(mortarCalls[0].isRemote, true);
    assert.strictEqual(rocketCalls.length, 1);
    assert.strictEqual(rocketCalls[0].isRemote, true);
    assert.strictEqual(rebroadcastCount, 0, 'Remote fire handlers must not re-broadcast packets');
});

test('environment destruction and host-authoritative enemy/soldier delta sync minimize traffic', () => {
    const netSource = fs.readFileSync(networkJsPath, 'utf8');
    const envSource = fs.readFileSync(path.join(__dirname, '../js/environment.js'), 'utf8');
    const enemySource = fs.readFileSync(path.join(__dirname, '../js/enemyAI.js'), 'utf8');
    const soldiersSource = fs.readFileSync(path.join(__dirname, '../js/soldiers.js'), 'utf8');

    assert.ok(envSource.includes('sendTreeHit'), 'environment.js must emit sendTreeHit on local tree fall');
    assert.ok(envSource.includes('applyRemoteTreeHit'), 'environment.js must expose applyRemoteTreeHit');
    assert.ok(enemySource.includes('spawnRemoteEnemyTank'), 'enemyAI.js must expose spawnRemoteEnemyTank');
    assert.ok(enemySource.includes('applyRemoteEnemySync'), 'enemyAI.js must expose applyRemoteEnemySync');
    assert.ok(soldiersSource.includes('spawnRemoteSoldier'), 'soldiers.js must expose spawnRemoteSoldier');
    assert.ok(soldiersSource.includes('applyRemoteSoldierSync'), 'soldiers.js must expose applyRemoteSoldierSync');

    const sentPackets = [];
    let treeHitApplied = null;
    let enemySyncApplied = null;

    global.window = {
        scene: { add: () => {}, remove: () => {} },
        document: {
            createElement: () => ({
                width: 256, height: 64,
                getContext: () => ({
                    clearRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
                    quadraticCurveTo: () => {}, closePath: () => {}, fill: () => {}, stroke: () => {}, fillText: () => {}
                })
            }),
            getElementById: () => null,
            addEventListener: () => {}
        },
        localStorage: { store: {}, getItem() { return null; }, setItem() {} },
        performance: { now: () => 1000 },
        activeEnemyTanks: [
            { id: 'zone:enemy:1', tankType: 'tiger', x: 10.12, y: 1.04, z: 20.34, heading: 0.5, turretYaw: 0.1, gunElevation: 0.02, armor: 2, isDestroyed: false }
        ],
        activeSoldiers: [
            { id: 'zone:enemy:1:escort:1', faction: 'german', x: 12.5, y: 1.0, z: 22.5, heading: 0.5, isDead: false }
        ],
        applyRemoteTreeHit: (id, dx, dz, f) => { treeHitApplied = { id, dx, dz, f }; },
        applyRemoteEnemySync: (e) => { enemySyncApplied = e; },
        THREE: {
            Group: class { constructor() { this.position = { set: () => {} }; this.rotation = {}; } add() {} remove() {} },
            Vector3: class { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } clone() { return this; } normalize() { return this; } },
            Quaternion: class { setFromUnitVectors() { return this; } },
            CanvasTexture: class { constructor() { this.needsUpdate = false; } dispose() {} },
            SpriteMaterial: class {},
            Sprite: class { constructor() { this.scale = { set: () => {} }; this.position = { set: () => {} }; } },
            LinearFilter: 1
        }
    };
    global.document = global.window.document;
    global.localStorage = global.window.localStorage;
    global.THREE = global.window.THREE;
    global.navigator = { clipboard: { writeText: async () => {} } };

    eval(netSource);

    global.window.multiplayerState.isActive = true;
    global.window.multiplayerState.isHost = true;
    global.window.networkManager.broadcast = (pkt) => { sentPackets.push(pkt); };

    // First delta sync sends the enemy and soldier
    global.window.networkManager.sendEnemyDeltaSync();
    global.window.networkManager.sendSoldierDeltaSync();
    assert.strictEqual(sentPackets.length, 2);
    assert.strictEqual(sentPackets[0].type, 'enemies_sync');
    assert.strictEqual(sentPackets[1].type, 'soldiers_sync');

    // Second delta sync with no movement sends 0 packets (low traffic!)
    global.window.networkManager.sendEnemyDeltaSync();
    global.window.networkManager.sendSoldierDeltaSync();
    assert.strictEqual(sentPackets.length, 2, 'Unchanged enemies/soldiers must not be re-sent');

    // Client-side packet handling
    global.window.multiplayerState.isHost = false;
    global.window.networkManager.handlePacket({ type: 'env_tree_hit', id: 'chunk_0_0_3', dx: 0.7, dz: 0.7, f: 3.5 }, 'host');
    assert.deepStrictEqual(treeHitApplied, { id: 'chunk_0_0_3', dx: 0.7, dz: 0.7, f: 3.5 });

    global.window.networkManager.handlePacket({ type: 'enemies_sync', e: [['zone:enemy:1', 15, 1, 25, 0.5, 0.1, 0, 2]] }, 'host');
    assert.strictEqual(enemySyncApplied.length, 1);
});

test('grenade throw and enemy soldier fire sync minimal data and infer trajectory/explosion locally', () => {
    const netSource = fs.readFileSync(networkJsPath, 'utf8');
    const playerSoldierSource = fs.readFileSync(path.join(__dirname, '../js/playerSoldier.js'), 'utf8');
    const soldiersSource = fs.readFileSync(path.join(__dirname, '../js/soldiers.js'), 'utf8');

    assert.ok(playerSoldierSource.includes('sendFireGrenade'), 'playerSoldier.js must send grenade throw');
    assert.ok(playerSoldierSource.includes('spawnRemoteGrenade'), 'playerSoldier.js must expose spawnRemoteGrenade');
    assert.ok(soldiersSource.includes('sendSoldierFire'), 'soldiers.js must send host soldier_fire');
    assert.ok(soldiersSource.includes('applyRemoteSoldierFire'), 'soldiers.js must expose applyRemoteSoldierFire');

    let remoteGrenade = null;
    let remoteSoldierFire = null;
    let rebroadcastCount = 0;

    global.window = {
        scene: { add: () => {}, remove: () => {} },
        document: {
            createElement: () => ({
                width: 256, height: 64,
                getContext: () => ({
                    clearRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
                    quadraticCurveTo: () => {}, closePath: () => {}, fill: () => {}, stroke: () => {}, fillText: () => {}
                })
            }),
            getElementById: () => null,
            addEventListener: () => {}
        },
        localStorage: { store: {}, getItem() { return null; }, setItem() {} },
        performance: { now: () => 1000 },
        spawnRemoteGrenade: (pos, vel, isHostile) => { remoteGrenade = { pos, vel, isHostile }; },
        applyRemoteSoldierFire: (id, w, pos, dir) => { remoteSoldierFire = { id, w, pos, dir }; },
        THREE: {
            Group: class { constructor() { this.position = { set: () => {} }; this.rotation = {}; } add() {} remove() {} },
            Vector3: class { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } clone() { return this; } normalize() { return this; } },
            Quaternion: class { setFromUnitVectors() { return this; } },
            CanvasTexture: class { constructor() { this.needsUpdate = false; } dispose() {} },
            SpriteMaterial: class {},
            Sprite: class { constructor() { this.scale = { set: () => {} }; this.position = { set: () => {} }; } },
            LinearFilter: 1
        }
    };
    global.document = global.window.document;
    global.localStorage = global.window.localStorage;
    global.THREE = global.window.THREE;
    global.navigator = { clipboard: { writeText: async () => {} } };

    eval(netSource);

    global.window.multiplayerState.isActive = true;
    global.window.multiplayerState.isHost = false;
    global.window.multiplayerState.gameMode = 'pvp';
    global.window.multiplayerState.peerId = 'client-1';
    global.window.networkManager.broadcast = () => { rebroadcastCount++; };

    global.window.networkManager.handlePacket({
        type: 'fire_grenade',
        shooterId: 'host',
        pos: { x: 1, y: 2, z: 3 },
        vel: { x: 10, y: 12, z: 15 }
    }, 'host');

    assert.deepStrictEqual(remoteGrenade, {
        pos: { x: 1, y: 2, z: 3 },
        vel: { x: 10, y: 12, z: 15 },
        isHostile: true
    });

    global.window.networkManager.handlePacket({
        type: 'soldier_fire',
        id: 'zone:enemy:1:escort:1',
        w: 's',
        pos: { x: 5, y: 1.2, z: 6 },
        dir: { x: 0, y: 0, z: 1 }
    }, 'host');

    assert.deepStrictEqual(remoteSoldierFire, {
        id: 'zone:enemy:1:escort:1',
        w: 's',
        pos: { x: 5, y: 1.2, z: 6 },
        dir: { x: 0, y: 0, z: 1 }
    });
    assert.strictEqual(rebroadcastCount, 0);
});

test('RemotePlayer infers tank terrain tilt and animates soldier combat/movement poses locally', () => {
    const netSource = fs.readFileSync(networkJsPath, 'utf8');
    let posedWeaponArgs = null;

    global.window = {
        scene: { add: () => {}, remove: () => {} },
        document: {
            createElement: () => ({
                width: 256, height: 64,
                getContext: () => ({
                    clearRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
                    quadraticCurveTo: () => {}, closePath: () => {}, fill: () => {}, stroke: () => {}, fillText: () => {}
                })
            }),
            getElementById: () => null,
            addEventListener: () => {}
        },
        localStorage: { store: {}, getItem() { return null; }, setItem() {} },
        performance: { now: () => 1000 },
        getTerrainHeight: (x, z) => z * 0.5, // sloped terrain
        poseSoldierWeapon: (rig, aimDir, heading) => { posedWeaponArgs = { rig, aimDir, heading }; },
        THREE: {
            Group: class { constructor() { this.position = { set: () => {} }; this.rotation = { x: 0, y: 0, z: 0 }; } add() {} remove() {} },
            Vector3: class { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } clone() { return this; } normalize() { return this; } },
            Quaternion: class { setFromUnitVectors() { return this; } },
            CanvasTexture: class { constructor() { this.needsUpdate = false; } dispose() {} },
            SpriteMaterial: class {},
            Sprite: class { constructor() { this.scale = { set: () => {} }; this.position = { set: () => {} }; } },
            LinearFilter: 1
        }
    };
    global.document = global.window.document;
    global.localStorage = global.window.localStorage;
    global.THREE = global.window.THREE;
    global.navigator = { clipboard: { writeText: async () => {} } };

    eval(netSource);

    const rp = global.window.networkManager.getOrCreateRemotePlayer('p2', 'Ally', false);
    rp.mode = 'tank';
    rp.tankModel = {
        tankRoot: { rotation: { y: 0 } },
        hullGroup: { rotation: { x: 0, z: 0 } },
        roadWheelStations: {
            left: [{ x: -1, z: -2 }, { x: -1, z: 2 }],
            right: [{ x: 1, z: -2 }, { x: 1, z: 2 }]
        }
    };
    rp.update(0.1);
    assert.ok(Math.abs(rp.tankModel.hullGroup.rotation.x) > 0.01, 'Remote tank hull must tilt on sloped terrain');

    // Soldier mode pose test
    rp.mode = 'soldier';
    rp.speed = 4.0;
    rp.y = 0;
    rp.soldierRig = {
        root: { rotation: { x: 0, y: 0 } },
        hips: { position: { y: 0.95 } },
        torso: { rotation: { x: 0, y: 0 } },
        head: { rotation: { x: 0, y: 0 } },
        rifle: { parent: null },
        rightArm: { shoulder: { rotation: { set: () => {} } }, elbow: { rotation: { set: () => {} } }, wrist: { attach: () => {}, rotation: { set: () => {} } } },
        rightLeg: { hipJoint: { rotation: { x: 0 } }, kneeJoint: { rotation: { x: 0 } } },
        leftLeg: { hipJoint: { rotation: { x: 0 } }, kneeJoint: { rotation: { x: 0 } } }
    };
    rp.update(0.1);
    assert.strictEqual(rp.soldierRig.torso.rotation.y, -0.40, 'Remote soldier must use bladed combat stance');
    assert.ok(posedWeaponArgs !== null, 'Remote soldier must call poseSoldierWeapon for two-handed grip');
});
