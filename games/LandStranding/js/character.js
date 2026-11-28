/**
 * High-Fidelity Articulated Bridges-Style Icelandic Snow-Suit Porter & Weighted Locomotion Controller.
 * Features:
 * - Procedural PBR CanvasTextures (ripstop Gore-Tex snow-suit fabric + normal map, ribbed titanium Bridges cargo
 *   with hazard tape, woven coyote-tan Cordura backpack cover, and weathered male face with beard stubble)
 * - Anatomically proportioned human build (sculpted LatheGeometry snow parka & pants, hooded head with storm collar,
 *   iridescent wrap-around ski/snow goggles, respirator gaiter, chest BB-pod, active power-skeleton thigh exoskeleton,
 *   utility pouches, lugged arctic boots, modular stacked cargo backpack, and 3-joint Odradek terrain scanner)
 * - Full-body physically grounded animation: counter-rotating pelvis/spine, asymmetric stance/swing knee & ankle
 *   kinematics, slope-adaptive climbing/bracing lean, wading gait, airborne/weighted landing compression, turn
 *   banking, secondary backpack spring-damper physics, natural idle breathing/look-around, and Odradek scan gesture.
 */
import * as THREE from 'three';
import { clamp, mix, smoothstep } from './noise.js';
import { getTerrainHeight, getTerrainNormal, sampleWorld, getRiverCaveState } from './world.js';
import { enhanceMaterialWithAtmo, ATMO_UNIFORMS } from './atmosphere.js';

/** Build realistic matte technical Gore-Tex / expedition snow-suit fabric texture + subtle cloth weave bump map. */
function createSuitFabricTextures(baseHex, accentHex, seamHex) {
  const size = 256;
  const colC = document.createElement('canvas');
  colC.width = size;
  colC.height = size;
  const ctx = colC.getContext('2d');

  const bumpC = document.createElement('canvas');
  bumpC.width = size;
  bumpC.height = size;
  const bctx = bumpC.getContext('2d');

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Organic weathered Gore-Tex cloth mottling & soft draped fabric crease shading (NO grid/plaid look!)
  for (let i = 0; i < 240; i++) {
    const x = (i * 73) % size;
    const y = (i * 137) % size;
    const r = 10 + (i % 24);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.032)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle diagonal cloth tension folds (authentic draped snow-parka & heavy technical trouser wrinkles!)
  for (let i = 0; i < 22; i++) {
    const y0 = (i * 23) % size;
    const x0 = (i * 59) % size;
    const len = 45 + (i % 40);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(0,0,0,0.065)' : 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 4 + (i % 4);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 + len * 0.5, y0 + ((i % 3) - 1) * 8, x0 + len, y0 + 5);
    ctx.stroke();

    bctx.strokeStyle = i % 2 === 0 ? 'rgba(95,95,95,0.45)' : 'rgba(165,165,165,0.45)';
    bctx.lineWidth = 5;
    bctx.beginPath();
    bctx.moveTo(x0, y0);
    bctx.quadraticCurveTo(x0 + len * 0.5, y0 + ((i % 3) - 1) * 8, x0 + len, y0 + 5);
    bctx.stroke();
  }

  // Ultra-fine technical ripstop nylon micro-grain
  ctx.strokeStyle = 'rgba(255,255,255,0.018)';
  ctx.lineWidth = 1;
  bctx.strokeStyle = 'rgba(145,145,145,0.20)';
  bctx.lineWidth = 1;
  for (let p = 0; p < size; p += 4) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
    if (p % 8 === 0) {
      bctx.beginPath();
      bctx.moveTo(p, 0);
      bctx.lineTo(p, size);
      bctx.moveTo(0, p);
      bctx.lineTo(size, p);
      bctx.stroke();
    }
  }

  // Subtle single tailored panel seam (not a dense grid!)
  ctx.fillStyle = accentHex;
  ctx.globalAlpha = 0.14;
  ctx.fillRect(0, 0, size, 24);
  ctx.globalAlpha = 1.0;

  ctx.strokeStyle = seamHex;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(size, 128);
  ctx.stroke();
  ctx.globalAlpha = 1.0;

  const map = new THREE.CanvasTexture(colC);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;

  const bumpMap = new THREE.CanvasTexture(bumpC);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap };
}

/** Build ribbed metallic Bridges cargo container texture + bump map with yellow/black caution tape & stencil labels. */
function createCargoCaseTextures(bodyHex, ribHex, hasCautionBand = true) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  const b = document.createElement('canvas');
  b.width = size;
  b.height = size;
  const bctx = b.getContext('2d');

  ctx.fillStyle = bodyHex;
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Horizontal structural titanium corrugation ribs
  for (let y = 18; y < size - 18; y += 22) {
    ctx.fillStyle = ribHex;
    ctx.fillRect(14, y, size - 28, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(14, y, size - 28, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(14, y + 9, size - 28, 2);

    bctx.fillStyle = '#c8c8c8';
    bctx.fillRect(14, y, size - 28, 10);
    bctx.fillStyle = '#383838';
    bctx.fillRect(14, y + 10, size - 28, 3);
  }

  // Heavy dark anodized edge frame & corner bumpers
  ctx.strokeStyle = '#181c20';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, size - 14, size - 14);

  // Iconic Bridges yellow/black hazard caution band across case center
  if (hasCautionBand) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(14, 104, size - 28, 24);
    ctx.clip();
    ctx.fillStyle = '#c89b24';
    ctx.fillRect(14, 104, size - 28, 24);
    ctx.fillStyle = '#1a1c1e';
    for (let x = -24; x < size + 24; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, 104);
      ctx.lineTo(x + 11, 104);
      ctx.lineTo(x - 3, 128);
      ctx.lineTo(x - 14, 128);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Subtle white stencil cargo ID barcode & scuff wear
  ctx.fillStyle = 'rgba(225,232,238,0.68)';
  ctx.fillRect(28, 142, 46, 5);
  ctx.fillRect(28, 151, 30, 3);
  for (let bx = 92; bx < 146; bx += 5) {
    ctx.fillRect(bx, 140, (bx % 3 === 0) ? 3 : 1.5, 16);
  }
  for (let i = 0; i < 65; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect((i * 47) % size, (i * 89) % size, 12 + (i % 14), 2);
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const bumpMap = new THREE.CanvasTexture(b);
  return { map, bumpMap };
}

/** Build heavy coyote-tan weatherproof Cordura backpack cover texture with webbing straps & Bridges patch. */
function createCorduraPackTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#86704b';
  ctx.fillRect(0, 0, size, size);

  // Heavy canvas cross-weave texture
  for (let y = 0; y < size; y += 3) {
    ctx.fillStyle = y % 6 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, y, size, 1.5);
  }
  for (let x = 0; x < size; x += 3) {
    ctx.fillStyle = x % 6 === 0 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(x, 0, 1.5, size);
  }

  // Dark reinforced seam binding around pack cover
  ctx.strokeStyle = '#24272b';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);

  // Vertical black tactical webbing straps & cinch ladder loops
  for (const sx of [56, 200]) {
    ctx.fillStyle = '#1d2024';
    ctx.fillRect(sx - 10, 0, 20, size);
    ctx.fillStyle = '#4e545c';
    for (let ly = 26; ly < size; ly += 42) {
      ctx.fillRect(sx - 9, ly, 18, 5);
    }
  }

  // Subtle dark stencil expedition emblem on center panel
  ctx.strokeStyle = 'rgba(28,32,36,0.58)';
  ctx.lineWidth = 3;
  ctx.strokeRect(94, 58, 68, 44);
  ctx.fillStyle = 'rgba(28,32,36,0.62)';
  ctx.fillRect(104, 68, 48, 6);
  ctx.fillRect(108, 80, 40, 4);
  ctx.fillRect(114, 90, 28, 4);

  // Lower weathered mud/rain dust gradient
  const grad = ctx.createLinearGradient(0, size * 0.65, 0, size);
  grad.addColorStop(0, 'rgba(30,26,22,0)');
  grad.addColorStop(1, 'rgba(24,22,18,0.34)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, size * 0.65, size, size * 0.35);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

/** Build realistic weathered male skin + rugged beard stubble texture for the head mesh. */
function createMaleFaceTexture() {
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  // Natural wind-weathered Nordic/Caucasian skin base
  ctx.fillStyle = '#c9997c';
  ctx.fillRect(0, 0, w, h);

  // Subtle warm sun/cold flush across cheeks & nose bridge (centered around u = 0.25 -> +Z front of Three.js Sphere!)
  // Note: Three.js SphereGeometry UV u=0.25 corresponds to +Z (front) or let's wrap cleanly with face oriented via rotation!
  const cx = w * 0.5;
  const cheekGrad = ctx.createRadialGradient(cx, h * 0.52, 6, cx, h * 0.52, 52);
  cheekGrad.addColorStop(0, 'rgba(182, 108, 86, 0.34)');
  cheekGrad.addColorStop(1, 'rgba(182, 108, 86, 0.0)');
  ctx.fillStyle = cheekGrad;
  ctx.fillRect(0, 0, w, h);

  // Dark brown tousled hair at crown/back/sides
  ctx.fillStyle = '#2d231c';
  ctx.fillRect(0, 0, w, h * 0.26);
  ctx.fillRect(0, 0, w * 0.28, h * 0.72);
  ctx.fillRect(w * 0.72, 0, w * 0.28, h * 0.72);

  // Rugged weathered beard & jaw stubble around lower face/chin
  const beardGrad = ctx.createLinearGradient(0, h * 0.56, 0, h * 0.94);
  beardGrad.addColorStop(0, 'rgba(48, 36, 28, 0.0)');
  beardGrad.addColorStop(0.28, 'rgba(48, 36, 28, 0.52)');
  beardGrad.addColorStop(0.75, 'rgba(40, 30, 24, 0.78)');
  beardGrad.addColorStop(1, 'rgba(38, 28, 22, 0.85)');
  ctx.fillStyle = beardGrad;
  ctx.fillRect(w * 0.24, h * 0.56, w * 0.52, h * 0.44);

  // Fine beard stubble speckles & skin pore texture
  for (let i = 0; i < 620; i++) {
    const sx = w * 0.26 + ((i * 53) % Math.floor(w * 0.48));
    const sy = h * 0.60 + ((i * 29) % Math.floor(h * 0.36));
    ctx.fillStyle = i % 3 === 0 ? 'rgba(30,22,16,0.45)' : 'rgba(65,50,38,0.32)';
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }

  // Brow ridge shadow & subtle eye-socket shading (mostly framed by the snow goggles!)
  ctx.fillStyle = 'rgba(72, 46, 36, 0.42)';
  ctx.fillRect(cx - 26, h * 0.38, 20, 6);
  ctx.fillRect(cx + 6, h * 0.38, 20, 6);

  // Realistic subtle mouth shadow line
  ctx.strokeStyle = 'rgba(92, 52, 44, 0.65)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx - 11, h * 0.70);
  ctx.quadraticCurveTo(cx, h * 0.72, cx + 11, h * 0.70);
  ctx.stroke();

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/** Build an anatomically contoured LatheGeometry tube (far more lifelike than raw cylinders!). */
function createContouredLimbGeo(profilePairs, radialSegs = 14) {
  const pts = profilePairs.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, radialSegs);
  geo.computeVertexNormals();
  return geo;
}

export function createPorter(scene, onFootstep) {
  const root = new THREE.Group();
  scene.add(root);

  // 1. High-Fidelity Procedural PBR Materials (Matching Death Stranding Bridges Technical Arctic Gear!)
  const suitBlueTex = createSuitFabricTextures('#2b4054', '#1d2d3c', '#141d26');
  const suitCharcoalTex = createSuitFabricTextures('#23282e', '#171b20', '#101316');
  const cargoDarkTex = createCargoCaseTextures('#2b323a', '#39424d', true);
  const cargoSilverTex = createCargoCaseTextures('#858e96', '#9ca5ad', false);
  const corduraTex = createCorduraPackTexture();
  const faceTex = createMaleFaceTexture();

  // Primary Bridges technical slate-blue weatherproof snow suit
  const suitBlueMat = new THREE.MeshStandardMaterial({
    map: suitBlueTex.map,
    bumpMap: suitBlueTex.bumpMap,
    bumpScale: 0.012,
    roughness: 0.74,
    metalness: 0.08
  });

  // Reinforced charcoal tactical Cordura / neoprene panels (shoulders, knees, inner gaiters, hood)
  const suitDarkMat = new THREE.MeshStandardMaterial({
    map: suitCharcoalTex.map,
    bumpMap: suitCharcoalTex.bumpMap,
    bumpScale: 0.014,
    roughness: 0.78,
    metalness: 0.10
  });

  // Coyote-tan tactical pouches & backpack canvas cover
  const tanGearMat = new THREE.MeshStandardMaterial({
    map: corduraTex,
    roughness: 0.84,
    metalness: 0.04
  });

  // Matte gunmetal exoskeleton struts, latches, armor plates & helmet clips
  const metalDarkMat = new THREE.MeshStandardMaterial({
    color: 0x20252b,
    roughness: 0.38,
    metalness: 0.72
  });

  // Brushed titanium active power-skeleton struts & hardware
  const titaniumMat = new THREE.MeshStandardMaterial({
    color: 0x8e98a2,
    roughness: 0.34,
    metalness: 0.82
  });

  // Ribbed Bridges Cargo Containers (dark tactical + brushed alloy)
  const cargoDarkMat = new THREE.MeshStandardMaterial({
    map: cargoDarkTex.map,
    bumpMap: cargoDarkTex.bumpMap,
    bumpScale: 0.016,
    roughness: 0.46,
    metalness: 0.52
  });

  const cargoSilverMat = new THREE.MeshStandardMaterial({
    map: cargoSilverTex.map,
    bumpMap: cargoSilverTex.bumpMap,
    bumpScale: 0.016,
    roughness: 0.40,
    metalness: 0.64
  });

  // Heavy vulcanized rubber boot soles & winter glove palms
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x16191c,
    roughness: 0.88,
    metalness: 0.05
  });

  // Realistic weathered male skin & beard face material
  const skinMat = new THREE.MeshStandardMaterial({
    map: faceTex,
    roughness: 0.68,
    metalness: 0.02
  });

  // Iridescent reflective amber-bronze alpine snow goggle lens
  const goggleLensMat = new THREE.MeshStandardMaterial({
    color: 0xc2702a,
    emissive: new THREE.Color(0x2e1506),
    emissiveIntensity: 0.28,
    roughness: 0.06,
    metalness: 0.92,
    side: THREE.DoubleSide
  });

  // Warm translucent amber BB-pod glass capsule (subtle realistic glass glow, not neon lightbulb!)
  const bbGlassMat = new THREE.MeshStandardMaterial({
    color: 0xb86e22,
    emissive: new THREE.Color(0xd97618),
    emissiveIntensity: 0.28,
    roughness: 0.16,
    metalness: 0.22
  });

  // Weathered hemp/nylon climbing rope accent
  const ropeMat = new THREE.MeshStandardMaterial({
    color: 0x916c46,
    roughness: 0.92,
    metalness: 0.02
  });

  // Double-sided insulated hood material (exterior snow blue + clean shadow inside hood opening)
  const hoodMat = suitBlueMat.clone();
  hoodMat.side = THREE.DoubleSide;

  const cyanLedMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 1.35, 1.75) });
  const amberLedMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.88, 0.18) });

  [
    suitBlueMat, suitDarkMat, tanGearMat, metalDarkMat, titaniumMat,
    cargoDarkMat, cargoSilverMat, rubberMat, skinMat, goggleLensMat, bbGlassMat, ropeMat, hoodMat
  ].forEach((m, idx) => enhanceMaterialWithAtmo(m, { cacheKey: `ls_porter_v3_${idx}`, wetnessBoost: 0.78 }));

  // 2. Hierarchical Anatomical Skeleton
  // root (world pos/yaw) -> pelvisGroup (hip bounce/sway/pitch/yaw) -> upperTorsoGroup (lumbar counter-twist/lean) -> headGroup, arms, packGroup
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.94, 0);
  root.add(pelvisGroup);

  // --- PELVIS, SNOW-PANT HIPS, TACTICAL UTILITY BELT & HIP POUCHES ---
  const pelvisGeo = createContouredLimbGeo([
    [0.145, -0.10],
    [0.172, -0.04],
    [0.176, 0.03],
    [0.160, 0.10]
  ], 16);
  const pelvisMesh = new THREE.Mesh(pelvisGeo, suitBlueMat);
  pelvisMesh.scale.set(1.08, 1.0, 0.76);
  pelvisMesh.castShadow = true;
  pelvisGroup.add(pelvisMesh);

  // Heavy tactical belt & hip harness
  const beltMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.174, 0.178, 0.068, 18), suitDarkMat);
  beltMesh.scale.set(1.10, 1.0, 0.78);
  beltMesh.position.y = 0.055;
  beltMesh.castShadow = true;
  pelvisGroup.add(beltMesh);

  const beltBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.052, 0.024), titaniumMat);
  beltBuckle.position.set(0, 0.055, 0.138);
  pelvisGroup.add(beltBuckle);

  // Left & Right Hip Utility Pouches (matching Death Stranding tan/charcoal waist pouches!)
  for (const side of [-1, 1]) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.115, 0.095), side === 1 ? tanGearMat : suitDarkMat);
    pouch.position.set(side * 0.195, 0.01, 0.02);
    pouch.rotation.z = -side * 0.08;
    pouch.castShadow = true;
    pelvisGroup.add(pouch);

    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.042, 0.098), metalDarkMat);
    flap.position.set(side * 0.197, 0.055, 0.02);
    pelvisGroup.add(flap);

    // Active Power-Skeleton Hip Servo Motor Housing
    const hipServo = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.048, 12), titaniumMat);
    hipServo.rotation.z = Math.PI * 0.5;
    hipServo.position.set(side * 0.192, -0.055, -0.02);
    pelvisGroup.add(hipServo);

    const servoLed = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.052, 8), cyanLedMat);
    servoLed.rotation.z = Math.PI * 0.5;
    servoLed.position.set(side * 0.192, -0.055, -0.02);
    pelvisGroup.add(servoLed);
  }

  // Rear canteen & carabiner clipped on lower back belt
  const canteen = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.034, 0.115, 10), titaniumMat);
  canteen.position.set(-0.11, 0.01, -0.145);
  canteen.rotation.z = 0.18;
  pelvisGroup.add(canteen);

  // --- UPPER TORSO / INSULATED BRIDGES SNOW PARKA & CHEST RIG ---
  const upperTorsoGroup = new THREE.Group();
  upperTorsoGroup.position.set(0, 0.09, 0); // Lumbar pivot (world y = 1.03)
  pelvisGroup.add(upperTorsoGroup);

  // Anatomically contoured insulated snow jacket (tapered waist -> broad chest -> flared parka hem!)
  const jacketGeo = createContouredLimbGeo([
    [0.182, -0.09], // lower storm-parka hem overhanging belt
    [0.168, 0.01],  // waist cinch
    [0.184, 0.14],  // mid ribcage baffle
    [0.206, 0.28],  // broad athletic chest & lats
    [0.214, 0.37],  // upper shoulder yoke
    [0.140, 0.44],  // trapezius slope
    [0.095, 0.47]   // collar base
  ], 18);
  const jacketMesh = new THREE.Mesh(jacketGeo, suitBlueMat);
  jacketMesh.scale.set(1.12, 1.0, 0.74);
  jacketMesh.castShadow = true;
  upperTorsoGroup.add(jacketMesh);

  // Reinforced dark weatherproof shoulder yoke mantle (classic alpine snow parka two-tone!)
  const yokeGeo = createContouredLimbGeo([
    [0.208, 0.27],
    [0.220, 0.36],
    [0.155, 0.435],
    [0.105, 0.465]
  ], 16);
  const yokeMesh = new THREE.Mesh(yokeGeo, suitDarkMat);
  yokeMesh.scale.set(1.14, 1.0, 0.77);
  yokeMesh.castShadow = true;
  upperTorsoGroup.add(yokeMesh);

  // Front storm zipper flap & waterproof pocket tabs
  const stormFlap = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.46, 0.022), suitDarkMat);
  stormFlap.position.set(0, 0.18, 0.150);
  upperTorsoGroup.add(stormFlap);

  // Padded Heavy Backpack Harness Straps crossing front chest & sternum clasp
  for (const side of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.42, 0.028), suitDarkMat);
    strap.position.set(side * 0.115, 0.21, 0.145);
    strap.rotation.z = -side * 0.07;
    strap.rotation.x = -0.06;
    strap.castShadow = true;
    upperTorsoGroup.add(strap);

    // Metallic shoulder D-ring & strap buckle
    const dRing = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.004, 6, 10), titaniumMat);
    dRing.position.set(side * 0.118, 0.30, 0.162);
    upperTorsoGroup.add(dRing);

    const strapClip = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.026, 0.032), metalDarkMat);
    strapClip.position.set(side * 0.112, 0.16, 0.152);
    upperTorsoGroup.add(strapClip);
  }

  const sternumBar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.030, 0.024), metalDarkMat);
  sternumBar.position.set(0, 0.26, 0.158);
  upperTorsoGroup.add(sternumBar);

  // Iconic Death Stranding Chest BB-Pod / Thermal Bio-Pod (curved dark housing + glowing warm amber capsule!)
  const podGroup = new THREE.Group();
  podGroup.position.set(0, 0.14, 0.168);
  podGroup.rotation.x = 0.08;
  upperTorsoGroup.add(podGroup);

  const podCradle = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.185, 0.068), metalDarkMat);
  podCradle.castShadow = true;
  podGroup.add(podCradle);

  const podGlass = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.062, 6, 12), bbGlassMat);
  podGlass.position.set(0, 0, 0.026);
  podGlass.scale.set(1.05, 1.0, 0.72);
  podGroup.add(podGlass);

  const podCapTop = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.056, 0.028, 12), titaniumMat);
  podCapTop.position.set(0, 0.085, 0.015);
  podGroup.add(podCapTop);

  // Protective roll-cage ribs across BB pod glass (authentic Death Stranding industrial detail!)
  for (const py of [-0.036, 0.036]) {
    const cageBar = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.010, 0.014), metalDarkMat);
    cageBar.position.set(0, py, 0.062);
    podGroup.add(cageBar);
  }

  const podStatusLed = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.009, 0.010), cyanLedMat);
  podStatusLed.position.set(0.042, 0.072, 0.036);
  podGroup.add(podStatusLed);

  // Chest Radio Transceiver & Headlamp Housing on Upper Chest Straps
  const radioUnit = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.086, 0.032), metalDarkMat);
  radioUnit.position.set(0.118, 0.34, 0.164);
  upperTorsoGroup.add(radioUnit);

  const radioAnt = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.14, 6), metalDarkMat);
  radioAnt.position.set(0.132, 0.44, 0.162);
  upperTorsoGroup.add(radioAnt);

  const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.024, 0.034, 10), titaniumMat);
  lampHousing.rotation.x = Math.PI * 0.5;
  lampHousing.position.set(-0.115, 0.34, 0.168);
  upperTorsoGroup.add(lampHousing);

  const lampLens = new THREE.Mesh(new THREE.CircleGeometry(0.016, 10), cyanLedMat);
  lampLens.position.set(-0.115, 0.34, 0.186);
  upperTorsoGroup.add(lampLens);

  // Night & subterranean cave chest headlamp SpotLight
  const chestLamp = new THREE.SpotLight(0xdff4ff, 0.0, 64, Math.PI * 0.28, 0.58, 1.15);
  chestLamp.position.set(-0.115, 0.34, 0.20);
  const lampTarget = new THREE.Object3D();
  lampTarget.position.set(0, -0.25, 8.0);
  upperTorsoGroup.add(chestLamp);
  upperTorsoGroup.add(lampTarget);
  chestLamp.target = lampTarget;

  // Thick Insulated Snow-Parka Storm Collar & Thermal Neck Gaiter
  const stormCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.136, 0.095, 16), suitBlueMat);
  stormCollar.position.set(0, 0.465, -0.012);
  stormCollar.castShadow = true;
  upperTorsoGroup.add(stormCollar);

  const neckGaiter = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.086, 0.095, 14), suitDarkMat);
  neckGaiter.position.set(0, 0.495, 0.005);
  upperTorsoGroup.add(neckGaiter);

  // --- REALISTIC MAN'S HEAD, BEARDED FACE, INSULATED SNOW HOOD & ALPINE SNOW GOGGLES ---
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.50, 0.005); // Neck pivot (world y = 1.53)
  upperTorsoGroup.add(headGroup);

  // Anatomically sculpted male cranium & face (u=0.5 rotated squarely to +Z front!)
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.104, 20, 16), skinMat);
  cranium.scale.set(0.88, 1.09, 0.98);
  cranium.rotation.y = -Math.PI * 0.5;
  cranium.position.set(0, 0.118, 0.016);
  cranium.castShadow = true;
  headGroup.add(cranium);

  // Sculpted masculine jawline/chin & nose bridge for authentic profile
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.074, 14, 10), skinMat);
  jaw.scale.set(0.92, 0.86, 1.04);
  jaw.rotation.y = -Math.PI * 0.5;
  jaw.position.set(0, 0.052, 0.034);
  headGroup.add(jaw);

  const skinPlainMat = new THREE.MeshStandardMaterial({
    color: 0xc29072,
    roughness: 0.72,
    metalness: 0.02
  });
  enhanceMaterialWithAtmo(skinPlainMat, { cacheKey: 'ls_porter_v3_nose', wetnessBoost: 0.45 });

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.036, 8), skinPlainMat);
  nose.rotation.x = Math.PI * 0.44;
  nose.position.set(0, 0.096, 0.114);
  headGroup.add(nose);

  // Pulled-up Insulated Arctic Snow-Parka Hood wrapping back/crown/sides with WIDE OPEN FACE WINDOW at +Z!
  // SphereGeometry phi=PI/2 is +Z (front face), phi=3PI/2 is -Z (back) -> phiStart=0.82PI, phiLength=1.36PI leaves +Z wide open!
  const hoodBack = new THREE.Mesh(
    new THREE.SphereGeometry(0.132, 20, 14, Math.PI * 0.82, Math.PI * 1.36, 0.0, Math.PI * 0.86),
    hoodMat
  );
  hoodBack.scale.set(0.98, 1.13, 1.08);
  hoodBack.position.set(0, 0.120, -0.006);
  hoodBack.castShadow = true;
  headGroup.add(hoodBack);

  // Dark fleece-lined hood rim framing the face cleanly around cheeks & forehead (never covering face!)
  const hoodTrim = new THREE.Mesh(new THREE.TorusGeometry(0.114, 0.018, 8, 20, Math.PI * 1.34), suitDarkMat);
  hoodTrim.rotation.z = -Math.PI * 0.17;
  hoodTrim.position.set(0, 0.118, 0.042);
  headGroup.add(hoodTrim);

  // Forward wind-shield snow-hood storm visor brim over forehead
  const hoodBrim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.112, 0.124, 0.026, 16, 1, true, -0.92, 1.84),
    suitDarkMat
  );
  hoodBrim.position.set(0, 0.222, 0.042);
  hoodBrim.rotation.x = 0.28;
  headGroup.add(hoodBrim);

  // Lower insulated neck gaiter tucked cleanly around throat (leaving rugged bearded jaw & chin visible!)
  const chinGuard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.098, 0.056, 14, 1, false, -1.05, 2.1),
    suitDarkMat
  );
  chinGuard.position.set(0, 0.008, 0.018);
  headGroup.add(chinGuard);

  // Wrap-Around Expedition Alpine Snow Goggles sitting cleanly OVER the brow/eyes & nose bridge!
  const goggleGroup = new THREE.Group();
  goggleGroup.position.set(0, 0.132, 0.024);
  headGroup.add(goggleGroup);

  const goggleFrame = new THREE.Mesh(
    new THREE.CylinderGeometry(0.106, 0.104, 0.062, 18, 1, true, -0.92, 1.84),
    metalDarkMat
  );
  goggleFrame.position.set(0, 0, 0.008);
  goggleGroup.add(goggleFrame);

  // Top & bottom matte rubber goggle cushion rims
  const rimTop = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.0085, 6, 18, 1.84), rubberMat);
  rimTop.rotation.x = Math.PI * 0.5;
  rimTop.rotation.z = -Math.PI * 0.5 + 0.92;
  rimTop.position.set(0, 0.029, 0.008);
  goggleGroup.add(rimTop);

  const rimBot = rimTop.clone();
  rimBot.position.set(0, -0.029, 0.008);
  goggleGroup.add(rimBot);

  // Curved reflective iridescent amber-gold polycarbonate snow-goggle lens
  const goggleLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.109, 0.107, 0.050, 18, 1, true, -0.84, 1.68),
    goggleLensMat
  );
  goggleLens.position.set(0, 0, 0.009);
  goggleGroup.add(goggleLens);

  // Wide elastic goggle strap wrapping around outer hood with brushed titanium side buckles
  const goggleStrap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.133, 0.133, 0.032, 20, 1, true),
    rubberMat
  );
  goggleStrap.position.set(0, -0.002, -0.028);
  goggleGroup.add(goggleStrap);

  for (const side of [-1, 1]) {
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.038, 0.026), titaniumMat);
    buckle.position.set(side * 0.124, 0, 0.016);
    goggleGroup.add(buckle);
  }

  // --- HEAVY BRIDGES MODULAR BACKPACK & EXPEDITION CARGO STACK (with Secondary Bounce/Sway!) ---
  const packGroup = new THREE.Group();
  packGroup.position.set(0, 0.21, -0.175);
  upperTorsoGroup.add(packGroup);

  // Twin tubular titanium exo-frame rails & top roll-bar
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.68, 8), titaniumMat);
    rail.position.set(side * 0.155, 0.06, 0.01);
    rail.castShadow = true;
    packGroup.add(rail);
  }
  const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), titaniumMat);
  topBar.rotation.z = Math.PI * 0.5;
  topBar.position.set(0, 0.40, 0.01);
  packGroup.add(topBar);

  const backPlate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.62, 0.035), metalDarkMat);
  backPlate.position.set(0, 0.04, 0.015);
  backPlate.castShadow = true;
  packGroup.add(backPlate);

  // Iconic Coyote-Tan Weatherproof Cordura Backpack Base Unit (matching Death Stranding reference!)
  const corduraPack = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.34, 0.16), tanGearMat);
  corduraPack.position.set(0, -0.08, -0.075);
  corduraPack.castShadow = true;
  packGroup.add(corduraPack);

  // Rolled waterproof insulated shelter tarp strapped underneath the backpack
  const tarpRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.34, 12), suitDarkMat);
  tarpRoll.rotation.z = Math.PI * 0.5;
  tarpRoll.position.set(0, -0.285, -0.075);
  tarpRoll.castShadow = true;
  packGroup.add(tarpRoll);

  // Stacked Ribbed Bridges Cargo Containers strapped above the tan pack!
  const lowerCargo = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.20, 0.185), cargoDarkMat);
  lowerCargo.position.set(0, 0.19, -0.088);
  lowerCargo.castShadow = true;
  packGroup.add(lowerCargo);

  const upperCargo = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.155, 0.165), cargoSilverMat);
  upperCargo.position.set(0, 0.37, -0.078);
  upperCargo.castShadow = true;
  packGroup.add(upperCargo);

  // Elastic cargo tie-down straps & corner clamps locking the stack
  for (const sx of [-0.11, 0.11]) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.64, 0.014), rubberMat);
    tie.position.set(sx, 0.13, -0.182);
    packGroup.add(tie);
  }

  // Multi-coil weathered expedition climbing rope bundle bound with dark cinch strap on right flank!
  const ropeGroup = new THREE.Group();
  ropeGroup.position.set(-0.184, -0.06, -0.075);
  packGroup.add(ropeGroup);
  for (let rc = -1; rc <= 1; rc++) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.064, 0.009, 7, 16), ropeMat);
    coil.rotation.y = Math.PI * 0.5;
    coil.position.x = rc * 0.012;
    coil.scale.set(0.82, 1.18, 1.0);
    coil.castShadow = true;
    ropeGroup.add(coil);
  }
  const ropeStrap = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.022, 0.036), rubberMat);
  ropeStrap.position.set(0, 0.068, 0);
  ropeGroup.add(ropeStrap);

  const slungPole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.78, 8), metalDarkMat);
  slungPole.position.set(0.192, 0.12, -0.055);
  slungPole.rotation.z = -0.09;
  slungPole.castShadow = true;
  packGroup.add(slungPole);

  const poleTip = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.065, 6), titaniumMat);
  poleTip.position.set(0.228, -0.28, -0.055);
  poleTip.rotation.z = Math.PI - 0.09;
  packGroup.add(poleTip);

  // Pinpoint Bridges telemetry status LEDs on cargo stack
  const spineLed = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.010, 0.010), cyanLedMat);
  spineLed.position.set(0, 0.25, -0.183);
  packGroup.add(spineLed);

  const cargoTagLed = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.012, 0.010), amberLedMat);
  cargoTagLed.position.set(-0.115, 0.12, -0.184);
  packGroup.add(cargoTagLed);

  // --- ARTICULATED 3-JOINT SHOULDER ODRADEK TERRAIN SCANNER (Left Shoulder Mounted!) ---
  const odradekBase = new THREE.Group();
  odradekBase.position.set(0.215, 0.40, -0.135);
  upperTorsoGroup.add(odradekBase);

  const odradekMount = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.065), metalDarkMat);
  odradekBase.add(odradekMount);

  const odradekLowerArm = new THREE.Group();
  odradekLowerArm.rotation.z = -0.32;
  odradekLowerArm.rotation.x = -0.10;
  odradekBase.add(odradekLowerArm);

  const lowerBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.24, 8), titaniumMat);
  lowerBoom.position.y = 0.12;
  odradekLowerArm.add(lowerBoom);

  const odradekUpperArm = new THREE.Group();
  odradekUpperArm.position.y = 0.24;
  odradekUpperArm.rotation.z = 0.24;
  odradekLowerArm.add(odradekUpperArm);

  const elbowServo = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), metalDarkMat);
  odradekUpperArm.add(elbowServo);

  const upperBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.20, 8), metalDarkMat);
  upperBoom.position.y = 0.10;
  odradekUpperArm.add(upperBoom);

  const odradekHead = new THREE.Group();
  odradekHead.position.set(0, 0.21, 0.01);
  odradekUpperArm.add(odradekHead);

  const odradekHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.026, 10), metalDarkMat);
  odradekHousing.rotation.x = Math.PI * 0.5;
  odradekHead.add(odradekHousing);

  const odradekCore = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), cyanLedMat);
  odradekCore.position.z = 0.010;
  odradekHead.add(odradekCore);

  const petals = [];
  for (let i = 0; i < 5; i++) {
    const pPivot = new THREE.Group();
    const a = (i / 5) * Math.PI * 2;
    pPivot.rotation.z = a;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.095, 0.008), titaniumMat);
    blade.position.y = 0.068;
    const tipLed = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.010), cyanLedMat);
    tipLed.position.y = 0.112;
    pPivot.add(blade);
    pPivot.add(tipLed);
    odradekHead.add(pPivot);
    petals.push(pPivot);
  }

  // --- ANATOMICALLY SCULPTED ARMS, INSULATED SLEEVES, CUFF-LINK & WINTER GLOVES ---
  const upperArmGeo = createContouredLimbGeo([
    [0.056, -0.28], // elbow cuff
    [0.062, -0.20],
    [0.068, -0.10], // insulated bicep/deltoid fullness
    [0.074, -0.02],
    [0.058, 0.04]
  ], 14);

  const forearmGeo = createContouredLimbGeo([
    [0.042, -0.25], // wrist snow-gauntlet cuff
    [0.048, -0.17],
    [0.055, -0.07], // forearm muscle & sleeve fold
    [0.052, 0.0]
  ], 14);

  function createArm(side) {
    const shoulder = new THREE.Group();
    shoulder.rotation.order = 'YXZ';
    shoulder.position.set(side * 0.218, 0.372, -0.006);
    upperTorsoGroup.add(shoulder);

    // Smooth blended insulated parka shoulder cap (natural human slope, zero robotic ball joint!)
    const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.074, 14, 10), suitBlueMat);
    deltoid.scale.set(0.96, 0.94, 0.96);
    deltoid.castShadow = true;
    shoulder.add(deltoid);

    const upper = new THREE.Mesh(upperArmGeo, suitBlueMat);
    upper.castShadow = true;
    shoulder.add(upper);

    // Upper sleeve tactical zip pocket & weatherproof arm patch
    const armPocket = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.095, 0.064), suitDarkMat);
    armPocket.position.set(side * 0.062, -0.12, 0);
    shoulder.add(armPocket);

    const elbow = new THREE.Group();
    elbow.position.y = -0.285;
    shoulder.add(elbow);

    const elbowPad = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.052, 0.085, 10, 1, false, Math.PI * 0.65, Math.PI * 0.70), suitDarkMat);
    elbowPad.position.set(0, 0, -0.006);
    elbow.add(elbowPad);

    const fore = new THREE.Mesh(forearmGeo, suitDarkMat);
    fore.castShadow = true;
    elbow.add(fore);

    // Iconic Bridges glowing cyan Cuff-Link telemetry bracelet on left wrist (side === 1)
    if (side === 1) {
      const cuffLink = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.026, 12), titaniumMat);
      cuffLink.position.y = -0.22;
      elbow.add(cuffLink);
      const cuffLed = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.005, 6, 14), cyanLedMat);
      cuffLed.rotation.x = Math.PI * 0.5;
      cuffLed.position.y = -0.22;
      elbow.add(cuffLed);
    }

    // Articulated Wrist & Sculpted Insulated Winter Glove (gauntlet + palm + fingers + distinct thumb!)
    const wrist = new THREE.Group();
    wrist.position.y = -0.255;
    elbow.add(wrist);

    const gauntlet = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.043, 0.045, 10), rubberMat);
    gauntlet.position.y = -0.01;
    wrist.add(gauntlet);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.072, 0.068), rubberMat);
    palm.position.set(0, -0.055, 0.006);
    palm.castShadow = true;
    wrist.add(palm);

    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.052, 0.060), suitDarkMat);
    fingers.position.set(-side * 0.006, -0.105, 0.012);
    fingers.rotation.z = -side * 0.14;
    wrist.add(fingers);

    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.030, 4, 6), rubberMat);
    thumb.position.set(-side * 0.020, -0.058, 0.044);
    thumb.rotation.x = 0.55;
    thumb.rotation.z = side * 0.25;
    wrist.add(thumb);

    return { shoulder, elbow, wrist };
  }

  const leftArm = createArm(1);
  const rightArm = createArm(-1);

  // --- ANATOMICALLY SCULPTED LEGS, ACTIVE POWER SKELETON EXOSKELETON & HEAVY SNOW BOOTS ---
  const thighGeo = createContouredLimbGeo([
    [0.074, -0.42], // knee gather
    [0.084, -0.28], // mid thigh snow-pant fold
    [0.095, -0.12], // athletic quad/hamstring fullness
    [0.098, 0.0]
  ], 14);

  const shinGeo = createContouredLimbGeo([
    [0.056, -0.39], // boot cuff tuck
    [0.065, -0.26], // waterproof ankle gaiter
    [0.078, -0.12], // muscular calf contour
    [0.074, 0.0]
  ], 14);

  function createLeg(side) {
    const hip = new THREE.Group();
    hip.rotation.order = 'YXZ';
    hip.position.set(side * 0.104, -0.03, 0); // World y = 0.91
    pelvisGroup.add(hip);

    const thigh = new THREE.Mesh(thighGeo, suitBlueMat);
    thigh.scale.set(0.96, 1.0, 1.04);
    thigh.castShadow = true;
    hip.add(thigh);

    // Thigh tactical cargo pocket
    const thighPocket = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.145, 0.105), suitDarkMat);
    thighPocket.position.set(side * 0.086, -0.19, 0.01);
    hip.add(thighPocket);

    // Active Power Skeleton Exoskeleton Thigh Strut + Straps (iconic Death Stranding detail!)
    const exoStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.011, 0.38, 8), titaniumMat);
    exoStrut.position.set(side * 0.104, -0.20, -0.012);
    exoStrut.castShadow = true;
    hip.add(exoStrut);

    const exoBand = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.009, 6, 14), metalDarkMat);
    exoBand.rotation.x = Math.PI * 0.5;
    exoBand.position.y = -0.24;
    hip.add(exoBand);

    const knee = new THREE.Group();
    knee.position.y = -0.42; // World y = 0.49
    hip.add(knee);

    // Contoured wrap-around tactical snow-pant knee guard & exoskeleton knee hinge (flush, not spherical ball!)
    const kneePad = new THREE.Mesh(new THREE.CylinderGeometry(0.080, 0.076, 0.115, 12, 1, false, -0.95, 1.90), suitDarkMat);
    kneePad.position.set(0, 0.0, 0.008);
    kneePad.castShadow = true;
    knee.add(kneePad);

    const kneeServo = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.032, 10), titaniumMat);
    kneeServo.rotation.z = Math.PI * 0.5;
    kneeServo.position.set(side * 0.086, 0, -0.008);
    knee.add(kneeServo);

    const shin = new THREE.Mesh(shinGeo, suitDarkMat);
    shin.castShadow = true;
    knee.add(shin);

    // Lower exoskeleton calf brace strut
    const calfStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.009, 0.34, 8), titaniumMat);
    calfStrut.position.set(side * 0.078, -0.175, -0.014);
    knee.add(calfStrut);

    // Articulated Ankle Pivot & Multi-Part Lugged Arctic Snow Boot (sole bottom sits cleanly at world y = 0.00!)
    const ankle = new THREE.Group();
    ankle.position.y = -0.39; // World y = 0.10
    knee.add(ankle);

    // Padded ankle collar
    const bootCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.058, 0.095, 12), suitDarkMat);
    bootCuff.position.set(0, 0.015, 0.0);
    ankle.add(bootCuff);

    // Boot upper vamp & armored toe cap
    const bootVamp = new THREE.Mesh(new THREE.BoxGeometry(0.106, 0.072, 0.215), suitDarkMat);
    bootVamp.position.set(0, -0.044, 0.042);
    bootVamp.castShadow = true;
    ankle.add(bootVamp);

    const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.056, 10, 8), rubberMat);
    toeCap.scale.set(0.96, 0.64, 1.18);
    toeCap.position.set(0, -0.054, 0.132);
    toeCap.castShadow = true;
    ankle.add(toeCap);

    // Thick heavy lugged snow-boot rubber sole & heel block (bottom at local y = -0.10 -> world y = 0.00!)
    const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.114, 0.032, 0.270), rubberMat);
    bootSole.position.set(0, -0.084, 0.048);
    bootSole.castShadow = true;
    ankle.add(bootSole);

    // Metallic lace-hook bridge accent across boot instep
    const lacePlate = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.022, 0.075), titaniumMat);
    lacePlate.position.set(0, -0.016, 0.072);
    lacePlate.rotation.x = 0.34;
    ankle.add(lacePlate);

    return { hip, knee, ankle };
  }

  const leftLeg = createLeg(1);
  const rightLeg = createLeg(-1);

  // 3. Physics, Secondary Spring Dynamics & Animation State
  const state = {
    pos: new THREE.Vector3(-7.6, 20, 13.0),
    smoothBodyY: 20,
    vel: new THREE.Vector3(),
    yaw: 0.24,
    prevYaw: 0.24,
    turnRate: 0,
    speed: 0,
    isMoving: false,
    isSprinting: false,
    grounded: true,
    wasGrounded: true,
    airTime: 0,
    landSquash: 0,
    landSquashVel: 0,
    packBounceY: 0,
    packBounceVel: 0,
    packSwayZ: 0,
    slopeLean: 0,
    gaitPhase: 0,
    gaitBlend: 0,
    sprintBlend: 0,
    wadeBlend: 0,
    lastStepHalf: 0,
    scanActive: false,
    scanAge: 0,
    scanDuration: 2.8,
    laserPrintActive: false,
    laserTarget: new THREE.Vector3(),
    isRiding: false,
    surfaceType: 'moss'
  };

  const _moveDir = new THREE.Vector3();
  const _groundNorm = new THREE.Vector3();
  const _pelvisQuat = new THREE.Quaternion();
  const _invPelvisQuat = new THREE.Quaternion();
  const _hipWorld = new THREE.Vector3();
  const _footTarget = new THREE.Vector3();
  const _armTargetLocal = new THREE.Vector3();
  const _pegLocal = new THREE.Vector3();
  const _invRootMat = new THREE.Matrix4();
  const _invTorsoMat = new THREE.Matrix4();
  const _laserLocal = new THREE.Vector3();
  const _tmpSample = {
    height: 0, moss: 0, cliff: 0, path: 0, scree: 0,
    riverDepth: 0, riverMask: 0, lakeDepth: 0, lakeMask: 0, lakeWaterY: 16, lakeShoreDist: -9999,
    flowX: 0, flowZ: 1, snow: 0, glacier: 0, wetness: 0, hummockAO: 0.5
  };

  function placeAt(x, z, yaw = state.yaw) {
    state.pos.set(x, getTerrainHeight(x, z), z);
    state.smoothBodyY = state.pos.y;
    state.vel.set(0, 0, 0);
    state.yaw = yaw;
    state.prevYaw = yaw;
    state.turnRate = 0;
    state.grounded = true;
    state.wasGrounded = true;
    state.landSquash = 0;
    state.landSquashVel = 0;
    root.quaternion.identity();
    root.position.copy(state.pos);
    root.rotation.set(0, yaw, 0);
  }

  function triggerScan() {
    state.scanActive = true;
    state.scanAge = 0.001;
    ATMO_UNIFORMS.uScanOrigin.value.copy(state.pos);
    ATMO_UNIFORMS.uScanRadius.value = 0.0;
    ATMO_UNIFORMS.uScanStrength.value = 1.0;
  }

  function setArmLaserTarget(worldPos, active) {
    state.laserPrintActive = !!active;
    if (active && worldPos) {
      state.laserTarget.copy(worldPos);
    }
  }

  function getArmEmitterWorldPos(outVec) {
    root.updateMatrixWorld(true);
    odradekCore.getWorldPosition(outVec);
    return outVec;
  }

  function setRiding(riding) {
    state.isRiding = !!riding;
    if (!state.isRiding) {
      root.quaternion.identity();
      root.rotation.set(0, state.yaw, 0);
      leftArm.shoulder.rotation.y = 0;
      rightArm.shoulder.rotation.y = 0;
    }
  }

  function update(dt, input, cameraYaw, terrainSystem, landmarkSystem) {
    const safeDt = Math.min(dt, 0.05);

    // Camera-relative movement direction (+Z forward in local model)
    let moveX = input.analogX || 0;
    let moveZ = input.analogY || 0;
    if (input.forward) moveZ -= 1;
    if (input.backward) moveZ += 1;
    if (input.left) moveX -= 1;
    if (input.right) moveX += 1;

    const rawMag = Math.hypot(moveX, moveZ);
    const hasInput = rawMag > 0.08;
    state.isSprinting = hasInput && (input.sprint || rawMag > 0.85 && (input.analogX || input.analogY));
    const speedScale = (input.analogX || input.analogY) ? clamp(rawMag, 0.25, 1.0) : 1.0;
    const maxSpeed = (state.isSprinting ? 7.4 : 3.45) * speedScale;

    state.prevYaw = state.yaw;
    if (hasInput) {
      const len = Math.hypot(moveX, moveZ);
      moveX /= len;
      moveZ /= len;

      const sinY = Math.sin(cameraYaw);
      const cosY = Math.cos(cameraYaw);
      const worldMoveX = moveX * cosY + moveZ * sinY;
      const worldMoveZ = -moveX * sinY + moveZ * cosY;

      _moveDir.set(worldMoveX, 0, worldMoveZ).normalize();
      const targetYaw = Math.atan2(_moveDir.x, _moveDir.z);

      let diff = targetYaw - state.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      state.yaw += diff * Math.min(1, safeDt * 9.5);

      const accel = state.grounded ? 16.0 : 5.5;
      state.vel.x = mix(state.vel.x, _moveDir.x * maxSpeed, clamp(safeDt * accel, 0, 1));
      state.vel.z = mix(state.vel.z, _moveDir.z * maxSpeed, clamp(safeDt * accel, 0, 1));
    } else {
      const decel = state.grounded ? 13.0 : 2.5;
      state.vel.x = mix(state.vel.x, 0, clamp(safeDt * decel, 0, 1));
      state.vel.z = mix(state.vel.z, 0, clamp(safeDt * decel, 0, 1));
    }

    // Track angular turn velocity for subtle, natural body banking into turns
    let yawDelta = state.yaw - state.prevYaw;
    while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
    while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
    const rawTurnRate = safeDt > 0.0001 ? clamp(yawDelta / safeDt, -3.2, 3.2) : 0;
    state.turnRate = mix(state.turnRate, rawTurnRate, clamp(safeDt * 6.5, 0, 1));

    if (input.jump && state.grounded) {
      state.vel.y = 6.2;
      state.grounded = false;
      state.packBounceVel -= 0.85; // Heavy pack lags momentarily on takeoff
    }

    // Gravity
    state.vel.y -= 18.5 * safeDt;

    const nextX = state.pos.x + state.vel.x * safeDt;
    const nextZ = state.pos.z + state.vel.z * safeDt;
    getTerrainNormal(nextX, nextZ, _groundNorm, 0.7);

    // Steep cliff blocking & sliding
    if (_groundNorm.y < 0.48 && state.grounded) {
      const pushDot = state.vel.x * _groundNorm.x + state.vel.z * _groundNorm.z;
      if (pushDot < 0) {
        state.vel.x -= _groundNorm.x * pushDot * 1.15;
        state.vel.z -= _groundNorm.z * pushDot * 1.15;
      }
      state.pos.x += state.vel.x * safeDt;
      state.pos.z += state.vel.z * safeDt;
    } else {
      state.pos.x = nextX;
      state.pos.z = nextZ;
    }

    // Boulder & village building collision resolution (supports both circles and precise oriented wall boxes)
    const resolveCols = (cols) => {
      const playerR = 0.38;
      for (const c of cols) {
        if (c.rideOnly) continue;
        if (c.doorRef && c.doorRef.openProgress > 0.65) continue;
        if (c.kind === 'box') {
          const dx = state.pos.x - c.x;
          const dz = state.pos.z - c.z;
          const lx = dx * c.cosY - dz * c.sinY;
          const lz = dx * c.sinY + dz * c.cosY;
          const cx = Math.max(-c.hx, Math.min(c.hx, lx));
          const cz = Math.max(-c.hz, Math.min(c.hz, lz));
          const dlx = lx - cx;
          const dlz = lz - cz;
          const dist = Math.hypot(dlx, dlz);
          let plx = 0;
          let plz = 0;
          if (dist > 0.0001 && dist < playerR) {
            const push = (playerR - dist) / dist;
            plx = dlx * push;
            plz = dlz * push;
          } else if (dist <= 0.0001) {
            const ox = c.hx - Math.abs(lx);
            const oz = c.hz - Math.abs(lz);
            if (ox < oz) plx = (lx >= 0 ? 1 : -1) * (ox + playerR);
            else plz = (lz >= 0 ? 1 : -1) * (oz + playerR);
          }
          if (plx !== 0 || plz !== 0) {
            state.pos.x += plx * c.cosY + plz * c.sinY;
            state.pos.z += -plx * c.sinY + plz * c.cosY;
          }
          continue;
        }
        const dx = state.pos.x - c.x;
        const dz = state.pos.z - c.z;
        const d = Math.hypot(dx, dz);
        const minR = c.r + 0.45;
        if (d > 0.001 && d < minR) {
          const push = (minR - d) / d;
          state.pos.x += dx * push;
          state.pos.z += dz * push;
        }
      }
    };
    if (terrainSystem) resolveCols(terrainSystem.getCollidersNear(state.pos.x, state.pos.z, 3.5));
    if (landmarkSystem) resolveCols(landmarkSystem.getCollidersNear(state.pos.x, state.pos.z, 6.5));

    state.pos.y += state.vel.y * safeDt;
    sampleWorld(state.pos.x, state.pos.z, _tmpSample);
    const caveInfo = getRiverCaveState(state.pos.x, state.pos.z, state.pos.y);
    let groundY = caveInfo.inCave ? caveInfo.floorY : _tmpSample.height;
    if (landmarkSystem && landmarkSystem.getFloorHeightAt) {
      const bFloor = landmarkSystem.getFloorHeightAt(state.pos.x, state.pos.z, state.pos.y);
      if (bFloor !== null) groundY = Math.max(groundY, bFloor);
    }
    // Buoyant wading floor in deep glacial lakes so the porter floats/wades smoothly at chest depth instead of sinking 30m!
    const lakeSubmerge = _tmpSample.lakeDepth || 0;
    if (lakeSubmerge > 1.12) {
      groundY = Math.max(groundY, _tmpSample.lakeWaterY - 1.12);
    }

    state.wasGrounded = state.grounded;
    // Allow slope/bump step-down snapping when previously grounded and not jumping upward
    // so walking down slopes or over moss hummocks doesn't flicker into the airborne/drop state
    const snapMargin = (state.wasGrounded && state.vel.y <= 0.0)
      ? (0.22 + Math.min(0.16, state.speed * 0.025))
      : 0.03;
    if (state.pos.y <= groundY + snapMargin) {
      if (!state.wasGrounded && state.vel.y < -2.2) {
        // Trigger weighted landing crouch & heavy backpack settle impulse!
        const impact = clamp(-state.vel.y / 9.5, 0.15, 1.0);
        state.landSquashVel -= impact * 2.8;
        state.packBounceVel -= impact * 1.6;
        if (onFootstep) onFootstep(state.surfaceType, true);
      }
      state.pos.y = groundY;
      state.vel.y = 0;
      state.grounded = true;
      state.airTime = 0;
    } else {
      state.grounded = false;
      state.airTime += safeDt;
    }

    // Smooth upper-body vertical reference (acts as chassis height while legs act as suspension)
    const bodyDiff = state.pos.y - state.smoothBodyY;
    const absBodyDiff = Math.abs(bodyDiff);
    const bodyFollowRate = state.grounded
      ? mix(4.0, 12.0, clamp((absBodyDiff - 0.10) / 0.30, 0, 1))
      : 16.0;
    state.smoothBodyY = mix(state.smoothBodyY, state.pos.y, 1.0 - Math.exp(-bodyFollowRate * safeDt));
    const suspOffset = clamp(state.smoothBodyY - state.pos.y, -0.22, 0.09);
    state.smoothBodyY = state.pos.y + suspOffset;

    // Classify ground surface & wading depth (rivers, caves, and glacial lake shallows)
    const isWading = caveInfo.inCave || _tmpSample.riverDepth > 0.18 || lakeSubmerge > 0.16;
    if (isWading) state.surfaceType = 'water';
    else if (_tmpSample.scree > 0.45 || _tmpSample.path > 0.35) state.surfaceType = 'gravel';
    else state.surfaceType = 'moss';

    state.speed = Math.hypot(state.vel.x, state.vel.z);
    state.isMoving = state.speed > 0.22;

    // Smooth locomotion blend weights (eliminates abrupt animation snapping!)
    const targetMoveBlend = state.grounded ? clamp(state.speed / 2.8, 0, 1) : 0;
    const targetSprintBlend = state.grounded && state.isSprinting ? clamp((state.speed - 3.0) / 3.8, 0, 1) : 0;
    state.gaitBlend = mix(state.gaitBlend, targetMoveBlend, clamp(safeDt * 9.5, 0, 1));
    state.sprintBlend = mix(state.sprintBlend, targetSprintBlend, clamp(safeDt * 7.0, 0, 1));
    state.wadeBlend = mix(state.wadeBlend, isWading ? 1.0 : 0.0, clamp(safeDt * 5.0, 0, 1));

    // Measure forward terrain slope along facing vector for uphill lean / downhill bracing
    const fwdX = Math.sin(state.yaw);
    const fwdZ = Math.cos(state.yaw);
    const slopeAhead = clamp(-(_groundNorm.x * fwdX + _groundNorm.z * fwdZ), -0.55, 0.55);
    state.slopeLean = mix(state.slopeLean, slopeAhead, clamp(safeDt * 6.0, 0, 1));

    // Secondary spring-damper integration (landing squash + heavy backpack bounce)
    state.landSquashVel += (-state.landSquash * 58.0 - state.landSquashVel * 11.5) * safeDt;
    state.landSquash = clamp(state.landSquash + state.landSquashVel * safeDt, -0.22, 0.06);

    state.packBounceVel += (-state.packBounceY * 68.0 - state.packBounceVel * 9.5) * safeDt;
    state.packBounceY = clamp(state.packBounceY + state.packBounceVel * safeDt, -0.055, 0.045);

    const t = ATMO_UNIFORMS.uTime.value;

    // 4. Articulated 3-Joint Shoulder Mechanical Arm (Odradek Scanner & 3D Laser Printer!)
    if (state.laserPrintActive) {
      // Transform live 3D laser print focal point into upperTorsoGroup local space to articulate the mechanical arm!
      upperTorsoGroup.updateMatrixWorld(true);
      _invTorsoMat.copy(upperTorsoGroup.matrixWorld).invert();
      _laserLocal.copy(state.laserTarget).applyMatrix4(_invTorsoMat).sub(odradekBase.position);
      const aimYaw = clamp(Math.atan2(_laserLocal.x, Math.max(0.25, _laserLocal.z)), -1.15, 1.15);
      const horizD = Math.hypot(_laserLocal.x, _laserLocal.z);
      const aimPitch = clamp(Math.atan2(-_laserLocal.y, Math.max(0.35, horizD)), -0.55, 0.72);

      // Unfold arm high & forward over the shoulder and track the rising laser print plane!
      odradekBase.rotation.y = mix(odradekBase.rotation.y, aimYaw * 0.85, clamp(safeDt * 12, 0, 1));
      odradekLowerArm.rotation.z = mix(odradekLowerArm.rotation.z, -0.22, clamp(safeDt * 10, 0, 1));
      odradekLowerArm.rotation.x = mix(odradekLowerArm.rotation.x, 0.56 + aimPitch * 0.35, clamp(safeDt * 12, 0, 1));
      odradekUpperArm.rotation.z = mix(odradekUpperArm.rotation.z, 0.14, clamp(safeDt * 10, 0, 1));
      odradekUpperArm.rotation.x = mix(odradekUpperArm.rotation.x, 0.34 + aimPitch * 0.45, clamp(safeDt * 12, 0, 1));
      odradekHead.rotation.x = mix(odradekHead.rotation.x, aimPitch * 0.45, clamp(safeDt * 14, 0, 1));
      odradekHead.rotation.z += safeDt * 18.0;
      for (let i = 0; i < petals.length; i++) {
        petals[i].rotation.x = mix(petals[i].rotation.x, -0.58, clamp(safeDt * 12, 0, 1));
      }
    } else if (state.scanActive) {
      state.scanAge += safeDt;
      const p = state.scanAge / state.scanDuration;
      ATMO_UNIFORMS.uScanRadius.value = p * 125.0;
      ATMO_UNIFORMS.uScanStrength.value = Math.sin(clamp(p, 0, 1) * Math.PI);
      // Unfold arm dramatically up & forward, flare petals wide & spin optical head
      odradekBase.rotation.y = mix(odradekBase.rotation.y, 0, clamp(safeDt * 8, 0, 1));
      odradekLowerArm.rotation.z = mix(odradekLowerArm.rotation.z, -0.14, clamp(safeDt * 10, 0, 1));
      odradekLowerArm.rotation.x = mix(odradekLowerArm.rotation.x, 0.28, clamp(safeDt * 10, 0, 1));
      odradekUpperArm.rotation.z = mix(odradekUpperArm.rotation.z, 0.08, clamp(safeDt * 10, 0, 1));
      odradekUpperArm.rotation.x = mix(odradekUpperArm.rotation.x, 0, clamp(safeDt * 8, 0, 1));
      odradekHead.rotation.x = mix(odradekHead.rotation.x, 0, clamp(safeDt * 8, 0, 1));
      odradekHead.rotation.z += safeDt * 15.0;
      for (let i = 0; i < petals.length; i++) {
        petals[i].rotation.x = mix(petals[i].rotation.x, -0.35, clamp(safeDt * 12, 0, 1));
      }
      if (p >= 1.0) {
        state.scanActive = false;
        ATMO_UNIFORMS.uScanStrength.value = 0.0;
        ATMO_UNIFORMS.uScanRadius.value = -10.0;
      }
    } else {
      // Subtle living mechanical idle micro-tracking & breathing sway
      const idleWave = Math.sin(t * 1.4) * 0.04;
      odradekBase.rotation.y = mix(odradekBase.rotation.y, 0, clamp(safeDt * 5, 0, 1));
      odradekLowerArm.rotation.z = mix(odradekLowerArm.rotation.z, -0.32 + idleWave, clamp(safeDt * 5, 0, 1));
      odradekLowerArm.rotation.x = mix(odradekLowerArm.rotation.x, -0.08 + state.sprintBlend * 0.16, clamp(safeDt * 5, 0, 1));
      odradekUpperArm.rotation.z = mix(odradekUpperArm.rotation.z, 0.24 - idleWave * 0.8, clamp(safeDt * 5, 0, 1));
      odradekUpperArm.rotation.x = mix(odradekUpperArm.rotation.x, 0, clamp(safeDt * 5, 0, 1));
      odradekHead.rotation.x = mix(odradekHead.rotation.x, 0, clamp(safeDt * 6, 0, 1));
      odradekHead.rotation.z += safeDt * (state.isMoving ? 2.1 : 0.48);
      for (let i = 0; i < petals.length; i++) {
        petals[i].rotation.x = mix(petals[i].rotation.x, 0.05, clamp(safeDt * 6, 0, 1));
      }
    }

    // 5. Full-Body Physically Grounded Procedural Animation (2-Bone Analytical Leg IK)
    const sp = state.sprintBlend;
    const wd = state.wadeBlend;
    const halfStride = mix(0.54, 0.76, sp) * mix(1.0, 0.84, wd);
    const stanceFrac = mix(0.54, 0.42, sp);

    if (state.gaitBlend > 0.02 && state.grounded) {
      // Long, weighty porter stride matched to ground speed
      const cycleRate = (state.speed * stanceFrac) / Math.max(0.2, 2.0 * halfStride * 1.25);
      const freq = clamp(cycleRate * Math.PI * 2.0, 2.8, 12.5) * mix(1.0, 0.88, wd);
      state.gaitPhase += safeDt * freq;

      const stepHalf = Math.floor(state.gaitPhase / Math.PI);
      if (stepHalf !== state.lastStepHalf) {
        state.lastStepHalf = stepHalf;
        // Subtle heavy backpack downward jolt on every footfall!
        state.packBounceVel -= mix(0.22, 0.52, state.sprintBlend);
        if (onFootstep) onFootstep(state.surfaceType, state.isSprinting);
      }
    }

    const g = state.gaitBlend;
    const ph = state.gaitPhase;

    // Idle relaxed asymmetric stance (realistic breathing + slow natural weight shift & head vista scanning!)
    const breathe = Math.sin(t * 1.65);
    const weightShift = Math.sin(t * 0.55) * 0.018;
    const idleLookYaw = Math.sin(t * 0.38) * 0.22 + Math.sin(t * 0.83) * 0.08;
    const idleLookPitch = Math.sin(t * 0.52 + 1.1) * 0.05 - 0.02;

    // Delay drop/fall pose slightly unless jumping upward so brief terrain micro-drops never flicker
    const airAnimTime = state.vel.y > 0.5 ? state.airTime : Math.max(0, state.airTime - 0.14);
    const airBlend = state.grounded ? 0.0 : clamp(airAnimTime * 6.5, 0, 1);

    // Pelvis motion: double-frequency vertical arc (lowest at double-support, highest at mid-stance), sway, yaw & banking
    const strideBounce = -Math.cos(ph * 2.0) * mix(0.022, 0.048, sp) - mix(0.025, 0.045, sp);
    const walkHipSwayX = Math.cos(ph) * mix(0.014, 0.022, sp);
    const walkHipDropZ = Math.sin(ph) * mix(0.036, 0.054, sp);
    const walkHipYawY = Math.cos(ph) * mix(0.085, 0.13, sp);
    const turnBank = state.turnRate * g * mix(0.012, 0.024, sp);

    const targetPelvisY = mix(0.92, 0.90, g) + suspOffset + mix(breathe * 0.006, strideBounce, g) + state.landSquash * 0.65 - airBlend * 0.04;
    const targetPelvisX = mix(weightShift, walkHipSwayX, g);
    const targetPelvisZ = 0;

    pelvisGroup.position.set(targetPelvisX, targetPelvisY, targetPelvisZ);
    pelvisGroup.rotation.y = mix(weightShift * 1.4, walkHipYawY, g);
    pelvisGroup.rotation.z = mix(-weightShift * 1.2, walkHipDropZ, g) - turnBank;
    pelvisGroup.rotation.x = mix(0.03, mix(0.07, 0.14, sp), g) + Math.max(0, state.slopeLean) * 0.20 - state.landSquash * 0.55;

    // Upper Torso: natural counter-rotation against pelvis + heavy-pack forward climb lean + subtle storm gale bracing
    const galeFactor = smoothstep(1.05, 1.75, ATMO_UNIFORMS.uWindStrength.value);
    const galeBuffet = galeFactor * Math.sin(t * 6.5 + Math.sin(t * 2.1) * 1.4) * 0.012;
    const torsoCounterYaw = -walkHipYawY * 1.42;
    const torsoForwardLean =
      mix(0.05 + breathe * 0.014, mix(0.11, 0.26, sp), g) +
      state.slopeLean * 0.34 -
      state.landSquash * 0.85 +
      airBlend * 0.16 +
      galeFactor * 0.065;

    upperTorsoGroup.rotation.y = mix(idleLookYaw * 0.22, torsoCounterYaw, g);
    upperTorsoGroup.rotation.x = torsoForwardLean;
    upperTorsoGroup.rotation.z = mix(weightShift * 1.1, -walkHipDropZ * 0.72, g) - turnBank * 0.55 + galeBuffet;
    upperTorsoGroup.position.y = 0.09 + breathe * 0.005 * (1.0 - g * 0.5);

    // Head stabilization: keeps eyes naturally level on the horizon & tracks turns/scans!
    const scanHeadYaw = state.scanActive ? Math.sin(state.scanAge * 2.6) * 0.28 : 0;
    const targetHeadYaw = mix(idleLookYaw * 0.78, -torsoCounterYaw * 0.65 + clamp(state.turnRate * 0.12, -0.28, 0.28), g) + scanHeadYaw;
    const targetHeadPitch = mix(idleLookPitch, -torsoForwardLean * 0.62 - state.slopeLean * 0.15, g) - (state.scanActive ? 0.08 : 0);
    headGroup.rotation.y = mix(headGroup.rotation.y, targetHeadYaw, clamp(safeDt * 8.0, 0, 1));
    headGroup.rotation.x = mix(headGroup.rotation.x, targetHeadPitch, clamp(safeDt * 8.0, 0, 1));
    headGroup.rotation.z = -upperTorsoGroup.rotation.z * 0.65;

    // Secondary heavy backpack inertia bounce & lateral sway
    const targetPackSway = -walkHipDropZ * 0.85 - turnBank * 0.7;
    state.packSwayZ = mix(state.packSwayZ, targetPackSway, clamp(safeDt * 7.5, 0, 1));
    packGroup.position.y = 0.21 + state.packBounceY;
    packGroup.rotation.z = state.packSwayZ;
    packGroup.rotation.x = -state.packBounceY * 1.4;

    // Foot trajectory in root space + 2-bone analytical IK (zero ground slip & automatic leg suspension!)
    const stepHeight = mix(0.14, 0.28, sp) + wd * 0.12;
    function evalFootTarget(phaseRad, side) {
      const u = (((phaseRad / (Math.PI * 2.0)) % 1.0) + 1.0) % 1.0;
      let fz = 0;
      let fy = 0;
      let inStance = true;
      let stanceT = 0;
      let swingT = 0;

      if (u < stanceFrac) {
        stanceT = u / stanceFrac;
        fz = mix(halfStride, -halfStride, stanceT);
        fy = 0;
        inStance = true;
      } else {
        swingT = (u - stanceFrac) / (1.0 - stanceFrac);
        fz = mix(-halfStride, halfStride, 0.5 - 0.5 * Math.cos(Math.PI * swingT));
        fy = Math.sin(Math.PI * swingT) * stepHeight;
        inStance = false;
      }

      const idleZ = side * 0.04;
      const targetZ = mix(idleZ, fz, g);
      const targetLift = fy * g;

      let groundRelY = 0;
      if (state.grounded && !caveInfo.inCave) {
        const rightX = Math.cos(state.yaw);
        const rightZ = -Math.sin(state.yaw);
        const sampleY = getTerrainHeight(
          state.pos.x + rightX * (side * 0.105) + fwdX * targetZ,
          state.pos.z + rightZ * (side * 0.105) + fwdZ * targetZ
        );
        groundRelY = clamp(sampleY - state.pos.y, -0.14, 0.18);
      }

      return {
        x: side * 0.105,
        y: groundRelY + targetLift + 0.10, // +0.10 = ankle height above boot sole bottom
        z: targetZ,
        inStance,
        stanceT,
        swingT
      };
    }

    const lFoot = evalFootTarget(ph, 1);
    const rFoot = evalFootTarget(ph + Math.PI, -1);

    _pelvisQuat.setFromEuler(pelvisGroup.rotation);
    _invPelvisQuat.copy(_pelvisQuat).invert();
    const L1 = 0.42;
    const L2 = 0.39;

    function solveLegIK(side, foot) {
      // Exact hip socket position in root space
      _hipWorld.set(side * 0.104, -0.03, 0).applyQuaternion(_pelvisQuat).add(pelvisGroup.position);
      // Vector from hip to ankle target, transformed into pelvis local space so pelvis roll/pitch/yaw never pull the foot!
      _footTarget.set(foot.x, foot.y, foot.z).sub(_hipWorld).applyQuaternion(_invPelvisQuat);

      const dx = _footTarget.x;
      const dy = _footTarget.y;
      const dz = _footTarget.z;

      const r = Math.hypot(dx, Math.max(0.15, -dy));
      const d = clamp(Math.hypot(r, dz), 0.18, L1 + L2 - 0.004);

      const cosKnee = clamp((L1 * L1 + L2 * L2 - d * d) / (2.0 * L1 * L2), -1, 1);
      const kneeX = Math.PI - Math.acos(cosKnee);

      const cosAlpha = clamp((L1 * L1 + d * d - L2 * L2) / (2.0 * L1 * d), -1, 1);
      const alpha = Math.acos(cosAlpha);
      const targetPitch = Math.atan2(dz, r);
      const hipX = -(targetPitch + alpha);
      const hipZ = clamp(Math.atan2(dx, Math.max(0.45, Math.hypot(-dy, dz))), -0.22, 0.22);

      // Keep boot sole flat on terrain during stance, with natural heel-strike & toe-off roll
      const flatAnkleX = -(hipX + kneeX + pelvisGroup.rotation.x * 0.85);
      let anklePitchOffset = 0;
      if (g > 0.05) {
        if (foot.inStance) {
          const heelStrike = Math.max(0, 1.0 - foot.stanceT * 4.0) * -0.16;
          const toeOff = Math.max(0, (foot.stanceT - 0.72) / 0.28) * 0.28;
          anklePitchOffset = (heelStrike + toeOff) * g;
        } else {
          anklePitchOffset = (0.18 * (1.0 - foot.swingT) - 0.20 * Math.sin(Math.PI * foot.swingT)) * g;
        }
      }
      const ankleX = flatAnkleX + anklePitchOffset;
      const ankleZ = -(hipZ + pelvisGroup.rotation.z);

      return { hipX, hipZ, kneeX, ankleX, ankleZ };
    }

    const lIK = solveLegIK(1, lFoot);
    const rIK = solveLegIK(-1, rFoot);

    const lHipAir = -0.52;
    const rHipAir = 0.26;
    const lKneeAir = 0.78;
    const rKneeAir = 0.36;
    const lAnkleAir = 0.28;
    const rAnkleAir = 0.35;

    leftLeg.hip.rotation.x = mix(lIK.hipX, lHipAir, airBlend);
    rightLeg.hip.rotation.x = mix(rIK.hipX, rHipAir, airBlend);
    leftLeg.hip.rotation.z = mix(lIK.hipZ, 0.04, airBlend);
    rightLeg.hip.rotation.z = mix(rIK.hipZ, -0.04, airBlend);
    leftLeg.hip.rotation.y = -pelvisGroup.rotation.y * 0.9;
    rightLeg.hip.rotation.y = -pelvisGroup.rotation.y * 0.9;

    leftLeg.knee.rotation.x = mix(lIK.kneeX, lKneeAir, airBlend);
    rightLeg.knee.rotation.x = mix(rIK.kneeX, rKneeAir, airBlend);

    leftLeg.ankle.rotation.x = mix(lIK.ankleX, lAnkleAir, airBlend);
    rightLeg.ankle.rotation.x = mix(rIK.ankleX, rAnkleAir, airBlend);
    leftLeg.ankle.rotation.z = mix(lIK.ankleZ, 0, airBlend);
    rightLeg.ankle.rotation.z = mix(rIK.ankleZ, 0, airBlend);

    // Arms: opposite-phase weighted swing + elbow inertia + subtle strap-stabilizing posture on sprints/climbs!
    const armSwingAmp = mix(0.38, 0.74, sp);
    const climbStrapGrip = clamp(state.slopeLean * 0.8 + sp * 0.22, 0, 0.45);
    const sArm = Math.cos(ph);

    const lArmIdleX = 0.06 + breathe * 0.015;
    const rArmIdleX = -0.05 + breathe * 0.015;
    const lArmWalkX = sArm * armSwingAmp - climbStrapGrip * 0.35;
    const rArmWalkX = -sArm * armSwingAmp - climbStrapGrip * 0.35;
    const lArmAirX = -0.45;
    const rArmAirX = -0.30;

    const lElbowWalkX = -mix(0.30, 0.92, sp) - Math.max(0, -sArm) * 0.35 - climbStrapGrip * 0.45;
    const rElbowWalkX = -mix(0.30, 0.92, sp) - Math.max(0, sArm) * 0.35 - climbStrapGrip * 0.45;

    const armLerp = clamp(safeDt * 14.0, 0, 1);
    leftArm.shoulder.rotation.x = mix(leftArm.shoulder.rotation.x, mix(mix(lArmIdleX, lArmWalkX, g), lArmAirX, airBlend), armLerp);
    rightArm.shoulder.rotation.x = mix(rightArm.shoulder.rotation.x, mix(mix(rArmIdleX, rArmWalkX, g), rArmAirX, airBlend), armLerp);

    leftArm.shoulder.rotation.z = mix(0.11 + breathe * 0.012, 0.14 + sp * 0.08 + wd * 0.10, g) + airBlend * 0.32;
    rightArm.shoulder.rotation.z = mix(-0.11 - breathe * 0.012, -0.14 - sp * 0.08 - wd * 0.10, g) - airBlend * 0.32;

    leftArm.elbow.rotation.x = mix(leftArm.elbow.rotation.x, mix(mix(-0.26, lElbowWalkX, g), -0.65, airBlend), armLerp);
    rightArm.elbow.rotation.x = mix(rightArm.elbow.rotation.x, mix(mix(-0.22, rElbowWalkX, g), -0.55, airBlend), armLerp);

    leftArm.wrist.rotation.x = mix(-0.08, -0.16 - sp * 0.14, g);
    rightArm.wrist.rotation.x = mix(-0.08, -0.16 - sp * 0.14, g);
    leftArm.shoulder.rotation.y = mix(leftArm.shoulder.rotation.y, 0, armLerp);
    rightArm.shoulder.rotation.y = mix(rightArm.shoulder.rotation.y, 0, armLerp);

    // Automatic night, subterranean cave & indoor building chest-lamp activation!
    const lampNeed = Math.max(
      smoothstep(0.35, 0.85, ATMO_UNIFORMS.uNightFactor.value),
      caveInfo.darkness || 0,
      ATMO_UNIFORMS.uInsideBuilding.value * 0.85,
      ATMO_UNIFORMS.uIndoorDarkness.value
    );
    chestLamp.intensity = lampNeed * 14.0;

    root.position.copy(state.pos);
    root.rotation.y = state.yaw;
  }

  /**
   * Lock the Porter anatomically onto the Bridges RT-04 motorcycle saddle with live 2-bone IK
   * connecting both gloved hands to the steering handlebar grips and both arctic boots to the footpegs!
   */
  function syncRidingPose(dt, bikeData) {
    const safeDt = Math.min(dt, 0.05);
    const t = ATMO_UNIFORMS.uTime.value;

    state.pos.copy(bikeData.bikePos);
    state.smoothBodyY = bikeData.bikePos.y;
    state.yaw = bikeData.bikeYaw;
    state.speed = Math.abs(bikeData.bikeSpeed);
    state.isMoving = state.speed > 0.3;
    state.grounded = true;
    state.wasGrounded = true;

    root.position.copy(bikeData.seatWorldPos);
    root.quaternion.copy(bikeData.seatWorldQuat);

    const speedRatio = clamp(state.speed / 22.0, 0, 1);
    const boostTuck = bikeData.boosting ? 0.14 : 0.0;
    const breathe = Math.sin(t * 2.2) * 0.008;

    // Seated pelvis squarely on the motorcycle saddle (local y = 0.87 matches saddle height 0.84)
    pelvisGroup.position.set(0, 0.87, 0.01);
    pelvisGroup.rotation.set(0.14, 0, 0);

    // Forward aerodynamic riding lean + subtle turn lean-in & boost crouch
    const torsoPitch = 0.34 + speedRatio * 0.10 + boostTuck + breathe;
    upperTorsoGroup.position.set(0, 0.09, 0);
    upperTorsoGroup.rotation.set(torsoPitch, bikeData.steerAngle * 0.18, -bikeData.steerAngle * 0.14);

    // Head looks cleanly ahead down the trail & subtly into corners
    headGroup.rotation.x = mix(headGroup.rotation.x, -torsoPitch * 0.78, clamp(safeDt * 10, 0, 1));
    headGroup.rotation.y = mix(headGroup.rotation.y, bikeData.steerAngle * 0.55, clamp(safeDt * 10, 0, 1));
    headGroup.rotation.z = -upperTorsoGroup.rotation.z * 0.6;

    // Smooth suspension-coupled backpack settle (zero high-frequency vibration!)
    const targetPackY = 0.21 + clamp(-(bikeData.suspVel || 0) * 0.009, -0.024, 0.024);
    packGroup.position.y = mix(packGroup.position.y, targetPackY, clamp(safeDt * 10, 0, 1));
    packGroup.rotation.z = -bikeData.steerAngle * 0.12;
    packGroup.rotation.x = 0.05;

    // Keep Odradek terrain scanner fully functional while riding!
    if (state.scanActive) {
      state.scanAge += safeDt;
      const p = state.scanAge / state.scanDuration;
      ATMO_UNIFORMS.uScanRadius.value = p * 125.0;
      ATMO_UNIFORMS.uScanStrength.value = Math.sin(clamp(p, 0, 1) * Math.PI);
      odradekBase.rotation.y = mix(odradekBase.rotation.y, 0, clamp(safeDt * 8, 0, 1));
      odradekLowerArm.rotation.z = mix(odradekLowerArm.rotation.z, -0.14, clamp(safeDt * 10, 0, 1));
      odradekLowerArm.rotation.x = mix(odradekLowerArm.rotation.x, 0.28, clamp(safeDt * 10, 0, 1));
      odradekUpperArm.rotation.z = mix(odradekUpperArm.rotation.z, 0.08, clamp(safeDt * 10, 0, 1));
      odradekUpperArm.rotation.x = mix(odradekUpperArm.rotation.x, 0, clamp(safeDt * 8, 0, 1));
      odradekHead.rotation.z += safeDt * 15.0;
      for (let i = 0; i < petals.length; i++) {
        petals[i].rotation.x = mix(petals[i].rotation.x, -0.35, clamp(safeDt * 12, 0, 1));
      }
      if (p >= 1.0) {
        state.scanActive = false;
        ATMO_UNIFORMS.uScanStrength.value = 0.0;
        ATMO_UNIFORMS.uScanRadius.value = -10.0;
      }
    } else {
      odradekBase.rotation.y = mix(odradekBase.rotation.y, 0, clamp(safeDt * 5, 0, 1));
      odradekLowerArm.rotation.z = mix(odradekLowerArm.rotation.z, -0.34, clamp(safeDt * 5, 0, 1));
      odradekLowerArm.rotation.x = mix(odradekLowerArm.rotation.x, -0.16 - speedRatio * 0.14, clamp(safeDt * 5, 0, 1));
      odradekUpperArm.rotation.z = mix(odradekUpperArm.rotation.z, 0.28, clamp(safeDt * 5, 0, 1));
      odradekUpperArm.rotation.x = mix(odradekUpperArm.rotation.x, 0, clamp(safeDt * 5, 0, 1));
      odradekHead.rotation.x = mix(odradekHead.rotation.x, 0, clamp(safeDt * 6, 0, 1));
      odradekHead.rotation.z += safeDt * (1.2 + speedRatio * 3.5);
      for (let i = 0; i < petals.length; i++) {
        petals[i].rotation.x = mix(petals[i].rotation.x, 0.12, clamp(safeDt * 6, 0, 1));
      }
    }

    // Update matrices so world-to-local transforms for exact handlebar & footpeg IK are frame-accurate
    root.updateMatrixWorld(true);
    _invRootMat.copy(root.matrixWorld).invert();
    _invTorsoMat.copy(upperTorsoGroup.matrixWorld).invert();

    // 2-Bone Leg IK onto motorcycle left/right footpegs (knees naturally straddling tank!)
    _pelvisQuat.setFromEuler(pelvisGroup.rotation);
    _invPelvisQuat.copy(_pelvisQuat).invert();
    const L1 = 0.42;
    const L2 = 0.39;

    function solveRidingLeg(leg, side, pegWorld) {
      _pegLocal.copy(pegWorld).applyMatrix4(_invRootMat);
      _hipWorld.set(side * 0.104, -0.03, 0).applyQuaternion(_pelvisQuat).add(pelvisGroup.position);
      _footTarget.copy(_pegLocal).sub(_hipWorld).applyQuaternion(_invPelvisQuat);

      const dx = _footTarget.x + side * 0.04;
      const dy = _footTarget.y + 0.08;
      const dz = _footTarget.z;
      const r = Math.hypot(dx, Math.max(0.12, -dy));
      const d = clamp(Math.hypot(r, dz), 0.22, L1 + L2 - 0.01);

      const cosKnee = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
      const kneeX = Math.PI - Math.acos(cosKnee);
      const cosAlpha = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
      const alpha = Math.acos(cosAlpha);
      const targetPitch = Math.atan2(dz, r);

      leg.hip.rotation.x = -(targetPitch + alpha);
      leg.hip.rotation.z = side * 0.25; // Clean knee straddle around fuel tank
      leg.hip.rotation.y = side * 0.08;
      leg.knee.rotation.x = kneeX;
      leg.ankle.rotation.x = -(leg.hip.rotation.x + kneeX) * 0.65 + 0.18;
      leg.ankle.rotation.z = -side * 0.14;
    }

    solveRidingLeg(leftLeg, 1, bikeData.leftPegWorld);
    solveRidingLeg(rightLeg, -1, bikeData.rightPegWorld);

    // 2-Bone Arm IK locking gloved hands precisely onto the steering handlebar grips!
    const La = 0.285;
    const Lb = 0.315;
    function solveRidingArm(arm, side, gripWorld) {
      _armTargetLocal.copy(gripWorld).applyMatrix4(_invTorsoMat).sub(arm.shoulder.position);
      const dx = _armTargetLocal.x;
      const dy = _armTargetLocal.y;
      const dz = _armTargetLocal.z;
      const horizD = Math.hypot(dx, dz);
      const d = clamp(Math.hypot(horizD, dy), 0.18, La + Lb - 0.008);

      const cosElbow = clamp((La * La + Lb * Lb - d * d) / (2 * La * Lb), -1, 1);
      const elbowBend = Math.PI - Math.acos(cosElbow);
      const cosAlpha = clamp((La * La + d * d - Lb * Lb) / (2 * La * d), -1, 1);
      const alpha = Math.acos(cosAlpha);
      const basePitch = Math.atan2(horizD, -dy);

      arm.shoulder.rotation.y = Math.atan2(dx, Math.max(0.06, dz));
      arm.shoulder.rotation.x = -(basePitch - alpha);
      arm.shoulder.rotation.z = side * 0.10;
      arm.elbow.rotation.x = -elbowBend;
      arm.wrist.rotation.x = 0.22;
    }

    solveRidingArm(leftArm, 1, bikeData.leftGripWorld);
    solveRidingArm(rightArm, -1, bikeData.rightGripWorld);

    // Keep chest headlamp dimmed while riding since motorcycle headlight takes over
    chestLamp.intensity = 0.0;
  }

  return {
    root,
    state,
    placeAt,
    triggerScan,
    setArmLaserTarget,
    getArmEmitterWorldPos,
    setRiding,
    syncRidingPose,
    update
  };
}
