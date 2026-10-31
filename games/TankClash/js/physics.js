// ============================================================================
// TigerTank Physics, Ballistics & Particle Systems
// Advanced Multi-Stage Volumetric Explosions, Realistic KwK 36 Muzzle Blast,
// Ground Shockwaves, Incandescent Sparks, Air Drag, Buoyancy & CCD Collision
// ============================================================================

var tankState = {
    x: 0,
    z: 0,
    y: 0,
    heading: 0.38,          // Initial three-quarter showcase angle
    speed: 0,               // Forward velocity (m/s)
    turnRate: 0,            // Yaw velocity (rad/s)
    pitch: 0,               // Hull pitch angle (rad)
    pitchVel: 0,
    roll: 0,                // Hull roll angle (rad)
    rollVel: 0,
    heave: 0,               // Vertical hull bounce (m)
    heaveVel: 0,
    leftTrackPhase: 0,
    rightTrackPhase: 0,
    wheelSpinLeft: 0,
    wheelSpinRight: 0,

    // Turret & 8.8cm Gun State
    turretYaw: -0.32,       // Relative to hull
    targetTurretYaw: -0.32,
    gunElevation: 0.035,    // Radians (-8° to +15°)
    targetGunElevation: 0.035,
    MIN_ELEV_RAD: THREE.MathUtils.degToRad(-8.0),
    MAX_ELEV_RAD: THREE.MathUtils.degToRad(15.0),

    // Weapons & Recoil State
    barrelRecoilOffset: 0,
    barrelRecoilVel: 0,
    reloadTimer: 0,
    reloadStage: 0,         // 0: ready, 1: ejecting, 2: sliding, 3: ready to latch
    RELOAD_TIME: 4.8,       // Default KwK 36 reload
    SHELL_VELOCITY: 810,
    CANNON_SPREAD: 0.0003,  // Pinpoint sniper precision
    BLAST_RADIUS: 8.0,      // Blast radius in meters
    BLAST_DAMAGE: 100,      // Base blast damage
    MAX_SPEED: 10.6,
    REVERSE_SPEED: 4.2,
    TURN_SPEED: 1.15,
    RECOIL_OFFSET: 0.56,
    hasMuzzleBrake: true,
    currentTankSpec: null,
    coaxMgCooldown: 0,
    bowMgCooldown: 0,
    bowMgYaw: 0,
    bowMgPitch: 0,
    mgHeat: 0,
    headlightsOn: false,
    hitsCount: 0,
    money: 500,
    isKnockedOut: false
};

// ============================================================================
// MONEY SYSTEM
// Starting funds: $500
// Rewards: Kill soldier +$5, Kill 1 HP tank +$25, 2 HP tank +$30, 3 HP tank +$40
// When died: Funds preserved (no halving)
// ============================================================================
var playerMoney = 500;
var playerIsDead = false;

function updateMoneyHUD() {
    const el = document.getElementById('hud-money');
    if (el) {
        el.textContent = `$${playerMoney}`;
    }
}

function getPlayerMoney() {
    return playerMoney;
}

function setPlayerMoney(val) {
    playerMoney = Math.max(0, Math.floor(Number(val) || 0));
    tankState.money = playerMoney;
    window.playerMoney = playerMoney;
    updateMoneyHUD();
    return playerMoney;
}

function addPlayerMoney(amount, reason = '') {
    if (amount <= 0) return playerMoney;
    playerMoney += Math.floor(amount);
    tankState.money = playerMoney;
    window.playerMoney = playerMoney;
    updateMoneyHUD();
    return playerMoney;
}

function deductPlayerMoney(amount) {
    amount = Math.max(0, Math.floor(Number(amount) || 0));
    if (amount > playerMoney) return false;
    playerMoney -= amount;
    tankState.money = playerMoney;
    window.playerMoney = playerMoney;
    updateMoneyHUD();
    return true;
}

function onPlayerDeath() {
    if (playerIsDead) return;
    playerIsDead = true;
    window.playerIsDead = true;
    // Money is NOT halved on death; player preserves their accumulated funds
    if (typeof window.showKillFeedBanner === 'function') {
        window.showKillFeedBanner(`☠️ KILLED IN ACTION!`);
    }
}

window.playerMoney = playerMoney;
window.playerIsDead = playerIsDead;
window.getPlayerMoney = getPlayerMoney;
window.setPlayerMoney = setPlayerMoney;
window.addPlayerMoney = addPlayerMoney;
window.deductPlayerMoney = deductPlayerMoney;
window.onPlayerDeath = onPlayerDeath;
window.updateMoneyHUD = updateMoneyHUD;

// Active projectiles, VFX particles, shockwaves and dynamic lights
var shells = [];
var tracers = [];
var particles = [];
var dynamicFlashes = [];
var shockwaves = [];
const dynamicFlashPool = [];
const shockwavePool = [];
const particleDirection = new THREE.Vector3();
const PARTICLE_DIRECTION_AXIS = new THREE.Vector3(0, 0, 1);
const DYNAMIC_FLASH_POOL_SIZE = 2;
const DYNAMIC_FLASH_IDLE_INTENSITY = 0.00001;

// Shared particle geometries for high performance
const sphereParticleGeo = new THREE.DodecahedronGeometry(1, 1);
const sparkParticleGeo  = new THREE.BoxGeometry(0.12, 0.12, 0.35);
const shockwaveGeo      = new THREE.RingGeometry(0.2, 1.0, 32);
shockwaveGeo.rotateX(-Math.PI / 2);
const shellCoreGeo = new THREE.CylinderGeometry(0.048, 0.048, 1.4, 8);
const shellFlameGeo = new THREE.CylinderGeometry(0.075, 0.02, 2.4, 8);
const tracerGeo = new THREE.CylinderGeometry(0.024, 0.024, 1.8, 6);
const shellCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
const shellFlameMaterial = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending
});
const tracerMaterial = new THREE.MeshBasicMaterial({ color: 0xfb923c });
const shellPool = [];
const tracerPool = [];
const PROJECTILE_POOL_LIMIT = 64;

// Reusable smoke particle pool for zero runtime garbage collection
const smokePool = [];
window.smokePool = smokePool;
const reusableParticlePools = new Map();
// Reusable volumetric dust particle pool for realistic track dust plumes & blast shockwaves
const dustPool = [];
window.dustPool = dustPool;
let _dirtClodGeo = null;
function createDirtClodGeometry() {
    if (_dirtClodGeo) return _dirtClodGeo;
    const geo = new THREE.DodecahedronGeometry(0.85, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const len = Math.hypot(x, y, z) || 1.0;
        const disp = 0.72 + (Math.sin(x * 6.5 + y * 11.2) * Math.cos(z * 7.4) * 0.5 + 0.5) * 0.56;
        pos.setXYZ(i, (x / len) * disp, (y / len) * disp * 0.82, (z / len) * disp * 1.15);
    }
    geo.computeVertexNormals();
    _dirtClodGeo = geo;
    return geo;
}

const PARTICLE_POOL_LIMIT = 128;
let particlePoolsPrewarmed = false;

function getParticlePoolKey(type, isAdditive) {
    return `${type}:${isAdditive ? 1 : 0}`;
}

function createParticleObject(type, isAdditive, colorHex) {
    const isSpark = type === 'spark';
    const isDirt  = type === 'dirt';
    const isFire  = type === 'fire';

    let geo;
    if (isSpark) geo = sparkParticleGeo;
    else if (isDirt) geo = createDirtClodGeometry();
    else geo = sphereParticleGeo;

    const mat = isDirt
        ? new THREE.MeshLambertMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.90,
            depthWrite: false
        })
        : new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: isFire ? 0.95 : (isAdditive ? 0.9 : 0.85),
            blending: isAdditive || isFire ? THREE.AdditiveBlending : THREE.NormalBlending,
            depthWrite: false
        });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = (type === 'fire') ? 30 : ((type === 'spark') ? 40 : 20);
    if (window.excludeFromSSAO) window.excludeFromSSAO(mesh);
    return { mesh, mat };
}

function prewarmParticlePools() {
    if (particlePoolsPrewarmed || !window.scene) return;
    particlePoolsPrewarmed = true;

    // Keep the scene's point-light count stable so firing does not trigger shader recompiles.
    while (dynamicFlashPool.length < DYNAMIC_FLASH_POOL_SIZE) {
        const light = new THREE.PointLight(0xffffff, DYNAMIC_FLASH_IDLE_INTENSITY, 1, 1.8);
        light.position.set(1000000, 1000000, 1000000);
        window.scene.add(light);
        dynamicFlashPool.push(light);
    }

    const smokeGeometry = window.createVolumetricSmokeGeometry
        ? window.createVolumetricSmokeGeometry()
        : sphereParticleGeo;
    for (let i = 0; i < 64; i++) {
        const mat = (window.createHaltonSmokeMaterial || window.createMaldiveSmokeMaterial)(0x94a3b8);
        const mesh = new THREE.Mesh(smokeGeometry, mat);
        mesh.renderOrder = 20;
        if (window.excludeFromSSAO) window.excludeFromSSAO(mesh);
        mesh.visible = false;
        smokePool.push({ mesh, mat });
    }

    const warmParticleType = (type, isAdditive, count) => {
        const poolKey = getParticlePoolKey(type, isAdditive);
        const pool = [];
        for (let i = 0; i < count; i++) {
            const particle = createParticleObject(type, isAdditive, 0xffffff);
            particle.mesh.visible = false;
            pool.push(particle);
        }
        reusableParticlePools.set(poolKey, pool);
    };

    warmParticleType('fire', true, 24);
    warmParticleType('spark', true, 32);
        warmParticleType('spark', false, 8);
    warmParticleType('dirt', false, 16);

    const dustGeometry = window.createVolumetricDustGeometry
        ? window.createVolumetricDustGeometry()
        : sphereParticleGeo;
    for (let i = 0; i < 64; i++) {
        const mat = window.createVolumetricDustMaterial
            ? window.createVolumetricDustMaterial(0x5c4d3c)
            : ((window.createHaltonSmokeMaterial || window.createMaldiveSmokeMaterial)
                ? (window.createHaltonSmokeMaterial || window.createMaldiveSmokeMaterial)(0x5c4d3c)
                : createParticleObject('dirt', false, 0x5c4d3c).mat);
        const mesh = new THREE.Mesh(dustGeometry, mat);
        mesh.renderOrder = 15;
        if (window.excludeFromSSAO) window.excludeFromSSAO(mesh);
        mesh.visible = false;
        dustPool.push({ mesh, mat });
    }
}
window.prewarmParticlePools = prewarmParticlePools;

function createShellObject() {
    const group = new THREE.Group();
    group.renderOrder = 35;
    const core = new THREE.Mesh(shellCoreGeo, shellCoreMaterial);
    core.rotation.x = Math.PI / 2;
    core.renderOrder = 35;
    group.add(core);

    const flame = new THREE.Mesh(shellFlameGeo, shellFlameMaterial);
    flame.rotation.x = Math.PI / 2;
    flame.position.z = -0.7;
    flame.renderOrder = 35;
    group.add(flame);

    if (window.excludeFromSSAO) window.excludeFromSSAO(group);
    return group;
}

function createTracerObject() {
    const group = new THREE.Group();
    group.renderOrder = 35;
    const mesh = new THREE.Mesh(tracerGeo, tracerMaterial);
    mesh.rotation.x = Math.PI / 2;
    mesh.renderOrder = 35;
    group.add(mesh);
    if (window.excludeFromSSAO) window.excludeFromSSAO(group);
    return group;
}

function prewarmParticleShaders(renderer, camera) {
    if (!renderer || !camera) return;

    const warmScene = new THREE.Scene();
    warmScene.fog = window.scene && window.scene.fog;
    const oldCameraMask = camera.layers.mask;
    const warmedMeshes = [];
    const includeMesh = (mesh) => {
        mesh.traverse(child => {
            warmedMeshes.push({
                mesh: child,
                visible: child.visible,
                layerMask: child.layers.mask,
                frustumCulled: child.frustumCulled
            });
            child.visible = true;
            child.layers.set(window.SSAO_FX_LAYER);
            child.frustumCulled = false;
        });
        warmScene.add(mesh);
    };

    if (smokePool.length > 0) includeMesh(smokePool[0].mesh);
    if (dustPool.length > 0) includeMesh(dustPool[0].mesh);
    for (const pool of reusableParticlePools.values()) {
        if (pool.length > 0) includeMesh(pool[0].mesh);
    }

    const shockwaveMaterial = new THREE.MeshBasicMaterial({
        color: 0xfde68a,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const shockwaveMesh = new THREE.Mesh(shockwaveGeo, shockwaveMaterial);
    includeMesh(shockwaveMesh);

    const shell = createShellObject();
    const tracer = createTracerObject();
    includeMesh(shell);
    includeMesh(tracer);

    try {
        camera.layers.set(window.SSAO_FX_LAYER);
        renderer.compile(warmScene, camera);
    } finally {
        camera.layers.mask = oldCameraMask;
    }

    warmedMeshes.forEach(({ mesh, visible, layerMask, frustumCulled }) => {
        mesh.visible = visible;
        mesh.layers.mask = layerMask;
        mesh.frustumCulled = frustumCulled;
    });
    warmedMeshes.forEach(({ mesh }) => {
        if (mesh.parent === warmScene) warmScene.remove(mesh);
    });
    if (window.excludeFromSSAO) {
        window.excludeFromSSAO(shockwaveMesh);
        window.excludeFromSSAO(shell);
        window.excludeFromSSAO(tracer);
    }
    shockwaveMesh.visible = false;
    shell.visible = false;
    tracer.visible = false;
    shockwavePool.push({ mesh: shockwaveMesh, mat: shockwaveMaterial });
    shellPool.push(shell);
    tracerPool.push(tracer);
}
window.prewarmParticleShaders = prewarmParticleShaders;

// Dynamic Point Light Flash Pool for Muzzle Blast & Explosions
function spawnDynamicFlash(pos, colorHex, intensity, distance, lifeTime) {
    const currentScene = window.scene;
    if (!currentScene) return;

    let activeFlash = null;
    let light = dynamicFlashPool.pop();
    if (!light) {
        activeFlash = dynamicFlashes.reduce((oldest, flash) =>
            !oldest || flash.age / flash.life > oldest.age / oldest.life ? flash : oldest, null);
        if (!activeFlash) return;
        light = activeFlash.light;
    }
    light.color.setHex(colorHex);
    light.intensity = intensity;
    light.distance = distance;
    light.position.copy(pos);
    if (light.parent !== currentScene) currentScene.add(light);

    if (activeFlash) {
        activeFlash.maxIntensity = intensity;
        activeFlash.age = 0;
        activeFlash.life = lifeTime;
    } else {
        dynamicFlashes.push({ light, maxIntensity: intensity, age: 0, life: lifeTime });
    }
}

// Expanding Ground Blast Shockwave Ring
function spawnShockwave(pos, maxRadius, duration, colorHex = 0xfde68a) {
    const currentScene = window.scene;
    if (!currentScene) return;

    const pooled = shockwavePool.pop();
    const mat = pooled ? pooled.mat : new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    const mesh = pooled ? pooled.mesh : new THREE.Mesh(shockwaveGeo, mat);
    mesh.renderOrder = 25;
    mat.color.setHex(colorHex);
    mat.opacity = 0.85;
    mesh.visible = true;
    mesh.position.set(pos.x, pos.y + 0.08, pos.z);
    mesh.scale.setScalar(0.3);
    if (window.excludeFromSSAO) window.excludeFromSSAO(mesh);
    if (mesh.parent !== currentScene) currentScene.add(mesh);

    shockwaves.push({
        mesh,
        mat,
        maxRadius,
        age: 0,
        life: duration
    });
}

// Universal Multi-Type Realistic Particle Spawner
function spawnParticle(pos, vel, colorHex, startSize, endSize, life, isAdditive = false, type = 'smoke', extraOpts = null) {
    const currentScene = window.scene;
    if (!currentScene) return;

        // High-Fidelity Volumetric Feathered Dust Plume (Zero Hard Circles)
    if (type === 'dust') {
        let mesh, mat;
        if (dustPool.length > 0) {
            const pooled = dustPool.pop();
            mesh = pooled.mesh;
            mat = pooled.mat;
            if (mat && mat.uniforms && mat.uniforms.diffuse) {
                if (typeof colorHex === 'number') {
                    mat.uniforms.diffuse.value.setHex(colorHex);
                } else if (colorHex && colorHex.isColor) {
                    mat.uniforms.diffuse.value.copy(colorHex);
                }
            } else if (mat && mat.color) {
                if (typeof colorHex === 'number') mat.color.setHex(colorHex);
                else if (colorHex && colorHex.isColor) mat.color.copy(colorHex);
            }
            if (mat && mat.uniforms && mat.uniforms.uAgeProgress) mat.uniforms.uAgeProgress.value = 0.0;
            if (mat && mat.uniforms && mat.uniforms.opacity) {
                mat.uniforms.opacity.value = (extraOpts && extraOpts.maxOpacity !== undefined) ? extraOpts.maxOpacity : 0.78;
            }
            mesh.visible = true;
        } else {
            mat = window.createVolumetricDustMaterial
                ? window.createVolumetricDustMaterial(colorHex)
                : ((window.createHaltonSmokeMaterial || window.createMaldiveSmokeMaterial)
                    ? (window.createHaltonSmokeMaterial || window.createMaldiveSmokeMaterial)(colorHex)
                    : createParticleObject('dirt', false, colorHex).mat);
            const dustGeo = window.createVolumetricDustGeometry ? window.createVolumetricDustGeometry() : sphereParticleGeo;
            mesh = new THREE.Mesh(dustGeo, mat);
            if (window.excludeFromSSAO) window.excludeFromSSAO(mesh);
            currentScene.add(mesh);
        }

        if (window.excludeFromSSAO) window.excludeFromSSAO(mesh);
        if (mesh.parent !== currentScene) currentScene.add(mesh);
        mesh.renderOrder = 20;
        mesh.position.copy(pos);
        mesh.scale.setScalar(startSize);
        mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);

        particles.push({
            mesh,
            mat,
            vel: vel.clone(),
            startSize,
            endSize,
            age: 0,
            life,
            type,
            rotVel: new THREE.Vector3(
                (Math.random() - 0.5) * 1.8,
                (Math.random() - 0.5) * 1.8,
                (Math.random() - 0.5) * 1.8
            ),
            drag: (extraOpts && extraOpts.drag !== undefined) ? extraOpts.drag : 0.90,
            buoyancy: (extraOpts && extraOpts.buoyancy !== undefined) ? extraOpts.buoyancy : -0.08,
            maxOpacity: (extraOpts && extraOpts.maxOpacity !== undefined) ? extraOpts.maxOpacity : 0.78,
            gravity: 0.0,
            isPooled: true,
            isDust: true
        });
        return;
    }

    // Low-Discrepancy 64x64 Halton Sequence Sampling Volumetric Smoke
    if (type === 'smoke') {
        let mesh, mat;
        if (smokePool.length > 0) {
            const pooled = smokePool.pop();
            mesh = pooled.mesh;
            mat = pooled.mat;
            if (typeof colorHex === 'number') {
                mat.uniforms.diffuse.value.setHex(colorHex);
            } else if (colorHex && colorHex.isColor) {
                mat.uniforms.diffuse.value.copy(colorHex);
            }
            if (mat.uniforms.uAgeProgress) mat.uniforms.uAgeProgress.value = 0.0;
            if (mat.uniforms.ditherOffset) {
                mat.uniforms.ditherOffset.value.set(0, 0);
            }
            if (mat.uniforms.opacity) {
                mat.uniforms.opacity.value = (extraOpts && extraOpts.maxOpacity !== undefined) ? extraOpts.maxOpacity : 0.88;
            }
            mesh.visible = true;
        } else {
            mat = (window.createHaltonSmokeMaterial || window.createMaldiveSmokeMaterial)
                ? (window.createHaltonSmokeMaterial || window.createMaldiveSmokeMaterial)(colorHex)
                : createHaltonSmokeMaterial(colorHex);
            const smokeGeo = window.createVolumetricSmokeGeometry ? window.createVolumetricSmokeGeometry() : sphereParticleGeo;
            mesh = new THREE.Mesh(smokeGeo, mat);
            if (window.excludeFromSSAO) window.excludeFromSSAO(mesh);
            currentScene.add(mesh);
        }

        if (window.excludeFromSSAO) window.excludeFromSSAO(mesh);
        if (mesh.parent !== currentScene) currentScene.add(mesh);
        mesh.renderOrder = 20;
        mesh.position.copy(pos);
        mesh.scale.setScalar(startSize);
        mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);

        particles.push({
            mesh,
            mat,
            vel: vel.clone(),
            startSize,
            endSize,
            age: 0,
            life,
            type,
            rotVel: new THREE.Vector3(
                (Math.random() - 0.5) * 2.5,
                (Math.random() - 0.5) * 2.5,
                (Math.random() - 0.5) * 2.5
            ),
            drag: (extraOpts && extraOpts.drag !== undefined) ? extraOpts.drag : 0.94,
            buoyancy: (extraOpts && extraOpts.buoyancy !== undefined) ? extraOpts.buoyancy : 1.4,
            maxOpacity: (extraOpts && extraOpts.maxOpacity !== undefined) ? extraOpts.maxOpacity : 0.92,
            gravity: 0.0,
            isPooled: true
        });
        return;
    }

    const isSpark = (type === 'spark');
    const isDirt  = (type === 'dirt');
    const isFire  = (type === 'fire');

    const poolKey = getParticlePoolKey(type, isAdditive);
    const pool = reusableParticlePools.get(poolKey);
    const pooled = pool && pool.length > 0 ? pool.pop() : null;
    const { mesh, mat } = pooled || createParticleObject(type, isAdditive, colorHex);
    if (pooled) {
        if (typeof colorHex === 'number') mat.color.setHex(colorHex);
        else if (colorHex && colorHex.isColor) mat.color.copy(colorHex);
        mat.opacity = isFire ? 0.95 : (isAdditive ? 0.9 : 0.85);
        mesh.visible = true;
    }
    mesh.renderOrder = (type === 'fire') ? 30 : ((type === 'spark') ? 40 : 20);
    mesh.position.copy(pos);
    mesh.scale.setScalar(startSize);
    if (isSpark && vel.lengthSq() > 0.1) {
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), vel.clone().normalize());
    } else {
        mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    }

    if (mesh.parent !== currentScene) currentScene.add(mesh);

    particles.push({
        mesh,
        mat,
        vel: vel.clone(),
        startSize,
        endSize,
        age: 0,
        life,
        type,
        poolKey,
        rotVel: new THREE.Vector3(
            (Math.random() - 0.5) * 2.5,
            (Math.random() - 0.5) * 2.5,
            (Math.random() - 0.5) * 2.5
        ),
        drag: isSpark ? 0.985 : (isDirt ? 0.96 : (isFire ? 0.92 : 0.94)),
        buoyancy: isFire ? 3.2 : (type === 'smoke' ? 1.4 : 0.0),
        gravity: isSpark ? 14.0 : (isDirt ? 18.0 : 0.0)
    });
}

// Fire Main Tank Cannon (KwK 36 / 75mm M3 / 85mm ZiS-S-53)
function fireMainCannon(tankModel) {
    if (window.playerMode === 'soldier' || tankState.reloadTimer > 0 || tankState.isKnockedOut) return;
    if (typeof window.notifyPlayerFired === 'function') window.notifyPlayerFired();
    tankState.reloadTimer = tankState.RELOAD_TIME;
    tankState.reloadStage = 1;

    if (window.soundFX && typeof window.soundFX.playMainCannon === 'function') {
        window.soundFX.playMainCannon(tankState.currentTankSpec);
    } else {
        soundFX.play88mmCannon();
    }

    const tm = window.tankModel || tankModel;
    if (!tm || !tm.mainGunMuzzleTip || !tm.gunElevationPivot) return;

    const muzzlePos = new THREE.Vector3();
    tm.mainGunMuzzleTip.getWorldPosition(muzzlePos);

    const barrelQuat = new THREE.Quaternion();
    tm.gunElevationPivot.getWorldQuaternion(barrelQuat);
    const shootDir = new THREE.Vector3(0, 0, 1).applyQuaternion(barrelQuat).normalize();
    const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(barrelQuat).normalize();
    const upVec    = new THREE.Vector3(0, 1, 0).applyQuaternion(barrelQuat).normalize();

    // 1. Barrel Hydropneumatic Recoil Slide
    tankState.barrelRecoilOffset = tankState.RECOIL_OFFSET || 0.56;

    // 2. Realistic Hull Physics Recoil Impulse (Nose rises, rear squats down)
    const localTurretAngle = tankState.turretYaw;
    const impulseScale = (tankState.RECOIL_OFFSET || 0.56) / 0.56;
    tankState.pitchVel += Math.cos(localTurretAngle) * 0.40 * impulseScale;
    tankState.rollVel  += Math.sin(localTurretAngle) * 0.32 * impulseScale;
    tankState.heaveVel -= 0.65 * impulseScale;
    tankState.speed    -= Math.cos(localTurretAngle) * 0.55 * impulseScale;

    // 3. Dynamic Muzzle Flash Light that illuminates tank front & ground
    spawnDynamicFlash(muzzlePos, 0xfff3c4, 16.0, 38.0, 0.12);

    // 4. Forward High-Pressure Blast Plume
    spawnParticle(muzzlePos, shootDir.clone().multiplyScalar(16), 0xfffbeb, 0.65, 2.2, 0.10, true, 'fire');
    spawnParticle(muzzlePos, shootDir.clone().multiplyScalar(10), 0xf59e0b, 0.55, 3.2, 0.16, true, 'fire');

    // 5. Muzzle Blast Pattern: Lateral T-Shape for Muzzle Brakes (Tiger I), Forward Cone for Open Muzzles (Sherman / T-34)
    if (tankState.hasMuzzleBrake) {
        [-1, 1].forEach((side) => {
            for (let i = 0; i < 5; i++) {
                const sideVel = rightVec.clone().multiplyScalar(side * (12 + Math.random() * 8))
                    .add(upVec.clone().multiplyScalar((Math.random() - 0.3) * 3))
                    .add(shootDir.clone().multiplyScalar(1.5 + Math.random() * 2));

                spawnParticle(muzzlePos, sideVel, 0xfbbf24, 0.28, 1.25, 0.15 + Math.random() * 0.08, true, 'fire');
                spawnParticle(muzzlePos, sideVel.clone().multiplyScalar(0.55), 0x94a3b8, 0.35, 2.6, 0.50, false, 'smoke');
            }
        });
    } else {
        // Forward high-velocity conical blast cloud
        for (let i = 0; i < 8; i++) {
            const coneVel = shootDir.clone().multiplyScalar(12 + Math.random() * 10)
                .add(rightVec.clone().multiplyScalar((Math.random() - 0.5) * 6))
                .add(upVec.clone().multiplyScalar((Math.random() - 0.2) * 5));
            spawnParticle(muzzlePos, coneVel, 0xf59e0b, 0.32, 1.6, 0.18 + Math.random() * 0.08, true, 'fire');
            spawnParticle(muzzlePos, coneVel.clone().multiplyScalar(0.45), 0x94a3b8, 0.40, 2.8, 0.50, false, 'smoke');
        }
    }

    // 6. Lingering Heavy Barrel Gunsmoke
    for (let i = 0; i < 8; i++) {
        const smokeVel = shootDir.clone().multiplyScalar(6 + Math.random() * 9)
            .add(new THREE.Vector3((Math.random() - 0.5) * 4, 1.4 + Math.random() * 2.5, (Math.random() - 0.5) * 4));
        spawnParticle(muzzlePos, smokeVel, 0x64748b, 0.45, 3.6, 0.50, false, 'smoke');
    }

        // 7. Ground Dust Shockwave Kick-up Under Gun Muzzle
    const groundUnderMuzzle = muzzlePos.clone();
    groundUnderMuzzle.y = getTerrainHeight(muzzlePos.x, muzzlePos.z) + 0.12;
    spawnShockwave(groundUnderMuzzle, 5.2, 0.40, 0xd4a373);
    const dustCount = 18;
    const groundDustCol = (window.currentZoneConfig && window.currentZoneConfig.trackDustColor)
        ? window.currentZoneConfig.trackDustColor : 0x785e46;
    for (let i = 0; i < dustCount; i++) {
        const dustAng = (i / dustCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
        const dustSpd = 5.2 + Math.random() * 4.2;
        const dustVel = new THREE.Vector3(
            Math.cos(dustAng) * dustSpd + shootDir.x * 3.2,
            0.35 + Math.random() * 0.85,
            Math.sin(dustAng) * dustSpd + shootDir.z * 3.2
        );
        spawnParticle(groundUnderMuzzle, dustVel, groundDustCol, 0.45, 3.8 + Math.random() * 1.2, 0.95 + Math.random() * 0.45, false, 'dust', {
            maxOpacity: 0.82,
            drag: 0.89,
            buoyancy: -0.06
        });
    }

    // 8. Spawn High-Velocity Armor-Piercing Tracer Shell with Tank Dispersion & Ballistics
    const spreadAngle = (typeof tankState.CANNON_SPREAD === 'number') ? tankState.CANNON_SPREAD : 0.001;
    let finalShootDir = shootDir.clone();
    if (spreadAngle > 0.0001) {
        const spreadRad = Math.sqrt(-2.0 * Math.log(Math.max(0.0001, 1.0 - Math.random()))) * spreadAngle;
        const spreadTheta = Math.random() * Math.PI * 2.0;
        finalShootDir.addScaledVector(rightVec, Math.cos(spreadTheta) * spreadRad);
        finalShootDir.addScaledVector(upVec, Math.sin(spreadTheta) * spreadRad);
        finalShootDir.normalize();
    }

    const fireQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), finalShootDir);
    const shellGroup = shellPool.pop() || createShellObject();
    shellGroup.visible = true;
    shellGroup.position.copy(muzzlePos);
    shellGroup.quaternion.copy(fireQuat);
    if (shellGroup.parent !== window.scene) window.scene.add(shellGroup);

    const shellSpeed = tankState.SHELL_VELOCITY || 773;
    const currentId = window.currentTankId || 'tiger';
    const cDmg = (typeof tankState.CANNON_DAMAGE === 'number') ? tankState.CANNON_DAMAGE : ((currentId === 'tiger') ? 2 : 1);
    shells.push({
        mesh: shellGroup,
        pos: muzzlePos.clone(),
        vel: finalShootDir.clone().multiplyScalar(shellSpeed),
        life: 5.0,
        isEnemy: false,
        blastRadius: (typeof tankState.BLAST_RADIUS === 'number') ? tankState.BLAST_RADIUS : 8.0,
        blastDamage: (typeof tankState.BLAST_DAMAGE === 'number') ? tankState.BLAST_DAMAGE : 100,
        cannonDamage: cDmg,
        tankType: currentId
    });
}

function spawnTracerRound(pos, dir, quat, isEnemy = false, options = {}) {
    spawnParticle(pos, dir.clone().multiplyScalar(6), 0xfde047, 0.12, 0.30, 0.06, true, 'fire');

    const wrap = tracerPool.pop() || createTracerObject();
    wrap.visible = true;
    wrap.position.copy(pos);
    wrap.quaternion.copy(quat);
    if (wrap.parent !== window.scene) window.scene.add(wrap);

    tracers.push({
        mesh: wrap,
        pos: pos.clone(),
        vel: dir.clone().multiplyScalar(765), // 765 m/s MG34 tracer velocity
        life: 2.5,
        isEnemy: !!isEnemy,
        damage: options.damage,
        onSoldierKilled: options.onSoldierKilled
    });
}

// Fire Coaxial MG34 (Turret Mantlet)
function fireCoaxMG(tankModel) {
    if (window.playerMode === 'soldier' || tankState.coaxMgCooldown > 0 || tankState.mgHeat >= 100 || tankState.isKnockedOut) return;
    tankState.coaxMgCooldown = 0.075;
    tankState.mgHeat = Math.min(100, tankState.mgHeat + 1.8);

    soundFX.playMG34Shot();
    const tm = window.tankModel || tankModel;
    if (!tm || !tm.coaxMuzzleRef || !tm.gunElevationPivot) return;

    const coaxPos = new THREE.Vector3();
    tm.coaxMuzzleRef.getWorldPosition(coaxPos);
    const gunQuat = new THREE.Quaternion();
    tm.gunElevationPivot.getWorldQuaternion(gunQuat);
    const coaxDir = new THREE.Vector3(0, 0, 1).applyQuaternion(gunQuat).normalize();

    // Spread
    coaxDir.x += (Math.random() - 0.5) * 0.015;
    coaxDir.y += (Math.random() - 0.5) * 0.015;
    coaxDir.normalize();

    spawnTracerRound(coaxPos, coaxDir, gunQuat);
}

// Fire Front Hull Ball-Mounted Bow Machine Gun (Kugelblende 50 / Bow MG) with Shoot Range Cone
function fireBowMG(tankModel) {
    if (window.playerMode === 'soldier' || tankState.bowMgCooldown > 0 || tankState.mgHeat >= 100 || tankState.isKnockedOut) return;
    tankState.bowMgCooldown = 0.075;
    tankState.mgHeat = Math.min(100, tankState.mgHeat + 1.8);

    soundFX.playMG34Shot();
    const tm = window.tankModel || tankModel;
    const bGroup = tm ? (tm.bowMgGroup || window.bowMgGroup) : window.bowMgGroup;
    const bBarrel = tm ? (tm.bowMgBarrel || window.bowMgBarrel) : window.bowMgBarrel;
    const hGroup = tm ? (tm.hullGroup || window.hullGroup) : window.hullGroup;
    if (!bGroup || !hGroup) return;

    const bowPos = new THREE.Vector3();
    if (bBarrel) {
        bBarrel.getWorldPosition(bowPos);
    } else {
        bGroup.getWorldPosition(bowPos);
    }

    // Swiveled aim angles within the ball-mount shoot range cone
    const yaw = tankState.bowMgYaw || 0;
    const pitch = tankState.bowMgPitch || 0;

    // Cyclic machinegun muzzle spread (tight high-rpm conical dispersion)
    const spreadYaw   = (Math.random() - 0.5) * 0.026;
    const spreadPitch = (Math.random() - 0.5) * 0.022;

    const effYaw = yaw + spreadYaw;
    const effPitch = pitch + spreadPitch;

    // Local firing direction vector in hull coordinate space
    const localDir = new THREE.Vector3(
        Math.sin(effYaw) * Math.cos(effPitch),
        Math.sin(effPitch),
        Math.cos(effYaw) * Math.cos(effPitch)
    );

    const hullQuat = new THREE.Quaternion();
    hGroup.getWorldQuaternion(hullQuat);
    const bowDir = localDir.applyQuaternion(hullQuat).normalize();

    const tracerQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), bowDir);
    spawnTracerRound(bowPos, bowDir, tracerQuat);
}

// Fire Turret-Mounted Nebelwurfgerät Smoke Grenade Dischargers
function fireSmokeDischargers(tankModel) {
    if (window.playerMode === 'soldier' || (window.tankState && window.tankState.isKnockedOut)) return;
    soundFX.playMG34Shot();
    const tm = window.tankModel || tankModel;
    if (!tm || !tm.smokeTubes) return;

    tm.smokeTubes.forEach((tube) => {
        const p = new THREE.Vector3();
        tube.getWorldPosition(p);
        const q = new THREE.Quaternion();
        tube.getWorldQuaternion(q);
        const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();

        // High-density volumetric smoke screen curtain
        for (let i = 0; i < 4; i++) {
            const v = dir.clone().multiplyScalar(12 + Math.random() * 8)
                .add(new THREE.Vector3((Math.random() - 0.5) * 5, 1.5 + Math.random() * 4, (Math.random() - 0.5) * 5));
            spawnParticle(p, v, 0xf1f5f9, 0.45, 5.2, 4.5 + Math.random() * 2.0, false, 'smoke');
        }
    });
}

// High-Fidelity Multi-Stage Shell Detonation (Fireball, Shockwave, Sparks, Smoke Column)
function triggerHeavyDetonation(pos, ignorePlayer = false, customBlastRadius = 8.5, customBlastDamage = 100) {
    const blastRad = (typeof customBlastRadius === 'number') ? customBlastRadius : 8.5;
    const blastDmg = (typeof customBlastDamage === 'number') ? customBlastDamage : 100;
    const isLargeBlast = blastRad > 12.0;

    soundFX.playImpactExplosion(pos);

    // 1. Blinding Detonation Flash Light
    const flashRadius = Math.round(blastRad * 6.0);
    spawnDynamicFlash(pos, 0xfff08a, isLargeBlast ? 36.0 : 24.0, flashRadius, isLargeBlast ? 0.25 : 0.18);

    // 2. Expanding Ground Blast Shockwave Ring
    spawnShockwave(pos, blastRad, isLargeBlast ? 0.60 : 0.45, 0xfef08a);
    if (isLargeBlast) {
        spawnShockwave(pos, blastRad * 1.35, 0.75, 0xf97316);
    }

    // 3. Central White-Hot to Fiery Orange Fireball Plume
    const fireCount = isLargeBlast ? 12 : 7;
    const fireScale = isLargeBlast ? 1.45 : 1.0;
    for (let i = 0; i < fireCount; i++) {
        const fireVel = new THREE.Vector3(
            (Math.random() - 0.5) * (8.0 * fireScale),
            (3.5 + Math.random() * 8.5) * fireScale,
            (Math.random() - 0.5) * (8.0 * fireScale)
        );
        const col = (i % 3 === 0) ? 0xfffbeb : ((i % 3 === 1) ? 0xf59e0b : 0xd97706);
        spawnParticle(pos, fireVel, col, 0.85 * fireScale, 4.6 * fireScale, (0.35 + Math.random() * 0.25) * fireScale, true, 'fire');
    }

    // 4. Giant Billowing Charcoal/Black Smoke Plume that rises into sky
    const smokeCount = isLargeBlast ? 14 : 8;
    for (let i = 0; i < smokeCount; i++) {
        const smokeVel = new THREE.Vector3(
            (Math.random() - 0.5) * (9.5 * fireScale),
            (2.5 + Math.random() * 7.5) * fireScale,
            (Math.random() - 0.5) * (9.5 * fireScale)
        );
        const col = (i % 2 === 0) ? 0x1e242b : 0x475569;
                spawnParticle(pos, smokeVel, col, 0.65 * fireScale, 4.2 * fireScale, 0.50 * fireScale, false, 'smoke');
    }

    // 4b. Expanding Ground Dust Crater Eruption Plume
    const blastDustCount = isLargeBlast ? 14 : 8;
    const blastDustCol = (window.currentZoneConfig && window.currentZoneConfig.trackDustColor)
        ? window.currentZoneConfig.trackDustColor : 0x6e5843;
    for (let i = 0; i < blastDustCount; i++) {
        const dustAng = Math.random() * Math.PI * 2;
        const dustSpd = (3.5 + Math.random() * 6.5) * fireScale;
        const dustVel = new THREE.Vector3(
            Math.cos(dustAng) * dustSpd,
            (1.0 + Math.random() * 3.2) * fireScale,
            Math.sin(dustAng) * dustSpd
        );
        spawnParticle(pos, dustVel, blastDustCol, 0.55 * fireScale, 4.6 * fireScale, (1.2 + Math.random() * 0.7) * fireScale, false, 'dust', {
            maxOpacity: 0.85,
            drag: 0.90,
            buoyancy: -0.05
        });
    }

    // 5. Fountain of Incandescent Shrapnel Sparks
    const sparkCount = isLargeBlast ? 26 : 16;
    for (let i = 0; i < sparkCount; i++) {
        const sparkVel = new THREE.Vector3(
            (Math.random() - 0.5) * (26.0 * fireScale),
            (6.0 + Math.random() * 22.0) * fireScale,
            (Math.random() - 0.5) * (26.0 * fireScale)
        );
        spawnParticle(pos, sparkVel, (Math.random() > 0.3) ? 0xfbbf24 : 0xf97316, 0.18, 0.08, 0.8 + Math.random() * 1.1, true, 'spark');
    }

    // Blast wave shrapnel damage to nearby soldiers
    const blastSols = [...(window.activeSoldiers || [])];
    if (!ignorePlayer && window.playerMode === 'soldier' && window.playerSoldier && !window.playerSoldier.isDead) {
        if (!window.playerSoldier.invulnerableTimer || window.playerSoldier.invulnerableTimer <= 0) {
            blastSols.push(window.playerSoldier);
        }
    }
    for (let bsi = 0; bsi < blastSols.length; bsi++) {
        const bsol = blastSols[bsi];
        if (!bsol || bsol.isDead) continue;
        const blastDist = Math.hypot(bsol.x - pos.x, bsol.z - pos.z);
        if (blastDist < blastRad) {
            const innerRadius = blastRad * 0.45;
            const dmg = blastDist < innerRadius ? blastDmg : Math.round(blastDmg * (1 - (blastDist - innerRadius) / (blastRad - innerRadius)));
            if (typeof bsol.takeDamage === 'function') {
                bsol.takeDamage(dmg);
            }
        }
    }

    // 6. Heavy Clods of Earth & Shrapnel Debris
    const dirtCount = isLargeBlast ? 12 : 7;
    for (let i = 0; i < dirtCount; i++) {
        const dirtVel = new THREE.Vector3(
            (Math.random() - 0.5) * (16.0 * fireScale),
            (4.0 + Math.random() * 14.0) * fireScale,
            (Math.random() - 0.5) * (16.0 * fireScale)
        );
        spawnParticle(pos, dirtVel, 0x3d3126, 0.32 * fireScale, 0.95 * fireScale, 1.2 + Math.random() * 0.8, false, 'dirt');
    }

    // 7. Powerful Blast Wave Topples Nearby Trees Radially Along Explosion Force
    const blastTrees = window.swayTrees || [];
    const treeBlastRadius = blastRad * 1.35;
    const blastRadiusSq = treeBlastRadius * treeBlastRadius;
    for (let tr = 0; tr < blastTrees.length; tr++) {
        const tree = blastTrees[tr];
        if (tree.isFallen) continue;
        const dx = tree.x - pos.x;
        const dz = tree.z - pos.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < blastRadiusSq) {
            const dist = Math.sqrt(dSq);
            const blastDir = (dist > 0.1) ? new THREE.Vector3(dx / dist, 0, dz / dist) : new THREE.Vector3(0, 0, 1);
            const blastForce = (1.0 - dist / treeBlastRadius) * (isLargeBlast ? 7.5 : 4.5);
            if (window.hitTree) {
                window.hitTree(tree, blastDir, blastForce);
            }
        }
    }
}

const _obstacleRaycaster = new THREE.Raycaster();

// Hitbox dimensions based on authentic historical vehicle profiles
function getTankHitboxDims(specOrType) {
    const t = typeof specOrType === 'string' ? specOrType.toLowerCase() : (specOrType && specOrType.tankType ? specOrType.tankType.toLowerCase() : 'tiger');
    if (t.includes('sherman')) {
        return { halfW: 1.55, halfH: 1.35, halfL: 3.05 };
    } else if (t.includes('t34') || t.includes('t-34')) {
        return { halfW: 1.60, halfH: 1.30, halfL: 3.10 };
    }
    return { halfW: 1.80, halfH: 1.40, halfL: 3.30 };
}

// 3D Continuous Collision Detection (CCD) Segment vs Oriented Bounding Box (OBB)
function testSegmentVsTank(prevPos, nextPos, tankX, tankY, tankZ, heading, halfW = 1.80, halfH = 1.35, halfL = 3.30) {
    const centerY = tankY + halfH;
    const cosH = Math.cos(-heading);
    const sinH = Math.sin(-heading);

    const p0x = prevPos.x - tankX;
    const p0y = prevPos.y - centerY;
    const p0z = prevPos.z - tankZ;

    const lx0 = p0x * cosH - p0z * sinH;
    const ly0 = p0y;
    const lz0 = p0x * sinH + p0z * cosH;

    const p1x = nextPos.x - tankX;
    const p1y = nextPos.y - centerY;
    const p1z = nextPos.z - tankZ;

    const lx1 = p1x * cosH - p1z * sinH;
    const ly1 = p1y;
    const lz1 = p1x * sinH + p1z * cosH;

    const dx = lx1 - lx0;
    const dy = ly1 - ly0;
    const dz = lz1 - lz0;

    let tmin = 0.0;
    let tmax = 1.0;

    // Lateral X slab
    if (Math.abs(dx) > 1e-6) {
        let t1 = (-halfW - lx0) / dx;
        let t2 = (halfW - lx0) / dx;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
    } else if (Math.abs(lx0) > halfW) {
        return null;
    }

    // Vertical Y slab
    if (Math.abs(dy) > 1e-6) {
        let t1 = (-halfH - ly0) / dy;
        let t2 = (halfH - ly0) / dy;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
    } else if (Math.abs(ly0) > halfH) {
        return null;
    }

    // Longitudinal Z slab
    if (Math.abs(dz) > 1e-6) {
        let t1 = (-halfL - lz0) / dz;
        let t2 = (halfL - lz0) / dz;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
    } else if (Math.abs(lz0) > halfL) {
        return null;
    }

    const tHit = Math.max(0, tmin);
    return {
        tHit,
        impact: new THREE.Vector3(
            prevPos.x + (nextPos.x - prevPos.x) * tHit,
            prevPos.y + (nextPos.y - prevPos.y) * tHit,
            prevPos.z + (nextPos.z - prevPos.z) * tHit
        )
    };
}

// Spawns shell projectile from Enemy Tank toward Player
function spawnEnemyShell(muzzlePos, fireDir, shellSpeed, enemyTank) {
    const spec = (enemyTank && enemyTank.spec) || {};
    const spd = shellSpeed || spec.shellVel || 750;
    const tankType = spec.id || (enemyTank && enemyTank.tankType) || 'tiger';
    const cDmg = (typeof spec.cannonDamage === 'number') ? spec.cannonDamage : ((tankType === 'tiger') ? 2 : 1);

    const shellGroup = shellPool.pop() || createShellObject();
    shellGroup.visible = true;
    shellGroup.position.copy(muzzlePos);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fireDir);
    shellGroup.quaternion.copy(quat);
    if (shellGroup.parent !== window.scene) window.scene.add(shellGroup);

    shells.push({
        mesh: shellGroup,
        pos: muzzlePos.clone(),
        vel: fireDir.clone().multiplyScalar(spd),
        life: 5.0,
        isEnemy: true,
        sourceTank: enemyTank,
        blastRadius: (typeof spec.blastRadius === 'number') ? spec.blastRadius : 8.0,
        blastDamage: (typeof spec.blastDamage === 'number') ? spec.blastDamage : 100,
        cannonDamage: cDmg,
        tankType: tankType
    });
}
window.spawnEnemyShell = spawnEnemyShell;

// Continuous Collision Detection (CCD) and Ballistic Trajectory Updates
function updateProjectiles(dt) {
    // 1. Update Cannon Shells (Player shells and Enemy combat shells)
    for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i];
        const prevPos = s.pos.clone();

        s.vel.y -= 9.81 * dt;
        s.pos.addScaledVector(s.vel, dt);
        s.mesh.position.copy(s.pos);

        const velDir = s.vel.clone().normalize();
        s.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), velDir);
        s.life -= dt;

        // Continuous Collision Detection along path segment [prevPos -> s.pos]
        const seg = s.pos.clone().sub(prevPos);
        const segLenSq = seg.lengthSq();
        const segLen = Math.sqrt(segLenSq);
        const segDir = (segLen > 0.0001) ? seg.clone().multiplyScalar(1 / segLen) : velDir;

        let closestHit = null;

        // A. Tank Collision Hitboxes
        if (!s.isEnemy) {
            // Player shell vs Enemy Tanks
            const enemies = window.activeEnemyTanks || [];
            for (let eIdx = 0; eIdx < enemies.length; eIdx++) {
                const enemy = enemies[eIdx];
                if (!enemy || enemy.isDestroyed) continue;

                const midX = (prevPos.x + s.pos.x) * 0.5;
                const midZ = (prevPos.z + s.pos.z) * 0.5;
                const dCenterSq = (midX - enemy.x) ** 2 + (midZ - enemy.z) ** 2;
                const maxRange = 5.5 + segLen * 0.5;
                if (dCenterSq > maxRange * maxRange) continue;

                const dims = getTankHitboxDims(enemy.tankType || enemy.spec);
                const hitResult = testSegmentVsTank(prevPos, s.pos, enemy.x, enemy.y, enemy.z, enemy.heading, dims.halfW, dims.halfH, dims.halfL);
                if (hitResult && (!closestHit || hitResult.tHit < closestHit.t)) {
                    closestHit = {
                        t: hitResult.tHit,
                        type: 'enemyTank',
                        impactPos: hitResult.impact,
                        targetObj: enemy
                    };
                }
            }
        } else {
            // Enemy shell vs Player Tank
            if (window.tankState && !window.tankState.isKnockedOut) {
                const ts = window.tankState;
                const midX = (prevPos.x + s.pos.x) * 0.5;
                const midZ = (prevPos.z + s.pos.z) * 0.5;
                const dCenterSq = (midX - ts.x) ** 2 + (midZ - ts.z) ** 2;
                const maxRange = 5.5 + segLen * 0.5;
                if (dCenterSq <= maxRange * maxRange) {
                    const dims = getTankHitboxDims(window.currentTankId || 'tiger');
                    const hitResult = testSegmentVsTank(prevPos, s.pos, ts.x, ts.y, ts.z, ts.heading, dims.halfW, dims.halfH, dims.halfL);
                    if (hitResult && (!closestHit || hitResult.tHit < closestHit.t)) {
                        closestHit = {
                            t: hitResult.tHit,
                            type: 'playerTank',
                            impactPos: hitResult.impact,
                            targetObj: ts
                        };
                    }
                }
            }
        }

        // B. Tactical Cover Obstacles (Massive Limestone Rocks, Houses, Ruins, Walls)
        const obstacles = window.worldObstacles || [];
        for (let ob = 0; ob < obstacles.length; ob++) {
            const obs = obstacles[ob];
            const dCenterSq = (prevPos.x - obs.x) ** 2 + (prevPos.z - obs.z) ** 2;
            const maxRange = obs.radius + segLen + 2.0;
            if (dCenterSq > maxRange * maxRange) continue;

            // Direct polygon raycast
            if (obs.mesh) {
                _obstacleRaycaster.set(prevPos, segDir);
                _obstacleRaycaster.far = segLen + 0.2;
                const hits = _obstacleRaycaster.intersectObject(obs.mesh, true);
                if (hits.length > 0 && hits[0].distance <= segLen + 0.2) {
                    const tNorm = hits[0].distance / (segLen || 1);
                    if (!closestHit || tNorm < closestHit.t) {
                        closestHit = {
                            t: tNorm,
                            type: 'obstacle',
                            impactPos: hits[0].point.clone(),
                            targetObj: obs
                        };
                    }
                    continue;
                }
            }

            // Analytical ray-cylinder entry point
            const dx = prevPos.x - obs.x;
            const dz = prevPos.z - obs.z;
            const vx = segDir.x;
            const vz = segDir.z;
            const a = vx * vx + vz * vz;
            const b = 2 * (dx * vx + dz * vz);
            const c = dx * dx + dz * dz - obs.radius * obs.radius;
            const disc = b * b - 4 * a * c;

            if (disc >= 0 && a > 0.0001) {
                const sqrtD = Math.sqrt(disc);
                const t0 = (-b - sqrtD) / (2 * a);
                const t1 = (-b + sqrtD) / (2 * a);

                if (t0 <= segLen + 0.2 && t1 >= -0.2) {
                    const tHitDist = Math.max(0, t0);
                    const tNorm = tHitDist / (segLen || 1);
                    const testPt = prevPos.clone().addScaledVector(segDir, tHitDist);
                    const obsTop = obs.y + (obs.height || 4.5);
                    const obsBottom = obs.y - 0.5;

                    if (testPt.y >= obsBottom && testPt.y <= obsTop) {
                        if (!closestHit || tNorm < closestHit.t) {
                            closestHit = {
                                t: tNorm,
                                type: 'obstacle',
                                impactPos: testPt,
                                targetObj: obs
                            };
                        }
                    }
                }
            }
        }

        // C. Forest Trees
        const trees = window.swayTrees || [];
        for (let tr = 0; tr < trees.length; tr++) {
            const tree = trees[tr];
            if (tree.isFallen) continue;
            const dx = tree.x - prevPos.x;
            const dz = tree.z - prevPos.z;
            if (dx * dx + dz * dz > (tree.radius * 2.5 + segLen) ** 2) continue;

            const toTree = new THREE.Vector3(tree.x - prevPos.x, (tree.y + tree.trunkHeight * 0.45) - prevPos.y, tree.z - prevPos.z);
            const projT = (segLenSq > 0.0001) ? THREE.MathUtils.clamp(toTree.dot(seg) / segLenSq, 0, 1) : 0;
            const closestPt = prevPos.clone().addScaledVector(seg, projT);
            const dSq = (closestPt.x - tree.x) ** 2 + (closestPt.z - tree.z) ** 2;
            if (dSq < tree.radius * tree.radius * 2.2 && closestPt.y >= tree.y - 0.2 && closestPt.y <= tree.y + tree.trunkHeight * 1.2) {
                if (!closestHit || projT < closestHit.t) {
                    closestHit = {
                        t: projT,
                        type: 'tree',
                        impactPos: closestPt,
                        targetObj: tree
                    };
                }
            }
        }

        // D1. Active Soldiers (Direct cannon shell strike)
        const activeSols = [...(window.activeSoldiers || [])];
        if (s.isEnemy && window.playerMode === 'soldier' && window.playerSoldier && !window.playerSoldier.isDead) {
            activeSols.push(window.playerSoldier);
        }
        for (let si = 0; si < activeSols.length; si++) {
            const sol = activeSols[si];
            if (!sol || sol.isDead) continue;
            if (s.isEnemy && sol.isEnemy) continue; // Enemy shells don't friendly fire own troops

            const solY = sol.y + 0.9;
            const toSol = new THREE.Vector3(sol.x - prevPos.x, solY - prevPos.y, sol.z - prevPos.z);
            let projT = 0;
            if (segLenSq > 0.0001) {
                projT = THREE.MathUtils.clamp(toSol.dot(seg) / segLenSq, 0, 1);
            }
            const closestPt = prevPos.clone().addScaledVector(seg, projT);
            const distSq = (closestPt.x - sol.x) ** 2 + (closestPt.y - solY) ** 2 + (closestPt.z - sol.z) ** 2;
            if (distSq < 0.65) {
                if (!closestHit || projT < closestHit.t) {
                    closestHit = {
                        t: projT,
                        type: 'soldier',
                        impactPos: closestPt,
                        targetObj: sol
                    };
                }
            }
        }

        // D. Target Dummies (Player only)
        if (!s.isEnemy && typeof targets !== 'undefined') {
            for (let t = 0; t < targets.length; t++) {
                const tg = targets[t];
                const toTg = new THREE.Vector3(tg.x - prevPos.x, tg.y - prevPos.y, tg.z - prevPos.z);
                let projT = 0;
                if (segLenSq > 0.0001) {
                    projT = THREE.MathUtils.clamp(toTg.dot(seg) / segLenSq, 0, 1);
                }
                const closestPt = prevPos.clone().addScaledVector(seg, projT);
                const distSq = closestPt.distanceToSquared(new THREE.Vector3(tg.x, tg.y, tg.z));
                if (distSq < 4.2) {
                    if (!closestHit || projT < closestHit.t) {
                        closestHit = {
                            t: projT,
                            type: 'target',
                            impactPos: closestPt,
                            targetObj: tg
                        };
                    }
                }
            }
        }

        // E. Terrain CCD
        const groundPrev = getTerrainHeight(prevPos.x, prevPos.z);
        const groundNext = getTerrainHeight(s.pos.x, s.pos.z);
        if (s.pos.y <= groundNext || prevPos.y <= groundPrev) {
            const denom = (prevPos.y - groundPrev) - (s.pos.y - groundNext);
            const tG = Math.abs(denom) > 0.0001 ? THREE.MathUtils.clamp((prevPos.y - groundPrev) / denom, 0, 1) : 1;
            if (!closestHit || tG < closestHit.t) {
                const terrainImpactPos = prevPos.clone().lerp(s.pos, tG);
                terrainImpactPos.y = Math.max(terrainImpactPos.y, getTerrainHeight(terrainImpactPos.x, terrainImpactPos.z) + 0.15);
                closestHit = {
                    t: tG,
                    type: 'terrain',
                    impactPos: terrainImpactPos,
                    targetObj: null
                };
            }
        }

        // Apply Closest Hit or Expiration
        if (closestHit || s.life <= 0) {
            if (closestHit) {
                const imp = closestHit.impactPos;
                const bRad = (typeof s.blastRadius === 'number') ? s.blastRadius : 8.5;
                const bDmg = (typeof s.blastDamage === 'number') ? s.blastDamage : 100;

                if (closestHit.type === 'enemyTank') {
                    if (typeof closestHit.targetObj.onHit === 'function') {
                        closestHit.targetObj.onHit(imp, velDir, s.cannonDamage || 1);
                    }
                    triggerHeavyDetonation(imp, false, bRad, bDmg);
                } else if (closestHit.type === 'playerTank') {
                    if (typeof window.onPlayerHit === 'function') {
                        window.onPlayerHit(imp, velDir, s.cannonDamage || 1);
                    }
                    triggerHeavyDetonation(imp, false, bRad, bDmg);
                } else if (closestHit.type === 'tree') {
                    if (window.hitTree) window.hitTree(closestHit.targetObj, s.vel.clone().normalize(), 7.5);
                    triggerHeavyDetonation(imp, false, bRad, bDmg);
                } else if (closestHit.type === 'soldier') {
                    if (typeof closestHit.targetObj.takeDamage === 'function') {
                        closestHit.targetObj.takeDamage(bDmg);
                    }
                    triggerHeavyDetonation(imp, false, bRad, bDmg);
                } else if (closestHit.type === 'target') {
                    closestHit.targetObj.hitAngle = -Math.PI * 0.46;
                    closestHit.targetObj.recoverTimer = 4.5;
                    closestHit.targetObj.plateMat.color.setHex(0xf59e0b);
                    tankState.hitsCount++;
                    triggerHeavyDetonation(imp, false, bRad, bDmg);
                } else if (closestHit.type === 'obstacle' || closestHit.type === 'terrain') {
                    triggerHeavyDetonation(imp, false, bRad, bDmg);
                }

                // Explosive Splash Wave Damage to nearby Tanks
                if (!s.isEnemy) {
                    const enemies = window.activeEnemyTanks || [];
                    const tankSplashRadius = bRad * 0.65;
                    for (let ei = 0; ei < enemies.length; ei++) {
                        const en = enemies[ei];
                        if (!en || en.isDestroyed || en === closestHit.targetObj) continue;
                        const distToTank = Math.hypot(en.x - imp.x, en.z - imp.z);
                        if (distToTank <= tankSplashRadius) {
                            if (typeof en.onHit === 'function') {
                                const splashDir = new THREE.Vector3(en.x - imp.x, 0.4, en.z - imp.z).normalize();
                                en.onHit(imp, splashDir);
                            }
                        }
                    }
                } else if (s.isEnemy && window.tankState && !window.tankState.isKnockedOut && closestHit.type !== 'playerTank') {
                    const ts = window.tankState;
                    const distToPlayer = Math.hypot(ts.x - imp.x, ts.z - imp.z);
                    const playerSplashRadius = bRad * 0.55;
                    if (distToPlayer <= playerSplashRadius) {
                        if (typeof window.onPlayerHit === 'function') {
                            const splashDir = new THREE.Vector3(ts.x - imp.x, 0.4, ts.z - imp.z).normalize();
                            window.onPlayerHit(imp, splashDir);
                        }
                    }
                }
            }

            s.mesh.visible = false;
            if (shellPool.length < PROJECTILE_POOL_LIMIT) shellPool.push(s.mesh);
            else window.scene.remove(s.mesh);
            shells.splice(i, 1);
        }
    }

    // 2. Update machine-gun and rifle tracers
    for (let i = tracers.length - 1; i >= 0; i--) {
        const tr = tracers[i];
        const prevPos = tr.pos.clone();
        tr.vel.y -= 9.81 * 0.5 * dt;
        tr.pos.addScaledVector(tr.vel, dt);
        tr.mesh.position.copy(tr.pos);
        const trVelDir = tr.vel.clone().normalize();
        tr.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), trVelDir);
        tr.life -= dt;

        let seg = tr.pos.clone().sub(prevPos);
        let segLenSq = seg.lengthSq();
        let trSegLen = Math.sqrt(segLenSq);
        const trSegDir = (trSegLen > 0.0001) ? seg.clone().multiplyScalar(1 / trSegLen) : trVelDir;
        let blockingDistance = trSegLen;
        let blockingType = null;
        let blockingTree = null;
        const obstacles = window.worldObstacles || [];
        for (let ob = 0; ob < obstacles.length; ob++) {
            const obs = obstacles[ob];
            const dSqXZ = (tr.pos.x - obs.x) ** 2 + (tr.pos.z - obs.z) ** 2;
            const maxR = obs.radius + trSegLen + 1.0;
            if (dSqXZ > maxR * maxR) continue;

            let distance = null;
            if (obs.mesh) {
                _obstacleRaycaster.set(prevPos, trSegDir);
                _obstacleRaycaster.far = trSegLen;
                const hits = _obstacleRaycaster.intersectObject(obs.mesh, true);
                if (hits.length > 0 && hits[0].distance <= trSegLen) distance = hits[0].distance;
            }
            if (distance === null) {
                const dx = prevPos.x - obs.x;
                const dz = prevPos.z - obs.z;
                const a = trSegDir.x * trSegDir.x + trSegDir.z * trSegDir.z;
                const b = 2 * (dx * trSegDir.x + dz * trSegDir.z);
                const c = dx * dx + dz * dz - obs.radius * obs.radius;
                const disc = b * b - 4 * a * c;
                if (disc >= 0 && a > 0.0001) {
                    const t0 = (-b - Math.sqrt(disc)) / (2 * a);
                    const t1 = (-b + Math.sqrt(disc)) / (2 * a);
                    if (t0 <= trSegLen && t1 >= 0) {
                        const entry = Math.max(0, t0);
                        const y = prevPos.y + trSegDir.y * entry;
                        if (y >= obs.y - 0.5 && y <= obs.y + (obs.height || 4.5)) distance = entry;
                    }
                }
            }
            if (distance !== null && distance <= blockingDistance) {
                blockingDistance = distance;
                blockingType = 'cover';
            }
        }

        for (const tree of (window.swayTrees || [])) {
            if (tree.isFallen) continue;
            const dx = prevPos.x - tree.x;
            const dz = prevPos.z - tree.z;
            const a = trSegDir.x * trSegDir.x + trSegDir.z * trSegDir.z;
            const b = 2 * (dx * trSegDir.x + dz * trSegDir.z);
            const c = dx * dx + dz * dz - tree.radius * tree.radius;
            const disc = b * b - 4 * a * c;
            if (a <= 0.0001 || disc < 0) continue;
            const t0 = (-b - Math.sqrt(disc)) / (2 * a);
            const t1 = (-b + Math.sqrt(disc)) / (2 * a);
            const entry = Math.max(0, t0);
            const y = prevPos.y + trSegDir.y * entry;
            if (t1 >= 0 && entry <= blockingDistance && y >= tree.y && y <= tree.y + tree.trunkHeight) {
                blockingDistance = entry;
                blockingType = 'tree';
                blockingTree = tree;
            }
        }

        const groundNext = getTerrainHeight(tr.pos.x, tr.pos.z);
        if (tr.pos.y <= groundNext) {
            let low = 0, high = 1;
            for (let step = 0; step < 10; step++) {
                const mid = (low + high) * 0.5;
                const p = prevPos.clone().addScaledVector(seg, mid);
                if (p.y <= getTerrainHeight(p.x, p.z)) high = mid;
                else low = mid;
            }
            const distance = trSegLen * high;
            if (distance <= blockingDistance) {
                blockingDistance = distance;
                blockingType = 'terrain';
            }
        }
        if (blockingType) {
            tr.pos.copy(prevPos).addScaledVector(trSegDir, blockingDistance);
            tr.mesh.position.copy(tr.pos);
            seg = tr.pos.clone().sub(prevPos);
            segLenSq = seg.lengthSq();
            trSegLen = Math.sqrt(segLenSq);
        }
        let hit = false;
        let impactPos = tr.pos.clone();
        let closestActor = null;

        // Check tracers against opposing tanks (sparks and armor ricochet sound)
        const tanks = tr.isEnemy
            ? (window.tankState && !window.tankState.isKnockedOut ? [window.tankState] : [])
            : (window.activeEnemyTanks || []);
        for (let eIdx = 0; eIdx < tanks.length; eIdx++) {
            const tank = tanks[eIdx];
            if (!tank || tank.isDestroyed) continue;
            const dCenterSq = (prevPos.x - tank.x) ** 2 + (prevPos.z - tank.z) ** 2;
            if (dCenterSq > (5.0 + trSegLen) ** 2) continue;

            const dims = getTankHitboxDims(tr.isEnemy ? (window.currentTankId || 'tiger') : (tank.tankType || tank.spec));
            const hitResult = testSegmentVsTank(prevPos, tr.pos, tank.x, tank.y, tank.z, tank.heading, dims.halfW, dims.halfH, dims.halfL);
            if (hitResult && (!closestActor || hitResult.tHit < closestActor.t)) {
                closestActor = { t: hitResult.tHit, type: 'tank', point: hitResult.impact };
            }
        }

        const soldiers = (window.activeSoldiers || []).filter(sol => sol && !sol.isDead && !!sol.isEnemy !== tr.isEnemy);
        if (tr.isEnemy && window.playerMode === 'soldier' && window.playerSoldier && !window.playerSoldier.isDead) {
            soldiers.push(window.playerSoldier);
        }
        for (const soldier of soldiers) {
            const dCenterSq = (prevPos.x - soldier.x) ** 2 + (prevPos.z - soldier.z) ** 2;
            if (dCenterSq > (1.8 + trSegLen) ** 2) continue;
            const centerY = soldier.y + 0.9;
            const toSoldier = new THREE.Vector3(soldier.x - prevPos.x, centerY - prevPos.y, soldier.z - prevPos.z);
            const t = segLenSq > 0.0001 ? THREE.MathUtils.clamp(toSoldier.dot(seg) / segLenSq, 0, 1) : 0;
            const point = prevPos.clone().addScaledVector(seg, t);
            const distSq = (point.x - soldier.x) ** 2 + (point.y - centerY) ** 2 + (point.z - soldier.z) ** 2;
            const isPlayer = soldier === window.playerSoldier;
            if (distSq < (isPlayer ? 0.35 : 0.28) && (!closestActor || t < closestActor.t)) {
                closestActor = { t, type: 'soldier', point, soldier, isPlayer };
            }
        }
        if (typeof targets !== 'undefined') {
            for (let t = 0; t < targets.length; t++) {
                const tg = targets[t];
                const toTg = new THREE.Vector3(tg.x - prevPos.x, tg.y - prevPos.y, tg.z - prevPos.z);
                const projT = segLenSq > 0.0001 ? THREE.MathUtils.clamp(toTg.dot(seg) / segLenSq, 0, 1) : 0;
                const point = prevPos.clone().addScaledVector(seg, projT);
                if (point.distanceToSquared(new THREE.Vector3(tg.x, tg.y, tg.z)) < 2.8 &&
                    (!closestActor || projT < closestActor.t)) {
                    closestActor = { t: projT, type: 'target', point, target: tg };
                }
            }
        }

        if (closestActor) {
            hit = true;
            impactPos.copy(closestActor.point);
            if (closestActor.type === 'tank') {
                for (let sp = 0; sp < 6; sp++) {
                    const sVel = new THREE.Vector3((Math.random() - 0.5) * 12, 1.5 + Math.random() * 8, (Math.random() - 0.5) * 12);
                    spawnParticle(impactPos, sVel, 0xfff08a, 0.12, 0.06, 0.4, true, 'spark');
                }
                if (window.soundFX && typeof window.soundFX.playArmorRicochet === 'function') {
                    window.soundFX.playArmorRicochet(impactPos);
                }
            } else if (closestActor.type === 'soldier') {
                const soldier = closestActor.soldier;
                if (typeof soldier.takeDamage === 'function') {
                    soldier.takeDamage(tr.damage !== undefined ? tr.damage : (closestActor.isPlayer ? 25 : 35));
                    if (soldier.isDead && typeof tr.onSoldierKilled === 'function') tr.onSoldierKilled(soldier);
                }
                if (typeof window.spawnParticle === 'function') {
                    window.spawnParticle(impactPos, tr.vel.clone().multiplyScalar(-0.06), 0x991b1b, 0.15, 0.25, 0.45, false, 'smoke');
                }
            } else {
                closestActor.target.hitAngle = Math.min(closestActor.target.hitAngle - 0.08, -0.25);
                closestActor.target.recoverTimer = Math.max(closestActor.target.recoverTimer, 1.2);
            }
        } else if (blockingType === 'tree') {
            hit = true;
            blockingTree.bulletHits = (blockingTree.bulletHits || 0) + 1;
            spawnParticle(impactPos, tr.vel.clone().multiplyScalar(-0.12), (blockingTree.type === 'pine' ? 0x3d281a : 0xdddddd), 0.12, 0.04, 0.35, false, 'spark');
            if (blockingTree.bulletHits >= 4 && window.hitTree) window.hitTree(blockingTree, tr.vel.clone().normalize(), 3.5);
        }

        const hitTerrain = !hit && blockingType === 'terrain';
        if (!hit && blockingType === 'cover') hit = true;

        if (hit || hitTerrain || tr.life <= 0) {
            if (hit || hitTerrain) {
                for (let k = 0; k < 6; k++) {
                    const spkVel = new THREE.Vector3((Math.random() - 0.5) * 8, 2.5 + Math.random() * 5, (Math.random() - 0.5) * 8);
                    spawnParticle(impactPos, spkVel, 0xfde047, 0.12, 0.05, 0.25 + Math.random() * 0.2, true, 'spark');
                }
                const pDustCol = (window.currentZoneConfig && window.currentZoneConfig.trackDustColor) ? window.currentZoneConfig.trackDustColor : 0x785e46;
                spawnParticle(impactPos, new THREE.Vector3(0, 1.2, 0), pDustCol, 0.22, 1.15, 0.65, false, 'dust');
            }
            tr.mesh.visible = false;
            if (tracerPool.length < PROJECTILE_POOL_LIMIT) tracerPool.push(tr.mesh);
            else window.scene.remove(tr.mesh);
            tracers.splice(i, 1);
        }
    }

    // 3. Update Reactive Targets Recovery
    if (typeof targets !== 'undefined') {
        targets.forEach((tg) => {
            if (!tg.targetCursor && typeof window.createRedTargetCursor === 'function' && tg.pivot) {
                tg.targetCursor = window.createRedTargetCursor(0.25, 0.45);
                tg.targetCursor.position.set(0, 2.4, 0);
                tg.targetCursor.userData.baseY = 2.4;
                tg.pivot.add(tg.targetCursor);
            }
            if (tg.targetCursor) {
                tg.targetCursor.rotation.y += dt * 2.0;
            }
            if (tg.recoverTimer > 0) {
                tg.recoverTimer -= dt;
                if (tg.recoverTimer <= 0) tg.plateMat.color.setHex(0xb91c1c);
            } else {
                tg.hitAngle = THREE.MathUtils.lerp(tg.hitAngle, 0, 5 * dt);
            }
            tg.pivot.rotation.x = tg.hitAngle;
        });
    }
}

// Update Volumetric Particles, Sparks, Dynamic Lights & Shockwaves
function updateParticles(dt) {
    // 1. Update Particles (Smoke, Fire, Sparks, Dirt)
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
                if (p.age >= p.life) {
            if (p.isDust) {
                p.mesh.visible = false;
                if (dustPool.length < PARTICLE_POOL_LIMIT) {
                    dustPool.push({ mesh: p.mesh, mat: p.mat });
                } else {
                    window.scene.remove(p.mesh);
                    if (p.mat && p.mat.dispose) p.mat.dispose();
                }
            } else if (p.isPooled) {
                p.mesh.visible = false;
                if (smokePool.length < PARTICLE_POOL_LIMIT) {
                    smokePool.push({ mesh: p.mesh, mat: p.mat });
                } else {
                    window.scene.remove(p.mesh);
                    p.mat.dispose();
                }
            } else if (p.poolKey) {
                const pool = reusableParticlePools.get(p.poolKey);
                if (pool && pool.length < PARTICLE_POOL_LIMIT) {
                    p.mesh.visible = false;
                    pool.push({ mesh: p.mesh, mat: p.mat });
                } else {
                    window.scene.remove(p.mesh);
                    if (p.mat && p.mat.dispose) p.mat.dispose();
                }
            } else {
                window.scene.remove(p.mesh);
                if (p.mat && p.mat.dispose) p.mat.dispose();
            }
            particles.splice(i, 1);
            continue;
        }

        const progress = p.age / p.life;

        // Apply Drag
        p.vel.multiplyScalar(Math.pow(p.drag, dt * 60));

        // Apply Buoyancy or Gravity
        if (p.buoyancy > 0) {
            p.vel.y += p.buoyancy * dt;
        }
        if (p.gravity > 0) {
            p.vel.y -= p.gravity * dt;
        }

        // Advance position
        p.mesh.position.addScaledVector(p.vel, dt);

        // Ground collision & bounce for sparks and dirt
        if (p.gravity > 0) {
            const groundY = getTerrainHeight(p.mesh.position.x, p.mesh.position.z);
            if (p.mesh.position.y <= groundY + 0.06) {
                p.mesh.position.y = groundY + 0.06;
                p.vel.y = -p.vel.y * 0.42; // energy loss on bounce
                p.vel.x *= 0.65;
                p.vel.z *= 0.65;
            }
        }

        // Rotation
        if (p.type === 'spark') {
            if (p.vel.lengthSq() > 0.05) {
                particleDirection.copy(p.vel).normalize();
                p.mesh.quaternion.setFromUnitVectors(PARTICLE_DIRECTION_AXIS, particleDirection);
            }
        } else {
            p.mesh.rotation.x += p.rotVel.x * dt;
            p.mesh.rotation.y += p.rotVel.y * dt;
            p.mesh.rotation.z += p.rotVel.z * dt;
        }

                // Scale & lifecycle curve
        if (p.type === 'dust') {
            const currentScale = THREE.MathUtils.lerp(p.startSize, p.endSize, Math.pow(progress, 0.52));
            p.mesh.scale.setScalar(currentScale);

            if (p.mat && p.mat.uniforms) {
                if (p.mat.uniforms.uAgeProgress) {
                    p.mat.uniforms.uAgeProgress.value = progress;
                }
                if (p.mat.uniforms.opacity) {
                    const fadeIn = Math.min(1.0, progress * 8.0);
                    const fadeOut = Math.max(0.0, (1.0 - progress) / 0.65);
                    const maxOp = (p.maxOpacity !== undefined) ? p.maxOpacity : 0.78;
                    p.mat.uniforms.opacity.value = Math.min(1.0, fadeIn * Math.pow(fadeOut, 1.3)) * maxOp;
                }
            } else if (p.mat) {
                p.mat.opacity = Math.max(0, (1.0 - progress) * (p.maxOpacity || 0.78));
            }

            // Soft ground cushion: dust spreads along the terrain surface
            if (typeof getTerrainHeight === 'function') {
                const groundY = getTerrainHeight(p.mesh.position.x, p.mesh.position.z);
                if (p.mesh.position.y < groundY + 0.16) {
                    p.mesh.position.y = groundY + 0.16;
                    p.vel.y = Math.max(0, p.vel.y * -0.15);
                    p.vel.x *= 0.95;
                    p.vel.z *= 0.95;
                }
            }
        } else if (p.type === 'smoke') {
            // Billowing expansion and volumetric dissipation via Halton sampling
            const currentScale = THREE.MathUtils.lerp(p.startSize, p.endSize, Math.pow(progress, 0.65));
            p.mesh.scale.setScalar(currentScale);

            if (p.mat && p.mat.uniforms) {
                if (p.mat.uniforms.uAgeProgress) {
                    p.mat.uniforms.uAgeProgress.value = progress;
                }
                if (p.mat.uniforms.opacity) {
                    // Rapid initial puff-in, followed by smooth volumetric dissipation
                    const fadeIn = Math.min(1.0, progress * 6.0);
                    const fadeOut = Math.max(0.0, (1.0 - progress) / 0.50);
                    const maxOp = (p.maxOpacity !== undefined) ? p.maxOpacity : 0.92;
                    p.mat.uniforms.opacity.value = Math.min(1.0, fadeIn * fadeOut) * maxOp;
                }
            }
        } else {
            const currentScale = THREE.MathUtils.lerp(p.startSize, p.endSize, Math.pow(progress, 0.7));
            p.mesh.scale.setScalar(currentScale);

            // Realistic non-linear alpha decay
            if (p.type === 'fire') {
                p.mat.opacity = Math.max(0, (1.0 - progress) * 0.95);
            } else if (p.type === 'spark') {
                p.mat.opacity = Math.max(0, (1.0 - Math.pow(progress, 2.0)));
            } else if (p.mat) {
                p.mat.opacity = Math.max(0, 1.0 - progress);
            }
        }
    }

    // 2. Update Dynamic Muzzle & Explosion Flash Lights
    for (let i = dynamicFlashes.length - 1; i >= 0; i--) {
        const fl = dynamicFlashes[i];
        fl.age += dt;
        if (fl.age >= fl.life) {
            fl.light.intensity = DYNAMIC_FLASH_IDLE_INTENSITY;
            fl.light.distance = 1;
            fl.light.position.set(1000000, 1000000, 1000000);
            if (dynamicFlashPool.length < DYNAMIC_FLASH_POOL_SIZE) dynamicFlashPool.push(fl.light);
            dynamicFlashes.splice(i, 1);
            continue;
        }
        const t = fl.age / fl.life;
        fl.light.intensity = fl.maxIntensity * (1.0 - t * t);
    }

    // 3. Update Ground Shockwave Rings
    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.age += dt;
        if (sw.age >= sw.life) {
            sw.mesh.visible = false;
            if (shockwavePool.length < 16) shockwavePool.push({ mesh: sw.mesh, mat: sw.mat });
            else {
                window.scene.remove(sw.mesh);
                sw.mat.dispose();
            }
            shockwaves.splice(i, 1);
            continue;
        }
        const t = sw.age / sw.life;
        const scale = THREE.MathUtils.lerp(0.3, sw.maxRadius, Math.sqrt(t));
        sw.mesh.scale.set(scale, scale, scale);
        sw.mat.opacity = Math.max(0, (1.0 - t) * 0.85);
    }
}

window.tankState = tankState;
window.shells = shells;
window.tracers = tracers;
window.particles = particles;
window.dynamicFlashes = dynamicFlashes;
window.shockwaves = shockwaves;
window.spawnDynamicFlash = spawnDynamicFlash;
window.spawnShockwave = spawnShockwave;
window.spawnParticle = spawnParticle;
window.triggerHeavyDetonation = triggerHeavyDetonation;
window.fireMainCannon = fireMainCannon;
window.fireCoaxMG = fireCoaxMG;
window.fireBowMG = fireBowMG;
window.fireSmokeDischargers = fireSmokeDischargers;
window.updateProjectiles = updateProjectiles;
window.updateParticles = updateParticles;
