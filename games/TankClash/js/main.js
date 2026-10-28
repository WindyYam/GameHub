// ============================================================================
// TigerTank Main Engine & Simulation Orchestrator
// Coordinates 3D Scene, PBR Shaders, Physics, Controls & HUD Telemetry
// ============================================================================

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x82b4dc);
scene.fog = new THREE.FogExp2(0x82b4dc, 0.00085);
window.scene = scene;

// 1. Perspective Camera
const perspCamera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.15, 800);
window.perspCamera = perspCamera;

// 2. Orthographic Camera (Seamless switch via 'O' key or HUD button)
const orthoFrustumSize = 18;
window.orthoFrustumSize = orthoFrustumSize;
const aspect = window.innerWidth / window.innerHeight;
const orthoCamera = new THREE.OrthographicCamera(
    -orthoFrustumSize * aspect / 2,
     orthoFrustumSize * aspect / 2,
     orthoFrustumSize / 2,
    -orthoFrustumSize / 2,
    -200,
    800
);
orthoCamera.zoom = 1.15;
orthoCamera.updateProjectionMatrix();
window.orthoCamera = orthoCamera;

let activeCamera = perspCamera;
window.activeCamera = activeCamera;

// 3. WebGL High-Performance Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputEncoding = THREE.sRGBEncoding;
container.appendChild(renderer.domElement);
window.renderer = renderer;

// High-Fidelity PBR IBL Environment Map for Rolled Armor Steel & Metallic Highlights
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

function generateSteelEnvironmentMap() {
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 512;
    envCanvas.height = 256;
    const ctx = envCanvas.getContext('2d');

    // Realistic coastal atmospheric reflection gradient
    // Cold zenith sky, soft hazy horizon, neutral ground plane
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.00, '#3a5f8a'); // Cold sky reflection
    grad.addColorStop(0.35, '#6a8ea8'); 
    grad.addColorStop(0.48, '#a2bace'); // Specular horizon glint
    grad.addColorStop(0.52, '#6d7870'); // Countryside ground transition
    grad.addColorStop(0.75, '#485244'); // Grassy earth bounce
    grad.addColorStop(1.00, '#2e352b'); // Undercarriage occlusion
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // Add soft directional sun glade onto the equirectangular map
    const sunGrad = ctx.createRadialGradient(256, 110, 2, 256, 110, 85);
    sunGrad.addColorStop(0, 'rgba(255, 250, 240, 0.95)');
    sunGrad.addColorStop(0.3, 'rgba(255, 235, 205, 0.45)');
    sunGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(170, 25, 172, 170);

    const envTex = new THREE.CanvasTexture(envCanvas);
    const rt = pmremGenerator.fromEquirectangular(envTex);
    envTex.dispose();
    return rt.texture;
}

const steelEnvMap = generateSteelEnvironmentMap();
scene.environment = steelEnvMap;
window.steelEnvMap = steelEnvMap;

const composer = new THREE.EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
if (composer.renderTarget1) composer.renderTarget1.texture.encoding = THREE.sRGBEncoding;
if (composer.renderTarget2) composer.renderTarget2.texture.encoding = THREE.sRGBEncoding;
const ssaoPass = new THREE.SSAOPass(scene, perspCamera, window.innerWidth, window.innerHeight);
ssaoPass.kernelRadius = 8;
ssaoPass.minDistance = 0.005;
ssaoPass.maxDistance = 0.12;
composer.addPass(ssaoPass);
window.ssaoPass = ssaoPass;

const SSAO_FX_LAYER = 1;
function excludeFromSSAO(object) {
    object.traverse(child => child.layers.set(SSAO_FX_LAYER));
}
window.excludeFromSSAO = excludeFromSSAO;

class FXCompositePass extends THREE.Pass {
    constructor(scene) {
        super();
        this.scene = scene;
        this.needsSwap = true;
        this.copyMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(THREE.CopyShader.uniforms),
            vertexShader: THREE.CopyShader.vertexShader,
            fragmentShader: THREE.CopyShader.fragmentShader,
            depthTest: false,
            depthWrite: false
        });
        this.fullScreenQuad = new THREE.FullScreenQuad(this.copyMaterial);
        this.depthMaterial = new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthTest: true,
            depthWrite: true
        });
    }

    render(renderer, writeBuffer, readBuffer) {
        const camera = ssaoPass.camera;
        const oldTarget = renderer.getRenderTarget();
        const oldAutoClear = renderer.autoClear;
        const oldCameraMask = camera.layers.mask;
        const oldOverrideMaterial = this.scene.overrideMaterial;
        const oldBackground = this.scene.background;

        try {
            renderer.autoClear = false;
            renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
            renderer.clear(true, true, true);
            this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture;
            this.fullScreenQuad.render(renderer);

            renderer.clearDepth();
            this.scene.background = null;
            camera.layers.set(0);
            this.scene.overrideMaterial = this.depthMaterial;
            renderer.render(this.scene, camera);

            this.scene.overrideMaterial = oldOverrideMaterial;
            camera.layers.set(SSAO_FX_LAYER);
            renderer.render(this.scene, camera);
        } finally {
            this.scene.overrideMaterial = oldOverrideMaterial;
            this.scene.background = oldBackground;
            camera.layers.mask = oldCameraMask;
            renderer.autoClear = oldAutoClear;
            renderer.setRenderTarget(oldTarget);
        }
    }

    dispose() {
        this.copyMaterial.dispose();
        this.depthMaterial.dispose();
        this.fullScreenQuad.dispose();
    }
}

const fxCompositePass = new FXCompositePass(scene);
composer.addPass(fxCompositePass);

// 4. Atmospheric Battlefield Lighting
const hemiLight = new THREE.HemisphereLight(0xfff7ed, 0x526b38, 0.85);
scene.add(hemiLight);

// Balanced Omnidirectional Ambient Fill (eliminates crushed black shadows on tank flanks)
const ambientLight = new THREE.AmbientLight(0xdce7f2, 0.40);
scene.add(ambientLight);
window.ambientLight = ambientLight;

// Soft directional fill light targeting the tank's shadowed flank
const fillLight = new THREE.DirectionalLight(0xb8cde0, 0.38);
fillLight.castShadow = false;
scene.add(fillLight);
window.fillLight = fillLight;

// ============================================================================
// REALISTIC DYNAMIC DAY / NIGHT CYCLE MANAGER
// ============================================================================
const dayNight = {
    time: 12.0,        // Current hour (0.00 to 24.00, starts at midday)
    speed: 0.02,       // Progress rate (~20 minutes per 24-hour cycle)
    paused: false,
    phase: 'Day',
    setTime(h) {
        this.time = (h % 24 + 24) % 24;
    },
    cycleNext() {
        if (this.time >= 5.5 && this.time < 16.5) {
            this.time = 18.2; // Sunset
        } else if (this.time >= 16.5 && this.time < 20.2) {
            this.time = 22.5; // Moonlit Night
        } else if (this.time >= 20.2 || this.time < 4.5) {
            this.time = 5.5;  // Dawn / Sunrise
        } else {
            this.time = 11.5; // Midday
        }
    }
};
window.dayNight = dayNight;

// Physically calibrated 24-hour celestial color palette (Mediterranean Seaside Countryside fidelity)
const DAY_NIGHT_COLORS = {
    noonSun:     new THREE.Color(0xfff6eb),
    goldenHour:  new THREE.Color(0xff7a32),
    dayTop:      new THREE.Color(0x1958aa),
    dayHor:      new THREE.Color(0x82b6e5),
    sunTop:      new THREE.Color(0x16193b),
    sunHor:      new THREE.Color(0xe05a1e),
    nitTop:      new THREE.Color(0x03091e),
    nitHor:      new THREE.Color(0x0d1b35),
    groundDay:   new THREE.Color(0x56733a),
    groundNight: new THREE.Color(0x141f16)
};

const sunLight = new THREE.DirectionalLight(0xfff1db, 1.45);
sunLight.position.set(45, 55, 38);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 5;
sunLight.shadow.camera.far = 180;
const d = 48;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
sunLight.shadow.bias = -0.0005;
sunLight.shadow.radius = 2.5; // Soften PCF shadow filter kernel for large-scale contact occlusion
scene.add(sunLight);
window.sunLight = sunLight;

// Secondary Moon Directional Light for Authentic Nighttime Illumination
const moonLight = new THREE.DirectionalLight(0x8ab4f8, 0.0);
moonLight.position.set(-45, 55, -38);
moonLight.castShadow = false;
moonLight.shadow.mapSize.width = 2048;
moonLight.shadow.mapSize.height = 2048;
moonLight.shadow.camera.near = 5;
moonLight.shadow.camera.far = 180;
moonLight.shadow.camera.left = -d;
moonLight.shadow.camera.right = d;
moonLight.shadow.camera.top = d;
moonLight.shadow.camera.bottom = -d;
moonLight.shadow.bias = -0.0005;
scene.add(moonLight);
window.moonLight = moonLight;

const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
rimLight.position.set(-35, 22, -30);
scene.add(rimLight);

// ============================================================================
// SYSTEM INITIALIZATION
// ============================================================================
const mats = createMaterials();
window.mats = mats;

initEnvironment(scene);
buildEnvironment();
prewarmParticlePools();

const tank = (typeof window.buildTankById === 'function') 
    ? window.buildTankById('tiger', scene, mats) 
    : (typeof buildTigerTank === 'function' ? buildTigerTank(scene, mats) : null);
window.tankModel = tank;
if (window.TANK_SPECS) {
    tankState.currentTankSpec = window.TANK_SPECS.tiger;
    if (typeof window.updateTankHUD === 'function') {
        window.updateTankHUD(window.TANK_SPECS.tiger);
    }
}

initControls(renderer);
if (typeof updateTracksGeometry === 'function') {
    updateTracksGeometry(0, 0);
} else if (typeof window.updateTracksGeometry === 'function') {
    window.updateTracksGeometry(0, 0);
}

// Ensure tank is seated cleanly on the road surface at spawn
const initSpawnY = getTerrainHeight(0, 0);
tankState.y = initSpawnY;
if (tankRoot) {
    tankRoot.position.set(0, initSpawnY, 0);
}
const seedBadge = document.getElementById('hud-seed-display');
if (seedBadge && window.currentSeed) {
    seedBadge.textContent = 'Seed: ' + window.currentSeed;
}

// ============================================================================
// MAIN SIMULATION & PHYSICS LOOP
// ============================================================================
let lastTime = performance.now();

function updateSimulation(dt) {
    const nowSec = performance.now() * 0.001;
    const currentActiveCam = window.activeCamera || activeCamera;

    // --- 1. DRIVING & TRACTOR FORCE DYNAMICS (Mass, Engine Power, Slope Gravity, Rolling Resistance) ---
    const forwardInput = ((keys['w'] ? 1 : 0) - (keys['s'] ? 1 : 0)) || touchDrive.forward;
    const turnInput    = ((keys['a'] ? 1 : 0) - (keys['d'] ? 1 : 0)) || touchDrive.turn;

    const currentSpec = tankState.currentTankSpec || (window.TANK_SPECS && window.TANK_SPECS[window.currentTankId || 'tiger']) || {
        massKg: 57000,
        enginePowerKW: 515,
        maxSpeed: 10.6,
        reverseSpeed: 4.2,
        turnSpeed: 1.15
    };

    const mass = currentSpec.massKg || (parseFloat(currentSpec.weight) * 1000) || 57000;
    const enginePower = (currentSpec.enginePowerKW || 515) * 1000; // in Watts
    const transmissionEfficiency = 0.82;
    const maxSpeed = tankState.MAX_SPEED || currentSpec.maxSpeed || 10.6;
    const revSpeed = tankState.REVERSE_SPEED || currentSpec.reverseSpeed || 4.2;
    const turnStrength = tankState.TURN_SPEED || currentSpec.turnSpeed || 1.15;
    const gravity = 9.81;

    // A. Longitudinal Slope Gravity Force:
    // When climbing (pitch > 0, nose up), gravity pulls the tank backwards.
    // When descending (pitch < 0, nose down), gravity accelerates the tank forwards.
    const slopePitch = tankState.pitch;
    const F_gravity = -mass * gravity * Math.sin(slopePitch);

    // Normal Force perpendicular to terrain slope
    const normalForce = Math.max(0.1, mass * gravity * Math.cos(slopePitch));

    // B. Rolling Resistance of steel tracks over terrain / earth
    const crr = 0.048;
    const isMoving = Math.abs(tankState.speed) > 0.05;
    const F_roll = -(isMoving ? Math.sign(tankState.speed) : forwardInput) * crr * normalForce;

    // C. Engine Tractive Force & Dynamic Track Band Braking
    let F_engine = 0;
    const maxTrackAdhesion = 0.80 * normalForce; // Limit by track friction on ground

    if (forwardInput > 0) {
        if (tankState.speed < -0.25) {
            // Foot brake applied while rolling backwards: strong mechanical track band brakes
            F_engine = mass * 7.5;
        } else {
            // Forward tractive effort: Power / velocity curve with low-end adhesion limit
            const effectiveSpeed = Math.max(Math.abs(tankState.speed), 1.35);
            let rawTractiveForce = Math.min(maxTrackAdhesion, (enginePower * transmissionEfficiency) / effectiveSpeed);
            // Speed governor roll-off as vehicle approaches maximum top gear speed
            const speedRatio = Math.max(0, tankState.speed / maxSpeed);
            const govFactor = Math.max(0, 1.0 - Math.pow(speedRatio, 2));
            F_engine = rawTractiveForce * govFactor * forwardInput;
        }
    } else if (forwardInput < 0) {
        if (tankState.speed > 0.25) {
            // Foot brake applied while driving forward: rapid braking deceleration
            F_engine = -mass * 7.5;
        } else {
            // Reverse gear tractive effort
            const effectiveSpeed = Math.max(Math.abs(tankState.speed), 1.35);
            let rawTractiveForce = Math.min(maxTrackAdhesion * 0.75, (enginePower * 0.50 * transmissionEfficiency) / effectiveSpeed);
            const speedRatio = Math.max(0, -tankState.speed / revSpeed);
            const govFactor = Math.max(0, 1.0 - Math.pow(speedRatio, 2));
            F_engine = -rawTractiveForce * govFactor * Math.abs(forwardInput);
        }
    } else {
        // Neutral / Throttle Idle: Engine compression resistance and static track friction
        if (isMoving) {
            // Engine compression braking & track drag
            F_engine = -tankState.speed * (mass * 0.45);
        } else if (Math.abs(slopePitch) < 0.28) {
            // Static track grip & transmission gear hold on slopes up to ~16°
            F_engine = -F_gravity;
        }
    }

    // Net longitudinal force and resulting acceleration (F = m * a)
    const F_net = F_engine + F_gravity + F_roll;
    const accel = F_net / mass;
    tankState.speed += accel * dt;

    // Terminal velocity caps under extreme downhill runs
    const terminalMax = maxSpeed * 1.55;
    const terminalRev = revSpeed * 1.40;
    tankState.speed = THREE.MathUtils.clamp(tankState.speed, -terminalRev, terminalMax);

    // Static stick threshold on moderate slopes when idling
    if (forwardInput === 0 && Math.abs(tankState.speed) < 0.08 && Math.abs(slopePitch) < 0.28) {
        tankState.speed = 0;
    }

    // Longitudinal acceleration squat/dive impulse on chassis
    tankState.pitchVel += accel * 0.012 * dt;

    // Neutral / Pivot Steering Dynamics with track ground scrub resistance
    const scrubFactor = 1.0 - Math.min(0.35, Math.abs(tankState.speed) / maxSpeed * 0.3);
    if (turnInput !== 0) {
        tankState.turnRate = THREE.MathUtils.lerp(tankState.turnRate, turnInput * (0.85 * (turnStrength / 1.15)) * scrubFactor, 6 * dt);
    } else {
        tankState.turnRate *= Math.pow(0.04, dt);
        if (Math.abs(tankState.turnRate) < 0.005) tankState.turnRate = 0;
    }

    tankState.heading += tankState.turnRate * dt;

    // Projected horizontal ground displacement along terrain slope
    const horizSpeed = tankState.speed * Math.cos(tankState.pitch);
    tankState.x += Math.sin(tankState.heading) * horizSpeed * dt;
    tankState.z += Math.cos(tankState.heading) * horizSpeed * dt;

    // Kick up muddy track dirt particles when driving in the wild
    if (window.environmentMode === 'wild' && (Math.abs(tankState.speed) > 1.2 || Math.abs(tankState.turnRate) > 0.2) && Math.random() < 1.0 - Math.exp(-3.0 * dt)) {
        [-1.38, 1.38].forEach((sideX) => {
            const kickPos = new THREE.Vector3(sideX, -0.85, -2.4);
            hullGroup.localToWorld(kickPos);
            const kickVel = new THREE.Vector3((Math.random() - 0.5) * 2.5, 1.8 + Math.random() * 2.0, (Math.random() - 0.5) * 2.5);
            spawnParticle(kickPos, kickVel, 0x5c4d3c, 0.18, 0.65, 0.45, false, 'dirt');
        });
    }

    // Realistic Twin Armored Exhaust Puffs (Maybach HL230 V12 Engine)
    const exhaustPuffRate = forwardInput !== 0 ? 5.0 : 1.5;
    if (Math.random() < 1.0 - Math.exp(-exhaustPuffRate * dt)) {
        [-0.52, 0.52].forEach((ex) => {
            const exhaustPos = new THREE.Vector3(ex, 0.82, -2.75);
            hullGroup.localToWorld(exhaustPos);
            const exhaustVel = new THREE.Vector3(
                (Math.random() - 0.5) * 0.4 - Math.sin(tankState.heading) * tankState.speed * 0.25,
                0.55 + Math.random() * 0.65,
                (Math.random() - 0.5) * 0.4 - Math.cos(tankState.heading) * tankState.speed * 0.25
            );
            const col = (forwardInput !== 0) ? 0x334155 : 0x64748b;
            spawnParticle(exhaustPos, exhaustVel, col, 0.12, 0.72, 0.85 + Math.random() * 0.45, false, 'smoke');
        });
    }

    // Update Engine Audio
    const speedRatio = Math.min(1, Math.abs(tankState.speed) / maxSpeed + Math.abs(tankState.turnRate) * 0.3);
    soundFX.updateEngine(speedRatio, forwardInput !== 0 || turnInput !== 0);

    // --- 1b. TANK VS BUILDING COLLISION (Stop tank at solid house walls) ---
    const worldBldgs = window.worldBuildings || [];
    for (let bi = 0; bi < worldBldgs.length; bi++) {
        const b = worldBldgs[bi];
        const bdx = tankState.x - b.x;
        const bdz = tankState.z - b.z;
        const bDist = Math.hypot(bdx, bdz);
        const minClearance = (b.radius || 3.5) + 1.8;
        if (bDist < minClearance && bDist > 0.001) {
            const overlap = minClearance - bDist;
            tankState.x += (bdx / bDist) * overlap;
            tankState.z += (bdz / bDist) * overlap;
            tankState.speed *= 0.6;
        }
    }

    // --- 2. MULTI-WHEEL GROUND PLANE FITTING & SUSPENSION DYNAMICS ---
    const cosH = Math.cos(tankState.heading);
    const sinH = Math.sin(tankState.heading);

    // Collect all road wheel stations or default footprint corners
    const leftStations = (roadWheelStations && roadWheelStations.left && roadWheelStations.left.length > 0) ? roadWheelStations.left : [];
    const rightStations = (roadWheelStations && roadWheelStations.right && roadWheelStations.right.length > 0) ? roadWheelStations.right : [];
    const allStations = [...leftStations, ...rightStations];

    let sumH = 0;
    let sumZ = 0;
    let sumX = 0;
    let sumZZ = 0;
    let sumXX = 0;
    let sumZH = 0;
    let sumXH = 0;
    const numStations = allStations.length;

    // Sample terrain height at each wheel contact patch and accumulate least-squares statistics
    for (let i = 0; i < numStations; i++) {
        const st = allStations[i];
        const wx = tankState.x + st.x * cosH + st.z * sinH;
        const wz = tankState.z - st.x * sinH + st.z * cosH;
        const gh = getTerrainHeight(wx, wz);
        st.lastGroundH = gh;

        sumH  += gh;
        sumZ  += st.z;
        sumX  += st.x;
        sumZZ += st.z * st.z;
        sumXX += st.x * st.x;
        sumZH += st.z * gh;
        sumXH += st.x * gh;
    }

    let targetPitch = 0;
    let targetRoll = 0;
    let avgGroundH = tankState.y;

    if (numStations > 0) {
        avgGroundH = sumH / numStations;
        const varZ = sumZZ - (sumZ * sumZ) / numStations;
        const varX = sumXX - (sumX * sumX) / numStations;
        const covZH = sumZH - (sumZ * sumH) / numStations;
        const covXH = sumXH - (sumX * sumH) / numStations;

        const slopeZ = varZ > 0.001 ? covZH / varZ : 0;
        const slopeX = varX > 0.001 ? covXH / varX : 0;

        targetPitch = Math.atan(slopeZ);
        targetRoll  = Math.atan(slopeX);
    } else {
        avgGroundH = getTerrainHeight(tankState.x, tankState.z);
    }

    // Dynamic Suspension Tracking: Spring-damper physics towards terrain ground plane
    const pitchSpringK = 40.0;
    const pitchDampC = 8.5;
    const pitchForce = (targetPitch - tankState.pitch) * pitchSpringK - tankState.pitchVel * pitchDampC;
    tankState.pitchVel += pitchForce * dt;
    tankState.pitch += tankState.pitchVel * dt;

    // Centrifugal body roll during turns at speed
    const rollSpringK = 44.0;
    const rollDampC = 9.0;
    const centrifugalRoll = -(tankState.speed * tankState.turnRate) * 0.035;
    const rollForce = (targetRoll - tankState.roll) * rollSpringK - tankState.rollVel * rollDampC + centrifugalRoll;
    tankState.rollVel += rollForce * dt;
    tankState.roll += tankState.rollVel * dt;

    // Vertical heave tracking & hull bounce
    tankState.y = THREE.MathUtils.lerp(tankState.y, avgGroundH, Math.min(1.0, 12.0 * dt));
    const heaveForce = -tankState.heave * 42.0 - tankState.heaveVel * 7.5;
    tankState.heaveVel += heaveForce * dt;
    tankState.heave += tankState.heaveVel * dt;

    // Individual road wheel suspension articulation relative to tilted hull floor
    for (let i = 0; i < numStations; i++) {
        const st = allStations[i];
        const hullWheelH = (tankState.y + tankState.heave) + st.z * Math.sin(tankState.pitch) + st.x * Math.sin(tankState.roll);
        const targetOffset = THREE.MathUtils.clamp(st.lastGroundH - hullWheelH, -0.22, 0.30);

        const springK = 150.0;
        const dampingC = 18.0;
        const force = (targetOffset - st.currentOffset) * springK - st.velocityY * dampingC;
        st.velocityY += force * dt;
        st.currentOffset = THREE.MathUtils.clamp(st.currentOffset + st.velocityY * dt, -0.22, 0.30);

        if (st.cluster) {
            st.cluster.position.y = st.baseY + st.currentOffset;
        }
    }

    // Apply transforms to Tank Root & Chassis BEFORE computing camera & local turret aim
    tankRoot.position.set(tankState.x, tankState.y, tankState.z);
    tankRoot.rotation.y = tankState.heading;

    hullGroup.position.y = 0.92 + tankState.heave;
    hullGroup.rotation.x = -tankState.pitch;
    hullGroup.rotation.z = tankState.roll;
    tankRoot.updateMatrixWorld(true);

    // --- 3. CAMERA POSITIONING & 3D RAYCAST AIMING SYSTEM ---
    if (cameraMode === 'orbit') {
        const tankAnchor = new THREE.Vector3(tankState.x, tankState.y + 1.85, tankState.z);

        // Compute camera forward view direction from player mouse orbit angles (theta, phi)
        const lookDir = new THREE.Vector3(
            -Math.sin(camOrbit.phi) * Math.sin(camOrbit.theta),
            -Math.cos(camOrbit.phi),
            -Math.sin(camOrbit.phi) * Math.cos(camOrbit.theta)
        ).normalize();

        // Position camera behind tank along -lookDir, and offset up so view center is above turret
        const camDist = camOrbit.distance;
        const camPos = tankAnchor.clone()
            .addScaledVector(lookDir, -camDist)
            .add(new THREE.Vector3(0, 1.65, 0));

        // Terrain collision clearance
        const minCamY = getTerrainHeight(camPos.x, camPos.z) + 0.55;
        if (camPos.y < minCamY) camPos.y = minCamY;

        const lookTarget = camPos.clone().addScaledVector(lookDir, 100.0);
        currentActiveCam.position.copy(camPos);
        currentActiveCam.lookAt(lookTarget);
        currentActiveCam.updateMatrixWorld();
    } else if (cameraMode === 'inspect') {
        const lookPivot = new THREE.Vector3(tankState.x, tankState.y + 1.85, tankState.z);
        const cx = lookPivot.x + camOrbit.distance * Math.sin(camOrbit.phi) * Math.sin(camOrbit.theta);
        const cz = lookPivot.z + camOrbit.distance * Math.sin(camOrbit.phi) * Math.cos(camOrbit.theta);
        const minCamY = getTerrainHeight(cx, cz) + 0.45;
        const cy = Math.max(minCamY, lookPivot.y + camOrbit.distance * Math.cos(camOrbit.phi));
        currentActiveCam.position.set(cx, cy, cz);
        currentActiveCam.lookAt(lookPivot);
        currentActiveCam.updateMatrixWorld();
    } else if (cameraMode === 'fpv') {
        const sightLocal = new THREE.Vector3(0.0, 0.40, 0.45);
        gunElevationPivot.localToWorld(sightLocal);

        const barrelQuat = new THREE.Quaternion();
        gunElevationPivot.getWorldQuaternion(barrelQuat);
        const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(barrelQuat).normalize();
        const sightTarget = sightLocal.clone().addScaledVector(forwardDir, 100.0);

        currentActiveCam.position.copy(sightLocal);
        currentActiveCam.lookAt(sightTarget);
        currentActiveCam.updateMatrixWorld();
    } else if (cameraMode === 'sniper') {
        const sightPos = new THREE.Vector3(0.46, 0.08, 0.45);
        gunElevationPivot.localToWorld(sightPos);
        const lookTarget = new THREE.Vector3(0.46, 0.08, 90.0);
        gunElevationPivot.localToWorld(lookTarget);
        currentActiveCam.position.copy(sightPos);
        currentActiveCam.lookAt(lookTarget);
        currentActiveCam.updateMatrixWorld();
    } else if (cameraMode === 'suspension') {
        const camLocal = new THREE.Vector3(3.45, 0.58, 1.35);
        tankRoot.localToWorld(camLocal);
        const lookLocal = new THREE.Vector3(1.2, 0.48, 0.15);
        tankRoot.localToWorld(lookLocal);
        currentActiveCam.position.copy(camLocal);
        currentActiveCam.lookAt(lookLocal);
        currentActiveCam.updateMatrixWorld();
    }

    // Manual Keyboard Override for Turret Traverse & Gun Elevation (Arrow Keys or I/J/K/L)
    const manualTurn = (keys['arrowleft'] || keys['j'] ? 1 : 0) - (keys['arrowright'] || keys['l'] ? 1 : 0);
    const manualElev = (keys['arrowup']   || keys['i'] ? 1 : 0) - (keys['arrowdown']  || keys['k'] ? 1 : 0);

    if (manualTurn !== 0 || manualElev !== 0) {
        tankState.targetTurretYaw += manualTurn * 0.95 * dt;
        tankState.targetGunElevation = THREE.MathUtils.clamp(
            tankState.targetGunElevation + manualElev * 0.55 * dt,
            tankState.MIN_ELEV_RAD,
            tankState.MAX_ELEV_RAD
        );
        if (cameraMode === 'sniper' || cameraMode === 'fpv') {
            camOrbit.theta = tankState.heading + tankState.targetTurretYaw + Math.PI;
        }
    } else if (cameraMode === 'orbit') {
        // WAR THUNDER / WoT 3D RAYCAST AIMING:
        raycaster.setFromCamera(aimCursorNDC, currentActiveCam);
        let foundHit = false;

        const intersectables = [];
        if (window.terrainMeshRef) intersectables.push(window.terrainMeshRef);
        targets.forEach(tg => { if (tg.group) intersectables.push(tg.group); });

        const hits = raycaster.intersectObjects(intersectables, true);
        for (let i = 0; i < hits.length; i++) {
            if (hits[i].distance > 3.0) {
                worldAimPoint.copy(hits[i].point);
                foundHit = true;
                break;
            }
        }
        if (!foundHit) {
            raycaster.ray.at(250.0, worldAimPoint);
        }

        // Convert worldAimPoint into hullGroup's LOCAL coordinate space
        const localTargetInHull = hullGroup.worldToLocal(worldAimPoint.clone());
        const dx = localTargetInHull.x;
        const dz = localTargetInHull.z - 0.12;
        tankState.targetTurretYaw = Math.atan2(dx, dz);

        // Desired elevation in turret trunnion frame with KwK 36 773 m/s superelevation
        const dy = localTargetInHull.y - (0.70 + 0.39);
        const horizDist = Math.max(0.5, Math.hypot(dx, dz) - 0.92);
        const flightTime = horizDist / (tankState.SHELL_VELOCITY || 773.0);
        const drop = 0.5 * 9.81 * flightTime * flightTime;
        const gravityComp = Math.atan2(drop, horizDist);
        const desiredElev = Math.atan2(dy, horizDist) + gravityComp;

        tankState.targetGunElevation = THREE.MathUtils.clamp(
            desiredElev,
            tankState.MIN_ELEV_RAD,
            tankState.MAX_ELEV_RAD
        );
    } else if (cameraMode === 'sniper') {
        const desiredYawFromCam = (camOrbit.theta - Math.PI) - tankState.heading;
        tankState.targetTurretYaw = Math.atan2(Math.sin(desiredYawFromCam), Math.cos(desiredYawFromCam));
        const desiredElevFromCam = (1.42 - camOrbit.phi) * 0.85;
        tankState.targetGunElevation = THREE.MathUtils.clamp(
            desiredElevFromCam,
            tankState.MIN_ELEV_RAD,
            tankState.MAX_ELEV_RAD
        );
    }

    // Shortest-angle hydraulic turret traverse smoothing
    let yawError = tankState.targetTurretYaw - tankState.turretYaw;
    yawError = Math.atan2(Math.sin(yawError), Math.cos(yawError));
    const maxTraverseStep = (cameraMode === 'fpv' ? 1.45 : 1.15) * dt;
    tankState.turretYaw += THREE.MathUtils.clamp(yawError, -maxTraverseStep, maxTraverseStep);
    tankState.turretYaw = Math.atan2(Math.sin(tankState.turretYaw), Math.cos(tankState.turretYaw));

    // Gun elevation smoothing
    const elevLerpRate = (cameraMode === 'fpv' ? 16 : 12);
    tankState.gunElevation = THREE.MathUtils.lerp(tankState.gunElevation, tankState.targetGunElevation, elevLerpRate * dt);

    turretGroup.rotation.y = tankState.turretYaw;
    gunElevationPivot.rotation.x = -tankState.gunElevation;
    turretGroup.updateMatrixWorld(true);

    // --- 4. COMPUTE ACTUAL 8.8cm GUN BORE RAYCAST & PROJECT RETICLES ---
    const muzzleWorldPos = new THREE.Vector3();
    mainGunMuzzleTip.getWorldPosition(muzzleWorldPos);
    const barrelWorldQuat = new THREE.Quaternion();
    gunElevationPivot.getWorldQuaternion(barrelWorldQuat);
    const boreDir = new THREE.Vector3(0, 0, 1).applyQuaternion(barrelWorldQuat).normalize();

    raycaster.set(muzzleWorldPos, boreDir);
    let boreDist = 250.0;
    const boreIntersectables = [];
    if (window.terrainMeshRef) boreIntersectables.push(window.terrainMeshRef);
    targets.forEach(tg => { if (tg.group) boreIntersectables.push(tg.group); });

    const boreHits = raycaster.intersectObjects(boreIntersectables, true);
    if (boreHits.length > 0) {
        actualGunHitPoint.copy(boreHits[0].point);
        boreDist = boreHits[0].distance;
    } else {
        raycaster.ray.at(250.0, actualGunHitPoint);
    }

    if (cameraMode === 'fpv') {
        const fpvRangeEl = document.getElementById('fpv-svg-range');
        if (fpvRangeEl) fpvRangeEl.textContent = `RANGE: ${Math.round(boreDist)}m`;
    }

    if (cameraMode === 'orbit' || cameraMode === 'inspect') {
        const camAimScreen = worldAimPoint.clone().project(currentActiveCam);
        const camReticleEl = document.getElementById('camera-aim-reticle');
        if (camAimScreen.z < 1.0) {
            const cx = (camAimScreen.x * 0.5 + 0.5) * window.innerWidth;
            const cy = (-camAimScreen.y * 0.5 + 0.5) * window.innerHeight;
            camReticleEl.style.left = `${cx}px`;
            camReticleEl.style.top  = `${cy}px`;
            camReticleEl.style.opacity = '1';
            const rangeTag = document.getElementById('aim-range-tag');
            if (rangeTag) rangeTag.textContent = `${Math.round(boreDist)}m`;
        } else {
            camReticleEl.style.opacity = '0';
        }

        const boreScreen = actualGunHitPoint.clone().project(currentActiveCam);
        const boreReticleEl = document.getElementById('gun-bore-reticle');
        const boreDotEl = document.getElementById('gun-bore-dot');
        if (boreScreen.z < 1.0) {
            const bx = (boreScreen.x * 0.5 + 0.5) * window.innerWidth;
            const by = (-boreScreen.y * 0.5 + 0.5) * window.innerHeight;
            boreReticleEl.style.left = `${bx}px`;
            boreReticleEl.style.top  = `${by}px`;
            boreReticleEl.style.opacity = '1';

            const aligned = Math.abs(yawError) < 0.03 && Math.abs(tankState.targetGunElevation - tankState.gunElevation) < 0.02;
            boreReticleEl.className = `absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 flex items-center justify-center ${
                aligned ? 'border-emerald-400' : 'border-amber-400'
            }`;
            boreDotEl.className = `w-2 h-2 rounded-full ${aligned ? 'bg-emerald-400' : 'bg-amber-400'}`;
        } else {
            boreReticleEl.style.opacity = '0';
        }
    }

    // --- 5. 8.8cm BARREL RECOIL RECOVERY & WEAPON TIMERS ---
    if (tankState.barrelRecoilOffset > 0.001) {
        tankState.barrelRecoilOffset = THREE.MathUtils.lerp(tankState.barrelRecoilOffset, 0, 6.5 * dt);
    } else {
        tankState.barrelRecoilOffset = 0;
    }
    barrelRecoilGroup.position.z = -tankState.barrelRecoilOffset;

    if (tankState.reloadTimer > 0) {
        const timeElapsed = tankState.RELOAD_TIME - tankState.reloadTimer;
        // 1. Spent brass casing clatters out at ~0.8s
        if (tankState.reloadStage === 1 && timeElapsed >= 0.8) {
            soundFX.playShellEject();
            tankState.reloadStage = 2;
        }
        // 2. Heavy 8.8cm shell sliding into breech tray at ~2.3s
        if (tankState.reloadStage === 2 && timeElapsed >= 2.3) {
            soundFX.playShellSlide();
            tankState.reloadStage = 3;
        }

        tankState.reloadTimer = Math.max(0, tankState.reloadTimer - dt);

        // 3. Breech block snaps shut with heavy lock
        if (tankState.reloadTimer <= 0 && tankState.reloadStage === 3) {
            soundFX.playBreechLock();
            tankState.reloadStage = 0;
        }
    }

    if (tankState.coaxMgCooldown > 0) {
        tankState.coaxMgCooldown = Math.max(0, tankState.coaxMgCooldown - dt);
    }
    if (tankState.bowMgCooldown > 0) {
        tankState.bowMgCooldown = Math.max(0, tankState.bowMgCooldown - dt);
    }

    const isCoaxActive = isFiringCoaxMG || keys['f'];
    const isBowActive  = isFiringBowMG  || keys['g'];

    if (isCoaxActive) fireCoaxMG();
    if (isBowActive)  fireBowMG();

    if (!isCoaxActive && !isBowActive) {
        tankState.mgHeat = Math.max(0, tankState.mgHeat - 25 * dt);
    }

    // --- 6. TRACK ANIMATION, ROAD WHEELS & SWAYING TREES ---
    const leftTrackSpeed  = tankState.speed - tankState.turnRate * 1.45;
    const rightTrackSpeed = tankState.speed + tankState.turnRate * 1.45;

    tankState.leftTrackPhase  = (tankState.leftTrackPhase  + leftTrackSpeed  * 0.082 * dt) % 1.0;
    tankState.rightTrackPhase = (tankState.rightTrackPhase + rightTrackSpeed * 0.082 * dt) % 1.0;

    tankState.wheelSpinLeft  += (leftTrackSpeed  / 0.41) * dt;
    tankState.wheelSpinRight += (rightTrackSpeed / 0.41) * dt;

    roadWheelStations.left.forEach(w => { w.spinGroup.rotation.x = tankState.wheelSpinLeft; });
    roadWheelStations.right.forEach(w => { w.spinGroup.rotation.x = tankState.wheelSpinRight; });
    driveSprockets.forEach(s => {
        s.mesh.rotation.x = (s.side === 'left') ? tankState.wheelSpinLeft : tankState.wheelSpinRight;
    });
    idlerWheels.forEach(id => {
        id.mesh.rotation.x = (id.side === 'left') ? tankState.wheelSpinLeft : tankState.wheelSpinRight;
    });

    if (typeof updateTracksGeometry === 'function') {
        updateTracksGeometry(tankState.leftTrackPhase, tankState.rightTrackPhase);
    } else if (typeof window.updateTracksGeometry === 'function') {
        window.updateTracksGeometry(tankState.leftTrackPhase, tankState.rightTrackPhase);
    }

    // --- 6b. TANK VS TREE CRUSH COLLISION (Drive over trees to knock them down) ---
    const trees = window.swayTrees || swayTrees || [];
    const tankX = tankState.x;
    const tankZ = tankState.z;
    const tankSpeed = Math.abs(tankState.speed);
    const headingDir = new THREE.Vector3(Math.sin(tankState.heading), 0, Math.cos(tankState.heading));

    for (let i = 0; i < trees.length; i++) {
        const tree = trees[i];
        if (tree.isFallen) continue;
        const dx = tree.x - tankX;
        const dz = tree.z - tankZ;
        const distSq = dx * dx + dz * dz;
        const crushDist = 2.45 + (tree.radius || 1.2) * 0.45;
        if (distSq < crushDist * crushDist) {
            const pushDir = new THREE.Vector3(dx, 0, dz).normalize();
            if (tankSpeed > 0.08) {
                pushDir.addScaledVector(headingDir, Math.sign(tankState.speed) * 0.85).normalize();
            }
            if (window.hitTree) {
                window.hitTree(tree, pushDir, Math.max(3.2, tankSpeed * 2.4));
            }
            // Hull resistance from crushing massive timber
            tankState.speed *= 0.82;
            tankState.pitchVel += (Math.random() - 0.5) * 0.08;
            tankState.rollVel += (Math.random() - 0.5) * 0.08;
        }
    }

    // Tree wind sway and dynamic toppling physics animation
    for (let i = 0; i < trees.length; i++) {
        const st = trees[i];
        if (st.isFallen) {
            if (st.fallAngle < st.maxFallAngle) {
                st.angularVel += 7.2 * dt;
                st.fallAngle += st.angularVel * dt;
                if (st.fallAngle >= st.maxFallAngle) {
                    st.fallAngle = st.maxFallAngle;
                    st.angularVel = 0;
                    // Dust puff impact when canopy/trunk hits the ground
                    const tipDist = (st.trunkHeight || 3.5) * 0.72;
                    const tipX = st.x + (-st.fallAxis.z) * tipDist;
                    const tipZ = st.z + (st.fallAxis.x) * tipDist;
                    const tipY = getTerrainHeight(tipX, tipZ);
                    for (let p = 0; p < 7; p++) {
                        const dVel = new THREE.Vector3(
                            (Math.random() - 0.5) * 4.2,
                            0.5 + Math.random() * 1.5,
                            (Math.random() - 0.5) * 4.2
                        );
                        spawnParticle(new THREE.Vector3(tipX, tipY + 0.15, tipZ), dVel, 0x5a4d41, 0.35, 1.8, 1.1, false, 'dirt');
                    }
                }
                st.group.quaternion.setFromAxisAngle(st.fallAxis, st.fallAngle);
            }
        } else {
            st.group.rotation.z = Math.sin(nowSec * 1.4 + st.phase) * 0.022;
            st.group.rotation.x = Math.cos(nowSec * 1.1 + st.phase) * 0.015;
        }
    }

    // --- 7. BALLISTIC PROJECTILES & PARTICLES ---
    updateProjectiles(dt);
    updateParticles(dt);

    // --- 8. PROCEDURAL CHUNK STREAMING, GRASS & DAYLIGHT ATMOSPHERE ---
    if (typeof updateEnvironment === 'function') {
        updateEnvironment(dt, tankState);
    } else if (typeof window.updateEnvironment === 'function') {
        window.updateEnvironment(dt, tankState);
    }

    // --- CELESTIAL MECHANICS & REALISTIC DAY/NIGHT TRANSITION (Maldive Benchmark) ---
    if (!dayNight.paused) {
        dayNight.time = (dayNight.time + dt * dayNight.speed) % 24.0;
    }

    const t = dayNight.time;
    // Periodic 2*PI solar angle calibrated so 24:00 is mathematically identical to 00:00
    const solarAngle = ((t - 6.0) / 24.0) * Math.PI * 2.0;
    const sunY = Math.sin(solarAngle);
    const sunX = Math.cos(solarAngle);
    const sunZ = 0.32 * Math.sin(solarAngle + 0.4);

    const sunDir = new THREE.Vector3(sunX, sunY, sunZ).normalize();
    const moonDir = new THREE.Vector3(-sunX, -sunY, -sunZ).normalize();

    const lightDist = 95.0;
    sunLight.position.set(tankState.x + sunDir.x * lightDist, tankState.y + sunDir.y * lightDist, tankState.z + sunDir.z * lightDist);
    sunLight.target.position.set(tankState.x, tankState.y, tankState.z);
    sunLight.target.updateMatrixWorld();

    moonLight.position.set(tankState.x + moonDir.x * lightDist, tankState.y + moonDir.y * lightDist, tankState.z + moonDir.z * lightDist);
    moonLight.target.position.set(tankState.x, tankState.y, tankState.z);
    moonLight.target.updateMatrixWorld();

    // Maldive continuous atmospheric interpolation factors
    const dayFactor = THREE.MathUtils.smoothstep(sunY, -0.10, 0.28);
    const twilightFactor = THREE.MathUtils.smoothstep(sunY, -0.20, 0.06) * (1.0 - THREE.MathUtils.smoothstep(sunY, 0.04, 0.34));
    const nightFactor = 1.0 - THREE.MathUtils.smoothstep(sunY, -0.14, 0.04);

    // Sun & Moon directional lighting
    const sunCol = DAY_NIGHT_COLORS.noonSun.clone().lerp(DAY_NIGHT_COLORS.goldenHour, twilightFactor * 0.92);
    sunLight.color.copy(sunCol);
    sunLight.intensity = Math.max(0.0, THREE.MathUtils.smoothstep(sunY, -0.06, 0.28) * 2.1 + twilightFactor * 0.75);

    moonLight.color.setHex(0x8ab4f8);
    moonLight.intensity = nightFactor * 0.85;

    // Toggle shadow casting dynamically so only active celestial light renders shadows
    sunLight.castShadow = (sunLight.intensity > 0.15);
    moonLight.castShadow = (moonLight.intensity > 0.15 && !sunLight.castShadow);

    // Sky top & horizon colors calibrated from Maldive
    const skyHorizonColor = DAY_NIGHT_COLORS.nitHor.clone()
        .lerp(DAY_NIGHT_COLORS.dayHor, dayFactor)
        .lerp(DAY_NIGHT_COLORS.sunHor, twilightFactor * 0.9);

    const skyTopColor = DAY_NIGHT_COLORS.nitTop.clone()
        .lerp(DAY_NIGHT_COLORS.dayTop, dayFactor)
        .lerp(DAY_NIGHT_COLORS.sunTop, twilightFactor * 0.8);

    // Hemisphere natural bounce lighting (Earth meadow up + Sky down)
    hemiLight.color.copy(skyHorizonColor);
    hemiLight.groundColor.copy(DAY_NIGHT_COLORS.groundNight).lerp(DAY_NIGHT_COLORS.groundDay, dayFactor);
    hemiLight.intensity = 0.50 + dayFactor * 0.35 + twilightFactor * 0.18;

    // Omnidirectional sky ambient light to illuminate and unify tank flanks with the scene
    ambientLight.color.copy(skyHorizonColor).lerp(new THREE.Color(0xfff8ee), 0.55);
    ambientLight.intensity = 0.18 + dayFactor * 0.20 + twilightFactor * 0.12;

    // Dynamic directional fill light pointing from opposite sun azimuth to soften shaded tank flank
    const fillDir = new THREE.Vector3(-sunDir.x, 0.38, -sunDir.z).normalize();
    fillLight.position.set(
        tankState.x + fillDir.x * 60,
        tankState.y + fillDir.y * 60,
        tankState.z + fillDir.z * 60
    );
    fillLight.target.position.set(tankState.x, tankState.y + 0.5, tankState.z);
    fillLight.target.updateMatrixWorld();
    fillLight.color.copy(skyHorizonColor).lerp(new THREE.Color(0xcde2f2), 0.55);
    fillLight.intensity = 0.16 + dayFactor * 0.22 + twilightFactor * 0.14;

    // Upward grassy meadow bounce fill light following the tank
    const meadowBounceColor = DAY_NIGHT_COLORS.groundDay.clone().lerp(new THREE.Color(0x6b8c48), 0.35);
    rimLight.position.set(tankState.x - fillDir.x * 24, tankState.y - 12, tankState.z - fillDir.z * 24);
    rimLight.target.position.set(tankState.x, tankState.y + 0.6, tankState.z);
    rimLight.target.updateMatrixWorld();
    rimLight.color.copy(meadowBounceColor);
    rimLight.intensity = 0.08 + dayFactor * 0.18;

    // Fog & Background synced with horizon atmosphere
    if (scene.fog) {
        scene.fog.color.copy(skyHorizonColor);
        scene.fog.density = 0.00085 + twilightFactor * 0.0006 + nightFactor * 0.0005;
    }
    if (scene.background) {
        scene.background.copy(skyHorizonColor);
    }

    // Centering the Photorealistic Atmospheric Sky Dome around camera
    const curCam = window.activeCamera || activeCamera;
    if (window.skyDome && curCam) {
        window.skyDome.position.copy(curCam.position);
    }
    if (window.skyMat && window.skyMat.uniforms) {
        window.skyMat.uniforms.uSunDir.value.copy(sunDir);
        window.skyMat.uniforms.uMoonDir.value.copy(moonDir);
        window.skyMat.uniforms.uSkyRotation.value = solarAngle;
        window.skyMat.uniforms.uSkyHorizonColor.value.copy(skyHorizonColor);
        window.skyMat.uniforms.uTime.value = nowSec;
    }

    // Update shared shader lighting uniforms (Volumetric smoke, water ripples, grass tufts)
    if (window.celestialLighting) {
        const isSunActive = (sunY > -0.05);
        window.celestialLighting.sunDirection.value.copy(isSunActive ? sunDir : moonDir);
        window.celestialLighting.sunColor.value.copy(isSunActive ? sunCol : moonLight.color);
        window.celestialLighting.skyColor.value.copy(skyHorizonColor);
        if (window.celestialLighting.groundColor) {
            window.celestialLighting.groundColor.value.copy(hemiLight.groundColor);
        }
        window.celestialLighting.time.value = nowSec;
    }

    // Bosch Headlights activation during dusk and night
    const isDark = (sunY < 0.02);
    const hlLights = window.headlightLights || [];
    hlLights.forEach(hl => {
        if (hl.spot) {
            hl.spot.intensity = isDark ? 3.2 : 0.0;
        }
        if (hl.slitMat) {
            hl.slitMat.color.setHex(isDark ? 0xfef08a : 0x334155);
        }
    });

    // Determine descriptive phase name and icon matching Maldive
    let phaseName = 'Night';
    let phaseIcon = '🌙';
    if (t >= 5.0 && t < 7.0) {
        phaseName = 'Golden Sunrise'; phaseIcon = '🌅';
    } else if (t >= 7.0 && t < 11.5) {
        phaseName = 'Morning Light'; phaseIcon = '🌤️';
    } else if (t >= 11.5 && t < 16.5) {
        phaseName = 'Midday Sun'; phaseIcon = '☀️';
    } else if (t >= 16.5 && t < 18.5) {
        phaseName = 'Golden Hour'; phaseIcon = '🌤️';
    } else if (t >= 18.5 && t < 20.0) {
        phaseName = 'Sunset'; phaseIcon = '🌇';
    } else if (t >= 20.0 && t < 21.5) {
        phaseName = 'Dusk'; phaseIcon = '🌆';
    } else {
        phaseName = 'Starlit Night'; phaseIcon = '🌙';
    }
    dayNight.phase = phaseName;

    // Update HUD time readout
    const hours = Math.floor(t);
    const minutes = Math.floor((t - hours) * 60);
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const hudTimeEl = document.getElementById('hud-time-label');
    if (hudTimeEl) hudTimeEl.textContent = `${timeStr}`;
    const mobTimeEl = document.getElementById('mob-time-label');
    if (mobTimeEl) mobTimeEl.textContent = `${phaseName}`;
    const btnTimeEl = document.getElementById('btn-time-cycle');
    if (btnTimeEl) btnTimeEl.innerHTML = `${phaseIcon} <span id="hud-time-label">${timeStr}</span>`;

    // --- 8. TELEMETRY HUD UPDATE ---
    const kmh = Math.abs(tankState.speed * 3.6).toFixed(1);
    const speedEl = document.getElementById('hud-speed');
    if (speedEl) speedEl.textContent = kmh;

    const rpm = Math.floor(800 + speedRatio * 2150);
    const rpmEl = document.getElementById('hud-rpm');
    if (rpmEl) rpmEl.textContent = `${rpm} RPM`;

    let gearStr = 'NEUTRAL';
    if (tankState.speed > 0.15) {
        const g = Math.min(8, Math.max(1, Math.ceil((tankState.speed / maxSpeed) * 8)));
        gearStr = `FWD ${g}`;
    } else if (tankState.speed < -0.15) {
        gearStr = 'REV 1';
    } else if (Math.abs(tankState.turnRate) > 0.05) {
        gearStr = 'PIVOT';
    }
    const gearEl = document.getElementById('hud-gear');
    if (gearEl) gearEl.textContent = gearStr;

    const pitchDeg = THREE.MathUtils.radToDeg(tankState.pitch).toFixed(1);
    const rollDeg  = THREE.MathUtils.radToDeg(tankState.roll).toFixed(1);
    const attEl = document.getElementById('hud-attitude');
    if (attEl) attEl.textContent = `${pitchDeg}° / ${rollDeg}°`;

    let azDeg = (THREE.MathUtils.radToDeg(tankState.turretYaw) % 360 + 360) % 360;
    const azEl = document.getElementById('hud-azimuth');
    if (azEl) azEl.textContent = `${azDeg.toFixed(1).padStart(5, '0')}°`;

    const elevDeg = THREE.MathUtils.radToDeg(tankState.gunElevation);
    const elevEl = document.getElementById('hud-elevation');
    if (elevEl) elevEl.textContent = `${elevDeg >= 0 ? '+' : ''}${elevDeg.toFixed(1)}°`;

    const hitEl = document.getElementById('hud-targets');
    if (hitEl) hitEl.textContent = `Hits: ${tankState.hitsCount}`;

    const hudSeedEl = document.getElementById('hud-seed-display');
    if (hudSeedEl && window.currentSeed) {
        hudSeedEl.textContent = `Seed: ${window.currentSeed} • X:${Math.round(tankState.x)}m Z:${Math.round(tankState.z)}m`;
    }

    // Mobile Mini HUD updates
    const mobSpeedEl = document.getElementById('mob-speed');
    if (mobSpeedEl) mobSpeedEl.textContent = kmh;
    const mobHitsEl = document.getElementById('mob-hits');
    if (mobHitsEl) mobHitsEl.textContent = `Hits: ${tankState.hitsCount}`;
    const mobReloadEl = document.getElementById('mob-reload');
    if (mobReloadEl) {
        if (tankState.reloadTimer <= 0) {
            mobReloadEl.textContent = 'READY';
            mobReloadEl.className = 'text-emerald-400 font-bold';
        } else {
            mobReloadEl.textContent = `${tankState.reloadTimer.toFixed(1)}s`;
            mobReloadEl.className = 'text-amber-400 font-bold';
        }
    }

    const reloadBar = document.getElementById('hud-reload-bar');
    const reloadTxt = document.getElementById('hud-reload-text');
    if (reloadBar && reloadTxt) {
        if (tankState.reloadTimer <= 0) {
            reloadBar.style.width = '100%';
            reloadBar.className = 'h-full bg-emerald-500 transition-all duration-75';
            reloadTxt.textContent = 'READY';
            reloadTxt.className = 'text-emerald-400 font-bold';
        } else {
            const pct = ((tankState.RELOAD_TIME - tankState.reloadTimer) / tankState.RELOAD_TIME) * 100;
            reloadBar.style.width = `${pct}%`;
            reloadBar.className = 'h-full bg-amber-500 transition-all duration-75';
            reloadTxt.textContent = `${tankState.reloadTimer.toFixed(1)}s`;
            reloadTxt.className = 'text-amber-400 font-bold';
        }
    }

    const mgBar = document.getElementById('hud-mg-bar');
    if (mgBar) mgBar.style.width = `${100 - tankState.mgHeat}%`;
}

function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    updateSimulation(dt);
    const renderCamera = window.activeCamera || activeCamera;
    const renderCameraLayers = renderCamera.layers.mask;
    renderCamera.layers.set(0);
    ssaoPass.camera = renderCamera;
    ssaoPass.ssaoMaterial.uniforms.cameraNear.value = renderCamera.near;
    ssaoPass.ssaoMaterial.uniforms.cameraFar.value = renderCamera.far;
    ssaoPass.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(renderCamera.projectionMatrix);
    ssaoPass.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(renderCamera.projectionMatrixInverse);
    ssaoPass.depthRenderMaterial.uniforms.cameraNear.value = renderCamera.near;
    ssaoPass.depthRenderMaterial.uniforms.cameraFar.value = renderCamera.far;
    composer.render(dt);
    renderCamera.layers.mask = renderCameraLayers;
}

function onWindowResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w <= 0 || h <= 0) return;

    if (window.perspCamera) {
        window.perspCamera.aspect = w / h;
        window.perspCamera.updateProjectionMatrix();
    }
    if (window.renderer) {
        window.renderer.setSize(w, h);
        window.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    }
    if (composer) composer.setSize(w, h);
}
window.onWindowResize = onWindowResize;
window.updateCameraProjectionAspect = onWindowResize;

window.addEventListener('resize', onWindowResize);
window.addEventListener('orientationchange', () => {
    onWindowResize();
    setTimeout(onWindowResize, 100);
    setTimeout(onWindowResize, 300);
    setTimeout(onWindowResize, 600);
});
document.addEventListener('fullscreenchange', () => {
    onWindowResize();
    setTimeout(onWindowResize, 100);
    setTimeout(onWindowResize, 300);
    setTimeout(onWindowResize, 600);
});
document.addEventListener('webkitfullscreenchange', () => {
    onWindowResize();
    setTimeout(onWindowResize, 100);
    setTimeout(onWindowResize, 300);
    setTimeout(onWindowResize, 600);
});
if (screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener('change', () => {
        onWindowResize();
        setTimeout(onWindowResize, 100);
        setTimeout(onWindowResize, 300);
        setTimeout(onWindowResize, 600);
    });
}

window.updateSimulation = updateSimulation;

window.onload = function () {
    animate(performance.now());
};
