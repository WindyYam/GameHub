// ============================================================================
// TankClash Enemy Tank Combat AI & Campaign Engagement System
// Opposing Campaign Spawning, Tactical Periscope Detection, Ballistic Aiming,
// 3-Hit Player Armor Survivability, and 1-Hit Enemy Tank Destruction
// ============================================================================

(function() {
    'use strict';

    const MAX_PLAYER_HITS = 3;
    let playerHitsTaken = 0;
    const sessionDestroyedEnemyTanks = new Set();
    const activeEnemyTanks = [];

    window.activeEnemyTanks = activeEnemyTanks;
    window.sessionDestroyedEnemyTanks = sessionDestroyedEnemyTanks;
    window.MAX_PLAYER_HITS = MAX_PLAYER_HITS;

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
    // 1. OPPOSING CAMPAIGN FACTION ASSIGNMENT
    // German (Axis) Player <---> Sherman & T-34 (Allied) Enemies
    // Allied Player (Sherman / T-34) <---> Tiger I (German Axis) Enemies
    // ========================================================================
    function getOpposingCampaignTankType(playerTankId) {
        const pid = playerTankId || window.currentTankId || 'tiger';
        if (pid === 'tiger') {
            return (Math.random() < 0.5) ? 'sherman' : 't34';
        } else {
            return 'tiger';
        }
    }
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

        const m = window.mats;
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
            const list = Array.isArray(obj.material) ? obj.material : [obj.material];
            list.forEach((mat) => {
                if (mat && mat.isMeshStandardMaterial) mat.envMapIntensity = 0.3;
            });
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
            reloadTimer: 2.0 + Math.random() * 2.5,
            barrelRecoil: 0,
            aimErrorYaw: (Math.random() - 0.5) * 0.16,
            aimErrorElev: (Math.random() - 0.5) * 0.10,
            aimErrorTimer: 0,
            speed: 0,
            isDestroyed: false,
            burningSmokeTimer: 0,
            plumePuffs: [],

            onHit(impactPos, hitDir) {
                if (this.isDestroyed) return;
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

                // Char and soot-blacken the tank exterior
                this.model.tankRoot.traverse((obj) => {
                    if (obj.isMesh && obj.material) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach(mat => {
                            if (mat.color) mat.color.setHex(0x1e242b);
                            if (mat.roughness !== undefined) mat.roughness = 0.95;
                        });
                    }
                });

                // Spawn continuous catastrophic burning plume from engine deck & turret hatch
                this.burningSmokeTimer = 999999;

                // Play metal tearing & explosion sound
                if (window.soundFX && typeof window.soundFX.playExplosion === 'function') {
                    window.soundFX.playExplosion();
                } else if (window.soundFX && typeof window.soundFX.play88mmCannon === 'function') {
                    window.soundFX.play88mmCannon();
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

        const playerX = pState.x;
        const playerY = pState.y || 0;
        const playerZ = pState.z;
        const playerDead = !!pState.isKnockedOut;

        const nowSec = (window.performance && window.performance.now) ? window.performance.now() / 1000 : Date.now() / 1000;
        const playerShotRecently = (nowSec - lastPlayerFireTime < 3.0);

        for (let i = activeEnemyTanks.length - 1; i >= 0; i--) {
            const e = activeEnemyTanks[i];
            if (!e) continue;

            // Animate simple red target cursor hovering above tank
            if (e.targetCursor && !e.isDestroyed) {
                e.targetCursor.rotation.y += dt * 2.0;
                e.targetCursor.position.y = e.targetCursor.userData.baseY + Math.sin(nowSec * 3.5) * 0.08;
            }

            // ----------------------------------------------------------------
            // Destroyed burning wreck state
            // ----------------------------------------------------------------
            if (e.isDestroyed) {
                // Spawn rising dark soot & flame particles from engine deck
                e.burningSmokeTimer += dt;
                if (Math.random() < dt * 6.0 && typeof window.spawnParticle === 'function') {
                    const deckPos = new THREE.Vector3(e.x + (Math.random() - 0.5) * 1.2, e.y + 1.8, e.z + (Math.random() - 0.5) * 1.2);
                    const smokeVel = new THREE.Vector3((Math.random() - 0.5) * 0.8, 2.2 + Math.random() * 1.2, (Math.random() - 0.5) * 0.8);
                    const isFire = (Math.random() < 0.35);
                    window.spawnParticle(deckPos, smokeVel, isFire ? 0xf59e0b : 0x22262a, 0.45, 3.2, 2.2, isFire, isFire ? 'fire' : 'smoke');
                }
                continue;
            }

            // ----------------------------------------------------------------
            // Vision, Line-of-Sight & Tactical Detection
            // ----------------------------------------------------------------
            const dx = playerX - e.x;
            const dz = playerZ - e.z;
            const distToPlayer = Math.hypot(dx, dz);

            // Reduced detection range: realistic vision limit through vision slits & periscopes
            const maxDetectRange = playerShotRecently ? 110 : 95;
            const hasLOS = (distToPlayer < 125) && checkObstacleLineOfSight(e.x, e.z, playerX, playerZ);

            if (playerDead) {
                e.state = 'PATROL';
            } else if (hasLOS && distToPlayer < maxDetectRange) {
                // Immediate detection only if player fires main gun or approaches within close stealth buffer (~32m)
                if (playerShotRecently || distToPlayer < 32) {
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
            // Drift aim error over time so enemy gunners exhibit human imperfection and wandering aim
            e.aimErrorTimer = (e.aimErrorTimer || 0) + dt;
            if (e.aimErrorTimer > 2.8) {
                e.aimErrorTimer = 0;
                e.aimErrorYaw = (Math.random() - 0.5) * 0.16;   // ~±4.6° error
                e.aimErrorElev = (Math.random() - 0.5) * 0.10;  // ~±2.9° error
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
            const dy = (playerY + 1.2) - (e.y + 1.7);
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
                    e.targetSpeed = 3.2 + Math.random() * 1.0;
                } else if (roll < 0.80) {
                    // Move around: flank right around player
                    e.combatTactic = 'FLANK_RIGHT';
                    e.tacticTimer = 3.0 + Math.random() * 3.5;
                    e.targetSpeed = 3.2 + Math.random() * 1.0;
                } else if (distToPlayer > 42) {
                    // Move around: close in aggressively
                    e.combatTactic = 'ADVANCE';
                    e.tacticTimer = 2.5 + Math.random() * 3.0;
                    e.targetSpeed = 3.6 + Math.random() * 0.8;
                } else {
                    // Move around: reverse away
                    e.combatTactic = 'REVERSE';
                    e.tacticTimer = 2.0 + Math.random() * 2.5;
                    e.targetSpeed = -2.4;
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
            if (yawError < 0.22 && elevError < 0.16 && e.reloadTimer <= 0 && hasLOS && !playerDead) {
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

                // Re-randomize aim error for subsequent shots
                e.aimErrorYaw = (Math.random() - 0.5) * 0.18;
                e.aimErrorElev = (Math.random() - 0.5) * 0.12;
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
                    window.soundFX.playMainCannon(e.spec);
                } else if (window.soundFX && typeof window.soundFX.play88mmCannon === 'function') {
                    window.soundFX.play88mmCannon();
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
    // 4. PLAYER DAMAGE & KNOCKOUT SYSTEM (3 Hits Sustained)
    // ========================================================================
    function onPlayerHit(impactPos, hitDir) {
        if (!window.tankState || window.tankState.isKnockedOut) return;

        playerHitsTaken++;
        const remainingArmor = Math.max(0, MAX_PLAYER_HITS - playerHitsTaken);

        // Screen Shake & Hull Recoil Impulse
        if (window.tankState) {
            window.tankState.pitchVel += (Math.random() - 0.5) * 0.55;
            window.tankState.rollVel  += (Math.random() - 0.5) * 0.45;
            window.tankState.heaveVel -= 0.85;
            window.tankState.speed    *= 0.40;
        }

        // Heavy armor ricochet/penetration sound
        if (window.soundFX && typeof window.soundFX.playArmorRicochet === 'function') {
            window.soundFX.playArmorRicochet();
        } else if (window.soundFX && typeof window.soundFX.playExplosion === 'function') {
            window.soundFX.playExplosion();
        }

        // Heavy detonation at impact position on player tank
        if (typeof window.triggerHeavyDetonation === 'function') {
            window.triggerHeavyDetonation(impactPos);
        }

        // Red damage screen flash vignette
        showDamageFlash(playerHitsTaken >= MAX_PLAYER_HITS ? 0.75 : 0.45);

        // Update HUD
        updateArmorHUD(remainingArmor);

        // Critical Vehicle Knockout on 3rd hit
        if (playerHitsTaken >= MAX_PLAYER_HITS) {
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

            showKnockoutModal();
        } else {
            showKillFeedBanner(`⚠️ ARMOR COMPROMISED! (${remainingArmor}/${MAX_PLAYER_HITS} HITS REMAINING)`);
        }
    }
    window.onPlayerHit = onPlayerHit;

    function resetPlayerHealth() {
        playerHitsTaken = 0;
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
        updateArmorHUD(MAX_PLAYER_HITS);
        hideKnockoutModal();
    }
    window.resetPlayerHealth = resetPlayerHealth;

    // ========================================================================
    // 5. HUD, BANNER & DAMAGE OVERLAY INTEGRATION
    // ========================================================================
    function updateArmorHUD(remaining) {
        const armorEl = document.getElementById('hud-armor');
        if (!armorEl) return;

        armorEl.textContent = `ARMOR: ${remaining}/${MAX_PLAYER_HITS}`;
        if (remaining === 3) {
            armorEl.className = 'text-emerald-400 font-bold';
        } else if (remaining === 2) {
            armorEl.className = 'text-amber-400 font-bold';
        } else if (remaining === 1) {
            armorEl.className = 'text-red-500 font-bold animate-pulse';
        } else {
            armorEl.textContent = 'DESTROYED';
            armorEl.className = 'text-rose-600 font-extrabold';
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

    function showKnockoutModal() {
        let modal = document.getElementById('knockout-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'knockout-modal';
            modal.className = 'fixed inset-0 z-50 flex items-end justify-center pb-10 pointer-events-none select-none';
            modal.innerHTML = `
                <div class="pointer-events-auto flex flex-col items-center gap-2 animate-fade-in">
                    <button id="btn-knockout-restart" class="px-6 py-2.5 rounded-2xl bg-black/40 hover:bg-black/65 active:scale-95 text-amber-300 hover:text-white font-extrabold text-sm tracking-wider border border-amber-400/50 hover:border-amber-300 backdrop-blur-sm shadow-2xl transition-all flex items-center gap-2 cursor-pointer">
                        <span class="text-base">🔄</span>
                        <span>RESPAWN TANK</span>
                        <span class="text-[11px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200 border border-amber-400/30 mono">[R]</span>
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
        }
        modal.style.display = 'flex';
    }

    function hideKnockoutModal() {
        const modal = document.getElementById('knockout-modal');
        if (modal) modal.style.display = 'none';
    }

    // ========================================================================
    // 6. CAMPAIGN SWITCHER & INITIAL SEED ENEMIES
    // ========================================================================
    function spawnInitialFieldEnemies() {
        // Spawn 2 initial enemy tanks across the opening meadows at ~70m and ~95m
        if (activeEnemyTanks.length > 0) return;
        const initialPositions = [
            { id: 'init:enemy1', x: 54.0, z: 65.0 },
            { id: 'init:enemy2', x: -62.0, z: 78.0 }
        ];

        initialPositions.forEach(p => {
            const y = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(p.x, p.z) : 0;
            spawnEnemyCombatTank(p.id, p.x, y, p.z, window.scene);
        });
    }
    window.spawnInitialFieldEnemies = spawnInitialFieldEnemies;

    function resetEnemyTanks() {
        for (let i = activeEnemyTanks.length - 1; i >= 0; i--) {
            activeEnemyTanks[i].dispose();
        }
        activeEnemyTanks.length = 0;
        sessionDestroyedEnemyTanks.clear();
        spawnInitialFieldEnemies();
    }
    window.resetEnemyTanks = resetEnemyTanks;

    // Called when player switches to another tank (e.g., Tiger -> Sherman)
    function onPlayerTankChanged(newPlayerTankId) {
        // Any alive enemy tanks should switch to the new opposing faction
        const newEnemyType = getOpposingCampaignTankType(newPlayerTankId);
        for (let i = activeEnemyTanks.length - 1; i >= 0; i--) {
            const e = activeEnemyTanks[i];
            if (!e.isDestroyed) {
                const posX = e.x;
                const posZ = e.z;
                const posY = e.y;
                const parent = e.parentGroup;
                const oldId = e.id;
                e.dispose();
                spawnEnemyCombatTank(oldId, posX, posY, posZ, parent, newEnemyType);
            }
        }
    }
    window.onPlayerTankChanged = onPlayerTankChanged;

    // Auto-update Armor HUD on boot
    updateArmorHUD(MAX_PLAYER_HITS);

})();
