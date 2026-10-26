import * as THREE from 'three';

export function createSelectionBracket(deckAssetsGroup) {
    const selectionBracket = new THREE.Group();
    selectionBracket.userData = {
        pulseTimer: 0,
        deckGroup: null,
        targetRing: null,
        overheadBeacon: null
    };

    const deckSelGroup = new THREE.Group();
    deckSelGroup.position.y = 0.22;
    selectionBracket.add(deckSelGroup);
    selectionBracket.userData.deckGroup = deckSelGroup;

    // Vivid military neon green materials (unaffected by sun glare/shadows)
    const greenBracketMat = new THREE.MeshBasicMaterial({
        color: 0x00ff44,
        transparent: true,
        opacity: 0.98,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const greenGlowMat = new THREE.MeshBasicMaterial({
        color: 0x00ff55,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    // 1. Semi-translucent green targeting disc on deck
    const innerDiscGeo = new THREE.RingGeometry(0.2, 6.5, 48);
    innerDiscGeo.rotateX(-Math.PI / 2);
    deckSelGroup.add(new THREE.Mesh(innerDiscGeo, greenGlowMat));

    // 2. Rotating segmented tactical reticle ring on deck (broad high-contrast ribbon)
    const ringGroup = new THREE.Group();
    const mainRingGeo = new THREE.RingGeometry(6.0, 7.2, 48);
    mainRingGeo.rotateX(-Math.PI / 2);
    ringGroup.add(new THREE.Mesh(mainRingGeo, greenBracketMat));

    // 4 crosshair tick marks at 0, 90, 180, 270 deg
    [
        { x: 0, z: 8.0, w: 0.7, l: 2.0 },
        { x: 0, z: -8.0, w: 0.7, l: 2.0 },
        { x: 8.0, z: 0, w: 2.0, l: 0.7 },
        { x: -8.0, z: 0, w: 2.0, l: 0.7 }
    ].forEach(tk => {
        const tickGeo = new THREE.PlaneGeometry(tk.w, tk.l);
        tickGeo.rotateX(-Math.PI / 2);
        const tm = new THREE.Mesh(tickGeo, greenBracketMat);
        tm.position.set(tk.x, 0.01, tk.z);
        ringGroup.add(tm);
    });
    deckSelGroup.add(ringGroup);
    selectionBracket.userData.targetRing = ringGroup;

    // 3. Thick L-shaped corner brackets (width 0.75m, length 3.6m) for maximum daylight visibility
    const bSizeX = 7.4;
    const bSizeZ = 9.0;
    const armLen = 3.6;
    const armWidth = 0.75;

    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
        const armZGeo = new THREE.PlaneGeometry(armWidth, armLen);
        armZGeo.rotateX(-Math.PI / 2);
        const meshZ = new THREE.Mesh(armZGeo, greenBracketMat);
        meshZ.position.set(sx * bSizeX, 0.02, sz * (bSizeZ - armLen * 0.5));
        deckSelGroup.add(meshZ);

        const armXGeo = new THREE.PlaneGeometry(armLen, armWidth);
        armXGeo.rotateX(-Math.PI / 2);
        const meshX = new THREE.Mesh(armXGeo, greenBracketMat);
        meshX.position.set(sx * (bSizeX - armLen * 0.5), 0.02, sz * bSizeZ);
        deckSelGroup.add(meshX);
    });

    // 4. Forward heading tactical chevron on deck at z = +9.8
    const chevronGeo = new THREE.ConeGeometry(1.2, 2.2, 3);
    chevronGeo.rotateX(-Math.PI / 2);
    const chevronMesh = new THREE.Mesh(chevronGeo, greenBracketMat);
    chevronMesh.position.set(0, 0.03, 9.8);
    deckSelGroup.add(chevronMesh);

    // 5. Overhead floating tactical beacon marker
    const overheadBeacon = new THREE.Group();
    overheadBeacon.position.y = 6.8;

    const beaconGeo = new THREE.OctahedronGeometry(1.6, 0);
    const beaconMesh = new THREE.Mesh(beaconGeo, new THREE.MeshBasicMaterial({
        color: 0x00ff44,
        transparent: true,
        opacity: 0.95
    }));
    overheadBeacon.add(beaconMesh);

    const haloGeo = new THREE.RingGeometry(2.0, 2.6, 32);
    haloGeo.rotateX(-Math.PI / 2);
    const haloMesh = new THREE.Mesh(haloGeo, greenBracketMat);
    overheadBeacon.add(haloMesh);

    const beamGeo = new THREE.CylinderGeometry(0.12, 0.12, 6.0, 8);
    const beamMat = new THREE.MeshBasicMaterial({
        color: 0x00ff66,
        transparent: true,
        opacity: 0.65
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.y = -3.0;
    overheadBeacon.add(beamMesh);

    selectionBracket.add(overheadBeacon);
    selectionBracket.userData.overheadBeacon = overheadBeacon;

    selectionBracket.visible = false;
    deckAssetsGroup.add(selectionBracket);

    return selectionBracket;
}

export class SelectionManager {
    constructor(scene, camera, renderer, deckAssetsGroup, onSelectionChanged) {
        this.camera = camera;
        this.renderer = renderer;
        this.airWingUnits = [];
        this.selectedUnit = null;
        this.followUnit = null;
        this.onSelectionChanged = onSelectionChanged;

        this.selectionBracket = createSelectionBracket(deckAssetsGroup);
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.downPos = { x: 0, y: 0 };

        this.initEvents();
    }

    setUnits(units) {
        this.airWingUnits = units;
    }

    selectUnit(unit) {
        this.selectedUnit = unit;
        if (!unit) {
            this.followUnit = null;
            this.selectionBracket.visible = false;
        }
        if (this.onSelectionChanged) {
            this.onSelectionChanged(this.selectedUnit);
        }
    }

    toggleFollow(unit) {
        if (!unit) {
            this.followUnit = null;
            return false;
        }
        if (this.followUnit === unit) {
            this.followUnit = null;
            return false;
        } else {
            this.followUnit = unit;
            return true;
        }
    }

    initEvents() {
        this.renderer.domElement.addEventListener('pointerdown', (e) => {
            this.downPos = { x: e.clientX, y: e.clientY };
        });

        this.renderer.domElement.addEventListener('pointerup', (e) => {
            // Ignore drags (camera orbiting)
            if (Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y) > 6) return;

            this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
            this.raycaster.setFromCamera(this.pointer, this.camera);

            const meshes = this.airWingUnits.map(u => u.mesh);
            const hits = this.raycaster.intersectObjects(meshes, true);
            let pickedUnit = null;
            if (hits.length > 0) {
                let obj = hits[0].object;
                while (obj && !obj.userData.unit) obj = obj.parent;
                if (obj && obj.userData.unit) pickedUnit = obj.userData.unit;
            }

            // Click-to-select and click-on-empty-place-to-deselect
            this.selectUnit(pickedUnit);
        });
    }

    update(dt) {
        if (this.selectedUnit) {
            this.selectionBracket.position.copy(this.selectedUnit.mesh.position);
            this.selectionBracket.rotation.y = this.selectedUnit.mesh.rotation.y;
            this.selectionBracket.visible = true;

            this.selectionBracket.userData.pulseTimer = (this.selectionBracket.userData.pulseTimer || 0) + dt;
            const pt = this.selectionBracket.userData.pulseTimer;
            if (this.selectionBracket.userData.targetRing) {
                this.selectionBracket.userData.targetRing.rotation.y += dt * 0.75;
            }
            if (this.selectionBracket.userData.overheadBeacon) {
                this.selectionBracket.userData.overheadBeacon.rotation.y += dt * 1.6;
                const baseBeaconY = this.selectedUnit.type === 'E-2D' ? 7.2 : 5.4;
                this.selectionBracket.userData.overheadBeacon.position.y = baseBeaconY + Math.sin(pt * 3.5) * 0.35;
            }
            if (this.selectionBracket.userData.deckGroup) {
                const pulseScale = 1.0 + Math.sin(pt * 4.0) * 0.035;
                this.selectionBracket.userData.deckGroup.scale.set(pulseScale, 1.0, pulseScale);
            }
        } else {
            this.selectionBracket.visible = false;
        }
    }
}
