import * as THREE from 'three';
import { HIGHWAY_SAMPLES, clamp } from './noise.js';
import { ATMO_UNIFORMS, enhancePBRMaterial } from './atmosphere.js';
import { getCityGroundY } from './city.js';

const ARCHETYPES = {
  supercar: {
    label: 'Banshee GT',
    length: 4.45,
    width: 1.98,
    bodyH: 0.48,
    cabH: 0.40,
    cabZ: 0.14,
    cabLen: 1.78,
    wheelR: 0.34,
    wheelW: 0.27,
    topSpeed: 48.0,
    accel: 30.0,
    turnRate: 2.45,
    spoiler: true
  },
  muscle: {
    label: 'Dominator V8',
    length: 4.65,
    width: 1.96,
    bodyH: 0.58,
    cabH: 0.42,
    cabZ: 0.22,
    cabLen: 1.88,
    wheelR: 0.36,
    wheelW: 0.26,
    topSpeed: 42.0,
    accel: 26.0,
    turnRate: 2.30,
    spoiler: true,
    stripes: true
  },
  sedan: {
    label: 'Executive Sedan',
    length: 4.62,
    width: 1.88,
    bodyH: 0.60,
    cabH: 0.48,
    cabZ: 0.06,
    cabLen: 2.15,
    wheelR: 0.35,
    wheelW: 0.23,
    topSpeed: 34.0,
    accel: 20.0,
    turnRate: 2.15
  },
  suv: {
    label: 'Urban SUV',
    length: 4.78,
    width: 2.04,
    bodyH: 0.74,
    cabH: 0.60,
    cabZ: 0.24,
    cabLen: 2.58,
    wheelR: 0.42,
    wheelW: 0.27,
    topSpeed: 31.0,
    accel: 18.0,
    turnRate: 1.95,
    roofRails: true
  },
  taxi: {
    label: 'Downtown Cab',
    length: 4.58,
    width: 1.88,
    bodyH: 0.61,
    cabH: 0.48,
    cabZ: 0.06,
    cabLen: 2.12,
    wheelR: 0.35,
    wheelW: 0.23,
    topSpeed: 33.5,
    accel: 20.5,
    turnRate: 2.20,
    isTaxi: true
  },
  truck: {
    label: 'Delivery Truck',
    length: 6.20,
    width: 2.32,
    bodyH: 0.76,
    cabH: 1.45,
    cabZ: -1.85,
    cabLen: 1.65,
    wheelR: 0.45,
    wheelW: 0.30,
    topSpeed: 26.0,
    accel: 13.5,
    turnRate: 1.65,
    isTruck: true
  },
  police: {
    label: 'LSPD Interceptor',
    length: 4.72,
    width: 1.94,
    bodyH: 0.62,
    cabH: 0.50,
    cabZ: 0.06,
    cabLen: 2.20,
    wheelR: 0.36,
    wheelW: 0.25,
    topSpeed: 41.0,
    accel: 25.5,
    turnRate: 2.32,
    isPolice: true
  }
};

function buildTrafficRoutes(city) {
  // Route 4 & Route 5: Ring Expressway & Causeway Two-Way Loop
  const routeHwyA = [];
  const routeHwyB = [];
  for (let i = 0; i < HIGHWAY_SAMPLES.length; i += 4) {
    const s = HIGHWAY_SAMPLES[i];
    const nx = -s.tz;
    const nz = s.tx;
    routeHwyA.push({ x: s.x + nx * 3.5, z: s.z + nz * 3.5, hwY: s.y });
  }
  for (let i = HIGHWAY_SAMPLES.length - 1; i >= 0; i -= 4) {
    const s = HIGHWAY_SAMPLES[i];
    const nx = -s.tz;
    const nz = s.tx;
    routeHwyB.push({ x: s.x - nx * 3.5, z: s.z - nz * 3.5, hwY: s.y });
  }

  const cityRoutes = city && city.trafficRoutes ? city.trafficRoutes : [
    [{ x: -195, z: -555 }, { x: -740, z: -610 }, { x: -740, z: -245 }, { x: -195, z: -245 }],
    [{ x: -460, z: -1075 }, { x: -920, z: -1050 }, { x: -920, z: -245 }, { x: -460, z: -245 }],
    [{ x: -190, z: -556 }, { x: -1420, z: -655 }, { x: -1420, z: -685 }, { x: -190, z: -582 }],
    [{ x: -140, z: -1650 }, { x: -140, z: -240 }, { x: -460, z: -240 }, { x: -460, z: -1650 }]
  ];

  return [...cityRoutes, routeHwyA, routeHwyB];
}

/** Creates 28 multi-LOD GTA vehicles with sculpted bodywork, autonomous city/highway traffic, police chase & carjacking. */
export function createVehicleSystem(texLib, city, assetManager, lodManager) {
  const root = new THREE.Group();
  const cars = [];
  const routes = buildTrafficRoutes(city);

  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.88, metalness: 0.06 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd4dbe3, roughness: 0.22, metalness: 0.88 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e1822, roughness: 0.08, metalness: 0.82 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xdce2ea, roughness: 0.20, metalness: 0.92 });
  const underMat = new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 0.92 });
  const cargoBoxMat = new THREE.MeshStandardMaterial({ color: 0xe6e8ec, roughness: 0.64, metalness: 0.12 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xf0e4b4, roughness: 0.5 });
  const headLightMat = new THREE.MeshBasicMaterial({ color: 0xfff8e2 });
  const driverShirtMat = new THREE.MeshStandardMaterial({ color: 0x3b6fa8, roughness: 0.8 });
  const driverSkinMat = new THREE.MeshStandardMaterial({ color: 0xe2b18c, roughness: 0.72 });

  [rubberMat, rimMat, glassMat, chromeMat, underMat, cargoBoxMat].forEach((m, i) => {
    enhancePBRMaterial(m, { cacheKey: `botw_car_shared_${i}` });
  });

  // Soft ground contact shadow decal + optional night headlight glow cone
  const shCanvas = document.createElement('canvas');
  shCanvas.width = 64;
  shCanvas.height = 128;
  const sctx = shCanvas.getContext('2d');
  const grad = sctx.createRadialGradient(32, 64, 6, 32, 64, 34);
  grad.addColorStop(0, 'rgba(0,0,0,0.68)');
  grad.addColorStop(0.65, 'rgba(0,0,0,0.34)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 64, 128);
  const shadowTex = new THREE.CanvasTexture(shCanvas);
  const contactShadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });

  const beamCanvas = document.createElement('canvas');
  beamCanvas.width = 64;
  beamCanvas.height = 128;
  const bctx = beamCanvas.getContext('2d');
  const bGrad = bctx.createLinearGradient(0, 128, 0, 0);
  bGrad.addColorStop(0.0, 'rgba(255, 244, 210, 0.42)');
  bGrad.addColorStop(0.55, 'rgba(255, 240, 195, 0.14)');
  bGrad.addColorStop(1.0, 'rgba(255, 240, 195, 0.0)');
  bctx.fillStyle = bGrad;
  bctx.beginPath();
  bctx.moveTo(22, 128);
  bctx.lineTo(42, 128);
  bctx.lineTo(64, 0);
  bctx.lineTo(0, 0);
  bctx.closePath();
  bctx.fill();
  const beamTex = new THREE.CanvasTexture(beamCanvas);
  const headlightBeamMat = new THREE.MeshBasicMaterial({
    map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.0
  });

  function createCarLOD(typeKey, paintHex) {
    const spec = ARCHETYPES[typeKey];
    const lod = new THREE.LOD();
    const tiltPivot = new THREE.Group();

    const paintMat = new THREE.MeshStandardMaterial({
      color: paintHex,
      roughness: typeKey === 'truck' ? 0.36 : 0.16,
      metalness: typeKey === 'truck' ? 0.35 : 0.78
    });
    enhancePBRMaterial(paintMat, { cacheKey: 'botw_car_paint', cloudShadows: false });

    const whiteDoorMat = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.20, metalness: 0.48 });
    enhancePBRMaterial(whiteDoorMat, { cacheKey: 'botw_car_pdwhite', cloudShadows: false });

    const tailMat = new THREE.MeshBasicMaterial({ color: 0xc21e1e });
    const beaconRedMat = new THREE.MeshBasicMaterial({ color: 0x330808 });
    const beaconBlueMat = new THREE.MeshBasicMaterial({ color: 0x081638 });

    const wheelY = spec.wheelR;
    const chassisBase = wheelY - 0.04;
    const halfL = spec.length * 0.5;
    const bh = spec.bodyH;
    const ch = spec.cabH;
    const bodyBaseY = chassisBase + 0.14;

    // Ground soft contact shadow + night headlight cone
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(spec.width * 1.24, spec.length * 1.14), contactShadowMat);
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.03;
    tiltPivot.add(sh);

    const beamMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 9.5), headlightBeamMat);
    beamMesh.rotation.x = -Math.PI / 2;
    beamMesh.position.set(0, 0.08, -halfL - 4.75);
    tiltPivot.add(beamMesh);

    // Dark recessed underbody + wheel well arches
    const underMesh = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.94, 0.22, spec.length * 1.01), underMat);
    underMesh.position.y = chassisBase + 0.11;
    tiltPivot.add(underMesh);

    if (spec.isTruck) {
      // Sculpted Cab-Over Front + White Freight Cargo Box
      const cabMesh = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.94, 1.85, 1.85), paintMat);
      cabMesh.position.set(0, chassisBase + 1.05, -halfL + 0.96);
      cabMesh.castShadow = cabMesh.receiveShadow = true;
      const ws = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.88, 0.72, 0.08), glassMat);
      ws.position.set(0, chassisBase + 1.48, -halfL + 0.04);
      const cargo = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.98, 2.25, spec.length - 2.15), cargoBoxMat);
      cargo.position.set(0, chassisBase + 1.32, 0.98);
      cargo.castShadow = cargo.receiveShadow = true;
      tiltPivot.add(cabMesh, ws, cargo);
    } else {
      // Sculpted aerodynamic ExtrudeGeometry automotive chassis + greenhouse
      const hoodY = bh * (typeKey === 'supercar' ? 0.56 : 0.75);
      const roofRearZ = typeKey === 'suv' ? spec.cabZ + spec.cabLen * 0.47 : spec.cabZ + spec.cabLen * 0.43;
      const roofRearY = typeKey === 'suv' ? bh + ch : bh + ch * 0.96;
      const roofFrontZ = spec.cabZ - spec.cabLen * 0.25;
      const cowlZ = -halfL * 0.27;

      const prof = new THREE.Shape();
      prof.moveTo(-halfL, 0.07);
      prof.lineTo(-halfL * 0.94, 0.0);
      prof.lineTo(halfL * 0.94, 0.0);
      prof.lineTo(halfL, 0.07);
      prof.lineTo(halfL, bh * 0.88);
      prof.lineTo(halfL * 0.76, bh);
      prof.lineTo(roofRearZ, roofRearY);
      prof.lineTo(roofFrontZ, bh + ch);
      prof.lineTo(cowlZ, bh + 0.04);
      prof.lineTo(-halfL * 0.93, hoodY);
      prof.lineTo(-halfL, bh * 0.42);
      prof.closePath();

      const bodyW = spec.width - 0.14;
      const shellGeo = new THREE.ExtrudeGeometry(prof, {
        depth: bodyW, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 2
      });
      shellGeo.translate(0, 0, -bodyW * 0.5);
      shellGeo.rotateY(-Math.PI / 2);
      shellGeo.computeVertexNormals();

      const shellMesh = new THREE.Mesh(shellGeo, paintMat);
      shellMesh.position.y = bodyBaseY;
      shellMesh.castShadow = shellMesh.receiveShadow = true;
      tiltPivot.add(shellMesh);

      if (spec.isPolice) {
        const doorBand = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 0.02, bh * 0.86, spec.cabLen * 0.90), whiteDoorMat);
        doorBand.position.set(0, bodyBaseY + bh * 0.46, spec.cabZ);
        const roofCap = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.78, 0.08, spec.cabLen * 0.65), whiteDoorMat);
        roofCap.position.set(0, bodyBaseY + bh + ch + 0.04, spec.cabZ + 0.1);
        const pushBar = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.34, 0.12), underMat);
        pushBar.position.set(0, bodyBaseY + bh * 0.38, -halfL - 0.10);
        tiltPivot.add(doorBand, roofCap, pushBar);
      }

      if (spec.stripes) {
        for (const sx of [-0.18, 0.18]) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, halfL * 1.15), whiteDoorMat);
          st.position.set(sx, bodyBaseY + hoodY + 0.09, -halfL * 0.38);
          tiltPivot.add(st);
        }
      }

      const windLen = Math.hypot(roofFrontZ - cowlZ, ch - 0.04);
      const windPitch = Math.atan2(ch - 0.04, roofFrontZ - cowlZ);
      const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.92, 0.06, windLen), glassMat);
      frontGlass.position.set(0, bodyBaseY + bh + ch * 0.52 + 0.05, (roofFrontZ + cowlZ) * 0.5 - 0.04);
      frontGlass.rotation.x = windPitch;

      const rearEndZ = halfL * 0.76;
      const rearGlassLen = Math.hypot(rearEndZ - roofRearZ, roofRearY - bh);
      const rearGlassPitch = -Math.atan2(roofRearY - bh, rearEndZ - roofRearZ);
      const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.94, 0.07, rearGlassLen), glassMat);
      rearGlass.position.set(0, bodyBaseY + (bh + roofRearY) * 0.5 + 0.08, (roofRearZ + rearEndZ) * 0.5 + 0.05);
      rearGlass.rotation.x = rearGlassPitch;

      const sideWin = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.15, ch * 0.66, (roofRearZ - roofFrontZ) * 1.15), glassMat);
      sideWin.position.set(0, bodyBaseY + bh + ch * 0.44, spec.cabZ);
      tiltPivot.add(frontGlass, rearGlass, sideWin);

      for (const sx of [-1, 1]) {
        const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.12), paintMat);
        mirror.position.set(sx * (spec.width * 0.53), bodyBaseY + bh + 0.08, cowlZ - 0.05);
        tiltPivot.add(mirror);
      }
    }

    // Grille, Rear Diffuser, Twin Chrome Exhausts, License Plates, Headlights & Taillights
    const grille = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.48, 0.19, 0.09), chromeMat);
    grille.position.set(0, bodyBaseY + bh * 0.34, -halfL - 0.04);
    const rearDiffuser = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.88, 0.16, 0.14), underMat);
    rearDiffuser.position.set(0, bodyBaseY + 0.09, halfL + 0.04);
    const tailBezel = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.88, 0.15, 0.08), underMat);
    tailBezel.position.set(0, bodyBaseY + bh * 0.64, halfL + 0.02);
    const rearPlate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.05), plateMat);
    rearPlate.position.set(0, bodyBaseY + bh * 0.32, halfL + 0.06);
    tiltPivot.add(grille, rearDiffuser, tailBezel, rearPlate);

    for (const ex of [-0.46, 0.46]) {
      const exhaustGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.18, 10);
      exhaustGeo.rotateX(Math.PI * 0.5);
      const exhaust = new THREE.Mesh(exhaustGeo, chromeMat);
      exhaust.position.set(ex, bodyBaseY + 0.10, halfL + 0.07);
      tiltPivot.add(exhaust);
    }

    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.10, 0.09), headLightMat);
      hl.position.set(sx * spec.width * 0.36, bodyBaseY + bh * 0.48, -halfL - 0.04);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.10, 0.09), tailMat);
      tl.position.set(sx * spec.width * 0.34, bodyBaseY + bh * 0.64, halfL + 0.05);
      tiltPivot.add(hl, tl);
    }
    const tailStrip = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.72, 0.04, 0.08), tailMat);
    tailStrip.position.set(0, bodyBaseY + bh * 0.64, halfL + 0.05);
    tiltPivot.add(tailStrip);

    // Sports Wing / SUV Rails / Taxi Sign / Police Lightbar
    if (spec.spoiler) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.90, 0.05, 0.28), paintMat);
      wing.position.set(0, bodyBaseY + bh + 0.24, halfL * 0.88);
      tiltPivot.add(wing);
      for (const sx of [-1, 1]) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.12), underMat);
        st.position.set(sx * 0.54, bodyBaseY + bh + 0.12, halfL * 0.88);
        tiltPivot.add(st);
      }
    }
    if (spec.roofRails) {
      for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, spec.cabLen * 0.80), chromeMat);
        rail.position.set(sx * spec.width * 0.33, bodyBaseY + bh + ch + 0.08, spec.cabZ);
        tiltPivot.add(rail);
      }
    }
    if (spec.isTaxi) {
      const taxiTop = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.20, 0.26), new THREE.MeshBasicMaterial({ color: 0xffe466 }));
      taxiTop.position.set(0, bodyBaseY + bh + ch + 0.12, spec.cabZ - 0.1);
      tiltPivot.add(taxiTop);
    }
    if (spec.isPolice) {
      const barBase = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.62, 0.08, 0.26), underMat);
      barBase.position.set(0, bodyBaseY + bh + ch + 0.08, spec.cabZ - 0.1);
      const redPod = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.26, 0.11, 0.22), beaconRedMat);
      redPod.position.set(-spec.width * 0.16, bodyBaseY + bh + ch + 0.13, spec.cabZ - 0.1);
      const bluePod = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.26, 0.11, 0.22), beaconBlueMat);
      bluePod.position.set(spec.width * 0.16, bodyBaseY + bh + ch + 0.13, spec.cabZ - 0.1);
      tiltPivot.add(barBase, redPod, bluePod);
    }

    // Nitro Exhaust Flames
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x48e8ff, transparent: true, opacity: 0.9 });
    const flames = [];
    for (const sx of [-0.42, 0.42]) {
      const fg = new THREE.ConeGeometry(0.09, 0.55, 6);
      fg.rotateX(Math.PI * 0.5);
      const fl = new THREE.Mesh(fg, flameMat);
      fl.position.set(sx, chassisBase + 0.14, spec.length * 0.50 + 0.24);
      fl.visible = false;
      tiltPivot.add(fl);
      flames.push(fl);
    }

    // Driver Silhouette (tucked cleanly inside cabin so head never clips through low sports roof!)
    const driverMesh = new THREE.Group();
    const cabY = bodyBaseY + bh + ch * 0.12;
    const dTorso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.20), driverShirtMat);
    const dHead = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 8), driverSkinMat);
    dHead.position.y = Math.min(0.18, ch * 0.38);
    driverMesh.add(dTorso, dHead);
    driverMesh.position.set(-spec.width * 0.22, cabY, spec.cabZ - 0.18);
    tiltPivot.add(driverMesh);

    // 4 Recessed Wheel Arches + 4 Articulated Wheels
    const frontPivots = [];
    const wheelMeshes = [];
    const tireGeo = new THREE.CylinderGeometry(spec.wheelR, spec.wheelR, spec.wheelW, 14);
    tireGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(spec.wheelR * 0.62, spec.wheelR * 0.62, spec.wheelW + 0.02, 10);
    hubGeo.rotateZ(Math.PI / 2);

    const zFront = -spec.length * 0.31;
    const zRear = spec.length * 0.31;
    const xWheel = spec.width * 0.47;

    [
      { x: -xWheel, z: zFront, front: true },
      { x: xWheel, z: zFront, front: true },
      { x: -xWheel, z: zRear, front: false },
      { x: xWheel, z: zRear, front: false }
    ].forEach((w) => {
      const wGrp = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, rubberMat);
      tire.castShadow = true;
      const hub = new THREE.Mesh(hubGeo, rimMat);
      wGrp.add(tire, hub);
      wheelMeshes.push(wGrp);

      if (w.front) {
        const steerPivot = new THREE.Group();
        steerPivot.position.set(w.x, wheelY, w.z);
        steerPivot.add(wGrp);
        tiltPivot.add(steerPivot);
        frontPivots.push(steerPivot);
      } else {
        wGrp.position.set(w.x, wheelY, w.z);
        tiltPivot.add(wGrp);
      }
    });

    // LOD1 (95..240m): Clean simplified silhouette (chassis + cab)
    const lod1Group = new THREE.Group();
    const l1Body = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.96, bh + 0.15, spec.length * 0.98), paintMat);
    l1Body.position.y = chassisBase + bh * 0.5 + 0.1;
    const l1Cab = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.84, ch + 0.1, spec.cabLen), glassMat);
    l1Cab.position.set(0, chassisBase + bh + ch * 0.5, spec.cabZ);
    lod1Group.add(l1Body, l1Cab);

    // LOD2 (> 240m): Single colored hull proxy (4-corner city/highway traffic from overlooks!)
    const lod2Group = new THREE.Group();
    const l2Hull = new THREE.Mesh(new THREE.BoxGeometry(spec.width, bh + ch * 0.85, spec.length), paintMat);
    l2Hull.position.y = chassisBase + (bh + ch * 0.85) * 0.5;
    lod2Group.add(l2Hull);

    lod.addLevel(tiltPivot, 0);
    lod.addLevel(lod1Group, 95);
    lod.addLevel(lod2Group, 240);
    root.add(lod);
    if (lodManager) lodManager.addLODObject(lod);

    return {
      carGrp: lod,
      tiltPivot,
      frontPivots,
      wheelMeshes,
      tailMat,
      beaconRedMat,
      beaconBlueMat,
      flames,
      driverMesh
    };
  }

  // Spawn 28 GTA Vehicles: 13 City AI + 7 Highway AI + 5 Curated Parked Hero Cars + 3 Police Interceptors
  const spawnList = [
    // City AI Traffic (Routes 0..3)
    { type: 'supercar', color: 0xd41e26, route: 0, wp: 0, t: 0.15, ai: true },
    { type: 'sedan',    color: 0xb8c2cc, route: 0, wp: 1, t: 0.45, ai: true },
    { type: 'suv',      color: 0x2a4d6e, route: 0, wp: 2, t: 0.35, ai: true },
    { type: 'taxi',     color: 0xeeb422, route: 0, wp: 3, t: 0.55, ai: true },
    { type: 'muscle',   color: 0xe68822, route: 1, wp: 0, t: 0.25, ai: true },
    { type: 'truck',    color: 0x3b5878, route: 1, wp: 1, t: 0.60, ai: true },
    { type: 'sedan',    color: 0x1e2228, route: 1, wp: 2, t: 0.40, ai: true },
    { type: 'taxi',     color: 0xeeb422, route: 2, wp: 0, t: 0.22, ai: true },
    { type: 'suv',      color: 0xdadce0, route: 2, wp: 1, t: 0.50, ai: true },
    { type: 'muscle',   color: 0x266248, route: 2, wp: 2, t: 0.35, ai: true },
    { type: 'sedan',    color: 0x623648, route: 3, wp: 0, t: 0.30, ai: true },
    { type: 'truck',    color: 0x823028, route: 3, wp: 1, t: 0.48, ai: true },
    { type: 'taxi',     color: 0xeeb422, route: 3, wp: 2, t: 0.62, ai: true },

    // Ring Highway Cruisers (last 2 routes = Ring Expressway outer & inner loops)
    { type: 'supercar', color: 0xf0c224, route: routes.length - 2, wp: 2,  t: 0.30, ai: true },
    { type: 'sedan',    color: 0x385a82, route: routes.length - 2, wp: 12, t: 0.40, ai: true },
    { type: 'truck',    color: 0x2b3e50, route: routes.length - 2, wp: 24, t: 0.50, ai: true },
    { type: 'suv',      color: 0xc2c8d0, route: routes.length - 2, wp: 36, t: 0.20, ai: true },
    { type: 'muscle',   color: 0x982026, route: routes.length - 1, wp: 6,  t: 0.35, ai: true },
    { type: 'sedan',    color: 0x526458, route: routes.length - 1, wp: 20, t: 0.45, ai: true },
    { type: 'supercar', color: 0xe8e8ec, route: routes.length - 1, wp: 38, t: 0.55, ai: true },

    // 5 Parked Stealable Hero Cars at Key City Landmarks (Citadel Blvd, Waterfront Marina, Midtown)
    { type: 'supercar', color: 0x1c68d8, x: -324.0, z: -551.8, yaw: -Math.PI * 0.5 + 0.08, ai: false },
    { type: 'muscle',   color: 0xcc2228, x: -162.0, z: -552.0, yaw: 0.0, ai: false },
    { type: 'suv',      color: 0x2a2e36, x: -460.0, z: -566.0, yaw: 0.25, ai: false },
    { type: 'taxi',     color: 0xeeb422, x: -346.0, z: -550.2, yaw: Math.PI * 0.5 + 0.08, ai: false },
    { type: 'sedan',    color: 0xbec6cf, x: -740.0, z: -598.0, yaw: 0.0, ai: false },

    // 3 LSPD Police Interceptors
    { type: 'police', color: 0x141820, route: 0, wp: 2,  t: 0.70, ai: true },
    { type: 'police', color: 0x141820, route: 3, wp: 3,  t: 0.25, ai: true },
    { type: 'police', color: 0x141820, route: routes.length - 1, wp: 18, t: 0.30, ai: true }
  ];

  spawnList.forEach((cfg, idx) => {
    const spec = ARCHETYPES[cfg.type];
    const visuals = createCarLOD(cfg.type, cfg.color);
    let pos, yaw;
    if (cfg.route !== undefined) {
      const r = routes[cfg.route];
      const wpIdx0 = cfg.wp % r.length;
      const a = r[wpIdx0];
      const b = r[(wpIdx0 + 1) % r.length];
      const wx = a.x + (b.x - a.x) * cfg.t;
      const wz = a.z + (b.z - a.z) * cfg.t;
      pos = new THREE.Vector3(wx, getCityGroundY(wx, wz), wz);
      yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    } else {
      pos = new THREE.Vector3(cfg.x, getCityGroundY(cfg.x, cfg.z), cfg.z);
      yaw = cfg.yaw;
    }

    visuals.driverMesh.visible = cfg.ai;
    visuals.carGrp.position.copy(pos);
    visuals.carGrp.rotation.y = yaw;

    cars.push({
      id: `car_${idx}`,
      type: cfg.type,
      spec,
      ...visuals,
      pos,
      yaw,
      steerAngle: 0,
      speed: 0,
      wheelSpin: 0,
      hp: 260,
      hasAiDriver: cfg.ai,
      isPlayerDriven: false,
      routeIdx: cfg.route ?? 0,
      wpIdx: ((cfg.wp ?? 0) + 1) % routes[cfg.route ?? 0].length,
      stunTimer: 0,
      shakeTimer: 0
    });
  });

  // Pooled Tire Dust / Burnout Smoke Particles
  const DUST_COUNT = 80;
  const dustPos = new Float32Array(DUST_COUNT * 3);
  const dustAge = new Float32Array(DUST_COUNT).fill(1);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('aAge', new THREE.BufferAttribute(dustAge, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      attribute float aAge;
      varying float vAge;
      void main() {
        vAge = aAge;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aAge < 0.98 ? clamp((14.0 + aAge * 26.0) / max(-mv.z, 1.0), 2.0, 18.0) : 0.0;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      varying float vAge;
      void main() {
        if (vAge >= 0.98) discard;
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float a = (1.0 - d) * (1.0 - vAge) * 0.42;
        gl_FragColor = vec4(0.76, 0.75, 0.72, a);
      }
    `
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.frustumCulled = false;
  root.add(dustPoints);
  let dustCursor = 0;

  function emitDust(x, y, z) {
    dustPos[dustCursor * 3] = x + (Math.random() - 0.5) * 0.45;
    dustPos[dustCursor * 3 + 1] = y + 0.18;
    dustPos[dustCursor * 3 + 2] = z + (Math.random() - 0.5) * 0.45;
    dustAge[dustCursor] = 0.02;
    dustCursor = (dustCursor + 1) % DUST_COUNT;
  }

  function resolveCarBuildingCollisions(car) {
    const rad = car.spec.width * 0.52;
    for (let i = 0; i < city.colliders.length; i++) {
      const c = city.colliders[i];
      if (car.pos.x + rad > c.minX && car.pos.x - rad < c.maxX && car.pos.z + rad > c.minZ && car.pos.z - rad < c.maxZ) {
        const dl = Math.abs(car.pos.x - c.minX);
        const dr = Math.abs(c.maxX - car.pos.x);
        const dt = Math.abs(car.pos.z - c.minZ);
        const db = Math.abs(c.maxZ - car.pos.z);
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) car.pos.x = c.minX - rad;
        else if (m === dr) car.pos.x = c.maxX + rad;
        else if (m === dt) car.pos.z = c.minZ - rad;
        else car.pos.z = c.maxZ + rad;
        car.speed *= -0.28;
        car.shakeTimer = 0.25;
      }
    }
  }

  function alignCarToTerrain(car, dt) {
    const cy = getCityGroundY(car.pos.x, car.pos.z);
    car.pos.y = cy;

    const sinY = Math.sin(car.yaw);
    const cosY = Math.cos(car.yaw);
    const fX = car.pos.x - sinY * 1.4;
    const fZ = car.pos.z - cosY * 1.4;
    const rX = car.pos.x + sinY * 1.4;
    const rZ = car.pos.z + cosY * 1.4;
    const rightX = car.pos.x + cosY * 0.85;
    const rightZ = car.pos.z - sinY * 0.85;
    const leftX = car.pos.x - cosY * 0.85;
    const leftZ = car.pos.z + sinY * 0.85;

    const pitch = clamp((getCityGroundY(fX, fZ) - getCityGroundY(rX, rZ)) / 2.8, -0.45, 0.45);
    const roll = clamp((getCityGroundY(leftX, leftZ) - getCityGroundY(rightX, rightZ)) / 1.7, -0.35, 0.35);

    const speedRatio = clamp(Math.abs(car.speed) / car.spec.topSpeed, 0, 1);
    const bodyRoll = -car.steerAngle * speedRatio * 0.095;
    const shake = car.shakeTimer > 0 ? Math.sin(performance.now() * 0.05) * 0.04 : 0;

    car.tiltPivot.rotation.x = THREE.MathUtils.lerp(car.tiltPivot.rotation.x, pitch + shake, Math.min(1, 10 * dt));
    car.tiltPivot.rotation.z = THREE.MathUtils.lerp(car.tiltPivot.rotation.z, roll + bodyRoll, Math.min(1, 10 * dt));
  }

  function findNearestCar(pos, maxDist = 5.8) {
    let best = null;
    let bestDist = maxDist;
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (car.isPlayerDriven) continue;
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best ? { car: best, dist: bestDist } : null;
  }

  function enterOrRobCar(car) {
    if (!car) return { stolen: false };
    const wasAi = car.hasAiDriver;
    if (wasAi) {
      city.spawnFleeingDriver(car.pos.x, car.pos.z, car.yaw);
      city.panicNear(car.pos.x, car.pos.z, 18.0);
      car.hasAiDriver = false;
    }
    car.isPlayerDriven = true;
    car.driverMesh.visible = true;
    car.stunTimer = 0;
    car.speed = Math.min(car.speed, 6.0);
    return { stolen: wasAi, label: car.spec.label };
  }

  function exitCar(car) {
    if (!car) return null;
    car.isPlayerDriven = false;
    car.driverMesh.visible = false;
    car.flames.forEach((f) => { f.visible = false; });
    const cosY = Math.cos(car.yaw);
    const sinY = Math.sin(car.yaw);
    const ex = car.pos.x - cosY * 2.25;
    const ez = car.pos.z + sinY * 2.25;
    return new THREE.Vector3(ex, getCityGroundY(ex, ez), ez);
  }

  function damageCar(car, dmg = 25, impactDir = null) {
    if (!car) return;
    car.hp = Math.max(0, car.hp - dmg);
    car.shakeTimer = 0.35;
    if (car.hasAiDriver) {
      car.hasAiDriver = false;
      car.driverMesh.visible = false;
      car.speed *= 0.2;
      city.spawnFleeingDriver(car.pos.x, car.pos.z, car.yaw);
      city.panicNear(car.pos.x, car.pos.z, 16.0);
    } else if (impactDir) {
      car.pos.x += impactDir.x * 0.25;
      car.pos.z += impactDir.z * 0.25;
    }
  }

  function update(dt, time, driveInput, playerState, wantedStars, callbacks = {}) {
    const night = ATMO_UNIFORMS.uNightFactor.value;
    headlightBeamMat.opacity = night > 0.22 ? clamp((night - 0.22) * 1.1, 0, 0.72) : 0.0;

    for (let i = 0; i < DUST_COUNT; i++) {
      if (dustAge[i] < 1.0) {
        dustAge[i] = Math.min(1.0, dustAge[i] + dt * 1.6);
        dustPos[i * 3 + 1] += dt * 0.9;
      }
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustGeo.attributes.aAge.needsUpdate = true;

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      if (car.shakeTimer > 0) car.shakeTimer = Math.max(0, car.shakeTimer - dt);
      if (car.stunTimer > 0) car.stunTimer = Math.max(0, car.stunTimer - dt);

      if (car.spec.isPolice) {
        const sirenActive = wantedStars > 0 && (car.hasAiDriver || car.isPlayerDriven);
        if (sirenActive) {
          const redPhase = Math.floor(time * 9.0) % 2 === 0;
          car.beaconRedMat.color.setHex(redPhase ? 0xff2424 : 0x260606);
          car.beaconBlueMat.color.setHex(redPhase ? 0x061430 : 0x2e8eff);
        } else {
          car.beaconRedMat.color.setHex(0x400a0a);
          car.beaconBlueMat.color.setHex(0x0a1c42);
        }
      }

      if (car.isPlayerDriven) {
        const throttle = driveInput.throttle;
        const steer = driveInput.steer;
        const handbrake = driveInput.handbrake;
        const nitro = driveInput.nitro && throttle > 0.1;

        const maxFwd = nitro ? car.spec.topSpeed * 1.32 : car.spec.topSpeed;
        const accelForce = nitro ? car.spec.accel * 1.55 : car.spec.accel;

        if (handbrake) {
          car.speed = THREE.MathUtils.lerp(car.speed, 0, Math.min(1, 2.8 * dt));
        } else if (throttle > 0.05) {
          car.speed = Math.min(maxFwd, car.speed + accelForce * throttle * dt);
        } else if (throttle < -0.05) {
          if (car.speed > 1.0) car.speed = Math.max(0, car.speed - 36.0 * dt);
          else car.speed = Math.max(-16.0, car.speed + 18.0 * throttle * dt);
        } else {
          car.speed *= Math.pow(0.28, dt);
          if (Math.abs(car.speed) < 0.05) car.speed = 0;
        }

        car.steerAngle = THREE.MathUtils.lerp(car.steerAngle, -steer * 0.46, Math.min(1, 9.0 * dt));
        const speedTurnFactor = clamp(Math.abs(car.speed) / 6.5, 0, 1);
        const dirSign = car.speed >= -0.1 ? 1 : -1;
        const driftBoost = handbrake && Math.abs(car.speed) > 6.0 ? 1.45 : 1.0;
        car.yaw += car.steerAngle * car.spec.turnRate * speedTurnFactor * dirSign * driftBoost * dt;

        car.pos.x -= Math.sin(car.yaw) * car.speed * dt;
        car.pos.z -= Math.cos(car.yaw) * car.speed * dt;
        car.pos.x = clamp(car.pos.x, -5600, 5600);
        car.pos.z = clamp(car.pos.z, -5600, 5600);

        car.flames.forEach((fl) => {
          fl.visible = nitro;
          if (nitro) fl.scale.z = 0.8 + Math.sin(time * 40.0) * 0.28;
        });
        if ((handbrake && Math.abs(car.speed) > 7.0) || (nitro && Math.random() < 0.45)) {
          emitDust(car.pos.x, car.pos.y, car.pos.z);
        }
        car.tailMat.color.setHex((throttle < -0.05 || handbrake) ? 0xff3b30 : 0x9e1818);

        const absSpd = Math.abs(car.speed);
        if (absSpd > 6.5) {
          const hitDir = new THREE.Vector3(-Math.sin(car.yaw), 0, -Math.cos(car.yaw)).multiplyScalar(car.speed >= 0 ? 1 : -1);
          for (let n = 0; n < city.npcs.length; n++) {
            const npc = city.npcs[n];
            if (npc.state === 'down' || npc.state === 'standby') continue;
            if (Math.hypot(npc.pos.x - car.pos.x, npc.pos.z - car.pos.z) < 2.2) {
              const ko = city.damageNpc(npc, absSpd * 3.5, hitDir, callbacks);
              if (ko && callbacks.onCrime) callbacks.onCrime(npc.role === 'police' ? 2 : 1);
            }
          }
        }
      } else if (car.hasAiDriver && car.stunTimer <= 0) {
        let targetX, targetZ;
        const isHighway = car.routeIdx >= routes.length - 2;
        let targetCruise = car.spec.isPolice && wantedStars > 0 ? 25.0 : isHighway ? 20.0 : 12.5;

        if (car.spec.isPolice && wantedStars > 0) {
          targetX = playerState.pos.x;
          targetZ = playerState.pos.z;
          const distP = Math.hypot(targetX - car.pos.x, targetZ - car.pos.z);
          if (distP < 5.5) targetCruise = 2.5;
        } else {
          const route = routes[car.routeIdx];
          const wp = route[car.wpIdx];
          targetX = wp.x;
          targetZ = wp.z;
          if (Math.hypot(targetX - car.pos.x, targetZ - car.pos.z) < 4.8) {
            car.wpIdx = (car.wpIdx + 1) % route.length;
          }
        }

        const desiredYaw = Math.atan2(-(targetX - car.pos.x), -(targetZ - car.pos.z));
        let diff = desiredYaw - car.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        car.yaw += clamp(diff, -2.1 * dt, 2.1 * dt);
        car.steerAngle = clamp(diff * 0.65, -0.4, 0.4);

        let blocked = false;
        const fwdX = -Math.sin(car.yaw);
        const fwdZ = -Math.cos(car.yaw);

        const dPlayer = Math.hypot(playerState.pos.x - car.pos.x, playerState.pos.z - car.pos.z);
        if (!car.spec.isPolice && !playerState.inVehicle && dPlayer < 7.0) {
          const dotP = ((playerState.pos.x - car.pos.x) * fwdX + (playerState.pos.z - car.pos.z) * fwdZ) / Math.max(dPlayer, 0.01);
          if (dotP > 0.65) blocked = true;
        }
        for (let j = 0; j < cars.length; j++) {
          if (j === i) continue;
          const other = cars[j];
          const dOther = Math.hypot(other.pos.x - car.pos.x, other.pos.z - car.pos.z);
          if (dOther < 9.0) {
            const dotO = ((other.pos.x - car.pos.x) * fwdX + (other.pos.z - car.pos.z) * fwdZ) / Math.max(dOther, 0.01);
            if (dotO > 0.72) blocked = true;
          }
        }

        const wantSpd = blocked ? 0.0 : targetCruise;
        car.speed = THREE.MathUtils.lerp(car.speed, wantSpd, Math.min(1, (blocked ? 5.5 : 2.5) * dt));
        car.pos.x += fwdX * car.speed * dt;
        car.pos.z += fwdZ * car.speed * dt;
        car.tailMat.color.setHex(blocked ? 0xff3b30 : 0x9e1818);
      } else {
        car.speed *= Math.pow(0.15, dt);
        car.pos.x -= Math.sin(car.yaw) * car.speed * dt;
        car.pos.z -= Math.cos(car.yaw) * car.speed * dt;
        car.steerAngle = THREE.MathUtils.lerp(car.steerAngle, 0, Math.min(1, 5.0 * dt));
        car.tailMat.color.setHex(0x8a1818);
      }

      resolveCarBuildingCollisions(car);
      alignCarToTerrain(car, dt);

      car.wheelSpin += (car.speed / car.spec.wheelR) * dt;
      for (let w = 0; w < car.wheelMeshes.length; w++) {
        car.wheelMeshes[w].rotation.x = -car.wheelSpin;
      }
      for (let fp = 0; fp < car.frontPivots.length; fp++) {
        car.frontPivots[fp].rotation.y = car.steerAngle;
      }

      car.carGrp.position.copy(car.pos);
      car.carGrp.rotation.y = car.yaw;
    }

    // Soft car-to-car bumper elastic separation
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const minD = 3.2;
        if (d > 0.01 && d < minD) {
          const push = (minD - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
          a.pos.y = getCityGroundY(a.pos.x, a.pos.z);
          b.pos.y = getCityGroundY(b.pos.x, b.pos.z);
          a.carGrp.position.copy(a.pos);
          b.carGrp.position.copy(b.pos);
        }
      }
    }
  }

  return {
    root,
    cars,
    findNearestCar,
    enterOrRobCar,
    exitCar,
    damageCar,
    update
  };
}
