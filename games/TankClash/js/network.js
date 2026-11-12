// ============================================================================
// TankClash Multiplayer Engine (WebRTC P2P + Google Free STUN)
// Supports Co-op (Team vs Bots) & PvP (Player vs Player) Game Modes
// Features: Room Code Generation, Callsign Customization, 3D Remote Avatars,
//           Real-Time Ballistics Sync, Hit Registration & Dynamic Scoreboard [Tab]
// ============================================================================

(function () {
    'use strict';

    // 1. Google Free STUN Servers Configuration for NAT Traversal
    const GOOGLE_STUN_CONFIG = {
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
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

            // Targets for smooth interpolation
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
                if (this.soldierRig.root) {
                    this.soldierRig.root.rotation.y = this.heading;
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

                // Send Welcome packet with game mode and room configuration
                conn.send({
                    type: 'welcome',
                    roomCode: netState.roomCode,
                    gameMode: netState.gameMode,
                    hostName: netState.callsign,
                    hostTank: window.currentTankId || 'tiger',
                    hostSoldier: window.currentSoldierType || 'rifle'
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

                case 'damage_player':
                    this.onDamageReceived(pkg);
                    break;

                case 'player_killed':
                    this.onPlayerKilledEvent(pkg);
                    break;

                case 'bot_killed':
                    this.onBotKilledEvent(pkg);
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
            if (name && player.name !== name) {
                player.name = name;
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
            if (!window.scene) return;
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
                // If PvP, mark as hostile projectile
                const isHostile = (netState.gameMode === 'pvp');
                window.spawnEnemyShell(pos, dir, speed, {
                    id: pkg.tankType,
                    blastRadius: pkg.blastRadius || 8.0,
                    blastDamage: pkg.blastDamage || 100,
                    cannonDamage: pkg.cannonDamage || 2
                }, null);
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
            const pos = new THREE.Vector3(pkg.pos.x, pkg.pos.y, pkg.pos.z);
            const dir = new THREE.Vector3(pkg.dir.x, pkg.dir.y, pkg.dir.z).normalize();

            if (window.soundFX && typeof window.soundFX.playCoaxMG === 'function') {
                window.soundFX.playCoaxMG(pos);
            }

            if (typeof window.spawnTracerRound === 'function') {
                const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
                window.spawnTracerRound(pos, dir, quat, netState.gameMode === 'pvp');
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
            const pos = new THREE.Vector3(pkg.pos.x, pkg.pos.y, pkg.pos.z);
            const dir = new THREE.Vector3(pkg.dir.x, pkg.dir.y, pkg.dir.z).normalize();
            if (typeof window.spawnPlayerMortarShell === 'function') {
                window.spawnPlayerMortarShell(pos, dir, { isEnemy: netState.gameMode === 'pvp' });
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
            const pos = new THREE.Vector3(pkg.pos.x, pkg.pos.y, pkg.pos.z);
            const dir = new THREE.Vector3(pkg.dir.x, pkg.dir.y, pkg.dir.z).normalize();
            if (typeof window.spawnPlayerRocket === 'function') {
                window.spawnPlayerRocket(pos, dir, { isEnemy: netState.gameMode === 'pvp' });
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
