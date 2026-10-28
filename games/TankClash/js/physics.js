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
    RELOAD_TIME: 4.2,       // 4.2s reload for 8.8cm KwK 36
    SHELL_VELOCITY: 773,
    MAX_SPEED: 10.6,
    REVERSE_SPEED: 4.2,
    TURN_SPEED: 1.15,
    RECOIL_OFFSET: 0.56,
    hasMuzzleBrake: true,
    currentTankSpec: null,
    coaxMgCooldown: 0,
    bowMgCooldown: 0,
    mgHeat: 0,
    headlightsOn: false,
    hitsCount: 0
};

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
const PARTICLE_POOL_LIMIT = 64;
let particlePoolsPrewarmed = false;

function getParticlePoolKey(type, isAdditive) {
    return `${type}:${isAdditive ? 1 : 0}`;
}

function createParticleObject(type, isAdditive, colorHex) {
    const isSpark = type === 'spark';
    const isFire = type === 'fire';
    const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: isFire ? 0.95 : (isAdditive ? 0.9 : 0.85),
        blending: isAdditive || isFire ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(isSpark ? sparkParticleGeo : sphereParticleGeo, mat);
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
}
window.prewarmParticlePools = prewarmParticlePools;

function createShellObject() {
    const group = new THREE.Group();
    const core = new THREE.Mesh(shellCoreGeo, shellCoreMaterial);
    core.rotation.x = Math.PI / 2;
    group.add(core);

    const flame = new THREE.Mesh(shellFlameGeo, shellFlameMaterial);
    flame.rotation.x = Math.PI / 2;
    flame.position.z = -0.7;
    group.add(flame);

    if (window.excludeFromSSAO) window.excludeFromSSAO(group);
    return group;
}

function createTracerObject() {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(tracerGeo, tracerMaterial);
    mesh.rotation.x = Math.PI / 2;
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
function spawnParticle(pos, vel, colorHex, startSize, endSize, life, isAdditive = false, type = 'smoke') {
    const currentScene = window.scene;
    if (!currentScene) return;

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
            if (mat.uniforms.opacity) mat.uniforms.opacity.value = 0.88;
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
            drag: 0.94,
            buoyancy: 1.4,
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
    if (tankState.reloadTimer > 0) return;
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
                spawnParticle(muzzlePos, sideVel.clone().multiplyScalar(0.55), 0x94a3b8, 0.35, 2.6, 1.6 + Math.random() * 0.8, false, 'smoke');
            }
        });
    } else {
        // Forward high-velocity conical blast cloud
        for (let i = 0; i < 8; i++) {
            const coneVel = shootDir.clone().multiplyScalar(12 + Math.random() * 10)
                .add(rightVec.clone().multiplyScalar((Math.random() - 0.5) * 6))
                .add(upVec.clone().multiplyScalar((Math.random() - 0.2) * 5));
            spawnParticle(muzzlePos, coneVel, 0xf59e0b, 0.32, 1.6, 0.18 + Math.random() * 0.08, true, 'fire');
            spawnParticle(muzzlePos, coneVel.clone().multiplyScalar(0.45), 0x94a3b8, 0.40, 2.8, 1.8 + Math.random() * 0.8, false, 'smoke');
        }
    }

    // 6. Lingering Heavy Barrel Gunsmoke
    for (let i = 0; i < 8; i++) {
        const smokeVel = shootDir.clone().multiplyScalar(6 + Math.random() * 9)
            .add(new THREE.Vector3((Math.random() - 0.5) * 4, 1.4 + Math.random() * 2.5, (Math.random() - 0.5) * 4));
        spawnParticle(muzzlePos, smokeVel, 0x64748b, 0.45, 3.6, 2.2 + Math.random() * 1.0, false, 'smoke');
    }

    // 7. Ground Dust Shockwave Kick-up Under Gun Muzzle
    const groundUnderMuzzle = muzzlePos.clone();
    groundUnderMuzzle.y = getTerrainHeight(muzzlePos.x, muzzlePos.z) + 0.12;
    spawnShockwave(groundUnderMuzzle, 4.8, 0.35, 0xd4a373);
    for (let i = 0; i < 8; i++) {
        const dustVel = new THREE.Vector3(
            (Math.random() - 0.5) * 9,
            0.6 + Math.random() * 1.8,
            (Math.random() - 0.5) * 9
        );
        spawnParticle(groundUnderMuzzle, dustVel, 0x785e46, 0.35, 2.4, 1.4 + Math.random() * 0.8, false, 'smoke');
    }

    // 8. Spawn High-Velocity Armor-Piercing Tracer Shell
    const shellGroup = shellPool.pop() || createShellObject();
    shellGroup.visible = true;
    shellGroup.position.copy(muzzlePos);
    shellGroup.quaternion.copy(barrelQuat);
    if (shellGroup.parent !== window.scene) window.scene.add(shellGroup);

    const shellSpeed = tankState.SHELL_VELOCITY || 773;
    shells.push({
        mesh: shellGroup,
        pos: muzzlePos.clone(),
        vel: shootDir.clone().multiplyScalar(shellSpeed),
        life: 5.0
    });
}

function spawnTracerRound(pos, dir, quat) {
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
        life: 2.5
    });
}

// Fire Coaxial MG34 (Turret Mantlet)
function fireCoaxMG(tankModel) {
    if (tankState.coaxMgCooldown > 0 || tankState.mgHeat >= 100) return;
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

// Fire Front Hull Kugelblende 50 Bow MG34
function fireBowMG(tankModel) {
    if (tankState.bowMgCooldown > 0 || tankState.mgHeat >= 100) return;
    tankState.bowMgCooldown = 0.075;
    tankState.mgHeat = Math.min(100, tankState.mgHeat + 1.8);

    soundFX.playMG34Shot();
    const tm = window.tankModel || tankModel;
    if (!tm || !tm.bowMgBarrel || !tm.hullGroup) return;

    const bowPos = new THREE.Vector3();
    tm.bowMgBarrel.getWorldPosition(bowPos);
    const hullQuat = new THREE.Quaternion();
    tm.hullGroup.getWorldQuaternion(hullQuat);
    const bowDir = new THREE.Vector3(0, 0, 1).applyQuaternion(hullQuat).normalize();

    // Minor mechanical mount jitter
    bowDir.x += (Math.random() - 0.5) * 0.025;
    bowDir.y += (Math.random() - 0.5) * 0.022;
    bowDir.normalize();

    spawnTracerRound(bowPos, bowDir, hullQuat);
}

// Fire Turret-Mounted Nebelwurfgerät Smoke Grenade Dischargers
function fireSmokeDischargers(tankModel) {
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
function triggerHeavyDetonation(pos) {
    soundFX.playImpactExplosion();

    // 1. Blinding Detonation Flash Light
    spawnDynamicFlash(pos, 0xfff08a, 24.0, 55.0, 0.18);

    // 2. Expanding Ground Blast Shockwave Ring
    spawnShockwave(pos, 8.5, 0.45, 0xfef08a);

    // 3. Central White-Hot to Fiery Orange Fireball Plume
    for (let i = 0; i < 7; i++) {
        const fireVel = new THREE.Vector3(
            (Math.random() - 0.5) * 8.0,
            3.5 + Math.random() * 8.5,
            (Math.random() - 0.5) * 8.0
        );
        const col = (i % 3 === 0) ? 0xfffbeb : ((i % 3 === 1) ? 0xf59e0b : 0xd97706);
        spawnParticle(pos, fireVel, col, 0.85, 4.6, 0.35 + Math.random() * 0.25, true, 'fire');
    }

    // 4. Giant Billowing Charcoal/Black Smoke Plume that rises into sky
    for (let i = 0; i < 8; i++) {
        const smokeVel = new THREE.Vector3(
            (Math.random() - 0.5) * 9.5,
            2.5 + Math.random() * 7.5,
            (Math.random() - 0.5) * 9.5
        );
        const col = (i % 2 === 0) ? 0x1e242b : 0x475569;
        spawnParticle(pos, smokeVel, col, 0.65, 5.8, 2.5 + Math.random() * 1.8, false, 'smoke');
    }

    // 5. Fountain of Incandescent Shrapnel Sparks
    for (let i = 0; i < 16; i++) {
        const sparkVel = new THREE.Vector3(
            (Math.random() - 0.5) * 26.0,
            6.0 + Math.random() * 22.0,
            (Math.random() - 0.5) * 26.0
        );
        spawnParticle(pos, sparkVel, (Math.random() > 0.3) ? 0xfbbf24 : 0xf97316, 0.18, 0.08, 0.8 + Math.random() * 1.1, true, 'spark');
    }

    // 6. Heavy Clods of Earth & Shrapnel Debris
    for (let i = 0; i < 7; i++) {
        const dirtVel = new THREE.Vector3(
            (Math.random() - 0.5) * 16.0,
            4.0 + Math.random() * 14.0,
            (Math.random() - 0.5) * 16.0
        );
        spawnParticle(pos, dirtVel, 0x3d3126, 0.32, 0.95, 1.2 + Math.random() * 0.8, false, 'dirt');
    }
}

// Continuous Collision Detection (CCD) and Ballistic Trajectory Updates
function updateProjectiles(dt) {
    // 1. Update 8.8cm Cannon Shells (773 m/s)
    for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i];
        const prevPos = s.pos.clone();

        s.vel.y -= 9.81 * dt;
        s.pos.addScaledVector(s.vel, dt);
        s.mesh.position.copy(s.pos);

        const velDir = s.vel.clone().normalize();
        s.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), velDir);
        s.life -= dt;

        // CCD against targets
        const seg = s.pos.clone().sub(prevPos);
        const segLenSq = seg.lengthSq();
        let hit = false;
        let impactPos = s.pos.clone();

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
                hit = true;
                impactPos = closestPt;
                tg.hitAngle = -Math.PI * 0.46;
                tg.recoverTimer = 4.5;
                tg.plateMat.color.setHex(0xf59e0b);
                tankState.hitsCount++;
                break;
            }
        }

        // Check collision against forest trees (Shoot tree down with 88mm shell)
        if (!hit) {
            const trees = window.swayTrees || [];
            for (let tr = 0; tr < trees.length; tr++) {
                const tree = trees[tr];
                if (tree.isFallen) continue;
                const toTree = new THREE.Vector3(tree.x - prevPos.x, (tree.y + tree.trunkHeight * 0.45) - prevPos.y, tree.z - prevPos.z);
                const projT = (segLenSq > 0.0001) ? THREE.MathUtils.clamp(toTree.dot(seg) / segLenSq, 0, 1) : 0;
                const closestPt = prevPos.clone().addScaledVector(seg, projT);
                const dSq = (closestPt.x - tree.x) ** 2 + (closestPt.z - tree.z) ** 2;
                if (dSq < tree.radius * tree.radius * 2.2 && closestPt.y >= tree.y - 0.2 && closestPt.y <= tree.y + tree.trunkHeight * 1.2) {
                    hit = true;
                    impactPos = closestPt;
                    if (window.hitTree) window.hitTree(tree, s.vel.clone().normalize(), 7.5);
                    break;
                }
            }
        }

        // CCD against terrain
        const groundPrev = getTerrainHeight(prevPos.x, prevPos.z);
        const groundNext = getTerrainHeight(s.pos.x, s.pos.z);
        let hitTerrain = false;
        if (!hit && (s.pos.y <= groundNext || prevPos.y <= groundPrev)) {
            hitTerrain = true;
            const denom = (prevPos.y - groundPrev) - (s.pos.y - groundNext);
            const tG = Math.abs(denom) > 0.0001 ? THREE.MathUtils.clamp((prevPos.y - groundPrev) / denom, 0, 1) : 1;
            impactPos = prevPos.clone().lerp(s.pos, tG);
            impactPos.y = Math.max(impactPos.y, getTerrainHeight(impactPos.x, impactPos.z) + 0.15);
        }

        if (hit || hitTerrain || s.life <= 0) {
            if (hit || hitTerrain) {
                triggerHeavyDetonation(impactPos);
            }
            s.mesh.visible = false;
            if (shellPool.length < PROJECTILE_POOL_LIMIT) shellPool.push(s.mesh);
            else window.scene.remove(s.mesh);
            shells.splice(i, 1);
        }
    }

    // 2. Update MG34 Tracers (765 m/s)
    for (let i = tracers.length - 1; i >= 0; i--) {
        const tr = tracers[i];
        const prevPos = tr.pos.clone();
        tr.vel.y -= 9.81 * 0.5 * dt;
        tr.pos.addScaledVector(tr.vel, dt);
        tr.mesh.position.copy(tr.pos);
        const trVelDir = tr.vel.clone().normalize();
        tr.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), trVelDir);
        tr.life -= dt;

        const seg = tr.pos.clone().sub(prevPos);
        const segLenSq = seg.lengthSq();
        let hit = false;
        let impactPos = tr.pos.clone();

        for (let t = 0; t < targets.length; t++) {
            const tg = targets[t];
            const toTg = new THREE.Vector3(tg.x - prevPos.x, tg.y - prevPos.y, tg.z - prevPos.z);
            let projT = 0;
            if (segLenSq > 0.0001) {
                projT = THREE.MathUtils.clamp(toTg.dot(seg) / segLenSq, 0, 1);
            }
            const closestPt = prevPos.clone().addScaledVector(seg, projT);
            const distSq = closestPt.distanceToSquared(new THREE.Vector3(tg.x, tg.y, tg.z));
            if (distSq < 2.8) {
                hit = true;
                impactPos = closestPt;
                tg.hitAngle = Math.min(tg.hitAngle - 0.08, -0.25);
                tg.recoverTimer = Math.max(tg.recoverTimer, 1.2);
                break;
            }
        }

        // Check MG burst against forest trees
        if (!hit) {
            const trees = window.swayTrees || [];
            for (let trk = 0; trk < trees.length; trk++) {
                const tree = trees[trk];
                if (tree.isFallen) continue;
                const dSq = (tr.pos.x - tree.x) ** 2 + (tr.pos.z - tree.z) ** 2;
                if (dSq < tree.radius * tree.radius && tr.pos.y >= tree.y && tr.pos.y <= tree.y + tree.trunkHeight) {
                    hit = true;
                    impactPos = tr.pos.clone();
                    tree.bulletHits = (tree.bulletHits || 0) + 1;
                    spawnParticle(tr.pos, tr.vel.clone().multiplyScalar(-0.12), (tree.type === 'pine' ? 0x3d281a : 0xdddddd), 0.12, 0.04, 0.35, false, 'spark');
                    if (tree.bulletHits >= 4 && window.hitTree) {
                        window.hitTree(tree, tr.vel.clone().normalize(), 3.5);
                    }
                    break;
                }
            }
        }

        const groundNext = getTerrainHeight(tr.pos.x, tr.pos.z);
        let hitTerrain = false;
        if (!hit && tr.pos.y <= groundNext) {
            hitTerrain = true;
            impactPos = tr.pos.clone();
            impactPos.y = groundNext + 0.08;
        }

        if (hit || hitTerrain || tr.life <= 0) {
            if (hit || hitTerrain) {
                // High-velocity bullet ricochet spark shower
                for (let k = 0; k < 6; k++) {
                    const spkVel = new THREE.Vector3((Math.random() - 0.5) * 8, 2.5 + Math.random() * 5, (Math.random() - 0.5) * 8);
                    spawnParticle(impactPos, spkVel, 0xfde047, 0.12, 0.05, 0.25 + Math.random() * 0.2, true, 'spark');
                }
                spawnParticle(impactPos, new THREE.Vector3(0, 1.2, 0), 0x785e46, 0.22, 0.95, 0.65, false, 'smoke');
            }
            tr.mesh.visible = false;
            if (tracerPool.length < PROJECTILE_POOL_LIMIT) tracerPool.push(tr.mesh);
            else window.scene.remove(tr.mesh);
            tracers.splice(i, 1);
        }
    }

    // 3. Update Reactive Targets Recovery
    targets.forEach((tg) => {
        if (tg.recoverTimer > 0) {
            tg.recoverTimer -= dt;
            if (tg.recoverTimer <= 0) tg.plateMat.color.setHex(0xb91c1c);
        } else {
            tg.hitAngle = THREE.MathUtils.lerp(tg.hitAngle, 0, 5 * dt);
        }
        tg.pivot.rotation.x = tg.hitAngle;
    });
}

// Update Volumetric Particles, Sparks, Dynamic Lights & Shockwaves
function updateParticles(dt) {
    // 1. Update Particles (Smoke, Fire, Sparks, Dirt)
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
        if (p.age >= p.life) {
            if (p.isPooled) {
                p.mesh.visible = false;
                if (smokePool.length < PARTICLE_POOL_LIMIT) {
                    smokePool.push({ mesh: p.mesh, mat: p.mat });
                } else {
                    window.scene.remove(p.mesh);
                    p.mat.dispose();
                }
            } else {
                const pool = reusableParticlePools.get(p.poolKey);
                if (pool && pool.length < PARTICLE_POOL_LIMIT) {
                    p.mesh.visible = false;
                    pool.push({ mesh: p.mesh, mat: p.mat });
                } else {
                    window.scene.remove(p.mesh);
                    if (p.mat && p.mat.dispose) p.mat.dispose();
                }
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
        if (p.type === 'smoke') {
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
                    p.mat.uniforms.opacity.value = Math.min(1.0, fadeIn * fadeOut) * 0.92;
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
