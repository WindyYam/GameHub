import * as THREE from 'three';
import {
    createAircraftSurfaceMaps,
    createUSNavyInsigniaTexture,
    createRotodomeTexture
} from './textures.js';

export const spinningPropsAndDomes = [];
export const allHeliRotors = [];

// Shared materials for aircraft & equipment
const fa18SurfMaps = createAircraftSurfaceMaps('#c0c9d4', 0.26);
const f35SurfMaps  = createAircraftSurfaceMaps('#545b66', 0.22);
const e2SurfMaps   = createAircraftSurfaceMaps('#dce3ec', 0.22);
const heloSurfMaps = createAircraftSurfaceMaps('#525c6a', 0.25);

export const f35DarkMat = new THREE.MeshStandardMaterial({
    color: 0x565d68,
    map: f35SurfMaps.colorTex,
    normalMap: f35SurfMaps.normalTex,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.44,
    metalness: 0.26
});
export const f35LightRamMat = new THREE.MeshStandardMaterial({ color: 0x828b96, roughness: 0.40, metalness: 0.22 });
export const f35NoseMat = new THREE.MeshStandardMaterial({ color: 0x3b414a, roughness: 0.48, metalness: 0.20 });

export const fa18GreyMat = new THREE.MeshStandardMaterial({
    color: 0xc2cbd6,
    map: fa18SurfMaps.colorTex,
    normalMap: fa18SurfMaps.normalTex,
    normalScale: new THREE.Vector2(0.38, 0.38),
    roughness: 0.36,
    metalness: 0.24
});
export const fa18NoseMat = new THREE.MeshStandardMaterial({ color: 0x828c9a, roughness: 0.42, metalness: 0.22 });

export const e2BodyMat = new THREE.MeshStandardMaterial({
    color: 0xdce3ec,
    map: e2SurfMaps.colorTex,
    normalMap: e2SurfMaps.normalTex,
    normalScale: new THREE.Vector2(0.32, 0.32),
    roughness: 0.34,
    metalness: 0.20
});

export const heloDarkMat = new THREE.MeshStandardMaterial({
    color: 0x525c6a,
    map: heloSurfMaps.colorTex,
    normalMap: heloSurfMaps.normalTex,
    normalScale: new THREE.Vector2(0.34, 0.34),
    roughness: 0.44,
    metalness: 0.28
});

export const canopyGoldMat = new THREE.MeshStandardMaterial({ color: 0x1b222c, roughness: 0.06, metalness: 0.92 });
export const canopyBlueMat = new THREE.MeshStandardMaterial({ color: 0x0e1724, roughness: 0.08, metalness: 0.90 });
export const tireBlackMat = new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 0.86, metalness: 0.08 });
export const nozzleDarkMat = new THREE.MeshStandardMaterial({ color: 0x22272e, roughness: 0.35, metalness: 0.85 });
export const foldHingeRedMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.50, metalness: 0.20 });
export const radarWhiteMat = new THREE.MeshStandardMaterial({ color: 0xecf2f8, roughness: 0.32, metalness: 0.10 });
export const yellowGearMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.40, metalness: 0.22 });

const usNavyInsigniaTex = createUSNavyInsigniaTexture();
export const insigniaDecalMat = new THREE.MeshBasicMaterial({ map: usNavyInsigniaTex, transparent: true, depthWrite: false });

export function addLandingGear(parent, noseZ, mainX, mainZ) {
    const gearGroup = new THREE.Group();

    // Nose Gear (dual wheel + launch bar + holdback link)
    const nStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.95), radarWhiteMat);
    nStrut.position.set(0, 0.48, noseZ);
    nStrut.rotation.x = -0.15;
    gearGroup.add(nStrut);

    const launchBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.72), radarWhiteMat);
    launchBar.position.set(0, 0.25, noseZ + 0.35);
    launchBar.rotation.x = 0.55;
    gearGroup.add(launchBar);

    const holdbackLink = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), nozzleDarkMat);
    holdbackLink.position.set(0, 0.28, noseZ - 0.25);
    holdbackLink.rotation.x = -0.45;
    gearGroup.add(holdbackLink);

    [-0.14, 0.14].forEach(offset => {
        const nTire = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.13, 14), tireBlackMat);
        nTire.rotation.z = Math.PI / 2;
        nTire.position.set(offset, 0.24, noseZ);
        nTire.castShadow = true;
        gearGroup.add(nTire);

        const nHub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.15, 10), radarWhiteMat);
        nHub.rotation.z = Math.PI / 2;
        nHub.position.set(offset, 0.24, noseZ);
        gearGroup.add(nHub);
    });

    [-0.24, 0.24].forEach(dOffset => {
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.36, 0.95), radarWhiteMat);
        door.position.set(dOffset, 0.65, noseZ);
        door.rotation.z = dOffset > 0 ? 0.35 : -0.35;
        gearGroup.add(door);
    });

    // Main Gear (heavy single wheel per side + trailing arm + brake calipers)
    [-mainX, mainX].forEach(gx => {
        const mStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.98), radarWhiteMat);
        mStrut.position.set(gx * 0.92, 0.50, mainZ);
        gearGroup.add(mStrut);

        const mTrailingLink = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.52), radarWhiteMat);
        mTrailingLink.position.set(gx, 0.35, mainZ - 0.18);
        gearGroup.add(mTrailingLink);

        const brakeCaliper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.22), nozzleDarkMat);
        brakeCaliper.position.set(gx + (gx > 0 ? -0.1 : 0.1), 0.35, mainZ);
        gearGroup.add(brakeCaliper);

        const mTire = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16), tireBlackMat);
        mTire.rotation.z = Math.PI / 2;
        mTire.position.set(gx, 0.35, mainZ);
        mTire.castShadow = true;
        gearGroup.add(mTire);

        const mHub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.27, 10), radarWhiteMat);
        mHub.rotation.z = Math.PI / 2;
        mHub.position.set(gx, 0.35, mainZ);
        gearGroup.add(mHub);
    });

    parent.add(gearGroup);
    parent.userData.gearGroup = gearGroup;
}

export function setWingFoldRatio(mesh, ratio) {
    mesh.userData.wingFoldRatio = ratio;
    if (!mesh.userData.wingFoldPivots) return;
    mesh.userData.wingFoldPivots.forEach(w => {
        w.pivot.rotation.z = w.side * w.maxAngle * ratio;
    });
}

// F-35C Lightning II
export function createF35C({ foldedWings = false } = {}) {
    const jet = new THREE.Group();

    const stations = [
        { z:  4.6, wMid: 0.16, yTop: 0.92, yBot: 0.72, wChine: 0.22 },
        { z:  3.2, wMid: 0.52, yTop: 1.25, yBot: 0.58, wChine: 0.78 },
        { z:  1.6, wMid: 1.05, yTop: 1.55, yBot: 0.52, wChine: 1.35 },
        { z: -0.2, wMid: 1.28, yTop: 1.48, yBot: 0.50, wChine: 1.58 },
        { z: -2.0, wMid: 1.20, yTop: 1.35, yBot: 0.54, wChine: 1.45 },
        { z: -3.8, wMid: 0.95, yTop: 1.22, yBot: 0.62, wChine: 1.15 },
        { z: -5.1, wMid: 0.62, yTop: 1.12, yBot: 0.72, wChine: 0.70 }
    ];

    const bodyVerts = [];
    const bodyIndices = [];
    const numPts = 8;

    stations.forEach((s, r) => {
        const yMid = (s.yTop + s.yBot) * 0.5;
        const h = (s.yTop - s.yBot) * 0.5;
        const ring = [
            [0, s.yTop, s.z],
            [s.wMid * 0.75, yMid + h * 0.6, s.z],
            [s.wChine, yMid, s.z],
            [s.wMid * 0.75, yMid - h * 0.6, s.z],
            [0, s.yBot, s.z],
            [-s.wMid * 0.75, yMid - h * 0.6, s.z],
            [-s.wChine, yMid, s.z],
            [-s.wMid * 0.75, yMid + h * 0.6, s.z]
        ];
        ring.forEach(pt => bodyVerts.push(...pt));

        if (r < stations.length - 1) {
            for (let i = 0; i < numPts; i++) {
                const iNext = (i + 1) % numPts;
                const a = r * numPts + i;
                const b = r * numPts + iNext;
                const c = (r + 1) * numPts + iNext;
                const d = (r + 1) * numPts + i;
                bodyIndices.push(a, b, c);
                bodyIndices.push(a, c, d);
            }
        }
    });

    const bodyGeo = new THREE.BufferGeometry();
    bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(bodyVerts, 3));
    bodyGeo.setIndex(bodyIndices);
    bodyGeo.computeVertexNormals();
    const bodyMesh = new THREE.Mesh(bodyGeo, f35DarkMat);
    bodyMesh.castShadow = true;
    jet.add(bodyMesh);

    const radomeCap = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.35, 8), f35NoseMat);
    radomeCap.rotation.x = Math.PI / 2;
    radomeCap.position.set(0, 0.85, 5.25);
    radomeCap.scale.set(0.65, 1.0, 0.45);
    jet.add(radomeCap);

    const eots = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 4), canopyGoldMat);
    eots.rotation.x = -Math.PI / 2;
    eots.position.set(0, 0.56, 4.45);
    jet.add(eots);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.56, 16, 12), canopyGoldMat);
    canopy.position.set(0, 1.48, 2.0);
    canopy.scale.set(0.72, 0.52, 2.65);
    jet.add(canopy);

    const canopyArch = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.035, 6, 14, Math.PI), f35LightRamMat);
    canopyArch.position.set(0, 1.35, 2.05);
    canopyArch.scale.set(0.74, 0.72, 1.0);
    jet.add(canopyArch);

    [-1.02, 1.02].forEach(ix => {
        const intake = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.58, 2.8), f35DarkMat);
        intake.position.set(ix, 1.08, 1.55);
        intake.rotation.z = ix > 0 ? -0.25 : 0.25;
        intake.rotation.y = ix > 0 ? 0.06 : -0.06;
        jet.add(intake);

        const cowlLip = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.8), f35LightRamMat);
        cowlLip.position.set(ix, 1.35, 2.75);
        cowlLip.rotation.z = ix > 0 ? -0.25 : 0.25;
        jet.add(cowlLip);
    });

    [-1, 1].forEach(side => {
        const innerWingGeo = new THREE.BufferGeometry();
        const v0 = [side * 1.40, 1.08,  2.20];
        const v1 = [side * 3.80, 1.08,  0.52];
        const v2 = [side * 3.80, 1.08, -1.12];
        const v3 = [side * 1.40, 1.08, -1.76];
        const b0 = [side * 1.40, 0.96,  2.20];
        const b1 = [side * 3.80, 0.96,  0.52];
        const b2 = [side * 3.80, 0.96, -1.12];
        const b3 = [side * 1.40, 0.96, -1.76];

        const verts = [...v0, ...v1, ...v2, ...v3, ...b0, ...b1, ...b2, ...b3];
        const indices = side === 1
            ? [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]
            : [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 5, 4, 0, 1, 5, 1, 6, 5, 1, 2, 6, 2, 7, 6, 2, 3, 7, 3, 4, 7, 3, 0, 4];

        innerWingGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        innerWingGeo.setIndex(indices);
        innerWingGeo.computeVertexNormals();
        const innerMesh = new THREE.Mesh(innerWingGeo, f35DarkMat);
        innerMesh.castShadow = true;
        jet.add(innerMesh);

        const hingeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 1.8), foldHingeRedMat);
        hingeStrip.position.set(side * 3.80, 1.02, -0.30);
        jet.add(hingeStrip);
    });

    const wingFoldPivots = [];
    [-1, 1].forEach(side => {
        const foldPivot = new THREE.Group();
        foldPivot.position.set(side * 3.80, 1.05, 0);

        const outerWingGeo = new THREE.BufferGeometry();
        const w0 = [0,             0.06,  0.52];
        const w1 = [side * 1.60,   0.06, -0.60];
        const w2 = [side * 1.60,   0.06, -1.55];
        const w3 = [0,             0.06, -1.12];
        const ub0 = [0,           -0.06,  0.52];
        const ub1 = [side * 1.60, -0.06, -0.60];
        const ub2 = [side * 1.60, -0.06, -1.55];
        const ub3 = [0,           -0.06, -1.12];

        const verts = [...w0, ...w1, ...w2, ...w3, ...ub0, ...ub1, ...ub2, ...ub3];
        const indices = side === 1
            ? [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]
            : [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 5, 4, 0, 1, 5, 1, 6, 5, 1, 2, 6, 2, 7, 6, 2, 3, 7, 3, 4, 7, 3, 0, 4];

        outerWingGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        outerWingGeo.setIndex(indices);
        outerWingGeo.computeVertexNormals();
        const outerMesh = new THREE.Mesh(outerWingGeo, f35DarkMat);
        outerMesh.castShadow = true;
        foldPivot.add(outerMesh);

        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 1.15), f35LightRamMat);
        rail.position.set(side * 1.62, 0, -1.05);
        foldPivot.add(rail);

        jet.add(foldPivot);
        wingFoldPivots.push({ pivot: foldPivot, side, maxAngle: Math.PI * 0.52 });
    });
    jet.userData.wingFoldPivots = wingFoldPivots;

    [-1, 1].forEach(side => {
        const stabShape = new THREE.Shape();
        stabShape.moveTo(0, 0);
        stabShape.lineTo(side * 2.35, -1.10);
        stabShape.lineTo(side * 2.15, -1.95);
        stabShape.lineTo(0, -1.45);
        stabShape.closePath();

        const stabGeo = new THREE.ExtrudeGeometry(stabShape, { depth: 0.10, bevelEnabled: false });
        stabGeo.rotateX(Math.PI / 2);
        const hTail = new THREE.Mesh(stabGeo, f35DarkMat);
        hTail.position.set(side * 1.05, 1.02, -3.8);
        hTail.castShadow = true;
        jet.add(hTail);

        const finShape = new THREE.Shape();
        finShape.moveTo(0, 0);
        finShape.lineTo(-0.85, 2.15);
        finShape.lineTo(0.55, 2.15);
        finShape.lineTo(1.85, 0);
        finShape.closePath();

        const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.12, bevelEnabled: false });
        const vTail = new THREE.Mesh(finGeo, f35DarkMat);
        vTail.rotation.y = Math.PI / 2;
        vTail.rotation.z = side * 0.32;
        vTail.position.set(side * 1.25, 1.15, -3.4);
        vTail.castShadow = true;
        jet.add(vTail);
    });

    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.68, 1.45, 16), nozzleDarkMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0, 0.96, -4.9);
    jet.add(nozzle);

    [-1, 1].forEach(side => {
        const wingDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.58), insigniaDecalMat);
        wingDecal.rotation.x = -Math.PI / 2;
        wingDecal.position.set(side * 2.65, 1.15, -0.32);
        jet.add(wingDecal);
    });

    const burner = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.08, 2.6, 12),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.92 })
    );
    burner.rotation.x = -Math.PI / 2;
    burner.position.set(0, 0.96, -6.0);
    burner.visible = false;
    jet.add(burner);
    jet.userData.afterburners = [burner];

    addLandingGear(jet, 3.8, 1.65, -0.6);
    setWingFoldRatio(jet, foldedWings ? 1.0 : 0.0);

    return jet;
}

// F/A-18E Super Hornet
export function createFA18({ foldedWings = false, tailColor = 0x1e293b } = {}) {
    const jet = new THREE.Group();

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.88, 8.8), fa18GreyMat);
    body.position.set(0, 1.10, 0.2);
    body.castShadow = true;
    jet.add(body);

    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.70, 6.0, 12), fa18GreyMat);
    spine.rotation.x = Math.PI / 2;
    spine.position.set(0, 1.58, -0.4);
    jet.add(spine);

    [-0.92, 0.92].forEach(ix => {
        const caretIntake = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.65, 4.5), fa18NoseMat);
        caretIntake.position.set(ix, 0.95, 0.6);
        caretIntake.rotation.z = ix > 0 ? -0.15 : 0.15;
        jet.add(caretIntake);
    });

    const lex = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.15, 5.2), fa18GreyMat);
    lex.position.set(0, 1.12, 1.5);
    jet.add(lex);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.90, 4.4, 14), fa18NoseMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.96, 5.8);
    nose.scale.set(0.85, 1.0, 0.55);
    jet.add(nose);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.70, 14, 12), canopyBlueMat);
    canopy.position.set(0, 1.62, 2.2);
    canopy.scale.set(0.65, 0.58, 2.4);
    jet.add(canopy);

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(3.4, -1.8);
    wingShape.lineTo(3.4, -3.2);
    wingShape.lineTo(0, -3.2);
    wingShape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.15, bevelEnabled: false });
    wingGeo.rotateX(Math.PI / 2);

    [-1, 1].forEach(side => {
        const wing = new THREE.Mesh(wingGeo, fa18GreyMat);
        wing.position.set(side * 0.95, 1.15, 0.8);
        if (side === -1) wing.scale.x = -1;
        wing.castShadow = true;
        jet.add(wing);

        const wingDecal = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), insigniaDecalMat);
        wingDecal.rotation.x = -Math.PI / 2;
        wingDecal.position.set(side * 2.4, 1.24, -0.4);
        jet.add(wingDecal);
    });

    const wingFoldPivots = [];
    [-1, 1].forEach(side => {
        const foldPivot = new THREE.Group();
        foldPivot.position.set(side * 4.35, 1.15, -0.5);

        const tipShape = new THREE.Shape();
        tipShape.moveTo(0, 0.5);
        tipShape.lineTo(side * 1.55, -0.3);
        tipShape.lineTo(side * 1.55, -1.2);
        tipShape.lineTo(0, -0.9);
        tipShape.closePath();

        const tipGeo = new THREE.ExtrudeGeometry(tipShape, { depth: 0.14, bevelEnabled: false });
        tipGeo.rotateX(Math.PI / 2);
        const tipMesh = new THREE.Mesh(tipGeo, fa18GreyMat);
        tipMesh.castShadow = true;
        foldPivot.add(tipMesh);

        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 1.8), fa18NoseMat);
        rail.position.set(side * 1.55, 0.05, -0.75);
        foldPivot.add(rail);

        const aim9 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8), radarWhiteMat);
        aim9.rotation.x = Math.PI / 2;
        aim9.position.set(side * 1.55, -0.05, -0.75);
        foldPivot.add(aim9);

        jet.add(foldPivot);
        wingFoldPivots.push({ pivot: foldPivot, side, maxAngle: Math.PI * 0.50 });
    });
    jet.userData.wingFoldPivots = wingFoldPivots;

    [-1.85, 1.85].forEach(px => {
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 1.5), fa18NoseMat);
        pylon.position.set(px, 0.88, -0.4);
        jet.add(pylon);
        const dropTank = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 2.8, 10), fa18GreyMat);
        dropTank.rotation.x = Math.PI / 2;
        dropTank.position.set(px, 0.65, -0.4);
        jet.add(dropTank);
    });

    [-1, 1].forEach(side => {
        const stab = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.13, 1.90), fa18GreyMat);
        stab.position.set(side * 2.15, 0.98, -3.8);
        stab.rotation.y = -side * 0.22;
        stab.castShadow = true;
        jet.add(stab);

        const tailFlashMat = new THREE.MeshStandardMaterial({ color: tailColor, roughness: 0.45 });
        const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.15, 2.35), fa18GreyMat);
        vTail.position.set(side * 1.15, 2.15, -2.6);
        vTail.rotation.z = -side * 0.35;
        vTail.rotation.y = -side * 0.08;
        vTail.castShadow = true;
        jet.add(vTail);

        const tailCap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.38, 2.05), tailFlashMat);
        tailCap.position.set(side * 1.52, 3.12, -2.7);
        tailCap.rotation.z = -side * 0.35;
        jet.add(tailCap);
    });

    const burners = [];
    [-0.52, 0.52].forEach(nx => {
        const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 1.1, 12), nozzleDarkMat);
        noz.rotation.x = Math.PI / 2;
        noz.position.set(nx, 1.08, -4.2);
        jet.add(noz);

        const ab = new THREE.Mesh(
            new THREE.CylinderGeometry(0.32, 0.06, 2.4, 10),
            new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.92 })
        );
        ab.rotation.x = -Math.PI / 2;
        ab.position.set(nx, 1.08, -5.4);
        ab.visible = false;
        jet.add(ab);
        burners.push(ab);
    });
    jet.userData.afterburners = burners;

    addLandingGear(jet, 3.6, 1.55, -0.6);
    setWingFoldRatio(jet, foldedWings ? 1.0 : 0.0);

    return jet;
}

// E-2D Advanced Hawkeye
export function createE2DHawkeye({ foldedWings = false } = {}) {
    const awacs = new THREE.Group();

    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.95, 11.6, 18), e2BodyMat);
    body.rotation.x = Math.PI / 2;
    body.position.set(0, 1.62, 0.2);
    body.scale.set(1.0, 1.0, 1.05);
    body.castShadow = true;
    awacs.add(body);

    const dorsalScoop = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.48, 5.4), e2BodyMat);
    dorsalScoop.position.set(0, 2.65, -0.2);
    awacs.add(dorsalScoop);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.10, 16, 14), e2BodyMat);
    nose.position.set(0, 1.62, 5.8);
    nose.scale.set(1.0, 0.88, 1.45);
    awacs.add(nose);

    const radomeTip = new THREE.Mesh(new THREE.SphereGeometry(0.66, 12, 10), tireBlackMat);
    radomeTip.position.set(0, 1.48, 7.05);
    awacs.add(radomeTip);

    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.60, 1.6), canopyBlueMat);
    cockpit.position.set(0, 2.45, 4.2);
    awacs.add(cockpit);

    const centerWing = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.28, 2.4), e2BodyMat);
    centerWing.position.set(0, 2.38, 0.5);
    centerWing.castShadow = true;
    awacs.add(centerWing);

    const wingFoldPivots = [];
    [-1, 1].forEach(side => {
        const outerWing = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.24, 1.9), e2BodyMat);
        outerWing.position.set(side * 2.2, 0, 0);
        outerWing.castShadow = true;

        const foldPivot = new THREE.Group();
        foldPivot.position.set(side * 4.2, 2.38, 0.5);
        foldPivot.add(outerWing);
        awacs.add(foldPivot);

        wingFoldPivots.push({ pivot: foldPivot, side, maxAngle: Math.PI * 0.48 });
    });
    awacs.userData.wingFoldPivots = wingFoldPivots;

    [-2.8, 2.8].forEach(nx => {
        const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.50, 4.0, 14), e2BodyMat);
        nacelle.rotation.x = Math.PI / 2;
        nacelle.position.set(nx, 2.05, 0.5);
        nacelle.castShadow = true;
        awacs.add(nacelle);

        const propGroup = new THREE.Group();
        propGroup.position.set(nx, 2.05, 2.65);
        const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.92, 14), radarWhiteMat);
        spinner.rotation.x = Math.PI / 2;
        spinner.position.z = 0.46;
        propGroup.add(spinner);

        for (let b = 0; b < 8; b++) {
            const blade = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.18, 0.05), tireBlackMat);
            blade.rotation.z = (b * Math.PI) / 4;
            const tipStripe = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.19, 0.06), radarWhiteMat);
            tipStripe.position.x = 1.25;
            blade.add(tipStripe);
            propGroup.add(blade);
        }
        awacs.add(propGroup);
        spinningPropsAndDomes.push({ mesh: propGroup, speed: 24, axis: 'z' });
    });

    [-0.65, 0.65].forEach(sx => {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.60, 8), e2BodyMat);
        strut.position.set(sx, 3.25, -0.6);
        strut.rotation.z = sx > 0 ? -0.22 : 0.22;
        awacs.add(strut);
    });

    const rotodome = new THREE.Group();
    rotodome.position.set(0, 4.15, -0.6);
    const rotodomeTex = createRotodomeTexture();
    const dishMat = new THREE.MeshStandardMaterial({ map: rotodomeTex, roughness: 0.38 });
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(4.05, 4.05, 0.68, 36), dishMat);
    dish.castShadow = true;
    rotodome.add(dish);

    const topCap = new THREE.Mesh(new THREE.CircleGeometry(4.02, 36), dishMat);
    topCap.rotation.x = -Math.PI / 2;
    topCap.position.y = 0.35;
    rotodome.add(topCap);

    awacs.add(rotodome);
    spinningPropsAndDomes.push({ mesh: rotodome, speed: 1.25, axis: 'y' });

    const hTail = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.18, 1.70), e2BodyMat);
    hTail.position.set(0, 2.55, -4.8);
    awacs.add(hTail);

    [-2.6, -0.9, 0.9, 2.6].forEach(fx => {
        const vFin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.15, 1.85), e2BodyMat);
        vFin.position.set(fx, 3.20, -4.8);
        vFin.castShadow = true;
        awacs.add(vFin);

        const finCap = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.30, 1.70), tireBlackMat);
        finCap.position.set(fx, 4.25, -4.8);
        awacs.add(finCap);
    });

    addLandingGear(awacs, 4.2, 2.1, 0.3);
    setWingFoldRatio(awacs, foldedWings ? 1.0 : 0.0);

    return awacs;
}

// MH-60S Seahawk Naval Combat Helicopter
export function createSeahawk() {
    const heli = new THREE.Group();

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.20, 1.70, 6.6), heloDarkMat);
    cabin.position.set(0, 1.40, 0.6);
    cabin.castShadow = true;
    heli.add(cabin);

    [-1.11, 1.11].forEach(side => {
        const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.60, 2.9), canopyBlueMat);
        sideWin.position.set(side, 1.54, 0.9);
        heli.add(sideWin);
    });

    const doghouse = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.68, 3.9), heloDarkMat);
    doghouse.position.set(0, 2.42, 0.35);
    heli.add(doghouse);

    [-0.58, 0.58].forEach(ex => {
        const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.30, 0.95, 10), nozzleDarkMat);
        exhaust.rotation.x = Math.PI / 2;
        exhaust.position.set(ex, 2.36, -1.70);
        heli.add(exhaust);
    });

    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.08, 16, 12), heloDarkMat);
    nose.scale.set(0.96, 0.80, 1.48);
    nose.position.set(0, 1.24, 3.80);
    heli.add(nose);

    const flirBall = new THREE.Mesh(new THREE.SphereGeometry(0.30, 12, 10), nozzleDarkMat);
    flirBall.position.set(0, 0.96, 5.05);
    heli.add(flirBall);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.70, 1.40), canopyBlueMat);
    windshield.position.set(0, 1.70, 3.30);
    windshield.rotation.x = -0.24;
    heli.add(windshield);

    const tailBoom = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.88, 6.0), heloDarkMat);
    tailBoom.position.set(0, 1.60, -4.6);
    tailBoom.castShadow = true;
    heli.add(tailBoom);

    const tailPylon = new THREE.Mesh(new THREE.BoxGeometry(0.38, 2.30, 1.40), heloDarkMat);
    tailPylon.position.set(0, 2.46, -7.2);
    tailPylon.rotation.x = -0.18;
    heli.add(tailPylon);

    const stabilator = new THREE.Mesh(new THREE.BoxGeometry(3.40, 0.12, 0.92), heloDarkMat);
    stabilator.position.set(0, 1.38, -7.35);
    heli.add(stabilator);

    [-1.28, 1.28].forEach(side => {
        const sponson = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.38, 1.45), heloDarkMat);
        sponson.position.set(side * 0.95, 0.84, 1.15);
        heli.add(sponson);

        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.24, 14), tireBlackMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side, 0.35, 1.2);
        heli.add(wheel);
    });

    const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.15, 10), tireBlackMat);
    tailWheel.rotation.z = Math.PI / 2;
    tailWheel.position.set(0, 0.25, -4.9);
    heli.add(tailWheel);

    const mainRotor = new THREE.Group();
    mainRotor.position.set(0, 2.92, 0.85);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.46, 14), nozzleDarkMat);
    mainRotor.add(hub);
    for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.06, 0.42), tireBlackMat);
        blade.rotation.y = (i * Math.PI) / 2;
        blade.castShadow = true;
        mainRotor.add(blade);
    }
    const rotorBlur = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 5.3, 32),
        new THREE.MeshBasicMaterial({ color: 0xcbd5e1, side: THREE.DoubleSide, transparent: true, opacity: 0.16 })
    );
    rotorBlur.rotation.x = Math.PI / 2;
    mainRotor.add(rotorBlur);
    heli.add(mainRotor);

    const tailRotor = new THREE.Group();
    tailRotor.position.set(0.36, 3.02, -7.42);
    for (let i = 0; i < 4; i++) {
        const tBlade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.30, 0.22), tireBlackMat);
        tBlade.rotation.x = (i * Math.PI) / 4;
        tailRotor.add(tBlade);
    }
    heli.add(tailRotor);

    const rotorEntry = { mainRotor, tailRotor, speed: 17.5 };
    allHeliRotors.push(rotorEntry);
    heli.userData.rotorEntry = rotorEntry;
    return heli;
}

// Deck Tractor ("Mule" / Tug)
export function createDeckTractor(colorHex = 0xeab308) {
    const tug = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.45 });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.75, 3.50), bodyMat);
    chassis.position.y = 0.52;
    chassis.castShadow = true;
    tug.add(chassis);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.30, 1.40), bodyMat);
    hood.position.set(0, 0.98, 0.88);
    hood.castShadow = true;
    tug.add(hood);

    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.48, 0.08), tireBlackMat);
    grille.position.set(0, 0.52, 1.76);
    tug.add(grille);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.50, 1.28), tireBlackMat);
    cab.position.set(0, 1.08, -0.65);
    cab.castShadow = true;
    tug.add(cab);

    [-1.02, 1.02].forEach(wx => {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.29, 14), tireBlackMat);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(wx, 0.39, 0.85);
        tire.castShadow = true;
        tug.add(tire);
    });

    [-1.02, 1.02].forEach(wx => {
        [-0.85, -1.35].forEach(wz => {
            const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.25, 14), tireBlackMat);
            tire.rotation.z = Math.PI / 2;
            tire.position.set(wx, 0.39, wz);
            tire.castShadow = true;
            tug.add(tire);

            const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.31, 10), radarWhiteMat);
            rim.rotation.z = Math.PI / 2;
            rim.position.set(wx, 0.39, wz);
            tug.add(rim);
        });
    });

    return tug;
}

// Navy Personnel ("Skittles")
const crewPantsMat = new THREE.MeshStandardMaterial({ color: 0x172554, roughness: 0.78 });
const crewBootMat  = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85 });
const crewSkinMat  = new THREE.MeshStandardMaterial({ color: 0xd6a786, roughness: 0.65 });
const crewVisorMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.15, metalness: 0.85 });
const wandGlowMat  = new THREE.MeshBasicMaterial({ color: 0xfde047 });

export function createNavyPersonnel(spec) {
    const person = new THREE.Group();
    const jerseyMat = new THREE.MeshStandardMaterial({ color: spec.jersey, roughness: 0.62 });
    const vestMat   = new THREE.MeshStandardMaterial({ color: spec.vest,   roughness: 0.52 });
    const helmetMat = new THREE.MeshStandardMaterial({ color: spec.helmet, roughness: 0.38 });

    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.11, 0.72, 0);
    const lThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.62, 8), crewPantsMat);
    lThigh.position.y = -0.31;
    lThigh.castShadow = true;
    leftLeg.add(lThigh);
    const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.24), crewBootMat);
    lBoot.position.set(0, -0.66, 0.04);
    leftLeg.add(lBoot);
    person.add(leftLeg);

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.11, 0.72, 0);
    const rThigh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.62, 8), crewPantsMat);
    rThigh.position.y = -0.31;
    rThigh.castShadow = true;
    rightLeg.add(rThigh);
    const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.24), crewBootMat);
    rBoot.position.set(0, -0.66, 0.04);
    rightLeg.add(rBoot);
    person.add(rightLeg);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.56, 0.22), jerseyMat);
    torso.position.set(0, 1.00, 0);
    torso.castShadow = true;
    person.add(torso);

    const floatVest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.27), vestMat);
    floatVest.position.set(0, 1.03, 0);
    person.add(floatVest);

    const reflectTape = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.05, 0.28), radarWhiteMat);
    reflectTape.position.set(0, 1.14, 0);
    person.add(reflectTape);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.42, 0);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), crewSkinMat);
    headGroup.add(head);

    const cranial = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 10), helmetMat);
    cranial.position.set(0, 0.02, -0.01);
    cranial.scale.set(1.0, 1.05, 1.08);
    cranial.castShadow = true;
    headGroup.add(cranial);

    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.14), crewVisorMat);
    goggles.position.set(0, 0.02, 0.10);
    headGroup.add(goggles);

    [-0.16, 0.16].forEach(ex => {
        const earCup = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), crewBootMat);
        earCup.scale.set(0.65, 1.15, 0.9);
        earCup.position.set(ex, 0.0, 0.0);
        headGroup.add(earCup);
    });
    person.add(headGroup);

    const leftArm = new THREE.Group();
    leftArm.position.set(-0.25, 1.22, 0);
    const lSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.48, 8), jerseyMat);
    lSleeve.position.y = -0.22;
    leftArm.add(lSleeve);

    const rightArm = new THREE.Group();
    rightArm.position.set(0.25, 1.22, 0);
    const rSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.48, 8), jerseyMat);
    rSleeve.position.y = -0.22;
    rightArm.add(rSleeve);

    if (spec.pose === 'MARSHAL') {
        [leftArm, rightArm].forEach(arm => {
            const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 6), wandGlowMat);
            wand.position.set(0, -0.52, 0.06);
            wand.rotation.x = 0.35;
            arm.add(wand);
        });
    } else if (spec.pose === 'CARRY') {
        const chock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.32), wandGlowMat);
        chock.position.set(0, -0.46, 0.08);
        rightArm.add(chock);
    }

    person.add(leftArm);
    person.add(rightArm);
    person.scale.setScalar(1.08);
    person.userData.limbs = { leftLeg, rightLeg, leftArm, rightArm, headGroup, pose: spec.pose };
    return person;
}

export function createParkingChocksGroup(x, z, rotY) {
    const g = new THREE.Group();
    g.position.set(x, 0.08, z);
    g.rotation.y = rotY;
    [-1.45, 1.45].forEach(wx => {
        const chockF = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.16, 0.22), yellowGearMat);
        chockF.position.set(wx, 0, -0.45);
        g.add(chockF);
        const chockB = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.16, 0.22), yellowGearMat);
        chockB.position.set(wx, 0, -1.25);
        g.add(chockB);
    });
    return g;
}
