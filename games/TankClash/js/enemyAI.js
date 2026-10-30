// ============================================================================
// TankClash Enemy Tank Combat AI & Campaign Engagement System
// Opposing Campaign Spawning, Tactical Periscope Detection, Ballistic Aiming,
// 3-Hit Player Armor Survivability, and 1-Hit Enemy Tank Destruction
// ============================================================================

(function() {
    'use strict';

    function getPlayerMaxArmor(tankId) {
        const id = tankId || window.currentTankId || (window.tankState && window.tankState.currentTankSpec && window.tankState.currentTankSpec.id) || 'tiger';
        if (window.TANK_SPECS && window.TANK_SPECS[id] && typeof window.TANK_SPECS[id].playerArmor === 'number') {
            return window.TANK_SPECS[id].playerArmor;
        }
        return id === 'tiger' ? 4 : 2;
    }
    window.getPlayerMaxArmor = getPlayerMaxArmor;

    let playerHitsTaken = 0;
    const sessionDestroyedEnemyTanks = new Set();
    const activeEnemyTanks = [];
    const MAX_ZONE_ENEMIES = 15;
    const MIN_SPAWN_DIST = 160.0;
    const MAX_SPAWN_DIST = 240.0;
    const DESPAWN_DIST = 280.0;
    const SPAWN_INTERVAL_SEC = 2.5;

    let nextEnemySeq = 1;
    let enemySpawnCooldown = 1.0;
    let lastSpawnAngle = 0;

    window.activeEnemyTanks = activeEnemyTanks;
    window.sessionDestroyedEnemyTanks = sessionDestroyedEnemyTanks;
    Object.defineProperty(window, 'MAX_PLAYER_HITS', {
        get: () => getPlayerMaxArmor(),
        configurable: true
    });
    window.TOTAL_ZONE_ENEMIES = MAX_ZONE_ENEMIES;

    // Track when player fired to dynamically alert nearby enemy crews
    let lastPlayerFireTime = -999;
    window.notifyPlayerFired = function() {
        lastPlayerFireTime = (window.performance && window.performance.now) ? window.performance.now() / 1000 : Date.now() / 1000;
        // Alert all alive enemies within 250m
        const pX = window.tankState ? window.tankState.x : 0;
        const pZ = window.tankState ? window.tankState.z : 0;
        for (let i = 0; i < activeEnemyTanks.length; i++) {
            const e = activeEnemyTanks[i];
            if (e.isDestroyed) continue;
            if (Math.hypot(e.x - pX, e.z - pZ) < 250) {
                e.state = 'ENGAGING';
                e.detectionTimer = Math.max(e.detectionTimer, 1.2);
            }
        }
    };

    // ========================================================================
    // 1. ALL CAMPAIGNS FACTION ASSIGNMENT
    // Enemies spawn from all campaigns: Tiger I (German), Sherman (US), T-34-85 (Soviet)
    // ========================================================================
    const ALL_CAMPAIGNS = ['tiger', 'sherman', 't34'];
    function getRandomCampaignTankType() {
        return ALL_CAMPAIGNS[Math.floor(Math.random() * ALL_CAMPAIGNS.length)];
    }
    const getOpposingCampaignTankType = getRandomCampaignTankType;
    window.getRandomCampaignTankType = getRandomCampaignTankType;
    window.getOpposingCampaignTankType = getOpposingCampaignTankType;

    // Normalize angle to [-PI, PI]
    function normalizeAngle(a) {
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        return a;
    }

    // Check if line of sight between two positions is blocked by tactical cover
    function checkObstacleLineOfSight(x0, z0, x1, z1) {
        const obstacles = window.worldObstacles || [];
        const dx = x1 - x0;
        const dz = z1 - z0;
        const segLenSq = dx * dx + dz * dz;
        if (segLenSq < 1.0) return true; // too close, clear

        for (let i = 0; i < obstacles.length; i++) {
            const obs = obstacles[i];
            const toObsX = obs.x - x0;
            const toObsZ = obs.z - z0;
            const t = THREE.MathUtils.clamp((toObsX * dx + toObsZ * dz) / segLenSq, 0.05, 0.95);
            const closeX = x0 + dx * t;
            const closeZ = z0 + dz * t;
            const distSq = (closeX - obs.x) ** 2 + (closeZ - obs.z) ** 2;
            const hitRadius = (obs.radius || 4.0) * 0.92;
            if (distSq < hitRadius * hitRadius) {
                return false; // Obstructed by tactical cover!
            }
        }
        return true; // Clear line of sight
    }

    // ========================================================================
    // 2. ENEMY TANK FACTORY (Real 3D Tank Models)
    // ========================================================================
    // Enemy-only copies of the player material set, so enemy envMap tuning never leaks into player tanks.
    let enemyTankMatsCache = null;
    function getEnemyTankMats() {
        if (enemyTankMatsCache) return enemyTankMatsCache;
        if (!window.mats) return {};
        enemyTankMatsCache = {};
        Object.entries(window.mats).forEach(([key, mat]) => {
            if (!mat || !mat.isMaterial) return;
            const copy = mat.clone();
            copy.userData.shared = true;
            if (copy.isMeshStandardMaterial) copy.envMapIntensity = 0.3;
            enemyTankMatsCache[key] = copy;
        });
        return enemyTankMatsCache;
    }

    // Frees per-tank geometry and materials. Anything flagged userData.shared, or owned by window.mats, is kept.
    function disposeTankOwnedResources(root) {
        const sharedMats = new Set(Object.values(window.mats || {}));
        root.traverse((obj) => {
            if (!obj.isMesh) return;
            if (obj.geometry && !obj.geometry.userData.shared) obj.geometry.dispose();
            const list = Array.isArray(obj.material) ? obj.material : [obj.material];
            list.forEach((mat) => {
                if (mat && !mat.userData.shared && !sharedMats.has(mat)) mat.dispose();
            });
        });
    }

    function spawnEnemyCombatTank(id, x, y, z, parentGroup, forceType) {
        if (sessionDestroyedEnemyTanks.has(id)) {
            // Already destroyed in this session; don't respawn as active
            return null;
        }

        const tankType = forceType || getOpposingCampaignTankType(window.currentTankId);
        const spec = (window.TANK_SPECS && window.TANK_SPECS[tankType]) ? window.TANK_SPECS[tankType] : {
            id: tankType,
            name: 'Enemy Tank',
            shortName: tankType.toUpperCase(),
            shellVel: 750,
            reloadTime: 4.2
        };

        const enemyRoot = new THREE.Group();
        enemyRoot.position.set(x, y, z);

        // Initial orientation: facing generally towards spawn with random variation
        const angleToSpawn = Math.atan2(-x, -z) + (Math.random() - 0.5) * 0.8;
        enemyRoot.rotation.y = angleToSpawn;

        const targetGroup = parentGroup || (window.scene || null);
        if (targetGroup && typeof targetGroup.add === 'function') {
            targetGroup.add(enemyRoot);
        }

        const m = getEnemyTankMats();
        let model = null;
        if (tankType === 'sherman' && typeof window.buildShermanTank === 'function') {
            model = window.buildShermanTank(enemyRoot, m, { isEnemy: true });
        } else if (tankType === 't34' && typeof window.buildT34Tank === 'function') {
            model = window.buildT34Tank(enemyRoot, m, { isEnemy: true });
        } else if (typeof window.buildTigerTank === 'function') {
            model = window.buildTigerTank(enemyRoot, m, { isEnemy: true });
        }

        if (!model) return null;

        // Apply steel environment reflection map & register major collision meshes
        const raycastMeshes = [];
        model.tankRoot.traverse((obj) => {
            if (!obj.isMesh) return;
            if (obj.geometry) {
                if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
                const bb = obj.geometry.boundingBox;
                const size = bb ? Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) : 1;
                // Add major hull/turret/track components to aim raycasting
                if (size >= 0.35 || obj.isInstancedMesh) {
                    raycastMeshes.push(obj);
                    if (window.aimRaycastMeshes) window.aimRaycastMeshes.push(obj);
                }
            }
        });

        // Bold Red Target Cursor hovering high above enemy tank cupola
        const targetCursor = (typeof window.createRedTargetCursor === 'function')
            ? window.createRedTargetCursor(1.20, 1.85)
            : null;
        if (targetCursor) {
            targetCursor.position.set(0, 4.4, 0);
            targetCursor.userData.baseY = 4.4;
            enemyRoot.add(targetCursor);
        }

        const enemy = {
            id,
            tankType,
            spec,
            enemyRoot,
            model,
            raycastMeshes,
            parentGroup: targetGroup,
            targetCursor,
            x,
            y,
            z,
            heading: angleToSpawn,
            turretYaw: 0,
            gunElevation: 0.02,
            targetTurretYaw: 0,
            targetGunElevation: 0.02,
            state: 'PATROL',         // 'PATROL', 'ENGAGING', 'DESTROYED'
            combatTactic: 'STAND_AND_FIRE', // 'STAND_AND_FIRE', 'FLANK_LEFT', 'FLANK_RIGHT', 'ADVANCE', 'REVERSE'
            tacticTimer: 1.5 + Math.random() * 2.5,
            targetSpeed: 0,
            detectionTimer: 0,
            reloadTimer: 1.5 + Math.random() * (spec.reloadTime || 3.5),
            barrelRecoil: 0,
            aimErrorYaw: (Math.random() - 0.5) * ((spec.spread || 0.005) * 8.0),
            aimErrorElev: (Math.random() - 0.5) * ((spec.spread || 0.005) * 5.0),
            aimErrorTimer: 0,
            speed: 0,
            isDestroyed: false,
            maxArmor: (spec.enemyArmor !== undefined ? spec.enemyArmor : (tankType === 'tiger' ? 2 : 1)),
            armor: (spec.enemyArmor !== undefined ? spec.enemyArmor : (tankType === 'tiger' ? 2 : 1)),
            burningSmokeTimer: 0,
            plumePuffs: [],

            onHit(impactPos, hitDir) {
                if (this.isDestroyed) return;

                if (this.armor === undefined) {
                    this.armor = this.maxArmor || (this.spec.enemyArmor !== undefined ? this.spec.enemyArmor : (this.tankType === 'tiger' ? 2 : 1));
                }
                this.armor--;

                // If enemy tank still has armor remaining (e.g. Tiger tank absorbs 1st hit):
                if (this.armor > 0) {
                    if (typeof window.spawnDynamicFlash === 'function') {
                        window.spawnDynamicFlash(impactPos, 0xfff08a, 20.0, 38.0, 0.14);
                    }
                    if (typeof window.spawnParticle === 'function') {
                        for (let s = 0; s < 14; s++) {
                            const spkVel = new THREE.Vector3((Math.random() - 0.5) * 18, 2.0 + Math.random() * 14, (Math.random() - 0.5) * 18);
                            window.spawnParticle(impactPos, spkVel, 0xfbbf24, 0.16, 0.08, 0.6, true, 'spark');
                        }
                        for (let m = 0; m < 6; m++) {
                            const smkVel = new THREE.Vector3((Math.random() - 0.5) * 4, 1.5 + Math.random() * 4, (Math.random() - 0.5) * 4);
                            window.spawnParticle(impactPos, smkVel, 0x475569, 0.45, 2.8, 1.8, false, 'smoke');
                        }
                    }
                    if (window.soundFX && typeof window.soundFX.playArmorRicochet === 'function') {
                        window.soundFX.playArmorRicochet(impactPos);
                    } else if (window.soundFX && typeof window.soundFX.playExplosion === 'function') {
                        window.soundFX.playExplosion(impactPos);
                    }
                    showKillFeedBanner(`💥 HIT ENEMY ${this.spec.shortName.toUpperCase()}! ARMOR DAMAGED (${this.armor}/${this.maxArmor} REMAINING)`);
                    return;
                }

                // Armor fully depleted (armor <= 0): Catastrophic vehicle destruction!
                this.isDestroyed = true;
                if (this.targetCursor) this.targetCursor.visible = false;
                this.state = 'DESTROYED';
                sessionDestroyedEnemyTanks.add(this.id);

                // Heavy armor penetration explosion & shockwave
                if (typeof window.triggerHeavyDetonation === 'function') {
                    window.triggerHeavyDetonation(impactPos);
                }

                // Turret slumps/pops off the turret ring
                if (this.model.turretGroup) {
                    this.model.turretGroup.rotation.z += (Math.random() < 0.5 ? 1 : -1) * 0.28;
                    this.model.turretGroup.rotation.x += 0.15;
                    this.model.turretGroup.position.y += 0.22;
                }

                // Char and soot-blacken the tank exterior on per-tank clones so shared materials stay intact
                this.model.tankRoot.traverse((obj) => {
                    if (!obj.isMesh || !obj.material) return;
                    const isArray = Array.isArray(obj.material);
                    const owned = (isArray ? obj.material : [obj.material]).map((mat) => {
                        const copy = mat.clone();
                        copy.userData.shared = false;
                        if (copy.color) copy.color.setHex(0x1e242b);
                        if (copy.roughness !== undefined) copy.roughness = 0.95;
                        return copy;
                    });
                    obj.material = isArray ? owned : owned[0];
                });

                // Spawn continuous catastrophic burning plume from engine deck & turret hatch
                this.burningSmokeTimer = 999999;

                // Play metal tearing & explosion sound
                if (window.soundFX && typeof window.soundFX.playExplosion === 'function') {
                    window.soundFX.playExplosion(impactPos);
                } else if (window.soundFX && typeof window.soundFX.play88mmCannon === 'function') {
                    window.soundFX.play88mmCannon(impactPos);
                }

                // Update score & kill feed
                if (window.tankState) window.tankState.hitsCount++;
                showKillFeedBanner(`TARGET DESTROYED: ${this.spec.shortName}`);
            },

            dispose() {
                // Remove meshes from aim raycaster list
                if (window.aimRaycastMeshes && this.raycastMeshes) {
                    this.raycastMeshes.forEach(mesh => {
                        const idx = window.aimRaycastMeshes.indexOf(mesh);
                        if (idx !== -1) window.aimRaycastMeshes.splice(idx, 1);
                    });
                }
                if (this.enemyRoot) disposeTankOwnedResources(this.enemyRoot);
                if (this.parentGroup && this.enemyRoot) {
                    this.parentGroup.remove(this.enemyRoot);
                }
                const idx = activeEnemyTanks.indexOf(this);
                if (idx !== -1) activeEnemyTanks.splice(idx, 1);
            }
        };

        activeEnemyTanks.push(enemy);
        return enemy;
    }
    window.spawnEnemyCombatTank = spawnEnemyCombatTank;

    // ========================================================================
    // 3. ENEMY COMBAT BEHAVIOR LOOP (Vision, Aiming, Ballistics, Firing)
    // ========================================================================
    function updateEnemyTanks(dt) {
        if (!dt || dt <= 0) return;

        const pState = window.tankState;
        if (!pState) return;

        let targetX = pState.x;
        let targetY = pState.y || 0;
        let targetZ = pState.z;
        let targetDead = !!pState.isKnockedOut;
        const isInfantry = (window.playerMode === 'soldier' && window.playerSoldier);

        if (isInfantry) {
            const ps = window.playerSoldier;
            targetX = ps.x;
            targetY = ps.y || 0;
            targetZ = ps.z;
            targetDead = !!ps.isDead;
        }

        // 1. DEGENERATE DISTANT ENEMY TANKS AND WRECKS: Player is away (> 280m)
        // Releases GPU meshes, collision bounding boxes, and burning particle systems, allowing new enemies to spawn in the zone
        for (let i = activeEnemyTanks.length - 1; i >= 0; i--) {
            const e = activeEnemyTanks[i];
            if (!e) continue;

            const distToPlayer = Math.hypot(e.x - targetX, e.z - targetZ);
            if (distToPlayer > DESPAWN_DIST) {
                e.dispose();
                continue;
            }
        }

        // 2. GRADUAL ENEMY SPAWNER: Deploy 1 tank every ~2.5 seconds, ONLY far away (160m - 240m)
        enemySpawnCooldown -= dt;
        if (enemySpawnCooldown <= 0 && activeEnemyTanks.length < MAX_ZONE_ENEMIES) {
            enemySpawnCooldown = SPAWN_INTERVAL_SEC;
            spawnSingleFarEnemy(targetX, targetZ);
        }

        // Player tank wreck smoke: Dense dark billowing smoke plume sourced directly on top of turret
        if (pState.isKnockedOut && typeof window.spawnParticle === 'function' && Math.random() < dt * 4.2) {
            let pSpawnX = pState.x;
            let pSpawnY = (pState.y || 0) + 2.65;
            let pSpawnZ = pState.z;
            if (window.turretGroup) {
                const ptPos = new THREE.Vector3();
                window.turretGroup.getWorldPosition(ptPos);
                pSpawnX = ptPos.x;
                pSpawnY = ptPos.y + 0.35; // Top of turret / commander hatch
                pSpawnZ = ptPos.z;
            }
            const pTankPos = new THREE.Vector3(
                pSpawnX + (Math.random() - 0.5) * 0.22,
                pSpawnY + Math.random() * 0.15,
                pSpawnZ + (Math.random() - 0.5) * 0.22
            );
            const pSmokeVel = new THREE.Vector3(
                (Math.random() - 0.5) * 0.45,
                3.8 + Math.random() * 1.6,
                (Math.random() - 0.5) * 0.45
            );
            const col = (Math.random() > 0.4) ? 0x22262c : 0x2e353f; // Dense dark charcoal smoke
            const life = 9.0 + Math.random() * 2.5;
            window.spawnParticle(pTankPos, pSmokeVel, col, 0.35, 5.2 + Math.random() * 1.8, life, false, 'smoke', {
                drag: 0.988,
                buoyancy: 3.0,
                maxOpacity: 0.78 // Opaque, dense billowing smoke
            });
        }

        const nowSec = (window.performance && window.performance.now) ? window.performance.now() / 1000 : Date.now() / 1000;
        let playerShotRecently = (nowSec - lastPlayerFireTime < 3.0);
        if (isInfantry && window.playerSoldier) {
            const ps = window.playerSoldier;
            playerShotRecently = (nowSec - (ps.lastFireTime || 0) < 3.0) || (nowSec - (ps.lastGrenadeTime || 0) < 3.0);
        }

        // In infantry mode, player is hard to detect, only in close range
        const maxDetectRange = isInfantry ? (playerShotRecently ? 42 : 22) : (playerShotRecently ? 110 : 95);
        const stealthBuffer = isInfantry ? 18 : 32;

        for (let i = activeEnemyTanks.length - 1; i >= 0; i--) {
            const e = activeEnemyTanks[i];
            if (!e) continue;

            // Animate simple red target cursor hovering above tank
            if (e.targetCursor && !e.isDestroyed) {
                e.targetCursor.rotation.y += dt * 2.0;
                e.targetCursor.position.y = e.targetCursor.userData.baseY + Math.sin(nowSec * 3.5) * 0.08;
            }

            // ----------------------------------------------------------------
            // Destroyed wreck state: Dense dark billowing smoke plume sourced on top of turret (NO fire)
            // ----------------------------------------------------------------
            if (e.isDestroyed) {
                e.burningSmokeTimer += dt;
                if (Math.random() < dt * 4.2 && typeof window.spawnParticle === 'function') {
                    let spawnX = e.x;
                    let spawnY = (e.y || 0) + 2.65;
                    let spawnZ = e.z;
                    if (e.model && e.model.turretGroup) {
                        const tPos = new THREE.Vector3();
                        e.model.turretGroup.getWorldPosition(tPos);
                        spawnX = tPos.x;
                        spawnY = tPos.y + 0.35; // Top of turret roof / commander cupola hatch
                        spawnZ = tPos.z;
                    }
                    const turretTopPos = new THREE.Vector3(
                        spawnX + (Math.random() - 0.5) * 0.22,
                        spawnY + Math.random() * 0.15,
                        spawnZ + (Math.random() - 0.5) * 0.22
                    );
                    const smokeVel = new THREE.Vector3(
                        (Math.random() - 0.5) * 0.45,
                        3.8 + Math.random() * 1.6, // Strong upward thermal buoyancy
                        (Math.random() - 0.5) * 0.45
                    );
                    const col = (Math.random() > 0.4) ? 0x22262c : 0x2e353f; // Dense dark charcoal smoke
                    const life = 9.0 + Math.random() * 2.5; // Floats up high into the sky
                    const startSize = 0.35;
                    const endSize = 5.2 + Math.random() * 1.8;
                    window.spawnParticle(turretTopPos, smokeVel, col, startSize, endSize, life, false, 'smoke', {
                        drag: 0.988,
                        buoyancy: 3.0,
                        maxOpacity: 0.78 // Opaque, dense billowing smoke
                    });
                }
                continue;
            }

            // ----------------------------------------------------------------
            // Vision, Line-of-Sight & Tactical Detection
            // ----------------------------------------------------------------
            const dx = targetX - e.x;
            const dz = targetZ - e.z;
            const distToPlayer = Math.hypot(dx, dz);

            const hasLOS = (distToPlayer < 125) && checkObstacleLineOfSight(e.x, e.z, targetX, targetZ);

            if (targetDead) {
                e.state = 'PATROL';
            } else if (hasLOS && distToPlayer < maxDetectRange) {
                // Immediate detection if player fires or enters close stealth buffer
                if (playerShotRecently || distToPlayer < stealthBuffer) {
                    e.detectionTimer = Math.max(e.detectionTimer, 1.2);
                } else {
                    e.detectionTimer += dt;
                }

                if (e.detectionTimer >= 0.8) {
                    e.state = 'ENGAGING';
                }
            } else {
                e.detectionTimer = Math.max(0, e.detectionTimer - dt * 0.5);
                if (e.detectionTimer <= 0) e.state = 'PATROL';
            }

            // ----------------------------------------------------------------
            // State: PATROL (Idle Horizon Scanning)
            // ----------------------------------------------------------------
            if (e.state === 'PATROL') {
                // Slowly oscillate turret back and forth across frontal arc
                const scanAngle = Math.sin(nowSec * 0.45 + (e.x * 0.1)) * 0.52;
                e.turretYaw = THREE.MathUtils.lerp(e.turretYaw, scanAngle, dt * 0.8);
                if (e.model.turretGroup) e.model.turretGroup.rotation.y = e.turretYaw;
                if (e.model.gunElevationPivot) e.model.gunElevationPivot.rotation.x = 0.02;
                continue;
            }

            // ----------------------------------------------------------------
            // State: ENGAGING (Turret Slew, Ballistic Elevation, Cannon Fire)
            // ----------------------------------------------------------------
            // Drift aim error over time based on tank cannon precision profile
            e.aimErrorTimer = (e.aimErrorTimer || 0) + dt;
            if (e.aimErrorTimer > 2.8) {
                e.aimErrorTimer = 0;
                const spr = (e.spec && typeof e.spec.spread === 'number') ? e.spec.spread : 0.005;
                e.aimErrorYaw = (Math.random() - 0.5) * (spr * 8.0);
                e.aimErrorElev = (Math.random() - 0.5) * (spr * 5.0);
            }

            // 1. Calculate Target Turret Angle in enemy local space (with crew aim error)
            const worldAngleToPlayer = Math.atan2(dx, dz);
            const rawDesiredLocalTurretYaw = normalizeAngle(worldAngleToPlayer - e.heading);
            const desiredLocalTurretYaw = normalizeAngle(rawDesiredLocalTurretYaw + (e.aimErrorYaw || 0));

            // Slew turret towards target with authentic traverse speed (~0.85 rad/s)
            const turretTurnSpeed = (e.tankType === 'sherman') ? 1.15 : (e.tankType === 't34' ? 0.95 : 0.75);
            e.turretYaw = THREE.MathUtils.lerp(e.turretYaw, desiredLocalTurretYaw, dt * turretTurnSpeed * 1.5);
            if (e.model.turretGroup) e.model.turretGroup.rotation.y = e.turretYaw;

            // 2. Ballistic Gun Pitch / Elevation with drop compensation and sight inaccuracy
            const dy = (targetY + (isInfantry ? 0.6 : 1.2)) - (e.y + 1.7);
            const shellSpeed = e.spec.shellVel || 750;
            const dropCompensation = 0.5 * (9.81 * (distToPlayer / shellSpeed) ** 2) / Math.max(1, distToPlayer);
            const desiredElevation = THREE.MathUtils.clamp(
                Math.atan2(dy, distToPlayer) + dropCompensation + (e.aimErrorElev || 0),
                -0.15, 0.35
            );
            e.gunElevation = THREE.MathUtils.lerp(e.gunElevation, desiredElevation, dt * 2.0);
            if (e.model.gunElevationPivot) e.model.gunElevationPivot.rotation.x = -e.gunElevation;

            // 3. Dynamic Combat Maneuvering: Randomly alternate between shooting in place and moving/flanking
            e.tacticTimer = (e.tacticTimer || 2.0) - dt;
            const spdFactor = (e.spec && e.spec.maxSpeed) ? (e.spec.maxSpeed / 10.6) : 1.0;
            if (e.tacticTimer <= 0) {
                const roll = Math.random();
                if (roll < 0.35) {
                    // Shoot from stationary position
                    e.combatTactic = 'STAND_AND_FIRE';
                    e.tacticTimer = 2.5 + Math.random() * 3.0;
                    e.targetSpeed = 0;
                } else if (roll < 0.58) {
                    // Move around: flank left around player
                    e.combatTactic = 'FLANK_LEFT';
                    e.tacticTimer = 3.0 + Math.random() * 3.5;
                    e.targetSpeed = (3.2 + Math.random() * 1.0) * spdFactor;
                } else if (roll < 0.80) {
                    // Move around: flank right around player
                    e.combatTactic = 'FLANK_RIGHT';
                    e.tacticTimer = 3.0 + Math.random() * 3.5;
                    e.targetSpeed = (3.2 + Math.random() * 1.0) * spdFactor;
                } else if (distToPlayer > 42) {
                    // Move around: close in aggressively
                    e.combatTactic = 'ADVANCE';
                    e.tacticTimer = 2.5 + Math.random() * 3.0;
                    e.targetSpeed = (3.6 + Math.random() * 0.8) * spdFactor;
                } else {
                    // Move around: reverse away
                    e.combatTactic = 'REVERSE';
                    e.tacticTimer = 2.0 + Math.random() * 2.5;
                    e.targetSpeed = -2.4 * spdFactor;
                }
            }

            let desiredHullHeading = e.heading;
            if (e.combatTactic === 'STAND_AND_FIRE') {
                desiredHullHeading = worldAngleToPlayer;
                e.targetSpeed = 0;
            } else if (e.combatTactic === 'FLANK_LEFT') {
                desiredHullHeading = normalizeAngle(worldAngleToPlayer - Math.PI * 0.42);
                if (distToPlayer < 35) desiredHullHeading = normalizeAngle(worldAngleToPlayer - Math.PI * 0.65);
                if (distToPlayer > 80) desiredHullHeading = normalizeAngle(worldAngleToPlayer - Math.PI * 0.25);
            } else if (e.combatTactic === 'FLANK_RIGHT') {
                desiredHullHeading = normalizeAngle(worldAngleToPlayer + Math.PI * 0.42);
                if (distToPlayer < 35) desiredHullHeading = normalizeAngle(worldAngleToPlayer + Math.PI * 0.65);
                if (distToPlayer > 80) desiredHullHeading = normalizeAngle(worldAngleToPlayer + Math.PI * 0.25);
            } else if (e.combatTactic === 'ADVANCE') {
                desiredHullHeading = worldAngleToPlayer;
            } else if (e.combatTactic === 'REVERSE') {
                desiredHullHeading = worldAngleToPlayer;
            }

            // Slew hull towards desired maneuver heading
            const hullTurnRate = (e.tankType === 'sherman') ? 1.15 : 0.90;
            const headingDiff = normalizeAngle(desiredHullHeading - e.heading);
            e.heading += THREE.MathUtils.clamp(headingDiff, -hullTurnRate * dt, hullTurnRate * dt);
            e.enemyRoot.rotation.y = e.heading;

            // Move tank forward/backward with speed
            e.speed = THREE.MathUtils.lerp(e.speed, e.targetSpeed || 0, dt * 2.2);
            if (Math.abs(e.speed) > 0.05) {
                const moveDist = e.speed * dt;
                const nextX = e.x + Math.sin(e.heading) * moveDist;
                const nextZ = e.z + Math.cos(e.heading) * moveDist;

                let canMove = true;
                if (typeof window.getTerrainHeight === 'function') {
                    const nextY = window.getTerrainHeight(nextX, nextZ);
                    if (nextY < -1.8) {
                        canMove = false;
                        e.combatTactic = 'STAND_AND_FIRE';
                        e.tacticTimer = 2.0;
                    } else {
                        e.y = nextY;
                    }
                }
                if (canMove) {
                    e.x = nextX;
                    e.z = nextZ;
                    e.enemyRoot.position.set(e.x, e.y, e.z);

                    // Animate road wheels & track links while moving
                    if (typeof e.model.updateTracksGeometry === 'function') {
                        const trackAnim = e.speed * 0.9;
                        e.model.updateTracksGeometry(nowSec * trackAnim * 1.5, nowSec * trackAnim * 1.5);
                    }
                }
            }

            // 4. Barrel recoil recovery animation
            if (e.barrelRecoil > 0) {
                e.barrelRecoil = Math.max(0, e.barrelRecoil - dt * 2.2);
                if (e.model.barrelRecoilGroup) {
                    e.model.barrelRecoilGroup.position.z = -e.barrelRecoil;
                }
            }

            // 5. Fire Main Cannon when roughly aligned on player
            e.reloadTimer -= dt;
            const yawError = Math.abs(normalizeAngle(e.turretYaw - rawDesiredLocalTurretYaw));
            const elevError = Math.abs(e.gunElevation - (Math.atan2(dy, distToPlayer) + dropCompensation));

            // Generous alignment trigger so enemies shoot with realistic hesitation and imperfection
            if (yawError < 0.22 && elevError < 0.16 && e.reloadTimer <= 0 && hasLOS && !targetDead) {
                // FIRE MAIN CANNON!
                e.reloadTimer = (e.spec.reloadTime || 4.2) + Math.random() * 0.8;
                e.barrelRecoil = e.spec.recoilOffset || 0.45;

                // Muzzle position & direction
                const muzzlePos = new THREE.Vector3();
                if (e.model.mainGunMuzzleTip) {
                    if (e.model.tankRoot) e.model.tankRoot.updateMatrixWorld(true);
                    e.model.mainGunMuzzleTip.getWorldPosition(muzzlePos);
                } else {
                    muzzlePos.set(e.x, e.y + 1.8, e.z).add(new THREE.Vector3(Math.sin(worldAngleToPlayer), 0, Math.cos(worldAngleToPlayer)).multiplyScalar(4.0));
                }

                // Authentic gun barrel world direction with wider dispersion so they miss frequently
                const shotYaw = e.heading + e.turretYaw + (Math.random() - 0.5) * 0.10;
                const shotElev = e.gunElevation + (Math.random() - 0.5) * 0.08;
                const cosElev = Math.cos(shotElev);
                const fireDir = new THREE.Vector3(
                    Math.sin(shotYaw) * cosElev,
                    Math.sin(shotElev),
                    Math.cos(shotYaw) * cosElev
                ).normalize();

                // Re-randomize aim error for subsequent shots based on tank precision
                const shotSpr = (e.spec && typeof e.spec.spread === 'number') ? e.spec.spread : 0.005;
                e.aimErrorYaw = (Math.random() - 0.5) * (shotSpr * 9.0);
                e.aimErrorElev = (Math.random() - 0.5) * (shotSpr * 6.0);
                e.aimErrorTimer = 0;

                // Dynamic Muzzle Flash Light
                if (typeof window.spawnDynamicFlash === 'function') {
                    window.spawnDynamicFlash(muzzlePos, 0xfff3c4, 15.0, 36.0, 0.12);
                }

                // Blast fire & smoke plume VFX
                if (typeof window.spawnParticle === 'function') {
                    window.spawnParticle(muzzlePos, fireDir.clone().multiplyScalar(14), 0xfffbeb, 0.6, 2.4, 0.12, true, 'fire');
                    window.spawnParticle(muzzlePos, fireDir.clone().multiplyScalar(6), 0x94a3b8, 0.45, 3.2, 0.50, false, 'smoke');
                }

                // Cannon Sound FX
                if (window.soundFX && typeof window.soundFX.playMainCannon === 'function') {
                    window.soundFX.playMainCannon(e.spec, muzzlePos);
                } else if (window.soundFX && typeof window.soundFX.play88mmCannon === 'function') {
                    window.soundFX.play88mmCannon(muzzlePos);
                }

                // Spawn high-velocity shell projectile directed at player
                if (typeof window.spawnEnemyShell === 'function') {
                    window.spawnEnemyShell(muzzlePos, fireDir, shellSpeed, e);
                }
            }
        }
    }
    window.updateEnemyTanks = updateEnemyTanks;

    // ========================================================================
    // 4. PLAYER DAMAGE & KNOCKOUT SYSTEM (2x Armor Points vs Enemy)
    // ========================================================================
    function onPlayerHit(impactPos, hitDir) {
        if (!window.tankState || window.tankState.isKnockedOut) return;

        const maxArmor = getPlayerMaxArmor();
        playerHitsTaken++;
        const remainingArmor = Math.max(0, maxArmor - playerHitsTaken);

        // Screen Shake & Hull Recoil Impulse
        if (window.tankState) {
            window.tankState.pitchVel += (Math.random() - 0.5) * 0.55;
            window.tankState.rollVel  += (Math.random() - 0.5) * 0.45;
            window.tankState.heaveVel -= 0.85;
            window.tankState.speed    *= 0.40;
        }

        // Heavy armor ricochet/penetration sound
        if (window.soundFX && typeof window.soundFX.playArmorRicochet === 'function') {
            window.soundFX.playArmorRicochet(impactPos);
        } else if (window.soundFX && typeof window.soundFX.playExplosion === 'function') {
            window.soundFX.playExplosion(impactPos);
        }

        // Heavy detonation at impact position on player tank
        if (typeof window.triggerHeavyDetonation === 'function') {
            window.triggerHeavyDetonation(impactPos);
        }

        // Red damage screen flash vignette
        showDamageFlash(playerHitsTaken >= maxArmor ? 0.75 : 0.45);

        // Update HUD
        updateArmorHUD(remainingArmor, maxArmor);

        // Critical Vehicle Knockout when all armor depleted
        if (playerHitsTaken >= maxArmor) {
            window.tankState.isKnockedOut = true;

            // Turret slumps sideways on player tank
            if (window.turretGroup) {
                if (!window.turretGroup.userData.basePos) {
                    window.turretGroup.userData.basePos = window.turretGroup.position.clone();
                    window.turretGroup.userData.baseRot = window.turretGroup.rotation.clone();
                }
                window.turretGroup.rotation.z += 0.28;
                window.turretGroup.position.y += 0.18;
            }

            // Catastrophic secondary ammunition explosion
            if (typeof window.triggerHeavyDetonation === 'function') {
                const playerHullPos = new THREE.Vector3(window.tankState.x, (window.tankState.y || 0) + 1.5, window.tankState.z);
                window.triggerHeavyDetonation(playerHullPos);
            }

            // When killed as tank, allow player to continue fighting as infantry!
            if (window.playerMode !== 'soldier') {
                if (typeof window.dismountTank === 'function') {
                    window.dismountTank();
                }
                showKillFeedBanner('💥 TANK DESTROYED! BAILED OUT AS INFANTRY! SNEAK & HIJACK AN ENEMY TANK [E]');
            } else {
                showKillFeedBanner('💥 TANK WRECK DESTROYED!');
            }
        } else {
            showKillFeedBanner(`⚠️ ARMOR COMPROMISED! (${remainingArmor}/${maxArmor} HITS REMAINING)`);
        }
    }
    window.onPlayerHit = onPlayerHit;

    function resetPlayerHealth() {
        playerHitsTaken = 0;
        window.playerHitsTaken = 0;
        if (window.tankState) {
            window.tankState.isKnockedOut = false;
        }
        if (window.turretGroup) {
            if (window.turretGroup.userData && window.turretGroup.userData.basePos) {
                window.turretGroup.position.copy(window.turretGroup.userData.basePos);
            }
            if (window.turretGroup.userData && window.turretGroup.userData.baseRot) {
                window.turretGroup.rotation.x = window.turretGroup.userData.baseRot.x;
                window.turretGroup.rotation.z = window.turretGroup.userData.baseRot.z;
            } else {
                window.turretGroup.rotation.x = 0;
                window.turretGroup.rotation.z = 0;
            }
        }
        if (window.gunElevationPivot) {
            window.gunElevationPivot.rotation.x = 0;
        }
        const maxA = getPlayerMaxArmor();
        updateArmorHUD(maxA, maxA);
        hideKnockoutModal();
    }
    window.resetPlayerHealth = resetPlayerHealth;

    // ========================================================================
    // 5. HUD, BANNER & DAMAGE OVERLAY INTEGRATION
    // ========================================================================
    function updateArmorHUD(remaining, maxArmor) {
        const armorEl = document.getElementById('hud-armor');
        if (!armorEl) return;

        const maxA = (typeof maxArmor === 'number') ? maxArmor : getPlayerMaxArmor();
        const rem = (typeof remaining === 'number') ? remaining : Math.max(0, maxA - playerHitsTaken);

        if (rem <= 0) {
            armorEl.textContent = 'DESTROYED';
            armorEl.className = 'text-rose-600 font-extrabold';
            return;
        }

        armorEl.textContent = `ARMOR: ${rem}/${maxA}`;
        const ratio = rem / maxA;
        if (ratio >= 0.75) {
            armorEl.className = 'text-emerald-400 font-bold';
        } else if (ratio >= 0.50) {
            armorEl.className = 'text-amber-400 font-bold';
        } else {
            armorEl.className = 'text-red-500 font-bold animate-pulse';
        }
    }

    function showDamageFlash(opacity = 0.45) {
        let flashEl = document.getElementById('damage-flash-overlay');
        if (!flashEl) {
            flashEl = document.createElement('div');
            flashEl.id = 'damage-flash-overlay';
            flashEl.className = 'fixed inset-0 pointer-events-none z-50 transition-opacity duration-300 bg-red-600/0';
            document.body.appendChild(flashEl);
        }
        flashEl.style.backgroundColor = `rgba(220, 38, 38, ${opacity})`;
        setTimeout(() => {
            if (flashEl) flashEl.style.backgroundColor = 'rgba(220, 38, 38, 0)';
        }, 180);
    }

    let killFeedTimeout = null;
    function showKillFeedBanner(msg) {
        let banner = document.getElementById('kill-feed-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'kill-feed-banner';
            banner.className = 'fixed top-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none transition-all duration-300 opacity-0 transform -translate-y-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-amber-400/50 text-amber-300 mono text-xs font-bold shadow-xl flex items-center gap-2';
            document.body.appendChild(banner);
        }
        banner.textContent = msg;
        banner.style.opacity = '1';
        banner.style.transform = 'translate(-50%, 0)';

        if (killFeedTimeout) clearTimeout(killFeedTimeout);
        killFeedTimeout = setTimeout(() => {
            if (banner) {
                banner.style.opacity = '0';
                banner.style.transform = 'translate(-50%, -8px)';
            }
        }, 2800);
    }

    function showKnockoutModal(titleText) {
        let modal = document.getElementById('knockout-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'knockout-modal';
            modal.className = 'fixed inset-0 z-50 flex items-end justify-center pb-12 pointer-events-none select-none';
            modal.innerHTML = `
                <div class="pointer-events-auto flex flex-col items-center gap-2.5 animate-fade-in">
                    <div class="px-4 py-1.5 rounded-full bg-red-950/85 border border-red-500/70 text-red-200 text-xs font-bold tracking-widest uppercase shadow-2xl flex items-center gap-2 backdrop-blur-md">
                        <span class="text-sm">☠️</span>
                        <span id="knockout-modal-title">${titleText || 'GAME OVER — KILLED IN ACTION'}</span>
                    </div>
                    <button id="btn-knockout-restart" class="px-7 py-3 rounded-2xl bg-black/50 hover:bg-black/75 active:scale-95 text-amber-300 hover:text-white font-extrabold text-sm tracking-wider border-2 border-amber-400/70 hover:border-amber-300 backdrop-blur-md shadow-2xl transition-all flex items-center gap-2.5 cursor-pointer">
                        <span class="text-base">🔄</span>
                        <span>RESPAWN BATTLEFIELD</span>
                        <span class="text-[11px] px-2 py-0.5 rounded bg-amber-400/20 text-amber-200 border border-amber-400/30 mono font-bold">[R]</span>
                    </button>
                </div>
            `;
            document.body.appendChild(modal);

            const rBtn = document.getElementById('btn-knockout-restart');
            if (rBtn) {
                rBtn.addEventListener('click', () => {
                    if (typeof window.restartGame === 'function') window.restartGame();
                });
            }
        } else {
            const tEl = document.getElementById('knockout-modal-title');
            if (tEl) tEl.textContent = titleText || 'GAME OVER — KILLED IN ACTION';
        }
        modal.style.display = 'flex';
    }

    function hideKnockoutModal() {
        const modal = document.getElementById('knockout-modal');
        if (modal) modal.style.display = 'none';
    }

    // ========================================================================
    // 6. GRADUAL DISTANT ENEMY SPAWNER & RESOURCE DEGENERATION (Max 15 per Zone)
    // ========================================================================
    function spawnSingleFarEnemy(playerX, playerZ) {
        if (activeEnemyTanks.length >= MAX_ZONE_ENEMIES) return null;

        const currentTank = window.currentTankId || 'tiger';
        const isPlayerGerman = (currentTank === 'tiger');

        // Golden angle offset (~2.3999 rad) to distribute spawns evenly around 360 degrees
        lastSpawnAngle += 2.39996 + (Math.random() - 0.5) * 0.4;

        let bestX = 0, bestY = 0, bestZ = 0;
        let found = false;

        for (let attempt = 0; attempt < 14; attempt++) {
            const angle = lastSpawnAngle + (attempt * 0.45);
            const dist = MIN_SPAWN_DIST + Math.random() * (MAX_SPAWN_DIST - MIN_SPAWN_DIST);
            const testX = playerX + Math.cos(angle) * dist;
            const testZ = playerZ + Math.sin(angle) * dist;

            const y = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(testX, testZ) : 0;
            const norm = (typeof window.getTerrainNormal === 'function') ? window.getTerrainNormal(testX, testZ) : { y: 1 };

            // Reject if submerged in water (sea level < -1.5)
            if (y < -1.5) continue;
            // Reject if steep cliff
            if (norm.y < 0.82) continue;
            // Strict distance check: MUST NEVER be near player
            if (Math.hypot(testX - playerX, testZ - playerZ) < 140.0) continue;

            // Reject if colliding with building or rock
            let collidesObstacle = false;
            const obstacles = window.worldObstacles || [];
            for (let o = 0; o < obstacles.length; o++) {
                const obs = obstacles[o];
                if (Math.hypot(testX - obs.x, testZ - obs.z) < (obs.radius || 4.5) + 4.5) {
                    collidesObstacle = true;
                    break;
                }
            }
            if (collidesObstacle) continue;

            // Reject if too close to an existing active enemy tank
            let collidesTank = false;
            for (let t = 0; t < activeEnemyTanks.length; t++) {
                if (Math.hypot(testX - activeEnemyTanks[t].x, testZ - activeEnemyTanks[t].z) < 32.0) {
                    collidesTank = true;
                    break;
                }
            }
            if (collidesTank) continue;

            bestX = testX;
            bestY = y;
            bestZ = testZ;
            found = true;
            break;
        }

        if (!found) {
            // Radial search along angle for first valid dry ground
            for (let r = MIN_SPAWN_DIST; r <= MAX_SPAWN_DIST; r += 15) {
                const tx = playerX + Math.cos(lastSpawnAngle) * r;
                const tz = playerZ + Math.sin(lastSpawnAngle) * r;
                const ty = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(tx, tz) : 0;
                if (ty > -1.5) {
                    bestX = tx;
                    bestY = ty;
                    bestZ = tz;
                    found = true;
                    break;
                }
            }
            if (!found) return null;
        }

        const enemyId = `zone:enemy:${nextEnemySeq++}`;
        const tankType = getRandomCampaignTankType();

        const enemy = spawnEnemyCombatTank(enemyId, bestX, bestY, bestZ, window.scene, tankType);
        if (enemy && typeof window.spawnSoldierEscortForTank === 'function') {
            const currentSoldiers = window.activeSoldiers ? window.activeSoldiers.length : 0;
            if (currentSoldiers < 14) {
                const enemyFaction = (tankType === 'sherman') ? 'us' : ((tankType === 't34') ? 'soviet' : 'german');
                window.spawnSoldierEscortForTank(enemy, enemyFaction);
            }
        }
        return enemy;
    }

    function spawnZoneEnemies() {
        // Reset spawner to begin gradual deployment far away, avoiding initial lag
        enemySpawnCooldown = 1.0;
    }

    function resetEnemyTanks() {
        for (let i = activeEnemyTanks.length - 1; i >= 0; i--) {
            activeEnemyTanks[i].dispose();
        }
        activeEnemyTanks.length = 0;
        enemySpawnCooldown = 1.0;
        lastSpawnAngle = Math.random() * Math.PI * 2;
    }
    window.resetEnemyTanks = resetEnemyTanks;
    window.spawnZoneEnemies = spawnZoneEnemies;
    window.spawnInitialFieldEnemies = spawnZoneEnemies;

    // Called when player switches to another tank (e.g., via hijacking)
    function onPlayerTankChanged(newPlayerTankId) {
        playerHitsTaken = 0;
        const pMax = getPlayerMaxArmor(newPlayerTankId);
        updateArmorHUD(pMax, pMax);
    }
    window.onPlayerTankChanged = onPlayerTankChanged;

    window.showKnockoutModal = showKnockoutModal;
    window.hideKnockoutModal = hideKnockoutModal;
    window.updateArmorHUD = updateArmorHUD;

    // Auto-update Armor HUD on boot
    const initMax = getPlayerMaxArmor();
    updateArmorHUD(initMax, initMax);

})();
