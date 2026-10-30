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
        cannonDamage: 2,      // Tiger 8.8cm KwK 36 cannon deals 2 HP damage
        gunName: '8.8 cm KwK 36 L/56',
        caliberText: '8.8cm',
        shellVel: 810,
        reloadTime: 4.8,
        spread: 0.0003,       // Most precise cannon: pinpoint sniper accuracy
        turretTurnSpeed: 0.85,
        blastRadius: 8.0,     // Standard 8.8cm HE-AP blast radius
        blastDamage: 100,
        recoilOffset: 0.56,
        maxSpeed: 10.6, // ~38 km/h realistic top road speed
        reverseSpeed: 4.2,
        turnSpeed: 1.15,
        minElevDeg: -8,
        maxElevDeg: 15,
        hasMuzzleBrake: true,
        sightName: 'TZF 9b — 8.8cm KwK 36 L/56 (810 m/s • 2 HP Damage • Ultra-Precision)',
        sightSubtitle: '8.8cm KwK 36 L/56 • 810 M/S • 2 HP DAMAGE • PINPOINT SNIPER',
        fpvZoomText: 'OPTICAL 2.5× [HOLD RMB: 5.0× ZOOM]',
        description: 'German Heavy Tank • 8.8cm KwK 36 (2 HP Damage) • Pinpoint Sniper Precision'
    },
    kingtiger: {
        id: 'kingtiger',
        name: 'Pz.Kpfw. VI Ausf. B King Tiger ("323")',
        shortName: 'King Tiger',
        flag: '🇩🇪',
        badge: '323',
        subBadge: 'KÖNIGSTIGER',
        nation: 'Germany',
        year: '1944',
        weight: '69.8 t',
        massKg: 69800,
        enginePowerKW: 515,
        enemyArmor: 3,        // Enemy King Tiger tank has 3 armor points (Super-Heavy Boss)
        playerArmor: 6,       // Player's tank has 2x armor points (6)
        cannonDamage: 3,      // 8.8cm KwK 43 L/71 cannon deals 3 HP damage (devastating firepower)
        gunName: '8.8 cm KwK 43 L/71',
        caliberText: '8.8cm L/71',
        shellVel: 1000,       // Historic 1000 m/s high velocity
        reloadTime: 5.6,      // Heavy two-piece long ammo reload
        spread: 0.00010,      // Pinpoint sniper precision
        turretTurnSpeed: 0.70,
        blastRadius: 9.5,     // Heavy 8.8cm HE-AP blast radius
        blastDamage: 120,
        recoilOffset: 0.62,
        maxSpeed: 10.0,       // ~35 km/h
        reverseSpeed: 3.8,
        turnSpeed: 1.05,
        minElevDeg: -8,
        maxElevDeg: 17,
        hasMuzzleBrake: true,
        sightName: 'TZF 9d/1 — 8.8cm KwK 43 L/71 (1000 m/s • 3 HP Damage • Camouflaged)',
        sightSubtitle: '8.8cm KwK 43 L/71 • 1000 M/S • 3 HP DAMAGE • AMBUSH CAMO',
        fpvZoomText: 'OPTICAL 2.5× [HOLD RMB: 5.0× ZOOM]',
        description: 'German Super-Heavy Tank • 8.8cm KwK 43 L/71 (3 HP Damage) • Ambush Camo • 150mm Sloped Glacis'
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
        cannonDamage: 1,      // 75mm Gun M3 deals 1 HP damage
        gunName: '75 mm Gun M3',
        caliberText: '75mm',
        shellVel: 460,        // Slower projectile with noticeable arc and flight delay
        reloadTime: 2.7,      // High reload rate: rapid-fire 2.7s reload
        spread: 0.0035,       // Moderate precision
        turretTurnSpeed: 1.25,
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
        cannonDamage: 1,      // 85mm ZiS-S-53 deals 1 HP damage
        gunName: '85 mm ZiS-S-53',
        caliberText: '85mm',
        shellVel: 740,
        reloadTime: 3.6,
        spread: 0.018,        // Low precision: wide dispersion cone
        turretTurnSpeed: 1.00,
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
    },
    kv2: {
        id: 'kv2',
        name: 'KV-2 Heavy Artillery Tank ("ЗА РОДИНУ")',
        shortName: 'KV-2',
        flag: '🇷🇺',
        badge: '152',
        subBadge: 'KV-2',
        nation: 'Soviet Union',
        year: '1940',
        weight: '52 t',
        massKg: 52000,
        enginePowerKW: 441,
        enemyArmor: 2,        // Enemy KV-2 heavy tank has 2 armor points
        playerArmor: 4,       // Player's tank has 2x armor points (4)
        cannonDamage: 4,      // 152mm M-10T Howitzer deals 4 HP damage (devastating one-shot firepower)
        gunName: '152 mm Howitzer M-10T',
        caliberText: '152mm',
        shellVel: 380,        // Slowest projectile in the game with noticeable high-arc delay
        reloadTime: 6.5,      // Two-piece heavy 152mm ammunition reload time
        spread: 0.0035,       // Precision is the same level as M4 Sherman
        turretTurnSpeed: 0.45, // Slow turret traverse speed (massive 12-ton MT-1 turret)
        blastRadius: 24.0,    // Biggest explosion radius in the game (massive 152mm HE blast)
        blastDamage: 220,     // Heavy blast damage
        recoilOffset: 0.72,   // Colossal howitzer recoil kick
        maxSpeed: 10.6,       // Same speed as tiger tank
        reverseSpeed: 4.2,    // Same reverse speed as tiger tank
        turnSpeed: 1.15,      // Same turn speed as tiger tank
        minElevDeg: -5,
        maxElevDeg: 12,
        hasMuzzleBrake: false,
        sightName: 'TOD-9 — 152mm M-10T (380 m/s • 4 HP Damage • 24m Blast)',
        sightSubtitle: '152mm M-10T • 380 M/S • 4 HP DAMAGE • COLOSSAL 24M BLAST',
        fpvZoomText: 'OPTICAL 2.5× [HOLD RMB: 4.0× ZOOM]',
        description: 'Soviet Heavy Artillery Tank • 152mm M-10T (4 HP Damage) • Colossal 24m HE Blast • 75mm All-Around Armor'
    },
    pershing: {
        id: 'pershing',
        name: 'M26 Pershing Heavy Tank ("VANGUARD")',
        shortName: 'M26 Pershing',
        flag: '🇺🇸',
        badge: 'M26',
        subBadge: 'PERSHING',
        color: '#4e4630',
        nation: 'United States',
        year: '1945',
        weight: '41.7 t',
        massKg: 41700,
        enginePowerKW: 373,
        enemyArmor: 2,        // Enemy Pershing has 2 HP armor
        playerArmor: 4,       // Player's tank has 2x armor points (4)
        cannonDamage: 2,      // 90mm Gun M3 deals 2 HP damage (same as Tiger I KwK 36)
        gunName: '90 mm Gun M3',
        caliberText: '90mm',
        shellVel: 810,        // Same velocity as Tiger I KwK 36 (810 m/s)
        reloadTime: 2.7,      // Same reload speed as M4 Sherman (2.7s)
        spread: 0.0003,       // Same precision as Tiger I
        turretTurnSpeed: 0.85,
        blastRadius: 8.0,     // Same blast radius as Tiger I (8.0m)
        blastDamage: 100,     // Same blast damage as Tiger I
        recoilOffset: 0.52,
        maxSpeed: 15.2,       // Slightly faster than M4 Sherman (13.6 -> 15.2)
        reverseSpeed: 5.4,
        turnSpeed: 1.35,
        minElevDeg: -10,
        maxElevDeg: 20,
        hasMuzzleBrake: true,
        sightName: 'M71C — 90mm Gun M3 (810 m/s • 2 HP Damage • Rapid-Fire 2.7s)',
        sightSubtitle: '90mm Gun M3 • 810 M/S • 2 HP DAMAGE • RAPID-FIRE (2.7s)',
        fpvZoomText: 'OPTICAL 2.5× [HOLD RMB: 5.0× ZOOM]',
        description: 'American Heavy Tank • 90mm Gun M3 (2 HP Damage) • Rapid 2.7s Reload • Sloped Glacis • Olive-Dirt Brown'
    }
};

TANK_SPECS.m26 = TANK_SPECS.pershing;
TANK_SPECS.m26_pershing = TANK_SPECS.pershing;

TANK_SPECS.tiger2 = TANK_SPECS.kingtiger;
TANK_SPECS.king_tiger = TANK_SPECS.kingtiger;

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
    } else if (tankId === 'pershing' || tankId === 'm26' || tankId === 'm26_pershing') {
        model = (typeof window.buildPershingTank === 'function') ? window.buildPershingTank(s, m) : window.buildShermanTank(s, m);
    } else if (tankId === 't34') {
        model = window.buildT34Tank(s, m);
    } else if (tankId === 'kv2' && typeof window.buildKV2Tank === 'function') {
        model = window.buildKV2Tank(s, m);
    } else if ((tankId === 'kingtiger' || tankId === 'tiger2' || tankId === 'king_tiger') && typeof window.buildKingTigerTank === 'function') {
        model = window.buildKingTigerTank(s, m);
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
        window.tankState.CANNON_DAMAGE = (typeof spec.cannonDamage === 'number') ? spec.cannonDamage : ((newTankId === 'kingtiger' || newTankId === 'tiger2' || newTankId === 'king_tiger') ? 3 : ((newTankId === 'tiger') ? 2 : 1));
        window.tankState.MAX_SPEED = spec.maxSpeed;
        window.tankState.REVERSE_SPEED = spec.reverseSpeed;
        window.tankState.TURN_SPEED = spec.turnSpeed;
        window.tankState.TURRET_TURN_SPEED = spec.turretTurnSpeed || 1.0;
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

TANK_SPECS.tiger2 = TANK_SPECS.kingtiger;
TANK_SPECS.king_tiger = TANK_SPECS.kingtiger;

window.TANK_SPECS = TANK_SPECS;
window.bindTankGlobals = bindTankGlobals;
window.updateTankHUD = updateTankHUD;
window.buildTankById = buildTankById;
window.switchTank = switchTank;
