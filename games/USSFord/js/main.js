import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { ORTHO_FRUSTUM_HEIGHT, CAMERA_PRESETS } from './config.js';
import { createOcean, buildMaritimeEnvironment, setOceanLightingMode, oceanUniforms } from './ocean.js';
import { buildCarrier } from './carrier.js';
import { FlightOpsSystem } from './flightOps.js';
import { SelectionManager } from './selection.js';
import { UIManager } from './ui.js';

// 1. Scene, Camera & WebGL Renderer
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c2846);
scene.fog = new THREE.FogExp2(0x123458, 0.00012);

const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(
    (-ORTHO_FRUSTUM_HEIGHT * aspect) / 2,
    ( ORTHO_FRUSTUM_HEIGHT * aspect) / 2,
     ORTHO_FRUSTUM_HEIGHT / 2,
    -ORTHO_FRUSTUM_HEIGHT / 2,
    -2000,
    4000
);
camera.position.copy(CAMERA_PRESETS.iso.pos);
camera.zoom = CAMERA_PRESETS.iso.zoom;
camera.updateProjectionMatrix();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
container.appendChild(renderer.domElement);

// 2. Maritime Lighting
const hemiLight = new THREE.HemisphereLight(0x7eb0ea, 0x09213d, 0.76);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfffef5, 3.05);
sunLight.position.set(-135, 260, 130);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 4096;
sunLight.shadow.mapSize.height = 4096;
sunLight.shadow.camera.near = 50;
sunLight.shadow.camera.far = 680;
const shadowD = 195;
sunLight.shadow.camera.left = -shadowD;
sunLight.shadow.camera.right = shadowD;
sunLight.shadow.camera.top = shadowD;
sunLight.shadow.camera.bottom = -shadowD;
sunLight.shadow.bias = -0.00018;
sunLight.shadow.normalBias = 0.024;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x5a8cb8, 0.28);
fillLight.position.set(160, 75, -120);
scene.add(fillLight);

// PMREM Maritime Environment
buildMaritimeEnvironment(renderer, scene, true);

// 3. OrbitControls & Post-Processing
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(CAMERA_PRESETS.iso.target);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minZoom = 0.2;
controls.maxZoom = 10.0;

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const gtaoPass = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
gtaoPass.updateGtaoMaterial({ radius: 2, scale: 10.0, samples: 16 });
gtaoPass.blendIntensity = 0.92;
gtaoPass.setSceneClipBox(new THREE.Box3(
    new THREE.Vector3(-46, -3, -160),
    new THREE.Vector3(46, 90, 160)
));
composer.addPass(gtaoPass);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.045,
    0.20,
    0.94
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// 4. Photorealistic Ocean & Wake
const oceanMesh = createOcean(scene);

// 5. Carrier Hull & Superstructure
const carrier = buildCarrier(scene);

// 6. Particle System (Steam & Jet Exhaust)
const particles = [];
const puffGeo = new THREE.SphereGeometry(0.65, 7, 7);

function spawnParticle(pos, vel, s0, s1, maxLife, colorHex = 0xf8fafc, alpha0 = 0.45) {
    const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: alpha0,
        depthWrite: false
    });
    const m = new THREE.Mesh(puffGeo, mat);
    m.position.copy(pos);
    m.scale.setScalar(s0);
    carrier.carrierGroup.add(m);
    particles.push({ mesh: m, vel: vel.clone(), s0, s1, life: 0, maxLife, alpha0 });
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
            carrier.carrierGroup.remove(p.mesh);
            p.mesh.material.dispose();
            particles.splice(i, 1);
            continue;
        }
        const t = p.life / p.maxLife;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.scale.setScalar(THREE.MathUtils.lerp(p.s0, p.s1, t));
        p.mesh.material.opacity = p.alpha0 * (1.0 - t);
    }
}

// 7. Flight Ops System
const ui = new UIManager();

const flightOps = new FlightOpsSystem(
    carrier,
    (msg) => ui.setStatusLog(msg),
    () => {
        ui.renderRosterUI(
            flightOps.airWingUnits,
            selection.selectedUnit,
            selection.followUnit,
            (unit) => selection.selectUnit(unit)
        );
    }
);

// 8. Selection Manager (Click Aircraft to Select, Click Outside to Deselect)
const selection = new SelectionManager(
    scene,
    camera,
    renderer,
    carrier.deckAssetsGroup,
    (unit) => {
        if (unit) {
            ui.setStatusLog(`TRACKING ${unit.callsign} (${unit.label})`);
        } else {
            ui.setStatusLog('NO AIRCRAFT SELECTED • CLICK ANY AIRCRAFT');
        }
        ui.renderRosterUI(
            flightOps.airWingUnits,
            selection.selectedUnit,
            selection.followUnit,
            (u) => selection.selectUnit(u)
        );
    }
);
selection.setUnits(flightOps.airWingUnits);

// Select initial unit
selection.selectUnit(flightOps.airWingUnits[0]);

// 9. Camera & Time Presets State
let desiredCamPos = null;
let desiredCamTarget = null;
let desiredCamZoom = null;

controls.addEventListener('start', () => {
    desiredCamPos = null;
    desiredCamTarget = null;
    desiredCamZoom = null;
    if (selection.followUnit) {
        selection.followUnit = null;
        ui.renderRosterUI(
            flightOps.airWingUnits,
            selection.selectedUnit,
            selection.followUnit,
            (u) => selection.selectUnit(u)
        );
    }
});

// Bind UI actions
ui.bindActions({
    onUnitAction: () => {
        const u = selection.selectedUnit;
        if (!u) return;
        if (u.type === 'MH-60S') {
            flightOps.commandHeliSortie(u);
        } else if (u.state === 'PARKED') {
            flightOps.commandJetLaunch(u);
        } else if (u.state === 'AIRBORNE_PATROL') {
            flightOps.commandJetRecovery(u);
        }
    },
    onUnitFollow: () => {
        const u = selection.selectedUnit;
        if (!u) return;
        selection.toggleFollow(u);
        ui.renderRosterUI(
            flightOps.airWingUnits,
            selection.selectedUnit,
            selection.followUnit,
            (unit) => selection.selectUnit(unit)
        );
    },
    onLaunch: () => {
        const candidate = (selection.selectedUnit && selection.selectedUnit.canCycleJet && selection.selectedUnit.state === 'PARKED')
            ? selection.selectedUnit
            : flightOps.airWingUnits.find(u => u.canCycleJet && u.state === 'PARKED');
        if (candidate) {
            selection.selectUnit(candidate);
            flightOps.commandJetLaunch(candidate);
        }
    },
    onRecover: () => {
        const candidate = (selection.selectedUnit && selection.selectedUnit.state === 'AIRBORNE_PATROL')
            ? selection.selectedUnit
            : flightOps.airWingUnits.find(u => u.state === 'AIRBORNE_PATROL');
        if (candidate) {
            selection.selectUnit(candidate);
            flightOps.commandJetRecovery(candidate);
        } else {
            ui.setStatusLog('LSO: NO AIRCRAFT IN CAP ORBIT YET');
        }
    },
    onHeli: () => {
        const helis = flightOps.airWingUnits.filter(u => u.type === 'MH-60S');
        const activeOrParked = helis.find(h => h.state === 'PATROL_ORBIT') || helis.find(h => h.state === 'PARKED');
        if (activeOrParked) {
            selection.selectUnit(activeOrParked);
            flightOps.commandHeliSortie(activeOrParked);
        }
    },
    onCameraChange: (key) => {
        selection.followUnit = null;
        if (CAMERA_PRESETS[key]) {
            desiredCamPos = CAMERA_PRESETS[key].pos.clone();
            desiredCamTarget = CAMERA_PRESETS[key].target.clone();
            desiredCamZoom = CAMERA_PRESETS[key].zoom;
        }
        ui.renderRosterUI(
            flightOps.airWingUnits,
            selection.selectedUnit,
            selection.followUnit,
            (u) => selection.selectUnit(u)
        );
    },
    onTimeChange: (mode) => {
        const isDay = (mode === 'day');
        buildMaritimeEnvironment(renderer, scene, isDay);
        setOceanLightingMode(scene, hemiLight, sunLight, fillLight, isDay);
    }
});

// Window resize listener
window.addEventListener('resize', () => {
    const newAspect = window.innerWidth / window.innerHeight;
    camera.left   = (-ORTHO_FRUSTUM_HEIGHT * newAspect) / 2;
    camera.right  = ( ORTHO_FRUSTUM_HEIGHT * newAspect) / 2;
    camera.top    =  ORTHO_FRUSTUM_HEIGHT / 2;
    camera.bottom = -ORTHO_FRUSTUM_HEIGHT / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// Expose on window for testing / automated verification
window.airWingUnits = flightOps.airWingUnits;
window.flightOps = flightOps;
window.selection = selection;
window.commandJetLaunch = (u) => flightOps.commandJetLaunch(u);
window.commandJetRecovery = (u) => flightOps.commandJetRecovery(u);
window.commandHeliSortie = (u) => flightOps.commandHeliSortie(u);

// 10. Main Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const dt = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // Ocean waves animation
    oceanUniforms.uTime.value = elapsed;

    // Carrier dynamics (pitch, roll, heave, flag, JBDs)
    carrier.updateCarrier(elapsed, dt);

    // Air wing & deck operations
    flightOps.update(dt, elapsed, spawnParticle);

    // Selection bracket & beacon animation
    selection.update(dt);

    // Particles animation
    updateParticles(dt);

    // Camera follow / transitions
    if (selection.followUnit) {
        const worldTarget = new THREE.Vector3();
        selection.followUnit.mesh.getWorldPosition(worldTarget);
        controls.target.lerp(worldTarget, dt * 6.0);
    } else if (desiredCamPos && desiredCamTarget) {
        camera.position.lerp(desiredCamPos, dt * 3.5);
        controls.target.lerp(desiredCamTarget, dt * 3.5);
        if (desiredCamZoom !== null) {
            camera.zoom = THREE.MathUtils.lerp(camera.zoom, desiredCamZoom, dt * 3.5);
            camera.updateProjectionMatrix();
        }
        if (camera.position.distanceTo(desiredCamPos) < 0.4) {
            desiredCamPos = null;
            desiredCamTarget = null;
            desiredCamZoom = null;
        }
    }

    controls.update();
    composer.render();
}

window.onload = animate;
