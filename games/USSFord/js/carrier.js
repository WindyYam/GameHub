import * as THREE from 'three';
import {
    DECK_MIN_X, DECK_MAX_X, DECK_MIN_Z, DECK_MAX_Z, DECK_Y
} from './config.js';
import {
    createFlightDeckMaps,
    createNavalSteelHullTexture,
    createIslandNumberTexture,
    createUSFlagTexture
} from './textures.js';

export function getStarboardEdgeX(z) {
    if (z >= 98) return THREE.MathUtils.lerp(-26.5, -18.0, (z - 98) / 56);
    if (z >= 36) return THREE.MathUtils.lerp(-38.5, -26.5, (z - 36) / 62);
    if (z >= -72) return -38.5;
    if (z >= -112) return THREE.MathUtils.lerp(-32.5, -38.5, (z - (-112)) / 40);
    return THREE.MathUtils.lerp(-23.5, -32.5, (z - (-152)) / 40);
}

export function getPortEdgeX(z) {
    if (z >= 96) return THREE.MathUtils.lerp(23.5, 18.0, (z - 96) / 58);
    if (z >= 34) return THREE.MathUtils.lerp(43.0, 23.5, (z - 34) / 62);
    if (z >= -36) return 43.0;
    if (z >= -75) return THREE.MathUtils.lerp(33.5, 43.0, (z - (-75)) / 39);
    return THREE.MathUtils.lerp(27.5, 33.5, (z - (-152)) / 77);
}

export function buildCarrier(scene) {
    const carrierGroup = new THREE.Group();
    scene.add(carrierGroup);

    const deckAssetsGroup = new THREE.Group();
    deckAssetsGroup.position.y = DECK_Y;
    carrierGroup.add(deckAssetsGroup);

    // Shared PBR Materials with Tangent-Space Normal Maps & Authentic USN Haze Grey Finishes
    const hullSteelMaps = createNavalSteelHullTexture();
    const hullGreyMat = new THREE.MeshStandardMaterial({
        color: 0x98a3b2,
        map: hullSteelMaps.colorTex,
        normalMap: hullSteelMaps.normalTex,
        normalScale: new THREE.Vector2(0.45, 0.45),
        bumpMap: hullSteelMaps.bumpTex,
        bumpScale: 0.10,
        roughness: 0.48,
        metalness: 0.16,
        side: THREE.DoubleSide
    });
    const hullDarkGreyMat = new THREE.MeshStandardMaterial({
        color: 0x5a6472,
        normalMap: hullSteelMaps.normalTex,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughness: 0.54,
        metalness: 0.22
    });
    const catwalkMat = new THREE.MeshStandardMaterial({
        color: 0x7c8896,
        map: hullSteelMaps.colorTex,
        normalMap: hullSteelMaps.normalTex,
        normalScale: new THREE.Vector2(0.38, 0.38),
        roughness: 0.52,
        metalness: 0.18
    });
    const islandMat = new THREE.MeshStandardMaterial({
        color: 0x9ba6b4,
        map: hullSteelMaps.colorTex,
        normalMap: hullSteelMaps.normalTex,
        normalScale: new THREE.Vector2(0.42, 0.42),
        roughness: 0.46,
        metalness: 0.16
    });
    const bootToppingMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.72, metalness: 0.15, side: THREE.DoubleSide });
    const antiFoulingRedMat = new THREE.MeshStandardMaterial({ color: 0x6e2620, roughness: 0.65, metalness: 0.12 });
    const radarWhiteMat = new THREE.MeshStandardMaterial({ color: 0xecf2f8, roughness: 0.32, metalness: 0.10 });
    const dbrPanelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.62, metalness: 0.18 });
    const bridgeGlassMat = new THREE.MeshStandardMaterial({ color: 0x09111c, roughness: 0.08, metalness: 0.92 });
    const nozzleDarkMat = new THREE.MeshStandardMaterial({ color: 0x22272e, roughness: 0.35, metalness: 0.85 });
    const yellowGearMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.40, metalness: 0.22 });

    const deckContour = [
        [-18.0, 154.0],
        [ 18.0, 154.0],
        [ 23.5,  96.0],
        [ 43.0,  34.0],
        [ 43.0, -36.0],
        [ 33.5, -75.0],
        [ 27.5, -152.0],
        [-23.5, -152.0],
        [-32.5, -112.0],
        [-38.5, -72.0],
        [-38.5,  36.0],
        [-26.5,  98.0]
    ];

    const deckShape = new THREE.Shape();
    deckContour.forEach(([x, z], idx) => {
        if (idx === 0) deckShape.moveTo(x, -z);
        else deckShape.lineTo(x, -z);
    });
    deckShape.closePath();

    const deckTopGeo = new THREE.ShapeGeometry(deckShape, 1);
    deckTopGeo.rotateX(-Math.PI / 2);

    const posAttr = deckTopGeo.attributes.position;
    const uvArray = new Float32Array(posAttr.count * 2);
    for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i);
        const vz = posAttr.getZ(i);
        const u = (vx - DECK_MIN_X) / (DECK_MAX_X - DECK_MIN_X);
        const v = (vz - DECK_MIN_Z) / (DECK_MAX_Z - DECK_MIN_Z);
        uvArray[i * 2] = u;
        uvArray[i * 2 + 1] = v;
    }
    deckTopGeo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
    deckTopGeo.computeVertexNormals();

    const deckMaps = createFlightDeckMaps();
    const deckTopMat = new THREE.MeshStandardMaterial({
        color: 0xe8ebef,
        map: deckMaps.colorTex,
        normalMap: deckMaps.normalTex,
        normalScale: new THREE.Vector2(0.55, 0.55),
        bumpMap: deckMaps.bumpTex,
        bumpScale: 0.12,
        roughnessMap: deckMaps.roughTex,
        roughness: 0.88,
        metalness: 0.04
    });

    const flightDeckMesh = new THREE.Mesh(deckTopGeo, deckTopMat);
    flightDeckMesh.position.y = DECK_Y;
    flightDeckMesh.receiveShadow = true;
    carrierGroup.add(flightDeckMesh);

    // Deep dark recessed gallery deck under the flight deck edge
    const galleryExtrudeGeo = new THREE.ExtrudeGeometry(deckShape, { depth: 2.3, bevelEnabled: false });
    galleryExtrudeGeo.rotateX(-Math.PI / 2);
    const galleryMesh = new THREE.Mesh(galleryExtrudeGeo, hullDarkGreyMat);
    galleryMesh.position.y = DECK_Y - 2.32;
    galleryMesh.castShadow = true;
    galleryMesh.receiveShadow = true;
    carrierGroup.add(galleryMesh);

    function createLoftedCarrierHull() {
        const levels = [
            { y: -0.6, bowZ: 144.0, sternZ: -148.0, bowW: 0.6,  midW: 19.5, sternW: 15.0 },
            { y:  3.2, bowZ: 147.5, sternZ: -150.0, bowW: 2.8,  midW: 21.5, sternW: 18.0 },
            { y:  6.8, bowZ: 151.0, sternZ: -151.0, bowW: 8.5,  midW: 25.0, sternW: 21.0 },
            { y: 10.1, bowZ: 153.8, sternZ: -152.0, bowW: 17.5, midW: 31.0, sternW: 23.5 }
        ];

        const zSamples = 32;
        const ringVerts = [];

        levels.forEach(lvl => {
            const ring = [];
            for (let i = 0; i <= zSamples; i++) {
                const t = i / zSamples;
                const z = THREE.MathUtils.lerp(lvl.bowZ, lvl.sternZ, t);
                let w;
                if (t < 0.28) {
                    const tb = t / 0.28;
                    w = THREE.MathUtils.lerp(lvl.bowW, lvl.midW, Math.pow(tb, 0.72));
                } else if (t > 0.78) {
                    const ts = (t - 0.78) / 0.22;
                    w = THREE.MathUtils.lerp(lvl.midW, lvl.sternW, ts);
                } else {
                    w = lvl.midW;
                }
                ring.push(new THREE.Vector3(-w, lvl.y, z));
            }
            for (let i = zSamples; i >= 0; i--) {
                const t = i / zSamples;
                const z = THREE.MathUtils.lerp(lvl.bowZ, lvl.sternZ, t);
                let w;
                if (t < 0.28) {
                    const tb = t / 0.28;
                    w = THREE.MathUtils.lerp(lvl.bowW, lvl.midW, Math.pow(tb, 0.72));
                } else if (t > 0.78) {
                    const ts = (t - 0.78) / 0.22;
                    w = THREE.MathUtils.lerp(lvl.midW, lvl.sternW, ts);
                } else {
                    w = lvl.midW;
                }
                ring.push(new THREE.Vector3(w, lvl.y, z));
            }
            ringVerts.push(ring);
        });

        const verts = [];
        const uvs = [];
        const indices = [];
        const ptsPerRing = ringVerts[0].length;

        ringVerts.forEach((ring, rIdx) => {
            ring.forEach((v, iIdx) => {
                verts.push(v.x, v.y, v.z);
                uvs.push((iIdx / ptsPerRing) * 8.0, (rIdx / (ringVerts.length - 1)) * 2.0);
            });
        });

        for (let r = 0; r < ringVerts.length - 1; r++) {
            for (let i = 0; i < ptsPerRing - 1; i++) {
                const a = r * ptsPerRing + i;
                const b = r * ptsPerRing + i + 1;
                const c = (r + 1) * ptsPerRing + i + 1;
                const d = (r + 1) * ptsPerRing + i;
                indices.push(a, c, b);
                indices.push(a, d, c);
            }
            const a = r * ptsPerRing + (ptsPerRing - 1);
            const b = r * ptsPerRing;
            const c = (r + 1) * ptsPerRing;
            const d = (r + 1) * ptsPerRing + (ptsPerRing - 1);
            indices.push(a, c, b);
            indices.push(a, d, c);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        return new THREE.Mesh(geo, hullGreyMat);
    }

    const loftedHull = createLoftedCarrierHull();
    loftedHull.castShadow = true;
    loftedHull.receiveShadow = true;
    carrierGroup.add(loftedHull);

    // Submerged Bulbous Bow Stem
    const bulbousBow = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), antiFoulingRedMat);
    bulbousBow.scale.set(0.85, 0.72, 3.2);
    bulbousBow.position.set(0, -1.2, 150.5);
    carrierGroup.add(bulbousBow);

    // Catwalks, Life Rafts & Defensive Sponsons
    const hullDetailsGroup = new THREE.Group();
    carrierGroup.add(hullDetailsGroup);

    // Starboard catwalks, gallery piping & life raft drums
    for (let z = -148; z <= 148; z += 4.5) {
        const edgeX = getStarboardEdgeX(z);
        const cw = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 4.3), catwalkMat);
        cw.position.set(edgeX - 0.9, DECK_Y - 0.75, z);
        cw.castShadow = true;
        cw.receiveShadow = true;
        hullDetailsGroup.add(cw);

        const railing = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.85, 4.4), hullGreyMat);
        railing.position.set(edgeX - 1.95, DECK_Y - 0.25, z);
        hullDetailsGroup.add(railing);

        const rib = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.6, 0.75), hullDarkGreyMat);
        rib.position.set(edgeX + 0.8, DECK_Y - 2.6, z);
        rib.castShadow = true;
        rib.receiveShadow = true;
        hullDetailsGroup.add(rib);

        if (Math.abs(z) % 9 < 4.5) {
            for (let c = -1.2; c <= 1.2; c += 1.2) {
                const canister = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.15, 10), radarWhiteMat);
                canister.rotation.x = Math.PI / 2;
                canister.position.set(edgeX - 2.05, DECK_Y - 0.45, z + c);
                canister.castShadow = true;
                hullDetailsGroup.add(canister);
            }
        }
    }

    // Port catwalks & life rafts
    for (let z = -146; z <= 146; z += 5.5) {
        const edgeX = getPortEdgeX(z);
        const cw = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 5.2), catwalkMat);
        cw.position.set(edgeX + 0.9, DECK_Y - 0.75, z);
        cw.castShadow = true;
        cw.receiveShadow = true;
        hullDetailsGroup.add(cw);

        const railing = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.85, 5.3), hullGreyMat);
        railing.position.set(edgeX + 1.85, DECK_Y - 0.25, z);
        hullDetailsGroup.add(railing);

        if (Math.abs(z) % 11 < 5.5) {
            const canister = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.15, 10), radarWhiteMat);
            canister.rotation.x = Math.PI / 2;
            canister.position.set(edgeX + 1.95, DECK_Y - 0.45, z);
            canister.castShadow = true;
            hullDetailsGroup.add(canister);
        }
    }

    const bowCatwalk = new THREE.Mesh(new THREE.BoxGeometry(35.5, 0.85, 2.4), catwalkMat);
    bowCatwalk.position.set(0, DECK_Y - 0.65, 154.8);
    hullDetailsGroup.add(bowCatwalk);

    // Starboard Hull Recessed Hangar Bays & Sponsons
    [-98, -42, 4, 48, 86].forEach(hz => {
        const sx = getStarboardEdgeX(hz);
        const sponsonBox = new THREE.Mesh(new THREE.BoxGeometry(5.8, 4.4, 15.5), hullGreyMat);
        sponsonBox.position.set(sx + 2.2, DECK_Y - 4.4, hz);
        sponsonBox.castShadow = true;
        sponsonBox.receiveShadow = true;
        hullDetailsGroup.add(sponsonBox);

        const recessCavity = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.9, 11.2), bootToppingMat);
        recessCavity.position.set(sx - 0.2, DECK_Y - 4.4, hz);
        hullDetailsGroup.add(recessCavity);
    });

    // Deck Edge Elevators
    function addCarrierElevator(x, z, width, length, isStarboard = true) {
        const elevGroup = new THREE.Group();
        elevGroup.position.set(x, DECK_Y - 0.35, z);

        const plat = new THREE.Mesh(new THREE.BoxGeometry(width, 0.65, length), hullDarkGreyMat);
        plat.castShadow = true;
        plat.receiveShadow = true;
        elevGroup.add(plat);

        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, length - 0.6), hullGreyMat);
        rail.position.set(isStarboard ? -width * 0.46 : width * 0.46, 0.65, 0);
        elevGroup.add(rail);

        const truss = new THREE.Mesh(new THREE.BoxGeometry(width - 1.0, 2.8, length - 2.0), hullGreyMat);
        truss.position.set(isStarboard ? 0.8 : -0.8, -1.7, 0);
        elevGroup.add(truss);

        const guideRail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7.5, length), hullDarkGreyMat);
        guideRail.position.set(isStarboard ? width * 0.5 - 0.2 : -width * 0.5 + 0.2, -3.2, 0);
        elevGroup.add(guideRail);

        hullDetailsGroup.add(elevGroup);
    }

    [-92, -18, 22].forEach(elevZ => {
        const ex = getStarboardEdgeX(elevZ);
        addCarrierElevator(ex - 2.4, elevZ, 6.8, 16.0, true);
    });
    addCarrierElevator(getPortEdgeX(-65) + 2.4, -65, 6.8, 16.0, false);

    // CIWS and RAM
    function addPhalanxCIWS(x, y, z) {
        const ciws = new THREE.Group();
        ciws.position.set(x, y, z);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 1.4, 12), hullGreyMat);
        ciws.add(base);
        const turret = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 2.0), hullDarkGreyMat);
        turret.position.y = 1.4;
        ciws.add(turret);
        const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.8, 14), radarWhiteMat);
        dome.position.set(0, 2.8, -0.2);
        dome.castShadow = true;
        ciws.add(dome);
        const domeCap = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), radarWhiteMat);
        domeCap.position.set(0, 3.7, -0.2);
        ciws.add(domeCap);
        const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.2, 8), nozzleDarkMat);
        gun.rotation.x = Math.PI / 2;
        gun.position.set(0, 1.35, 1.6);
        gun.castShadow = true;
        ciws.add(gun);
        hullDetailsGroup.add(ciws);
    }

    function addRAMLauncher(x, y, z, rotY) {
        const ram = new THREE.Group();
        ram.position.set(x, y, z);
        ram.rotation.y = rotY;
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1.2, 10), hullGreyMat);
        ram.add(pedestal);
        const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 3.2), radarWhiteMat);
        box.position.set(0, 1.8, 0);
        box.rotation.x = -0.55;
        box.castShadow = true;
        ram.add(box);
        hullDetailsGroup.add(ram);
    }

    addPhalanxCIWS(getStarboardEdgeX(36) - 3.2, DECK_Y - 2.6, 36);
    addRAMLauncher(getStarboardEdgeX(-6) - 3.4, DECK_Y - 2.8, -6, -Math.PI / 2);
    addPhalanxCIWS(getStarboardEdgeX(-124) - 3.2, DECK_Y - 2.8, -124);
    addRAMLauncher(getPortEdgeX(62) + 3.2, DECK_Y - 2.8, 62, Math.PI / 2);

    // Aft Fantail Dome
    const aftFantailDome = new THREE.Group();
    aftFantailDome.position.set(16.5, DECK_Y, -142.5);
    const aftCylinder = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 2.4, 20), radarWhiteMat);
    aftCylinder.position.y = 1.2;
    aftCylinder.castShadow = true;
    aftFantailDome.add(aftCylinder);
    const aftCap = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.2, 20), hullDarkGreyMat);
    aftCap.position.y = 2.42;
    aftFantailDome.add(aftCap);
    hullDetailsGroup.add(aftFantailDome);

    // Waterline Boot-Topping Stripe & Hawsepipes
    const bootBand = new THREE.Mesh(new THREE.BoxGeometry(40.5, 1.8, 286.0), bootToppingMat);
    bootBand.position.set(0, 0.85, -2.0);
    hullDetailsGroup.add(bootBand);

    [-3.8, 3.8].forEach(ax => {
        const hawse = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 1.4, 12), nozzleDarkMat);
        hawse.rotation.z = ax > 0 ? -0.55 : 0.55;
        hawse.position.set(ax, 6.2, 146.5);
        hullDetailsGroup.add(hawse);

        const fluke = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.2, 1.4), nozzleDarkMat);
        fluke.position.set(ax * 1.08, 5.4, 146.5);
        fluke.rotation.z = ax > 0 ? -0.35 : 0.35;
        hullDetailsGroup.add(fluke);
    });

    // Under-Deck Diagonal Struts
    for (let z = -140; z <= 135; z += 9.5) {
        const sx = getStarboardEdgeX(z);
        const px = getPortEdgeX(z);

        const stbdStrut = new THREE.Mesh(new THREE.BoxGeometry(0.65, 6.8, 0.85), hullDarkGreyMat);
        stbdStrut.position.set(sx + 3.6, DECK_Y - 4.2, z);
        stbdStrut.rotation.z = -0.52;
        stbdStrut.castShadow = true;
        hullDetailsGroup.add(stbdStrut);

        const portStrut = new THREE.Mesh(new THREE.BoxGeometry(0.65, 6.8, 0.85), hullDarkGreyMat);
        portStrut.position.set(px - 3.6, DECK_Y - 4.2, z);
        portStrut.rotation.z = 0.52;
        portStrut.castShadow = true;
        hullDetailsGroup.add(portStrut);
    }

    // Deck-Edge Whip Antennas
    [-115, -45, 5, 68, 118].forEach(az => {
        const sx = getStarboardEdgeX(az) - 2.1;
        const whipS = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 9.5, 6), hullDarkGreyMat);
        whipS.position.set(sx - 1.8, DECK_Y + 2.2, az);
        whipS.rotation.z = 0.48;
        hullDetailsGroup.add(whipS);

        const px = getPortEdgeX(az) + 2.0;
        const whipP = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 9.5, 6), hullDarkGreyMat);
        whipP.position.set(px + 1.8, DECK_Y + 2.2, az);
        whipP.rotation.z = -0.48;
        hullDetailsGroup.add(whipP);
    });

    // IFLOLS
    const iflolsGroup = new THREE.Group();
    iflolsGroup.position.set(getPortEdgeX(-48) + 1.8, DECK_Y - 0.3, -48);
    const iflolsBox = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.2, 1.8), hullDarkGreyMat);
    iflolsBox.position.y = 1.6;
    iflolsBox.castShadow = true;
    iflolsGroup.add(iflolsBox);

    [-0.85, 0.85].forEach(dx => {
        const datum = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.12), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
        datum.position.set(dx, 1.8, -0.92);
        iflolsGroup.add(datum);
    });
    const meatball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
    meatball.position.set(0, 1.8, -0.95);
    iflolsGroup.add(meatball);
    hullDetailsGroup.add(iflolsGroup);

    // Crane ("Tilly")
    const craneGroup = new THREE.Group();
    craneGroup.position.set(-29.5, DECK_Y, -39.5);
    craneGroup.rotation.y = 0.25;
    const craneBase = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.7, 6.2), yellowGearMat);
    craneBase.position.y = 0.95;
    craneBase.castShadow = true;
    craneGroup.add(craneBase);
    const craneCab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 2.4), nozzleDarkMat);
    craneCab.position.set(0.7, 2.2, 0.9);
    craneGroup.add(craneCab);
    const craneBoom = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.05, 13.5), yellowGearMat);
    craneBoom.position.set(-0.2, 3.3, 4.2);
    craneBoom.rotation.x = -0.18;
    craneBoom.castShadow = true;
    craneGroup.add(craneBoom);
    [-1.8, 1.8].forEach(wx => {
        [-2.1, 0, 2.1].forEach(wz => {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 14), new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.86 }));
            w.rotation.z = Math.PI / 2;
            w.position.set(wx, 0.62, wz);
            craneGroup.add(w);
        });
    });
    hullDetailsGroup.add(craneGroup);

    // Island Superstructure
    const islandGroup = new THREE.Group();
    islandGroup.position.set(-30.2, DECK_Y, -56.0);
    carrierGroup.add(islandGroup);

    const islandNumTex = createIslandNumberTexture();
    const islandNumMat = new THREE.MeshStandardMaterial({
        map: islandNumTex,
        normalMap: hullSteelMaps.normalTex,
        normalScale: new THREE.Vector2(0.32, 0.32),
        roughness: 0.42,
        metalness: 0.20
    });

    const baseMaterials = [islandNumMat, islandNumMat, islandMat, islandMat, islandNumMat, islandMat];
    const lowerIsland = new THREE.Mesh(new THREE.BoxGeometry(9.6, 16.0, 23.5), baseMaterials);
    lowerIsland.position.set(0, 8.0, 0);
    lowerIsland.castShadow = true;
    lowerIsland.receiveShadow = true;
    islandGroup.add(lowerIsland);

    const fwdSponson = new THREE.Mesh(new THREE.BoxGeometry(8.6, 9.8, 6.2), islandMat);
    fwdSponson.position.set(-0.4, 4.9, 13.8);
    fwdSponson.castShadow = true;
    islandGroup.add(fwdSponson);

    const aftSponson = new THREE.Mesh(new THREE.BoxGeometry(8.6, 10.8, 5.8), islandMat);
    aftSponson.position.set(-0.4, 5.4, -13.5);
    aftSponson.castShadow = true;
    islandGroup.add(aftSponson);

    const bridgeCoreTrunk = new THREE.Mesh(new THREE.BoxGeometry(9.0, 12.2, 16.0), islandMat);
    bridgeCoreTrunk.position.set(0.1, 20.8, 0.2);
    bridgeCoreTrunk.castShadow = true;
    bridgeCoreTrunk.receiveShadow = true;
    islandGroup.add(bridgeCoreTrunk);

    const dbrPedestal = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 6.0, 5.4, 8), islandMat);
    dbrPedestal.position.set(0, 23.5, -0.5);
    dbrPedestal.castShadow = true;
    dbrPedestal.receiveShadow = true;
    islandGroup.add(dbrPedestal);

    // Navigation Bridge & Pri-Fly Flight Control
    [
        { y: 15.4, w: 10.2, z: 20.5, glassH: 0.85 },
        { y: 19.8, w: 10.8, z: 17.2, glassH: 0.82 }
    ].forEach(tier => {
        const underSupport = new THREE.Mesh(new THREE.BoxGeometry(tier.w - 0.8, 2.2, tier.z - 1.2), islandMat);
        underSupport.position.set(0.2, tier.y - 1.5, 0.5);
        underSupport.castShadow = true;
        underSupport.receiveShadow = true;
        islandGroup.add(underSupport);

        const levelBox = new THREE.Mesh(new THREE.BoxGeometry(tier.w, 1.6, tier.z), islandMat);
        levelBox.position.set(0.2, tier.y, 0.5);
        levelBox.castShadow = true;
        islandGroup.add(levelBox);

        const glassBox = new THREE.Mesh(new THREE.BoxGeometry(tier.w + 0.22, tier.glassH, tier.z + 0.22), bridgeGlassMat);
        glassBox.position.set(0.2, tier.y + 0.98, 0.5);
        glassBox.castShadow = true;
        islandGroup.add(glassBox);

        const roofOverhang = new THREE.Mesh(new THREE.BoxGeometry(tier.w + 0.8, 0.42, tier.z + 0.8), islandMat);
        roofOverhang.position.set(0.2, tier.y + 0.98 + tier.glassH * 0.5 + 0.20, 0.5);
        roofOverhang.castShadow = true;
        islandGroup.add(roofOverhang);

        const galleryWalkway = new THREE.Mesh(new THREE.BoxGeometry(tier.w + 1.5, 0.45, tier.z + 1.5), catwalkMat);
        galleryWalkway.position.set(0.2, tier.y - 0.65, 0.5);
        galleryWalkway.castShadow = true;
        islandGroup.add(galleryWalkway);
    });

    // DBR Phased Array Tower
    const dbrTower = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.2, 9.8, 8), islandMat);
    dbrTower.position.set(0, 29.8, -0.5);
    dbrTower.castShadow = true;
    islandGroup.add(dbrTower);

    for (let a = 0; a < 4; a++) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.6, 0.45), dbrPanelMat);
        const ang = (a * Math.PI) / 2 + Math.PI / 4;
        panel.position.set(Math.sin(ang) * 4.6, 29.8, -0.5 + Math.cos(ang) * 4.6);
        panel.rotation.y = ang;
        islandGroup.add(panel);
    }

    // SATCOM Radomes
    const radomeSpecs = [
        { x: -1.6, y: 10.9, z: 14.2, rad: 2.05, baseH: 2.4, sponson: true  },
        { x: -3.2, y: 18.0, z:  9.0, rad: 1.75, baseH: 2.2, sponson: false },
        { x: -3.2, y: 18.0, z: -8.0, rad: 1.75, baseH: 2.2, sponson: false },
        { x: -1.6, y: 11.8, z: -13.6, rad: 2.05, baseH: 2.4, sponson: true  },
        { x:  2.4, y: 22.8, z:  6.6, rad: 1.65, baseH: 2.6, sponson: false },
        { x: -1.8, y: 35.8, z:  2.0, rad: 2.15, baseH: 2.8, sponson: true  },
        { x:  1.8, y: 35.8, z: -3.0, rad: 1.98, baseH: 2.8, sponson: true  }
    ];
    radomeSpecs.forEach(({ x: rx, y: ry, z: rz, rad, baseH, sponson }) => {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.65, rad * 0.85, baseH, 12), islandMat);
        base.position.set(rx, ry - rad * 0.45, rz);
        base.castShadow = true;
        islandGroup.add(base);

        if (sponson) {
            const collar = new THREE.Mesh(new THREE.CylinderGeometry(rad * 1.05, rad * 0.80, 1.2, 12), hullDarkGreyMat);
            collar.position.set(rx, ry - rad * 0.9, rz);
            islandGroup.add(collar);
        }

        const sphere = new THREE.Mesh(new THREE.SphereGeometry(rad, 18, 18), radarWhiteMat);
        sphere.position.set(rx, ry + rad * 0.35, rz);
        sphere.castShadow = true;
        islandGroup.add(sphere);
    });

    const upperMast = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 2.4, 21, 8), islandMat);
    upperMast.position.set(0, 43.8, -1.0);
    upperMast.castShadow = true;
    islandGroup.add(upperMast);

    [-38, -43, -49].forEach((y, idx) => {
        const yard = new THREE.Mesh(new THREE.BoxGeometry(16.5 - idx * 3.5, 0.50, 0.90), islandMat);
        yard.position.set(0, -y, -1.0);
        yard.castShadow = true;
        islandGroup.add(yard);

        [-1, 1].forEach(side => {
            const sensorPod = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 1.3, 8), radarWhiteMat);
            sensorPod.position.set(side * (7.5 - idx * 1.6), -y + 0.6, -1.0);
            sensorPod.castShadow = true;
            islandGroup.add(sensorPod);
        });
    });

    const tacanDome = new THREE.Mesh(new THREE.CylinderGeometry(0.90, 1.0, 2.2, 12), radarWhiteMat);
    tacanDome.position.set(0, 54.8, -1.0);
    tacanDome.castShadow = true;
    islandGroup.add(tacanDome);

    [3.5, 8.2, 12.8].forEach((stairY, idx) => {
        const stairFlight = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.25, 4.8), hullDarkGreyMat);
        stairFlight.position.set(4.95, stairY, -6.0 + idx * 3.5);
        stairFlight.rotation.x = 0.62;
        stairFlight.castShadow = true;
        islandGroup.add(stairFlight);
    });

    // US Flag on mast gaff
    const gaffPole = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.18, 8.5, 8), hullDarkGreyMat);
    gaffPole.position.set(0, 38.5, -4.2);
    gaffPole.rotation.x = -0.68;
    gaffPole.castShadow = true;
    islandGroup.add(gaffPole);

    const flagGeo = new THREE.PlaneGeometry(9.6, 5.4, 16, 10);
    const flagMesh = new THREE.Mesh(
        flagGeo,
        new THREE.MeshStandardMaterial({ map: createUSFlagTexture(), side: THREE.DoubleSide, roughness: 0.48 })
    );
    flagMesh.position.set(0.5, 38.2, -9.8);
    flagMesh.rotation.y = Math.PI / 2 - 0.28;
    islandGroup.add(flagMesh);

    // JBDs
    function createJBD(x, z, rotY) {
        const group = new THREE.Group();
        group.position.set(x, DECK_Y + 0.06, z);
        group.rotation.y = rotY;

        const panelPivot = new THREE.Group();
        panelPivot.position.set(0, 0.05, 2.2);
        const panel = new THREE.Mesh(
            new THREE.BoxGeometry(9.2, 0.28, 4.4),
            new THREE.MeshStandardMaterial({ color: 0x5c4938, roughness: 0.68, metalness: 0.28 })
        );
        panel.position.set(0, 0, -2.2);
        panel.castShadow = true;
        panelPivot.add(panel);

        const hazardEdge = new THREE.Mesh(
            new THREE.BoxGeometry(9.3, 0.30, 0.35),
            new THREE.MeshStandardMaterial({ color: 0xd97706 })
        );
        hazardEdge.position.set(0, 0, -4.2);
        panelPivot.add(hazardEdge);

        group.add(panelPivot);
        carrierGroup.add(group);
        return { panelPivot, targetAngle: 0, currentAngle: 0 };
    }

    const jbdCat1 = createJBD(-7.5, 44, 0.01);
    const jbdCat2 = createJBD( 8.5, 38, -0.01);

    // Arresting Gear
    const wireMat = new THREE.LineBasicMaterial({ color: 0x1e293b, linewidth: 2 });
    const wirePts = [
        new THREE.Vector3(-8.5, 0.16, -95),
        new THREE.Vector3( 3.5, 0.16, -98),
        new THREE.Vector3(15.5, 0.16, -101)
    ];
    const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePts);
    const arrestingWireLine = new THREE.Line(wireGeo, wireMat);
    deckAssetsGroup.add(arrestingWireLine);

    [-119, -107, -83].forEach(wz => {
        const shiftX = (wz - (-98)) * 0.21;
        const pPts = [
            new THREE.Vector3(-8.5 + shiftX, 0.15, wz + 3),
            new THREE.Vector3( 3.5 + shiftX, 0.15, wz),
            new THREE.Vector3(15.5 + shiftX, 0.15, wz - 3)
        ];
        const pLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pPts), wireMat);
        deckAssetsGroup.add(pLine);

        [-9.2 + shiftX, 16.2 + shiftX].forEach((sx, sIdx) => {
            const damper = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.35, 10), yellowGearMat);
            damper.position.set(sx, 0.18, sIdx === 0 ? wz + 3.2 : wz - 3.2);
            deckAssetsGroup.add(damper);
        });
    });

    const deckObstacleList = [
        { x: -29.0, z: -56.0, radius: 13.5 }
    ];

    function updateCarrier(elapsed, dt) {
        // Gentle carrier pitch, roll & heave
        const pitch = Math.sin(elapsed * 0.48) * 0.008;
        const roll  = Math.cos(elapsed * 0.36) * 0.007;
        const heave = Math.sin(elapsed * 0.62) * 0.20;
        carrierGroup.rotation.x = pitch;
        carrierGroup.rotation.z = roll;
        carrierGroup.position.y = heave;

        // Animate waving flag
        const fPos = flagGeo.attributes.position;
        for (let i = 0; i < fPos.count; i++) {
            const vx = fPos.getX(i);
            const wave = Math.sin(vx * 0.8 - elapsed * 6.5) * ((vx + 4.8) * 0.06);
            fPos.setZ(i, wave);
        }
        fPos.needsUpdate = true;

        // JBDs smooth hydraulic animation
        jbdCat1.currentAngle = THREE.MathUtils.lerp(jbdCat1.currentAngle, jbdCat1.targetAngle, dt * 4.0);
        jbdCat1.panelPivot.rotation.x = jbdCat1.currentAngle;

        jbdCat2.currentAngle = THREE.MathUtils.lerp(jbdCat2.currentAngle, jbdCat2.targetAngle, dt * 4.0);
        jbdCat2.panelPivot.rotation.x = jbdCat2.currentAngle;
    }

    return {
        carrierGroup,
        deckAssetsGroup,
        flightDeckMesh,
        jbdCat1,
        jbdCat2,
        arrestingWireLine,
        deckObstacleList,
        flagMesh,
        updateCarrier,
        getStarboardEdgeX,
        getPortEdgeX
    };
}
