/**
 * High-Performance Infinite 4-LOD Terrain Chunk Streamer + Far Horizon Mountain Ring,
 * Branched Non-Repeating Triplanar Basalt & Woolly Moss PBR Shader,
 * Multi-Scale Basalt Boulders, Small Cobbles & Volcanic Stone Clusters,
 * and Multi-Colored Icelandic Lupin Drifts, Sparse Grass, Bushes & Cotton Grass.
 */
import * as THREE from 'three';
import {
  clamp,
  mix,
  smoothstep,
  hash2i,
  fbm2,
  ridged2
} from './noise.js';
import {
  CELL_SIZE,
  getCellFeatures,
  sampleWorld,
  getTerrainHeight,
  getTerrainNormal
} from './world.js';
import { ATMO_UNIFORMS, ATMO_GLSL_PARS, enhanceMaterialWithAtmo } from './atmosphere.js';

export const CHUNK_SIZE = 160;
const GRID_RADIUS = 6; // 13 x 13 live chunks = 2080m x 2080m high-detail terrain before far horizon ring!
const LOD_SEGS = [72, 48, 32, 20]; // Crisp silhouette geometry even 1km+ away (zero low-poly pyramids!)
const SKIRT_DROP = 18.0;
const MAX_BUILDS_PER_FRAME = 2;

function getLodForRing(ringDist) {
  if (ringDist <= 1) return 0; // 0..240m: 72x72 (2.2m grid)
  if (ringDist <= 2) return 1; // 240..400m: 48x48 (3.3m grid)
  if (ringDist <= 4) return 2; // 400..720m: 32x32 (5.0m grid)
  return 3;                    // 720..1040m: 20x20 (8.0m grid)
}

/**
 * Build local-space terrain chunk geometry with edge skirts.
 * Samples sampleWorld ONCE per vertex and derives smooth normals directly from the height grid (5x faster!).
 */
function buildChunkGeometry(cx, cz, segs) {
  const worldOriginX = cx * CHUNK_SIZE;
  const worldOriginZ = cz * CHUNK_SIZE;
  const gridN = segs + 1;
  const step = CHUNK_SIZE / segs;
  const mainVertCount = gridN * gridN;
  const skirtVertCount = gridN * 4;
  const totalVerts = mainVertCount + skirtVertCount;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const surfAttr = new Float32Array(totalVerts * 4);
  const hydroAttr = new Float32Array(totalVerts * 4);
  const caveAttr = new Float32Array(totalVerts * 3);

  const tmpSample = {
    height: 0, moss: 0, cliff: 0, path: 0, scree: 0,
    riverDepth: 0, riverMask: 0, flowX: 0, flowZ: 1, snow: 0, glacier: 0, wetness: 0, hummockAO: 0.5,
    caveSignedD: 99, caveWaterY: 16, caveOverburden: 0
  };

  for (let iz = 0; iz <= segs; iz++) {
    const lz = (iz / segs - 0.5) * CHUNK_SIZE;
    const wz = worldOriginZ + lz;
    for (let ix = 0; ix <= segs; ix++) {
      const lx = (ix / segs - 0.5) * CHUNK_SIZE;
      const wx = worldOriginX + lx;
      const vi = iz * gridN + ix;

      sampleWorld(wx, wz, tmpSample);

      positions[vi * 3] = lx;
      positions[vi * 3 + 1] = tmpSample.height;
      positions[vi * 3 + 2] = lz;

      surfAttr[vi * 4] = tmpSample.glacier || 0;
      surfAttr[vi * 4 + 1] = tmpSample.cliff;
      surfAttr[vi * 4 + 2] = tmpSample.path;
      surfAttr[vi * 4 + 3] = tmpSample.scree;

      hydroAttr[vi * 4] = tmpSample.wetness;
      hydroAttr[vi * 4 + 1] = tmpSample.riverMask;
      hydroAttr[vi * 4 + 2] = tmpSample.hummockAO;
      hydroAttr[vi * 4 + 3] = tmpSample.snow;

      caveAttr[vi * 3] = tmpSample.caveSignedD;
      caveAttr[vi * 3 + 1] = tmpSample.caveWaterY;
      caveAttr[vi * 3 + 2] = tmpSample.caveOverburden;
    }
  }

  // Compute smooth analytical grid normals from neighboring heights (matches border vertices across chunks!)
  for (let iz = 0; iz <= segs; iz++) {
    const wz = worldOriginZ + (iz / segs - 0.5) * CHUNK_SIZE;
    for (let ix = 0; ix <= segs; ix++) {
      const wx = worldOriginX + (ix / segs - 0.5) * CHUNK_SIZE;
      const vi = iz * gridN + ix;

      const hL = ix > 0 ? positions[(vi - 1) * 3 + 1] : getTerrainHeight(wx - step, wz);
      const hR = ix < segs ? positions[(vi + 1) * 3 + 1] : getTerrainHeight(wx + step, wz);
      const hD = iz > 0 ? positions[(vi - gridN) * 3 + 1] : getTerrainHeight(wx, wz - step);
      const hU = iz < segs ? positions[(vi + gridN) * 3 + 1] : getTerrainHeight(wx, wz + step);

      const nx = hL - hR;
      const ny = 2.0 * step;
      const nz = hD - hU;
      const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      normals[vi * 3] = nx * invLen;
      normals[vi * 3 + 1] = ny * invLen;
      normals[vi * 3 + 2] = nz * invLen;
    }
  }

  const indices = new Uint32Array(segs * segs * 6 + segs * 4 * 6);
  let ip = 0;
  for (let iz = 0; iz < segs; iz++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = iz * gridN + ix;
      const b = a + 1;
      const c = a + gridN;
      const d = c + 1;
      indices[ip++] = a; indices[ip++] = c; indices[ip++] = b;
      indices[ip++] = b; indices[ip++] = c; indices[ip++] = d;
    }
  }

  let sv = mainVertCount;
  const addSkirtStrip = (edgeIndices, reverseWinding) => {
    const startSv = sv;
    for (let i = 0; i < edgeIndices.length; i++) {
      const src = edgeIndices[i];
      positions[sv * 3] = positions[src * 3];
      positions[sv * 3 + 1] = positions[src * 3 + 1] - SKIRT_DROP;
      positions[sv * 3 + 2] = positions[src * 3 + 2];
      normals[sv * 3] = normals[src * 3];
      normals[sv * 3 + 1] = normals[src * 3 + 1];
      normals[sv * 3 + 2] = normals[src * 3 + 2];
      for (let k = 0; k < 4; k++) {
        surfAttr[sv * 4 + k] = surfAttr[src * 4 + k];
        hydroAttr[sv * 4 + k] = hydroAttr[src * 4 + k];
      }
      for (let k = 0; k < 3; k++) {
        caveAttr[sv * 3 + k] = caveAttr[src * 3 + k];
      }
      sv++;
    }
    for (let i = 0; i < edgeIndices.length - 1; i++) {
      const t0 = edgeIndices[i];
      const t1 = edgeIndices[i + 1];
      const b0 = startSv + i;
      const b1 = startSv + i + 1;
      if (reverseWinding) {
        indices[ip++] = t0; indices[ip++] = t1; indices[ip++] = b0;
        indices[ip++] = t1; indices[ip++] = b1; indices[ip++] = b0;
      } else {
        indices[ip++] = t0; indices[ip++] = b0; indices[ip++] = t1;
        indices[ip++] = t1; indices[ip++] = b0; indices[ip++] = b1;
      }
    }
  };

  const topEdge = [];
  const botEdge = [];
  const leftEdge = [];
  const rightEdge = [];
  for (let i = 0; i <= segs; i++) {
    topEdge.push(i);
    botEdge.push(segs * gridN + i);
    leftEdge.push(i * gridN);
    rightEdge.push(i * gridN + segs);
  }
  // Outward-facing skirt winding (closes 100% of LOD chunk-border sky cracks on steep cliffs!)
  addSkirtStrip(topEdge, true);
  addSkirtStrip(botEdge, false);
  addSkirtStrip(leftEdge, false);
  addSkirtStrip(rightEdge, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('aSurf', new THREE.BufferAttribute(surfAttr, 4));
  geo.setAttribute('aHydro', new THREE.BufferAttribute(hydroAttr, 4));
  geo.setAttribute('aCave', new THREE.BufferAttribute(caveAttr, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Weld duplicate unshared vertices (Three.js IcosahedronGeometry is non-indexed -> flat per-triangle normals!)
 * into a clean indexed BufferGeometry and compute genuine smooth area-weighted vertex normals.
 */
function weldAndSmoothGeo(rawGeo) {
  const posAttr = rawGeo.attributes.position;
  const uvAttr = rawGeo.attributes.uv;
  const vertMap = new Map();
  const outPos = [];
  const outUv = uvAttr ? [] : null;
  const outIdx = [];

  const getIndex = (vi) => {
    const x = posAttr.getX(vi);
    const y = posAttr.getY(vi);
    const z = posAttr.getZ(vi);
    const key = `${Math.round(x * 2000)},${Math.round(y * 2000)},${Math.round(z * 2000)}`;
    let idx = vertMap.get(key);
    if (idx === undefined) {
      idx = outPos.length / 3;
      vertMap.set(key, idx);
      outPos.push(x, y, z);
      if (outUv) outUv.push(uvAttr.getX(vi), uvAttr.getY(vi));
    }
    return idx;
  };

  if (rawGeo.index) {
    const srcIdx = rawGeo.index.array;
    for (let i = 0; i < srcIdx.length; i++) outIdx.push(getIndex(srcIdx[i]));
  } else {
    for (let i = 0; i < posAttr.count; i++) outIdx.push(getIndex(i));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  if (outUv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
  geo.setIndex(outIdx);
  geo.computeVertexNormals();
  rawGeo.dispose();
  return geo;
}

/** Build organically sculpted smooth-normal Icelandic basalt boulder with a gently flared earth-hugging base skirt. */
function createNaturalBasaltRockGeo(seed = 101, detail = 3, verticalBias = 0.78) {
  const raw = new THREE.IcosahedronGeometry(1.0, detail);
  const pos = raw.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const nx = v.x;
    const ny = v.y;
    const nz = v.z;

    const macro = fbm2(nx * 1.35 + seed * 0.23, nz * 1.35 - ny * 0.85, 3, seed + 17);
    const ridgeA = ridged2(nx * 2.05 - ny * 0.7 + seed * 0.13, nz * 2.05 + ny * 0.65, 3, seed + 41);
    const r = 0.66 + macro * 0.26 + Math.pow(ridgeA, 1.35) * 0.28;
    // Gently flare the lower skirt outward so the rock emerges organically out of the hillside instead of pinching!
    const baseFlare = 1.0 + smoothstep(0.18, -0.55, ny) * 0.34;
    const flatBottom = ny < -0.18 ? mix(1.0, 0.38, smoothstep(-0.18, -0.75, ny)) : 1.0;

    v.set(nx * r * baseFlare, ny * r * verticalBias * flatBottom, nz * r * baseFlare);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return weldAndSmoothGeo(raw);
}

/**
 * Build multi-tiered organic Icelandic basalt crag formation.
 * Welds vertices per lobe for 100% smooth interpolated vertex normals (ZERO low-poly triangle facets!).
 */
function createJaggedLavaCragGeo(seed = 37) {
  const lobes = [
    { ox: 0.0,  oy: 0.08,  oz: 0.0,  sx: 1.24, sy: 0.92, sz: 1.06, ry: 0.3, s: seed },
    { ox: 0.70, oy: -0.06, oz: 0.32, sx: 0.90, sy: 0.62, sz: 0.86, ry: 1.9, s: seed + 23 }
  ];

  const pos = [];
  const norm = [];
  const idx = [];
  let vBase = 0;
  const v = new THREE.Vector3();

  for (const lb of lobes) {
    const raw = new THREE.IcosahedronGeometry(1.0, 2);
    const p = raw.attributes.position;
    const cs = Math.cos(lb.ry);
    const sn = Math.sin(lb.ry);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const macro = fbm2(v.x * 1.35 + lb.s * 0.19, v.z * 1.35 - v.y * 0.85, 3, lb.s + 5);
      const ridge = ridged2(v.x * 1.95 + lb.s * 0.17, v.z * 1.95 - v.y * 1.05, 3, lb.s + 11);
      const strata = Math.sin(v.y * 5.2 + lb.s) * 0.055;
      const r = 0.66 + macro * 0.24 + Math.pow(ridge, 1.30) * 0.30 + strata;
      const peakTaper = v.y > 0.18 ? (1.0 - v.y * 0.18) : 1.0;
      const baseFlare = 1.0 + smoothstep(0.15, -0.55, v.y) * 0.32;
      const flatBot = v.y < -0.20 ? mix(1.0, 0.36, smoothstep(-0.20, -0.78, v.y)) : 1.0;
      const lx = v.x * r * lb.sx * peakTaper * baseFlare;
      const ly = v.y * r * lb.sy * flatBot + lb.oy;
      const lz = v.z * r * lb.sz * peakTaper * baseFlare;
      p.setXYZ(i, lb.ox + lx * cs - lz * sn, ly, lb.oz + lx * sn + lz * cs);
    }
    const g = weldAndSmoothGeo(raw);
    const gp = g.attributes.position;
    const gn = g.attributes.normal;
    for (let i = 0; i < gp.count; i++) {
      pos.push(gp.getX(i), gp.getY(i), gp.getZ(i));
      norm.push(gn.getX(i), gn.getY(i), gn.getZ(i));
    }
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx.push(gi[i] + vBase);
    vBase += gp.count;
    g.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * Build iconic towering basalt volcanic pinnacle / crag spire with 100% smooth welded normals.
 */
function createVolcanicSpireGeo(seed = 83) {
  const parts = [
    { ox: 0.0,  oy: 1.05, oz: 0.0,  sx: 0.94, sy: 1.85, sz: 0.86, leanX: 0.18,  ry: 0.5, s: seed },
    { ox: 0.60, oy: 0.34, oz: 0.26, sx: 0.72, sy: 0.92, sz: 0.68, leanX: -0.06, ry: 2.1, s: seed + 23 }
  ];

  const pos = [];
  const norm = [];
  const idx = [];
  let vBase = 0;
  const v = new THREE.Vector3();

  for (const pt of parts) {
    const raw = new THREE.IcosahedronGeometry(1.0, 2);
    const p = raw.attributes.position;
    const cs = Math.cos(pt.ry);
    const sn = Math.sin(pt.ry);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const ridge = ridged2(v.x * 2.1 + pt.s * 0.13, v.z * 2.1 - v.y * 1.0, 3, pt.s + 7);
      const r = 0.68 + ridge * 0.34;
      const hNorm = clamp((v.y + 1.0) * 0.5, 0.0, 1.0);
      const taper = mix(1.36, 0.26, Math.pow(hNorm, 1.15));
      const lx = v.x * r * pt.sx * taper + hNorm * pt.leanX;
      const ly = (v.y * 0.5 + 0.42) * r * pt.sy + pt.oy * 0.42;
      const lz = v.z * r * pt.sz * taper;
      p.setXYZ(i, pt.ox + lx * cs - lz * sn, ly, pt.oz + lx * sn + lz * cs);
    }
    const g = weldAndSmoothGeo(raw);
    const gp = g.attributes.position;
    const gn = g.attributes.normal;
    for (let i = 0; i < gp.count; i++) {
      pos.push(gp.getX(i), gp.getY(i), gp.getZ(i));
      norm.push(gn.getX(i), gn.getY(i), gn.getZ(i));
    }
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx.push(gi[i] + vBase);
    vBase += gp.count;
    g.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setIndex(idx);
  return geo;
}

/** Build smooth weathered volcanic basalt cobble geometry (welded detail=1 -> 80 smooth-shaded tris, zero flat facets!). */
function createFacetedCobbleGeo(seed = 67) {
  const raw = new THREE.IcosahedronGeometry(1.0, 1);
  const pos = raw.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm2(v.x * 1.45 + seed * 0.19, v.z * 1.45 - v.y * 1.0, 2, seed + 13);
    const r = 0.76 + n * 0.32;
    const baseFlare = 1.0 + smoothstep(0.15, -0.55, v.y) * 0.24;
    const flatBot = v.y < -0.20 ? mix(1.0, 0.42, smoothstep(-0.20, -0.75, v.y)) : 1.0;
    pos.setXYZ(i, v.x * r * baseFlare, v.y * r * 0.58 * flatBot, v.z * r * baseFlare);
  }
  return weldAndSmoothGeo(raw);
}

/**
 * Build a smooth 4-stone weathered volcanic pebble cluster (welded detail=1 -> smooth river-worn stones, light tri budget!).
 */
function createSmallStoneClusterGeo() {
  const stones = [
    { ox: 0.0,   oz: 0.0,   sx: 0.17, sy: 0.085, sz: 0.14, ry: 0.4, seed: 11 },
    { ox: 0.42,  oz: 0.26,  sx: 0.13, sy: 0.068, sz: 0.11, ry: 1.7, seed: 23 },
    { ox: -0.38, oz: 0.32,  sx: 0.15, sy: 0.075, sz: 0.12, ry: 2.8, seed: 37 },
    { ox: 0.26,  oz: -0.38, sx: 0.11, sy: 0.058, sz: 0.10, ry: 4.1, seed: 53 }
  ];

  const pos = [];
  const norm = [];
  const idx = [];
  let vBase = 0;
  const v = new THREE.Vector3();

  for (const st of stones) {
    const raw = new THREE.IcosahedronGeometry(1.0, 1);
    const p = raw.attributes.position;
    const cs = Math.cos(st.ry);
    const sn = Math.sin(st.ry);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = fbm2(v.x * 1.4 + st.seed * 0.17, v.z * 1.4 - v.y * 1.1, 2, st.seed);
      const jitter = 0.78 + n * 0.38;
      const lx = v.x * st.sx * jitter;
      const ly = (v.y * 0.5 + 0.28) * st.sy * jitter;
      const lz = v.z * st.sz * jitter;
      p.setXYZ(i, st.ox + lx * cs - lz * sn, ly, st.oz + lx * sn + lz * cs);
    }
    const g = weldAndSmoothGeo(raw);
    const gp = g.attributes.position;
    const gn = g.attributes.normal;
    for (let i = 0; i < gp.count; i++) {
      pos.push(gp.getX(i), gp.getY(i), gp.getZ(i));
      norm.push(gn.getX(i), gn.getY(i), gn.getZ(i));
    }
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx.push(gi[i] + vBase);
    vBase += gp.count;
    g.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * Build silky-smooth organic Eldhraun mossy pillow-mound cluster (3 merged soft-skirted lobes, welded smooth normals).
 * Gently flares tangentially into the hillside at y=0 so moss cushions grow seamlessly out of the ground!
 */
function createMossCushionGeo() {
  const lobes = [
    { ox: 0.0,   oy: -0.02, oz: 0.0,  sx: 1.05, sy: 0.42, sz: 0.96, s: 17 },
    { ox: 0.68,  oy: -0.05, oz: 0.36, sx: 0.76, sy: 0.32, sz: 0.72, s: 41 },
    { ox: -0.62, oy: -0.06, oz: 0.30, sx: 0.72, sy: 0.28, sz: 0.68, s: 73 }
  ];
  const pos = [];
  const norm = [];
  const idx = [];
  let vBase = 0;
  const v = new THREE.Vector3();

  for (const lb of lobes) {
    const raw = new THREE.IcosahedronGeometry(1.0, 1);
    const p = raw.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const lump = 0.80 + fbm2(v.x * 1.85 + lb.s * 0.21, v.z * 1.85 - v.y * 0.9, 2, lb.s) * 0.34;
      const crag = ridged2(v.x * 2.1 - lb.s * 0.13, v.z * 2.1 + v.y * 0.8, 2, lb.s + 19);
      const r = lump + (crag - 0.45) * 0.18;
      // Wide gently-sloping skirt around lower hemisphere so it merges seamlessly into hillside terrain!
      const skirtFlare = 1.0 + smoothstep(0.28, -0.35, v.y) * 0.42;
      const hY = v.y >= 0 ? Math.pow(v.y, 0.82) * r * lb.sy : v.y * 0.24 * lb.sy;
      p.setXYZ(
        i,
        lb.ox + v.x * r * lb.sx * skirtFlare,
        lb.oy + Math.max(-0.18, hY),
        lb.oz + v.z * r * lb.sz * skirtFlare
      );
    }
    const g = weldAndSmoothGeo(raw);
    const gp = g.attributes.position;
    const gn = g.attributes.normal;
    for (let i = 0; i < gp.count; i++) {
      pos.push(gp.getX(i), gp.getY(i), gp.getZ(i));
      norm.push(gn.getX(i), gn.getY(i), gn.getZ(i));
    }
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx.push(gi[i] + vBase);
    vBase += gp.count;
    g.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * Build lush natural Icelandic meadow sedge grass carpet patch (36 fine soft blades across 1.8m).
 * Deep emerald-olive to muted sage tips (never harsh spiky neon spears!).
 */
function createTussockGrassGeo() {
  const blades = 36;
  const pos = [];
  const norm = [];
  const colors = [];
  const idx = [];
  let vBase = 0;

  for (let i = 0; i < blades; i++) {
    const ang = (i / blades) * Math.PI * 2 + hash2i(i, 11, 801) * 0.72;
    const rad = Math.sqrt(hash2i(i, 13, 801)) * 0.92;
    const h = 0.13 + hash2i(i, 17, 801) * 0.19;
    const arch = 0.09 + hash2i(i, 19, 801) * 0.16;
    const w = 0.0085 + hash2i(i, 23, 801) * 0.006;
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const px = -dz * w;
    const pz = dx * w;
    const bx = dx * rad;
    const bz = dz * rad;

    const kind = hash2i(i, 29, 801);
    const baseCol = [0.055, 0.088, 0.030];
    // Natural damp Icelandic sedge & olive-sage meadow grass (harmonizes with woolly moss!)
    const midCol = kind > 0.76 ? [0.22, 0.25, 0.11] : kind > 0.30 ? [0.13, 0.21, 0.068] : [0.10, 0.18, 0.062];
    const tipCol = kind > 0.76 ? [0.36, 0.36, 0.18] : kind > 0.30 ? [0.22, 0.30, 0.105] : [0.17, 0.25, 0.098];

    const p1x = bx + dx * arch * 0.45;
    const p1z = bz + dz * arch * 0.45;
    const p2x = bx + dx * arch * 1.05;
    const p2z = bz + dz * arch * 1.05;

    pos.push(
      bx - px, 0.0, bz - pz,
      bx + px, 0.0, bz + pz,
      p1x - px * 0.52, h * 0.55, p1z - pz * 0.52,
      p2x, h, p2z
    );
    const nCols = [baseCol, baseCol, midCol, tipCol];
    for (let k = 0; k < 4; k++) {
      norm.push(dx * 0.20, 0.96, dz * 0.20);
      colors.push(nCols[k][0], nCols[k][1], nCols[k][2]);
    }
    idx.push(vBase, vBase + 1, vBase + 2, vBase + 1, vBase + 3, vBase + 2);
    vBase += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * Build lush full multi-spire Icelandic Nootka Lupin cluster with `aPetalMask` vertex attribute:
 * - aPetalMask = 0.0 on stems & dense silvery-green palmate basal foliage collar
 * - aPetalMask = 1.0 on plump conical floral spires (5 full spikes per clump, 8 dense floret tiers each!)
 */
function createLupinClusterGeo() {
  const pos = [];
  const norm = [];
  const colors = [];
  const petalMask = [];
  const idx = [];
  let vBase = 0;

  const pushTri = (ax, ay, az, bx, by, bz, cx, cy, cz, col, nx, ny, nz, isPetal) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let k = 0; k < 3; k++) {
      norm.push(nx, ny, nz);
      colors.push(col[0], col[1], col[2]);
      petalMask.push(isPetal);
    }
    idx.push(vBase, vBase + 1, vBase + 2);
    vBase += 3;
  };

  // 16 lush dusty blue-green palmate basal leaves forming a full leafy lupin mound (aPetalMask = 0)
  const leaves = 16;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + hash2i(i, 3, 851) * 0.42;
    const r0 = 0.04 + hash2i(i, 5, 851) * 0.20;
    const len = 0.24 + hash2i(i, 7, 851) * 0.16;
    const h0 = 0.07 + hash2i(i, 9, 851) * 0.14;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz * 0.078;
    const pz = dx * 0.078;
    const bx = dx * r0;
    const bz = dz * r0;
    const shade = 0.76 + hash2i(i, 11, 851) * 0.36;
    pushTri(
      bx - px, h0 * 0.55, bz - pz,
      bx + px, h0 * 0.55, bz + pz,
      bx + dx * len, h0 + 0.07, bz + dz * len,
      [0.12 * shade, 0.24 * shade, 0.14 * shade],
      dx * 0.25, 0.94, dz * 0.25,
      0.0
    );
  }

  // 4 lush plump Icelandic lupin floral spires per cluster (rich visual silhouette, ~40% lighter tri budget!)
  const stems = [
    { ox: 0.0,   oz: 0.0,   h: 0.98, leanX: 0.04,  leanZ: 0.02 },
    { ox: 0.19,  oz: -0.12, h: 0.84, leanX: 0.09,  leanZ: -0.05 },
    { ox: -0.18, oz: 0.11,  h: 0.76, leanX: -0.08, leanZ: 0.07 },
    { ox: 0.08,  oz: 0.18,  h: 0.68, leanX: 0.05,  leanZ: 0.08 }
  ];

  for (let s = 0; s < stems.length; s++) {
    const st = stems[s];
    const stemBaseH = st.h * 0.28;
    const bloomH = st.h * 0.72;

    const sw = 0.020;
    const mx = st.ox + st.leanX * 0.5;
    const mz = st.oz + st.leanZ * 0.5;
    pushTri(st.ox - sw, 0, st.oz, st.ox + sw, 0, st.oz, mx, st.h * 0.72, mz, [0.13, 0.22, 0.12], 0, 0.5, 0.85, 0.0);

    // 7 plump whorled tiers x 3 delicate overlapping florets (crisp solid conical flower spike at 60 FPS!)
    const tiers = 7;
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const y = stemBaseH + f * bloomH;
      const cx = st.ox + st.leanX * (0.35 + f * 0.65);
      const cz = st.oz + st.leanZ * (0.35 + f * 0.65);
      const radius = mix(0.116, 0.028, Math.pow(f, 0.82));
      const florets = 3;

      // Rich deep royal-violet lower florets -> pale lavender/silvery bud tip
      const lum = mix(0.68, 1.18, f);
      for (let k = 0; k < florets; k++) {
        const a = (k / florets) * Math.PI * 2 + t * 0.82 + s * 1.3;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const px = -dz * radius * 0.78;
        const pz = dx * radius * 0.78;
        const tipX = cx + dx * radius;
        const tipZ = cz + dz * radius;
        const tipY = y + mix(0.032, 0.072, f);
        const vShade = lum * (0.86 + hash2i(t * 7 + k, s, 863) * 0.28);
        pushTri(
          cx - px, y - 0.026, cz - pz,
          cx + px, y - 0.026, cz + pz,
          tipX, tipY, tipZ,
          [vShade, vShade, vShade],
          dx * 0.62, 0.76, dz * 0.62,
          1.0
        );
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('aPetalMask', new THREE.Float32BufferAttribute(petalMask, 1));
  geo.setIndex(idx);
  return geo;
}

/**
 * Build authentic Icelandic Silvery-Sage Woolly Willow (Salix lanata) & Deep Crowberry Shrub.
 * Matches the soft silvery-grey-green leafy shrubs nestled among purple lupins in the reference foreground!
 */
function createIcelandicBushGeo() {
  const pos = [];
  const norm = [];
  const colors = [];
  const idx = [];
  let vBase = 0;

  const pushTri = (ax, ay, az, bx, by, bz, cx, cy, cz, col, nx, ny, nz) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let k = 0; k < 3; k++) {
      norm.push(nx, ny, nz);
      colors.push(col[0], col[1], col[2]);
    }
    idx.push(vBase, vBase + 1, vBase + 2);
    vBase += 3;
  };

  const branches = 12;
  for (let b = 0; b < branches; b++) {
    const a = (b / branches) * Math.PI * 2 + hash2i(b, 1, 901) * 0.42;
    const reach = 0.28 + hash2i(b, 2, 901) * 0.30;
    const bh = 0.22 + hash2i(b, 3, 901) * 0.22;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz * 0.012;
    const pz = dx * 0.012;
    pushTri(-px, 0, -pz, px, 0, pz, dx * reach * 0.9, bh * 0.85, dz * reach * 0.9, [0.045, 0.042, 0.032], 0, 0.85, 0.5);

    for (let l = 0; l < 8; l++) {
      const f = 0.16 + (l / 8) * 0.90;
      const domeY = Math.sin(clamp(f * 0.92, 0.08, 0.96) * Math.PI) * bh * 1.18 + 0.03;
      const spread = 0.08 + hash2i(b * 13 + l, 4, 901) * 0.16;
      const la = a + (hash2i(b, l * 7, 901) - 0.5) * 3.0;
      const lx = dx * reach * f + Math.cos(la) * spread * 0.55;
      const lz = dz * reach * f + Math.sin(la) * spread * 0.55;
      const ly = Math.max(0.025, domeY + (hash2i(l, b, 907) - 0.45) * 0.10);

      const ldx = Math.cos(la);
      const ldz = Math.sin(la);
      const halfW = 0.028 + hash2i(l, b * 3, 911) * 0.020;
      const lpx = -ldz * halfW;
      const lpz = ldx * halfW;
      const lLen = 0.082 + hash2i(b, l, 911) * 0.052;
      const tipUp = 0.042 + hash2i(b + l, 7, 919) * 0.050;

      const tint = hash2i(b * 19 + l, 5, 919);
      const radialAO = mix(0.40, 1.16, clamp(Math.hypot(lx, lz) / 0.48 * 0.45 + ly / 0.38 * 0.72, 0, 1));
      let cr, cg, cb;
      if (tint < 0.45) {
        // Silvery-sage Icelandic woolly dwarf willow leaf (iconic pale sea-green bush beside lupins!)
        cr = 0.20 * radialAO; cg = 0.27 * radialAO; cb = 0.21 * radialAO;
      } else if (tint < 0.84) {
        // Deep rich mossy crowberry / Arctic bilberry green
        cr = 0.075 * radialAO; cg = 0.155 * radialAO; cb = 0.068 * radialAO;
      } else {
        // Subtle warm bronze-heather leaf accent
        cr = 0.24 * radialAO; cg = 0.13 * radialAO; cb = 0.055 * radialAO;
      }
      pushTri(
        lx - lpx, ly, lz - lpz,
        lx + lpx, ly, lz + lpz,
        lx + ldx * lLen, ly + tipUp, lz + ldz * lLen,
        [cr, cg, cb],
        ldx * 0.35, 0.90, ldz * 0.35
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  return geo;
}

/** Build crisp fluffy Arctic Cotton Grass (Eriophorum) tuft with bright snow-white plumes! */
function createCottonGrassGeo() {
  const pos = [];
  const norm = [];
  const colors = [];
  const idx = [];
  let vBase = 0;

  const pushTri = (ax, ay, az, bx, by, bz, cx, cy, cz, col, nx, ny, nz) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (let k = 0; k < 3; k++) {
      norm.push(nx, ny, nz);
      colors.push(col[0], col[1], col[2]);
    }
    idx.push(vBase, vBase + 1, vBase + 2);
    vBase += 3;
  };

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + hash2i(i, 1, 951) * 0.55;
    const r = 0.04 + hash2i(i, 2, 951) * 0.24;
    const h = 0.26 + hash2i(i, 3, 951) * 0.22;
    const lean = 0.06 + hash2i(i, 4, 951) * 0.10;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz * 0.010;
    const pz = dx * 0.010;
    const bx = dx * r;
    const bz = dz * r;
    const tx = bx + dx * lean;
    const tz = bz + dz * lean;

    pushTri(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz, [0.11, 0.18, 0.065], dx * 0.2, 0.96, dz * 0.2);

    if (i < 6) {
      // Soft rounded fluffy Arctic cotton-grass tuft (2 crossed vertical diamonds -> delicate oval puff up close, zero pointy cones!)
      const pr = 0.032 + hash2i(i, 6, 951) * 0.014;
      const py = pr * 0.95;
      const cottonTop = [0.96, 0.98, 0.96];
      const cottonBot = [0.80, 0.83, 0.79];
      // Plane X
      pushTri(tx - pr, h, tz, tx + pr, h, tz, tx, h + py, tz, cottonTop, 0, 1, 0);
      pushTri(tx - pr, h, tz, tx, h - py * 0.65, tz, tx + pr, h, tz, cottonBot, 0, 0.7, 0.7);
      // Plane Z
      pushTri(tx, h, tz - pr, tx, h, tz + pr, tx, h + py, tz, cottonTop, 0, 1, 0);
      pushTri(tx, h, tz - pr, tx, h - py * 0.65, tz, tx, h, tz + pr, cottonBot, 0.7, 0.7, 0);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  return geo;
}

/** Build high-detail radial Far Horizon Ring geometry covering 960m -> 7200m seamlessly (1 draw call, crisp far peaks!). */
function createFarHorizonRingGeo() {
  const radSegs = 192;
  const ringSegs = 48;
  const innerR = 960;
  const outerR = 7200;
  const vertCount = (radSegs + 1) * (ringSegs + 1);
  const pos = new Float32Array(vertCount * 3);
  const norm = new Float32Array(vertCount * 3);
  const surf = new Float32Array(vertCount * 4);
  const hydro = new Float32Array(vertCount * 4);
  const cave = new Float32Array(vertCount * 3);
  const idx = [];

  for (let r = 0; r <= ringSegs; r++) {
    const t = r / ringSegs;
    const radius = mix(innerR, outerR, Math.pow(t, 1.55));
    for (let a = 0; a <= radSegs; a++) {
      const ang = (a / radSegs) * Math.PI * 2;
      const vi = r * (radSegs + 1) + a;
      pos[vi * 3] = Math.cos(ang) * radius;
      pos[vi * 3 + 1] = 0;
      pos[vi * 3 + 2] = Math.sin(ang) * radius;
      norm[vi * 3 + 1] = 1;
      surf[vi * 4] = 0.0;
      surf[vi * 4 + 1] = 0.45;
      cave[vi * 3] = 99.0;
    }
  }

  for (let r = 0; r < ringSegs; r++) {
    for (let a = 0; a < radSegs; a++) {
      const v0 = r * (radSegs + 1) + a;
      const v1 = v0 + 1;
      const v2 = v0 + (radSegs + 1);
      const v3 = v2 + 1;
      idx.push(v0, v1, v2, v1, v3, v2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  geo.setAttribute('aSurf', new THREE.BufferAttribute(surf, 4));
  geo.setAttribute('aHydro', new THREE.BufferAttribute(hydro, 4));
  geo.setAttribute('aCave', new THREE.BufferAttribute(cave, 3));
  geo.setIndex(idx);
  return geo;
}

export function createTerrainSystem(texLib, scene) {
  const root = new THREE.Group();
  scene.add(root);

  // High-Performance Branched AAA Terrain PBR Shader (skips cliff/scree/path texture fetches where unused!)
  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.02
  });
  terrainMat.fog = false;
  terrainMat.customProgramCacheKey = () => 'ls_iceland_terrain_v11';

  terrainMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ATMO_UNIFORMS);
    shader.uniforms.uMossMap = { value: texLib.moss.map };
    shader.uniforms.uMossNorm = { value: texLib.moss.normalMap };
    shader.uniforms.uCliffMap = { value: texLib.basaltCliff.map };
    shader.uniforms.uCliffNorm = { value: texLib.basaltCliff.normalMap };
    shader.uniforms.uScreeMap = { value: texLib.scree.map };
    shader.uniforms.uScreeNorm = { value: texLib.scree.normalMap };
    shader.uniforms.uPathMap = { value: texLib.dirtPath.map };
    shader.uniforms.uPathNorm = { value: texLib.dirtPath.normalMap };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        attribute vec4 aSurf;
        attribute vec4 aHydro;
        attribute vec3 aCave;
        varying vec3 vWPos;
        varying vec3 vWNorm;
        varying vec4 vSurf;
        varying vec4 vHydro;
        varying vec3 vCave;
        `
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */`
        #include <project_vertex>
        {
          vec4 wp = modelMatrix * vec4(transformed, 1.0);
          vWPos = wp.xyz;
          vWNorm = normalize(mat3(modelMatrix) * objectNormal);
          vSurf = aSurf;
          vHydro = aHydro;
          vCave = aCave;
        }
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        uniform sampler2D uMossMap;
        uniform sampler2D uMossNorm;
        uniform sampler2D uCliffMap;
        uniform sampler2D uCliffNorm;
        uniform sampler2D uScreeMap;
        uniform sampler2D uScreeNorm;
        uniform sampler2D uPathMap;
        uniform sampler2D uPathNorm;

        varying vec3 vWPos;
        varying vec3 vWNorm;
        varying vec4 vSurf;
        varying vec4 vHydro;
        varying vec3 vCave;
        ${ATMO_GLSL_PARS}

        vec4 dualSampleRGBA(sampler2D t, vec2 xz, float sNear, float sFar) {
          vec4 a = texture2D(t, xz * sNear);
          vec2 rotUv = mat2(0.80, -0.60, 0.60, 0.80) * xz * sFar + vec2(0.31, 0.73);
          return mix(a, texture2D(t, rotUv), 0.36);
        }

        vec3 dualSampleNorm(sampler2D t, vec2 xz, float sNear, float sFar) {
          vec3 a = texture2D(t, xz * sNear).xyz * 2.0 - 1.0;
          vec2 rotUv = mat2(0.80, -0.60, 0.60, 0.80) * xz * sFar + vec2(0.31, 0.73);
          vec3 b = texture2D(t, rotUv).xyz * 2.0 - 1.0;
          return normalize(vec3(a.xy * 0.78 + b.xy * 0.42, 1.0));
        }

        // Non-repeating domain-warped & rotated triplanar rock sampling
        vec4 triplanarCliffRGBA(sampler2D t, vec3 wp, vec3 wn, float sc, float rotAng) {
          vec3 bw = pow(abs(wn), vec3(4.0));
          bw /= max(bw.x + bw.y + bw.z, 0.0001);
          float cs = cos(rotAng);
          float sn = sin(rotAng);
          mat2 R = mat2(cs, -sn, sn, cs);
          return texture2D(t, R * vec2(wp.z, wp.y) * sc + vec2(0.17, 0.43)) * bw.x +
                 texture2D(t, R * wp.xz * sc + vec2(0.61, 0.19)) * bw.y +
                 texture2D(t, R * vec2(wp.x, wp.y) * sc + vec2(0.29, 0.73)) * bw.z;
        }

        vec3 triplanarCliffNorm(sampler2D t, vec3 wp, vec3 wn, float sc, float rotAng) {
          vec3 bw = pow(abs(wn), vec3(4.0));
          bw /= max(bw.x + bw.y + bw.z, 0.0001);
          vec3 sgn = sign(wn);
          float cs = cos(rotAng);
          float sn = sin(rotAng);
          mat2 R = mat2(cs, -sn, sn, cs);
          vec3 nx = texture2D(t, R * vec2(wp.z, wp.y) * sc + vec2(0.17, 0.43)).xyz * 2.0 - 1.0;
          vec3 ny = texture2D(t, R * wp.xz * sc + vec2(0.61, 0.19)).xyz * 2.0 - 1.0;
          vec3 nz = texture2D(t, R * vec2(wp.x, wp.y) * sc + vec2(0.29, 0.73)).xyz * 2.0 - 1.0;
          return vec3(0.0, nx.y, nx.x * sgn.x) * bw.x +
                 vec3(ny.x, 0.0, ny.y * sgn.y) * bw.y +
                 vec3(nz.x * sgn.z, nz.y, 0.0) * bw.z;
        }

        // Fast 3-octave non-periodic ridged noise for chaotic basalt cliff crevices
        float rockRidged(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
          for (int i = 0; i < 3; i++) {
            float n = 1.0 - abs(atmoNoise(p) * 2.0 - 1.0);
            v += a * n * n;
            p = rot * p * 2.07 + vec2(17.3, -9.1);
            a *= 0.5;
          }
          return v;
        }

        float heightBlendFactor(float mask, float hA, float hB, float sharpness) {
          float wA = (1.0 - mask) + hA * 0.55;
          float wB = mask + hB * 0.55;
          return clamp((wB - wA) * sharpness + 0.5, 0.0, 1.0);
        }
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */`
        #include <color_fragment>
        // Pixel-accurate volcanic cave portal arch cutout where the continuous river enters/exits beneath a mountain!
        // Uses smooth centerline overburden (vCave.z) so mountain cliff, moss, snow & glacier stay 100% solid overhead with ZERO sidewall spikes!
        if (vCave.z > 16.8 && abs(vCave.x) < 12.6) {
          float archU = abs(vCave.x) / 12.6;
          // Organic slightly irregular natural Icelandic sea-cave / lava-tube arch silhouette
          float archCeil = vCave.y + 10.4 * pow(max(0.0, 1.0 - archU * archU), 0.56);
          float archRough = (atmoNoise(vWPos.xz * 0.24 + vec2(vWPos.y * 0.22)) - 0.5) * 1.4;
          if (vWPos.y < archCeil + archRough) discard;
        }
        float lsRough = 0.92;
        vec3 lsWorldNorm = normalize(vWNorm);
        {
          vec3 wp = vWPos;
          vec3 wn = normalize(vWNorm);
          float camDist = length(cameraPosition - wp);
          // Keep crisp fine grass/tuft micro-texture sharp out to 105m (kills dull muddy mid-ground look!)
          float closeFade = 1.0 - smoothstep(22.0, 105.0, camDist);
          float slope = 1.0 - clamp(wn.y, 0.0, 1.0);

          float macroN = atmoNoise(wp.xz * 0.016) * 0.62 + atmoNoise(wp.xz * 0.044 + vec2(3.1, -5.2)) * 0.38;
          float midN   = atmoNoise(wp.xz * 0.092 + vec2(4.1, -6.7));
          float patchN = atmoNoise(wp.xz * 0.026 - vec2(7.4, 2.8)) * 0.62 + midN * 0.38;
          float microDetail = closeFade > 0.01 ? (atmoNoise(wp.xz * 4.2) * 0.60 + atmoNoise(wp.xz * 10.5 + vec2(3.7, -1.9)) * 0.40) : 0.5;

          // Natural rocky weathered strata ribs peeking through steeper hillsides (like reference left hill!)
          float rockRib = smoothstep(0.50, 0.78, patchN) * smoothstep(0.16, 0.36, slope);
          float cliffRaw = clamp(max(max(vSurf.y * 0.84, smoothstep(0.22, 0.46, slope)), rockRib * 0.72), 0.0, 1.0);
          float screeRaw = clamp(vSurf.w * (1.0 - cliffRaw * 0.55), 0.0, 1.0);
          float pathRaw  = clamp(vSurf.z * (1.0 - cliffRaw), 0.0, 1.0);

          // 1) Rich, Earthy, High-Contrast Olive-Gold Grassy Meadow & Icelandic Moss (no neon-lime washout!)
          vec4 mossMid  = texture2D(uMossMap, wp.xz * 0.42);
          vec2 rotFar   = mat2(0.80, -0.60, 0.60, 0.80) * wp.xz * 0.092 + vec2(0.31, 0.73);
          vec4 mossFar  = texture2D(uMossMap, rotFar);
          vec4 mossFine = closeFade > 0.02 ? texture2D(uMossMap, wp.xz * 1.55 + vec2(0.19, 0.53)) : mossMid;
          vec4 mossSample = mix(mix(mossMid, mossFar, 0.28), mossFine, closeFade * 0.56);
          vec3 mossN = normalize(mix(dualSampleNorm(uMossNorm, wp.xz, 0.46, 0.11), texture2D(uMossNorm, wp.xz * 1.55 + vec2(0.19, 0.53)).xyz * 2.0 - 1.0, closeFade * 0.50));
          float mossH = mossSample.a;

          float cushionAO = smoothstep(0.06, 0.86, vHydro.z * 0.50 + mossH * 0.62);
          // Grounded photorealistic Death Stranding turf palette: deep moss hollows -> warm earthy olive-gold -> subtle dry meadow ochre
          vec3 mossEmerald = vec3(0.42, 0.56, 0.22);
          vec3 mossSunGold = vec3(0.84, 0.88, 0.34);
          vec3 warmMeadow  = vec3(0.78, 0.68, 0.30);
          vec3 mossTint = mix(mossEmerald, mossSunGold, smoothstep(0.20, 0.78, macroN * 0.55 + midN * 0.45));
          mossTint = mix(mossTint, warmMeadow, smoothstep(0.54, 0.86, patchN) * 0.42);
          float bladeCrisp = mix(1.0, 0.56 + microDetail * 0.86, closeFade * 0.92);
          vec3 mossCol = mossSample.rgb * mossTint * mix(0.36, 1.24, cushionAO) * bladeCrisp;

          vec3 col = mossCol;
          vec3 horizN = mossN;
          float screeMask = 0.0;
          float pathMask = 0.0;
          float cliffMask = 0.0;
          vec3 cliffNormDelta = vec3(0.0);

          // 2) Crisp Weathered Grey-Slate Riverbed Cobbles & Talus Scree
          vec4 screeSample = vec4(0.28, 0.30, 0.32, 0.5);
          if (screeRaw > 0.01 || pathRaw > 0.01) {
            screeSample = dualSampleRGBA(uScreeMap, wp.xz, 0.64, 0.15);
            if (screeRaw > 0.01) {
              vec3 screeN = dualSampleNorm(uScreeNorm, wp.xz, 0.64, 0.15);
              vec3 gravelTone = mix(vec3(0.68, 0.72, 0.76), vec3(1.06, 1.09, 1.12), smoothstep(0.26, 0.78, screeSample.a));
              vec3 screeCol = screeSample.rgb * gravelTone * mix(0.54, 1.22, screeSample.a) * mix(1.0, 0.74 + microDetail * 0.52, closeFade * 0.78);
              screeMask = heightBlendFactor(screeRaw, mossH, screeSample.a * 0.94, 4.6);
              col = mix(col, screeCol, screeMask);
              horizN = mix(horizN, screeN, screeMask);
            }
          }

          // 3) Natural Earth & Weathered Gravel Footpath / Village Lane
          if (pathRaw > 0.01) {
            vec4 pathSample = dualSampleRGBA(uPathMap, wp.xz, 0.58, 0.14);
            vec3 pathN = dualSampleNorm(uPathNorm, wp.xz, 0.58, 0.14);
            vec3 gravelEarth = mix(pathSample.rgb * vec3(1.08, 0.98, 0.80), screeSample.rgb * vec3(0.92, 0.95, 0.98), smoothstep(0.28, 0.74, midN));
            vec3 pathCol = gravelEarth * mix(0.62, 1.18, pathSample.a) * mix(1.0, 0.80 + microDetail * 0.40, closeFade * 0.78);
            pathMask = heightBlendFactor(pathRaw, mossH, pathSample.a * 0.88, 4.0);
            col = mix(col, pathCol, pathMask);
            horizN = mix(horizN, pathN, pathMask);
          }

          // 4) Non-Repeating Chaotic Fractured Basalt Cliffs (ZERO parallel lines! Strong 3D organic domain warping!)
          if (cliffRaw > 0.01) {
            float w1 = (atmoNoise(wp.xz * 0.011 + vec2(wp.y * 0.013)) - 0.5) * 18.0;
            float w2 = (atmoNoise(vec2(wp.z * 0.023 - wp.y * 0.019, wp.x * 0.023 + wp.y * 0.017)) - 0.5) * 8.0;
            vec3 wpRock = wp + vec3(w1 + w2, w1 * 0.55 - w2 * 0.7, -w1 * 0.8 + w2 * 0.6);

            // Two rotated, non-harmonic isotropic triplanar rock scales -> completely eliminates repeating/parallel bands!
            vec4 cliffNear = triplanarCliffRGBA(uCliffMap, wpRock, wn, 0.088, 0.38);
            vec4 cliffFar  = triplanarCliffRGBA(uCliffMap, wpRock, wn, 0.024, 1.73);
            float farW = clamp(smoothstep(32.0, 320.0, camDist) * 0.52 + (1.0 - macroN) * 0.24, 0.20, 0.72);
            vec4 cliffMix = mix(cliffNear, cliffFar, farW);
            float cliffH = cliffMix.a;

            // True 3D chaotic diagonal rock fissures & irregular weathered crag facets (ZERO vertical line stretching!)
            vec2 cragA = vec2(wpRock.x * 0.026 + wpRock.y * 0.021, wpRock.z * 0.026 - wpRock.y * 0.019);
            vec2 cragB = vec2((wpRock.x - wpRock.z) * 0.015 + wpRock.y * 0.012, wpRock.y * 0.028 + (wpRock.x + wpRock.z) * 0.011);
            float fissureMacro = rockRidged(cragA) * 0.55 + rockRidged(cragB) * 0.45;
            float mineralPatch = atmoNoise(vec2((wpRock.x + wpRock.z) * 0.008, wpRock.y * 0.014)) * 0.65 + macroN * 0.35;
            float darkCrev = smoothstep(0.14, 0.78, fissureMacro);

            vec3 mineralTone = mix(vec3(0.68, 0.73, 0.79), vec3(1.14, 1.19, 1.25), smoothstep(0.22, 0.76, mineralPatch));
            mineralTone = mix(mineralTone, vec3(0.92, 0.86, 0.76), smoothstep(0.56, 0.86, macroN) * 0.28);

            float cliffAO = mix(0.46, 1.22, cliffH) * mix(0.54, 1.18, darkCrev);
            vec3 basaltCol = cliffMix.rgb * mineralTone * 1.16 * cliffAO;
            float ridgeFacet = smoothstep(0.46, 0.86, cliffH * 0.55 + fissureMacro * 0.45);
            basaltCol += vec3(0.095, 0.108, 0.122) * ridgeFacet * (0.45 + 0.55 * smoothstep(0.22, 0.72, mineralPatch));

            // Lush olive-green alpine moss & grass cloaking lower/mid mountain flanks (organic ragged treeline fading over ~180..275m!)
            float altGrassFade = 1.0 - smoothstep(180.0, 278.0, wp.y + (macroN - 0.5) * 76.0 + (patchN - 0.5) * 34.0);
            float ledgeMoss = smoothstep(0.28, 0.70, wn.y + (midN - 0.5) * 0.28) * smoothstep(0.16, 0.66, macroN) * altGrassFade;
            vec3 cliffCol = mix(basaltCol, mossCol * 0.88, ledgeMoss * 0.88);

            cliffMask = heightBlendFactor(cliffRaw, mossH * 0.88, cliffH, 3.6);
            col = mix(col, cliffCol, cliffMask);

            cliffNormDelta =
              triplanarCliffNorm(uCliffNorm, wpRock, wn, 0.088, 0.38) * 0.78 +
              triplanarCliffNorm(uCliffNorm, wpRock, wn, 0.024, 1.73) * 0.54;
          }

          // 5) Towering Icelandic High-Altitude Alpine Snowfields & Blue-White Crevassed Mountain Glaciers!
          float glacierRaw = clamp(vSurf.x, 0.0, 1.0);
          float snowRaw = clamp(vHydro.w, 0.0, 1.0);
          float snowMask = 0.0;
          float glacierMask = 0.0;
          float iceGloss = 0.0;

          // Natural dark alpine tundra/scree belt between green foothills & ragged snowpack (prevents artificial green-touching-white border!)
          float alpineBelt = smoothstep(185.0, 305.0, wp.y + (macroN - 0.5) * 95.0 + (patchN - 0.5) * 45.0) * (1.0 - cliffMask * 0.65);
          if (alpineBelt > 0.01) {
            vec3 tundraRock = mix(vec3(0.20, 0.22, 0.23), vec3(0.30, 0.29, 0.22), smoothstep(0.30, 0.78, midN));
            col = mix(col, tundraRock, alpineBelt * 0.62);
          }

          if (snowRaw > 0.005 || glacierRaw > 0.005) {
            // Organic ragged Icelandic snowline: warped downslope couloir/gully tongues, chaotic bare basalt crags,
            // sheltered aspect bias & fragmented wind-drifted snow patches (ZERO straight lines & ZERO periodic rungs!)
            float aspectBias = dot(normalize(vec2(wn.x, wn.z) + vec2(0.0001)), normalize(vec2(-0.62, -0.78))) * 0.20;
            vec2 driftWarp = vec2(
              atmoNoise(wp.xz * 0.014 + vec2(2.3, -4.1)) - 0.5,
              atmoNoise(wp.xz * 0.014 + vec2(-5.7, 1.8)) - 0.5
            ) * 34.0;
            vec2 wpSnow = wp.xz + driftWarp;
            vec2 couloirUv = wpSnow * 0.017 + vec2(wp.y * 0.007, -wp.y * 0.006);
            float couloirGully = 1.0 - rockRidged(couloirUv);
            float patchLarge = atmoNoise(wpSnow * 0.022 + vec2(wp.y * 0.005, -wp.y * 0.004));
            float patchMed   = atmoNoise(wpSnow * 0.068 - vec2(wp.y * 0.012));
            float patchFine  = atmoNoise(wp.xz * 0.22 + vec2(wp.y * 0.03));
            float windPatch  = patchLarge * 0.52 + patchMed * 0.32 + patchFine * 0.16;

            // Steep sheer rock walls shed snow cleanly while irregular rock hollows & concave couloirs trap snow fingers!
            float snowHold = smoothstep(0.38, 0.80, wn.y + (windPatch - 0.5) * 0.42 + (couloirGully - 0.46) * 0.38);
            // Full-strength multi-scale patch & gully breakup right across the snowline transition!
            float snowBreakup = (couloirGully - 0.48) * 0.56 + (patchLarge - 0.50) * 0.54 + (patchMed - 0.50) * 0.28 + aspectBias;
            float transitionZone = smoothstep(0.01, 0.18, snowRaw) * (1.0 - smoothstep(0.68, 0.96, snowRaw) * 0.72);
            float snowSignal = snowRaw * (0.28 + 0.92 * snowHold) + snowBreakup * transitionZone;
            snowMask = clamp(smoothstep(0.26, 0.56, snowSignal), 0.0, 1.0);

            vec3 snowLit = vec3(0.86, 0.91, 0.96);
            vec3 snowShadow = vec3(0.54, 0.66, 0.80);
            vec3 snowCol = mix(snowShadow, snowLit, clamp(0.42 + 0.58 * wn.y + (windPatch - 0.5) * 0.24, 0.0, 1.0));
            col = mix(col, snowCol, snowMask);

            // Photorealistic Icelandic Glacier (compacted overcast silver-white firn, narrow cerulean crevasses & black volcanic ash moraine bands!)
            if (glacierRaw > 0.01) {
              vec2 iceCoord = vec2((wp.x * 0.72 + wp.z * 0.69) * 0.055, (wp.z * 0.72 - wp.x * 0.69) * 0.032 + wp.y * 0.024);
              float crevasse = rockRidged(iceCoord + vec2(macroN * 1.4, -midN * 0.9));
              float serac = atmoNoise(wp.xz * 0.12 + vec2(wp.y * 0.05)) * 0.65 + atmoNoise(wp.xz * 0.34) * 0.35;
              // Steep sheer rock faces stay rocky even near glacier borders -> natural jagged interlocking icefall!
              float slopeHold = smoothstep(0.32, 0.72, wn.y + (serac - 0.5) * 0.28 + (couloirGully - 0.45) * 0.22);

              // Realistic overcast glacial colors (90% white-silver compacted ice + pale icy blue-grey + narrow deep cerulean crevasses!)
              vec3 crevasseBlue = vec3(0.22, 0.45, 0.60);
              vec3 glacialIce   = vec3(0.58, 0.72, 0.80);
              vec3 firnWhite    = vec3(0.84, 0.89, 0.93);
              float deepCrack = 1.0 - smoothstep(0.08, 0.34, crevasse);
              vec3 iceCol = mix(glacialIce, firnWhite, smoothstep(0.25, 0.74, serac * 0.62 + crevasse * 0.48));
              iceCol = mix(iceCol, crevasseBlue, deepCrack * 0.82);

              // Authentic Icelandic dark volcanic ash moraine ribbons lacing along the glacier edges & snout!
              float edgeBand = smoothstep(0.06, 0.48, glacierRaw) * (1.0 - smoothstep(0.45, 0.85, glacierRaw));
              float ashStreak = edgeBand * smoothstep(0.38, 0.74, atmoNoise(wp.xz * 0.058 + vec2(midN * 1.6))) * (1.0 - smoothstep(200.0, 310.0, wp.y));
              iceCol = mix(iceCol, vec3(0.20, 0.22, 0.24), ashStreak * 0.74);

              glacierMask = smoothstep(0.18, 0.58, glacierRaw * (0.42 + 0.72 * slopeHold) + (serac - 0.5) * 0.28 + (couloirGully - 0.48) * 0.22);
              col = mix(col, iceCol, glacierMask);
              iceGloss = glacierMask * (1.0 - ashStreak * 0.75) * (0.35 + 0.65 * deepCrack);
              horizN = mix(horizN, vec3((crevasse - 0.5) * 0.90, (serac - 0.5) * 0.90, 1.0), glacierMask * 0.80);
            }
          }

          // Grazing-angle woolly moss velvet sheen (suppressed on snow/glacier!)
          vec3 viewDir = normalize(cameraPosition - wp);
          float fres = pow(1.0 - max(dot(wn, viewDir), 0.0), 3.0);
          float mossCoverage = (1.0 - cliffMask) * (1.0 - screeMask) * (1.0 - pathMask) * (1.0 - snowMask) * (1.0 - glacierMask);
          col += vec3(0.068, 0.080, 0.024) * fres * mossCoverage * (1.0 - uNightFactor * 0.88);
          // Subtle icy Fresnel sheen on crystalline glacial blue ice
          col += vec3(0.10, 0.22, 0.30) * fres * iceGloss * (1.0 - uNightFactor * 0.85);

          // Gentle natural overcast cloud shadows (no harsh dark blotches)
          col *= mix(0.78, 1.04, sampleCloudShadow(wp.xz));

          // Natural wetness sheen without crushing rocks/gravel to black
          float wet = clamp(max(vHydro.x, uRainWetness * 0.72), 0.0, 1.0);
          float rockOrSoil = clamp(cliffMask + screeMask + pathMask, 0.0, 1.0);
          float rockWet = wet * mix(0.20, 0.85, rockOrSoil);
          float puddle = smoothstep(0.64, 0.86, midN) * smoothstep(0.94, 0.995, wn.y) * uRainWetness * clamp(pathMask + screeMask * 0.6, 0.0, 1.0);
          col *= mix(1.0, 0.72, rockWet * 0.58 + puddle * 0.35);

          vec2 microGrad = vec2(0.0);
          if (closeFade > 0.02) {
            microGrad = vec2(
              atmoNoise(wp.xz * 4.5 + vec2(0.08, 0.0)) - atmoNoise(wp.xz * 4.5 - vec2(0.08, 0.0)),
              atmoNoise(wp.xz * 4.5 + vec2(0.0, 0.08)) - atmoNoise(wp.xz * 4.5 - vec2(0.0, 0.08))
            ) * closeFade * mix(0.50, 0.90, mossCoverage);
          }

          float horizStrength = mix(1.82, 0.95, screeMask + pathMask * 0.35);
          vec3 flatDelta = vec3(horizN.x, 0.0, horizN.y) * horizStrength + vec3(microGrad.x, 0.0, microGrad.y);
          lsWorldNorm = normalize(wn + mix(flatDelta, cliffNormDelta * 1.22, cliffMask));

          // Specular AA
          vec3 dNdx = dFdx(lsWorldNorm);
          vec3 dNdy = dFdy(lsWorldNorm);
          float normVar = clamp(max(dot(dNdx, dNdx), dot(dNdy, dNdy)) * 4.5, 0.0, 0.82);

          lsRough = mix(0.95, 0.78, cliffMask * 0.75 + screeMask * 0.48);
          lsRough = mix(lsRough, 0.64, snowMask * 0.85);
          lsRough = mix(lsRough, 0.24, iceGloss * 0.90);
          lsRough = mix(lsRough, 0.48, clamp(rockWet * 0.68, 0.0, 0.78));
          lsRough = mix(lsRough, 0.18, puddle * 0.80);
          float minRough = mix(0.28, 0.58, smoothstep(0.25, 0.60, slope));
          lsRough = clamp(sqrt(lsRough * lsRough + normVar), minRough, 0.97);

          diffuseColor.rgb = col;
        }
        `
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */`
        #include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(lsWorldNorm, 0.0)).xyz);
        `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */`
        #include <roughnessmap_fragment>
        roughnessFactor = lsRough;
        `
      )
      .replace(
        '#include <dithering_fragment>',
        /* glsl */`
        gl_FragColor.rgb += sampleOdradekScan(vWPos, lsWorldNorm);
        gl_FragColor.rgb = applyIcelandAtmo(gl_FragColor.rgb, vWPos);
        #include <dithering_fragment>
        `
      );
  };

  // Shared GLSL snippet matching terrainMat's exact world-space moss albedo & normal so ground objects blend SEAMLESSLY into the terrain!
  const TERRAIN_BLEND_GLSL = /* glsl */`
    vec3 evalTerrainMossColor(sampler2D mossMap, vec3 wp, vec3 groundUp, out vec4 outMossS) {
      float camDist = length(cameraPosition - wp);
      float closeFade = 1.0 - smoothstep(22.0, 105.0, camDist);
      float macroN = atmoNoise(wp.xz * 0.016) * 0.62 + atmoNoise(wp.xz * 0.044 + vec2(3.1, -5.2)) * 0.38;
      float midN   = atmoNoise(wp.xz * 0.092 + vec2(4.1, -6.7));
      float patchN = atmoNoise(wp.xz * 0.026 - vec2(7.4, 2.8)) * 0.62 + midN * 0.38;
      float microDetail = closeFade > 0.01 ? (atmoNoise(wp.xz * 4.2) * 0.60 + atmoNoise(wp.xz * 10.5 + vec2(3.7, -1.9)) * 0.40) : 0.5;

      vec4 mossMid  = texture2D(mossMap, wp.xz * 0.42);
      vec2 rotFar   = mat2(0.80, -0.60, 0.60, 0.80) * wp.xz * 0.092 + vec2(0.31, 0.73);
      vec4 mossFar  = texture2D(mossMap, rotFar);
      vec4 mossFine = closeFade > 0.02 ? texture2D(mossMap, wp.xz * 1.55 + vec2(0.19, 0.53)) : mossMid;
      vec4 mossSample = mix(mix(mossMid, mossFar, 0.28), mossFine, closeFade * 0.56);
      outMossS = mossSample;

      float cushionAO = smoothstep(0.06, 0.86, 0.28 + mossSample.a * 0.62);
      vec3 mossEmerald = vec3(0.42, 0.56, 0.22);
      vec3 mossSunGold = vec3(0.84, 0.88, 0.34);
      vec3 warmMeadow  = vec3(0.78, 0.68, 0.30);
      vec3 mossTint = mix(mossEmerald, mossSunGold, smoothstep(0.20, 0.78, macroN * 0.55 + midN * 0.45));
      mossTint = mix(mossTint, warmMeadow, smoothstep(0.54, 0.86, patchN) * 0.42);
      float bladeCrisp = mix(1.0, 0.56 + microDetail * 0.86, closeFade * 0.92);
      vec3 mCol = mossSample.rgb * mossTint * mix(0.36, 1.24, cushionAO) * bladeCrisp;
      vec3 viewDir = normalize(cameraPosition - wp);
      float fres = pow(1.0 - max(dot(groundUp, viewDir), 0.0), 3.0);
      mCol += vec3(0.068, 0.080, 0.024) * fres * (1.0 - uNightFactor * 0.88);
      return mCol;
    }
  `;

  // World-Space Triplanar Fractured Basalt + Terrain-Matched Skirt-Blended Moss Material for Boulders & Crags
  const boulderMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.02
  });
  boulderMat.fog = false;
  boulderMat.customProgramCacheKey = () => 'ls_tri_boulder_v11';
  boulderMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ATMO_UNIFORMS);
    shader.uniforms.uRockTex = { value: texLib.basaltCliff.map };
    shader.uniforms.uRockNorm = { value: texLib.basaltCliff.normalMap };
    shader.uniforms.uMossTex = { value: texLib.moss.map };
    shader.uniforms.uMossNorm = { value: texLib.moss.normalMap };
    shader.uniforms.uScreeTex = { value: texLib.scree.map };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRWorldPos;\nvarying vec3 vRWorldNorm;\nvarying vec3 vRGroundUp;\nvarying float vRHeightAboveBase;\nvarying float vRMossAllow;')
      .replace(
        '#include <color_vertex>',
        /* glsl */`
        #include <color_vertex>
        vRMossAllow = 1.0;
        #ifdef USE_INSTANCING_COLOR
          vRMossAllow = instanceColor.r;
          vColor.rgb = vec3(1.0);
        #endif
        `
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */`
        #include <project_vertex>
        {
          vec4 rwp = vec4(transformed, 1.0);
          vec3 rwn = objectNormal;
          vec3 instOrigin = vec3(0.0);
          vec3 instUp = vec3(0.0, 1.0, 0.0);
          #ifdef USE_INSTANCING
            rwp = instanceMatrix * rwp;
            rwn = mat3(instanceMatrix) * rwn;
            instOrigin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            instUp = normalize(mat3(instanceMatrix) * vec3(0.0, 1.0, 0.0));
          #endif
          vec3 instOriginW = (modelMatrix * vec4(instOrigin, 1.0)).xyz;
          vec3 instUpW = normalize(mat3(modelMatrix) * instUp);
          rwp = modelMatrix * rwp;
          vRWorldPos = rwp.xyz;
          vRWorldNorm = normalize(mat3(modelMatrix) * rwn);
          vRGroundUp = instUpW;
          vRHeightAboveBase = dot(rwp.xyz - instOriginW, instUpW);
        }
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        uniform sampler2D uRockTex;
        uniform sampler2D uRockNorm;
        uniform sampler2D uMossTex;
        uniform sampler2D uMossNorm;
        uniform sampler2D uScreeTex;
        varying vec3 vRWorldPos;
        varying vec3 vRWorldNorm;
        varying vec3 vRGroundUp;
        varying float vRHeightAboveBase;
        varying float vRMossAllow;
        ${ATMO_GLSL_PARS}
        ${TERRAIN_BLEND_GLSL}

        vec4 triRockRGBA(sampler2D t, vec3 wp, vec3 wn, float sc) {
          vec3 bw = pow(abs(wn), vec3(4.0));
          bw /= max(bw.x + bw.y + bw.z, 0.0001);
          return texture2D(t, vec2(wp.z, wp.y) * sc) * bw.x +
                 texture2D(t, wp.xz * sc) * bw.y +
                 texture2D(t, vec2(wp.x, wp.y) * sc) * bw.z;
        }

        vec3 triRockNorm(sampler2D t, vec3 wp, vec3 wn, float sc) {
          vec3 bw = pow(abs(wn), vec3(4.0));
          bw /= max(bw.x + bw.y + bw.z, 0.0001);
          vec3 sgn = sign(wn);
          vec3 nx = texture2D(t, vec2(wp.z, wp.y) * sc).xyz * 2.0 - 1.0;
          vec3 ny = texture2D(t, wp.xz * sc).xyz * 2.0 - 1.0;
          vec3 nz = texture2D(t, vec2(wp.x, wp.y) * sc).xyz * 2.0 - 1.0;
          return vec3(0.0, nx.y, nx.x * sgn.x) * bw.x +
                 vec3(ny.x, 0.0, ny.y * sgn.y) * bw.y +
                 vec3(nz.x * sgn.z, nz.y, 0.0) * bw.z;
        }
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */`
        #include <color_fragment>
        float rRough = 0.82;
        vec3 rFinalNorm = normalize(vRWorldNorm);
        {
          vec3 wp = vRWorldPos;
          vec3 wn = normalize(vRWorldNorm);
          vec3 gUp = normalize(vRGroundUp);
          vec4 rockNear = triRockRGBA(uRockTex, wp, wn, 0.48);
          vec4 rockMacro = triRockRGBA(uRockTex, wp, wn, 0.15);
          vec4 rock = mix(rockNear, rockMacro, 0.35);

          // Harmonious weathered slate-grey Icelandic basalt matching terrain cliffs (NEVER harsh black blobs!)
          float rockAO = mix(0.46, 1.24, rock.a);
          float ridgeLit = smoothstep(0.46, 0.84, rock.a) * (0.45 + 0.55 * clamp(wn.y, 0.0, 1.0));
          float warmVar = atmoNoise(wp.xz * 0.075 + vec2(3.1, -2.4));
          vec3 stoneTone = mix(vec3(0.76, 0.80, 0.85), vec3(0.92, 0.87, 0.78), smoothstep(0.35, 0.78, warmVar) * 0.52);
          vec3 darkBasalt = rock.rgb * stoneTone * 1.26 * rockAO + vec3(0.068, 0.075, 0.080) * ridgeLit;

          // Subtle natural Icelandic crustose lichen (pale grey + delicate warm rusty-orange mineral flecks)
          float lichenN = atmoNoise(wp.xz * 3.8 + vec2(wp.y * 2.6)) * 0.6 + atmoNoise(wp.xz * 9.6 - vec2(wp.y * 4.2)) * 0.4;
          float greyLichen = smoothstep(0.60, 0.84, lichenN) * smoothstep(0.28, 0.76, rockNear.a) * smoothstep(0.15, 0.72, wn.y) * 0.38;
          darkBasalt = mix(darkBasalt, vec3(0.36, 0.38, 0.34), greyLichen);
          float rustField = atmoNoise(wp.xz * 0.92 + vec2(wp.y * 0.85, -wp.z * 0.75));
          float rustLichen = smoothstep(0.66, 0.84, rustField) * smoothstep(0.52, 0.80, lichenN) * smoothstep(0.22, 0.76, wn.y);
          darkBasalt = mix(darkBasalt, vec3(0.56, 0.25, 0.07), rustLichen * 0.72);

          // EXACT world-space terrain moss OR scree color & normal so boulders melt seamlessly into BOTH green meadows AND grey scree riverbeds!
          vec4 mossS;
          vec3 terrainMoss = evalTerrainMossColor(uMossTex, wp, gUp, mossS);
          vec4 screeS = texture2D(uScreeTex, wp.xz * 0.64);
          vec3 terrainScree = screeS.rgb * mix(vec3(0.68, 0.72, 0.76), vec3(1.06, 1.09, 1.12), smoothstep(0.26, 0.78, screeS.a)) * mix(0.54, 1.22, screeS.a);
          float mossAllow = clamp(vRMossAllow, 0.0, 1.0);
          vec3 groundSurfCol = mix(terrainScree, terrainMoss, mossAllow);
          vec3 mn = texture2D(uMossNorm, wp.xz * 0.46).xyz * 2.0 - 1.0;

          // Smooth terrain-hugging base skirt blend (accounts for sunken origin -> kills hard seam on ALL boulder sizes!)
          float baseBlend = 1.0 - smoothstep(0.06, 0.72, vRHeightAboveBase + (mossS.a - 0.5) * 0.28);
          // Natural mossy cap draped over upper boulder shoulders (suppressed on wet river/plunge-pool boulders!)
          float patchGate = smoothstep(0.14, 0.60, atmoNoise(wp.xz * 0.18 + vec2(wp.y * 0.22)));
          float mossTop = smoothstep(0.34, 0.72, wn.y + (mossS.a - 0.45) * 0.32) * patchGate * mossAllow;

          vec3 col = mix(darkBasalt, terrainMoss, mossTop * 0.90);
          col = mix(col, groundSurfCol, baseBlend);
          col *= mix(0.78, 1.04, sampleCloudShadow(wp.xz));

          float totalMoss = clamp(max(baseBlend * mossAllow, mossTop * 0.90), 0.0, 1.0);
          float rockWet = uRainWetness * 0.72 * (1.0 - totalMoss * 0.82);
          col *= mix(1.0, 0.74, rockWet * 0.55);
          rRough = mix(0.80, 0.95, totalMoss);
          rRough = mix(rRough, 0.44, rockWet * 0.55);

          // Blend base normal cleanly into terrain surface normal near ground (eliminates hard dark silhouette ring!)
          vec3 rockNDelta = triRockNorm(uRockNorm, wp, wn, 0.52) * 0.92 + triRockNorm(uRockNorm, wp, wn, 0.16) * 0.42;
          vec3 rockWorldN = normalize(wn + rockNDelta * mix(1.0, 0.32, mossTop));
          vec3 terrainWorldN = normalize(gUp + vec3(mn.x, 0.0, mn.y) * 1.45);
          rFinalNorm = normalize(mix(rockWorldN, terrainWorldN, smoothstep(0.04, 0.92, baseBlend)));

          diffuseColor.rgb = col;
        }
        `
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */`
        #include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(rFinalNorm, 0.0)).xyz);
        `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */`
        #include <roughnessmap_fragment>
        roughnessFactor = rRough;
        `
      )
      .replace(
        '#include <dithering_fragment>',
        /* glsl */`
        gl_FragColor.rgb += sampleOdradekScan(vRWorldPos, rFinalNorm);
        gl_FragColor.rgb = applyIcelandAtmo(gl_FragColor.rgb, vRWorldPos);
        #include <dithering_fragment>
        `
      );
  };

  // Terrain-Blended Smooth Weathered Cobble & Small Stone Materials (world-space triplanar basalt + mossy earth base skirt!)
  const makeBlendedStoneMat = (cacheKey, skirtHeight, roughness) => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness,
      metalness: 0.03
    });
    mat.fog = false;
    mat.customProgramCacheKey = () => cacheKey;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, ATMO_UNIFORMS);
      shader.uniforms.uRockTex = { value: texLib.basaltCliff.map };
      shader.uniforms.uRockNorm = { value: texLib.basaltCliff.normalMap };
      shader.uniforms.uMossTex = { value: texLib.moss.map };
      shader.uniforms.uMossNorm = { value: texLib.moss.normalMap };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSWorldPos;\nvarying vec3 vSWorldNorm;\nvarying vec3 vSGroundUp;\nvarying float vSHeightAboveBase;')
        .replace(
          '#include <project_vertex>',
          /* glsl */`
          #include <project_vertex>
          {
            vec4 swp = vec4(transformed, 1.0);
            vec3 swn = objectNormal;
            vec3 instOrigin = vec3(0.0);
            vec3 instUp = vec3(0.0, 1.0, 0.0);
            #ifdef USE_INSTANCING
              swp = instanceMatrix * swp;
              swn = mat3(instanceMatrix) * swn;
              instOrigin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
              instUp = normalize(mat3(instanceMatrix) * vec3(0.0, 1.0, 0.0));
            #endif
            vec3 instOriginW = (modelMatrix * vec4(instOrigin, 1.0)).xyz;
            vec3 instUpW = normalize(mat3(modelMatrix) * instUp);
            swp = modelMatrix * swp;
            vSWorldPos = swp.xyz;
            vSWorldNorm = normalize(mat3(modelMatrix) * swn);
            vSGroundUp = instUpW;
            vSHeightAboveBase = dot(swp.xyz - instOriginW, instUpW);
          }
          `
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */`
          #include <common>
          uniform sampler2D uRockTex;
          uniform sampler2D uRockNorm;
          uniform sampler2D uMossTex;
          uniform sampler2D uMossNorm;
          varying vec3 vSWorldPos;
          varying vec3 vSWorldNorm;
          varying vec3 vSGroundUp;
          varying float vSHeightAboveBase;
          ${ATMO_GLSL_PARS}
          ${TERRAIN_BLEND_GLSL}
          `
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */`
          #include <color_fragment>
          vec3 sFinalNorm = normalize(vSWorldNorm);
          {
            vec3 wp = vSWorldPos;
            vec3 wn = normalize(vSWorldNorm);
            vec3 gUp = normalize(vSGroundUp);
            vec4 rockS = texture2D(uRockTex, wp.xz * 0.85 + vec2(wp.y * 0.65));
            vec3 rockCol = diffuseColor.rgb * rockS.rgb * mix(0.75, 1.48, rockS.a) * 1.35;

            vec4 mossS;
            vec3 terrainMoss = evalTerrainMossColor(uMossTex, wp, gUp, mossS);
            float baseBlend = 1.0 - smoothstep(-0.04, ${skirtHeight.toFixed(2)}, vSHeightAboveBase + (mossS.a - 0.5) * 0.08);
            float topMoss = smoothstep(0.62, 0.90, wn.y + (mossS.a - 0.5) * 0.25) * 0.38;
            float totalMoss = clamp(max(baseBlend, topMoss), 0.0, 1.0);

            vec3 col = mix(rockCol, terrainMoss, totalMoss);
            col *= mix(0.78, 1.04, sampleCloudShadow(wp.xz));
            diffuseColor.rgb = col;

            vec3 rn = texture2D(uRockNorm, wp.xz * 0.85 + vec2(wp.y * 0.65)).xyz * 2.0 - 1.0;
            vec3 mn = texture2D(uMossNorm, wp.xz * 0.46).xyz * 2.0 - 1.0;
            vec3 stoneN = normalize(wn + vec3(rn.x, 0.0, rn.y) * 0.72);
            vec3 gndN = normalize(gUp + vec3(mn.x, 0.0, mn.y) * 1.40);
            sFinalNorm = normalize(mix(stoneN, gndN, baseBlend));
          }
          `
        )
        .replace(
          '#include <normal_fragment_maps>',
          /* glsl */`
          #include <normal_fragment_maps>
          normal = normalize((viewMatrix * vec4(sFinalNorm, 0.0)).xyz);
          `
        )
        .replace(
          '#include <dithering_fragment>',
          /* glsl */`
          gl_FragColor.rgb += sampleOdradekScan(vSWorldPos, sFinalNorm);
          gl_FragColor.rgb = applyIcelandAtmo(gl_FragColor.rgb, vSWorldPos);
          #include <dithering_fragment>
          `
        );
    };
    return mat;
  };

  const smallStoneMat = makeBlendedStoneMat('ls_small_stones_v5', 0.08, 0.86);
  const cobbleMat = makeBlendedStoneMat('ls_cobbles_v5', 0.16, 0.84);

  // Seamless Terrain-Blended Eldhraun Moss-Pillow Mound Material:
  // Exact terrain moss color + terrain-matched base normals so pillows flow organically out of the ground with ZERO seam!
  const cushionMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0.0
  });
  cushionMat.fog = false;
  cushionMat.customProgramCacheKey = () => 'ls_eldhraun_cushion_v3';
  cushionMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ATMO_UNIFORMS);
    shader.uniforms.uMossTex = { value: texLib.moss.map };
    shader.uniforms.uMossNorm = { value: texLib.moss.normalMap };
    shader.uniforms.uRockTex = { value: texLib.basaltCliff.map };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCWorldPos;\nvarying vec3 vCWorldNorm;\nvarying vec3 vCGroundUp;\nvarying float vCHeightAboveBase;')
      .replace(
        '#include <project_vertex>',
        /* glsl */`
        #include <project_vertex>
        {
          vec4 cwp = vec4(transformed, 1.0);
          vec3 cwn = objectNormal;
          vec3 instOrigin = vec3(0.0);
          vec3 instUp = vec3(0.0, 1.0, 0.0);
          #ifdef USE_INSTANCING
            cwp = instanceMatrix * cwp;
            cwn = mat3(instanceMatrix) * cwn;
            instOrigin = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            instUp = normalize(mat3(instanceMatrix) * vec3(0.0, 1.0, 0.0));
          #endif
          vec3 instOriginW = (modelMatrix * vec4(instOrigin, 1.0)).xyz;
          vec3 instUpW = normalize(mat3(modelMatrix) * instUp);
          cwp = modelMatrix * cwp;
          vCWorldPos = cwp.xyz;
          vCWorldNorm = normalize(mat3(modelMatrix) * cwn);
          vCGroundUp = instUpW;
          vCHeightAboveBase = dot(cwp.xyz - instOriginW, instUpW);
        }
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        uniform sampler2D uMossTex;
        uniform sampler2D uMossNorm;
        uniform sampler2D uRockTex;
        varying vec3 vCWorldPos;
        varying vec3 vCWorldNorm;
        varying vec3 vCGroundUp;
        varying float vCHeightAboveBase;
        ${ATMO_GLSL_PARS}
        ${TERRAIN_BLEND_GLSL}
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */`
        #include <color_fragment>
        vec3 cWorldN = normalize(vCWorldNorm);
        {
          vec3 wp = vCWorldPos;
          vec3 wn = normalize(vCWorldNorm);
          vec3 gUp = normalize(vCGroundUp);

          vec4 mossS;
          vec3 mossCol = evalTerrainMossColor(uMossTex, wp, gUp, mossS);

          // Blend lower skirt smoothly into terrain normal & color -> ZERO dark outline or pasted-on shadow seam!
          float baseBlend = 1.0 - smoothstep(-0.06, 0.34, vCHeightAboveBase + (mossS.a - 0.5) * 0.14);

          // Subtle weathered grey volcanic rock peeking ONLY on steep upper rock pockets (never a dark ring around the base!)
          vec4 rockS = texture2D(uRockTex, wp.xz * 0.58 + vec2(wp.y * 0.52));
          float upperMask = smoothstep(0.18, 0.44, vCHeightAboveBase);
          float lavaPeek = (1.0 - smoothstep(0.32, 0.64, wn.y + (mossS.a - 0.5) * 0.28)) * smoothstep(0.30, 0.74, rockS.a) * upperMask;
          vec3 lavaCol = rockS.rgb * vec3(0.76, 0.80, 0.84) * mix(0.50, 1.18, rockS.a);

          vec3 col = mix(mossCol, lavaCol, lavaPeek * 0.68);
          col *= mix(0.78, 1.04, sampleCloudShadow(wp.xz));

          vec3 mn = texture2D(uMossNorm, wp.xz * 0.46).xyz * 2.0 - 1.0;
          vec3 pillowN = normalize(wn + vec3(mn.x, 0.0, mn.y) * 1.25);
          vec3 groundN = normalize(gUp + vec3(mn.x, 0.0, mn.y) * 1.50);
          cWorldN = normalize(mix(pillowN, groundN, smoothstep(0.05, 0.95, baseBlend)));
          diffuseColor.rgb = col;
        }
        `
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */`
        #include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(cWorldN, 0.0)).xyz);
        `
      )
      .replace(
        '#include <dithering_fragment>',
        /* glsl */`
        gl_FragColor.rgb += sampleOdradekScan(vCWorldPos, cWorldN);
        gl_FragColor.rgb = applyIcelandAtmo(gl_FragColor.rgb, vCWorldPos);
        #include <dithering_fragment>
        `
      );
  };

  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  enhanceMaterialWithAtmo(grassMat, { cacheKey: 'ls_tussock_grass', windSway: 0.36, wetnessBoost: 0.16 });

  // Multi-Colored Lupin Material: uses `aPetalMask` so `instanceColor` tints ONLY flower petals while leaves stay green!
  const lupinMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  lupinMat.fog = false;
  lupinMat.customProgramCacheKey = () => 'ls_iceland_lupin_multi_v2';
  lupinMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ATMO_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        attribute float aPetalMask;
        varying vec3 vLsWorldPos;
        varying vec3 vLsWorldNorm;
        uniform float uTime;
        uniform vec2 uWindDir;
        uniform float uWindStrength;
        `
      )
      .replace(
        '#include <color_vertex>',
        /* glsl */`
        #include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
          // Override default whole-mesh instanceColor multiply: ONLY tint flower petals (aPetalMask > 0.5)!
          vColor.rgb = color.rgb * mix(vec3(1.0), instanceColor.rgb, aPetalMask);
        #endif
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */`
        #include <begin_vertex>
        {
          vec2 wOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
          float instSeed = position.x * 0.7 + position.z * 0.5;
          #ifdef USE_INSTANCING
            vec4 instCol = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            wOrigin = (modelMatrix * instCol).xz;
            instSeed += instCol.x * 0.37 + instCol.z * 0.41;
          #endif
          // Long-lasting directional wind gusts sweeping smoothly across lupin colonies + subtle flower-spike flutter
          float gustFront = 0.54 + 0.46 * sin(uTime * 0.46 - dot(wOrigin, uWindDir) * 0.042);
          float longSurge = 0.72 + 0.28 * sin(uTime * 0.21 - dot(wOrigin, uWindDir) * 0.016 + 1.4);
          float sustained = (0.30 + 0.44 * gustFront * longSurge) * uWindStrength;
          float flutter = sin(uTime * (1.9 + uWindStrength * 1.0) + instSeed) * (0.18 + 0.10 * gustFront);
          float bend = clamp(position.y, 0.0, 1.2) * 0.26 * (sustained + flutter);
          transformed.x += bend * uWindDir.x;
          transformed.z += bend * uWindDir.y;
          transformed.y -= abs(bend) * 0.12;
        }
        `
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */`
        #include <project_vertex>
        {
          vec4 lsWp = vec4(transformed, 1.0);
          vec3 lsWn = objectNormal;
          #ifdef USE_INSTANCING
            lsWp = instanceMatrix * lsWp;
            lsWn = mat3(instanceMatrix) * lsWn;
          #endif
          lsWp = modelMatrix * lsWp;
          vLsWorldPos = lsWp.xyz;
          vLsWorldNorm = normalize(mat3(modelMatrix) * lsWn);
        }
        `
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLsWorldPos;\nvarying vec3 vLsWorldNorm;\n${ATMO_GLSL_PARS}`)
      .replace(
        '#include <dithering_fragment>',
        /* glsl */`
        gl_FragColor.rgb += sampleOdradekScan(vLsWorldPos, normalize(vLsWorldNorm));
        gl_FragColor.rgb = applyIcelandAtmo(gl_FragColor.rgb, vLsWorldPos);
        #include <dithering_fragment>
        `
      );
  };

  const bushMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  enhanceMaterialWithAtmo(bushMat, { cacheKey: 'ls_iceland_bush', windSway: 0.14, wetnessBoost: 0.18 });

  const cottonMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  enhanceMaterialWithAtmo(cottonMat, { cacheKey: 'ls_cotton_grass', windSway: 0.42, wetnessBoost: 0.10 });

  // Reusable lightweight sculpted basalt crags, spires & Icelandic botanical geometries (100% smooth welded normals!)
  const boulderGeoA = createNaturalBasaltRockGeo(11, 2, 0.74);
  const boulderGeoB = createJaggedLavaCragGeo(37);
  const spireGeo = createVolcanicSpireGeo(83);
  const cobbleGeo = createFacetedCobbleGeo(67);
  const stoneClusterGeo = createSmallStoneClusterGeo();
  const cushionGeo = createMossCushionGeo();
  const grassGeo = createTussockGrassGeo();
  const lupinGeo = createLupinClusterGeo();
  const bushGeo = createIcelandicBushGeo();
  const cottonGeo = createCottonGrassGeo();

  // Authentic Icelandic Nootka Lupin Palette (rich royal violet-purple, indigo-blue, lavender-lilac & rare cream-white!)
  const LUPIN_PALETTE = [
    new THREE.Color().setHex(0x5234b8), // Deep Royal Icelandic Violet-Purple (dominant!)
    new THREE.Color().setHex(0x4658c8), // Periwinkle / Lupin Indigo-Blue
    new THREE.Color().setHex(0x6e4ed4), // Vivid Highland Lavender-Violet
    new THREE.Color().setHex(0x7c48b6), // Amethyst-Plum Violet
    new THREE.Color().setHex(0x8c70e2), // Pale Soft Lilac-Blue
    new THREE.Color().setHex(0xe8e4dc)  // Natural Creamy White morph
  ];

  // Natural Weathered Grey-Slate & Warm Taupe Icelandic Stone/Cobble Palette (harmonious, never stark black dots!)
  const STONE_PALETTE = [
    new THREE.Color().setHex(0x586066), // Weathered medium slate
    new THREE.Color().setHex(0x6e757b), // Cool grey weathered river stone
    new THREE.Color().setHex(0x848a8c), // Pale lichen-dusted grey cobble
    new THREE.Color().setHex(0x786f62), // Warm weathered volcanic sandstone-taupe
    new THREE.Color().setHex(0x626e56)  // Mossy grey-olive fieldstone
  ];

  // Far horizon continuous ring mesh
  const farGeo = createFarHorizonRingGeo();
  const farMesh = new THREE.Mesh(farGeo, terrainMat);
  farMesh.frustumCulled = false;
  farMesh.receiveShadow = true;
  root.add(farMesh);

  let lastFarCenterX = 1e9;
  let lastFarCenterZ = 1e9;
  function updateFarRing(px, pz) {
    const sx = Math.round(px / CHUNK_SIZE) * CHUNK_SIZE;
    const sz = Math.round(pz / CHUNK_SIZE) * CHUNK_SIZE;
    if (sx === lastFarCenterX && sz === lastFarCenterZ) return;
    lastFarCenterX = sx;
    lastFarCenterZ = sz;
    farMesh.position.set(sx, 0, sz);

    const pos = farGeo.attributes.position;
    const norm = farGeo.attributes.normal;
    const surf = farGeo.attributes.aSurf;
    const hydro = farGeo.attributes.aHydro;
    const cave = farGeo.attributes.aCave;
    const tmpSample = {
      height: 0, moss: 0, cliff: 0, path: 0, scree: 0,
      riverDepth: 0, riverMask: 0, flowX: 0, flowZ: 1, snow: 0, glacier: 0, wetness: 0, hummockAO: 0.5,
      caveSignedD: 99, caveWaterY: 16, caveOverburden: 0
    };
    const tmpN = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = sx + lx;
      const wz = sz + lz;
      sampleWorld(wx, wz, tmpSample);
      getTerrainNormal(wx, wz, tmpN, 6.0);

      pos.setY(i, tmpSample.height - 2.0);
      norm.setXYZ(i, tmpN.x, tmpN.y, tmpN.z);
      surf.setXYZW(i, tmpSample.glacier || 0, tmpSample.cliff, tmpSample.path, tmpSample.scree);
      hydro.setXYZW(i, tmpSample.wetness, tmpSample.riverMask, tmpSample.hummockAO, tmpSample.snow);
      cave.setXYZ(i, tmpSample.caveSignedD, tmpSample.caveWaterY, tmpSample.caveOverburden);
    }
    pos.needsUpdate = true;
    norm.needsUpdate = true;
    surf.needsUpdate = true;
    hydro.needsUpdate = true;
    cave.needsUpdate = true;
  }

  const chunks = new Map();
  const dummy = new THREE.Object3D();
  const upVec = new THREE.Vector3(0, 1, 0);
  const slopeQ = new THREE.Quaternion();
  const yawQ = new THREE.Quaternion();
  const blendN = new THREE.Vector3();

  /** Align dummy transform smoothly to hillside surface normal so flared rock/moss bases hug slopes seamlessly! */
  const alignToSlope = (wx, wz, yaw, slopeFollow = 0.85) => {
    getTerrainNormal(wx, wz, blendN, 1.1);
    blendN.lerp(upVec, 1.0 - slopeFollow).normalize();
    slopeQ.setFromUnitVectors(upVec, blendN);
    yawQ.setFromAxisAngle(upVec, yaw);
    dummy.quaternion.copy(slopeQ).multiply(yawQ);
  };

  /** Build per-chunk boulders, cobbles, small volcanic stone clusters & lush Icelandic flora (now extending hero rock outcrops out to LOD2 / 720m!). */
  function populateChunkDetails(cx, cz, lod, group) {
    const disposables = [];
    const colliders = [];
    if (lod > 2) return { disposables, colliders };

    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const tmpSample = {
      height: 0, moss: 0, cliff: 0, path: 0, scree: 0,
      riverDepth: 0, riverMask: 0, flowX: 0, flowZ: 1, snow: 0, wetness: 0, hummockAO: 0.5
    };
    const norm = new THREE.Vector3();
    const tmpColor = new THREE.Color();

    const boulderMatsA = [];
    const boulderColorsA = [];
    const boulderMatsB = [];
    const boulderColorsB = [];
    const spireMats = [];
    const cobbleMats = [];
    const cobbleColors = [];
    const stoneMats = [];
    const stoneColors = [];
    const cushionMats = [];
    const grassMats = [];
    const lupinMats = [];
    const lupinColors = [];
    const bushMats = [];
    const cottonMats = [];

    const pickStoneColor = (seedA, seedB) => {
      const idx = Math.floor(hash2i(seedA, seedB, 937) * STONE_PALETTE.length) % STONE_PALETTE.length;
      const base = STONE_PALETTE[idx];
      const shade = 0.82 + hash2i(seedB, seedA, 947) * 0.34;
      return tmpColor.setRGB(base.r * shade, base.g * shade, base.b * shade).clone();
    };

    const cellX = Math.round(ox / CELL_SIZE);
    const cellZ = Math.round(oz / CELL_SIZE);
    const nearbyFeatures = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        nearbyFeatures.push(getCellFeatures(cellX + dx, cellZ + dz));
      }
    }

    const isInsideSettlementOrSpring = (wx, wz) => {
      for (let k = 0; k < nearbyFeatures.length; k++) {
        const f = nearbyFeatures[k];
        if (f.village && Math.hypot(wx - f.village.x, wz - f.village.z) < f.village.radius + 6) return true;
        for (let oi = 0; oi < f.outposts.length; oi++) {
          if (Math.hypot(wx - f.outposts[oi].x, wz - f.outposts[oi].z) < 26) return true;
        }
        for (let hi = 0; hi < f.hotSprings.length; hi++) {
          if (Math.hypot(wx - f.hotSprings[hi].x, wz - f.hotSprings[hi].z) < f.hotSprings[hi].radius + 4) return true;
        }
      }
      return false;
    };

    const isInsideBuildingFootprint = (wx, wz) => {
      for (let k = 0; k < nearbyFeatures.length; k++) {
        const f = nearbyFeatures[k];
        if (f.village) {
          for (let bi = 0; bi < f.village.buildings.length; bi++) {
            const b = f.village.buildings[bi];
            if (Math.hypot(wx - b.x, wz - b.z) < b.radius + 1.8) return true;
          }
        }
        for (let oi = 0; oi < f.outposts.length; oi++) {
          if (Math.hypot(wx - f.outposts[oi].x, wz - f.outposts[oi].z) < 22) return true;
        }
        for (let hi = 0; hi < f.hotSprings.length; hi++) {
          if (Math.hypot(wx - f.hotSprings[hi].x, wz - f.hotSprings[hi].z) < f.hotSprings[hi].radius + 1.5) return true;
        }
      }
      return false;
    };

    // 1. Waterfall plunge-pool dark basalt boulder tumble
    for (let k = 0; k < nearbyFeatures.length; k++) {
      const wf = nearbyFeatures[k].waterfall;
      if (!wf) continue;
      if (Math.abs(wf.plungeX - ox) > CHUNK_SIZE * 0.65 || Math.abs(wf.plungeZ - oz) > CHUNK_SIZE * 0.65) continue;
      const baseH = getTerrainHeight(wf.plungeX, wf.plungeZ);
      for (let i = 0; i < 40; i++) {
        const ang = hash2i(i, 910, 77) * Math.PI * 2;
        const rad = 5.0 + hash2i(i, 911, 77) * 26.0;
        const wx = wf.plungeX + Math.cos(ang) * rad;
        const wz = wf.plungeZ + Math.sin(ang) * rad;
        const lx = wx - ox;
        const lz = wz - oz;
        if (Math.abs(lx) > CHUNK_SIZE * 0.5 || Math.abs(lz) > CHUNK_SIZE * 0.5) continue;
        const by = getTerrainHeight(wx, wz);
        getTerrainNormal(wx, wz, norm, 1.2);
        if (norm.y < 0.62 || by > baseH + 11.0) continue;
        const s = 1.4 + hash2i(i, 912, 77) * 2.8;
        dummy.position.set(lx, by - s * 0.24, lz);
        alignToSlope(wx, wz, hash2i(i, 2, 9) * 6.28, 0.72);
        dummy.scale.set(s * 1.25, s * 0.76, s * 1.05);
        dummy.updateMatrix();
        // Plunge-pool boulders sit on wet dark scree -> mossAllow = 0.08 so they blend into grey scree, not green grass!
        const wetRockTag = new THREE.Color(0.08, 1.0, 1.0);
        if (i % 2 === 0) {
          boulderMatsA.push(dummy.matrix.clone());
          boulderColorsA.push(wetRockTag);
        } else {
          boulderMatsB.push(dummy.matrix.clone());
          boulderColorsB.push(wetRockTag);
        }
      }
    }

    // 2. Geologically Clustered Eldhraun Moss-Lava Fields, Basalt Rock Outcrops & Riverbank Shoals!
    // Cohesive sweeping lava-moss beds juxtapose densely piled mossy lava mounds & dark crags against open lupin/sedge meadows!
    const halfChunkRock = CHUNK_SIZE * 0.49;
    const outcropCenters = lod === 0 ? 78 : lod === 1 ? 34 : 16;
    for (let i = 0; i < outcropCenters; i++) {
      const cx0 = (hash2i(cx * 97 + i, cz * 53, 301) - 0.5) * CHUNK_SIZE;
      const cz0 = (hash2i(cx * 41, cz * 89 + i, 307) - 0.5) * CHUNK_SIZE;
      const wx0 = ox + cx0;
      const wz0 = oz + cz0;
      if (isInsideSettlementOrSpring(wx0, wz0)) continue;
      sampleWorld(wx0, wz0, tmpSample);
      if (Math.abs(tmpSample.caveSignedD) < 18.0 && tmpSample.caveOverburden > 6.0 && tmpSample.caveOverburden < 30.0) continue;
      if (tmpSample.path > 0.22) continue;
      getTerrainNormal(wx0, wz0, norm, 1.0);

      const slopeLimit = tmpSample.riverMask > 0.12 ? 0.62 : 0.74;
      if (norm.y < slopeLimit) continue;

      const rockField = fbm2(wx0 * 0.022 + 2.1, wz0 * 0.022 - 4.7, 2, 419);
      const hRand = hash2i(i, cx * 19 + cz * 31, 419);

      const inRiver = tmpSample.riverMask > 0.12 && hRand > 0.24;
      const inOutcrop = (tmpSample.scree > 0.26 && hRand > 0.30) || (rockField > 0.44 && hRand > 0.30);
      if (!inRiver && !inOutcrop) continue;

      // Rare dramatic volcanic crag pinnacle rising from lava plains / rocky ridges
      if (!inRiver && rockField > 0.62 && tmpSample.scree > 0.28 && tmpSample.cliff < 0.35 && hRand > 0.94 && spireMats.length < 2) {
        const spSc = 3.2 + hash2i(i, 59, 509) * 4.4;
        dummy.position.set(cx0, tmpSample.height - 0.65, cz0);
        dummy.rotation.set((hash2i(i, 61, 509) - 0.5) * 0.12, hash2i(i, 63, 509) * 6.28, (hash2i(i, 65, 509) - 0.5) * 0.12);
        dummy.scale.set(spSc * 1.08, spSc * 1.15, spSc * 0.96);
        dummy.updateMatrix();
        spireMats.push(dummy.matrix.clone());
        colliders.push({ x: wx0, z: wz0, r: spSc * 0.92 });
      }

      // Elongated geological outcrop orientation (lava flows & fractures along natural strike lines!)
      const strikeYaw = hash2i(i, cx * 13 + cz * 29, 501) * Math.PI * 2;
      const sCos = Math.cos(strikeYaw);
      const sSin = Math.sin(strikeYaw);
      const stretch = 1.25 + hash2i(i, 5, 503) * 0.85;

      // Cluster 3..7 craggy mossy lava boulders tightly per outcrop
      const bCount = lod === 0
        ? (inRiver ? (3 + Math.floor(hash2i(i, 7, 505) * 3)) : (3 + Math.floor(hash2i(i, 7, 505) * 5)))
        : (lod === 1 ? 2 : 1);

      for (let b = 0; b < bCount; b++) {
        const ang = hash2i(i * 11 + b, cx * 7 + cz * 13, 511) * Math.PI * 2;
        const rFrac = b === 0 ? 0.0 : (0.24 + Math.pow(hash2i(b * 17 + i, cz * 9 + cx, 513), 0.82) * 0.76);
        const rad = rFrac * (inRiver ? 5.2 : 7.8);
        const ux = Math.cos(ang) * rad * stretch;
        const uz = Math.sin(ang) * rad;
        const lx = cx0 + ux * sCos - uz * sSin;
        const lz = cz0 + ux * sSin + uz * sCos;
        if (Math.abs(lx) > halfChunkRock || Math.abs(lz) > halfChunkRock) continue;

        const wx = ox + lx;
        const wz = oz + lz;
        if (b > 0) {
          if (isInsideSettlementOrSpring(wx, wz)) continue;
          sampleWorld(wx, wz, tmpSample);
          if (tmpSample.path > 0.24) continue;
          if (Math.abs(tmpSample.caveSignedD) < 17.0 && tmpSample.caveOverburden > 6.0 && tmpSample.caveOverburden < 28.0) continue;
        }

        const isCrag = !inRiver && hash2i(i + b * 3, 29, 503) > 0.30;
        const coreScale = b === 0 ? 1.12 : mix(0.88, 0.42, rFrac);
        const baseSc = inRiver
          ? (0.58 + hash2i(i + b * 5, 31, 503) * 1.25)
          : (isCrag ? (0.72 + hash2i(i + b * 5, 31, 503) * 1.65) : (0.58 + hash2i(i + b * 5, 31, 503) * 1.25));
        const sc = baseSc * coreScale;

        dummy.position.set(lx, tmpSample.height + (inRiver ? sc * 0.02 : -sc * 0.24), lz);
        alignToSlope(wx, wz, hash2i(i + b, 33, 503) * 6.28, 0.78);
        dummy.scale.set(sc * 1.24, sc * (isCrag ? 0.80 : 0.62), sc * 1.08);
        dummy.updateMatrix();
        const mossAllow = inRiver ? 0.05 : clamp(1.0 - smoothstep(0.32, 0.76, tmpSample.scree), 0.08, 1.0);
        const rockTag = new THREE.Color(mossAllow, 1.0, 1.0);
        if (isCrag) {
          boulderMatsB.push(dummy.matrix.clone());
          boulderColorsB.push(rockTag);
        } else {
          boulderMatsA.push(dummy.matrix.clone());
          boulderColorsA.push(rockTag);
        }
        if (sc > 1.25) colliders.push({ x: wx, z: wz, r: sc * 0.82 });
      }

      // Surround every Eldhraun lava outcrop with smooth, slope-hugging mossy pillow mounds!
      if (!inRiver && lod <= 1) {
        const maxCushions = lod === 0 ? 190 : 48;
        const cushCount = lod === 0 ? (3 + Math.floor(hash2i(i, cx * 31 + cz, 541) * 4)) : 2;
        for (let k = 0; k < cushCount && cushionMats.length < maxCushions; k++) {
          const cAng = hash2i(i * 19 + k, cz * 13 + cx, 543) * Math.PI * 2;
          const cDist = 1.0 + Math.pow(hash2i(k * 11, i * 5, 547), 0.74) * 10.6;
          const ux = Math.cos(cAng) * cDist * stretch;
          const uz = Math.sin(cAng) * cDist;
          const clx = cx0 + ux * sCos - uz * sSin;
          const clz = cz0 + ux * sSin + uz * sCos;
          if (Math.abs(clx) > halfChunkRock || Math.abs(clz) > halfChunkRock) continue;
          const cwx = ox + clx;
          const cwz = oz + clz;
          if (isInsideSettlementOrSpring(cwx, cwz)) continue;
          sampleWorld(cwx, cwz, tmpSample);
          if (tmpSample.path > 0.24 || tmpSample.riverMask > 0.14 || tmpSample.cliff > 0.42 || tmpSample.snow > 0.18) continue;
          const csc = (0.80 + hash2i(i + k, 73, 557) * 0.92) * mix(1.16, 0.72, cDist / 11.6);
          dummy.position.set(clx, tmpSample.height - csc * 0.10, clz);
          alignToSlope(cwx, cwz, hash2i(i, k, 563) * 6.28, 0.96);
          dummy.scale.set(csc * 1.28, csc * (0.72 + hash2i(i + k, 79, 557) * 0.42), csc * 1.14);
          dummy.updateMatrix();
          cushionMats.push(dummy.matrix.clone());
        }
      }

      // Natural frost-heaved talus apron of smooth terrain-blended cobbles & pebbles spilling around every LOD0 outcrop!
      if (lod === 0) {
        const satCobbles = 5 + Math.floor(hash2i(i, cx + cz * 7, 561) * 5);
        for (let k = 0; k < satCobbles && cobbleMats.length < 340; k++) {
          const ang = hash2i(i * 13 + k, cx * 7 + cz, 563) * Math.PI * 2;
          const dist = 1.4 + Math.pow(hash2i(k * 7, i * 3, 569), 0.78) * 7.2;
          const ux = Math.cos(ang) * dist * stretch;
          const uz = Math.sin(ang) * dist;
          const slx = cx0 + ux * sCos - uz * sSin;
          const slz = cz0 + ux * sSin + uz * sCos;
          if (Math.abs(slx) > halfChunkRock || Math.abs(slz) > halfChunkRock) continue;
          const swx = ox + slx;
          const swz = oz + slz;
          if (isInsideBuildingFootprint(swx, swz)) continue;
          const sh = getTerrainHeight(swx, swz);
          const csc = (0.22 + hash2i(i + k, 71, 577) * 0.38) * mix(1.12, 0.72, dist / 8.6);
          dummy.position.set(slx, sh - csc * 0.22, slz);
          alignToSlope(swx, swz, hash2i(i, k, 593) * 6.28, 0.90);
          dummy.scale.set(csc * 1.32, csc * 0.64, csc * 1.06);
          dummy.updateMatrix();
          cobbleMats.push(dummy.matrix.clone());
          cobbleColors.push(pickStoneColor(i * 11 + k, cx * 17 + cz));
        }

        const satStones = 4 + Math.floor(hash2i(i, cz + cx * 11, 603) * 4);
        for (let k = 0; k < satStones && stoneMats.length < 360; k++) {
          const pang = hash2i(i * 7 + k, cx + 19, 601) * Math.PI * 2;
          const pdist = 1.6 + Math.pow(hash2i(k * 5, i * 11, 605), 0.75) * 7.8;
          const plx = cx0 + Math.cos(pang) * pdist;
          const plz = cz0 + Math.sin(pang) * pdist;
          if (Math.abs(plx) > halfChunkRock || Math.abs(plz) > halfChunkRock) continue;
          const pwx = ox + plx;
          const pwz = oz + plz;
          if (isInsideBuildingFootprint(pwx, pwz)) continue;
          const ph = getTerrainHeight(pwx, pwz);
          const ps = 0.84 + hash2i(i + k, 83, 607) * 0.88;
          dummy.position.set(plx, ph - 0.02, plz);
          alignToSlope(pwx, pwz, hash2i(i + k, 87, 607) * 6.28, 0.96);
          dummy.scale.set(ps, ps * 0.86, ps);
          dummy.updateMatrix();
          stoneMats.push(dummy.matrix.clone());
          stoneColors.push(pickStoneColor(i * 13 + k, cz * 29 + cx));
        }
      }
    }

    // 3. Clustered Stony Gravel Pockets, Eroded Scree Patches & Mossy Cushion Groups (LOD0 — cohesive patches, not uniform scatter!)
    if (lod === 0) {
      const stonePockets = 46;
      for (let i = 0; i < stonePockets; i++) {
        const cx0 = (hash2i(cx * 151 + i, cz * 67, 457) - 0.5) * CHUNK_SIZE;
        const cz0 = (hash2i(cx * 73, cz * 139 + i, 463) - 0.5) * CHUNK_SIZE;
        const wx0 = ox + cx0;
        const wz0 = oz + cz0;
        if (isInsideBuildingFootprint(wx0, wz0)) continue;
        sampleWorld(wx0, wz0, tmpSample);
        if (tmpSample.cliff > 0.56) continue;

        const rC = hash2i(i, cx * 37 + cz * 13, 479);
        const nearFeature = tmpSample.scree > 0.16 || tmpSample.riverMask > 0.06 || tmpSample.path > 0.08;
        if (!nearFeature && rC > 0.42) continue;

        const pRad = nearFeature ? (2.2 + hash2i(i, 11, 481) * 3.4) : (1.5 + hash2i(i, 11, 481) * 2.2);
        const cCount = 3 + Math.floor(hash2i(i, 13, 483) * 5);
        for (let k = 0; k < cCount && cobbleMats.length < 340; k++) {
          const ang = hash2i(i * 17 + k, cx * 19 + cz, 485) * Math.PI * 2;
          const rFrac = k === 0 ? 0.0 : Math.pow(hash2i(k * 9 + i, cz * 13 + cx, 487), 0.72);
          const lx = cx0 + Math.cos(ang) * rFrac * pRad;
          const lz = cz0 + Math.sin(ang) * rFrac * pRad;
          if (Math.abs(lx) > halfChunkRock || Math.abs(lz) > halfChunkRock) continue;
          const wx = ox + lx;
          const wz = oz + lz;
          if (isInsideBuildingFootprint(wx, wz)) continue;
          const hy = k === 0 ? tmpSample.height : getTerrainHeight(wx, wz);
          const sc = (0.20 + hash2i(i + k, 19, 487) * 0.34) * mix(1.12, 0.72, rFrac);
          dummy.position.set(lx, hy - sc * 0.22, lz);
          alignToSlope(wx, wz, hash2i(i + k, 22, 487) * 6.28, 0.90);
          dummy.scale.set(sc * 1.34, sc * 0.62, sc * 1.06);
          dummy.updateMatrix();
          cobbleMats.push(dummy.matrix.clone());
          cobbleColors.push(pickStoneColor(i + k + cx * 31, cz * 43 + i));
        }

        const sCount = 4 + Math.floor(hash2i(i, 27, 521) * 5);
        for (let k = 0; k < sCount && stoneMats.length < 360; k++) {
          const ang = hash2i(i * 19 + k, cx * 23 + cz, 523) * Math.PI * 2;
          const rFrac = Math.pow(hash2i(k * 11 + i, cz * 17 + cx, 527), 0.75);
          const lx = cx0 + Math.cos(ang) * rFrac * (pRad * 1.25);
          const lz = cz0 + Math.sin(ang) * rFrac * (pRad * 1.25);
          if (Math.abs(lx) > halfChunkRock || Math.abs(lz) > halfChunkRock) continue;
          const wx = ox + lx;
          const wz = oz + lz;
          if (isInsideBuildingFootprint(wx, wz)) continue;
          const hy = getTerrainHeight(wx, wz);
          const s = (nearFeature ? 0.88 : 0.74) + hash2i(i + k, 41, 547) * 0.90;
          dummy.position.set(lx, hy - 0.02, lz);
          alignToSlope(wx, wz, hash2i(i + k, 42, 547) * 6.28, 0.96);
          dummy.scale.set(s, s * 0.86, s);
          dummy.updateMatrix();
          stoneMats.push(dummy.matrix.clone());
          stoneColors.push(pickStoneColor((i + k) * 3 + cx * 19, cz * 37 + i));
        }
      }
    }

    // 4. Ecologically Clustered Icelandic Flora: Lupin Flower Colonies, Heather Thickets, Meadow Grass Swales & Cotton Grass Clumps
    const halfChunk = CHUNK_SIZE * 0.49;

    // 4a) Lush Sweeping Icelandic Nootka Lupin Flower Colonies (dense drifts of 6..12 rich violet-blue spires!)
    const lupinCenters = lod === 0 ? 96 : lod === 1 ? 26 : 0;
    const maxLupins = lod === 0 ? 440 : 80;
    for (let i = 0; i < lupinCenters && lupinMats.length < maxLupins; i++) {
      const cx0 = (hash2i(cx * 131 + i, cz * 79, 613) - 0.5) * CHUNK_SIZE;
      const cz0 = (hash2i(cx * 61, cz * 113 + i, 619) - 0.5) * CHUNK_SIZE;
      const wx0 = ox + cx0;
      const wz0 = oz + cz0;
      if (isInsideBuildingFootprint(wx0, wz0)) continue;

      sampleWorld(wx0, wz0, tmpSample);
      if (tmpSample.moss < 0.20 || tmpSample.height > 78 || tmpSample.path > 0.28 || tmpSample.riverMask > 0.20 || tmpSample.cliff > 0.40 || tmpSample.snow > 0.18 || tmpSample.glacier > 0.10) continue;
      getTerrainNormal(wx0, wz0, norm, 0.9);
      if (norm.y < 0.70) continue;

      const lupinField = fbm2(wx0 * 0.020 + 3.4, wz0 * 0.020 - 7.1, 2, 647);
      if (lupinField < 0.36) continue;

      // Dominant colony hue + organic elliptical drift orientation so beds sweep dramatically across foreground meadows!
      const hueField = fbm2(wx0 * 0.036 - 11.3, wz0 * 0.036 + 6.8, 2, 709);
      const driftYaw = hash2i(i, cx * 17 + cz * 29, 681) * Math.PI * 2;
      const driftCos = Math.cos(driftYaw);
      const driftSin = Math.sin(driftYaw);
      const stretch = 1.25 + hash2i(i, 7, 683) * 0.75;
      const clusterRadius = 2.0 + smoothstep(0.36, 0.74, lupinField) * 3.0;
      const count = lod === 0
        ? (7 + Math.floor(hash2i(i, cx + cz * 13, 687) * 6) + (lupinField > 0.54 ? 3 : 0))
        : (3 + Math.floor(hash2i(i, cx + cz * 13, 687) * 3));

      for (let c = 0; c < count && lupinMats.length < maxLupins; c++) {
        const ang = hash2i(i * 19 + c, cz * 11 + cx, 689) * Math.PI * 2;
        const rFrac = Math.pow(hash2i(c * 23 + i, cx * 7 + cz, 691), 0.72);
        const r = c === 0 ? 0.0 : rFrac * clusterRadius;
        const ux = Math.cos(ang) * r * stretch;
        const uz = Math.sin(ang) * r;
        const lxC = cx0 + ux * driftCos - uz * driftSin;
        const lzC = cz0 + ux * driftSin + uz * driftCos;
        if (Math.abs(lxC) > halfChunk || Math.abs(lzC) > halfChunk) continue;

        const wxC = ox + lxC;
        const wzC = oz + lzC;
        if (c > 0) {
          if (isInsideBuildingFootprint(wxC, wzC)) continue;
          sampleWorld(wxC, wzC, tmpSample);
          if (tmpSample.path > 0.30 || tmpSample.riverMask > 0.22 || tmpSample.cliff > 0.44 || tmpSample.snow > 0.20) continue;
        }

        // Tall, lush full blooms in colony core -> smaller buds around feathered rim
        const coreBoost = mix(1.24, 0.76, rFrac);
        const s = (0.86 + hash2i(i + c * 13, 61, 683) * 0.56) * coreBoost;
        dummy.position.set(lxC, tmpSample.height - 0.06, lzC);
        dummy.rotation.set(
          (hash2i(i + c, 62, 683) - 0.5) * 0.14,
          hash2i(i + c, 63, 683) * 6.28,
          (hash2i(i + c, 64, 683) - 0.5) * 0.14
        );
        dummy.scale.set(s * 1.08, s * (0.94 + hash2i(i + c, 65, 683) * 0.34), s * 1.08);
        dummy.updateMatrix();
        lupinMats.push(dummy.matrix.clone());

        // Authentic Icelandic lupin palette: predominantly rich violet-purple, indigo-blue & lavender + rare cream-white
        const rCol = hash2i(i + c * 7, cx * 13 + cz * 17, 719);
        const jitteredHue = clamp(hueField + (rCol - 0.5) * 0.20, 0.0, 1.0);
        let palIdx;
        if (rCol > 0.93) palIdx = 5;
        else if (jitteredHue < 0.42) palIdx = 0;
        else if (jitteredHue < 0.62) palIdx = 1;
        else if (jitteredHue < 0.78) palIdx = 2;
        else if (jitteredHue < 0.90) palIdx = 3;
        else palIdx = 4;

        const baseC = LUPIN_PALETTE[palIdx];
        const shade = 0.84 + hash2i(i + c, 99, 727) * 0.32;
        tmpColor.setRGB(baseC.r * shade, baseC.g * shade, baseC.b * shade);
        lupinColors.push(tmpColor.clone());
      }
    }

    // 4b) Clustered Silvery-Sage Icelandic Dwarf Willow & Crowberry Thickets (natural companion shrubs beside lupins & rocks!)
    const bushCenters = lod === 0 ? 86 : lod === 1 ? 22 : 0;
    const maxBushes = lod === 0 ? 280 : 54;
    for (let i = 0; i < bushCenters && bushMats.length < maxBushes; i++) {
      const cx0 = (hash2i(cx * 149 + i, cz * 83, 653) - 0.5) * CHUNK_SIZE;
      const cz0 = (hash2i(cx * 71, cz * 127 + i, 659) - 0.5) * CHUNK_SIZE;
      const wx0 = ox + cx0;
      const wz0 = oz + cz0;
      if (isInsideBuildingFootprint(wx0, wz0)) continue;

      sampleWorld(wx0, wz0, tmpSample);
      if (tmpSample.moss < 0.20 || tmpSample.path > 0.30 || tmpSample.riverMask > 0.22 || tmpSample.cliff > 0.44 || tmpSample.snow > 0.20 || tmpSample.glacier > 0.12) continue;
      getTerrainNormal(wx0, wz0, norm, 0.9);
      if (norm.y < 0.68) continue;

      const bushField = fbm2(wx0 * 0.030 - 5.2, wz0 * 0.030 + 2.9, 2, 659);
      if (bushField < 0.38) continue;

      const thicketRad = 1.45 + smoothstep(0.38, 0.76, bushField) * 2.15;
      const count = lod === 0 ? (3 + Math.floor(hash2i(i, cx * 19 + cz * 7, 661) * 5)) : 2;

      for (let c = 0; c < count && bushMats.length < maxBushes; c++) {
        const ang = hash2i(i * 13 + c, cx * 23 + cz, 663) * Math.PI * 2;
        const rFrac = c === 0 ? 0.0 : Math.pow(hash2i(c * 17 + i, cz * 19 + cx, 667), 0.72);
        const r = rFrac * thicketRad;
        const lxC = cx0 + Math.cos(ang) * r;
        const lzC = cz0 + Math.sin(ang) * r;
        if (Math.abs(lxC) > halfChunk || Math.abs(lzC) > halfChunk) continue;

        const wxC = ox + lxC;
        const wzC = oz + lzC;
        if (c > 0) {
          if (isInsideBuildingFootprint(wxC, wzC)) continue;
          sampleWorld(wxC, wzC, tmpSample);
          if (tmpSample.path > 0.32 || tmpSample.riverMask > 0.22 || tmpSample.cliff > 0.45 || tmpSample.snow > 0.20) continue;
        }

        const coreScale = c === 0 ? 1.22 : mix(1.04, 0.70, rFrac);
        const s = (0.82 + hash2i(i + c * 11, 51, 661) * 0.64) * coreScale;
        dummy.position.set(lxC, tmpSample.height - 0.05, lzC);
        dummy.rotation.set(0, hash2i(i + c, 52, 661) * 6.28, 0);
        dummy.scale.set(s * 1.32, s * 0.92, s * 1.32);
        dummy.updateMatrix();
        bushMats.push(dummy.matrix.clone());

        if (lod === 0 && c === 1 && grassMats.length < 780) {
          const gAng = ang + 1.1;
          const glx = lxC + Math.cos(gAng) * 0.95;
          const glz = lzC + Math.sin(gAng) * 0.95;
          if (Math.abs(glx) <= halfChunk && Math.abs(glz) <= halfChunk) {
            const gh = getTerrainHeight(ox + glx, oz + glz);
            const gs = 0.92 + hash2i(i, 47, 677) * 0.48;
            dummy.position.set(glx, gh - 0.02, glz);
            dummy.rotation.set(0, hash2i(i, 48, 677) * 6.28, 0);
            dummy.scale.set(gs * 1.18, gs, gs * 1.18);
            dummy.updateMatrix();
            grassMats.push(dummy.matrix.clone());
          }
        }
      }
    }

    if (lod === 0) {
      // 4c) Dense Sparkling White Arctic Cotton Grass Carpets (Eriophorum grouped in damp marsh hollows & meadow swales!)
      const cottonCenters = 68;
      const maxCotton = 320;
      for (let i = 0; i < cottonCenters && cottonMats.length < maxCotton; i++) {
        const cx0 = (hash2i(cx * 167 + i, cz * 97, 701) - 0.5) * CHUNK_SIZE;
        const cz0 = (hash2i(cx * 89, cz * 151 + i, 703) - 0.5) * CHUNK_SIZE;
        const wx0 = ox + cx0;
        const wz0 = oz + cz0;
        if (isInsideBuildingFootprint(wx0, wz0)) continue;
        sampleWorld(wx0, wz0, tmpSample);
        if (tmpSample.path > 0.28 || tmpSample.riverMask > 0.24 || tmpSample.cliff > 0.42 || tmpSample.snow > 0.18 || tmpSample.height > 54) continue;
        getTerrainNormal(wx0, wz0, norm, 0.9);
        if (norm.y < 0.82) continue;
        const wetSpot = tmpSample.wetness > 0.12 || tmpSample.riverMask > 0.02 || fbm2(wx0 * 0.036, wz0 * 0.036, 2, 707) > 0.46;
        if (!wetSpot) continue;

        const cCount = 5 + Math.floor(hash2i(i, cx * 7 + cz, 709) * 6);
        for (let c = 0; c < cCount && cottonMats.length < maxCotton; c++) {
          const ang = hash2i(i * 9 + c, cx + cz * 17, 711) * Math.PI * 2;
          const r = c === 0 ? 0.0 : (0.35 + Math.pow(hash2i(c, i * 11, 713), 0.72) * 3.2);
          const lxC = cx0 + Math.cos(ang) * r;
          const lzC = cz0 + Math.sin(ang) * r;
          if (Math.abs(lxC) > halfChunk || Math.abs(lzC) > halfChunk) continue;
          const hy = c === 0 ? tmpSample.height : getTerrainHeight(ox + lxC, oz + lzC);
          const s = 0.88 + hash2i(i + c, 71, 709) * 0.54;
          dummy.position.set(lxC, hy - 0.03, lzC);
          dummy.rotation.set(0, hash2i(i + c, 72, 709) * 6.28, 0);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          cottonMats.push(dummy.matrix.clone());
        }
      }

      // 4d) Clustered Sunlit Wild Meadow Grass Swards & Swales (organic overlapping grass drifts + clean mossy pillow clearings!)
      const grassClusters = 240;
      const maxGrass = 880;
      for (let i = 0; i < grassClusters && grassMats.length < maxGrass; i++) {
        const cx0 = (hash2i(cx * 173 + i, cz * 103, 671) - 0.5) * CHUNK_SIZE;
        const cz0 = (hash2i(cx * 97, cz * 157 + i, 673) - 0.5) * CHUNK_SIZE;
        const wx0 = ox + cx0;
        const wz0 = oz + cz0;
        if (isInsideBuildingFootprint(wx0, wz0)) continue;

        sampleWorld(wx0, wz0, tmpSample);
        if (tmpSample.moss < 0.16 || tmpSample.path > 0.32 || tmpSample.riverMask > 0.22 || tmpSample.cliff > 0.44 || tmpSample.snow > 0.20 || tmpSample.glacier > 0.12) continue;
        getTerrainNormal(wx0, wz0, norm, 0.8);
        if (norm.y < 0.68) continue;

        const grassField = fbm2(wx0 * 0.038 + 8.1, wz0 * 0.038 + 1.4, 2, 673);
        const rG = hash2i(i, cx * 29 + cz * 37, 675);
        // Distinct lush grass drifts in fertile swales (grassField > 0.38) + occasional light scattered tuft in mossy clearings!
        const isLushDrift = grassField > 0.38;
        if (!isLushDrift && rG > 0.20) continue;

        const driftYaw = hash2i(i, cz * 13 + cx, 677) * Math.PI * 2;
        const dCos = Math.cos(driftYaw);
        const dSin = Math.sin(driftYaw);
        const dStretch = 1.15 + hash2i(i, 17, 679) * 0.60;
        const driftRad = isLushDrift ? (1.45 + smoothstep(0.38, 0.74, grassField) * 2.15) : 0.9;
        const count = isLushDrift ? (4 + Math.floor(hash2i(i, cx * 11 + cz * 19, 681) * 4)) : 1;

        for (let c = 0; c < count && grassMats.length < maxGrass; c++) {
          const ang = hash2i(i * 17 + c, cx * 31 + cz, 683) * Math.PI * 2;
          const rFrac = c === 0 ? 0.0 : Math.pow(hash2i(c * 13 + i, cz * 23 + cx, 685), 0.74);
          const r = rFrac * driftRad;
          const ux = Math.cos(ang) * r * dStretch;
          const uz = Math.sin(ang) * r;
          const lxC = cx0 + ux * dCos - uz * dSin;
          const lzC = cz0 + ux * dSin + uz * dCos;
          if (Math.abs(lxC) > halfChunk || Math.abs(lzC) > halfChunk) continue;

          const wxC = ox + lxC;
          const wzC = oz + lzC;
          if (c > 0) {
            if (isInsideBuildingFootprint(wxC, wzC)) continue;
            sampleWorld(wxC, wzC, tmpSample);
            if (tmpSample.path > 0.34 || tmpSample.riverMask > 0.24 || tmpSample.cliff > 0.45 || tmpSample.snow > 0.22) continue;
          }

          // Fuller, taller grass in drift core -> softer shorter tufts at cluster edge
          const coreBoost = mix(1.14, 0.76, rFrac);
          const s = (0.86 + hash2i(i + c * 9, 45, 677) * 0.58) * coreBoost;
          dummy.position.set(lxC, tmpSample.height - 0.02, lzC);
          dummy.rotation.set(0, hash2i(i + c, 46, 677) * 6.28, 0);
          dummy.scale.set(s * 1.24, s, s * 1.24);
          dummy.updateMatrix();
          grassMats.push(dummy.matrix.clone());
        }
      }
    }

    const addInstanced = (geo, mat, mats, castShadow, colorsArr = null) => {
      if (mats.length === 0) return;
      const im = new THREE.InstancedMesh(geo, mat, mats.length);
      for (let i = 0; i < mats.length; i++) {
        im.setMatrixAt(i, mats[i]);
        if (colorsArr) im.setColorAt(i, colorsArr[i]);
      }
      im.instanceMatrix.needsUpdate = true;
      if (colorsArr && im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.frustumCulled = true;
      im.castShadow = castShadow;
      im.receiveShadow = true;
      group.add(im);
      disposables.push(im);
    };

    // Only main boulders & crag spires cast directional shadows (saves millions of shadow-map triangles!)
    addInstanced(boulderGeoA, boulderMat, boulderMatsA, true, boulderColorsA);
    addInstanced(boulderGeoB, boulderMat, boulderMatsB, true, boulderColorsB);
    addInstanced(spireGeo, boulderMat, spireMats, true);
    addInstanced(cobbleGeo, cobbleMat, cobbleMats, false, cobbleColors);
    addInstanced(stoneClusterGeo, smallStoneMat, stoneMats, false, stoneColors);
    addInstanced(cushionGeo, cushionMat, cushionMats, false);
    addInstanced(grassGeo, grassMat, grassMats, false);
    addInstanced(lupinGeo, lupinMat, lupinMats, false, lupinColors);
    addInstanced(bushGeo, bushMat, bushMats, false);
    addInstanced(cottonGeo, cottonMat, cottonMats, false);

    return { disposables, colliders };
  }

  function createChunk(cx, cz, lod) {
    const segs = LOD_SEGS[lod];
    const geo = buildChunkGeometry(cx, cz, segs);
    const mesh = new THREE.Mesh(geo, terrainMat);
    // Terrain receives shadows from porter, villages & boulders without re-rendering 121 terrain meshes into shadow map!
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    const group = new THREE.Group();
    group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    group.add(mesh);

    const { disposables, colliders } = populateChunkDetails(cx, cz, lod, group);
    root.add(group);

    return {
      key: `${cx},${cz}`,
      cx,
      cz,
      lod,
      group,
      mesh,
      geo,
      disposables,
      colliders
    };
  }

  function disposeChunk(chunk) {
    root.remove(chunk.group);
    chunk.geo.dispose();
    for (const d of chunk.disposables) {
      if (d.dispose) d.dispose();
    }
  }

  function rebuildAll(centerX, centerZ) {
    for (const c of chunks.values()) disposeChunk(c);
    chunks.clear();
    lastFarCenterX = 1e9;
    lastFarCenterZ = 1e9;
    update(centerX, centerZ, true);
  }

  function update(centerX, centerZ, syncAll = false) {
    const pcx = Math.round(centerX / CHUNK_SIZE);
    const pcz = Math.round(centerZ / CHUNK_SIZE);

    updateFarRing(centerX, centerZ);

    const needed = new Map();
    for (let dz = -GRID_RADIUS; dz <= GRID_RADIUS; dz++) {
      for (let dx = -GRID_RADIUS; dx <= GRID_RADIUS; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        needed.set(`${cx},${cz}`, { cx, cz, lod: getLodForRing(ring), ring });
      }
    }

    for (const [key, chunk] of chunks.entries()) {
      if (!needed.has(key)) {
        disposeChunk(chunk);
        chunks.delete(key);
      }
    }

    const queue = [];
    for (const [key, spec] of needed.entries()) {
      const existing = chunks.get(key);
      if (!existing || existing.lod !== spec.lod) {
        queue.push({ key, spec, existing });
      }
    }
    queue.sort((a, b) => a.spec.ring - b.spec.ring);

    const budget = syncAll ? queue.length : MAX_BUILDS_PER_FRAME;
    for (let i = 0; i < Math.min(budget, queue.length); i++) {
      const { key, spec, existing } = queue[i];
      if (existing) disposeChunk(existing);
      chunks.set(key, createChunk(spec.cx, spec.cz, spec.lod));
    }
  }

  function getCollidersNear(x, z, radius = 6) {
    const pcx = Math.round(x / CHUNK_SIZE);
    const pcz = Math.round(z / CHUNK_SIZE);
    const out = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = chunks.get(`${pcx + dx},${pcz + dz}`);
        if (!c) continue;
        for (const col of c.colliders) {
          if (Math.hypot(col.x - x, col.z - z) < radius + col.r) {
            out.push(col);
          }
        }
      }
    }
    return out;
  }

  return {
    update,
    rebuildAll,
    getCollidersNear
  };
}
