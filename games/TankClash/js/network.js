// ============================================================================
// TankClash Multiplayer Engine (WebRTC P2P + Google Free STUN)
// Supports Co-op (Team vs Bots) & PvP (Player vs Player) Game Modes
// Features: Room Code Generation, Callsign Customization, 3D Remote Avatars,
//           Real-Time Ballistics Sync, Hit Registration & Dynamic Scoreboard [Tab]
// ============================================================================

(function () {
    'use strict';

    // 1. Google Free STUN Servers + PeerJS Default TURN Fallback for NAT Traversal
    const GOOGLE_STUN_CONFIG = {
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },
                {
                    urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'],
                    username: 'peerjs',
                    credential: 'peerjsp'
                }
            ]
        }
    };

    // Default callsign generator
    const CALLSIGN_PREFIXES = ['Iron', 'Desert', 'Ghost', 'Thunder', 'Red', 'Steel', 'Vanguard', 'Panzer', 'Fury', 'Eagle'];
    const CALLSIGN_SUFFIXES = ['Fox', 'Ace', 'Wolf', 'Tiger', 'Ranger', 'Hammer', 'Storm', 'Hunter', 'Blade', 'Warrior'];

    function generateRandomCallsign() {
        const pre = CALLSIGN_PREFIXES[Math.floor(Math.random() * CALLSIGN_PREFIXES.length)];
        const suf = CALLSIGN_SUFFIXES[Math.floor(Math.random() * CALLSIGN_SUFFIXES.length)];
        const num = Math.floor(10 + Math.random() * 90);
        return `${pre}${suf}_${num}`;
    }

    function getStoredCallsign() {
        try {
            const saved = localStorage.getItem('tankclash_player_callsign');
            if (saved && saved.trim().length > 0) return saved.trim();
        } catch (e) {}
        const fresh = generateRandomCallsign();
        saveCallsign(fresh);
        return fresh;
    }

    function saveCallsign(name) {
        try {
            if (name && name.trim()) {
                localStorage.setItem('tankclash_player_callsign', name.trim());
            }
        } catch (e) {}
    }

    // Generate room code: e.g. "TC-8492"
    function generateRoomCode() {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `TC-${code}`;
    }

    function sanitizePeerId(code) {
        return 'tankclash-' + code.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    // 2. Multiplayer State
    const netState = {
        peer: null,
        peerId: null,
        roomCode: null,
        isHost: false,
        isActive: false,
        gameMode: 'coop', // 'coop' | 'pvp'
        callsign: getStoredCallsign(),
        hostConn: null,
        clientConns: new Map(), // peerId -> connection (for host)
        remotePlayers: new Map(), // peerId -> RemotePlayer
        stats: {
            kills: 0,
            deaths: 0,
            damage: 0,
            score: 0,
            ping: 0
        },
        scoreboardOpen: false,
        lastStateSendTime: 0,
        lastPingSendTime: 0,
        lastEnemySyncTime: 0,
        lastSoldierSyncTime: 0,
        lastEnemySyncSnapshot: new Map(),
        lastSoldierSyncSnapshot: new Map(),
        scoreboardData: []
    };

    window.multiplayerState = netState;

    // 3. Remote Player Avatar Representation
    class RemotePlayer {
        constructor(id, name, isHost = false) {
            this.id = id;
            this.name = name || 'Soldier';
            this.isHost = isHost;
            this.mode = 'tank'; // 'tank' or 'soldier'
            this.tankType = 'tiger';
            this.soldierType = 'rifle';

            // Coordinates
            this.x = 0;
            this.y = 0;
            this.z = 0;
            this.heading = 0;
            this.turretYaw = 0;
            this.gunElevation = 0;
            this.speed = 0;
            this.pitch = 0;
            this.roll = 0;
            this.pitchVel = 0;
            this.rollVel = 0;
            this.animTime = Math.random() * 10;
            this.grenadeAnimTimer = 0;

            // Targets for smooth interpolation
            this.hasReceivedState = false;
            this.targetX = 0;
            this.targetY = 0;
            this.targetZ = 0;
            this.targetHeading = 0;
            this.targetTurretYaw = 0;
            this.targetGunElevation = 0;

            // Health & combat
            this.armor = 4;
            this.maxArmor = 4;
            this.health = 100;
            this.maxHealth = 100;
            this.isKnockedOut = false;
            this.isDead = false;

            // Stats
            this.kills = 0;
            this.deaths = 0;
            this.damage = 0;
            this.score = 0;
            this.ping = 0;

            // 3D Three.js Object Hierarchy
            this.rootGroup = new THREE.Group();
            this.rootGroup.name = `remote_player_${id}`;
            this.tankModel = null;
            this.soldierRig = null;
            this.activeVisual = null; // 'tank' or 'soldier'

            // Billboard Overhead Nameplate Sprite
            this.nameplateSprite = null;
            this.nameplateCanvas = null;
            this.nameplateTexture = null;

            this.init3D();
        }

        init3D() {
            if (window.scene && window.scene.add) {
                window.scene.add(this.rootGroup);
            }
            this.createNameplate();
            this.rebuildVisual();
        }

        createNameplate() {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 64;
            this.nameplateCanvas = canvas;
            this.nameplateTexture = new THREE.CanvasTexture(canvas);
            this.nameplateTexture.minFilter = THREE.LinearFilter;
            this.nameplateTexture.magFilter = THREE.LinearFilter;

            const mat = new THREE.SpriteMaterial({
                map: this.nameplateTexture,
                transparent: true,
                depthTest: false,
                depthWrite: false
            });
            const sprite = new THREE.Sprite(mat);
            sprite.scale.set(4.5, 1.125, 1.0);
            sprite.position.set(0, 3.8, 0);
            sprite.renderOrder = 999;
            this.nameplateSprite = sprite;
            this.rootGroup.add(sprite);

            this.updateNameplate();
        }

        updateNameplate() {
            if (!this.nameplateCanvas) return;
            const ctx = this.nameplateCanvas.getContext('2d');
            ctx.clearRect(0, 0, 256, 64);

            const isPvP = netState.gameMode === 'pvp';
            const isFriendly = !isPvP;

            // Background pill
            ctx.fillStyle = 'rgba(10, 15, 24, 0.82)';
            ctx.strokeStyle = isFriendly ? 'rgba(56, 189, 248, 0.65)' : 'rgba(239, 68, 68, 0.75)';
            ctx.lineWidth = 2.5;
            roundRect(ctx, 6, 4, 244, 56, 10);
            ctx.fill();
            ctx.stroke();

            // Callsign text + Tag
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 15px "JetBrains Mono", monospace';
            ctx.fillStyle = isFriendly ? '#38bdf8' : '#f87171';
            const roleTag = this.isHost ? '[HOST] ' : (isFriendly ? '[ALLY] ' : '[ENEMY] ');
            ctx.fillText(`${roleTag}${this.name}`, 128, 22);

            // Health / Armor Progress Bar
            const barW = 200;
            const barH = 8;
            const barX = 28;
            const barY = 38;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            roundRect(ctx, barX, barY, barW, barH, 4);
            ctx.fill();

            const ratio = this.mode === 'tank'
                ? Math.max(0, Math.min(1, (this.armor || 0) / (this.maxArmor || 1)))
                : Math.max(0, Math.min(1, (this.health || 0) / (this.maxHealth || 100)));

            ctx.fillStyle = isFriendly
                ? (ratio > 0.5 ? '#10b981' : (ratio > 0.25 ? '#f59e0b' : '#ef4444'))
                : (ratio > 0.5 ? '#ef4444' : '#b91c1c');

            roundRect(ctx, barX, barY, Math.max(4, barW * ratio), barH, 4);
            ctx.fill();

            if (this.nameplateTexture) {
                this.nameplateTexture.needsUpdate = true;
            }
        }

        rebuildVisual() {
            // Remove previous visuals
            if (this.tankModel && this.tankModel.tankRoot && this.tankModel.tankRoot.parent) {
                this.tankModel.tankRoot.parent.remove(this.tankModel.tankRoot);
                this.tankModel = null;
            }
            if (this.soldierRig && this.soldierRig.root && this.soldierRig.root.parent) {
                this.soldierRig.root.parent.remove(this.soldierRig.root);
                this.soldierRig = null;
            }

            if (this.mode === 'soldier') {
                this.activeVisual = 'soldier';
                const faction = (netState.gameMode === 'pvp' && !this.isHost) ? 'soviet' : 'us';
                if (typeof window.buildSoldier === 'function') {
                    const rig = window.buildSoldier(faction, this.soldierType || 'rifle');
                    if (rig && rig.root) {
                        this.soldierRig = rig;
                        this.rootGroup.add(rig.root);
                    }
                }
                if (this.nameplateSprite) this.nameplateSprite.position.set(0, 2.4, 0);
            } else {
                this.activeVisual = 'tank';
                const mats = window.mats;
                const t = (this.tankType || 'tiger').toLowerCase();
                let model = null;
                const subScene = new THREE.Group();

                try {
                    if (t === 'sherman' && typeof window.buildShermanTank === 'function') {
                        model = window.buildShermanTank(subScene, mats);
                    } else if (t === 't34' && typeof window.buildT34Tank === 'function') {
                        model = window.buildT34Tank(subScene, mats);
                    } else if (t === 'kv2' && typeof window.buildKV2Tank === 'function') {
                        model = window.buildKV2Tank(subScene, mats);
                    } else if (t === 'pershing' && typeof window.buildPershingTank === 'function') {
                        model = window.buildPershingTank(subScene, mats);
                    } else if ((t === 'kingtiger' || t === 'tiger2') && typeof window.buildKingTigerTank === 'function') {
                        model = window.buildKingTigerTank(subScene, mats);
                    } else if (typeof window.buildTigerTank === 'function') {
                        model = window.buildTigerTank(subScene, mats);
                    }
                } catch (e) {
                    console.warn('[Multiplayer] Fallback building tank:', e);
                }

                if (model && model.tankRoot) {
                    this.tankModel = model;
                    this.rootGroup.add(model.tankRoot);
                }
                if (this.nameplateSprite) this.nameplateSprite.position.set(0, 3.8, 0);
            }

            this.updateNameplate();
        }

        applyState(pkg) {
            if (!pkg) return;
            if (pkg.name && pkg.name !== this.name) {
                this.name = pkg.name;
                this.updateNameplate();
            }

            // Check if visual mode or vehicle changed
            const modeChanged = pkg.mode && pkg.mode !== this.mode;
            const tankChanged = pkg.tankType && pkg.tankType !== this.tankType;
            const soldierChanged = pkg.soldierType && pkg.soldierType !== this.soldierType;

            this.mode = pkg.mode || this.mode;
            this.tankType = pkg.tankType || this.tankType;
            this.soldierType = pkg.soldierType || this.soldierType;

            if (modeChanged || (this.mode === 'tank' && tankChanged) || (this.mode === 'soldier' && soldierChanged)) {
                this.rebuildVisual();
            }

            // Target positions for smooth lerp
            if (pkg.pos) {
                this.targetX = pkg.pos.x;
                this.targetY = pkg.pos.y;
                this.targetZ = pkg.pos.z;
            }
            if (typeof pkg.heading === 'number') this.targetHeading = pkg.heading;
            if (typeof pkg.turretYaw === 'number') this.targetTurretYaw = pkg.turretYaw;
            if (typeof pkg.gunElevation === 'number') this.targetGunElevation = pkg.gunElevation;
            if (typeof pkg.speed === 'number') this.speed = pkg.speed;

            if (!this.hasReceivedState && pkg.pos) {
                this.hasReceivedState = true;
                this.x = this.targetX;
                this.y = this.targetY;
                this.z = this.targetZ;
                this.heading = this.targetHeading;
                this.turretYaw = this.targetTurretYaw;
                this.gunElevation = this.targetGunElevation;
                this.rootGroup.position.set(this.x, this.y, this.z);
            }

            // Combat & stats
            const hpChanged = (pkg.armor !== this.armor || pkg.health !== this.health);
            this.armor = (pkg.armor !== undefined) ? pkg.armor : this.armor;
            this.maxArmor = (pkg.maxArmor !== undefined) ? pkg.maxArmor : this.maxArmor;
            this.health = (pkg.health !== undefined) ? pkg.health : this.health;
            this.maxHealth = (pkg.maxHealth !== undefined) ? pkg.maxHealth : this.maxHealth;
            this.isKnockedOut = !!pkg.isKnockedOut;
            this.isDead = !!pkg.isDead;

            if (pkg.kills !== undefined) this.kills = pkg.kills;
            if (pkg.deaths !== undefined) this.deaths = pkg.deaths;
            if (pkg.damage !== undefined) this.damage = pkg.damage;
            if (pkg.score !== undefined) this.score = pkg.score;
            if (pkg.ping !== undefined) this.ping = pkg.ping;

            if (hpChanged) this.updateNameplate();
        }

        update(dt) {
            // Smooth lerp movement (prevents stutter / jitter)
            const lerpFactor = Math.min(1.0, dt * 14.0);
            this.x += (this.targetX - this.x) * lerpFactor;
            this.y += (this.targetY - this.y) * lerpFactor;
            this.z += (this.targetZ - this.z) * lerpFactor;

            // Shortest angle lerp for rotation
            this.heading = lerpAngle(this.heading, this.targetHeading, lerpFactor);
            this.turretYaw = lerpAngle(this.turretYaw, this.targetTurretYaw, lerpFactor * 1.2);
            this.gunElevation += (this.targetGunElevation - this.gunElevation) * lerpFactor;

            this.rootGroup.position.set(this.x, this.y, this.z);

            // Apply to model components
            if (this.mode === 'tank' && this.tankModel) {
                if (this.tankModel.tankRoot) {
                    this.tankModel.tankRoot.rotation.y = this.heading;
                }
                // Infer tank hull pitch & roll locally from terrain height under road wheels
                if (this.tankModel.hullGroup && this.tankModel.roadWheelStations && typeof window.getTerrainHeight === 'function') {
                    const stations = this.tankModel.roadWheelStations;
                    const leftStations = stations.left || [];
                    const rightStations = stations.right || [];
                    const stationCount = leftStations.length + rightStations.length;
                    if (stationCount > 0) {
                        const cosH = Math.cos(this.heading);
                        const sinH = Math.sin(this.heading);
                        let sumH = 0, sumX = 0, sumZ = 0, sumXX = 0, sumZZ = 0, sumXH = 0, sumZH = 0;
                        for (const sideStations of [leftStations, rightStations]) {
                            for (const st of sideStations) {
                                const wx = this.x + st.x * cosH + st.z * sinH;
                                const wz = this.z - st.x * sinH + st.z * cosH;
                                const h = window.getTerrainHeight(wx, wz);
                                sumH += h;
                                sumX += st.x;
                                sumZ += st.z;
                                sumXX += st.x * st.x;
                                sumZZ += st.z * st.z;
                                sumXH += st.x * h;
                                sumZH += st.z * h;
                            }
                        }
                        const varX = sumXX - (sumX * sumX) / stationCount;
                        const varZ = sumZZ - (sumZ * sumZ) / stationCount;
                        const covXH = sumXH - (sumX * sumH) / stationCount;
                        const covZH = sumZH - (sumZ * sumH) / stationCount;
                        const targetRoll = Math.atan(varX > 0.001 ? covXH / varX : 0);
                        const targetPitch = Math.atan(varZ > 0.001 ? covZH / varZ : 0);
                        this.pitchVel += ((targetPitch - this.pitch) * 40 - this.pitchVel * 8.5) * dt;
                        this.pitch += this.pitchVel * dt;
                        this.rollVel += ((targetRoll - this.roll) * 44 - this.rollVel * 9) * dt;
                        this.roll += this.rollVel * dt;
                        this.tankModel.hullGroup.rotation.x = -this.pitch;
                        this.tankModel.hullGroup.rotation.z = this.roll;
                    }
                }
                if (this.tankModel.turretGroup) {
                    this.tankModel.turretGroup.rotation.y = this.turretYaw;
                }
                if (this.tankModel.gunElevationPivot) {
                    this.tankModel.gunElevationPivot.rotation.x = this.gunElevation;
                }
                if (typeof this.tankModel.updateTracksGeometry === 'function' && Math.abs(this.speed) > 0.05) {
                    this.tankModel.updateTracksGeometry(this.speed * dt, this.speed * dt);
                }
            } else if (this.mode === 'soldier' && this.soldierRig) {
                const rig = this.soldierRig;
                if (rig.root) {
                    rig.root.rotation.y = this.heading;
                    rig.root.rotation.x = this.isDead ? -Math.PI * 0.48 : 0;
                }
                if (!this.isDead) {
                    this.animTime += dt;
                    const absSpeed = Math.abs(this.speed || 0);
                    const isMoving = absSpeed > 0.15;
                    const isSprinting = absSpeed > 5.2;
                    const seaLvl = (typeof window.SEA_LEVEL === 'number') ? window.SEA_LEVEL : -2.5;
                    const groundY = (typeof window.getTerrainHeight === 'function') ? window.getTerrainHeight(this.x, this.z) : this.y;
                    const isSwimming = groundY < seaLvl - 0.5 && this.y <= seaLvl + 0.35;
                    const isAirborne = !isSwimming && typeof window.getTerrainHeight === 'function' && (this.y - groundY) > 0.25;

                    if (rig.rightLeg && rig.leftLeg && rig.hips) {
                        const lerpVal = (a, b, t) => a + (b - a) * Math.min(1, t);
                        if (isSwimming) {
                            if (isMoving) {
                                const swim = this.animTime * (isSprinting ? 9.5 : 6.5);
                                const kick = Math.sin(swim);
                                rig.rightLeg.hipJoint.rotation.x = lerpVal(rig.rightLeg.hipJoint.rotation.x, 0.45 + kick * 0.38, dt * 12);
                                rig.leftLeg.hipJoint.rotation.x = lerpVal(rig.leftLeg.hipJoint.rotation.x, 0.45 - kick * 0.38, dt * 12);
                                rig.rightLeg.kneeJoint.rotation.x = lerpVal(rig.rightLeg.kneeJoint.rotation.x, 0.25 + Math.max(0, -kick * 0.45), dt * 12);
                                rig.leftLeg.kneeJoint.rotation.x = lerpVal(rig.leftLeg.kneeJoint.rotation.x, 0.25 + Math.max(0, kick * 0.45), dt * 12);
                            } else {
                                const tread = Math.sin(this.animTime * 2.8);
                                rig.rightLeg.hipJoint.rotation.x = lerpVal(rig.rightLeg.hipJoint.rotation.x, 0.16 + tread * 0.16, dt * 8);
                                rig.leftLeg.hipJoint.rotation.x = lerpVal(rig.leftLeg.hipJoint.rotation.x, 0.16 - tread * 0.16, dt * 8);
                                rig.rightLeg.kneeJoint.rotation.x = lerpVal(rig.rightLeg.kneeJoint.rotation.x, 0.35 + Math.abs(tread) * 0.25, dt * 8);
                                rig.leftLeg.kneeJoint.rotation.x = lerpVal(rig.leftLeg.kneeJoint.rotation.x, 0.35 + Math.abs(tread) * 0.25, dt * 8);
                            }
                            rig.hips.position.y = 0.95;
                        } else if (isAirborne) {
                            rig.rightLeg.hipJoint.rotation.x = lerpVal(rig.rightLeg.hipJoint.rotation.x, -0.42, dt * 12);
                            rig.leftLeg.hipJoint.rotation.x = lerpVal(rig.leftLeg.hipJoint.rotation.x, -0.32, dt * 12);
                            rig.rightLeg.kneeJoint.rotation.x = lerpVal(rig.rightLeg.kneeJoint.rotation.x, 0.55, dt * 12);
                            rig.leftLeg.kneeJoint.rotation.x = lerpVal(rig.leftLeg.kneeJoint.rotation.x, 0.40, dt * 12);
                            rig.hips.position.y = lerpVal(rig.hips.position.y, 0.98, dt * 12);
                        } else if (isMoving) {
                            const walk = this.animTime * (isSprinting ? 6.2 : 4.4);
                            const strideAmp = isSprinting ? 0.65 : 0.45;
                            const stride = Math.sin(walk);
                            rig.rightLeg.hipJoint.rotation.x = lerpVal(rig.rightLeg.hipJoint.rotation.x, stride * strideAmp, 0.35);
                            rig.leftLeg.hipJoint.rotation.x = lerpVal(rig.leftLeg.hipJoint.rotation.x, -stride * strideAmp, 0.35);
                            rig.rightLeg.kneeJoint.rotation.x = lerpVal(rig.rightLeg.kneeJoint.rotation.x, Math.max(0.1, -Math.cos(walk) * strideAmp * 1.3), 0.35);
                            rig.leftLeg.kneeJoint.rotation.x = lerpVal(rig.leftLeg.kneeJoint.rotation.x, Math.max(0.1, Math.cos(walk) * strideAmp * 1.3), 0.35);
                            rig.hips.position.y = 0.95 + Math.abs(Math.cos(walk)) * 0.04;
                        } else {
                            rig.rightLeg.hipJoint.rotation.x = lerpVal(rig.rightLeg.hipJoint.rotation.x, -0.05, 0.15);
                            rig.leftLeg.hipJoint.rotation.x = lerpVal(rig.leftLeg.hipJoint.rotation.x, 0.06, 0.15);
                            rig.rightLeg.kneeJoint.rotation.x = lerpVal(rig.rightLeg.kneeJoint.rotation.x, 0.08, 0.15);
                            rig.leftLeg.kneeJoint.rotation.x = lerpVal(rig.leftLeg.kneeJoint.rotation.x, 0.08, 0.15);
                            rig.hips.position.y = 0.95;
                        }
                    }

                    if (rig.torso && rig.head) {
                        rig.torso.rotation.y = -0.40;
                        rig.head.rotation.y = 0.40;
                        rig.torso.rotation.x = isSwimming ? (isMoving ? -0.42 : -0.08) : 0;
                        rig.head.rotation.x = isSwimming ? (isMoving ? 0.36 : 0.07) : 0;
                    }

                    if (this.grenadeAnimTimer > 0 && rig.rightArm && rig.rightArm.shoulder && rig.rightArm.elbow) {
                        this.grenadeAnimTimer = Math.max(0, this.grenadeAnimTimer - dt);
                        const p = 1.0 - (this.grenadeAnimTimer / 0.40);
                        const lift = Math.sin(p * Math.PI);
                        rig.rightArm.shoulder.rotation.set(-0.65 - lift * 1.55, 0.12, 0.60 - lift * 0.45);
                        rig.rightArm.elbow.rotation.set(-2.20 + lift * 0.50, 0, 0);
                        if (rig.rightArm.wrist) rig.rightArm.wrist.rotation.set(0, 0, 0);
                    } else if (typeof window.poseSoldierWeapon === 'function' && rig.rifle) {
                        if (rig.rightArm && rig.rightArm.wrist && rig.rifle.parent !== rig.rightArm.wrist && typeof rig.rightArm.wrist.attach === 'function') {
                            rig.rightArm.wrist.attach(rig.rifle);
                        }
                        const aimDir = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
                        window.poseSoldierWeapon(rig, aimDir, this.heading);
                    }
                }
            }
        }

        dispose() {
            if (this.rootGroup && this.rootGroup.parent) {
                this.rootGroup.parent.remove(this.rootGroup);
            }
            if (this.nameplateTexture) this.nameplateTexture.dispose();
        }
    }

    function q1(v) { return Math.round((v || 0) * 10) / 10; }
    function q2(v) { return Math.round((v || 0) * 100) / 100; }

    function lerpAngle(a, b, t) {
        let diff = (b - a) % (Math.PI * 2);
        if (diff < -Math.PI) diff += Math.PI * 2;
        if (diff > Math.PI) diff -= Math.PI * 2;
        return a + diff * t;
    }

    function roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    // 4. Main Network Manager
    const NetworkManager = {
        init() {
            this.bindUI();
            this.setupKeybindings();
        },

        // --- Host Session ---
        hostGame(customCode = null, mode = 'coop') {
            if (netState.peer) this.disconnect();

            const code = customCode || generateRoomCode();
            const peerId = sanitizePeerId(code);

            netState.roomCode = code;
            netState.isHost = true;
            netState.gameMode = mode;
            netState.isActive = false;

            this.updateStatusBanner(`Creating Room [${code}] via Google STUN...`, '#38bdf8');

            try {
                if (typeof Peer === 'undefined') {
                    throw new Error('PeerJS library not loaded.');
                }
                const peer = new Peer(peerId, GOOGLE_STUN_CONFIG);
                netState.peer = peer;

                peer.on('open', (id) => {
                    netState.peerId = id;
                    netState.isActive = true;
                    this.updateStatusBanner(`Hosting ${mode.toUpperCase()} on [${code}] - Waiting for players...`, '#10b981');
                    this.refreshLobbyModal();
                    this.showNotice(`Room ${code} created! Share this code with friends.`);
                });

                peer.on('connection', (conn) => {
                    this.handleIncomingClient(conn);
                });

                peer.on('error', (err) => {
                    console.error('[Multiplayer Host Error]', err);
                    if (err.type === 'unavailable-id') {
                        // Retry with a new room code
                        this.hostGame(generateRoomCode(), mode);
                    } else {
                        this.updateStatusBanner(`Host error: ${err.message || err.type}`, '#ef4444');
                    }
                });

                peer.on('disconnected', () => {
                    this.updateStatusBanner('Disconnected from signaling relay.', '#f59e0b');
                });
            } catch (e) {
                console.error('[Multiplayer] Failed to initialize peer:', e);
                this.updateStatusBanner(`Initialization failed: ${e.message}`, '#ef4444');
            }
        },

        // --- Join Session ---
        joinGame(rawCode) {
            if (!rawCode || !rawCode.trim()) {
                this.showNotice('Please enter a valid Host Room Code!');
                return;
            }

            if (netState.peer) this.disconnect();

            const cleanCode = rawCode.trim().toUpperCase();
            const targetPeerId = sanitizePeerId(cleanCode);

            netState.roomCode = cleanCode;
            netState.isHost = false;
            netState.isActive = false;

            this.updateStatusBanner(`Connecting to Room [${cleanCode}]...`, '#38bdf8');

            try {
                if (typeof Peer === 'undefined') {
                    throw new Error('PeerJS library not loaded.');
                }
                const peer = new Peer(GOOGLE_STUN_CONFIG);
                netState.peer = peer;

                peer.on('open', (myId) => {
                    netState.peerId = myId;
                    const conn = peer.connect(targetPeerId, { reliable: true });
                    netState.hostConn = conn;

                    conn.on('open', () => {
                        netState.isActive = true;
                        this.updateStatusBanner(`Connected to [${cleanCode}]!`, '#10b981');

                        // Send handshake
                        conn.send({
                            type: 'join',
                            name: netState.callsign,
                            tankType: window.currentTankId || 'tiger',
                            soldierType: window.currentSoldierType || 'rifle'
                        });

                        this.refreshLobbyModal();
                        this.closeModal('multiplayer-modal');
                        this.showNotice(`Joined room ${cleanCode}! Press [TAB] for scoreboard.`);
                    });

                    conn.on('data', (data) => {
                        this.handlePacket(data, conn.peer);
                    });

                    conn.on('close', () => {
                        this.showNotice('Disconnected from Host.');
                        this.disconnect();
                    });

                    conn.on('error', (err) => {
                        console.error('[Connection Error]', err);
                        this.updateStatusBanner('Connection error: ' + (err.message || 'Host not found'), '#ef4444');
                    });
                });

                peer.on('error', (err) => {
                    console.error('[Peer Join Error]', err);
                    this.updateStatusBanner(`Join failed: ${err.type === 'peer-unavailable' ? 'Room not found. Check code.' : err.message}`, '#ef4444');
                });
            } catch (e) {
                console.error('[Multiplayer Join Error]', e);
                this.updateStatusBanner(`Connection error: ${e.message}`, '#ef4444');
            }
        },

        handleIncomingClient(conn) {
            conn.on('open', () => {
                netState.clientConns.set(conn.peer, conn);

                // Send Welcome packet with game mode, room configuration, world seed/zone, and active world state
                const hostZone = (window.ALL_ZONES && typeof window.spawnZoneIndex === 'number' && window.ALL_ZONES[window.spawnZoneIndex])
                    ? window.ALL_ZONES[window.spawnZoneIndex]
                    : (window.currentZone || 'meadow');
                const fallenTrees = [];
                if (window.sessionFallenTrees && typeof window.sessionFallenTrees.forEach === 'function') {
                    window.sessionFallenTrees.forEach((tid) => {
                        const meta = window.sessionFallenTreesMeta && window.sessionFallenTreesMeta.get(tid);
                        fallenTrees.push([tid, meta ? q2(meta.dx) : 0, meta ? q2(meta.dz) : 1]);
                    });
                }
                const enemies = Array.isArray(window.activeEnemyTanks)
                    ? window.activeEnemyTanks.filter(Boolean).map((e) => [
                        e.id, e.tankType, q1(e.x), q1(e.y), q1(e.z), q2(e.heading), e.armor, !!e.isDestroyed
                    ])
                    : [];
                const soldiers = Array.isArray(window.activeSoldiers)
                    ? window.activeSoldiers.filter((s) => s && !s.isDead).map((s) => [
                        s.id, s.faction, q1(s.x), q1(s.z), q2(s.heading), s.soldierType, s.escortTank ? s.escortTank.id : null
                    ])
                    : [];
                conn.send({
                    type: 'welcome',
                    roomCode: netState.roomCode,
                    gameMode: netState.gameMode,
                    hostName: netState.callsign,
                    hostTank: window.currentTankId || 'tiger',
                    hostSoldier: window.currentSoldierType || 'rifle',
                    worldSeed: window.currentSeed,
                    worldZone: hostZone,
                    fallenTrees,
                    enemies,
                    soldiers
                });

                this.refreshLobbyModal();
            });

            conn.on('data', (data) => {
                this.handlePacket(data, conn.peer);

                // Host relays packets to other clients (Star Topology)
                if (netState.isHost && data.type !== 'ping' && data.type !== 'pong') {
                    this.relayToOthers(data, conn.peer);
                }
            });

            conn.on('close', () => {
                const rp = netState.remotePlayers.get(conn.peer);
                if (rp) {
                    this.showNotice(`${rp.name} left the battle.`);
                    rp.dispose();
                    netState.remotePlayers.delete(conn.peer);
                }
                netState.clientConns.delete(conn.peer);
                this.refreshLobbyModal();
                this.updateScoreboardUI();
            });
        },

        relayToOthers(data, senderPeerId) {
            netState.clientConns.forEach((clientConn, id) => {
                if (id !== senderPeerId && clientConn.open) {
                    clientConn.send(data);
                }
            });
        },

        broadcast(data) {
            if (!netState.isActive) return;
            if (netState.isHost) {
                netState.clientConns.forEach((conn) => {
                    if (conn.open) conn.send(data);
                });
            } else if (netState.hostConn && netState.hostConn.open) {
                netState.hostConn.send(data);
            }
        },

        handlePacket(pkg, senderId) {
            if (!pkg || !pkg.type) return;

            switch (pkg.type) {
                case 'welcome':
                    netState.gameMode = pkg.gameMode || 'coop';
                    this.getOrCreateRemotePlayer(senderId, pkg.hostName, true);
                    if (pkg.worldSeed !== undefined && pkg.worldSeed !== null && typeof window.restartGame === 'function') {
                        window.restartGame(pkg.worldSeed, pkg.worldZone);
                    }
                    if (Array.isArray(pkg.fallenTrees) && typeof window.applyRemoteTreeHit === 'function') {
                        pkg.fallenTrees.forEach((ft) => {
                            if (ft && ft.length >= 3) window.applyRemoteTreeHit(ft[0], ft[1], ft[2], 3.5);
                        });
                    }
                    if (Array.isArray(pkg.enemies) && typeof window.spawnRemoteEnemyTank === 'function') {
                        if (typeof window.resetEnemyTanks === 'function') window.resetEnemyTanks();
                        pkg.enemies.forEach((en) => {
                            if (en && en.length >= 8) {
                                window.spawnRemoteEnemyTank(en[0], en[1], en[2], en[3], en[4], en[5], en[6], en[7]);
                            }
                        });
                    }
                    if (Array.isArray(pkg.soldiers) && typeof window.spawnRemoteSoldier === 'function') {
                        if (typeof window.clearSoldiers === 'function') window.clearSoldiers();
                        pkg.soldiers.forEach((sl) => {
                            if (sl && sl.length >= 6) {
                                window.spawnRemoteSoldier(sl[0], sl[1], sl[2], sl[3], sl[4], sl[5], sl[6]);
                            }
                        });
                    }
                    this.showNotice(`Mode: ${netState.gameMode.toUpperCase()} | Host: ${pkg.hostName}`);
                    this.updateScoreboardUI();
                    break;

                case 'join':
                    const newPlayer = this.getOrCreateRemotePlayer(senderId, pkg.name, false);
                    this.showNotice(`${pkg.name} joined the battle!`);
                    this.refreshLobbyModal();
                    this.updateScoreboardUI();
                    break;

                case 'state':
                    const rp = this.getOrCreateRemotePlayer(pkg.id || senderId, pkg.name);
                    rp.applyState(pkg);
                    break;

                case 'fire_cannon':
                    this.onRemoteFireCannon(pkg);
                    break;

                case 'fire_mg':
                    this.onRemoteFireMG(pkg);
                    break;

                case 'fire_mortar':
                    this.onRemoteFireMortar(pkg);
                    break;

                case 'fire_rocket':
                    this.onRemoteFireRocket(pkg);
                    break;

                case 'fire_grenade':
                    this.onRemoteFireGrenade(pkg);
                    break;

                case 'damage_player':
                    this.onDamageReceived(pkg);
                    break;

                case 'player_killed':
                    this.onPlayerKilledEvent(pkg);
                    break;

                case 'bot_killed':
                    this.onBotKilledEvent(pkg);
                    break;

                case 'env_tree_hit':
                    if (typeof window.applyRemoteTreeHit === 'function') {
                        window.applyRemoteTreeHit(pkg.id, pkg.dx, pkg.dz, pkg.f);
                    }
                    break;

                case 'enemy_spawn':
                    if (!netState.isHost) {
                        if (Array.isArray(pkg.t) && typeof window.spawnRemoteEnemyTank === 'function') {
                            pkg.t.forEach((en) => {
                                if (en && en.length >= 6) {
                                    window.spawnRemoteEnemyTank(en[0], en[1], en[2], en[3], en[4], en[5]);
                                }
                            });
                        }
                        if (Array.isArray(pkg.s) && typeof window.spawnRemoteSoldier === 'function') {
                            pkg.s.forEach((sl) => {
                                if (sl && sl.length >= 6) {
                                    window.spawnRemoteSoldier(sl[0], sl[1], sl[2], sl[3], sl[4], sl[5], sl[6]);
                                }
                            });
                        }
                    }
                    break;

                case 'enemies_sync':
                    if (!netState.isHost && typeof window.applyRemoteEnemySync === 'function') {
                        window.applyRemoteEnemySync(pkg.e);
                    }
                    break;

                case 'enemy_fire':
                    if (!netState.isHost && typeof window.applyRemoteEnemyFire === 'function') {
                        window.applyRemoteEnemyFire(pkg.id, pkg.pos, pkg.dir, pkg.spd);
                    }
                    break;

                case 'enemy_hit':
                    if (netState.isHost && typeof window.applyRemoteEnemyHit === 'function') {
                        window.applyRemoteEnemyHit(pkg.id, pkg.dmg, pkg.imp, pkg.dir);
                    }
                    break;

                case 'enemy_destroy':
                    if (!netState.isHost && typeof window.applyRemoteEnemyDestroy === 'function') {
                        window.applyRemoteEnemyDestroy(pkg.id, pkg.imp);
                    }
                    break;

                case 'enemy_despawn':
                    if (!netState.isHost && typeof window.applyRemoteEnemyDespawn === 'function') {
                        window.applyRemoteEnemyDespawn(pkg.id);
                    }
                    break;

                case 'soldiers_sync':
                    if (!netState.isHost && typeof window.applyRemoteSoldierSync === 'function') {
                        window.applyRemoteSoldierSync(pkg.s);
                    }
                    break;

                case 'soldier_hit':
                    if (netState.isHost && typeof window.applyRemoteSoldierHit === 'function') {
                        window.applyRemoteSoldierHit(pkg.id, pkg.dmg);
                    }
                    break;

                case 'soldier_kill':
                    if (!netState.isHost && typeof window.applyRemoteSoldierKill === 'function') {
                        window.applyRemoteSoldierKill(pkg.id);
                    }
                    break;

                case 'soldier_fire':
                    if (!netState.isHost && typeof window.applyRemoteSoldierFire === 'function') {
                        window.applyRemoteSoldierFire(pkg.id, pkg.w, pkg.pos, pkg.dir);
                    }
                    break;

                case 'ping':
                    // Send pong back
                    if (netState.isHost && netState.clientConns.has(senderId)) {
                        netState.clientConns.get(senderId).send({ type: 'pong', time: pkg.time });
                    } else if (!netState.isHost && netState.hostConn) {
                        netState.hostConn.send({ type: 'pong', time: pkg.time });
                    }
                    break;

                case 'pong':
                    if (pkg.time) {
                        netState.stats.ping = Math.round(performance.now() - pkg.time);
                    }
                    break;
            }
        },

        getOrCreateRemotePlayer(id, name, isHost = false) {
            if (!netState.remotePlayers.has(id)) {
                const rp = new RemotePlayer(id, name, isHost);
                netState.remotePlayers.set(id, rp);
                this.updateScoreboardUI();
            }
            const player = netState.remotePlayers.get(id);
            let nameplateDirty = false;
            if (isHost && !player.isHost) {
                player.isHost = true;
                nameplateDirty = true;
            }
            if (name && player.name !== name) {
                player.name = name;
                nameplateDirty = true;
            }
            if (nameplateDirty) {
                player.updateNameplate();
            }
            return player;
        },

        // --- Weapon Fire Synchronizations ---
        sendFireCannon(muzzlePos, dir, shellVel, blastRadius, blastDamage, cannonDamage, tankType) {
            this.broadcast({
                type: 'fire_cannon',
                shooterId: netState.peerId,
                shooterName: netState.callsign,
                pos: { x: muzzlePos.x, y: muzzlePos.y, z: muzzlePos.z },
                dir: { x: dir.x, y: dir.y, z: dir.z },
                shellVel,
                blastRadius,
                blastDamage,
                cannonDamage,
                tankType: tankType || window.currentTankId || 'tiger'
            });
        },

        onRemoteFireCannon(pkg) {
            if (!window.scene || (pkg.shooterId && pkg.shooterId === netState.peerId)) return;
            const pos = new THREE.Vector3(pkg.pos.x, pkg.pos.y, pkg.pos.z);
            const dir = new THREE.Vector3(pkg.dir.x, pkg.dir.y, pkg.dir.z).normalize();
            const speed = pkg.shellVel || 810;

            // Directional Audio
            if (window.soundFX && typeof window.soundFX.playMainCannon === 'function') {
                const spec = (window.TANK_SPECS && window.TANK_SPECS[pkg.tankType]) || { id: pkg.tankType };
                window.soundFX.playMainCannon(spec, pos);
            }

            // Spawn projectile locally
            if (typeof window.spawnEnemyShell === 'function') {
                // If PvP, mark as hostile projectile; never re-broadcast remote fire
                const isHostile = (netState.gameMode === 'pvp');
                window.spawnEnemyShell(pos, dir, speed, {
                    tankType: pkg.tankType,
                    spec: {
                        id: pkg.tankType,
                        blastRadius: pkg.blastRadius || 8.0,
                        blastDamage: pkg.blastDamage || 100,
                        cannonDamage: pkg.cannonDamage || 2
                    }
                }, { isEnemy: isHostile, isRemote: true });
            }
        },

        sendFireMG(muzzlePos, dir) {
            this.broadcast({
                type: 'fire_mg',
                shooterId: netState.peerId,
                pos: { x: muzzlePos.x, y: muzzlePos.y, z: muzzlePos.z },
                dir: { x: dir.x, y: dir.y, z: dir.z }
            });
        },

        onRemoteFireMG(pkg) {
            if (pkg.shooterId && pkg.shooterId === netState.peerId) return;
            const pos = new THREE.Vector3(pkg.pos.x, pkg.pos.y, pkg.pos.z);
            const dir = new THREE.Vector3(pkg.dir.x, pkg.dir.y, pkg.dir.z).normalize();

            if (window.soundFX && typeof window.soundFX.playCoaxMG === 'function') {
                window.soundFX.playCoaxMG(pos);
            }

            if (typeof window.spawnTracerRound === 'function') {
                const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
                window.spawnTracerRound(pos, dir, quat, netState.gameMode === 'pvp', { isRemote: true });
            }
        },

        sendFireMortar(muzzlePos, dir) {
            this.broadcast({
                type: 'fire_mortar',
                shooterId: netState.peerId,
                pos: { x: muzzlePos.x, y: muzzlePos.y, z: muzzlePos.z },
                dir: { x: dir.x, y: dir.y, z: dir.z }
            });
        },

        onRemoteFireMortar(pkg) {
            if (pkg.shooterId && pkg.shooterId === netState.peerId) return;
            const pos = new THREE.Vector3(pkg.pos.x, pkg.pos.y, pkg.pos.z);
            const dir = new THREE.Vector3(pkg.dir.x, pkg.dir.y, pkg.dir.z).normalize();
            if (typeof window.spawnPlayerMortarShell === 'function') {
                window.spawnPlayerMortarShell(pos, dir, { isEnemy: netState.gameMode === 'pvp', isRemote: true });
            }
        },

        sendFireRocket(muzzlePos, dir) {
            this.broadcast({
                type: 'fire_rocket',
                shooterId: netState.peerId,
                pos: { x: muzzlePos.x, y: muzzlePos.y, z: muzzlePos.z },
                dir: { x: dir.x, y: dir.y, z: dir.z }
            });
        },

        onRemoteFireRocket(pkg) {
            if (pkg.shooterId && pkg.shooterId === netState.peerId) return;
            const pos = new THREE.Vector3(pkg.pos.x, pkg.pos.y, pkg.pos.z);
            const dir = new THREE.Vector3(pkg.dir.x, pkg.dir.y, pkg.dir.z).normalize();
            if (typeof window.spawnPlayerRocket === 'function') {
                window.spawnPlayerRocket(pos, dir, { isEnemy: netState.gameMode === 'pvp', isRemote: true });
            }
        },

        sendFireGrenade(pos, vel) {
            if (!netState.isActive || !pos || !vel) return;
            this.broadcast({
                type: 'fire_grenade',
                shooterId: netState.peerId,
                pos: { x: q2(pos.x), y: q2(pos.y), z: q2(pos.z) },
                vel: { x: q2(vel.x), y: q2(vel.y), z: q2(vel.z) }
            });
        },

        onRemoteFireGrenade(pkg) {
            if (pkg.shooterId && pkg.shooterId === netState.peerId) return;
            const rp = pkg.shooterId ? netState.remotePlayers.get(pkg.shooterId) : null;
            if (rp) rp.grenadeAnimTimer = 0.40;
            if (typeof window.spawnRemoteGrenade === 'function') {
                window.spawnRemoteGrenade(pkg.pos, pkg.vel, netState.gameMode === 'pvp');
            }
        },

        // --- PvP Damage & Elimination Handling ---
        sendDamageToPlayer(targetId, damage, impactPos) {
            if (netState.gameMode !== 'pvp') return;
            this.broadcast({
                type: 'damage_player',
                targetId,
                shooterId: netState.peerId,
                shooterName: netState.callsign,
                damage,
                impactPos: impactPos ? { x: impactPos.x, y: impactPos.y, z: impactPos.z } : null
            });

            netState.stats.damage += (damage * 50);
            netState.stats.score += (damage * 25);
            this.updateScoreboardUI();
        },

        onDamageReceived(pkg) {
            // Check if this damage was directed at local player
            if (pkg.targetId !== netState.peerId) return;

            const dmg = pkg.damage || 1;
            const impact = pkg.impactPos ? new THREE.Vector3(pkg.impactPos.x, pkg.impactPos.y, pkg.impactPos.z) : null;

            if (window.playerMode === 'soldier' && window.playerSoldier && typeof window.playerSoldier.takeDamage === 'function') {
                window.playerSoldier.takeDamage(dmg * 40);
                if (window.playerSoldier.health <= 0) {
                    this.broadcastPlayerKilled(pkg.shooterId, pkg.shooterName, 'Infantry Rifle');
                }
            } else if (typeof window.onPlayerHit === 'function') {
                window.onPlayerHit(dmg, impact);
                if (window.tankState && window.tankState.playerArmor <= 0) {
                    this.broadcastPlayerKilled(pkg.shooterId, pkg.shooterName, 'Tank Cannon');
                }
            }
        },

        broadcastPlayerKilled(killerId, killerName, weapon) {
            netState.stats.deaths += 1;
            this.broadcast({
                type: 'player_killed',
                victimId: netState.peerId,
                victimName: netState.callsign,
                killerId,
                killerName,
                weapon: weapon || 'Armor Piercing Shell'
            });
            this.updateScoreboardUI();
        },

        onPlayerKilledEvent(pkg) {
            if (pkg.killerId === netState.peerId) {
                netState.stats.kills += 1;
                netState.stats.score += 200;
                this.showNotice(`🎯 YOU DESTROYED ${pkg.victimName}! (+200 PTS)`, '#10b981');
            } else {
                this.showNotice(`💥 ${pkg.killerName} DESTROYED ${pkg.victimName}!`, '#f59e0b');
            }
            this.updateScoreboardUI();
        },

        // --- Co-op Bot Sync ---
        broadcastBotKilled(botId, reward) {
            if (netState.gameMode !== 'coop' || !netState.isActive) return;
            this.broadcast({
                type: 'bot_killed',
                botId,
                killerName: netState.callsign,
                reward: reward || 500
            });
            netState.stats.kills += 1;
            netState.stats.score += (reward || 500);
            this.updateScoreboardUI();
        },

        onBotKilledEvent(pkg) {
            this.showNotice(`🤝 [CO-OP] ${pkg.killerName} destroyed target (+$${pkg.reward})!`, '#38bdf8');
            this.updateScoreboardUI();
        },

        // --- Low-Traffic Environment & Host-Authoritative AI Sync ---
        sendTreeHit(id, dx, dz, force) {
            if (!netState.isActive || !id) return;
            this.broadcast({
                type: 'env_tree_hit',
                id,
                dx: q2(dx),
                dz: q2(dz),
                f: q1(force)
            });
        },

        sendEnemyPlatoonSpawn(tanks, soldiers) {
            if (!netState.isActive || !netState.isHost) return;
            const t = Array.isArray(tanks) ? tanks.map((e) => [
                e.id, e.tankType, q1(e.x), q1(e.y), q1(e.z), q2(e.heading)
            ]) : [];
            const s = Array.isArray(soldiers) ? soldiers.map((sl) => [
                sl.id, sl.faction, q1(sl.x), q1(sl.z), q2(sl.heading), sl.soldierType, sl.escortTank ? sl.escortTank.id : null
            ]) : [];
            if (t.length === 0 && s.length === 0) return;
            this.broadcast({ type: 'enemy_spawn', t, s });
        },

        sendEnemyFire(id, muzzlePos, fireDir, speed) {
            if (!netState.isActive || !netState.isHost || !id) return;
            this.broadcast({
                type: 'enemy_fire',
                id,
                pos: { x: q2(muzzlePos.x), y: q2(muzzlePos.y), z: q2(muzzlePos.z) },
                dir: { x: q2(fireDir.x), y: q2(fireDir.y), z: q2(fireDir.z) },
                spd: Math.round(speed || 750)
            });
        },

        sendEnemyHit(id, dmg, impactPos, hitDir) {
            if (!netState.isActive || netState.isHost || !id) return;
            this.broadcast({
                type: 'enemy_hit',
                id,
                dmg,
                imp: impactPos ? { x: q1(impactPos.x), y: q1(impactPos.y), z: q1(impactPos.z) } : null,
                dir: hitDir ? { x: q2(hitDir.x), y: q2(hitDir.y), z: q2(hitDir.z) } : null
            });
        },

        sendEnemyDestroy(id, impactPos) {
            if (!netState.isActive || !netState.isHost || !id) return;
            this.broadcast({
                type: 'enemy_destroy',
                id,
                imp: impactPos ? { x: q1(impactPos.x), y: q1(impactPos.y), z: q1(impactPos.z) } : null
            });
        },

        sendEnemyDespawn(id) {
            if (!netState.isActive || !netState.isHost || !id) return;
            netState.lastEnemySyncSnapshot.delete(id);
            this.broadcast({ type: 'enemy_despawn', id });
        },

        sendSoldierHit(id, dmg) {
            if (!netState.isActive || netState.isHost || !id) return;
            this.broadcast({ type: 'soldier_hit', id, dmg });
        },

        sendSoldierKill(id) {
            if (!netState.isActive || !netState.isHost || !id) return;
            netState.lastSoldierSyncSnapshot.delete(id);
            this.broadcast({ type: 'soldier_kill', id });
        },

        sendSoldierFire(id, w, muzzlePos, fireDir) {
            if (!netState.isActive || !netState.isHost || !id || !muzzlePos || !fireDir) return;
            this.broadcast({
                type: 'soldier_fire',
                id,
                w: w || 'r',
                pos: { x: q2(muzzlePos.x), y: q2(muzzlePos.y), z: q2(muzzlePos.z) },
                dir: { x: q2(fireDir.x), y: q2(fireDir.y), z: q2(fireDir.z) }
            });
        },

        sendEnemyDeltaSync() {
            const list = window.activeEnemyTanks;
            if (!Array.isArray(list) || list.length === 0) return;
            const changed = [];
            for (let i = 0; i < list.length; i++) {
                const e = list[i];
                if (!e || e.isDestroyed) continue;
                const row = [e.id, q1(e.x), q1(e.y), q1(e.z), q2(e.heading), q2(e.turretYaw), q2(e.gunElevation), e.armor];
                const prev = netState.lastEnemySyncSnapshot.get(e.id);
                if (!prev || prev[1] !== row[1] || prev[2] !== row[2] || prev[3] !== row[3] ||
                    prev[4] !== row[4] || prev[5] !== row[5] || prev[6] !== row[6] || prev[7] !== row[7]) {
                    netState.lastEnemySyncSnapshot.set(e.id, row);
                    changed.push(row);
                }
            }
            if (changed.length > 0) {
                this.broadcast({ type: 'enemies_sync', e: changed });
            }
        },

        sendSoldierDeltaSync() {
            const list = window.activeSoldiers;
            if (!Array.isArray(list) || list.length === 0) return;
            const changed = [];
            for (let i = 0; i < list.length; i++) {
                const s = list[i];
                if (!s || s.isDead) continue;
                const row = [s.id, q1(s.x), q1(s.y), q1(s.z), q2(s.heading)];
                const prev = netState.lastSoldierSyncSnapshot.get(s.id);
                if (!prev || Math.abs(prev[1] - row[1]) >= 0.2 || Math.abs(prev[3] - row[3]) >= 0.2 || Math.abs(prev[4] - row[4]) >= 0.1) {
                    netState.lastSoldierSyncSnapshot.set(s.id, row);
                    changed.push(row);
                }
            }
            if (changed.length > 0) {
                this.broadcast({ type: 'soldiers_sync', s: changed });
            }
        },

        // --- Simulation Per-Frame Loop ---
        update(dt) {
            // Update remote player models
            netState.remotePlayers.forEach((player) => {
                player.update(dt);
            });

            if (!netState.isActive) return;

            const now = performance.now();

            // Send local player state at 20 Hz (every 50 ms)
            if (now - netState.lastStateSendTime >= 50) {
                netState.lastStateSendTime = now;
                this.sendLocalState();
            }

            // Host-authoritative low-rate delta sync for AI enemies (5 Hz) & AI soldiers (4 Hz)
            if (netState.isHost) {
                if (now - netState.lastEnemySyncTime >= 200) {
                    netState.lastEnemySyncTime = now;
                    this.sendEnemyDeltaSync();
                }
                if (now - netState.lastSoldierSyncTime >= 250) {
                    netState.lastSoldierSyncTime = now;
                    this.sendSoldierDeltaSync();
                }
            }

            // Send ping packet every 2.5 seconds
            if (now - netState.lastPingSendTime >= 2500) {
                netState.lastPingSendTime = now;
                this.broadcast({ type: 'ping', time: now });
            }
        },

        sendLocalState() {
            let px = 0, py = 0, pz = 0, heading = 0, speed = 0, turretYaw = 0, gunElevation = 0;
            let armor = 4, maxArmor = 4, health = 100, maxHealth = 100;
            let isKO = false, isDead = false;

            const isSoldier = (window.playerMode === 'soldier' && window.playerSoldier);

            if (isSoldier) {
                const s = window.playerSoldier;
                px = s.x || 0;
                py = s.y || 0;
                pz = s.z || 0;
                heading = s.heading || 0;
                speed = s.speed || 0;
                health = s.health || 100;
                maxHealth = s.maxHealth || 100;
                isDead = !!window.playerIsDead;
            } else if (window.tankState) {
                const ts = window.tankState;
                px = ts.x || 0;
                py = ts.y || 0;
                pz = ts.z || 0;
                heading = ts.heading || 0;
                speed = ts.speed || 0;
                turretYaw = ts.turretYaw || 0;
                gunElevation = ts.gunElevation || 0;
                armor = ts.playerArmor !== undefined ? ts.playerArmor : 4;
                maxArmor = ts.maxArmor !== undefined ? ts.maxArmor : 4;
                isKO = !!ts.isKnockedOut;
                isDead = (ts.hasTank === false) || !!ts.isKnockedOut;
            }

            this.broadcast({
                type: 'state',
                id: netState.peerId,
                name: netState.callsign,
                mode: isSoldier ? 'soldier' : 'tank',
                tankType: window.currentTankId || 'tiger',
                soldierType: window.currentSoldierType || 'rifle',
                pos: { x: px, y: py, z: pz },
                heading,
                turretYaw,
                gunElevation,
                speed,
                armor,
                maxArmor,
                health,
                maxHealth,
                isKnockedOut: isKO,
                isDead,
                kills: netState.stats.kills,
                deaths: netState.stats.deaths,
                damage: netState.stats.damage,
                score: netState.stats.score,
                ping: netState.stats.ping
            });
        },

        disconnect() {
            if (netState.remotePlayers) {
                netState.remotePlayers.forEach((p) => p.dispose());
                netState.remotePlayers.clear();
            }
            if (netState.clientConns) {
                netState.clientConns.forEach((c) => c.close());
                netState.clientConns.clear();
            }
            if (netState.hostConn) {
                netState.hostConn.close();
                netState.hostConn = null;
            }
            if (netState.peer) {
                try { netState.peer.destroy(); } catch (e) {}
                netState.peer = null;
            }
            netState.isActive = false;
            netState.isHost = false;
            netState.roomCode = null;
            if (netState.lastEnemySyncSnapshot) netState.lastEnemySyncSnapshot.clear();
            if (netState.lastSoldierSyncSnapshot) netState.lastSoldierSyncSnapshot.clear();
            this.updateStatusBanner('Multiplayer Disconnected.', '#94a3b8');
            this.refreshLobbyModal();
            this.updateScoreboardUI();
        },

        // --- UI & Interaction Bindings ---
        bindUI() {
            // Multiplayer Lobby Open Button on Top HUD
            const btnMultiplayer = document.getElementById('btn-multiplayer');
            if (btnMultiplayer) {
                btnMultiplayer.addEventListener('click', () => {
                    this.openModal('multiplayer-modal');
                    this.refreshLobbyModal();
                });
            }

            // Scoreboard Open Button on Top HUD
            const btnScoreboard = document.getElementById('btn-scoreboard');
            if (btnScoreboard) {
                btnScoreboard.addEventListener('click', () => {
                    this.toggleScoreboard();
                });
            }

            // Close Modal Buttons
            const btnCloseLobby = document.getElementById('btn-mp-modal-close');
            if (btnCloseLobby) {
                btnCloseLobby.addEventListener('click', () => this.closeModal('multiplayer-modal'));
            }

            // Callsign Input & Randomize
            const callsignInput = document.getElementById('mp-callsign-input');
            if (callsignInput) {
                callsignInput.value = netState.callsign;
                callsignInput.addEventListener('input', (e) => {
                    const val = e.target.value.trim() || 'Soldier';
                    netState.callsign = val;
                    saveCallsign(val);
                });
            }

            const btnDiceCallsign = document.getElementById('btn-mp-dice-callsign');
            if (btnDiceCallsign && callsignInput) {
                btnDiceCallsign.addEventListener('click', () => {
                    const fresh = generateRandomCallsign();
                    callsignInput.value = fresh;
                    netState.callsign = fresh;
                    saveCallsign(fresh);
                });
            }

            // Tab Navigation: Host vs Join
            const tabBtnHost = document.getElementById('mp-tab-btn-host');
            const tabBtnJoin = document.getElementById('mp-tab-btn-join');
            const tabContentHost = document.getElementById('mp-tab-content-host');
            const tabContentJoin = document.getElementById('mp-tab-content-join');

            if (tabBtnHost && tabBtnJoin) {
                tabBtnHost.addEventListener('click', () => {
                    tabBtnHost.classList.add('active', 'border-amber-400', 'text-amber-300');
                    tabBtnJoin.classList.remove('active', 'border-amber-400', 'text-amber-300');
                    if (tabContentHost) tabContentHost.classList.remove('hidden');
                    if (tabContentJoin) tabContentJoin.classList.add('hidden');
                });
                tabBtnJoin.addEventListener('click', () => {
                    tabBtnJoin.classList.add('active', 'border-amber-400', 'text-amber-300');
                    tabBtnHost.classList.remove('active', 'border-amber-400', 'text-amber-300');
                    if (tabContentJoin) tabContentJoin.classList.remove('hidden');
                    if (tabContentHost) tabContentHost.classList.add('hidden');
                });
            }

            // Host Mode Selector Cards
            const cardModeCoop = document.getElementById('mp-mode-card-coop');
            const cardModePvP = document.getElementById('mp-mode-card-pvp');
            if (cardModeCoop && cardModePvP) {
                cardModeCoop.addEventListener('click', () => {
                    netState.gameMode = 'coop';
                    cardModeCoop.classList.add('border-emerald-400', 'bg-emerald-950/40');
                    cardModePvP.classList.remove('border-amber-400', 'bg-amber-950/40');
                });
                cardModePvP.addEventListener('click', () => {
                    netState.gameMode = 'pvp';
                    cardModePvP.classList.add('border-amber-400', 'bg-amber-950/40');
                    cardModeCoop.classList.remove('border-emerald-400', 'bg-emerald-950/40');
                });
            }

            // Host Create Button
            const btnStartHost = document.getElementById('btn-mp-start-host');
            if (btnStartHost) {
                btnStartHost.addEventListener('click', () => {
                    this.hostGame(null, netState.gameMode);
                });
            }

            // Copy Room Code Button
            const btnCopyCode = document.getElementById('btn-mp-copy-code');
            if (btnCopyCode) {
                btnCopyCode.addEventListener('click', () => {
                    if (netState.roomCode) {
                        navigator.clipboard.writeText(netState.roomCode).then(() => {
                            this.showNotice(`Room code ${netState.roomCode} copied to clipboard!`);
                        }).catch(() => {
                            this.showNotice(`Room Code: ${netState.roomCode}`);
                        });
                    }
                });
            }

            // Join Button
            const btnJoinServer = document.getElementById('btn-mp-join-server');
            const joinCodeInput = document.getElementById('mp-join-code-input');
            if (btnJoinServer && joinCodeInput) {
                btnJoinServer.addEventListener('click', () => {
                    this.joinGame(joinCodeInput.value);
                });
                joinCodeInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        this.joinGame(joinCodeInput.value);
                    }
                });
            }

            // Disconnect Button
            const btnDisconnect = document.getElementById('btn-mp-disconnect');
            if (btnDisconnect) {
                btnDisconnect.addEventListener('click', () => {
                    this.disconnect();
                });
            }

            // Scoreboard Overlay Close
            const scoreOverlay = document.getElementById('scoreboard-overlay');
            if (scoreOverlay) {
                scoreOverlay.addEventListener('click', (e) => {
                    if (e.target === scoreOverlay) {
                        this.toggleScoreboard(false);
                    }
                });
            }
        },

        setupKeybindings() {
            // Listen for [Tab] key to toggle scoreboard
            if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
                window.addEventListener('keydown', (e) => {
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        this.toggleScoreboard();
                    }
                });
            }
        },

        toggleScoreboard(forceState) {
            const overlay = document.getElementById('scoreboard-overlay');
            if (!overlay) return;

            const next = (forceState !== undefined) ? forceState : overlay.classList.contains('hidden');
            if (next) {
                overlay.classList.remove('hidden');
                if (typeof window.releaseGamePointerLock === 'function') {
                    window.releaseGamePointerLock();
                } else if (document.pointerLockElement) {
                    document.exitPointerLock();
                }
                this.updateScoreboardUI();
            } else {
                overlay.classList.add('hidden');
                if (typeof window.requestGamePointerLock === 'function') {
                    window.requestGamePointerLock();
                }
            }
        },

        updateScoreboardUI() {
            const tableBody = document.getElementById('scoreboard-table-body');
            const roomCodeBadge = document.getElementById('scoreboard-room-code');
            const modeBadge = document.getElementById('scoreboard-mode-badge');
            const playerCountBadge = document.getElementById('scoreboard-player-count');

            if (!tableBody) return;

            // Update Header Telemetry
            if (roomCodeBadge) {
                roomCodeBadge.textContent = netState.roomCode ? `ROOM: ${netState.roomCode}` : 'ROOM: LOCAL / SOLO';
            }
            if (modeBadge) {
                modeBadge.textContent = netState.gameMode === 'pvp' ? '⚔️ PVP CLASH' : '🤝 CO-OP TEAMPLAY';
                modeBadge.className = netState.gameMode === 'pvp'
                    ? 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-950/70 border border-red-500/50 text-red-300'
                    : 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/70 border border-emerald-500/50 text-emerald-300';
            }

            // Collate all participants
            const rows = [];

            // Local Player
            const localVehicle = (window.playerMode === 'soldier')
                ? 'Infantry'
                : ((window.TANK_SPECS && window.TANK_SPECS[window.currentTankId]?.shortName) || 'Tiger I');

            rows.push({
                name: netState.callsign,
                isLocal: true,
                isHost: netState.isHost,
                vehicle: localVehicle,
                mode: window.playerMode === 'soldier' ? 'Infantry' : 'Tank',
                kills: netState.stats.kills,
                deaths: netState.stats.deaths,
                damage: netState.stats.damage,
                score: netState.stats.score,
                ping: netState.stats.ping
            });

            // Remote Players
            netState.remotePlayers.forEach((rp) => {
                const vehicleName = (rp.mode === 'soldier')
                    ? 'Infantry'
                    : ((window.TANK_SPECS && window.TANK_SPECS[rp.tankType]?.shortName) || 'Tank');

                rows.push({
                    name: rp.name,
                    isLocal: false,
                    isHost: rp.isHost,
                    vehicle: vehicleName,
                    mode: rp.mode === 'soldier' ? 'Infantry' : 'Tank',
                    kills: rp.kills,
                    deaths: rp.deaths,
                    damage: rp.damage,
                    score: rp.score,
                    ping: rp.ping
                });
            });

            if (playerCountBadge) {
                playerCountBadge.textContent = `${rows.length} COMBATANT${rows.length === 1 ? '' : 'S'}`;
            }

            // Sort by score descending
            rows.sort((a, b) => b.score - a.score);

            // Render Table HTML
            tableBody.innerHTML = rows.map((p, idx) => {
                const rankColor = idx === 0 ? 'text-amber-400' : (idx === 1 ? 'text-slate-300' : 'text-amber-600');
                const rowBg = p.isLocal ? 'bg-amber-500/10 border-l-2 border-l-amber-400' : 'hover:bg-slate-800/40';
                const pingColor = p.ping < 60 ? 'text-emerald-400' : (p.ping < 140 ? 'text-amber-400' : 'text-red-400');
                const roleBadge = p.isLocal
                    ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">YOU</span>'
                    : (p.isHost ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">HOST</span>' : '');

                return `
                    <tr class="border-b border-white/5 transition-colors ${rowBg}">
                        <td class="py-2.5 px-3 font-bold mono ${rankColor}">#${idx + 1}</td>
                        <td class="py-2.5 px-3">
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-white">${p.name}</span>
                                ${roleBadge}
                            </div>
                        </td>
                        <td class="py-2.5 px-3 text-slate-300">${p.vehicle}</td>
                        <td class="py-2.5 px-3 font-bold text-emerald-400 mono">${p.kills}</td>
                        <td class="py-2.5 px-3 font-bold text-red-400 mono">${p.deaths}</td>
                        <td class="py-2.5 px-3 text-slate-300 mono">${p.damage}</td>
                        <td class="py-2.5 px-3 font-extrabold text-amber-300 mono">${p.score}</td>
                        <td class="py-2.5 px-3 mono font-semibold ${pingColor}">${p.ping > 0 ? p.ping + ' ms' : '--'}</td>
                    </tr>
                `;
            }).join('');
        },

        refreshLobbyModal() {
            const hostDisplay = document.getElementById('mp-host-code-display');
            const statusEl = document.getElementById('mp-status-label');
            const peerList = document.getElementById('mp-connected-peers-list');
            const btnStartHost = document.getElementById('btn-mp-start-host');

            if (hostDisplay) {
                hostDisplay.textContent = netState.roomCode || '----';
            }

            if (statusEl) {
                if (netState.isActive) {
                    statusEl.textContent = netState.isHost ? `Active (Hosting ${netState.gameMode.toUpperCase()})` : `Connected to ${netState.roomCode}`;
                    statusEl.className = 'text-xs font-bold text-emerald-400';
                } else {
                    statusEl.textContent = 'Disconnected / Standby';
                    statusEl.className = 'text-xs font-bold text-slate-400';
                }
            }

            if (btnStartHost) {
                btnStartHost.textContent = netState.isHost ? 'Regenerate Room Code' : 'Generate Room Code & Host';
            }

            if (peerList) {
                const peers = [];
                if (netState.isActive) {
                    peers.push(`👤 ${netState.callsign} (${netState.isHost ? 'Host' : 'Guest'}) [You]`);
                    netState.remotePlayers.forEach((rp) => {
                        peers.push(`👥 ${rp.name} (${rp.isHost ? 'Host' : 'Guest'})`);
                    });
                }
                peerList.innerHTML = peers.length > 0
                    ? peers.map(p => `<li class="text-xs text-slate-200 py-1 border-b border-white/5 flex items-center justify-between"><span>${p}</span><span class="text-[10px] text-emerald-400 font-bold">CONNECTED</span></li>`).join('')
                    : '<li class="text-xs text-slate-500 italic py-1">No players connected yet.</li>';
            }
        },

        updateStatusBanner(msg, colorHex) {
            const statusEl = document.getElementById('mp-status-label');
            if (statusEl) {
                statusEl.textContent = msg;
                if (colorHex) statusEl.style.color = colorHex;
            }
        },

        showNotice(msg, color = '#38bdf8') {
            if (typeof window.showKillFeedBanner === 'function') {
                window.showKillFeedBanner(msg, color);
            }
        },

        openModal(id) {
            const modal = document.getElementById(id);
            if (modal) modal.classList.remove('hidden');
            if (typeof window.releaseGamePointerLock === 'function') {
                window.releaseGamePointerLock();
            } else if (document.pointerLockElement) {
                document.exitPointerLock();
            }
        },

        closeModal(id) {
            const modal = document.getElementById(id);
            if (modal) modal.classList.add('hidden');
            if (typeof window.requestGamePointerLock === 'function') {
                window.requestGamePointerLock();
            }
        }
    };

    window.networkManager = NetworkManager;

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => NetworkManager.init());
    } else {
        NetworkManager.init();
    }
})();
