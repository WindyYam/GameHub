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
const perspCamera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.25, 12000);
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
    12000
);
orthoCamera.zoom = 1.15;
orthoCamera.updateProjectionMatrix();
window.orthoCamera = orthoCamera;

let activeCamera = perspCamera;
window.activeCamera = activeCamera;

// 3. WebGL High-Performance Renderer
const _isMobileRenderer = (typeof isMobileBrowser === 'function' && isMobileBrowser()) || (typeof isMobileDevice === 'function' && isMobileDevice());
const renderer = new THREE.WebGLRenderer({ antialias: !_isMobileRenderer, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = _isMobileRenderer ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
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

    // Multi-stop atmospheric reflection gradient for 3A PBR rolled armor & gunmetal
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.00, '#2a4d7a'); // Deep zenith sky
    grad.addColorStop(0.28, '#557ea6'); // Mid sky
    grad.addColorStop(0.45, '#9ab8d4'); // Atmospheric horizon haze
    grad.addColorStop(0.49, '#d8e4ee'); // Crisp horizon specular band
    grad.addColorStop(0.52, '#6f7465'); // Distant terrain horizon
    grad.addColorStop(0.72, '#474e3d'); // Earth / foliage bounce
    grad.addColorStop(1.00, '#232820'); // Ground occlusion
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // Subtle procedural cloud wisps in upper hemisphere for natural specular breakup
    ctx.fillStyle = 'rgba(235, 242, 250, 0.14)';
    for (let i = 0; i < 14; i++) {
        const cx = ((i * 73) % 480) + 16;
        const cy = 22 + ((i * 31) % 68);
        ctx.beginPath();
        ctx.ellipse(cx, cy, 38 + (i % 3) * 18, 9 + (i % 2) * 5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Soft directional sun glade onto the equirectangular map
    const sunGrad = ctx.createRadialGradient(256, 108, 3, 256, 108, 92);
    sunGrad.addColorStop(0, 'rgba(255, 252, 242, 0.98)');
    sunGrad.addColorStop(0.25, 'rgba(255, 236, 204, 0.50)');
    sunGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(164, 16, 184, 184);

    const envTex = new THREE.CanvasTexture(envCanvas);
    const rt = pmremGenerator.fromEquirectangular(envTex);
    envTex.dispose();
    return rt.texture;
}

let _lastIblTime = -999;
let _lastIblZone = -1;
let _dynamicEnvRT = null;
function updateSkyEnvironmentMap(skyTopCol, skyHorCol, groundCol, sunCol, dayFactor, twilightFactor) {
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 256;
    envCanvas.height = 128;
    const ctx = envCanvas.getContext('2d');

    const cTop = '#' + skyTopCol.getHexString();
    const cHor = '#' + skyHorCol.getHexString();
    const cGnd = '#' + groundCol.getHexString();
    const cGndDeep = '#' + groundCol.clone().multiplyScalar(0.45).getHexString();

    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.00, cTop);
    grad.addColorStop(0.35, cHor);
    grad.addColorStop(0.50, cHor);
    grad.addColorStop(0.54, cGnd);
    grad.addColorStop(1.00, cGndDeep);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    const sunAlpha = Math.max(0.15, Math.min(0.95, 0.35 + dayFactor * 0.55 + twilightFactor * 0.35));
    const sunGrad = ctx.createRadialGradient(128, 52, 2, 128, 52, 48);
    sunGrad.addColorStop(0, `rgba(${Math.round(sunCol.r * 255)}, ${Math.round(sunCol.g * 255)}, ${Math.round(sunCol.b * 255)}, ${sunAlpha})`);
    sunGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(80, 4, 96, 96);

    const envTex = new THREE.CanvasTexture(envCanvas);
    const rt = pmremGenerator.fromEquirectangular(envTex);
    envTex.dispose();
    if (_dynamicEnvRT) _dynamicEnvRT.dispose();
    _dynamicEnvRT = rt;
    scene.environment = rt.texture;
    window.steelEnvMap = rt.texture;
}

const steelEnvMap = generateSteelEnvironmentMap();
scene.environment = steelEnvMap;
window.steelEnvMap = steelEnvMap;

const SSAO_FX_LAYER = 1;
window.SSAO_FX_LAYER = SSAO_FX_LAYER;
function excludeFromSSAO(object) {
    object.traverse(child => child.layers.set(SSAO_FX_LAYER));
}
window.excludeFromSSAO = excludeFromSSAO;

// 4. Atmospheric Battlefield Lighting: one hemisphere light plus one directional light (sun by day, moon by night)
const hemiLight = new THREE.HemisphereLight(0xfff7ed, 0x526b38, 0.60);
scene.add(hemiLight);

// ============================================================================
// REALISTIC DYNAMIC DAY / NIGHT CYCLE MANAGER
// ============================================================================
const dayNight = {
    time: 12.0,        // Current hour (0.00 to 24.00, starts at midday)
    speed: 1 / 60,     // Progress rate (1 in-game minute per real-world second; 24 minutes per 24-hour cycle)
    paused: false,
    phase: 'Day',
    setTime(h) {
        this.time = (h % 24 + 24) % 24;
    },
    cycleNext() {
        if (this.time >= 4.0 && this.time < 9.0) {
            this.time = 12.0; // Midday
        } else if (this.time >= 9.0 && this.time < 16.5) {
            this.time = 17.6; // Golden Hour Sunset
        } else if (this.time >= 16.5 && this.time < 21.5) {
            this.time = 0.0;  // Midnight
        } else {
            this.time = 6.4;  // Golden Hour Sunrise
        }
    }
};
window.dayNight = dayNight;

// Physically calibrated 24-hour celestial color palette (Mediterranean Seaside Countryside fidelity)
const DAY_NIGHT_COLORS = {
    noonSun:     new THREE.Color(0xfff6eb),
    goldenHour:  new THREE.Color(0xff6524),
    dayTop:      new THREE.Color(0x09357a),
    dayHor:      new THREE.Color(0x4c8dd4),
    sunTop:      new THREE.Color(0x16193b),
    sunHor:      new THREE.Color(0xe85d22),
    nitTop:      new THREE.Color(0x03091e),
    nitHor:      new THREE.Color(0x112240),
    groundDay:   new THREE.Color(0x56733a),
    groundNight: new THREE.Color(0x1e2f23)
};

const sunLight = new THREE.DirectionalLight(0xfff1db, 1.45);
sunLight.position.set(45, 55, 38);
sunLight.castShadow = true;
const isMobLight = (typeof isMobileBrowser === 'function' && isMobileBrowser()) || (typeof isMobileDevice === 'function' && isMobileDevice());
const shadowRes = isMobLight ? 1024 : 2048;
sunLight.shadow.mapSize.width = shadowRes;
sunLight.shadow.mapSize.height = shadowRes;
sunLight.shadow.camera.near = 5;
sunLight.shadow.camera.far = 180;
const d = 58;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
sunLight.shadow.bias = -0.0005;
sunLight.shadow.radius = 2.5; // Soften PCF shadow filter kernel for large-scale contact occlusion
scene.add(sunLight);
window.sunLight = sunLight;

// Cascade 1: Low-resolution distant shadow map ([-220, 220]m) throttled to update every 4 frames.
// Intensity is 0.0 so it contributes zero extra light; ShaderChunk patches blend it with sunLight outside [-58, 58]m.
const farShadowRes = isMobLight ? 256 : 512;
const FAR_SHADOW_EXTENT = 220;
const FAR_SHADOW_TEXEL = (FAR_SHADOW_EXTENT * 2) / farShadowRes;
const farShadowLight = new THREE.DirectionalLight(0xffffff, 0.0);
farShadowLight.position.set(90, 110, 76);
farShadowLight.castShadow = true;
farShadowLight.shadow.mapSize.width = farShadowRes;
farShadowLight.shadow.mapSize.height = farShadowRes;
farShadowLight.shadow.camera.near = 5;
farShadowLight.shadow.camera.far = 420;
farShadowLight.shadow.camera.left = -FAR_SHADOW_EXTENT;
farShadowLight.shadow.camera.right = FAR_SHADOW_EXTENT;
farShadowLight.shadow.camera.top = FAR_SHADOW_EXTENT;
farShadowLight.shadow.camera.bottom = -FAR_SHADOW_EXTENT;
farShadowLight.shadow.bias = -0.0025;
farShadowLight.shadow.normalBias = 0.25;
farShadowLight.shadow.radius = 1.5;
farShadowLight.shadow.autoUpdate = false;
farShadowLight.shadow.needsUpdate = true;
scene.add(farShadowLight);
scene.add(farShadowLight.target);
window.farShadowLight = farShadowLight;
let farShadowFrameCounter = 0;
let farShadowWasActive = true;

(function patchCascadedShadowChunks() {
    const targetDirLine = 'directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
    if (THREE.ShaderChunk.lights_fragment_begin.includes(targetDirLine)) {
        THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin.replace(
            targetDirLine,
            `#if UNROLLED_LOOP_INDEX == 0 && NUM_DIR_LIGHT_SHADOWS == 2
\t\tfloat csmShadow = 1.0;
\t\tif ( all( bvec2( directLight.visible, receiveShadow ) ) ) {
\t\t\tvec3 sc0 = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
\t\t\tfloat edgeDist = max( abs( sc0.x - 0.5 ), abs( sc0.y - 0.5 ) ) * 2.0;
\t\t\tfloat csmBlend = smoothstep( 0.82, 0.98, edgeDist );
\t\t\tif ( csmBlend < 0.001 ) {
\t\t\t\tcsmShadow = getShadow( directionalShadowMap[ 0 ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ 0 ] );
\t\t\t} else if ( csmBlend > 0.999 ) {
\t\t\t\tDirectionalLightShadow farShadow = directionalLightShadows[ 1 ];
\t\t\t\tcsmShadow = getShadow( directionalShadowMap[ 1 ], farShadow.shadowMapSize, farShadow.shadowBias, farShadow.shadowRadius, vDirectionalShadowCoord[ 1 ] );
\t\t\t} else {
\t\t\t\tfloat s0 = getShadow( directionalShadowMap[ 0 ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ 0 ] );
\t\t\t\tDirectionalLightShadow farShadow = directionalLightShadows[ 1 ];
\t\t\t\tfloat s1 = getShadow( directionalShadowMap[ 1 ], farShadow.shadowMapSize, farShadow.shadowBias, farShadow.shadowRadius, vDirectionalShadowCoord[ 1 ] );
\t\t\t\tcsmShadow = mix( s0, s1, csmBlend );
\t\t\t}
\t\t}
\t\tdirectLight.color *= csmShadow;
\t\t#else
\t\tdirectLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
\t\t#endif`
        );
    }
    const targetMaskBlock = `#if NUM_DIR_LIGHT_SHADOWS > 0
\tDirectionalLightShadow directionalLight;
\t#pragma unroll_loop_start
\tfor ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
\t\tdirectionalLight = directionalLightShadows[ i ];
\t\tshadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
\t}
\t#pragma unroll_loop_end
\t#endif`;
    if (THREE.ShaderChunk.shadowmask_pars_fragment.includes(targetMaskBlock)) {
        THREE.ShaderChunk.shadowmask_pars_fragment = THREE.ShaderChunk.shadowmask_pars_fragment.replace(
            targetMaskBlock,
            `#if NUM_DIR_LIGHT_SHADOWS == 2
\tif ( receiveShadow ) {
\t\tvec3 sc0 = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
\t\tfloat edgeDist = max( abs( sc0.x - 0.5 ), abs( sc0.y - 0.5 ) ) * 2.0;
\t\tfloat csmBlend = smoothstep( 0.82, 0.98, edgeDist );
\t\tif ( csmBlend < 0.001 ) {
\t\t\tshadow *= getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
\t\t} else if ( csmBlend > 0.999 ) {
\t\t\tshadow *= getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] );
\t\t} else {
\t\t\tfloat s0 = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] );
\t\t\tfloat s1 = getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] );
\t\t\tshadow *= mix( s0, s1, csmBlend );
\t\t}
\t}
\t#elif NUM_DIR_LIGHT_SHADOWS > 0
\tDirectionalLightShadow directionalLight;
\t#pragma unroll_loop_start
\tfor ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
\t\tdirectionalLight = directionalLightShadows[ i ];
\t\tshadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
\t}
\t#pragma unroll_loop_end
\t#endif`
        );
    }
})();

function clearShadowMapToWhite(shadow) {
    if (!shadow || !shadow.map) return;
    const oldTarget = renderer.getRenderTarget();
    const oldFace = renderer.getActiveCubeFace();
    const oldMipmap = renderer.getActiveMipmapLevel();
    const oldClearColor = renderer.getClearColor(new THREE.Color());
    const oldClearAlpha = renderer.getClearAlpha();
    const oldScissorTest = renderer.getScissorTest();
    try {
        renderer.setRenderTarget(shadow.map);
        renderer.setScissorTest(false);
        renderer.setClearColor(0xffffff, 1);
        renderer.clear(true, true, false);
    } finally {
        renderer.setRenderTarget(oldTarget, oldFace, oldMipmap);
        renderer.setClearColor(oldClearColor, oldClearAlpha);
        renderer.setScissorTest(oldScissorTest);
    }
    shadow.autoUpdate = false;
    shadow.needsUpdate = false;
}

function updateCelestialShadows(shadowsActive) {
    const shadow = sunLight.shadow;
    const farShadow = farShadowLight.shadow;
    const isReducedGfx = (typeof window.getGraphicsMode === 'function' && window.getGraphicsMode() !== 'high');
    if (shadowsActive) {
        shadow.autoUpdate = true;
        if (isReducedGfx) {
            farShadowWasActive = false;
            if (farShadow.map) clearShadowMapToWhite(farShadow);
        } else {
            if (!farShadowWasActive || (farShadowFrameCounter & 3) === 0) {
                farShadow.needsUpdate = true;
            }
            farShadowFrameCounter++;
            farShadowWasActive = true;
        }
        return;
    }
    farShadowWasActive = false;
    if (shadow.autoUpdate && shadow.map) {
        clearShadowMapToWhite(shadow);
    }
    if (farShadow.map) {
        clearShadowMapToWhite(farShadow);
    }
}

renderer.domElement.addEventListener('webglcontextrestored', () => {
    sunLight.shadow.autoUpdate = true;
    farShadowLight.shadow.needsUpdate = true;
});

// Moon color used by the shared directional light at night
const MOON_LIGHT_COLOR = new THREE.Color(0x8ab4f8);

// ============================================================================
// SYSTEM INITIALIZATION
// ============================================================================
const mats = createMaterials();
window.mats = mats;

initEnvironment(scene);
buildEnvironment();
prewarmParticlePools();
prewarmParticleShaders(renderer, activeCamera);

// Persistent SpotLight rig to keep scene light count permanently fixed (NUM_SPOT_LIGHTS = 2)
// Preventing WebGL shader program invalidation and freeze on mobile when spawning / switching units.
const persistentHeadlightSpots = [
    new THREE.SpotLight(0xfef08a, 0.0, 45, Math.PI / 5, 0.45, 1.5),
    new THREE.SpotLight(0xfef08a, 0.0, 45, Math.PI / 5, 0.45, 1.5)
];
persistentHeadlightSpots.forEach(s => {
    s.position.set(0, -1000, 0);
    s.target.position.set(0, -1001, 0);
    scene.add(s);
    scene.add(s.target);
});
window.persistentHeadlightSpots = persistentHeadlightSpots;
const _hlMountPos = new THREE.Vector3();
const _hlTargetPos = new THREE.Vector3();
const _hlForward = new THREE.Vector3();
const _hlQuat = new THREE.Quaternion();

const initialCampaign = 'sherman';
window.currentTankId = initialCampaign;

const tank = (typeof window.buildTankById === 'function') 
    ? window.buildTankById(initialCampaign, scene, mats) 
    : (typeof buildTigerTank === 'function' ? buildTigerTank(scene, mats) : null);
window.tankModel = tank;
if (tank && tank.tankRoot) {
    tank.tankRoot.traverse((obj) => {
        if (!obj.isMesh || obj.isInstancedMesh || !obj.geometry) return;
        if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
        const bb = obj.geometry.boundingBox;
        if (bb && Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) < 0.25) {
            obj.castShadow = false;
            obj.receiveShadow = false;
        }
    });
}
if (window.tankRoot) {
    window.tankRoot.visible = false;
    window.tankRoot.position.set(0, -9999, 0);
}
if (window.tankState) {
    window.tankState.hasTank = false;
}
if (window.TANK_SPECS && window.TANK_SPECS[initialCampaign]) {
    const initSpec = window.TANK_SPECS[initialCampaign];
    tankState.currentTankSpec = initSpec;
    tankState.RELOAD_TIME = initSpec.reloadTime;
    tankState.SHELL_VELOCITY = initSpec.shellVel;
    tankState.CANNON_SPREAD = initSpec.spread;
    tankState.BLAST_RADIUS = initSpec.blastRadius;
    tankState.BLAST_DAMAGE = initSpec.blastDamage;
    tankState.CANNON_DAMAGE = initSpec.cannonDamage || (initialCampaign === 'kingtiger' ? 3 : (initialCampaign === 'tiger' ? 2 : 1));
    tankState.MAX_SPEED = initSpec.maxSpeed;
    tankState.REVERSE_SPEED = initSpec.reverseSpeed;
    tankState.TURN_SPEED = initSpec.turnSpeed;
    tankState.TURRET_TURN_SPEED = initSpec.turretTurnSpeed || 1.0;
    tankState.RECOIL_OFFSET = initSpec.recoilOffset;
    tankState.MIN_ELEV_RAD = THREE.MathUtils.degToRad(initSpec.minElevDeg);
    tankState.MAX_ELEV_RAD = THREE.MathUtils.degToRad(initSpec.maxElevDeg);
    tankState.hasMuzzleBrake = initSpec.hasMuzzleBrake;
    tankState.playerArmor = initSpec.playerArmor || (initialCampaign === 'kingtiger' ? 6 : (initialCampaign === 'tiger' ? 4 : 2));
    tankState.maxArmor = tankState.playerArmor;
    window.playerHitsTaken = 0;

    if (typeof window.updateTankHUD === 'function') {
        window.updateTankHUD(initSpec);
    }
    if (typeof window.updateArmorHUD === 'function') {
        window.updateArmorHUD(tankState.playerArmor, tankState.playerArmor);
    }
    if (window.soundFX && typeof window.soundFX.setTankSoundProfile === 'function') {
        window.soundFX.setTankSoundProfile(initSpec);
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
    if (window.tankState && window.tankState.hasTank) {
        tankRoot.position.set(0, initSpawnY, 0);
    } else {
        tankRoot.position.set(0, -9999, 0);
        tankRoot.visible = false;
    }
}

// ============================================================================
// MAIN SIMULATION & PHYSICS LOOP
// ============================================================================
let lastTime = performance.now();

function getAimRaycastCandidates(originPos, maxDistSq = 62500) {
    const list = window.aimRaycastMeshes || [];
    if (list.length <= 40) return list;
    const ox = originPos ? originPos.x : (tankState ? tankState.x : 0);
    const oz = originPos ? originPos.z : (tankState ? tankState.z : 0);
    return list.filter(m => {
        if (!m.visible) return false;
        const p = m.position;
        const dx = p.x - ox;
        const dz = p.z - oz;
        return (dx * dx + dz * dz) < maxDistSq;
    });
}

function updateSimulation(dt) {
    const nowSec = performance.now() * 0.001;
    const currentActiveCam = window.activeCamera || activeCamera;

    // Multiplayer Network State Interpolation & Position Sync
    if (window.networkManager && typeof window.networkManager.update === 'function') {
        window.networkManager.update(dt);
    }

    // --- 1. DRIVING & TRACTOR FORCE DYNAMICS (Mass, Engine Power, Slope Gravity, Rolling Resistance) ---
    const isKO = !!tankState.isKnockedOut || (window.playerMode === 'soldier');
    const forwardInput = isKO ? 0 : (((keys['w'] ? 1 : 0) - (keys['s'] ? 1 : 0)) || touchDrive.forward);
    const turnInput    = isKO ? 0 : (((keys['a'] ? 1 : 0) - (keys['d'] ? 1 : 0)) || touchDrive.turn);

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

    if (window.playerMode === 'soldier' || (window.tankState && window.tankState.hasTank === false)) {
        tankState.speed = 0;
        tankState.turnRate = 0;
    }

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

    // Kick up realistic billowing track dust plumes and dirt clods (or water ripples in water) when driving in the wild
    if (window.environmentMode === 'wild') {
        const absSpeed = Math.abs(tankState.speed);
        const absTurn = Math.abs(tankState.turnRate);
        const isMoving = absSpeed > 0.25 || absTurn > 0.08;

        if (isMoving) {
            const moveIntensity = Math.min(1.0, absSpeed / 8.0 + absTurn * 0.9);
            const waterLvl = (typeof window.SEA_LEVEL === 'number') ? window.SEA_LEVEL : -2.5;
            const groundY = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(tankState.x, tankState.z) : tankState.y;
            const inWater = groundY < waterLvl - 0.05;
            const trackOffset = (tankState.currentTankSpec && tankState.currentTankSpec.id === 'kingtiger') ? 1.48 : ((tankState.currentTankSpec && tankState.currentTankSpec.id === 'tiger') ? 1.38 : ((tankState.currentTankSpec && (tankState.currentTankSpec.id === 'pershing' || tankState.currentTankSpec.id === 'kv2')) ? 1.36 : 1.20));

            if (inWater) {
                tankState.waterRippleTimer = (tankState.waterRippleTimer || 0) + dt;
                const rippleInterval = Math.max(0.18, 0.40 - moveIntensity * 0.18);
                if (tankState.waterRippleTimer >= rippleInterval && typeof window.spawnWaterRipple === 'function') {
                    tankState.waterRippleTimer = 0;
                    const fwdSign = Math.sign(tankState.speed || 1);
                    const bowPos = new THREE.Vector3(
                        tankState.x + Math.sin(tankState.heading) * fwdSign * 1.6,
                        waterLvl + 0.02,
                        tankState.z + Math.cos(tankState.heading) * fwdSign * 1.6
                    );
                    window.spawnWaterRipple(bowPos, 3.6 + moveIntensity * 2.0, 1.35);
                    [-trackOffset, trackOffset].forEach((sideX) => {
                        const sidePos = new THREE.Vector3(sideX, 0, -1.5);
                        hullGroup.localToWorld(sidePos);
                        sidePos.y = waterLvl + 0.02;
                        window.spawnWaterRipple(sidePos, 2.4 + moveIntensity * 1.4, 1.15);
                    });
                }
            } else {
                const dustSpawnRate = 3.5 + moveIntensity * 9.5;
                if (Math.random() < 1.0 - Math.exp(-dustSpawnRate * dt)) {
                    const baseDustCol = (window.currentZoneConfig && window.currentZoneConfig.trackDustColor) ? window.currentZoneConfig.trackDustColor : 0x5c4d3c;

                    [-trackOffset, trackOffset].forEach((sideX) => {
                        // Rear track ground kick-up contact point
                        const kickZ = -2.35 - Math.random() * 0.5;
                        const kickPos = new THREE.Vector3(sideX + (Math.random() - 0.5) * 0.15, -0.85, kickZ);
                        hullGroup.localToWorld(kickPos);

                        // Direction of kick: backward relative to tank motion + sideways wake dispersion
                        const heading = tankState.heading;
                        const fwdSign = Math.sign(tankState.speed || 1);
                        const kickVel = new THREE.Vector3(
                            -Math.sin(heading) * fwdSign * (absSpeed * 0.45 + 0.6) + (sideX > 0 ? 0.7 : -0.7) * (absTurn * 1.8 + 0.4) + (Math.random() - 0.5) * 1.2,
                            0.45 + Math.random() * 0.95 + absSpeed * 0.10,
                            -Math.cos(heading) * fwdSign * (absSpeed * 0.45 + 0.6) + (Math.random() - 0.5) * 1.2
                        );

                        // Color variation per puff for visual richness
                        const colVar = 0.94 + Math.random() * 0.12;
                        const r = Math.min(255, Math.floor(((baseDustCol >> 16) & 255) * colVar));
                        const g = Math.min(255, Math.floor(((baseDustCol >> 8) & 255) * colVar));
                        const b = Math.min(255, Math.floor((baseDustCol & 255) * colVar));
                        const puffCol = (r << 16) | (g << 8) | b;

                        const startSize = 0.32 + Math.random() * 0.25;
                        const endSize = 2.0 + moveIntensity * 2.2 + Math.random() * 0.8;
                        const life = 1.1 + Math.random() * 0.7;

                        spawnParticle(kickPos, kickVel, puffCol, startSize, endSize, life, false, 'dust', {
                            maxOpacity: 0.72 + moveIntensity * 0.14,
                            drag: 0.91,
                            buoyancy: -0.08
                        });

                        // Occasional heavier coarse dirt clods tumbling from tracks
                        if (Math.random() < 0.20 && absSpeed > 1.2) {
                            const clodVel = kickVel.clone().multiplyScalar(1.5);
                            clodVel.y = 1.6 + Math.random() * 2.0;
                            spawnParticle(kickPos, clodVel, baseDustCol, 0.12, 0.30, 0.75 + Math.random() * 0.5, false, 'dirt');
                        }
                    });
                }
            }
        }
    }

    // Realistic Twin Armored Exhaust Puffs (Maybach HL230 V12 Engine)
    const canEmitExhaust = window.tankState && window.tankState.hasTank !== false && !tankState.isKnockedOut && window.tankRoot && window.tankRoot.visible;
    if (canEmitExhaust) {
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
    }

    // Update Engine Audio
    const speedRatio = (window.playerMode === 'soldier' || (window.tankState && window.tankState.hasTank === false)) ? 0 : Math.min(1, Math.abs(tankState.speed) / maxSpeed + Math.abs(tankState.turnRate) * 0.3);
    soundFX.updateEngine(speedRatio, (window.playerMode !== 'soldier' && (!window.tankState || window.tankState.hasTank !== false)) && (forwardInput !== 0 || turnInput !== 0));

    // --- 1b. TANK VS OBSTACLE COLLISION (Stop tank at solid house walls, rocks, monuments) ---
    const worldObsList = window.worldObstacles || window.worldBuildings || [];
    for (let bi = 0; bi < worldObsList.length; bi++) {
        const obs = worldObsList[bi];
        if (!obs || typeof obs.x !== 'number' || typeof obs.z !== 'number') continue;
        const push = obstaclePushOut(obs, tankState.x, tankState.z, 1.8);
        if (push) {
            tankState.x += push.x;
            tankState.z += push.z;
            tankState.speed *= 0.6;
        }
    }

    // --- 1c. TANK VS TANK WRECK COLLISION (Stop player tank at tank wrecks) ---
    const activeEnemyList = window.activeEnemyTanks || [];
    for (let ei = 0; ei < activeEnemyList.length; ei++) {
        const wreck = activeEnemyList[ei];
        if (!wreck || !wreck.isDestroyed) continue;
        const wdx = tankState.x - wreck.x;
        const wdz = tankState.z - wreck.z;
        const wDist = Math.hypot(wdx, wdz);
        const minClearance = 3.8;
        if (wDist < minClearance && wDist > 0.001) {
            const overlap = minClearance - wDist;
            tankState.x += (wdx / wDist) * overlap;
            tankState.z += (wdz / wDist) * overlap;
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
    if (window.tankState && window.tankState.hasTank === false) {
        if (tankRoot) {
            tankRoot.visible = false;
            tankRoot.position.set(0, -9999, 0);
        }
    } else if (tankRoot) {
        tankRoot.visible = true;
        tankRoot.position.set(tankState.x, tankState.y, tankState.z);
        tankRoot.rotation.y = tankState.heading;

        hullGroup.position.y = 0.92 + tankState.heave;
        hullGroup.rotation.x = -tankState.pitch;
        hullGroup.rotation.z = tankState.roll;
        tankRoot.updateMatrixWorld(true);
    }

    // --- 3. CAMERA POSITIONING & 3D RAYCAST AIMING SYSTEM ---
    if (window.playerMode === 'soldier' && typeof window.updatePlayerSoldier === 'function') {
        window.updatePlayerSoldier(dt, currentActiveCam, keys);
    } else if (cameraMode === 'orbit') {
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

        // Push camera closer if an obstacle is between tank and camera
        if (typeof window.resolveCameraObstacleCollision === 'function') {
            window.resolveCameraObstacleCollision(tankAnchor, camPos, { pad: 0.35, marginT: 0.08, minSafeT: 0.15, anchorYOffset: 0.8 });
        }

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
        const camPos = new THREE.Vector3(cx, cy, cz);
        if (typeof window.resolveCameraObstacleCollision === 'function') {
            window.resolveCameraObstacleCollision(lookPivot, camPos, { pad: 0.35, marginT: 0.08, minSafeT: 0.15, anchorYOffset: 0.8 });
        }
        currentActiveCam.position.copy(camPos);
        currentActiveCam.lookAt(lookPivot);
        currentActiveCam.updateMatrixWorld();
    } else if (cameraMode === 'fpv') {
        const sightPos = new THREE.Vector3();
        if (window.gunElevationPivot) {
            window.gunElevationPivot.getWorldPosition(sightPos);
            sightPos.y += 0.38;
        } else if (window.turretGroup) {
            window.turretGroup.getWorldPosition(sightPos);
            sightPos.y += 0.95;
        } else {
            sightPos.set(tankState.x, tankState.y + 2.4, tankState.z);
        }

        const lookDir = new THREE.Vector3(
            -Math.sin(camOrbit.phi) * Math.sin(camOrbit.theta),
            -Math.cos(camOrbit.phi),
            -Math.sin(camOrbit.phi) * Math.cos(camOrbit.theta)
        ).normalize();

        // Keep the scope camera ahead of the turret so it clears the tank mesh and barrel.
        sightPos.addScaledVector(lookDir, 1.0);
        const sightTarget = sightPos.clone().addScaledVector(lookDir, 100.0);
        currentActiveCam.position.copy(sightPos);
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

    if (window.playerMode !== 'soldier') {
    // Manual Keyboard Override for Turret Traverse & Gun Elevation (Arrow Keys or I/J/K/L)
    const manualTurn = (keys['arrowleft'] || keys['j'] ? 1 : 0) - (keys['arrowright'] || keys['l'] ? 1 : 0);
    const manualElev = (keys['arrowup']   || keys['i'] ? 1 : 0) - (keys['arrowdown']  || keys['k'] ? 1 : 0);

    if (manualTurn !== 0 || manualElev !== 0) {
        const tSpeed = (tankState.TURRET_TURN_SPEED !== undefined) ? tankState.TURRET_TURN_SPEED : 1.0;
        tankState.targetTurretYaw += manualTurn * 0.95 * tSpeed * dt;
        tankState.targetGunElevation = THREE.MathUtils.clamp(
            tankState.targetGunElevation + manualElev * 0.55 * dt,
            tankState.MIN_ELEV_RAD,
            tankState.MAX_ELEV_RAD
        );
        if (cameraMode === 'sniper' || cameraMode === 'fpv') {
            camOrbit.theta = tankState.heading + tankState.targetTurretYaw + Math.PI;
            camOrbit.phi = THREE.MathUtils.clamp(Math.PI / 2 + tankState.targetGunElevation, 0.95, 2.20);
        }
    } else if (cameraMode === 'orbit' || cameraMode === 'fpv') {
        // WAR THUNDER / WoT 3D RAYCAST AIMING:
        raycaster.setFromCamera(aimCursorNDC, currentActiveCam);
        let foundHit = false;

        const aimCandidates = getAimRaycastCandidates(tankRoot.position);
        const hits = raycaster.intersectObjects(aimCandidates, false);
        for (let i = 0; i < hits.length; i++) {
            if (hits[i].distance > 3.0) {
                const obs = hits[i].object && hits[i].object.userData && hits[i].object.userData.obstacle;
                const checkWinFn = (typeof isPointInObstacleWindow === 'function')
                    ? isPointInObstacleWindow
                    : (typeof window !== 'undefined' ? window.isPointInObstacleWindow : null);
                if (obs && checkWinFn && checkWinFn(obs, hits[i].point)) {
                    continue; // Aim through window!
                }
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
    }

    // Shortest-angle hydraulic turret traverse smoothing
    let yawError = tankState.targetTurretYaw - tankState.turretYaw;
    yawError = Math.atan2(Math.sin(yawError), Math.cos(yawError));
    const tSpeed = (tankState.TURRET_TURN_SPEED !== undefined) ? tankState.TURRET_TURN_SPEED : 1.0;
    const maxTraverseStep = (cameraMode === 'fpv' ? 1.45 : 1.15) * tSpeed * dt;
    tankState.turretYaw += THREE.MathUtils.clamp(yawError, -maxTraverseStep, maxTraverseStep);
    tankState.turretYaw = Math.atan2(Math.sin(tankState.turretYaw), Math.cos(tankState.turretYaw));

    // Gun elevation smoothing
    const elevLerpRate = (cameraMode === 'fpv' ? 16 : 12);
    tankState.gunElevation = THREE.MathUtils.lerp(tankState.gunElevation, tankState.targetGunElevation, elevLerpRate * dt);

    turretGroup.rotation.y = tankState.turretYaw;
    gunElevationPivot.rotation.x = -tankState.gunElevation;
    turretGroup.updateMatrixWorld(true);

    // --- 4b. FRONT HULL BOW MACHINE GUN (Kugelblende 50 / Ball Mount) SHOOT RANGE CONE ---
    const curBowGroup = window.bowMgGroup || (window.tankModel && window.tankModel.bowMgGroup);
    if (curBowGroup && hullGroup && window.playerMode !== 'soldier') {
        const bowWorldPos = new THREE.Vector3();
        curBowGroup.getWorldPosition(bowWorldPos);

        const targetInHull = hullGroup.worldToLocal(worldAimPoint.clone());
        const bowInHull = hullGroup.worldToLocal(bowWorldPos);

        const dx = targetInHull.x - bowInHull.x;
        const dy = targetInHull.y - bowInHull.y;
        const dz = targetInHull.z - bowInHull.z;

        let targetBowYaw = 0;
        let targetBowPitch = 0;

        if (dz > 0.15) {
            targetBowYaw = Math.atan2(dx, dz);
            const horizDist = Math.max(0.1, Math.hypot(dx, dz));
            targetBowPitch = Math.atan2(dy, horizDist);
        } else {
            targetBowYaw = Math.sign(dx || 1) * THREE.MathUtils.degToRad(25.0);
            targetBowPitch = 0;
        }

        // Clamp to physical ball mount cone limits (±25° yaw, -12° to +18° pitch)
        const MAX_BOW_YAW = THREE.MathUtils.degToRad(25.0);
        const MIN_BOW_PITCH = THREE.MathUtils.degToRad(-12.0);
        const MAX_BOW_PITCH = THREE.MathUtils.degToRad(18.0);

        const clampedBowYaw = THREE.MathUtils.clamp(targetBowYaw, -MAX_BOW_YAW, MAX_BOW_YAW);
        const clampedBowPitch = THREE.MathUtils.clamp(targetBowPitch, MIN_BOW_PITCH, MAX_BOW_PITCH);

        tankState.bowMgYaw = THREE.MathUtils.lerp(tankState.bowMgYaw || 0, clampedBowYaw, 16.0 * dt);
        tankState.bowMgPitch = THREE.MathUtils.lerp(tankState.bowMgPitch || 0, clampedBowPitch, 16.0 * dt);

        curBowGroup.rotation.y = tankState.bowMgYaw;
        curBowGroup.rotation.x = -tankState.bowMgPitch;
        curBowGroup.updateMatrixWorld(true);
    }

    // --- 4. COMPUTE ACTUAL 8.8cm GUN BORE RAYCAST & PROJECT RETICLES ---
    const muzzleWorldPos = new THREE.Vector3();
    mainGunMuzzleTip.getWorldPosition(muzzleWorldPos);
    const barrelWorldQuat = new THREE.Quaternion();
    gunElevationPivot.getWorldQuaternion(barrelWorldQuat);
    const boreDir = new THREE.Vector3(0, 0, 1).applyQuaternion(barrelWorldQuat).normalize();

    raycaster.set(muzzleWorldPos, boreDir);
    let boreDist = 250.0;
    const boreCandidates = getAimRaycastCandidates(muzzleWorldPos);
    const boreHits = raycaster.intersectObjects(boreCandidates, false);
    let validBoreHit = null;
    for (let i = 0; i < boreHits.length; i++) {
        const obs = boreHits[i].object && boreHits[i].object.userData && boreHits[i].object.userData.obstacle;
        const checkWinFn = (typeof isPointInObstacleWindow === 'function')
            ? isPointInObstacleWindow
            : (typeof window !== 'undefined' ? window.isPointInObstacleWindow : null);
        if (obs && checkWinFn && checkWinFn(obs, boreHits[i].point)) {
            continue;
        }
        validBoreHit = boreHits[i];
        break;
    }
    if (validBoreHit) {
        actualGunHitPoint.copy(validBoreHit.point);
        boreDist = validBoreHit.distance;
    } else {
        raycaster.ray.at(250.0, actualGunHitPoint);
    }

    if (cameraMode === 'fpv') {
        const fpvRangeEl = document.getElementById('fpv-svg-range');
        if (fpvRangeEl) fpvRangeEl.textContent = `RANGE: ${Math.round(boreDist)}m`;
    }

    if (window.playerMode === 'soldier' || (window.tankState && window.tankState.hasTank === false)) {
        const camReticleEl = document.getElementById('camera-aim-reticle');
        if (camReticleEl) camReticleEl.style.opacity = '0';
        const boreReticleEl = document.getElementById('gun-bore-reticle');
        if (boreReticleEl) boreReticleEl.style.opacity = '0';
    } else if (cameraMode === 'orbit' || cameraMode === 'fpv' || cameraMode === 'inspect') {
        const camAimScreen = worldAimPoint.clone().project(currentActiveCam);
        const camReticleEl = document.getElementById('camera-aim-reticle');
        if (camAimScreen.z < 1.0) {
            const cx = (camAimScreen.x * 0.5 + 0.5) * window.innerWidth;
            const cy = (-camAimScreen.y * 0.5 + 0.5) * window.innerHeight;
            camReticleEl.style.left = `${cx}px`;
            camReticleEl.style.top  = `${cy}px`;
            camReticleEl.style.opacity = (cameraMode === 'fpv') ? '0' : '1';
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
        const totalReload = Math.max(0.2, tankState.RELOAD_TIME);
        const timeElapsed = totalReload - tankState.reloadTimer;
        // 1. Spent brass casing clatters out at ~20% of reload time
        if (tankState.reloadStage === 1 && timeElapsed >= totalReload * 0.20) {
            soundFX.playShellEject();
            tankState.reloadStage = 2;
        }
        // 2. Shell sliding into breech tray at ~55% of reload time
        if (tankState.reloadStage === 2 && timeElapsed >= totalReload * 0.55) {
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

    if (window.playerMode !== 'soldier') {
        const isCoaxActive = isFiringCoaxMG || window.isFiringCoaxMG || keys['f'];
        const isBowActive  = isFiringBowMG  || window.isFiringBowMG  || keys['g'];

        if (isCoaxActive) fireCoaxMG();
        if (isBowActive)  fireBowMG();

        if (!isCoaxActive && !isBowActive) {
            tankState.mgHeat = Math.max(0, tankState.mgHeat - 25 * dt);
        }
    } else {
        isFiringCoaxMG = false;
        isFiringBowMG = false;
        window.isFiringCoaxMG = false;
        window.isFiringBowMG = false;
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
        if (Math.abs(dx) > 8.0) continue;
        const dz = tree.z - tankZ;
        if (Math.abs(dz) > 8.0) continue;
        const distSq = dx * dx + dz * dz;
        const crushDist = 2.45 + (tree.radius || 1.2) * 0.45;
        if (distSq < crushDist * crushDist) {
            // Force direction is combination of contact normal and tank travel velocity
            let pushDir = new THREE.Vector3(dx, 0, dz).normalize();
            if (tankSpeed > 0.05) {
                const moveDir = headingDir.clone().multiplyScalar(Math.sign(tankState.speed));
                pushDir = pushDir.multiplyScalar(0.35).addScaledVector(moveDir, 0.65).normalize();
            }
            if (window.hitTree) {
                window.hitTree(tree, pushDir, Math.max(1.8, tankSpeed * 2.0));
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
                // Weighty, slow falling physics: starts with heavy wood resistance, accelerating gently under gravity
                const gravityTorque = 1.15 * Math.sin(st.fallAngle + 0.14) + 0.12;
                st.angularVel += gravityTorque * dt;
                st.angularVel = Math.min(st.angularVel, 1.45);
                st.fallAngle += st.angularVel * dt;
                if (st.fallAngle >= st.maxFallAngle) {
                    st.fallAngle = st.maxFallAngle;
                    st.angularVel = 0;
                    // Dust puff impact when canopy/trunk hits the ground
                    const tipDist = (st.trunkHeight || 3.5) * 0.72;
                    const hDirX = st.fallDir ? st.fallDir.x : -st.fallAxis.z;
                    const hDirZ = st.fallDir ? st.fallDir.z : st.fallAxis.x;
                    const tipX = st.x + hDirX * tipDist;
                    const tipZ = st.z + hDirZ * tipDist;
                    const tipY = getTerrainHeight(tipX, tipZ);
                                        const treeDustCol = (window.currentZoneConfig && window.currentZoneConfig.trackDustColor) ? window.currentZoneConfig.trackDustColor : 0x5a4d41;
                    for (let p = 0; p < 9; p++) {
                        const dVel = new THREE.Vector3(
                            (Math.random() - 0.5) * 4.2,
                            0.5 + Math.random() * 1.5,
                            (Math.random() - 0.5) * 4.2
                        );
                        spawnParticle(new THREE.Vector3(tipX, tipY + 0.15, tipZ), dVel, treeDustCol, 0.45, 2.6, 1.3 + Math.random() * 0.5, false, 'dust', {
                            maxOpacity: 0.78,
                            drag: 0.90,
                            buoyancy: -0.05
                        });
                    }
                }
                st.group.quaternion.setFromAxisAngle(st.fallAxis, st.fallAngle);
            }
        } else {
            const tdx = st.x - tankX;
            const tdz = st.z - tankZ;
            if (tdx * tdx + tdz * tdz < 7225) { // 85m radius cull
                st.group.rotation.z = Math.sin(nowSec * 1.4 + st.phase) * 0.022;
                st.group.rotation.x = Math.cos(nowSec * 1.1 + st.phase) * 0.015;
            }
        }
    }

    // --- 7. BALLISTIC PROJECTILES & PARTICLES ---
    updateProjectiles(dt);
    updateParticles(dt);
    if (typeof window.updateEnemyTanks === 'function') {
        window.updateEnemyTanks(dt);
    }
    if (typeof window.updateSoldiers === 'function') {
        window.updateSoldiers(dt);
    }
    if (typeof window.updateBicycles === 'function') {
        window.updateBicycles(dt);
    }
    if (typeof window.updateGrenades === 'function') {
        window.updateGrenades(dt);
    }

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

    // Single directional light: sun by day, moon by night
    const lightDist = 95.0;
    const isSunActive = (sunY >= 0.0);
    const celestialDir = isSunActive ? sunDir : moonDir;
    const focusX = (window.playerMode === 'soldier' && window.playerSoldier) ? window.playerSoldier.x : tankState.x;
    const focusY = (window.playerMode === 'soldier' && window.playerSoldier) ? window.playerSoldier.y : tankState.y;
    const focusZ = (window.playerMode === 'soldier' && window.playerSoldier) ? window.playerSoldier.z : tankState.z;
    sunLight.position.set(focusX + celestialDir.x * lightDist, focusY + celestialDir.y * lightDist, focusZ + celestialDir.z * lightDist);
    sunLight.target.position.set(focusX, focusY, focusZ);
    sunLight.target.updateMatrixWorld();

    const farSnapX = Math.round(focusX / FAR_SHADOW_TEXEL) * FAR_SHADOW_TEXEL;
    const farSnapZ = Math.round(focusZ / FAR_SHADOW_TEXEL) * FAR_SHADOW_TEXEL;
    const farLightDist = 190.0;
    farShadowLight.position.set(farSnapX + celestialDir.x * farLightDist, focusY + celestialDir.y * farLightDist, farSnapZ + celestialDir.z * farLightDist);
    farShadowLight.target.position.set(farSnapX, focusY, farSnapZ);
    farShadowLight.target.updateMatrixWorld();

    // Maldive continuous atmospheric interpolation factors
    const dayFactor = THREE.MathUtils.smoothstep(sunY, -0.10, 0.28);
    const twilightFactor = THREE.MathUtils.smoothstep(sunY, -0.20, 0.06) * (1.0 - THREE.MathUtils.smoothstep(sunY, 0.04, 0.34));
    const nightFactor = 1.0 - THREE.MathUtils.smoothstep(sunY, -0.14, 0.04);

    // Sun & moon directional lighting (Calibrated for physically based ACESFilmic exposure)
    const sunCol = DAY_NIGHT_COLORS.noonSun.clone().lerp(DAY_NIGHT_COLORS.goldenHour, Math.min(1.0, twilightFactor * 1.05));
    const sunHorizonFade = THREE.MathUtils.smoothstep(sunY, -0.015, 0.035);
    const sunIntensity = Math.max(0.0, THREE.MathUtils.smoothstep(sunY, -0.06, 0.26) * 1.72 + twilightFactor * 1.45) * sunHorizonFade;
    const moonRiseFade = THREE.MathUtils.smoothstep(-sunY, -0.01, 0.038);
    const moonIntensity = moonRiseFade * 1.38;
    sunLight.color.copy(isSunActive ? sunCol : MOON_LIGHT_COLOR);
    sunLight.intensity = isSunActive ? sunIntensity : moonIntensity;

    // Sun and moon cast shadows when the celestial light is above the horizon.
    updateCelestialShadows((sunLight.intensity > 0.12) && (celestialDir.y > 0.02));

    // Sky top & horizon colors calibrated from Maldive + Zone atmospheric tinting
    const zoneDayHor = (window.currentZoneConfig && window.currentZoneConfig.dayHorizonTint)
        ? new THREE.Color(window.currentZoneConfig.dayHorizonTint)
        : DAY_NIGHT_COLORS.dayHor;
    const zoneGroundDay = (window.currentZoneConfig && window.currentZoneConfig.groundDayTint)
        ? new THREE.Color(window.currentZoneConfig.groundDayTint)
        : DAY_NIGHT_COLORS.groundDay;

    const skyHorizonColor = DAY_NIGHT_COLORS.nitHor.clone()
        .lerp(zoneDayHor, dayFactor)
        .lerp(DAY_NIGHT_COLORS.sunHor, Math.min(1.0, twilightFactor * 1.15));

    const skyTopColor = DAY_NIGHT_COLORS.nitTop.clone()
        .lerp(DAY_NIGHT_COLORS.dayTop, dayFactor)
        .lerp(DAY_NIGHT_COLORS.sunTop, Math.min(1.0, twilightFactor * 0.95));

    // Hemisphere natural bounce lighting (Zone ground up + Sky down)
    hemiLight.color.copy(skyHorizonColor).lerp(MOON_LIGHT_COLOR, nightFactor * 0.28);
    hemiLight.groundColor.copy(DAY_NIGHT_COLORS.groundNight).lerp(zoneGroundDay, dayFactor);
    hemiLight.intensity = 0.42 + dayFactor * 0.18 + twilightFactor * 0.16 + nightFactor * 0.32;

    // Babylon-calibrated ACES exposure: keep twilight colors rich and saturated without washing out
    renderer.toneMappingExposure = 0.94 + dayFactor * 0.18 + twilightFactor * 0.04;

    // Update sky-matched PMREM IBL throttled by time-of-day or zone change
    const curZoneIdx = (typeof window.currentZoneIndex === 'number') ? window.currentZoneIndex : 0;
    if (Math.abs(dayNight.time - _lastIblTime) > 0.25 || curZoneIdx !== _lastIblZone) {
        _lastIblTime = dayNight.time;
        _lastIblZone = curZoneIdx;
        updateSkyEnvironmentMap(skyTopColor, skyHorizonColor, hemiLight.groundColor, sunCol, dayFactor, twilightFactor);
    }

    // Fog & Background synced with horizon atmosphere (clearer twilight so sunrise/sunset light shines through)
    if (scene.fog) {
        scene.fog.color.copy(skyHorizonColor);
        const baseFogDens = (window.currentZoneConfig && window.currentZoneConfig.fogDensity) ? window.currentZoneConfig.fogDensity : 0.00085;
        scene.fog.density = Math.max(0.00025, baseFogDens * (1.0 - twilightFactor * 0.45) + nightFactor * 0.00025);
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
        window.celestialLighting.sunDirection.value.copy(celestialDir);
        window.celestialLighting.sunColor.value.copy(sunLight.color);
        window.celestialLighting.skyColor.value.copy(skyHorizonColor);
        if (!window.celestialLighting.skyTopColor) {
            window.celestialLighting.skyTopColor = { value: new THREE.Color() };
        }
        window.celestialLighting.skyTopColor.value.copy(skyTopColor);
        if (window.celestialLighting.groundColor) {
            window.celestialLighting.groundColor.value.copy(hemiLight.groundColor);
        }
        const sssShadowFade = THREE.MathUtils.smoothstep(celestialDir.y, -0.015, 0.025);
        if (!window.celestialLighting.sssStrength) {
            window.celestialLighting.sssStrength = { value: 1.0 };
        }
        window.celestialLighting.sssStrength.value = isSunActive
            ? sssShadowFade * THREE.MathUtils.clamp(sunIntensity / 0.85, 0.0, 1.15)
            : sssShadowFade * moonRiseFade * 0.55;
        if (!window.celestialLighting.hazeStrength) {
            window.celestialLighting.hazeStrength = { value: 1.0 };
        }
        window.celestialLighting.hazeStrength.value = Math.max(0.32, 0.65 - twilightFactor * 0.30 - nightFactor * 0.18);
        window.celestialLighting.time.value = nowSec;
    }

    // Bosch Headlights activation during dusk and night
    const isDark = (sunY < 0.02);
    const hlLights = window.headlightLights || [];
    const isPlayerInTank = (window.playerMode !== 'soldier' && window.tankState && window.tankState.hasTank !== false && window.tankRoot && window.tankRoot.visible);
    const activeBicycle = window.playerMode === 'soldier' && window.playerSoldier && window.playerSoldier.isMountedBicycle
        ? window.playerSoldier.currentBicycle
        : null;
    const isPlayerInBicycle = Boolean(activeBicycle && activeBicycle.root && activeBicycle.model && activeBicycle.model.headlightAnchor);
    const isLit = (isPlayerInTank || isPlayerInBicycle) && Boolean(tankState.headlightsOn || isDark);

    if (isPlayerInTank && window.tankRoot) {
        window.tankRoot.updateMatrixWorld(true);
    } else if (isPlayerInBicycle) {
        activeBicycle.root.updateMatrixWorld(true);
    }

    const persistentSpots = window.persistentHeadlightSpots || [];
    for (let i = 0; i < persistentSpots.length; i++) {
        const spot = persistentSpots[i];
        const entry = hlLights[i];
        if (isPlayerInTank && entry && entry.anchor) {
            entry.anchor.getWorldPosition(_hlMountPos);
            entry.anchor.getWorldQuaternion(_hlQuat);

            spot.position.copy(_hlMountPos);
            _hlForward.set(0, -0.35, 16).applyQuaternion(_hlQuat);
            _hlTargetPos.copy(_hlMountPos).add(_hlForward);
            spot.target.position.copy(_hlTargetPos);

            spot.distance = 45;
            spot.angle = Math.PI / 5;
            spot.intensity = isLit ? 3.2 : 0.0;
            if (entry.slitMat) {
                entry.slitMat.color.setHex(isLit ? 0xfef08a : 0x334155);
            }
        } else if (isPlayerInBicycle && i === 0) {
            const anchor = activeBicycle.model.headlightAnchor;
            anchor.getWorldPosition(_hlMountPos);
            anchor.getWorldQuaternion(_hlQuat);

            spot.position.copy(_hlMountPos);
            _hlForward.set(0, -0.35, 12).applyQuaternion(_hlQuat);
            _hlTargetPos.copy(_hlMountPos).add(_hlForward);
            spot.target.position.copy(_hlTargetPos);

            spot.distance = 24;
            spot.angle = Math.PI / 6;
            spot.intensity = isLit ? 2.4 : 0.0;
            activeBicycle.model.lensMat.color.setHex(isLit ? 0xfef08a : 0x334155);
        } else {
            spot.intensity = 0.0;
            spot.position.set(0, -1000, 0);
            spot.target.position.set(0, -1001, 0);
        }
    }

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

    // Mobile Mini HUD updates
    const mobSpeedEl = document.getElementById('mob-speed');
    if (mobSpeedEl) mobSpeedEl.textContent = kmh;
    const mobMoneyEl = document.getElementById('hud-money');
    if (mobMoneyEl) {
        mobMoneyEl.textContent = `$${window.playerMoney || 0}`;
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

// SSAO re-renders the whole scene (normals + depth + FX layer) every frame and was the main GPU bottleneck.
// It is now opt-in via ?ssao=1; the default path renders the scene once with hardware MSAA.
const useSSAO = /[?&]ssao=1/.test(window.location.search);
window.useSSAO = useSSAO;

// ============================================================================
// Resolution & Settings Management
// ============================================================================
const RESOLUTION_PRESETS = {
    'default': { label: 'Default (Window Size)', height: null },
    '2k':      { label: '2K (1440p)',           height: 1440 },
    '1080p':   { label: '1080p (Full HD)',      height: 1080 },
    '720p':    { label: '720p (HD)',            height: 720 },
    '480p':    { label: '480p (SD)',            height: 480 },
    '320p':    { label: '320p (Low)',           height: 320 },
    '240p':    { label: '240p (Retro)',         height: 240 }
};
window.RESOLUTION_PRESETS = RESOLUTION_PRESETS;

function getInitialDefaultResolution(w, h) {
    const winW = (typeof w === 'number') ? w : ((typeof window !== 'undefined' && window.innerWidth) || 1280);
    const winH = (typeof h === 'number') ? h : ((typeof window !== 'undefined' && window.innerHeight) || 720);
    if (winW > 1280 || winH > 720 || (winW * winH > 1280 * 720)) {
        return '720p';
    }
    return 'default';
}
window.getInitialDefaultResolution = getInitialDefaultResolution;

let currentResolutionKey = getInitialDefaultResolution();
try {
    const saved = localStorage.getItem('ww2Simulator_resolution') || localStorage.getItem('tankClash_resolution');
    if (saved && RESOLUTION_PRESETS[saved]) {
        currentResolutionKey = saved;
    }
} catch (e) {}

// Adaptive resolution: trade pixel density for a stable frame rate
const isMobUser = (typeof isMobileBrowser === 'function' && isMobileBrowser()) || (typeof isMobileDevice === 'function' && isMobileDevice());
const maxPixelRatio = isMobUser ? 1.0 : Math.min(window.devicePixelRatio || 1.5, 1.5);
const adaptiveRes = { ratio: maxPixelRatio, max: maxPixelRatio, min: 0.65, avgMs: 16.7, cooldown: 0 };
window.adaptiveRes = adaptiveRes;

function getEffectiveDimensions(presetKey) {
    const winW = window.innerWidth || 1920;
    const winH = window.innerHeight || 1080;
    const aspect = winW / winH;

    if (!presetKey || presetKey === 'default') {
        const pr = adaptiveRes.ratio;
        return {
            targetW: Math.floor(winW * pr),
            targetH: Math.floor(winH * pr),
            pixelRatio: pr,
            isDefault: true
        };
    }

    const preset = RESOLUTION_PRESETS[presetKey];
    if (!preset || !preset.height) {
        return {
            targetW: winW,
            targetH: winH,
            pixelRatio: 1,
            isDefault: true
        };
    }

    const targetH = preset.height;
    const targetW = Math.round(targetH * aspect);
    return {
        targetW: targetW,
        targetH: targetH,
        pixelRatio: 1,
        isDefault: false
    };
}

function updateResolutionUI() {
    const badge = document.getElementById('current-res-badge');
    if (badge && window.renderer && window.renderer.domElement) {
        const bw = window.renderer.domElement.width;
        const bh = window.renderer.domElement.height;
        const key = currentResolutionKey;
        const label = key === 'default' ? 'Default' : key.toUpperCase();
        badge.textContent = `${bw}×${bh} (${label})`;
    }

    const buttons = document.querySelectorAll('.res-option-btn');
    buttons.forEach(btn => {
        const res = btn.getAttribute('data-res');
        const isSelected = (res === currentResolutionKey);
        btn.classList.toggle('active', isSelected);
        const check = btn.querySelector('.res-check');
        if (check) {
            check.classList.toggle('hidden', !isSelected);
        }
    });
}
window.updateResolutionUI = updateResolutionUI;

function applyResolution(presetKey) {
    if (!RESOLUTION_PRESETS[presetKey]) presetKey = 'default';
    currentResolutionKey = presetKey;
    try {
        localStorage.setItem('ww2Simulator_resolution', presetKey);
        localStorage.setItem('tankClash_resolution', presetKey);
    } catch (e) {}

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    if (winW <= 0 || winH <= 0) return;

    const dims = getEffectiveDimensions(presetKey);

    if (window.perspCamera) {
        window.perspCamera.aspect = winW / winH;
        window.perspCamera.updateProjectionMatrix();
    }
    if (window.orthoCamera) {
        const aspect = winW / winH;
        window.orthoCamera.left = -orthoFrustumSize * aspect / 2;
        window.orthoCamera.right = orthoFrustumSize * aspect / 2;
        window.orthoCamera.top = orthoFrustumSize / 2;
        window.orthoCamera.bottom = -orthoFrustumSize / 2;
        window.orthoCamera.updateProjectionMatrix();
    }

    if (window.renderer) {
        if (dims.isDefault) {
            window.renderer.setPixelRatio(dims.pixelRatio);
            window.renderer.setSize(winW, winH, false);
        } else {
            window.renderer.setPixelRatio(1);
            window.renderer.setSize(dims.targetW, dims.targetH, false);
        }
        if (window.renderer.domElement) {
            window.renderer.domElement.style.width = '100%';
            window.renderer.domElement.style.height = '100%';
        }
    }

    updateResolutionUI();
}

function setResolution(key) {
    applyResolution(key);
}
window.setResolution = setResolution;

function getResolution() {
    return currentResolutionKey;
}
window.getResolution = getResolution;

function updateAdaptiveResolution(frameMs) {
    if (currentResolutionKey !== 'default') return;

    adaptiveRes.avgMs = adaptiveRes.avgMs * 0.95 + Math.min(frameMs, 100) * 0.05;
    if (adaptiveRes.cooldown-- > 0) return;
    let next = adaptiveRes.ratio;
    if (adaptiveRes.avgMs > 22 && next > adaptiveRes.min) next = Math.max(adaptiveRes.min, next - 0.15);
    else if (adaptiveRes.avgMs < 14 && next < adaptiveRes.max) next = Math.min(adaptiveRes.max, next + 0.1);
    if (Math.abs(next - adaptiveRes.ratio) > 0.01) {
        adaptiveRes.ratio = next;
        if (renderer) {
            renderer.setPixelRatio(next);
            renderer.setSize(window.innerWidth, window.innerHeight, false);
        }
        adaptiveRes.cooldown = 90;
        updateResolutionUI();
    }
}

// ============================================================================
// BABYLON-INSPIRED PLANAR WATER REFLECTION & HDR BLOOM POST-PROCESSING
// ============================================================================
const WATER_CLIP_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 2.52);
const waterReflectCamera = new THREE.PerspectiveCamera(42, 1, 0.25, 12000);
const _reflFwd = new THREE.Vector3();
let waterReflectionRT = null;

function hasHalfFloatColorBuffer() {
    const gl = renderer.getContext();
    if (!gl || !renderer.capabilities.isWebGL2) return false;
    return Boolean(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
}

function ensureWaterReflectionRT() {
    const isMob = (typeof isMobileBrowser === 'function' && isMobileBrowser()) || (typeof isMobileDevice === 'function' && isMobileDevice());
    const scale = isMob ? 0.28 : 0.42;
    const w = Math.max(128, Math.floor(window.innerWidth * scale));
    const h = Math.max(128, Math.floor(window.innerHeight * scale));
    if (!waterReflectionRT || waterReflectionRT.width !== w || waterReflectionRT.height !== h) {
        if (waterReflectionRT) waterReflectionRT.dispose();
        waterReflectionRT = new THREE.WebGLRenderTarget(w, h, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: hasHalfFloatColorBuffer() ? THREE.HalfFloatType : THREE.UnsignedByteType,
            depthBuffer: true,
            stencilBuffer: false
        });
    }
    return waterReflectionRT;
}

let waterReflectFrameCounter = 0;

const REFLECTION_LOD_LAYER = 2;
window.REFLECTION_LOD_LAYER = REFLECTION_LOD_LAYER;
const _reflTempVisible = [];

function ensureReflectionLayer(root, minSize = 0) {
    if (!root || root._reflLayerEnabled) return;
    root.traverse((c) => {
        if (!c.isMesh || c.isInstancedMesh) {
            c.layers.enable(REFLECTION_LOD_LAYER);
            return;
        }
        if (minSize > 0 && c.geometry) {
            if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
            const bb = c.geometry.boundingBox;
            if (bb && Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) < minSize) {
                return;
            }
        }
        c.layers.enable(REFLECTION_LOD_LAYER);
    });
    root._reflLayerEnabled = true;
}

function renderWaterReflection(renderCamera) {
    const water = window.waterMeshRef;
    if (!water || !water.visible || !water.material || !water.material.uniforms || !renderCamera || !renderCamera.isPerspectiveCamera) {
        if (water && water.material && water.material.uniforms && water.material.uniforms.uHasReflection) {
            water.material.uniforms.uHasReflection.value = 0.0;
        }
        return;
    }
    if ((typeof window.getGraphicsMode === 'function' && window.getGraphicsMode() !== 'high') || renderCamera.position.y < -2.35) {
        water.material.uniforms.uHasReflection.value = 0.0;
        return;
    }
    if (typeof window.hasVisibleWaterForCamera === 'function' && !window.hasVisibleWaterForCamera(renderCamera)) {
        water.material.uniforms.uHasReflection.value = 0.0;
        waterReflectFrameCounter = 0;
        return;
    }

    const rt = ensureWaterReflectionRT();
    // Throttle planar reflection pass to every 2nd frame while keeping texture bound
    if ((waterReflectFrameCounter++ & 1) === 1 && water.material.uniforms.uHasReflection.value > 0.5) {
        return;
    }
    waterReflectCamera.fov = renderCamera.fov;
    waterReflectCamera.aspect = renderCamera.aspect;
    waterReflectCamera.near = renderCamera.near;
    waterReflectCamera.far = renderCamera.far;
    waterReflectCamera.updateProjectionMatrix();

    renderCamera.getWorldDirection(_reflFwd);
    waterReflectCamera.position.set(renderCamera.position.x, -5.0 - renderCamera.position.y, renderCamera.position.z);
    waterReflectCamera.up.set(0, 1, 0);
    waterReflectCamera.lookAt(
        renderCamera.position.x + _reflFwd.x * 100.0,
        -5.0 - (renderCamera.position.y + _reflFwd.y * 100.0),
        renderCamera.position.z + _reflFwd.z * 100.0
    );
    waterReflectCamera.updateMatrixWorld(true);
    waterReflectCamera.layers.mask = (1 << REFLECTION_LOD_LAYER);

    water.material.uniforms.uReflectVP.value.multiplyMatrices(waterReflectCamera.projectionMatrix, waterReflectCamera.matrixWorldInverse);
    water.material.uniforms.tReflection.value = rt.texture;
    water.material.uniforms.uHasReflection.value = 1.0;

    if (window.tankModel && window.tankModel.tankRoot) ensureReflectionLayer(window.tankModel.tankRoot, 0.45);
    if (window.playerSoldier && window.playerSoldier.rig && window.playerSoldier.rig.root) {
        ensureReflectionLayer(window.playerSoldier.rig.root);
    }

    _reflTempVisible.length = 0;
    const soldiers = window.activeSoldiers;
    if (soldiers) {
        for (let i = 0; i < soldiers.length; i++) {
            const s = soldiers[i];
            if (s && !s.isDead && s.lodGroup && !s.lodGroup.visible) {
                s.lodGroup.visible = true;
                _reflTempVisible.push(s.lodGroup);
            }
        }
    }
    const enemyTanks = window.activeEnemyTanks;
    if (enemyTanks) {
        for (let i = 0; i < enemyTanks.length; i++) {
            const e = enemyTanks[i];
            if (e && !e.isKnockedOut && e.lodRoot && !e.lodRoot.visible) {
                e.lodRoot.visible = true;
                _reflTempVisible.push(e.lodRoot);
            }
        }
    }

    const oldTarget = renderer.getRenderTarget();
    const oldShadowAuto = renderer.shadowMap.autoUpdate;
    const oldClip = renderer.localClippingEnabled;
    const oldPlanes = renderer.clippingPlanes;
    const oldSkyPos = window.skyDome ? window.skyDome.position.clone() : null;

    try {
        water.visible = false;
        renderer.shadowMap.autoUpdate = false;
        renderer.localClippingEnabled = true;
        renderer.clippingPlanes = [WATER_CLIP_PLANE];
        if (window.skyDome) window.skyDome.position.copy(waterReflectCamera.position);
        renderer.setRenderTarget(rt);
        renderer.clear();
        renderer.render(scene, waterReflectCamera);
    } finally {
        water.visible = true;
        for (let i = 0; i < _reflTempVisible.length; i++) {
            _reflTempVisible[i].visible = false;
        }
        _reflTempVisible.length = 0;
        renderer.shadowMap.autoUpdate = oldShadowAuto;
        renderer.localClippingEnabled = oldClip;
        renderer.clippingPlanes = oldPlanes;
        if (window.skyDome && oldSkyPos) window.skyDome.position.copy(oldSkyPos);
        renderer.setRenderTarget(oldTarget);
    }
}

const babylonPost = {
    initialized: false,
    supported: false,
    ssaoSupported: false,
    hdrRT: null,
    bloomRTs: [],
    aoRT: null,
    aoBlurRT: null,
    quadScene: null,
    quadCam: null,
    quadMesh: null,
    downsampleMat: null,
    upsampleMat: null,
    ssaoMat: null,
    aoBlurMat: null,
    compositeMat: null,

    init() {
        this.initialized = true;
        const isMob = (typeof isMobileBrowser === 'function' && isMobileBrowser()) || (typeof isMobileDevice === 'function' && isMobileDevice());
        if (isMob || !hasHalfFloatColorBuffer()) {
            this.supported = false;
            return;
        }
        this.supported = true;
        this.ssaoSupported = !!(renderer.capabilities.isWebGL2 || renderer.extensions.get('WEBGL_depth_texture'));
        this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.quadScene = new THREE.Scene();

        const vs = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
        this.downsampleMat = new THREE.ShaderMaterial({
            uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0.0 } },
            vertexShader: vs,
            fragmentShader: `
                uniform sampler2D tSrc;
                uniform vec2 uTexel;
                uniform float uFirst;
                varying vec2 vUv;
                void main() {
                    vec3 c = (
                        texture2D(tSrc, vUv + vec2(-uTexel.x, -uTexel.y)).rgb +
                        texture2D(tSrc, vUv + vec2( uTexel.x, -uTexel.y)).rgb +
                        texture2D(tSrc, vUv + vec2(-uTexel.x,  uTexel.y)).rgb +
                        texture2D(tSrc, vUv + vec2( uTexel.x,  uTexel.y)).rgb
                    ) * 0.25;
                    if (uFirst > 0.5) {
                        c = min(c, vec3(16.0));
                        float br = max(c.r, max(c.g, c.b));
                        float thresh = 1.65;
                        float knee = 0.35;
                        float soft = clamp(br - thresh + knee, 0.0, 2.0 * knee);
                        soft = (soft * soft) / (4.0 * knee + 1e-5);
                        float contrib = max(soft, br - thresh) / max(br, 1e-5);
                        c *= max(contrib, 0.0);
                    }
                    gl_FragColor = vec4(c, 1.0);
                }
            `,
            depthTest: false, depthWrite: false
        });

        this.upsampleMat = new THREE.ShaderMaterial({
            uniforms: { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } },
            vertexShader: vs,
            fragmentShader: `
                uniform sampler2D tSrc;
                uniform sampler2D tAdd;
                uniform vec2 uTexel;
                varying vec2 vUv;
                void main() {
                    vec3 b = (
                        texture2D(tSrc, vUv + vec2(-uTexel.x, -uTexel.y)).rgb +
                        texture2D(tSrc, vUv + vec2( uTexel.x, -uTexel.y)).rgb +
                        texture2D(tSrc, vUv + vec2(-uTexel.x,  uTexel.y)).rgb +
                        texture2D(tSrc, vUv + vec2( uTexel.x,  uTexel.y)).rgb
                    ) * 0.25;
                    vec3 base = texture2D(tAdd, vUv).rgb;
                    gl_FragColor = vec4(base + b * 0.72, 1.0);
                }
            `,
            depthTest: false, depthWrite: false
        });

        this.ssaoMat = new THREE.ShaderMaterial({
            uniforms: {
                tDepth: { value: null },
                uInvProj: { value: new THREE.Matrix4() },
                uProj: { value: new THREE.Matrix4() },
                uDepthTexel: { value: new THREE.Vector2() },
                uRadius: { value: 1.15 },
                uStrength: { value: 0.90 }
            },
            vertexShader: vs,
            fragmentShader: `
                uniform sampler2D tDepth;
                uniform mat4 uInvProj;
                uniform mat4 uProj;
                uniform vec2 uDepthTexel;
                uniform float uRadius;
                uniform float uStrength;
                varying vec2 vUv;

                float ign(vec2 p) {
                    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
                }

                vec3 getViewPos(vec2 uv, float d) {
                    vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
                    vec4 vp = uInvProj * ndc;
                    return vp.xyz / vp.w;
                }

                vec3 reconstructViewNormal(vec2 uv, vec3 p0) {
                    vec2 dx = vec2(uDepthTexel.x, 0.0);
                    vec2 dy = vec2(0.0, uDepthTexel.y);
                    vec3 pL = getViewPos(uv - dx, texture2D(tDepth, uv - dx).x);
                    vec3 pR = getViewPos(uv + dx, texture2D(tDepth, uv + dx).x);
                    vec3 pD = getViewPos(uv - dy, texture2D(tDepth, uv - dy).x);
                    vec3 pU = getViewPos(uv + dy, texture2D(tDepth, uv + dy).x);

                    vec3 dPdx = (abs(pR.z - p0.z) < abs(p0.z - pL.z)) ? (pR - p0) : (p0 - pL);
                    vec3 dPdy = (abs(pU.z - p0.z) < abs(p0.z - pD.z)) ? (pU - p0) : (p0 - pD);
                    return normalize(cross(dPdx, dPdy));
                }

                void main() {
                    float d0 = texture2D(tDepth, vUv).x;
                    if (d0 >= 0.99998) {
                        gl_FragColor = vec4(1.0);
                        return;
                    }

                    vec3 viewPos = getViewPos(vUv, d0);
                    float distFade = 1.0 - smoothstep(75.0, 180.0, -viewPos.z);
                    if (distFade <= 0.001) {
                        gl_FragColor = vec4(1.0);
                        return;
                    }

                    vec3 viewNormal = reconstructViewNormal(vUv, viewPos);
                    vec3 upVec = abs(viewNormal.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
                    vec3 tangent = normalize(cross(upVec, viewNormal));
                    vec3 bitangent = cross(viewNormal, tangent);

                    float baseAngle = ign(gl_FragCoord.xy) * 6.2831853;
                    float occlusion = 0.0;

                    for (int i = 0; i < 16; i++) {
                        float fi = float(i);
                        float r = sqrt((fi + 0.5) / 16.0);
                        float theta = fi * 2.39996323 + baseAngle;
                        float zH = mix(0.15, 1.0, fract(fi * 0.61803399 + baseAngle * 0.15915494));
                        float xyScale = sqrt(max(0.0, 1.0 - zH * zH));
                        vec3 sampleDir = tangent * (cos(theta) * xyScale) + bitangent * (sin(theta) * xyScale) + viewNormal * zH;
                        float sampleDist = uRadius * (0.12 + 0.88 * r * r);
                        vec3 samplePos = viewPos + sampleDir * sampleDist;

                        vec4 clip = uProj * vec4(samplePos, 1.0);
                        vec2 sampleUv = (clip.xy / clip.w) * 0.5 + 0.5;
                        if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;

                        float sd = texture2D(tDepth, sampleUv).x;
                        if (sd >= 0.99998) continue;

                        vec3 occluderPos = getViewPos(sampleUv, sd);
                        vec3 v = occluderPos - viewPos;
                        float dLen = length(v);
                        if (dLen > 0.025 && dLen < uRadius) {
                            float cosT = dot(v / dLen, viewNormal);
                            float contrib = max(0.0, cosT - 0.12);
                            float falloff = 1.0 - smoothstep(uRadius * 0.35, uRadius, dLen);
                            occlusion += contrib * falloff;
                        }
                    }

                    float ao = 1.0 - clamp((occlusion / 16.0) * 2.6, 0.0, 1.0);
                    ao = pow(ao, 1.35);
                    ao = mix(1.0, ao, distFade * uStrength);
                    gl_FragColor = vec4(ao, ao, ao, 1.0);
                }
            `,
            depthTest: false, depthWrite: false
        });

        this.aoBlurMat = new THREE.ShaderMaterial({
            uniforms: {
                tAO: { value: null },
                tDepth: { value: null },
                uInvProj: { value: new THREE.Matrix4() },
                uDir: { value: new THREE.Vector2() }
            },
            vertexShader: vs,
            fragmentShader: `
                uniform sampler2D tAO;
                uniform sampler2D tDepth;
                uniform mat4 uInvProj;
                uniform vec2 uDir;
                varying vec2 vUv;

                float getViewZ(float d) {
                    vec4 vp = uInvProj * vec4(0.0, 0.0, d * 2.0 - 1.0, 1.0);
                    return vp.z / vp.w;
                }

                void main() {
                    float d0 = texture2D(tDepth, vUv).x;
                    if (d0 >= 0.99998) {
                        gl_FragColor = vec4(1.0);
                        return;
                    }
                    float z0 = getViewZ(d0);
                    float sum = 0.0;
                    float wSum = 0.0;
                    for (int i = -4; i <= 4; i++) {
                        float fi = float(i);
                        vec2 suv = clamp(vUv + uDir * fi, 0.0, 1.0);
                        float di = texture2D(tDepth, suv).x;
                        if (di >= 0.99998) continue;
                        float zi = getViewZ(di);
                        float wSpatial = exp(-(fi * fi) / 8.0);
                        float wDepth = exp(-abs(zi - z0) * 3.5);
                        float w = wSpatial * wDepth;
                        sum += texture2D(tAO, suv).r * w;
                        wSum += w;
                    }
                    float res = (wSum > 1e-5) ? (sum / wSum) : texture2D(tAO, vUv).r;
                    gl_FragColor = vec4(res, res, res, 1.0);
                }
            `,
            depthTest: false, depthWrite: false
        });

        this.compositeMat = new THREE.ShaderMaterial({
            uniforms: {
                tScene: { value: null },
                tBloom: { value: null },
                tAO: { value: null },
                uUseSSAO: { value: 0.0 },
                uExposure: { value: 1.08 }
            },
            vertexShader: vs,
            fragmentShader: `
                uniform sampler2D tScene;
                uniform sampler2D tBloom;
                uniform sampler2D tAO;
                uniform float uUseSSAO;
                uniform float uExposure;
                varying vec2 vUv;
                vec3 acesFilm(vec3 x) {
                    x *= 0.6;
                    float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
                    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
                }
                void main() {
                    vec3 sceneCol = texture2D(tScene, vUv).rgb;
                    if (uUseSSAO > 0.5) {
                        float ao = texture2D(tAO, vUv).r;
                        float luma = dot(sceneCol, vec3(0.2126, 0.7152, 0.0722));
                        float aoWeight = mix(1.0, 0.35, smoothstep(0.6, 2.5, luma));
                        sceneCol *= mix(1.0, ao, aoWeight);
                    }
                    vec3 hdr = sceneCol + texture2D(tBloom, vUv).rgb * 0.28;
                    hdr *= uExposure;
                    vec3 col = acesFilm(hdr);
                    vec2 q = vUv - 0.5;
                    col *= 1.0 - dot(q, q) * 0.09;
                    col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));
                    gl_FragColor = vec4(col, 1.0);
                }
            `,
            depthTest: false, depthWrite: false
        });

        this.quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMat);
        this.quadScene.add(this.quadMesh);
    },

    ensureTargets() {
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        const w = Math.max(64, size.x);
        const h = Math.max(64, size.y);
        const needSSAO = !!(useSSAO && this.ssaoSupported);
        const hasCorrectTargets = this.hdrRT && this.hdrRT.width === w && this.hdrRT.height === h && (!needSSAO || (this.hdrRT.depthTexture && this.aoRT));
        if (hasCorrectTargets) return;

        if (this.hdrRT) {
            if (this.hdrRT.depthTexture) this.hdrRT.depthTexture.dispose();
            this.hdrRT.dispose();
        }
        for (const rt of this.bloomRTs) rt.dispose();
        this.bloomRTs.length = 0;
        if (this.aoRT) { this.aoRT.dispose(); this.aoRT = null; }
        if (this.aoBlurRT) { this.aoBlurRT.dispose(); this.aoBlurRT = null; }

        const hdrOpts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        };
        if (needSSAO) {
            const depthTex = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
            depthTex.minFilter = THREE.NearestFilter;
            depthTex.magFilter = THREE.NearestFilter;
            hdrOpts.depthTexture = depthTex;
        }
        this.hdrRT = new THREE.WebGLRenderTarget(w, h, hdrOpts);

        let bw = Math.max(16, w >> 1);
        let bh = Math.max(16, h >> 1);
        if (needSSAO) {
            const aoOpts = {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.UnsignedByteType,
                depthBuffer: false
            };
            this.aoRT = new THREE.WebGLRenderTarget(bw, bh, aoOpts);
            this.aoBlurRT = new THREE.WebGLRenderTarget(bw, bh, aoOpts);
        }
        for (let i = 0; i < 4; i++) {
            this.bloomRTs.push(new THREE.WebGLRenderTarget(bw, bh, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                type: THREE.HalfFloatType,
                depthBuffer: false
            }));
            bw = Math.max(8, bw >> 1);
            bh = Math.max(8, bh >> 1);
        }
    },

    render(renderCamera) {
        if (!this.initialized) this.init();
        if (!this.supported || (typeof window.getGraphicsMode === 'function' && window.getGraphicsMode() !== 'high')) {
            renderer.render(scene, renderCamera);
            return;
        }
        this.ensureTargets();

        const oldTarget = renderer.getRenderTarget();
        try {
            renderer.setRenderTarget(this.hdrRT);
            renderer.clear(true, true, false);
            renderer.render(scene, renderCamera);

            const doSSAO = !!(useSSAO && this.ssaoSupported && this.hdrRT.depthTexture && this.aoRT && this.aoBlurRT);
            if (doSSAO) {
                const depthTex = this.hdrRT.depthTexture;
                this.ssaoMat.uniforms.tDepth.value = depthTex;
                this.ssaoMat.uniforms.uInvProj.value.copy(renderCamera.projectionMatrixInverse);
                this.ssaoMat.uniforms.uProj.value.copy(renderCamera.projectionMatrix);
                this.ssaoMat.uniforms.uDepthTexel.value.set(1.0 / this.hdrRT.width, 1.0 / this.hdrRT.height);
                this.quadMesh.material = this.ssaoMat;
                renderer.setRenderTarget(this.aoRT);
                renderer.render(this.quadScene, this.quadCam);

                // Cross-bilateral edge-preserving blur (H then V)
                this.aoBlurMat.uniforms.tDepth.value = depthTex;
                this.aoBlurMat.uniforms.uInvProj.value.copy(renderCamera.projectionMatrixInverse);

                this.aoBlurMat.uniforms.tAO.value = this.aoRT.texture;
                this.aoBlurMat.uniforms.uDir.value.set(1.0 / this.aoRT.width, 0.0);
                this.quadMesh.material = this.aoBlurMat;
                renderer.setRenderTarget(this.aoBlurRT);
                renderer.render(this.quadScene, this.quadCam);

                this.aoBlurMat.uniforms.tAO.value = this.aoBlurRT.texture;
                this.aoBlurMat.uniforms.uDir.value.set(0.0, 1.0 / this.aoRT.height);
                renderer.setRenderTarget(this.aoRT);
                renderer.render(this.quadScene, this.quadCam);
            }

            // Downsample 4 bloom mips
            let src = this.hdrRT;
            for (let i = 0; i < this.bloomRTs.length; i++) {
                const dst = this.bloomRTs[i];
                this.downsampleMat.uniforms.tSrc.value = src.texture;
                this.downsampleMat.uniforms.uTexel.value.set(1.0 / src.width, 1.0 / src.height);
                this.downsampleMat.uniforms.uFirst.value = (i === 0) ? 1.0 : 0.0;
                this.quadMesh.material = this.downsampleMat;
                renderer.setRenderTarget(dst);
                renderer.render(this.quadScene, this.quadCam);
                src = dst;
            }

            // Upsample chain back to mip 0
            for (let i = this.bloomRTs.length - 1; i > 0; i--) {
                const hi = this.bloomRTs[i - 1];
                const lo = this.bloomRTs[i];
                this.upsampleMat.uniforms.tSrc.value = lo.texture;
                this.upsampleMat.uniforms.tAdd.value = hi.texture;
                this.upsampleMat.uniforms.uTexel.value.set(1.0 / lo.width, 1.0 / lo.height);
                this.quadMesh.material = this.upsampleMat;
                renderer.setRenderTarget(hi);
                renderer.render(this.quadScene, this.quadCam);
            }

            // Composite HDR + SSAO + Bloom -> ACES -> sRGB -> Screen
            this.compositeMat.uniforms.tScene.value = this.hdrRT.texture;
            this.compositeMat.uniforms.tBloom.value = this.bloomRTs[0].texture;
            this.compositeMat.uniforms.tAO.value = doSSAO ? this.aoRT.texture : null;
            this.compositeMat.uniforms.uUseSSAO.value = doSSAO ? 1.0 : 0.0;
            this.compositeMat.uniforms.uExposure.value = renderer.toneMappingExposure || 1.08;
            this.quadMesh.material = this.compositeMat;
            renderer.setRenderTarget(null);
            renderer.render(this.quadScene, this.quadCam);
        } finally {
            renderer.setRenderTarget(oldTarget);
        }
    }
};

function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    updateAdaptiveResolution((now - lastTime));
    lastTime = now;

    try {
        updateSimulation(dt);
    } catch (simErr) {
        console.error('[Engine] Simulation frame update error:', simErr);
    }

    try {
        const renderCamera = window.activeCamera || activeCamera;
        const renderCameraLayers = renderCamera.layers.mask;
        try {
            renderWaterReflection(renderCamera);
        } catch (reflErr) {
            console.warn('[Engine] Water reflection pass skipped:', reflErr);
            if (window.waterMeshRef) window.waterMeshRef.visible = true;
            renderer.localClippingEnabled = false;
        }
        // Layers 0 (world) + 1 (FX particles) with Babylon HDR Bloom, optional SSAO & ACES Grading
        renderCamera.layers.mask = 3;
        babylonPost.render(renderCamera);
        renderCamera.layers.mask = renderCameraLayers;
    } catch (renderErr) {
        console.error('[Engine] Render frame error:', renderErr);
    }
}

function onWindowResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w <= 0 || h <= 0) return;

    applyResolution(currentResolutionKey);
}
window.onWindowResize = onWindowResize;
window.updateCameraProjectionAspect = onWindowResize;

function initSettingsUI() {
    const btnSettings = document.getElementById('btn-settings');
    const modal = document.getElementById('settings-modal');
    const card = document.getElementById('settings-dialog-card');
    const btnClose = document.getElementById('btn-settings-close');
    const btnDone = document.getElementById('btn-settings-done');

    function openModal() {
        if (modal) modal.classList.remove('hidden');
        if (typeof window.releaseGamePointerLock === 'function') {
            window.releaseGamePointerLock();
        } else if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        updateResolutionUI();
        if (typeof window.initDraggableScrollUI === 'function') {
            window.initDraggableScrollUI();
        }
    }
    function closeModal() {
        if (modal) modal.classList.add('hidden');
        if (typeof window.requestGamePointerLock === 'function') {
            window.requestGamePointerLock();
        }
    }

    if (btnSettings) {
        btnSettings.onclick = (e) => {
            e.stopPropagation();
            if (modal && !modal.classList.contains('hidden')) {
                closeModal();
            } else {
                openModal();
            }
        };
    }
    if (btnClose) btnClose.onclick = (e) => { e.stopPropagation(); closeModal(); };
    if (btnDone) btnDone.onclick = (e) => { e.stopPropagation(); closeModal(); };

    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeModal();
            }
        };
    }
    if (card) {
        card.onclick = (e) => e.stopPropagation();
    }

    const optionButtons = document.querySelectorAll('.res-option-btn');
    optionButtons.forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const res = btn.getAttribute('data-res');
            setResolution(res);
        };
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
            closeModal();
            e.stopPropagation();
        }
    });

    applyResolution(currentResolutionKey);
}
window.initSettingsUI = initSettingsUI;

// ============================================================================
// Battlefield Deployment & Spawn Management
// ============================================================================
window.selectedSoldierType = window.selectedSoldierType || 'smg';

function getSpawnPlayerMoney() {
    if (typeof window.getPlayerMoney === 'function') return window.getPlayerMoney();
    return typeof window.playerMoney === 'number' ? window.playerMoney : 500;
}

function getSelectedSoldierPrice() {
    if (!window.TANK_PRICES) return 0;
    if (window.selectedSoldierType === 'mortar') return (window.TANK_PRICES && typeof window.TANK_PRICES.mortar === 'number') ? window.TANK_PRICES.mortar : 250;
    if (window.selectedSoldierType === 'bazooka' || window.selectedSoldierType === 'bazooka_soldier') return window.TANK_PRICES.bazooka || 350;
    return 0;
}

function setSpawnModalStage(stage) {
    const soldierStage = document.getElementById('spawn-soldier-stage');
    const vehicleStage = document.getElementById('spawn-vehicle-stage');
    if (soldierStage) soldierStage.classList.toggle('hidden', stage !== 'soldier');
    if (vehicleStage) vehicleStage.classList.toggle('hidden', stage !== 'vehicle');
}

function selectSoldierType(type) {
    window.selectedSoldierType = (type === 'rifle' || type === 'mortar' || type === 'bazooka') ? type : 'smg';
    const cards = document.querySelectorAll('.soldier-type-card');
    cards.forEach(card => {
        const cType = card.getAttribute('data-soldier-type');
        const radio = card.querySelector('.soldier-select-radio');
        const title = card.querySelector('span.font-bold');
        if (cType === window.selectedSoldierType) {
            card.className = 'soldier-type-card hud-btn p-3 rounded-xl text-left flex items-center justify-between border-2 border-emerald-400 bg-emerald-950/50 shadow-lg shadow-emerald-950/50 transition-all cursor-pointer';
            if (radio) {
                radio.textContent = '🟢';
                radio.className = 'soldier-select-radio text-base text-emerald-400';
            }
            if (title) title.className = 'text-xs font-bold text-emerald-200';
        } else {
            card.className = 'soldier-type-card hud-btn p-3 rounded-xl text-left flex items-center justify-between border border-white/10 bg-slate-800/60 hover:bg-slate-800 hover:border-amber-400/50 transition-all cursor-pointer';
            if (radio) {
                radio.textContent = '⚪';
                radio.className = 'soldier-select-radio text-base text-slate-500';
            }
            if (title) title.className = 'text-xs font-bold text-white';
        }
    });
    const badge = document.getElementById('spawn-selected-soldier-badge');
    if (badge) {
        const selectedNames = { smg: 'Submachine Gunner', rifle: 'Rifleman', mortar: 'Mortar Crew', bazooka: 'Bazooka Soldier' };
        badge.textContent = `Selected: ${selectedNames[window.selectedSoldierType]}`;
        badge.className = window.selectedSoldierType === 'smg'
            ? 'text-[10px] font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-full uppercase tracking-wider'
            : (window.selectedSoldierType === 'bazooka'
                ? 'text-[10px] font-bold text-orange-300 bg-orange-950/80 border border-orange-500/40 px-2 py-0.5 rounded-full uppercase tracking-wider'
                : 'text-[10px] font-bold text-amber-300 bg-amber-950/80 border border-amber-500/40 px-2 py-0.5 rounded-full uppercase tracking-wider');
    }
    updateSoldierDeployPrice();
    updateSpawnBudgetUI();
}
window.selectSoldierType = selectSoldierType;

function updateSoldierDeployPrice() {
    const money = getSpawnPlayerMoney();
    const price = getSelectedSoldierPrice();
    const button = document.getElementById('btn-deploy-soldier');
    const status = document.getElementById('spawn-soldier-deploy-status');
    if (!button || !status) return;

    const canAfford = money >= price;
    button.disabled = !canAfford;
    button.classList.toggle('opacity-40', !canAfford);
    button.classList.toggle('cursor-not-allowed', !canAfford);
    status.textContent = canAfford
        ? (price > 0 ? `DEPLOY ($${price})` : 'FREE ($0)')
        : `🔒 Need $${price - money} more`;
}

function updateSpawnBudgetUI() {
    const money = getSpawnPlayerMoney();
    const soldierPrice = getSelectedSoldierPrice();
    const vehicleBudget = money - soldierPrice;
    const moneyBadge = document.getElementById('spawn-modal-money');
    if (moneyBadge) {
        moneyBadge.textContent = `$${Math.max(0, vehicleBudget)}`;
    }

    const cards = document.querySelectorAll('.spawn-vehicle-card');
    cards.forEach(card => {
        const vehicleId = card.getAttribute('data-vehicle-id');
        const vehiclePrice = (window.TANK_PRICES && window.TANK_PRICES[vehicleId]) || 500;
        const totalPrice = vehiclePrice + soldierPrice;
        const statusEl = card.querySelector('.spawn-deploy-status');
        const canAfford = money >= totalPrice;

        card.disabled = !canAfford;
        card.classList.toggle('opacity-40', !canAfford);
        card.classList.toggle('cursor-not-allowed', !canAfford);
        card.classList.toggle('hover:border-emerald-400', canAfford);
        card.classList.toggle('cursor-pointer', canAfford);

        if (statusEl) {
            if (canAfford) {
                statusEl.textContent = soldierPrice > 0
                    ? `DEPLOY ($${totalPrice} total)`
                    : `DEPLOY ($${vehiclePrice})`;
                statusEl.className = 'spawn-deploy-status text-[10px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 py-1.5 px-2 rounded-lg text-center';
            } else {
                statusEl.textContent = `🔒 Need $${totalPrice - money} more`;
                statusEl.className = 'spawn-deploy-status text-[10px] font-bold text-slate-400 bg-slate-800/60 border border-slate-700 py-1.5 px-2 rounded-lg text-center';
            }
        }
    });
}

function showSpawnSelectionModal() {
    const modal = document.getElementById('spawn-modal');
    if (!modal) return;
    if (typeof window.releaseGamePointerLock === 'function') {
        window.releaseGamePointerLock();
    } else if (document.pointerLockElement) {
        document.exitPointerLock();
    }
    setSpawnModalStage('soldier');
    updateSpawnModalUI();
    modal.classList.remove('hidden');
    if (typeof window.initDraggableScrollUI === 'function') {
        window.initDraggableScrollUI();
    }
}
window.showSpawnSelectionModal = showSpawnSelectionModal;

function hideSpawnSelectionModal() {
    const modal = document.getElementById('spawn-modal');
    if (modal) modal.classList.add('hidden');
    if (typeof window.requestGamePointerLock === 'function') {
        window.requestGamePointerLock();
    }
}
window.hideSpawnSelectionModal = hideSpawnSelectionModal;

function updateSpawnModalUI() {
    selectSoldierType(window.selectedSoldierType || 'smg');
}
window.updateSpawnModalUI = updateSpawnModalUI;

function deployPurchasedTank(tankId) {
    const vehiclePrice = (window.TANK_PRICES && window.TANK_PRICES[tankId]) || 0;
    const soldierPrice = getSelectedSoldierPrice();
    const totalPrice = vehiclePrice + soldierPrice;
    if (totalPrice > 0 && typeof window.deductPlayerMoney !== 'function') {
        console.error('[Spawn] Tank deployment is unavailable: player funds cannot be charged.');
        return false;
    }
    if (totalPrice > 0 && !window.deductPlayerMoney(totalPrice)) {
        if (typeof window.showKillFeedBanner === 'function') {
            window.showKillFeedBanner(`❌ Insufficient funds for deployment! Requires $${totalPrice}`, '#ef4444');
        }
        updateSpawnModalUI();
        return false;
    }

    hideSpawnSelectionModal();

    if (typeof window.clearParticles === 'function') {
        window.clearParticles();
    }

    if (window.playerSoldier && typeof window.resetPlayerSoldier === 'function') {
        window.resetPlayerSoldier();
    }
    window.playerMode = 'tank';

    const respawnPos = (typeof window.getPlayerRespawnPosition === 'function')
        ? window.getPlayerRespawnPosition()
        : (window.lastPlayerDeathPosition ? { x: window.lastPlayerDeathPosition.x, z: window.lastPlayerDeathPosition.z, heading: window.lastPlayerDeathPosition.heading || 0 } : { x: 0, z: 0, heading: 0 });
    const groundY = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(respawnPos.x, respawnPos.z) : 0;
    const waterLvl = (typeof window.SEA_LEVEL === 'number') ? window.SEA_LEVEL : -2.5;
    const spawnY = (groundY < waterLvl - 1.25) ? (waterLvl - 1.25) : groundY;
    const spawnHeading = (typeof respawnPos.heading === 'number') ? respawnPos.heading : 0;

    if (window.tankState) {
        window.tankState.isKnockedOut = false;
        window.tankState.hasTank = true;
        window.tankState.hitsCount = 0;
        window.tankState.speed = 0;
        window.tankState.turnRate = 0;
        window.tankState.reloadTimer = 0;
        window.tankState.reloadStage = 0;
        window.tankState.mgHeat = 0;
        window.tankState.mgCooldown = 0;
        window.tankState.bowMgCooldown = 0;
        window.tankState.x = 0;
        window.tankState.z = 0;
        if (respawnPos && (respawnPos.x !== 0 || respawnPos.z !== 0)) {
            window.tankState.x = respawnPos.x;
            window.tankState.z = respawnPos.z;
        }
        window.tankState.y = spawnY;
        window.tankState.heading = spawnHeading;
    }
    if (window.tankRoot) {
        window.tankRoot.visible = true;
        window.tankRoot.position.set(respawnPos.x, spawnY, respawnPos.z);
        window.tankRoot.rotation.y = spawnHeading;
    }

    if (window.camOrbit) {
        window.camOrbit.distance = 10.5;
        window.camOrbit.phi = 1.34;
        window.camOrbit.theta = spawnHeading + Math.PI;
    }
    if (typeof window.updateTerrainChunks === 'function') {
        window.updateTerrainChunks(respawnPos.x, respawnPos.z, false);
    }

    if (typeof window.switchTank === 'function') {
        window.switchTank(tankId);
    }
    if (typeof window.resetPlayerHealth === 'function') {
        window.resetPlayerHealth();
    }

    const spec = (window.TANK_SPECS && window.TANK_SPECS[tankId]) || { shortName: tankId };
    if (typeof window.showKillFeedBanner === 'function') {
        window.showKillFeedBanner(`🛡️ Deployed ${spec.shortName || tankId.toUpperCase()} (-$${totalPrice})`, '#34d399');
    }
    return true;
}
window.deployPurchasedTank = deployPurchasedTank;

function deployPurchasedBicycle() {
    if (typeof window.spawnBicycle !== 'function' || typeof window.mountBicycle !== 'function' ||
        typeof window.buildSoldier !== 'function' || !window.tankState) {
        console.error('[Spawn] Bicycle deployment is unavailable: bicycle controls are not initialized.');
        return false;
    }

    const price = window.TANK_PRICES && window.TANK_PRICES.bicycle;
    if (typeof price !== 'number') {
        console.error('[Spawn] Bicycle deployment is unavailable: bicycle price is not configured.');
        return false;
    }
    if (typeof window.deductPlayerMoney !== 'function') {
        console.error('[Spawn] Bicycle deployment is unavailable: player funds cannot be charged.');
        return false;
    }
    const soldierPrice = getSelectedSoldierPrice();
    const totalPrice = price + soldierPrice;
    if (!window.deductPlayerMoney(totalPrice)) {
        if (typeof window.showKillFeedBanner === 'function') {
            window.showKillFeedBanner(`❌ Insufficient funds for deployment! Requires $${totalPrice}`, '#ef4444');
        }
        updateSpawnModalUI();
        return false;
    }

    if (!deployAsSoldier(true, true)) {
        if (typeof window.addPlayerMoney === 'function') window.addPlayerMoney(totalPrice, 'bicycle deployment refund');
        return false;
    }
    const soldier = window.playerSoldier;
    if (!soldier) {
        console.error('[Spawn] Bicycle deployment failed: player soldier was not created.');
        if (typeof window.addPlayerMoney === 'function') window.addPlayerMoney(totalPrice, 'bicycle deployment refund');
        return false;
    }

    const bicycle = window.spawnBicycle(soldier.x, soldier.z, soldier.heading || 0);
    if (!bicycle) {
        console.error('[Spawn] Bicycle deployment failed: bicycle could not be created.');
        if (typeof window.addPlayerMoney === 'function') window.addPlayerMoney(totalPrice, 'bicycle deployment refund');
        return false;
    }
    window.mountBicycle(soldier, bicycle);
    if (typeof window.showKillFeedBanner === 'function') {
        window.showKillFeedBanner(`🚲 Deployed with Military Bicycle (-$${totalPrice})`, '#38bdf8');
    }
    return true;
}
window.deployPurchasedBicycle = deployPurchasedBicycle;

function deployAsSoldier(suppressBanner = false, soldierCostAlreadyPaid = false) {
    const sType = window.selectedSoldierType || 'smg';
    const soldierPrice = getSelectedSoldierPrice();
    if (!soldierCostAlreadyPaid && soldierPrice > 0 &&
        (typeof window.deductPlayerMoney !== 'function' || !window.deductPlayerMoney(soldierPrice))) {
        if (typeof window.showKillFeedBanner === 'function') {
            const typeUpper = sType === 'bazooka' ? 'BAZOOKA SOLDIER' : (sType === 'mortar' ? 'MORTAR CREW' : 'SOLDIER');
            window.showKillFeedBanner(`❌ Insufficient funds for ${typeUpper}! Requires $${soldierPrice}`, '#ef4444');
        }
        updateSpawnModalUI();
        return false;
    }

    hideSpawnSelectionModal();

    if (typeof window.clearParticles === 'function') {
        window.clearParticles();
    }

    const respawnPos = (typeof window.getPlayerRespawnPosition === 'function')
        ? window.getPlayerRespawnPosition()
        : (window.lastPlayerDeathPosition ? { x: window.lastPlayerDeathPosition.x, z: window.lastPlayerDeathPosition.z, heading: window.lastPlayerDeathPosition.heading || 0 } : { x: 0, z: 0, heading: 0 });
    const groundY = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(respawnPos.x, respawnPos.z) : 0;
    const waterLvl = (typeof window.SEA_LEVEL === 'number') ? window.SEA_LEVEL : -2.5;
    const spawnY = (groundY < waterLvl - 1.25) ? (waterLvl - 1.25) : groundY;
    const spawnHeading = (typeof respawnPos.heading === 'number') ? respawnPos.heading : 0;

    if (window.tankState) {
        window.tankState.hasTank = false;
        window.tankState.isKnockedOut = false;
        window.tankState.speed = 0;
        window.tankState.turnRate = 0;
        window.tankState.x = respawnPos.x;
        window.tankState.z = respawnPos.z;
        window.tankState.heading = spawnHeading;
    }
    if (window.tankRoot) {
        window.tankRoot.visible = false;
        window.tankRoot.position.set(respawnPos.x, -9999, respawnPos.z);
    }
    if (window.persistentHeadlightSpots) {
        window.persistentHeadlightSpots.forEach(s => {
            s.intensity = 0.0;
            s.position.set(0, -1000, 0);
            s.target.position.set(0, -1001, 0);
        });
    }

    if (window.playerSoldier && typeof window.resetPlayerSoldier === 'function') {
        window.resetPlayerSoldier();
    }

    if (typeof window.dismountTank === 'function') {
        window.dismountTank(false);
    }

    if (window.playerSoldier) {
        window.playerSoldier.x = respawnPos.x;
        window.playerSoldier.y = spawnY;
        window.playerSoldier.z = respawnPos.z;
        window.playerSoldier.heading = spawnHeading;
        window.playerSoldier.invulnerableTimer = 2.0;
        if (window.playerSoldier.rig && window.playerSoldier.rig.root) {
            window.playerSoldier.rig.root.position.set(respawnPos.x, spawnY, respawnPos.z);
            window.playerSoldier.rig.root.rotation.y = spawnHeading;
        }
    }
    if (window.camOrbit) {
        window.camOrbit.distance = 3.2;
        window.camOrbit.phi = 1.40;
        window.camOrbit.theta = spawnHeading + Math.PI;
    }
    if (typeof window.updateTerrainChunks === 'function') {
        window.updateTerrainChunks(respawnPos.x, respawnPos.z, false);
    }

    const sName = sType === 'mortar' ? 'Mortar Crew' : (sType === 'bazooka' ? 'Bazooka Soldier' : (sType === 'smg' ? 'Submachine Gunner' : 'Rifleman'));
    if (!suppressBanner && typeof window.showKillFeedBanner === 'function') {
        const priceLabel = soldierPrice > 0 ? `(-$${soldierPrice})` : '(FREE)';
        window.showKillFeedBanner(`🚶 Deployed as ${sName} ${priceLabel}`, '#38bdf8');
    }
    return true;
}
window.deployAsSoldier = deployAsSoldier;

function initSpawnModal() {
    const card = document.getElementById('spawn-dialog-card');
    if (card) {
        card.onclick = (e) => e.stopPropagation();
    }

    const soldierCards = document.querySelectorAll('.soldier-type-card');
    soldierCards.forEach(card => {
        card.onclick = (e) => {
            e.stopPropagation();
            const sType = card.getAttribute('data-soldier-type');
            selectSoldierType(sType);
            updateSpawnModalUI();
        };
    });

    const vehicleButtons = document.querySelectorAll('.spawn-vehicle-card');
    vehicleButtons.forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const vehicleId = btn.getAttribute('data-vehicle-id');
            if (vehicleId === 'bicycle') {
                deployPurchasedBicycle();
            } else {
                deployPurchasedTank(vehicleId);
            }
        };
    });

    const chooseVehicleBtn = document.getElementById('btn-spawn-choose-vehicle');
    if (chooseVehicleBtn) {
        chooseVehicleBtn.onclick = (e) => {
            e.stopPropagation();
            updateSpawnModalUI();
            setSpawnModalStage('vehicle');
        };
    }

    const backToSoldierBtn = document.getElementById('btn-spawn-back-to-soldier');
    if (backToSoldierBtn) {
        backToSoldierBtn.onclick = (e) => {
            e.stopPropagation();
            setSpawnModalStage('soldier');
        };
    }

    const soldierBtn = document.getElementById('btn-deploy-soldier');
    if (soldierBtn) {
        soldierBtn.onclick = (e) => {
            e.stopPropagation();
            deployAsSoldier();
        };
    }
}
window.initSpawnModal = initSpawnModal;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initSettingsUI();
        initSpawnModal();
    });
} else {
    initSettingsUI();
    initSpawnModal();
}

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

function prewarmAllSceneShaders() {
    if (!renderer || !scene || !activeCamera || typeof renderer.compile !== 'function') return;

    let soldierRoots = [];
    if (typeof window.prewarmSoldierAssets === 'function') {
        soldierRoots = window.prewarmSoldierAssets() || [];
    }

    const prewarmGroup = new THREE.Group();
    soldierRoots.forEach(r => {
        if (r) prewarmGroup.add(r);
    });
    scene.add(prewarmGroup);

    const wasTankVisible = window.tankRoot ? window.tankRoot.visible : false;
    if (window.tankRoot) {
        window.tankRoot.visible = true;
    }

    try {
        renderer.compile(scene, activeCamera);
    } catch (err) {
        console.warn('[Engine] Prewarm shader compilation error:', err);
    } finally {
        if (prewarmGroup.parent === scene) {
            scene.remove(prewarmGroup);
        }
        if (window.tankRoot) {
            window.tankRoot.visible = wasTankVisible;
        }
    }
}
window.prewarmAllSceneShaders = prewarmAllSceneShaders;

function hideLoadingScreen() {
    const screen = document.getElementById('loading-screen');
    if (!screen || screen.classList.contains('loading-hidden')) return;
    screen.classList.add('loading-hidden');
    setTimeout(() => {
        if (screen && screen.parentNode) {
            screen.style.display = 'none';
        }
    }, 700);
}
window.hideLoadingScreen = hideLoadingScreen;

let _simulationStarted = false;
function initSimulation() {
    if (_simulationStarted) return;
    _simulationStarted = true;

    if (typeof window.prewarmAllSceneShaders === 'function') {
        prewarmAllSceneShaders();
    }
    if (typeof window.spawnBattlefieldInfantry === 'function') {
        window.spawnBattlefieldInfantry();
    }
    if (typeof window.initSettingsUI === 'function') {
        window.initSettingsUI();
    }
    if (typeof window.initSpawnModal === 'function') {
        window.initSpawnModal();
    }
    if (typeof window.showSpawnSelectionModal === 'function') {
        window.showSpawnSelectionModal();
    }
    animate(performance.now());

    // Dismiss loading screen after first frame render
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                hideLoadingScreen();
            });
        });
    } else {
        setTimeout(hideLoadingScreen, 200);
    }
}
window.initSimulation = initSimulation;

window.onload = function () {
    initSimulation();
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initSimulation();
} else {
    document.addEventListener('DOMContentLoaded', initSimulation);
}
