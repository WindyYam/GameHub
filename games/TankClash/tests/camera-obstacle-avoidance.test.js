const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const envSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'environment.js'), 'utf8');
const playerSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'playerSoldier.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');

function setupTestEnvironment() {
    const sandbox = {
        window: {},
        Math,
        THREE: {
            MathUtils: {
                lerp: (v0, v1, t) => v0 + (v1 - v0) * t,
                clamp: (val, min, max) => Math.max(min, Math.min(max, val))
            },
            Vector3: class {
                constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
                clone() { return new sandbox.THREE.Vector3(this.x, this.y, this.z); }
                copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
                set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
                add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
                addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
                normalize() {
                    const len = Math.hypot(this.x, this.y, this.z);
                    if (len > 1e-6) { this.x /= len; this.y /= len; this.z /= len; }
                    return this;
                }
            }
        }
    };
    sandbox.window = sandbox;

    // Extract obstacle collision helpers and attachObstacleBox from environment.js
    const helperStart = envSource.indexOf('function getGeometryFootprint(');
    const helperEnd = envSource.indexOf('// Helper: World-scaled triplanar', helperStart);
    vm.createContext(sandbox);
    vm.runInContext(envSource.slice(helperStart, helperEnd), sandbox);

    return sandbox;
}

test('resolveCameraObstacleCollision pushes camera closer when a solid building obstacle is between player and camera', () => {
    const env = setupTestEnvironment();
    const { resolveCameraObstacleCollision, attachObstacleBox } = env;

    // Building box at (0, 0, 5) with width=4, length=4, height=6
    const mockGeo = {
        boundingBox: { min: { x: -2, y: 0, z: -2 }, max: { x: 2, y: 6, z: 2 } },
        attributes: { position: { count: 4, getX: i => [-2, 2, -2, 2][i], getY: () => 0, getZ: i => [-2, -2, 2, 2][i] } }
    };
    const bldg = attachObstacleBox({ x: 0, y: 0, z: 5, height: 6.0, enterable: false }, mockGeo, 1.0, 0);
    env.worldObstacles = [bldg];

    const playerAnchor = new env.THREE.Vector3(0, 1.5, 0);
    const cameraDesiredPos = new env.THREE.Vector3(0, 2.0, 10); // Desired camera position behind the building

    const camPos = cameraDesiredPos.clone();
    resolveCameraObstacleCollision(playerAnchor, camPos, { pad: 0.2, marginT: 0.08, minSafeT: 0.15 });

    // The camera must be pulled in closer to the player, in front of the building (z < 3)
    assert.ok(camPos.z < 3.0, `Camera z (${camPos.z}) must be pushed in front of building at z=3..7`);
    assert.ok(camPos.z > 0.0, 'Camera z must still stay in front of the player anchor');
});

test('resolveCameraObstacleCollision pushes camera closer when a rock cluster obstacle is between player and camera', () => {
    const env = setupTestEnvironment();
    const { resolveCameraObstacleCollision } = env;

    // Rock obstacle at (10, 0, 10) with multi-circle collision
    const rock = {
        x: 10, y: 0, z: 10, radius: 3.5, height: 4.5,
        collisionCircles: [
            { x: 0, z: 0, r: 2.5 },
            { x: 1.0, z: 0.5, r: 1.8 }
        ]
    };
    env.worldObstacles = [rock];

    const playerAnchor = new env.THREE.Vector3(10, 1.5, 5);
    const cameraDesiredPos = new env.THREE.Vector3(10, 2.0, 15); // Behind rock at z=10

    const camPos = cameraDesiredPos.clone();
    resolveCameraObstacleCollision(playerAnchor, camPos, { pad: 0.2, marginT: 0.08 });

    // Rock starts at z = 10 - 2.5 = 7.5; camera must be pushed closer so z < 7.5
    assert.ok(camPos.z < 7.5, `Camera z (${camPos.z}) must be pushed in front of rock at z=7.5`);
});

test('resolveCameraObstacleCollision pushes camera closer when a knocked-out tank wreck is between player and camera', () => {
    const env = setupTestEnvironment();
    const { resolveCameraObstacleCollision } = env;

    env.worldObstacles = [];
    env.activeEnemyTanks = [
        { isDestroyed: true, x: 0, y: 0, z: -4 }
    ];

    const playerAnchor = new env.THREE.Vector3(0, 1.5, 0);
    const cameraDesiredPos = new env.THREE.Vector3(0, 2.0, -8); // Desired camera behind tank wreck

    const camPos = cameraDesiredPos.clone();
    resolveCameraObstacleCollision(playerAnchor, camPos, { pad: 0.25, marginT: 0.08 });

    // Tank wreck is at z=-4 with radius ~2.4; camera must be pushed closer to player (z > -2.0)
    assert.ok(camPos.z > -2.0, `Camera z (${camPos.z}) must be pushed closer to player in front of wreck`);
});

test('resolveCameraObstacleCollision does not push camera when sightline is clear or passes above a low wall', () => {
    const env = setupTestEnvironment();
    const { resolveCameraObstacleCollision, attachObstacleBox } = env;

    // Low stone wall of height 1.4 at z = 5
    const mockGeo = {
        boundingBox: { min: { x: -5, y: 0, z: -0.3 }, max: { x: 5, y: 1.4, z: 0.3 } },
        attributes: { position: { count: 4, getX: i => [-5, 5, -5, 5][i], getY: () => 0, getZ: i => [-0.3, -0.3, 0.3, 0.3][i] } }
    };
    const wall = attachObstacleBox({ x: 0, y: 0, z: 5, height: 1.4, isWall: true }, mockGeo, 1.0, 0);
    env.worldObstacles = [wall];

    // High camera angle looking down over the wall: anchor at y=1.5, camera at y=5.0
    const playerAnchor = new env.THREE.Vector3(0, 1.5, 0);
    const cameraDesiredPos = new env.THREE.Vector3(0, 5.0, 10); // Ray at z=5 is at y = 3.25 > 1.4 wall height

    const camPos = cameraDesiredPos.clone();
    resolveCameraObstacleCollision(playerAnchor, camPos, { pad: 0.2, marginT: 0.08 });

    // Since ray passes high above the wall, camera should NOT be pushed in
    assert.equal(camPos.x, cameraDesiredPos.x);
    assert.equal(camPos.y, cameraDesiredPos.y);
    assert.equal(camPos.z, cameraDesiredPos.z);
});

test('playerSoldier.js and main.js integrate resolveCameraObstacleCollision for foot, bicycle, and tank camera', () => {
    assert.ok(playerSource.includes('resolveCameraObstacleCollision'), 'playerSoldier.js must integrate camera obstacle resolution');
    assert.ok(mainSource.includes('resolveCameraObstacleCollision'), 'main.js must integrate camera obstacle resolution');
});
