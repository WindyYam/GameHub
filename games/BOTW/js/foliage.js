import * as THREE from 'three';
import {
  getTerrainHeight,
  getTerrainNormal,
  getPathCenterX,
  getQuayX,
  getCityTerraceY,
  CITY_BOUNDS,
  isInCityBounds,
  isOnRoadOrHighway,
  fbm2,
  hash2,
  WATER_LEVEL
} from './noise.js';
import { ATMO_UNIFORMS, ATMO_GLSL_PARS, enhancePBRMaterial } from './atmosphere.js';
import { mergeGeometries, createLODInstancedBatch } from './assets.js';

function createCurvedCard(width, height, bend = 0.18) {
  const geo = new THREE.PlaneGeometry(width, height, 2, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const nx = x / (width * 0.5);
    const ny = y / (height * 0.5);
    pos.setZ(i, -(nx * nx + ny * ny) * bend);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Crossed 4-triangle vertical billboard sprite geometry for LOD2 distant trees. */
function createTreeImpostorGeometry(w = 6.2, h = 8.4) {
  const g1 = new THREE.PlaneGeometry(w, h);
  g1.translate(0, h * 0.48, 0);
  const g2 = g1.clone();
  g2.rotateY(Math.PI * 0.5);
  return mergeGeometries([g1, g2]);
}

function createCrossedCanopyGeo(cards, w, h, centerY) {
  const parts = [];
  for (let i = 0; i < cards; i++) {
    const c = new THREE.PlaneGeometry(w, h);
    c.rotateY((i / cards) * Math.PI);
    c.rotateX((i % 2 === 0 ? 1 : -1) * 0.18);
    c.translate(0, centerY, 0);
    const ni = c.index ? c.toNonIndexed() : c;
    const cols = new Float32Array(ni.attributes.position.count * 3).fill(0.92);
    ni.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    parts.push(ni);
  }
  return mergeGeometries(parts);
}

// =========================================================================
// 1. MULTI-LOD TREE SPECIES GEOMETRY BUILDERS
// =========================================================================
function createOakLODGeos() {
  const trunkParts = [];
  const mainTrunk = new THREE.CylinderGeometry(0.24, 0.56, 4.4, 8, 4);
  mainTrunk.translate(0, 2.2, 0);
  const mp = mainTrunk.attributes.position;
  for (let i = 0; i < mp.count; i++) {
    const y = mp.getY(i);
    const rootFlare = Math.exp(-y * 1.4) * 0.25;
    const x = mp.getX(i);
    const z = mp.getZ(i);
    const ang = Math.atan2(z, x);
    const flare = 1.0 + rootFlare * (1.0 + 0.5 * Math.cos(ang * 4.0));
    mp.setXYZ(i, x * flare + Math.sin(y * 0.55) * 0.18, y, z * flare + Math.cos(y * 0.4) * 0.1);
  }
  mainTrunk.computeVertexNormals();
  trunkParts.push(mainTrunk);

  const boughSpecs = [
    { rx: 0.52, ry: 0.3, rz: 0.45, len: 2.6, y: 3.4 },
    { rx: -0.48, ry: 1.9, rz: -0.42, len: 2.5, y: 3.6 },
    { rx: 0.35, ry: 3.4, rz: -0.52, len: 2.4, y: 3.5 },
    { rx: -0.42, ry: 5.0, rz: 0.48, len: 2.5, y: 3.7 }
  ];
  boughSpecs.forEach((b) => {
    const g = new THREE.CylinderGeometry(0.08, 0.20, b.len, 6, 2);
    g.translate(0, b.len * 0.5, 0);
    g.rotateX(b.rx);
    g.rotateZ(b.rz);
    g.rotateY(b.ry);
    g.translate(0, b.y, 0);
    trunkParts.push(g);
  });
  const trunkLod0 = mergeGeometries(trunkParts);

  const trunkLod1 = new THREE.CylinderGeometry(0.20, 0.46, 4.4, 5, 1);
  trunkLod1.translate(0, 2.2, 0);

  const cardParts = [];
  const crownCenter = new THREE.Vector3(0, 5.4, 0);
  const tmpN = new THREE.Vector3();
  for (let i = 0; i < 24; i++) {
    const golden = i * 2.3999632;
    const t = i / 24;
    const shell = i < 7 ? 0.58 : 1.0;
    const rad = (1.35 + (i % 4) * 0.38) * shell;
    const heightOff = (t - 0.35) * 2.6;
    const cx = Math.cos(golden) * rad;
    const cz = Math.sin(golden) * rad;
    const cy = 5.2 + heightOff + (1.0 - Math.abs(t - 0.5)) * 0.7;
    const cardW = 2.4 + (i % 3) * 0.35;
    const card = createCurvedCard(cardW, cardW, 0.24);
    card.rotateX((hash2(i, 11) - 0.5) * 1.45);
    card.rotateY(golden + hash2(i, 13) * 1.2);
    card.rotateZ((hash2(i, 17) - 0.5) * 1.3);
    card.translate(cx, cy, cz);

    const ni = card.index ? card.toNonIndexed() : card;
    const p = ni.attributes.position;
    const n = ni.attributes.normal;
    const colors = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const vx = p.getX(k), vy = p.getY(k), vz = p.getZ(k);
      tmpN.set(vx - crownCenter.x, (vy - crownCenter.y) * 1.15, vz - crownCenter.z).normalize();
      n.setXYZ(k, n.getX(k) * 0.3 + tmpN.x * 0.7, n.getY(k) * 0.3 + tmpN.y * 0.7, n.getZ(k) * 0.3 + tmpN.z * 0.7);
      const distOut = Math.hypot(vx - crownCenter.x, vy - crownCenter.y, vz - crownCenter.z);
      const ao = THREE.MathUtils.clamp(0.45 + (distOut / 2.8) * 0.52 + (vy - 4.0) * 0.08, 0.38, 1.05);
      colors[k * 3] = colors[k * 3 + 1] = colors[k * 3 + 2] = ao;
    }
    ni.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    cardParts.push(ni);
  }
  const canopyLod0 = mergeGeometries(cardParts);
  const canopyLod1 = createCrossedCanopyGeo(4, 4.6, 4.2, 5.2);
  const impostorLod2 = createTreeImpostorGeometry(6.2, 8.2);

  return { trunkLod0, trunkLod1, canopyLod0, canopyLod1, impostorLod2 };
}

function createPineLODGeos() {
  const trunk = new THREE.CylinderGeometry(0.10, 0.42, 7.6, 7, 3);
  trunk.translate(0, 3.8, 0);
  const trunkLod0 = trunk.index ? trunk.toNonIndexed() : trunk;
  const trunkLod1 = new THREE.CylinderGeometry(0.10, 0.38, 7.4, 5, 1);
  trunkLod1.translate(0, 3.7, 0);

  const cardParts = [];
  const tiers = [
    { y: 2.0, r: 2.35, count: 6, pitch: 0.44 },
    { y: 3.0, r: 2.05, count: 6, pitch: 0.42 },
    { y: 4.0, r: 1.72, count: 5, pitch: 0.38 },
    { y: 5.0, r: 1.38, count: 5, pitch: 0.35 },
    { y: 6.0, r: 1.02, count: 4, pitch: 0.30 },
    { y: 6.9, r: 0.72, count: 3, pitch: 0.26 }
  ];

  tiers.forEach((tier, ti) => {
    for (let j = 0; j < tier.count; j++) {
      const ang = (j / tier.count) * Math.PI * 2 + ti * 0.75;
      const card = createCurvedCard(tier.r * 1.45, tier.r * 1.35, 0.16);
      card.translate(0, tier.r * 0.42, 0);
      card.rotateX(-Math.PI * 0.5 + tier.pitch);
      card.rotateY(ang);
      card.translate(0, tier.y, 0);

      const ni = card.index ? card.toNonIndexed() : card;
      const p = ni.attributes.position;
      const colors = new Float32Array(p.count * 3);
      for (let k = 0; k < p.count; k++) {
        const rad = Math.hypot(p.getX(k), p.getZ(k));
        const ao = THREE.MathUtils.clamp(0.45 + (rad / (tier.r * 1.2)) * 0.48 + (ti / 5) * 0.14, 0.40, 1.05);
        colors[k * 3] = colors[k * 3 + 1] = colors[k * 3 + 2] = ao;
      }
      ni.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      cardParts.push(ni);
    }
  });

  for (let s = 0; s < 2; s++) {
    const topCard = createCurvedCard(1.0, 1.5, 0.08);
    topCard.rotateY(s * Math.PI * 0.5);
    topCard.translate(0, 7.6, 0);
    const ni = topCard.index ? topCard.toNonIndexed() : topCard;
    ni.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ni.attributes.position.count * 3).fill(1.0), 3));
    cardParts.push(ni);
  }

  const canopyLod0 = mergeGeometries(cardParts);
  const canopyLod1 = createCrossedCanopyGeo(3, 3.8, 5.8, 4.6);
  const impostorLod2 = createTreeImpostorGeometry(5.6, 8.8);

  return { trunkLod0, trunkLod1, canopyLod0, canopyLod1, impostorLod2 };
}

function createBirchLODGeos() {
  const trunkParts = [];
  const main = new THREE.CylinderGeometry(0.14, 0.28, 5.4, 7, 4);
  main.translate(0, 2.7, 0);
  const mp = main.attributes.position;
  for (let i = 0; i < mp.count; i++) {
    const y = mp.getY(i);
    mp.setX(i, mp.getX(i) + Math.sin(y * 0.5) * 0.22);
  }
  main.computeVertexNormals();
  trunkParts.push(main);

  const fork = new THREE.CylinderGeometry(0.07, 0.13, 2.6, 6, 2);
  fork.translate(0, 1.3, 0);
  fork.rotateZ(-0.42);
  fork.translate(0.15, 3.2, 0.05);
  trunkParts.push(fork);
  const trunkLod0 = mergeGeometries(trunkParts);
  const trunkLod1 = new THREE.CylinderGeometry(0.13, 0.25, 5.3, 5, 1);
  trunkLod1.translate(0, 2.65, 0);

  const cardParts = [];
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39996;
    const t = i / 18;
    const r = 0.8 + (i % 3) * 0.42;
    const card = createCurvedCard(1.95, 1.95, 0.18);
    card.rotateX((hash2(i, 31) - 0.5) * 1.4);
    card.rotateY(a);
    card.rotateZ((hash2(i, 37) - 0.5) * 1.2);
    card.translate(Math.cos(a) * r + 0.12, 4.3 + t * 2.5, Math.sin(a) * r);
    const ni = card.index ? card.toNonIndexed() : card;
    const p = ni.attributes.position;
    const colors = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const ao = THREE.MathUtils.clamp(0.58 + t * 0.42, 0.5, 1.02);
      colors[k * 3] = colors[k * 3 + 1] = colors[k * 3 + 2] = ao;
    }
    ni.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    cardParts.push(ni);
  }
  const canopyLod0 = mergeGeometries(cardParts);
  const canopyLod1 = createCrossedCanopyGeo(3, 3.6, 3.8, 5.4);
  const impostorLod2 = createTreeImpostorGeometry(5.2, 7.6);

  return { trunkLod0, trunkLod1, canopyLod0, canopyLod1, impostorLod2 };
}

function createPalmLODGeos() {
  const trunkLod0 = new THREE.CylinderGeometry(0.15, 0.27, 7.8, 7, 6);
  trunkLod0.translate(0, 3.9, 0);
  const p0 = trunkLod0.attributes.position;
  for (let i = 0; i < p0.count; i++) {
    const y = p0.getY(i);
    const bend = Math.pow(Math.max(0.0, y / 7.8), 1.7) * 0.72;
    p0.setX(i, p0.getX(i) + bend);
  }
  trunkLod0.computeVertexNormals();

  const trunkLod1 = new THREE.CylinderGeometry(0.14, 0.25, 7.8, 5, 1);
  trunkLod1.translate(0, 3.9, 0);

  const fronds = [];
  for (let f = 0; f < 8; f++) {
    const a = (f / 8) * Math.PI * 2;
    const card = createCurvedCard(1.65, 3.4, -0.45);
    card.translate(0, 1.55, 0);
    card.rotateX(-1.12 - (f % 2) * 0.16);
    card.rotateY(a);
    card.translate(0.72, 7.65, 0);
    const ni = card.index ? card.toNonIndexed() : card;
    const cols = new Float32Array(ni.attributes.position.count * 3).fill(1.0);
    ni.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    fronds.push(ni);
  }
  const canopyLod0 = mergeGeometries(fronds);
  const canopyLod1 = createCrossedCanopyGeo(3, 4.4, 2.2, 7.8);
  const impostorLod2 = createTreeImpostorGeometry(5.4, 9.2);

  return { trunkLod0, trunkLod1, canopyLod0, canopyLod1, impostorLod2 };
}

// =========================================================================
// 2. TEXTURE-SIMPLIFIED GRASS & GROUNDCOVER CLUSTER GEOMETRIES
// =========================================================================
function createTexturedGrassGeometry(crossed = true, w = 1.02, h = 0.76) {
  const q1 = new THREE.PlaneGeometry(w, h);
  q1.translate(0, h * 0.46, 0);
  if (!crossed) return q1;
  const q2 = q1.clone();
  q2.rotateY(Math.PI * 0.46);
  q2.rotateZ(0.08);
  return mergeGeometries([q1, q2]);
}

function createCrossedClusterGeo(cards, w, h, tilt = 0.35, bend = 0.14) {
  const parts = [];
  for (let i = 0; i < cards; i++) {
    const ang = (i / cards) * Math.PI * 2 + hash2(i, 71) * 0.65;
    const wVar = w * (0.78 + hash2(i, 73) * 0.42);
    const hVar = h * (0.75 + hash2(i, 79) * 0.48);
    const tVar = tilt * (0.65 + hash2(i, 83) * 0.75);
    const c = createCurvedCard(wVar, hVar, bend * (0.8 + hash2(i, 89) * 0.5));
    c.translate(0, hVar * 0.45, 0);
    c.rotateX(tVar);
    c.rotateZ((hash2(i, 97) - 0.5) * 0.25);
    c.rotateY(ang);
    parts.push(c);
  }
  return mergeGeometries(parts);
}

/**
 * Builds Texture-Simplified World-Streamed Grass + Multi-LOD World Forests & Flora.
 */
export function createFoliageSystem(texLib, assetManager, lodManager) {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const norm = new THREE.Vector3();

  // -------------------------------------------------------------------------
  // A. MULTI-LOD MATERIALS & PREFABS REGISTERED IN ASSET MANAGER
  // -------------------------------------------------------------------------
  const oakTrunkMat = new THREE.MeshStandardMaterial({
    map: texLib.barkOak.map,
    normalMap: texLib.barkOak.normalMap,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.92
  });
  enhancePBRMaterial(oakTrunkMat, { cacheKey: 'botw_oak_trunk' });

  const birchTrunkMat = new THREE.MeshStandardMaterial({
    map: texLib.barkBirch.map,
    normalMap: texLib.barkBirch.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.84
  });
  enhancePBRMaterial(birchTrunkMat, { cacheKey: 'botw_birch_trunk' });

  const oakLeafMat = new THREE.MeshStandardMaterial({
    map: texLib.leafOak,
    alphaTest: 0.30,
    side: THREE.DoubleSide,
    roughness: 0.72,
    vertexColors: true
  });
  enhancePBRMaterial(oakLeafMat, {
    cacheKey: 'botw_oak_leaf',
    isFoliage: true,
    windStrength: 0.13,
    subsurfaceColor: new THREE.Color(0x98c238),
    subsurfaceStrength: 0.45
  });

  const pineLeafMat = new THREE.MeshStandardMaterial({
    map: texLib.leafPine,
    alphaTest: 0.28,
    side: THREE.DoubleSide,
    roughness: 0.78,
    emissive: new THREE.Color(0x162915),
    emissiveIntensity: 0.24,
    vertexColors: true
  });
  enhancePBRMaterial(pineLeafMat, {
    cacheKey: 'botw_pine_leaf',
    isFoliage: true,
    windStrength: 0.08,
    subsurfaceColor: new THREE.Color(0x70b048),
    subsurfaceStrength: 0.50
  });

  const birchLeafMat = new THREE.MeshStandardMaterial({
    map: texLib.leafBirch,
    alphaTest: 0.30,
    side: THREE.DoubleSide,
    roughness: 0.68,
    vertexColors: true
  });
  enhancePBRMaterial(birchLeafMat, {
    cacheKey: 'botw_birch_leaf',
    isFoliage: true,
    windStrength: 0.16,
    subsurfaceColor: new THREE.Color(0xbcd646),
    subsurfaceStrength: 0.52
  });

  const palmLeafMat = new THREE.MeshStandardMaterial({
    map: texLib.leafPalm,
    alphaTest: 0.32,
    side: THREE.DoubleSide,
    roughness: 0.66,
    vertexColors: true
  });
  enhancePBRMaterial(palmLeafMat, {
    cacheKey: 'botw_palm_leaf',
    isFoliage: true,
    windStrength: 0.18,
    subsurfaceColor: new THREE.Color(0x8bc844),
    subsurfaceStrength: 0.48
  });

  function makeImpostorMat(tex, key) {
    const m = new THREE.MeshStandardMaterial({
      map: tex,
      alphaTest: 0.34,
      side: THREE.DoubleSide,
      roughness: 0.80
    });
    enhancePBRMaterial(m, { cacheKey: key, isFoliage: false, cloudShadows: true });
    return m;
  }

  const oakImpMat = makeImpostorMat(texLib.impostorOak, 'botw_imp_oak');
  const pineImpMat = makeImpostorMat(texLib.impostorPine, 'botw_imp_pine');
  const birchImpMat = makeImpostorMat(texLib.impostorBirch, 'botw_imp_birch');
  const palmImpMat = makeImpostorMat(texLib.impostorPalm, 'botw_imp_palm');

  const oakGeos = createOakLODGeos();
  const pineGeos = createPineLODGeos();
  const birchGeos = createBirchLODGeos();
  const palmGeos = createPalmLODGeos();

  [
    ['oak', oakGeos],
    ['pine', pineGeos],
    ['birch', birchGeos],
    ['palm', palmGeos]
  ].forEach(([sp, geos]) => {
    Object.entries(geos).forEach(([part, g]) => assetManager.registerGeometry(`${sp}_${part}`, g));
  });
  [
    ['oak_trunk', oakTrunkMat],
    ['birch_trunk', birchTrunkMat],
    ['oak_leaf', oakLeafMat],
    ['pine_leaf', pineLeafMat],
    ['birch_leaf', birchLeafMat],
    ['palm_leaf', palmLeafMat],
    ['oak_imp', oakImpMat],
    ['pine_imp', pineImpMat],
    ['birch_imp', birchImpMat],
    ['palm_imp', palmImpMat]
  ].forEach(([id, m]) => assetManager.registerMaterial(id, m));

  assetManager.registerPrefab('oak_trunk', {
    lods: [
      { geo: oakGeos.trunkLod0, mat: oakTrunkMat, dist: 120, castShadow: true, maxVisible: 420 },
      { geo: oakGeos.trunkLod1, mat: oakTrunkMat, dist: 270, castShadow: false, maxVisible: 760 }
    ]
  });
  assetManager.registerPrefab('oak_canopy', {
    lods: [
      { geo: oakGeos.canopyLod0, mat: oakLeafMat, dist: 120, castShadow: true, maxVisible: 420 },
      { geo: oakGeos.canopyLod1, mat: oakLeafMat, dist: 270, castShadow: false, maxVisible: 760 },
      { geo: oakGeos.impostorLod2, mat: oakImpMat, dist: 920, castShadow: false, maxVisible: 1800 }
    ]
  });

  assetManager.registerPrefab('pine_trunk', {
    lods: [
      { geo: pineGeos.trunkLod0, mat: oakTrunkMat, dist: 130, castShadow: true, maxVisible: 460 },
      { geo: pineGeos.trunkLod1, mat: oakTrunkMat, dist: 290, castShadow: false, maxVisible: 840 }
    ]
  });
  assetManager.registerPrefab('pine_canopy', {
    lods: [
      { geo: pineGeos.canopyLod0, mat: pineLeafMat, dist: 130, castShadow: true, maxVisible: 460 },
      { geo: pineGeos.canopyLod1, mat: pineLeafMat, dist: 290, castShadow: false, maxVisible: 840 },
      { geo: pineGeos.impostorLod2, mat: pineImpMat, dist: 980, castShadow: false, maxVisible: 2200 }
    ]
  });

  assetManager.registerPrefab('birch_trunk', {
    lods: [
      { geo: birchGeos.trunkLod0, mat: birchTrunkMat, dist: 110, castShadow: true, maxVisible: 260 },
      { geo: birchGeos.trunkLod1, mat: birchTrunkMat, dist: 250, castShadow: false, maxVisible: 480 }
    ]
  });
  assetManager.registerPrefab('birch_canopy', {
    lods: [
      { geo: birchGeos.canopyLod0, mat: birchLeafMat, dist: 110, castShadow: true, maxVisible: 260 },
      { geo: birchGeos.canopyLod1, mat: birchLeafMat, dist: 250, castShadow: false, maxVisible: 480 },
      { geo: birchGeos.impostorLod2, mat: birchImpMat, dist: 860, castShadow: false, maxVisible: 900 }
    ]
  });

  assetManager.registerPrefab('palm_trunk', {
    lods: [
      { geo: palmGeos.trunkLod0, mat: oakTrunkMat, dist: 130, castShadow: true, maxVisible: 180 },
      { geo: palmGeos.trunkLod1, mat: oakTrunkMat, dist: 280, castShadow: false, maxVisible: 260 }
    ]
  });
  assetManager.registerPrefab('palm_canopy', {
    lods: [
      { geo: palmGeos.canopyLod0, mat: palmLeafMat, dist: 130, castShadow: true, maxVisible: 180 },
      { geo: palmGeos.canopyLod1, mat: palmLeafMat, dist: 280, castShadow: false, maxVisible: 260 },
      { geo: palmGeos.impostorLod2, mat: palmImpMat, dist: 850, castShadow: false, maxVisible: 280 }
    ]
  });

  // -------------------------------------------------------------------------
  // B. PLACE ~2,950 FOREST TREES ACROSS THE 3.36 KM OPEN WORLD
  // -------------------------------------------------------------------------
  const oakPalette = [
    new THREE.Color(0x9cb36c), new THREE.Color(0x88a45c), new THREE.Color(0xb2be64),
    new THREE.Color(0x7c9858), new THREE.Color(0xc2ac56)
  ];
  const pinePalette = [new THREE.Color(0x96b888), new THREE.Color(0x84a878), new THREE.Color(0xa6c292)];
  const birchPalette = [new THREE.Color(0xb6c866), new THREE.Color(0xa6bc5c), new THREE.Color(0xc8c456)];
  const palmPalette = [new THREE.Color(0x8eb84e), new THREE.Color(0x7aa442)];

  const oakTrunkInsts = [];
  const oakCanopyInsts = [];
  const pineTrunkInsts = [];
  const pineCanopyInsts = [];
  const birchTrunkInsts = [];
  const birchCanopyInsts = [];
  const palmTrunkInsts = [];
  const palmCanopyInsts = [];

  function pushTree(trunkArr, canopyArr, x, y, z, rx, ry, rz, sx, sy, sz, col) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    const mat4 = dummy.matrix.clone();
    trunkArr.push({ x, y, z, matrix: mat4 });
    canopyArr.push({ x, y, z, matrix: mat4, color: col });
  }

  // Hero Overlook & Scenic Lake Island Signature Trees
  {
    const bx = -14.8, bz = -4.2;
    pushTree(birchTrunkInsts, birchCanopyInsts, bx, getTerrainHeight(bx, bz) - 0.35, bz, 0.04, 0.8, 0.03, 1.15, 1.15, 1.15, birchPalette[0]);
    const px = 15.6, pz = -3.8;
    pushTree(pineTrunkInsts, pineCanopyInsts, px, getTerrainHeight(px, pz) - 0.35, pz, -0.03, 2.1, -0.04, 1.22, 1.25, 1.22, pinePalette[0]);

    for (const [ix, iz, sc] of [[335, -678, 1.35], [346, -685, 1.15], [970, -1470, 1.45], [992, -1488, 1.25], [1515, -955, 1.30]]) {
      const iy = getTerrainHeight(ix, iz);
      if (iy > WATER_LEVEL + 0.8) {
        pushTree(pineTrunkInsts, pineCanopyInsts, ix, iy - 0.35, iz, 0.02, ix * 0.7, -0.02, sc, sc * 1.1, sc, pinePalette[1]);
      }
    }
  }

  // Procedural multi-biome woodlands across [-2800, +2800] (protecting city parcels/streets & Overlook cliff!)
  for (let i = 0; i < 16500 && (oakTrunkInsts.length + pineTrunkInsts.length + birchTrunkInsts.length) < 3300; i++) {
    const nearValley = i < 2400;
    const tx = nearValley ? (hash2(i, 211) - 0.5) * 950.0 : (hash2(i, 211) - 0.45) * 5200.0;
    const tz = nearValley ? -42.0 - hash2(i, 223) * 750.0 : -80.0 - hash2(i, 223) * 4200.0;

    if (isInCityBounds(tx, tz, 9.0)) continue;
    if (isOnRoadOrHighway(tx, tz, 6.8)) continue;
    if (tx > 1950 && tz > -2800) continue; // Eastern red-rock canyon stays arid
    if (tz > -45 && tx > -45 && tx < 45) continue;
    if (tx > -28 && tx < 160 && tz > -220 && tz < -40) continue; // Overlook-to-Lake sight corridor
    if (Math.abs(tx - getPathCenterX(tz)) < 5.0 && tz < -25 && tz > -480) continue;

    const grove = fbm2(tx * 0.0042, tz * 0.0042, 3);
    if (grove < -0.18 && hash2(i, 219) < 0.78) continue;

    const ty = getTerrainHeight(tx, tz);
    if (ty < WATER_LEVEL + 1.8 || ty > 145.0) continue;
    getTerrainNormal(tx, tz, norm);
    if (norm.y < 0.78) continue;

    const roll = hash2(i, 239);
    const scale = 1.25 + hash2(i, 227) * 1.05;
    const scaleY = scale * (0.9 + hash2(i, 229) * 0.3);
    const rx = (hash2(i, 231) - 0.5) * 0.06;
    const ry = hash2(i, 233) * Math.PI * 2;
    const rz = (hash2(i, 237) - 0.5) * 0.06;

    const preferPine = ty > 32.0 || Math.hypot(tx, tz + 1400) > 1500;
    if (preferPine && roll < 0.76) {
      const col = pinePalette[Math.floor(hash2(i, 241) * pinePalette.length)].clone();
      col.offsetHSL((hash2(i, 243) - 0.5) * 0.02, 0, (hash2(i, 247) - 0.5) * 0.08);
      pushTree(pineTrunkInsts, pineCanopyInsts, tx, ty - 0.35, tz, rx, ry, rz, scale, scaleY, scale, col);
    } else if (roll > 0.78) {
      const col = birchPalette[Math.floor(hash2(i, 251) * birchPalette.length)].clone();
      col.offsetHSL((hash2(i, 257) - 0.5) * 0.03, 0, (hash2(i, 263) - 0.5) * 0.06);
      pushTree(birchTrunkInsts, birchCanopyInsts, tx, ty - 0.35, tz, rx, ry, rz, scale, scaleY, scale, col);
    } else {
      const col = oakPalette[Math.floor(hash2(i, 269) * oakPalette.length)].clone();
      col.offsetHSL((hash2(i, 271) - 0.5) * 0.03, 0, (hash2(i, 277) - 0.5) * 0.08);
      pushTree(oakTrunkInsts, oakCanopyInsts, tx, ty - 0.35, tz, rx, ry, rz, scale, scaleY, scale, col);
    }
  }

  // Southern & western city perimeter woodland belt softening the aerial urban fringe
  for (let i = 0; i < 650; i++) {
    const isSouth = i % 2 === 0;
    const tx = isSouth ? -1680.0 + hash2(i, 311) * 1560.0 : -1740.0 + hash2(i, 313) * 150.0;
    const tz = isSouth ? -235.0 + hash2(i, 317) * 155.0 : -1720.0 + hash2(i, 331) * 1520.0;
    if (isInCityBounds(tx, tz, 6.0) || isOnRoadOrHighway(tx, tz, 7.5)) continue;
    const ty = getTerrainHeight(tx, tz);
    if (ty < WATER_LEVEL + 1.5 || ty > 85.0) continue;
    getTerrainNormal(tx, tz, norm);
    if (norm.y < 0.80) continue;
    const s = 1.15 + hash2(i, 337) * 0.75;
    const sy = s * (0.95 + hash2(i, 347) * 0.25);
    const ry = hash2(i, 349) * Math.PI * 2;
    if (hash2(i, 353) < 0.35) {
      const col = birchPalette[Math.floor(hash2(i, 359) * birchPalette.length)].clone();
      pushTree(birchTrunkInsts, birchCanopyInsts, tx, ty - 0.35, tz, 0, ry, 0, s, sy, s, col);
    } else {
      const col = oakPalette[Math.floor(hash2(i, 367) * oakPalette.length)].clone();
      pushTree(oakTrunkInsts, oakCanopyInsts, tx, ty - 0.35, tz, 0, ry, 0, s, sy, s, col);
    }
    if (oakTrunkInsts.length + birchTrunkInsts.length > 2600) break;
  }

  // Waterfront Promenade Date Palms following curved Lakefront Quay (skipping Marina Pier at z = -560!)
  for (let pz = -1700; pz <= -200; pz += 38) {
    if (Math.abs(pz + 560.0) < 16.0) continue;
    const qx = getQuayX(pz);
    pushTree(palmTrunkInsts, palmCanopyInsts, qx - 8.0, CITY_BOUNDS.y + 0.28, pz, 0.02, pz * 0.6, 0.03, 1.10, 1.04 + (pz % 3) * 0.07, 1.10, palmPalette[0]);
  }
  // Grand Civic Axis landscaped promenade palms along sidewalk curb (West of Waterfront Plaza)
  for (let px = -1400; px <= -180; px += 46) {
    if (px > getQuayX(-560.0) - 24.0) continue;
    if (Math.abs(px + 460) < 18 || Math.abs(px + 920) < 18) continue;
    const pz = -560.0 - (px + 225.0) * (0.08 / 0.9968) - 11.4;
    pushTree(palmTrunkInsts, palmCanopyInsts, px, getCityTerraceY(px, pz) + 0.16, pz, 0.02, px * 0.7, 0.01, 1.0, 1.05, 1.0, palmPalette[1]);
  }

  const treeBatches = [
    createLODInstancedBatch(assetManager, 'oak_trunk', oakTrunkInsts, { cellSize: 220, maxDist: 450 }),
    createLODInstancedBatch(assetManager, 'oak_canopy', oakCanopyInsts, { cellSize: 220, maxDist: 1650 }),
    createLODInstancedBatch(assetManager, 'pine_trunk', pineTrunkInsts, { cellSize: 220, maxDist: 480 }),
    createLODInstancedBatch(assetManager, 'pine_canopy', pineCanopyInsts, { cellSize: 220, maxDist: 1850 }),
    createLODInstancedBatch(assetManager, 'birch_trunk', birchTrunkInsts, { cellSize: 220, maxDist: 420 }),
    createLODInstancedBatch(assetManager, 'birch_canopy', birchCanopyInsts, { cellSize: 220, maxDist: 1550 }),
    createLODInstancedBatch(assetManager, 'palm_trunk', palmTrunkInsts, { cellSize: 220, maxDist: 420 }),
    createLODInstancedBatch(assetManager, 'palm_canopy', palmCanopyInsts, { cellSize: 220, maxDist: 1550 })
  ];
  treeBatches.forEach((b) => {
    group.add(b.group);
    if (lodManager) lodManager.addBatch(b);
  });

  // -------------------------------------------------------------------------
  // C. TEXTURE-SIMPLIFIED WORLD-STREAMED GRASS (4-TRI LOD0 / 2-TRI LOD1 QUADS)
  // -------------------------------------------------------------------------
  const GRASS_LOD0_MAX = 12000;
  const GRASS_LOD1_MAX = 5000;
  const grassLod0Geo = assetManager.registerGeometry('grass_lod0', createTexturedGrassGeometry(true, 1.18, 0.66));
  const grassLod1Geo = assetManager.registerGeometry('grass_lod1', createTexturedGrassGeometry(false, 1.24, 0.70));

  const grassCardMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    fog: false,
    uniforms: Object.assign({}, ATMO_UNIFORMS, { uGrassCard: { value: texLib.grassCard } }),
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uPlayerPos;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNorm;
      varying vec3 vTint;
      varying float vGust;

      void main() {
        vUv = uv;
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #else
          vTint = vec3(1.0);
        #endif

        vec4 instOrigin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float tip = uv.y;

        // Smooth distance-based vertical fade beyond 95m so streamed grass melts into terrain
        float camDist = length(instOrigin.xz - cameraPosition.xz);
        float fadeH = 1.0 - smoothstep(92.0, 124.0, camDist);

        float w1 = sin(instOrigin.x * 0.16 + instOrigin.z * 0.13 - uTime * 2.25);
        float w2 = cos(instOrigin.x * 0.34 - instOrigin.z * 0.27 + uTime * 1.55) * 0.45;
        float wind = (w1 + w2) * 0.20 * tip * tip;

        vec3 localPos = position;
        localPos.y *= fadeH;
        vec4 wp = modelMatrix * instanceMatrix * vec4(localPos, 1.0);
        wp.x += wind;
        wp.z += wind * 0.55;

        // Player & vehicle wheel grass parting
        vec2 toG = wp.xz - uPlayerPos.xz;
        float dP = length(toG);
        float vDist = abs(instOrigin.y - uPlayerPos.y);
        float push = smoothstep(1.85, 0.25, dP) * smoothstep(2.2, 0.4, vDist) * tip;
        if (dP > 0.001) {
          wp.xz += normalize(toG) * push * 0.55;
          wp.y -= push * 0.20;
        }

        vWorldPos = wp.xyz;
        vWorldNorm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vGust = 0.88 + 0.12 * w1;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uGrassCard;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vWorldNorm;
      varying vec3 vTint;
      varying float vGust;
      ${ATMO_GLSL_PARS}

      void main() {
        vec4 card = texture2D(uGrassCard, vUv);
        float camDist = length(vWorldPos - cameraPosition);
        // Subtle distance alpha inflation preserves mid-range density without harsh cutoff
        float alphaBoost = mix(1.0, 1.32, smoothstep(24.0, 95.0, camDist));
        if (card.a * alphaBoost < 0.34) discard;

        vec3 vDir = normalize(cameraPosition - vWorldPos);
        vec3 n = normalize(vWorldNorm);
        if (!gl_FrontFacing) n = -n;
        // Blend slightly toward sky-up normal for natural lush turf lighting on crossed cards
        n = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.65));

        // uGrassCard is SRGBColorSpace -> WebGL2 hardware linearizes on sample; no double gamma!
        vec3 albedo = card.rgb * vTint;
        albedo *= mix(0.66, 1.16, smoothstep(0.0, 0.55, vUv.y)); // soft root AO

        float cloudShad = sampleCloudShadow(vWorldPos.xz, uTime, uSunDir);
        float ndl = clamp(dot(n, uSunDir) * 0.65 + 0.42, 0.26, 1.0);
        vec3 ambient = mix(uHazeCool * 0.22, vec3(0.06, 0.09, 0.04), 0.55) * mix(0.45, 1.0, vUv.y);
        vec3 direct = uSunColor * ndl * cloudShad * (1.0 - uNightFactor * 0.82);

        float backlit = pow(max(dot(-vDir, uSunDir), 0.0), 3.0);
        vec3 sss = uSunColor * backlit * vUv.y * 0.32 * cloudShad * (1.0 - uNightFactor * 0.85);

        vec3 col = albedo * (ambient + direct * 0.94) + sss;
        col *= vGust;
        col = applyRealisticAtmosphere(col, vWorldPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });

  const grassLod0Inst = new THREE.InstancedMesh(grassLod0Geo, grassCardMat, GRASS_LOD0_MAX);
  const grassLod1Inst = new THREE.InstancedMesh(grassLod1Geo, grassCardMat, GRASS_LOD1_MAX);
  grassLod0Inst.frustumCulled = false;
  grassLod1Inst.frustumCulled = false;
  const initCol = new THREE.Color(1, 1, 1);
  for (let i = 0; i < GRASS_LOD0_MAX; i++) grassLod0Inst.setColorAt(i, initCol);
  for (let i = 0; i < GRASS_LOD1_MAX; i++) grassLod1Inst.setColorAt(i, initCol);
  group.add(grassLod0Inst, grassLod1Inst);

  // World-Cell Streaming Cache (28m x 28m deterministic procedural grass cells)
  const GRASS_CELL = 28.0;
  const GRASS_RADIUS = 124.0;
  const grassCellCache = new Map();
  let cellTick = 0;

  function buildGrassCell(cx, cz) {
    const items = [];
    const originX = cx * GRASS_CELL;
    const originZ = cz * GRASS_CELL;
    const distFromOrigin = Math.hypot(originX + 14, originZ + 14);
    const tuftBudget = distFromOrigin < 64 ? 240 : 68;

    for (let i = 0; i < tuftBudget; i++) {
      const seedA = cx * 73856093 ^ cz * 19349663 ^ (i * 83492791);
      const gx = originX + hash2(seedA, 17) * GRASS_CELL;
      const gz = originZ + hash2(seedA, 31) * GRASS_CELL;

      if (Math.hypot(gx - 1.2, gz - 7.2) < 2.0) continue;
      if (Math.hypot(gx, gz) < 1.15) continue;
      if (isInCityBounds(gx, gz, 4.0)) continue;
      if (isOnRoadOrHighway(gx, gz, 4.0)) continue;
      if (gx > 1850 && gz > -2400) continue;
      if (gz < -28 && gz > -480 && Math.abs(gx - getPathCenterX(gz)) < 3.0 + hash2(seedA, 41) * 1.4) continue;
      if (Math.hypot(gx + 10.5, gz + 0.5) < 3.2 && hash2(seedA, 43) < 0.72) continue;

      const gy = getTerrainHeight(gx, gz);
      if (gy < WATER_LEVEL + 1.1 || gy > 125.0) continue;
      getTerrainNormal(gx, gz, norm);
      if (norm.y < 0.80) continue;

      const fg = Math.hypot(gx, gz) < 32.0;
      const hScale = fg ? (0.48 + hash2(seedA, 59) * 0.34) : (0.78 + hash2(seedA, 59) * 0.52);
      const wScale = 0.85 + hash2(seedA, 61) * 0.55;

      dummy.position.set(gx, gy - 0.04, gz);
      dummy.rotation.set(
        (hash2(seedA, 67) - 0.5) * 0.18,
        hash2(seedA, 71) * Math.PI * 2,
        (hash2(seedA, 73) - 0.5) * 0.18
      );
      dummy.scale.set(wScale, hScale, wScale);
      dummy.updateMatrix();

      const patch = fbm2(gx * 0.045, gz * 0.045, 2);
      const color = new THREE.Color(
        0.90 + patch * 0.24 + (hash2(seedA, 79) - 0.5) * 0.12,
        0.96 + patch * 0.14 + (hash2(seedA, 83) - 0.5) * 0.10,
        0.84 + (hash2(seedA, 89) - 0.5) * 0.10
      );
      items.push({ x: gx, y: gy, z: gz, matrix: dummy.matrix.clone(), color });
    }
    return items;
  }

  function acquireGrassCell(cx, cz) {
    const key = `${cx},${cz}`;
    cellTick++;
    let entry = grassCellCache.get(key);
    if (!entry) {
      if (grassCellCache.size >= 165) {
        let oldK = null;
        let oldT = Infinity;
        grassCellCache.forEach((v, k) => {
          if (v.last < oldT) {
            oldT = v.last;
            oldK = k;
          }
        });
        if (oldK) grassCellCache.delete(oldK);
      }
      entry = { items: buildGrassCell(cx, cz), last: cellTick };
      grassCellCache.set(key, entry);
    } else {
      entry.last = cellTick;
    }
    return entry.items;
  }

  const lastGrassCam = new THREE.Vector3(1e9, 1e9, 1e9);
  const lastGrassDir = new THREE.Vector3();
  const grassTmpDir = new THREE.Vector3();
  const grassFrustum = new THREE.Frustum();
  const grassProj = new THREE.Matrix4();
  const cellSphere = new THREE.Sphere(new THREE.Vector3(), GRASS_CELL * 0.85);
  let activeGrassCounts = { lod0: 0, lod1: 0, cellsVisible: 0 };

  function updateGrass(camera, force = false) {
    camera.getWorldDirection(grassTmpDir);
    const moved = camera.position.distanceToSquared(lastGrassCam) > 36.0; // > 6m
    const rotated = grassTmpDir.dot(lastGrassDir) < 0.985;
    if (!force && !moved && !rotated) return;

    lastGrassCam.copy(camera.position);
    lastGrassDir.copy(grassTmpDir);

    camera.updateMatrixWorld();
    grassProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    grassFrustum.setFromProjectionMatrix(grassProj);

    const camX = camera.position.x;
    const camZ = camera.position.z;
    const minCx = Math.floor((camX - GRASS_RADIUS) / GRASS_CELL);
    const maxCx = Math.floor((camX + GRASS_RADIUS) / GRASS_CELL);
    const minCz = Math.floor((camZ - GRASS_RADIUS) / GRASS_CELL);
    const maxCz = Math.floor((camZ + GRASS_RADIUS) / GRASS_CELL);

    let c0 = 0;
    let c1 = 0;
    let cellsVis = 0;

    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const midX = (cx + 0.5) * GRASS_CELL;
        const midZ = (cz + 0.5) * GRASS_CELL;
        const dCell = Math.hypot(midX - camX, midZ - camZ);
        if (dCell > GRASS_RADIUS + 20.0) continue;

        const approxY = getTerrainHeight(midX, midZ);
        cellSphere.center.set(midX, approxY + 1.0, midZ);
        if (!grassFrustum.intersectsSphere(cellSphere)) continue;

        cellsVis++;
        const items = acquireGrassCell(cx, cz);
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const dSq = (it.x - camX) * (it.x - camX) + (it.z - camZ) * (it.z - camZ);
          if (dSq < 54.0 * 54.0) {
            if (c0 < GRASS_LOD0_MAX) {
              grassLod0Inst.setMatrixAt(c0, it.matrix);
              grassLod0Inst.setColorAt(c0, it.color);
              c0++;
            }
          } else if (dSq < GRASS_RADIUS * GRASS_RADIUS) {
            if (c1 < GRASS_LOD1_MAX) {
              grassLod1Inst.setMatrixAt(c1, it.matrix);
              grassLod1Inst.setColorAt(c1, it.color);
              c1++;
            }
          }
        }
      }
    }

    grassLod0Inst.count = c0;
    grassLod1Inst.count = c1;
    grassLod0Inst.instanceMatrix.needsUpdate = true;
    grassLod1Inst.instanceMatrix.needsUpdate = true;
    if (grassLod0Inst.instanceColor) grassLod0Inst.instanceColor.needsUpdate = true;
    if (grassLod1Inst.instanceColor) grassLod1Inst.instanceColor.needsUpdate = true;
    activeGrassCounts = { lod0: c0, lod1: c1, cellsVisible: cellsVis };
  }

  // -------------------------------------------------------------------------
  // D. MULTI-LOD GROUNDCOVER FLORA (FERNS, SHRUBS, WILDFLOWERS)
  // -------------------------------------------------------------------------
  const fernGeo0 = createCrossedClusterGeo(6, 1.05, 0.95, 0.72, 0.24);
  const fernGeo1 = createCrossedClusterGeo(3, 1.05, 0.95, 0.65, 0.14);
  const fernMat = new THREE.MeshStandardMaterial({
    map: texLib.fernCard,
    alphaTest: 0.38,
    side: THREE.DoubleSide,
    roughness: 0.74
  });
  enhancePBRMaterial(fernMat, { cacheKey: 'botw_fern', isFoliage: true, windStrength: 0.08, subsurfaceStrength: 0.42 });

  const shrubGeo0 = createCrossedClusterGeo(5, 1.55, 1.05, 0.42, 0.20);
  const shrubGeo1 = createCrossedClusterGeo(2, 1.65, 1.05, 0.30, 0.10);
  const shrubMat = new THREE.MeshStandardMaterial({
    map: texLib.shrubCard,
    alphaTest: 0.40,
    side: THREE.DoubleSide,
    roughness: 0.78
  });
  enhancePBRMaterial(shrubMat, { cacheKey: 'botw_shrub', isFoliage: true, windStrength: 0.09, subsurfaceStrength: 0.38 });

  const flowerGeo0 = createCrossedClusterGeo(3, 0.65, 0.50, 0.16, 0.09);
  const flowerMat = new THREE.MeshStandardMaterial({
    map: texLib.flowerCard,
    alphaTest: 0.40,
    side: THREE.DoubleSide,
    roughness: 0.70
  });
  enhancePBRMaterial(flowerMat, { cacheKey: 'botw_flower', isFoliage: true, windStrength: 0.07, subsurfaceStrength: 0.45 });

  assetManager.registerPrefab('fern', {
    lods: [
      { geo: fernGeo0, mat: fernMat, dist: 60, castShadow: true, maxVisible: 420 },
      { geo: fernGeo1, mat: fernMat, dist: 120, castShadow: false, maxVisible: 520 }
    ]
  });
  assetManager.registerPrefab('shrub', {
    lods: [
      { geo: shrubGeo0, mat: shrubMat, dist: 75, castShadow: true, maxVisible: 380 },
      { geo: shrubGeo1, mat: shrubMat, dist: 170, castShadow: false, maxVisible: 620 }
    ]
  });
  assetManager.registerPrefab('flower', {
    lods: [
      { geo: flowerGeo0, mat: flowerMat, dist: 65, castShadow: false, maxVisible: 700 }
    ]
  });

  const fernInsts = [];
  const shrubInsts = [];
  const flowerInsts = [];

  for (let i = 0; i < 2400 && fernInsts.length < 780; i++) {
    const fg = i < 260;
    const fx = fg ? (hash2(i, 301) - 0.5) * 44 : (hash2(i, 307) - 0.5) * 900;
    const fz = fg ? (hash2(i, 311) - 0.5) * 34 : -26 - hash2(i, 313) * 650;
    if (isInCityBounds(fx, fz, 5.0) || isOnRoadOrHighway(fx, fz, 4.5)) continue;
    if (Math.hypot(fx - 0.4, fz - 7.6) < 4.5 || Math.hypot(fx, fz) < 2.6) continue;
    if (fg && Math.abs(fx) < 3.4 && fz < 2.0 && fz > -5.5) continue;
    const fy = getTerrainHeight(fx, fz);
    if (fy < WATER_LEVEL + 1.2 || fy > 76) continue;
    getTerrainNormal(fx, fz, norm);
    if (norm.y < 0.78) continue;

    const s = (fg ? 0.40 : 0.78) + hash2(i, 317) * (fg ? 0.28 : 0.52);
    dummy.position.set(fx, fy - 0.05, fz);
    dummy.rotation.set((hash2(i, 329) - 0.5) * 0.14, hash2(i, 331) * Math.PI * 2, (hash2(i, 337) - 0.5) * 0.14);
    dummy.scale.set(s, s * (0.85 + hash2(i, 347) * 0.3), s);
    dummy.updateMatrix();
    fernInsts.push({ x: fx, y: fy, z: fz, matrix: dummy.matrix.clone() });
  }

  for (let i = 0; i < 2600 && shrubInsts.length < 760; i++) {
    const fg = i < 100;
    const sx = fg ? (hash2(i, 401) - 0.5) * 48 : (hash2(i, 409) - 0.5) * 1100;
    const sz = fg ? (hash2(i, 419) - 0.5) * 32 : -34 - hash2(i, 421) * 780;
    if (isInCityBounds(sx, sz, 6.0) || isOnRoadOrHighway(sx, sz, 5.5)) continue;
    if (fg && (Math.hypot(sx, sz) < 8.5 || sz < 0.5)) continue;
    if (Math.abs(sx - getPathCenterX(sz)) < 5.5) continue;
    const sy = getTerrainHeight(sx, sz);
    if (sy < WATER_LEVEL + 1.4 || sy > 82) continue;
    getTerrainNormal(sx, sz, norm);
    if (norm.y < 0.80) continue;

    const s = (fg ? 0.55 : 0.80) + hash2(i, 431) * 0.85;
    dummy.position.set(sx, sy - 0.10, sz);
    dummy.rotation.set(0, hash2(i, 433) * Math.PI * 2, 0);
    dummy.scale.set(s, s * 0.85, s);
    dummy.updateMatrix();
    shrubInsts.push({ x: sx, y: sy, z: sz, matrix: dummy.matrix.clone() });
  }

  for (let i = 0; i < 2400 && flowerInsts.length < 950; i++) {
    const fg = i < 420;
    const wx = fg ? (hash2(i, 501) - 0.5) * 38 : (hash2(i, 509) - 0.5) * 780;
    const wz = fg ? (hash2(i, 521) - 0.5) * 28 : -28 - hash2(i, 523) * 580;
    if (isInCityBounds(wx, wz, 5.0) || isOnRoadOrHighway(wx, wz, 4.5)) continue;
    if (Math.hypot(wx - 0.4, wz - 7.6) < 4.0) continue;
    if (Math.abs(wx) < 1.8 && wz > -1 && wz < 8) continue;
    const wy = getTerrainHeight(wx, wz);
    if (wy < WATER_LEVEL + 1.3 || wy > 75) continue;
    getTerrainNormal(wx, wz, norm);
    if (norm.y < 0.83) continue;

    const s = 0.65 + hash2(i, 541) * 0.65;
    dummy.position.set(wx, wy - 0.03, wz);
    dummy.rotation.set(0, hash2(i, 547) * Math.PI * 2, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    flowerInsts.push({ x: wx, y: wy, z: wz, matrix: dummy.matrix.clone() });
  }

  [
    createLODInstancedBatch(assetManager, 'fern', fernInsts, { cellSize: 110, maxDist: 120 }),
    createLODInstancedBatch(assetManager, 'shrub', shrubInsts, { cellSize: 110, maxDist: 170 }),
    createLODInstancedBatch(assetManager, 'flower', flowerInsts, { cellSize: 110, maxDist: 65 })
  ].forEach((b) => {
    group.add(b.group);
    if (lodManager) lodManager.addBatch(b);
  });

  function getStats() {
    return {
      ...activeGrassCounts,
      totalTrees: oakTrunkInsts.length + pineTrunkInsts.length + birchTrunkInsts.length + palmTrunkInsts.length
    };
  }

  return { root: group, update: updateGrass, getStats };
}
