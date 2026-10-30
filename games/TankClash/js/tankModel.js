// ============================================================================
// TankClash Model Controller & Registry (Tiger I, M4 Sherman, T-34-85)
// Manages Multi-Tank Selection, Specification Profiles, and Dynamic Swapping
// ============================================================================

const TANK_SPECS = {
    tiger: {
        id: 'tiger',
        name: 'Pz.Kpfw. VI Tiger Ausf. E',
        shortName: 'Tiger I',
        flag: '🇩🇪',
        badge: '3818',
        subBadge: 'TIGER I',
        nation: 'Germany',
        year: '1943',
        weight: '57 t',
        massKg: 57000,
        enginePowerKW: 515,
        enemyArmor: 2,        // Enemy Tiger tank has 2 armor points
        playerArmor: 4,       // Player's tank has 2x armor points (4)
        gunName: '8.8 cm KwK 36 L/56',
        caliberText: '8.8cm',
        shellVel: 810,
        reloadTime: 4.8,
        spread: 0.0003,       // Most precise cannon: pinpoint sniper accuracy
        blastRadius: 8.0,     // Standard 8.8cm HE-AP blast radius
        blastDamage: 100,
        recoilOffset: 0.56,
        maxSpeed: 10.6, // ~38 km/h realistic top road speed
        reverseSpeed: 4.2,
        turnSpeed: 1.15,
        minElevDeg: -8,
        maxElevDeg: 15,
        hasMuzzleBrake: true,
        sightName: 'TZF 9b — 8.8cm KwK 36 L/56 (810 m/s • Ultra-Precision)',
        sightSubtitle: '8.8cm KwK 36 L/56 • 810 M/S • PINPOINT SNIPER',
        fpvZoomText: 'OPTICAL 2.5× [HOLD RMB: 5.0× ZOOM]',
        description: 'German Heavy Tank • 8.8cm KwK 36 L/56 • Pinpoint Sniper Precision'
    },
    sherman: {
        id: 'sherman',
        name: 'M4 Sherman ("COUGAR")',
        shortName: 'M4 Sherman',
        flag: '🇺🇸',
        badge: 'M4',
        subBadge: 'SHERMAN',
        nation: 'United States',
        year: '1944',
        weight: '30 t',
        massKg: 30000,
        enginePowerKW: 375,
        enemyArmor: 1,        // Enemy Sherman tank has 1 armor point
        playerArmor: 2,       // Player's tank has 2x armor points (2)
        gunName: '75 mm Gun M3',
        caliberText: '75mm',
        shellVel: 460,        // Slower projectile with noticeable arc and flight delay
        reloadTime: 2.7,      // High reload rate: rapid-fire 2.7s reload
        spread: 0.0035,       // Moderate precision
        blastRadius: 6.5,     // Compact 75mm HE blast radius
        blastDamage: 85,
        recoilOffset: 0.38,
        maxSpeed: 13.6, // ~49 km/h agile top speed
        reverseSpeed: 5.2,
        turnSpeed: 1.45,
        minElevDeg: -10,
        maxElevDeg: 25,
        hasMuzzleBrake: false,
        sightName: 'M70G — 75mm Gun M3 (460 m/s • Rapid-Fire 2.7s)',
        sightSubtitle: '75mm Gun M3 • 460 M/S • HIGH RATE OF FIRE (2.7s)',
        fpvZoomText: 'OPTICAL 1.5× [HOLD RMB: 3.0× ZOOM]',
        description: 'American Medium Tank • 75mm Gun M3 • Rapid-Fire Reload & High-Arc Shell'
    },
    t34: {
        id: 't34',
        name: 'T-34-85 ("No. 311")',
        shortName: 'T-34-85',
        flag: '🇵🇱 / 🇷🇺',
        badge: '311',
        subBadge: 'T-34-85',
        nation: 'Soviet Union',
        year: '1944',
        weight: '32 t',
        massKg: 32000,
        enginePowerKW: 425,
        enemyArmor: 1,        // Enemy T-34 tank has 1 armor point
        playerArmor: 2,       // Player's tank has 2x armor points (2)
        gunName: '85 mm ZiS-S-53',
        caliberText: '85mm',
        shellVel: 740,
        reloadTime: 3.6,
        spread: 0.018,        // Low precision: wide dispersion cone
        blastRadius: 16.5,    // Massive projectile blast range & HE fragmentation!
        blastDamage: 150,
        recoilOffset: 0.46,
        maxSpeed: 16.8, // ~60 km/h high-speed Christie suspension
        reverseSpeed: 5.6,
        turnSpeed: 1.55,
        minElevDeg: -5,
        maxElevDeg: 22,
        hasMuzzleBrake: false,
        sightName: 'TSh-16 — 85mm ZiS-S-53 (740 m/s • Heavy HE Blast)',
        sightSubtitle: '85mm ZiS-S-53 • 740 M/S • WIDE BLAST (16.5M)',
        fpvZoomText: 'OPTICAL 4.0× [HOLD RMB: 4.0× ZOOM]',
        description: 'Soviet Medium Tank • 85mm ZiS-S-53 • Massive High-Explosive Blast Area'
    }
};

window.TANK_SPECS = TANK_SPECS;
window.currentTankId = 'tiger';

// Active tank model reference
var tankModel = null;
var tankRoot = null;
var hullGroup = null;
var turretGroup = null;
var gunElevationPivot = null;
var barrelRecoilGroup = null;
var mainGunMuzzleTip = null;
var coaxMuzzleRef = null;
var bowMgGroup = null;
var bowMgBarrel = null;
var headlightLights = [];
var smokeTubes = [];
var roadWheelStations = { left: [], right: [] };
var driveSprockets = [];
var idlerWheels = [];
var trackChains = { left: [], right: [] };
var evaluateTrackPoint = null;
var updateTracksGeometry = null;

function bindTankGlobals(model) {
    tankModel = model;
    tankRoot = model.tankRoot;
    hullGroup = model.hullGroup;
    turretGroup = model.turretGroup;
    gunElevationPivot = model.gunElevationPivot;
    barrelRecoilGroup = model.barrelRecoilGroup;
    mainGunMuzzleTip = model.mainGunMuzzleTip;
    coaxMuzzleRef = model.coaxMuzzleRef;
    bowMgGroup = model.bowMgGroup;
    bowMgBarrel = model.bowMgBarrel;
    headlightLights = model.headlightLights || [];
    smokeTubes = model.smokeTubes || [];
    roadWheelStations = model.roadWheelStations || { left: [], right: [] };
    driveSprockets = model.driveSprockets || [];
    idlerWheels = model.idlerWheels || [];
    trackChains = model.trackChains || { left: [], right: [] };
    evaluateTrackPoint = model.evaluateTrackPoint;
    updateTracksGeometry = model.updateTracksGeometry;

    window.tankModel = tankModel;
    window.tankRoot = tankRoot;
    window.hullGroup = hullGroup;
    window.turretGroup = turretGroup;
    if (turretGroup) {
        turretGroup.userData.basePos = turretGroup.position.clone();
        turretGroup.userData.baseRot = turretGroup.rotation.clone();
    }
    window.gunElevationPivot = gunElevationPivot;
    window.barrelRecoilGroup = barrelRecoilGroup;
    window.mainGunMuzzleTip = mainGunMuzzleTip;
    window.coaxMuzzleRef = coaxMuzzleRef;
    window.bowMgGroup = bowMgGroup;
    window.bowMgBarrel = bowMgBarrel;
    window.headlightLights = headlightLights;
    window.smokeTubes = smokeTubes;
    window.roadWheelStations = roadWheelStations;
    window.driveSprockets = driveSprockets;
    window.idlerWheels = idlerWheels;
    window.trackChains = trackChains;
    window.evaluateTrackPoint = evaluateTrackPoint;
    window.updateTracksGeometry = updateTracksGeometry;
}

function updateTankHUD(spec) {
    if (!spec) return;

    // 1. Title badge in top-left
    const badgeEl = document.getElementById('tank-badge-num');
    if (badgeEl) badgeEl.textContent = spec.badge;

    const subBadgeEl = document.getElementById('tank-badge-sub');
    if (subBadgeEl) subBadgeEl.textContent = spec.subBadge;

    const nameEl = document.getElementById('tank-hud-name');
    if (nameEl) nameEl.textContent = spec.name;

    const nationTagEl = document.getElementById('tank-nation-tag');
    if (nationTagEl) nationTagEl.textContent = `${spec.flag} ${spec.nation}`;

    const descEl = document.getElementById('tank-hud-desc');
    if (descEl) descEl.textContent = `${spec.gunName} • ${spec.weight} • Dual-Reticle Ballistics`;

    // 2. Mobile Fire Button caliber text
    const mobFireCaliberEl = document.getElementById('mob-fire-caliber');
    if (mobFireCaliberEl) mobFireCaliberEl.textContent = spec.caliberText;

    // 3. Optical Sight / FPV Reticle Telemetry
    const sniperTelEl = document.getElementById('sniper-telemetry-text');
    if (sniperTelEl) sniperTelEl.textContent = spec.sightName;

    const fpvGunTelEl = document.getElementById('fpv-gun-telemetry');
    if (fpvGunTelEl) fpvGunTelEl.textContent = spec.sightSubtitle;

    const fpvZoomEl = document.getElementById('fpv-svg-zoom');
    if (fpvZoomEl) fpvZoomEl.textContent = spec.fpvZoomText;

    // 4. Update tank selector buttons state
    document.querySelectorAll('.tank-select-btn').forEach((btn) => {
        const tid = btn.getAttribute('data-tank');
        if (tid === spec.id) {
            btn.classList.add('active');
            btn.classList.remove('opacity-70');
        } else {
            btn.classList.remove('active');
            btn.classList.add('opacity-70');
        }
    });

    // 5. Update Armor HUD for player's current vehicle
    if (typeof window.updateArmorHUD === 'function') {
        const pMaxArmor = spec.playerArmor || (spec.id === 'tiger' ? 4 : 2);
        window.updateArmorHUD(pMaxArmor, pMaxArmor);
    }
}

function buildTankById(tankId, scene, mats) {
    const s = scene || window.scene;
    const m = mats || window.mats;

    let model = null;
    if (tankId === 'sherman') {
        model = window.buildShermanTank(s, m);
    } else if (tankId === 't34') {
        model = window.buildT34Tank(s, m);
    } else {
        model = window.buildTigerTank(s, m);
    }

    // Steel environment reflection shows on tanks even when the sun is behind them
    const TANK_ENV_MAP_INTENSITY = 0.3;
    model.tankRoot.traverse((obj) => {
        if (!obj.isMesh) return;
        const list = Array.isArray(obj.material) ? obj.material : [obj.material];
        list.forEach((mat) => {
            if (mat && mat.isMeshStandardMaterial) mat.envMapIntensity = TANK_ENV_MAP_INTENSITY;
        });
    });

    bindTankGlobals(model);
    window.currentTankId = tankId;
    if (TANK_SPECS[tankId]) {
        updateTankHUD(TANK_SPECS[tankId]);
        if (window.soundFX && typeof window.soundFX.setTankSoundProfile === 'function') {
            window.soundFX.setTankSoundProfile(TANK_SPECS[tankId]);
        }
    }
    return model;
}

function switchTank(newTankId) {
    if (!TANK_SPECS[newTankId]) return;
    const spec = TANK_SPECS[newTankId];

    const currentX = window.tankState ? window.tankState.x : 0;
    const currentY = window.tankState ? window.tankState.y : 0;
    const currentZ = window.tankState ? window.tankState.z : 0;
    const currentHeading = window.tankState ? window.tankState.heading : 0;
    const wasHeadlightsOn = window.tankState ? window.tankState.headlightsOn : false;

    // Remove old tank root from scene
    if (tankRoot && window.scene) {
        window.scene.remove(tankRoot);
    }

    window.currentTankId = newTankId;
    const newModel = buildTankById(newTankId, window.scene, window.mats);

    // Update tank physics state parameters
    if (window.tankState) {
        window.tankState.currentTankSpec = spec;
        window.tankState.RELOAD_TIME = spec.reloadTime;
        window.tankState.SHELL_VELOCITY = spec.shellVel;
        window.tankState.CANNON_SPREAD = spec.spread;
        window.tankState.BLAST_RADIUS = spec.blastRadius;
        window.tankState.BLAST_DAMAGE = spec.blastDamage;
        window.tankState.MAX_SPEED = spec.maxSpeed;
        window.tankState.REVERSE_SPEED = spec.reverseSpeed;
        window.tankState.TURN_SPEED = spec.turnSpeed;
        window.tankState.RECOIL_OFFSET = spec.recoilOffset;
        window.tankState.MIN_ELEV_RAD = THREE.MathUtils.degToRad(spec.minElevDeg);
        window.tankState.MAX_ELEV_RAD = THREE.MathUtils.degToRad(spec.maxElevDeg);
        window.tankState.hasMuzzleBrake = spec.hasMuzzleBrake;

        window.tankState.x = currentX;
        window.tankState.y = currentY;
        window.tankState.z = currentZ;
        window.tankState.heading = currentHeading;
        window.tankState.speed = 0;
        window.tankState.turnRate = 0;
        window.tankState.barrelRecoilOffset = 0;
        window.tankState.turretYaw = 0;
        window.tankState.targetTurretYaw = 0;
        window.tankState.gunElevation = 0.035;
        window.tankState.targetGunElevation = 0.035;

        if (newModel.tankRoot) {
            newModel.tankRoot.position.set(currentX, currentY, currentZ);
            newModel.tankRoot.rotation.y = currentHeading;
        }
    }

    // Restore headlights state if turned on
    if (wasHeadlightsOn && typeof window.toggleHeadlights === 'function') {
        window.toggleHeadlights(true);
    }

    // Refresh tracks geometry
    if (typeof newModel.updateTracksGeometry === 'function') {
        newModel.updateTracksGeometry(0, 0);
    }

    // Update HUD
    updateTankHUD(spec);
    if (window.tankState) {
        window.tankState.playerArmor = spec.playerArmor || 2;
        window.tankState.maxArmor = spec.playerArmor || 2;
        window.playerHitsTaken = 0;
        window.tankState.isKnockedOut = false;
    }
    if (typeof window.updateArmorHUD === 'function') {
        const pMax = spec.playerArmor || 2;
        window.updateArmorHUD(pMax, pMax);
    }

    // Update Sound Profile
    if (window.soundFX && typeof window.soundFX.setTankSoundProfile === 'function') {
        window.soundFX.setTankSoundProfile(spec);
    }

    // Notify Enemy AI of Player Campaign Change
    if (typeof window.onPlayerTankChanged === 'function') {
        window.onPlayerTankChanged(newTankId);
    }

    return newModel;
}

window.TANK_SPECS = TANK_SPECS;
window.bindTankGlobals = bindTankGlobals;
window.updateTankHUD = updateTankHUD;
window.buildTankById = buildTankById;
window.switchTank = switchTank;
