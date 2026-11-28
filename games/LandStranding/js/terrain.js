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
const SKIRT_DROP = 18.0;
const IS_MOBILE_DEVICE = typeof window !== 'undefined' && (
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') ||
  (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches)
);
const GRID_RADIUS = 9; // 19x19 live chunks (1520m radius, overlaps farMesh innerR=1400 with zero gap)
const LOD_SEGS = IS_MOBILE_DEVICE ? [44, 28, 18, 12] : [48, 32, 20, 14];
const MAX_BUILDS_PER_FRAME = IS_MOBILE_DEVICE ? 4 : 6;

function getLodForRing(ringDist) {
  if (ringDist <= 1) return 0; // 0..240m
  if (ringDist <= 3) return 1; // 240..560m
  if (ringDist <= 6) return 2; // 560..1040m
  return 3;                    // 1040..1520m
}

function getDetailLodForRing(ringDist) {
  if (ringDist <= 1) return 0; // 0..240m: full foreground flora, grass, cobbles & boulders
  if (ringDist <= 2) return 1; // 240..400m: mid-range lupin colonies, bushes, cushions & outcrops
  if (ringDist <= 4) return 2; // 400..720m: hero basalt outcrops & volcanic spires
  return 3;                    // 720..1520m: pure terrain mesh
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
 * Build lush natural Icelandic meadow sedge grass carpet patch using crossed curved alpha-tested cards
 * mapped to `grassMap` (each card renders 14 overlapping blades & seed panicles -> 224+ blades per patch!).
 */
function createTussockGrassGeo() {
  const cards = 10;
  const pos = [];
  const norm = [];
  const uvs = [];
  const colors = [];
  const idx = [];
  let vBase = 0;

  for (let i = 0; i < cards; i++) {
    const ang = (i / cards) * Math.PI * 2 + hash2i(i, 11, 801) * 0.65;
    const rad = i < 3 ? (0.08 + i * 0.09) : (0.22 + Math.sqrt(hash2i(i, 13, 801)) * 0.72);
    const yaw = ang + (hash2i(i, 15, 801) - 0.5) * 1.4;
    const h = 0.24 + hash2i(i, 17, 801) * 0.16;
    const w = 0.28 + hash2i(i, 23, 801) * 0.16;
    const lean = 0.05 + hash2i(i, 19, 801) * 0.09;

    const cx = Math.cos(ang) * rad;
    const cz = Math.sin(ang) * rad;
    const tx = Math.cos(yaw);
    const tz = Math.sin(yaw);
    const lx = -tz;
    const lz = tx;

    const kind = hash2i(i, 29, 801);
    const baseCol = [0.28, 0.34, 0.22];
    const midCol = kind > 0.74 ? [0.64, 0.62, 0.34] : kind > 0.30 ? [0.46, 0.58, 0.26] : [0.38, 0.52, 0.25];
    const tipCol = kind > 0.74 ? [0.88, 0.84, 0.48] : kind > 0.30 ? [0.68, 0.78, 0.38] : [0.56, 0.70, 0.35];

    const p0x = cx, p0z = cz;
    const p1x = cx + lx * lean * 0.45, p1z = cz + lz * lean * 0.45;
    const p2x = cx + lx * lean * 1.10, p2z = cz + lz * lean * 1.10;

    // 2-segment curved card (6 verts, 4 tris)
    pos.push(
      p0x - tx * w, 0.0,      p0z - tz * w,
      p0x + tx * w, 0.0,      p0z + tz * w,
      p1x - tx * w, h * 0.52, p1z - tz * w,
      p1x + tx * w, h * 0.52, p1z + tz * w,
      p2x - tx * w, h,        p2z - tz * w,
      p2x + tx * w, h,        p2z + tz * w
    );
    uvs.push(
      0.02, 0.0,  0.98, 0.0,
      0.02, 0.52, 0.98, 0.52,
      0.02, 1.0,  0.98, 1.0
    );
    const rowCols = [baseCol, baseCol, midCol, midCol, tipCol, tipCol];
    for (let k = 0; k < 6; k++) {
      norm.push(lx * 0.18, 0.98, lz * 0.18);
      colors.push(rowCols[k][0], rowCols[k][1], rowCols[k][2]);
    }
    idx.push(
      vBase, vBase + 1, vBase + 2, vBase + 1, vBase + 3, vBase + 2,
      vBase + 2, vBase + 3, vBase + 4, vBase + 3, vBase + 5, vBase + 4
    );
    vBase += 6;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * Build lush full multi-spire Icelandic Nootka Lupin cluster using crossed UV-mapped botanical cards
 * with `aPetalMask` vertex attribute:
 * - aPetalMask = 0.0 on palmate 7-leaflet basal foliage cards (right half of lupinMap)
 * - aPetalMask = 1.0 on crossed floral raceme spike cards (left half of lupinMap)
 */
function createLupinClusterGeo() {
  const pos = [];
  const norm = [];
  const uvs = [];
  const colors = [];
  const petalMask = [];
  const idx = [];
  let vBase = 0;

  const pushQuad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, u0, v0, u1, v1, colBot, colTop, nx, ny, nz, isPetal) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    uvs.push(u0, v0, u1, v0, u0, v1, u1, v1);
    for (let k = 0; k < 2; k++) {
      norm.push(nx, ny, nz);
      colors.push(colBot[0], colBot[1], colBot[2]);
      petalMask.push(isPetal);
    }
    for (let k = 0; k < 2; k++) {
      norm.push(nx, ny, nz);
      colors.push(colTop[0], colTop[1], colTop[2]);
      petalMask.push(isPetal);
    }
    idx.push(vBase, vBase + 1, vBase + 2, vBase + 1, vBase + 3, vBase + 2);
    vBase += 4;
  };

  // 10 lush radiating palmate 7-leaflet lupin basal leaf cards (right half of lupinMap: u 0.52..0.98)
  const leaves = 10;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + hash2i(i, 3, 851) * 0.48;
    const r0 = 0.03 + hash2i(i, 5, 851) * 0.14;
    const len = 0.28 + hash2i(i, 7, 851) * 0.16;
    const h0 = 0.12 + hash2i(i, 9, 851) * 0.14;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz * 0.16;
    const pz = dx * 0.16;
    const bx = dx * r0;
    const bz = dz * r0;
    const tx = bx + dx * len;
    const tz = bz + dz * len;
    const shade = 0.72 + hash2i(i, 11, 851) * 0.34;
    pushQuad(
      bx - px, 0.02, bz - pz,
      bx + px, 0.02, bz + pz,
      tx - px, h0,   tz - pz,
      tx + px, h0,   tz + pz,
      0.52, 0.02, 0.98, 0.98,
      [0.24 * shade, 0.36 * shade, 0.22 * shade],
      [0.34 * shade, 0.48 * shade, 0.30 * shade],
      dx * 0.22, 0.95, dz * 0.22,
      0.0
    );
  }

  // 4 lush crossed floral raceme spikes per cluster (left half of lupinMap: u 0.02..0.48)
  const stems = [
    { ox: 0.0,   oz: 0.0,   h: 1.00, leanX: 0.04,  leanZ: 0.02 },
    { ox: 0.19,  oz: -0.12, h: 0.86, leanX: 0.09,  leanZ: -0.05 },
    { ox: -0.18, oz: 0.11,  h: 0.78, leanX: -0.08, leanZ: 0.07 },
    { ox: 0.08,  oz: 0.18,  h: 0.70, leanX: 0.05,  leanZ: 0.08 }
  ];

  for (let s = 0; s < stems.length; s++) {
    const st = stems[s];
    const baseY = st.h * 0.12;
    const topY = st.h;
    const w = 0.16 + (s === 0 ? 0.025 : 0.0);
    const tx = st.ox + st.leanX;
    const tz = st.oz + st.leanZ;
    const yaw = hash2i(s, 17, 863) * Math.PI;
    for (let p = 0; p < 2; p++) {
      const ang = yaw + p * (Math.PI * 0.5);
      const px = Math.cos(ang) * w;
      const pz = Math.sin(ang) * w;
      const nx = -Math.sin(ang);
      const nz = Math.cos(ang);
      pushQuad(
        st.ox - px, baseY, st.oz - pz,
        st.ox + px, baseY, st.oz + pz,
        tx - px,    topY,  tz - pz,
        tx + px,    topY,  tz + pz,
        0.02, 0.02, 0.48, 0.98,
        [0.72, 0.72, 0.78],
        [1.15, 1.15, 1.18],
        nx * 0.65, 0.76, nz * 0.65,
        1.0
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('aPetalMask', new THREE.Float32BufferAttribute(petalMask, 1));
  geo.setIndex(idx);
  return geo;
}

/**
 * Build authentic Icelandic Silvery-Sage Woolly Willow (Salix lanata) & Deep Crowberry Shrub
 * using crossed leafy twig cards mapped to `bushMap` (500+ individual leaves per shrub!).
 */
function createIcelandicBushGeo() {
  const pos = [];
  const norm = [];
  const uvs = [];
  const colors = [];
  const idx = [];
  let vBase = 0;

  const cards = 14;
  for (let b = 0; b < cards; b++) {
    const a = (b / cards) * Math.PI * 2 + hash2i(b, 1, 901) * 0.48;
    const rad = b < 4 ? 0.04 : (0.12 + hash2i(b, 2, 901) * 0.24);
    const w = 0.22 + hash2i(b, 3, 901) * 0.14;
    const h = 0.26 + hash2i(b, 4, 901) * 0.18;
    const lean = 0.10 + hash2i(b, 5, 901) * 0.16;

    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz * w;
    const pz = dx * w;
    const bx = dx * rad;
    const bz = dz * rad;
    const tx = bx + dx * lean;
    const tz = bz + dz * lean;

    const tint = hash2i(b * 19, 5, 919);
    const botCol = [0.22, 0.26, 0.20];
    let topCol;
    if (tint < 0.46) topCol = [0.46, 0.56, 0.44];
    else if (tint < 0.85) topCol = [0.28, 0.44, 0.26];
    else topCol = [0.48, 0.34, 0.20];

    pos.push(
      bx - px, 0.0, bz - pz,
      bx + px, 0.0, bz + pz,
      tx - px, h,   tz - pz,
      tx + px, h,   tz + pz
    );
    uvs.push(0.02, 0.02, 0.98, 0.02, 0.02, 0.98, 0.98, 0.98);
    for (let k = 0; k < 2; k++) {
      norm.push(dx * 0.35, 0.92, dz * 0.35);
      colors.push(botCol[0], botCol[1], botCol[2]);
    }
    for (let k = 0; k < 2; k++) {
      norm.push(dx * 0.35, 0.92, dz * 0.35);
      colors.push(topCol[0], topCol[1], topCol[2]);
    }
    idx.push(vBase, vBase + 1, vBase + 2, vBase + 1, vBase + 3, vBase + 2);
    vBase += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  return geo;
}

/** Build crisp fluffy Arctic Cotton Grass (Eriophorum) tuft with crossed `cottonMap` fibrous white plumes! */
function createCottonGrassGeo() {
  const pos = [];
  const norm = [];
  const uvs = [];
  const colors = [];
  const idx = [];
  let vBase = 0;

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

    // Slender stem (sampled from solid white center of cottonMap so it stays opaque)
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz);
    uvs.push(0.5, 0.5, 0.5, 0.5, 0.5, 0.5);
    for (let k = 0; k < 3; k++) {
      norm.push(dx * 0.2, 0.96, dz * 0.2);
      colors.push(0.14, 0.22, 0.08);
    }
    idx.push(vBase, vBase + 1, vBase + 2);
    vBase += 3;

    if (i < 6) {
      const pr = 0.048 + hash2i(i, 6, 951) * 0.018;
      for (let p = 0; p < 2; p++) {
        const ang = a + p * (Math.PI * 0.5);
        const cx = Math.cos(ang) * pr;
        const cz = Math.sin(ang) * pr;
        pos.push(
          tx - cx, h - pr * 0.85, tz - cz,
          tx + cx, h - pr * 0.85, tz + cz,
          tx - cx, h + pr * 0.95, tz - cz,
          tx + cx, h + pr * 0.95, tz + cz
        );
        uvs.push(0.02, 0.02, 0.98, 0.02, 0.02, 0.98, 0.98, 0.98);
        for (let k = 0; k < 4; k++) {
          norm.push(0, 0.92, 0.38);
          colors.push(0.98, 0.99, 0.97);
        }
        idx.push(vBase, vBase + 1, vBase + 2, vBase + 1, vBase + 3, vBase + 2);
        vBase += 4;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  return geo;
}

/** Build high-detail radial Far Horizon Ring geometry covering 1400m -> 12800m seamlessly (1 draw call, razor-smooth far peaks!). */
const FAR_RAD_SEGS = 144;
const FAR_RING_SEGS = 40;
function createFarHorizonRingGeo() {
  const radSegs = FAR_RAD_SEGS;
  const ringSegs = FAR_RING_SEGS;
  const innerR = 1400;
  const outerR = 12800;
  const vertCount = (radSegs + 1) * (ringSegs + 1);
  const pos = new Float32Array(vertCount * 3);
  const norm = new Float32Array(vertCount * 3);
  const surf = new Float32Array(vertCount * 4);
  const hydro = new Float32Array(vertCount * 4);
  const cave = new Float32Array(vertCount * 3);
  const idx = [];

  for (let r = 0; r <= ringSegs; r++) {
    const t = r / ringSegs;
    const radius = mix(innerR, outerR, Math.pow(t, 1.48));
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
  terrainMat.customProgramCacheKey = () => 'ls_iceland_terrain_v14';

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

        // Exact C2 quintic gradient noise with analytical derivatives: returns vec3(value [0..1], dVal/dx, dVal/dz)
        vec3 gnoiseGrad(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
          vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
          vec2 ga = atmoHash22(i + vec2(0.0, 0.0));
          vec2 gb = atmoHash22(i + vec2(1.0, 0.0));
          vec2 gc = atmoHash22(i + vec2(0.0, 1.0));
          vec2 gd = atmoHash22(i + vec2(1.0, 1.0));
          float va = dot(ga, f - vec2(0.0, 0.0));
          float vb = dot(gb, f - vec2(1.0, 0.0));
          float vc = dot(gc, f - vec2(0.0, 1.0));
          float vd = dot(gd, f - vec2(1.0, 1.0));
          float k0 = va;
          float k1 = vb - va;
          float k2 = vc - va;
          float k3 = va - vb - vc + vd;
          float val = clamp((k0 + k1 * u.x + k2 * u.y + k3 * u.x * u.y) * 0.72 + 0.5, 0.0, 1.0);
          vec2 g = (ga + (gb - ga) * u.x + (gc - ga) * u.y + (ga - gb - gc + gd) * u.x * u.y
                   + du * vec2(k1 + k3 * u.y, k2 + k3 * u.x)) * 0.72;
          return vec3(val, g.x, g.y);
        }

        // 3-octave rotated C2 gradient FBM with exact world-space slope derivatives for macro/meso terrain relief!
        vec3 fbmGrad3(vec2 p) {
          vec3 acc = vec3(0.0);
          float amp = 0.5;
          float freq = 1.0;
          mat2 m = mat2(1.0, 0.0, 0.0, 1.0);
          const mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
          const mat2 rotT = mat2(0.80, 0.60, -0.60, 0.80);
          for (int i = 0; i < 3; i++) {
            vec3 n = gnoiseGrad(p);
            acc.x += amp * n.x;
            acc.yz += amp * freq * (m * n.yz);
            p = rot * p * 2.03 + vec2(17.3, -11.7);
            m = m * rotT;
            freq *= 2.03;
            amp *= 0.5;
          }
          return vec3(acc.x / 0.875, acc.yz);
        }

        // Fast 3-octave smooth C2 gradient FBM (zero grid creases)
        float terrainFbm3(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          const mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
          for (int i = 0; i < 3; i++) {
            v += a * atmoGNoise(p);
            p = rot * p * 2.04 + vec2(11.3, -19.7);
            a *= 0.5;
          }
          return v / 0.875;
        }

        // Fast 2-octave smooth C2 gradient FBM for mid/far terrain
        float terrainFbm2(vec2 p) {
          const mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
          float v = 0.5 * atmoGNoise(p);
          p = rot * p * 2.04 + vec2(11.3, -19.7);
          v += 0.25 * atmoGNoise(p);
          return v / 0.75;
        }

        // Smooth C2 3-octave non-periodic ridged multifractal for basalt fissures & hillside erosion gullies
        float rockRidged(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          const mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
          for (int i = 0; i < 3; i++) {
            float n = 1.0 - abs(atmoGNoise(p) * 2.0 - 1.0);
            v += a * n * n;
            p = rot * p * 2.07 + vec2(17.3, -9.1);
            a *= 0.5;
          }
          return v / 0.875;
        }

        // Simplex-grid 3-tap stochastic texture coordinates & smooth barycentric weights
        void simplexGrid(vec2 uv, out vec2 i0, out vec2 i1, out vec2 i2, out vec3 w) {
          vec2 s = vec2(uv.x + uv.y * 0.57735027, uv.y * 1.15470054);
          vec2 i = floor(s);
          vec2 f = fract(s);
          vec2 off = (f.x > f.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          i0 = i;
          i1 = i + off;
          i2 = i + 1.0;
          vec3 bw = (f.x > f.y)
            ? vec3(1.0 - f.x, f.x - f.y, f.y)
            : vec3(1.0 - f.y, f.y - f.x, f.x);
          w = pow(max(bw, vec3(0.0001)), vec3(3.0));
          w /= (w.x + w.y + w.z);
        }

        // Shared-simplex stochastic albedo+normal pair with uniform-flow gradients & height-modulated blending
        // (skips negligible <1.5% simplex taps to save texture bandwidth while preserving 100% zero-tiling quality!)
        void sampleNoTilePairGrad(
          sampler2D albedoTex,
          sampler2D normTex,
          vec2 uv,
          vec2 dx,
          vec2 dy,
          out vec4 outAlbedo,
          out vec3 outNorm
        ) {
          vec2 i0, i1, i2;
          vec3 w;
          simplexGrid(uv, i0, i1, i2, w);

          vec4 accCol = vec4(0.0);
          vec2 accN = vec2(0.0);
          float accW = 0.0;

          if (w.x > 0.015) {
            float h0 = atmoHash(i0);
            float a0 = h0 * 6.2831853;
            float c0 = cos(a0), sn0 = sin(a0);
            mat2 r0 = mat2(c0, -sn0, sn0, c0);
            vec2 uv0 = r0 * uv + vec2(h0, fract(h0 * 17.31));
            vec2 dx0 = r0 * dx, dy0 = r0 * dy;
            vec4 s0 = textureGrad(albedoTex, uv0, dx0, dy0);
            vec2 n0 = textureGrad(normTex, uv0, dx0, dy0).xy * 2.0 - 1.0;
            n0 = mat2(c0, sn0, -sn0, c0) * n0;
            float hw0 = w.x * (0.28 + s0.a * 1.44);
            accCol += s0 * hw0;
            accN += n0 * hw0;
            accW += hw0;
          }
          if (w.y > 0.015) {
            float h1 = atmoHash(i1);
            float a1 = h1 * 6.2831853;
            float c1 = cos(a1), sn1 = sin(a1);
            mat2 r1 = mat2(c1, -sn1, sn1, c1);
            vec2 uv1 = r1 * uv + vec2(h1, fract(h1 * 17.31));
            vec2 dx1 = r1 * dx, dy1 = r1 * dy;
            vec4 s1 = textureGrad(albedoTex, uv1, dx1, dy1);
            vec2 n1 = textureGrad(normTex, uv1, dx1, dy1).xy * 2.0 - 1.0;
            n1 = mat2(c1, sn1, -sn1, c1) * n1;
            float hw1 = w.y * (0.28 + s1.a * 1.44);
            accCol += s1 * hw1;
            accN += n1 * hw1;
            accW += hw1;
          }
          if (w.z > 0.015) {
            float h2 = atmoHash(i2);
            float a2 = h2 * 6.2831853;
            float c2 = cos(a2), sn2 = sin(a2);
            mat2 r2 = mat2(c2, -sn2, sn2, c2);
            vec2 uv2 = r2 * uv + vec2(h2, fract(h2 * 17.31));
            vec2 dx2 = r2 * dx, dy2 = r2 * dy;
            vec4 s2 = textureGrad(albedoTex, uv2, dx2, dy2);
            vec2 n2 = textureGrad(normTex, uv2, dx2, dy2).xy * 2.0 - 1.0;
            n2 = mat2(c2, sn2, -sn2, c2) * n2;
            float hw2 = w.z * (0.28 + s2.a * 1.44);
            accCol += s2 * hw2;
            accN += n2 * hw2;
            accW += hw2;
          }

          float invW = 1.0 / max(accW, 0.0001);
          outAlbedo = accCol * invW;
          outNorm = normalize(vec3(accN * invW, 1.0));
        }

        // Non-repeating stochastic cliff sampler: full random rotation, scale jitter & UV offset
        void sampleCliffNoTilePairGrad(
          sampler2D albedoTex,
          sampler2D normTex,
          vec2 uv,
          vec2 dx,
          vec2 dy,
          out vec4 outAlbedo,
          out vec3 outNorm
        ) {
          vec2 i0, i1, i2;
          vec3 w;
          simplexGrid(uv, i0, i1, i2, w);

          vec4 accCol = vec4(0.0);
          vec2 accN = vec2(0.0);
          float accW = 0.0;

          if (w.x > 0.02) {
            float h0 = atmoHash(i0);
            float a0 = h0 * 6.2831853;
            float c0 = cos(a0), sn0 = sin(a0);
            float sc0 = 0.86 + fract(h0 * 7.3) * 0.30;
            mat2 r0 = mat2(c0, -sn0, sn0, c0);
            vec2 u0 = (r0 * uv) * sc0 + vec2(h0, fract(h0 * 19.31));
            vec2 dx0 = (r0 * dx) * sc0, dy0 = (r0 * dy) * sc0;
            vec4 s0 = textureGrad(albedoTex, u0, dx0, dy0);
            vec2 n0 = textureGrad(normTex, u0, dx0, dy0).xy * 2.0 - 1.0;
            n0 = mat2(c0, sn0, -sn0, c0) * n0;
            float hw0 = w.x * (0.28 + s0.a * 1.44);
            accCol += s0 * hw0;
            accN += n0 * hw0;
            accW += hw0;
          }
          if (w.y > 0.02) {
            float h1 = atmoHash(i1);
            float a1 = h1 * 6.2831853;
            float c1 = cos(a1), sn1 = sin(a1);
            float sc1 = 0.86 + fract(h1 * 7.3) * 0.30;
            mat2 r1 = mat2(c1, -sn1, sn1, c1);
            vec2 u1 = (r1 * uv) * sc1 + vec2(h1, fract(h1 * 19.31));
            vec2 dx1 = (r1 * dx) * sc1, dy1 = (r1 * dy) * sc1;
            vec4 s1 = textureGrad(albedoTex, u1, dx1, dy1);
            vec2 n1 = textureGrad(normTex, u1, dx1, dy1).xy * 2.0 - 1.0;
            n1 = mat2(c1, sn1, -sn1, c1) * n1;
            float hw1 = w.y * (0.28 + s1.a * 1.44);
            accCol += s1 * hw1;
            accN += n1 * hw1;
            accW += hw1;
          }
          if (w.z > 0.02) {
            float h2 = atmoHash(i2);
            float a2 = h2 * 6.2831853;
            float c2 = cos(a2), sn2 = sin(a2);
            float sc2 = 0.86 + fract(h2 * 7.3) * 0.30;
            mat2 r2 = mat2(c2, -sn2, sn2, c2);
            vec2 u2 = (r2 * uv) * sc2 + vec2(h2, fract(h2 * 19.31));
            vec2 dx2 = (r2 * dx) * sc2, dy2 = (r2 * dy) * sc2;
            vec4 s2 = textureGrad(albedoTex, u2, dx2, dy2);
            vec2 n2 = textureGrad(normTex, u2, dx2, dy2).xy * 2.0 - 1.0;
            n2 = mat2(c2, sn2, -sn2, c2) * n2;
            float hw2 = w.z * (0.28 + s2.a * 1.44);
            accCol += s2 * hw2;
            accN += n2 * hw2;
            accW += hw2;
          }

          float invW = 1.0 / max(accW, 0.0001);
          outAlbedo = accCol * invW;
          outNorm = normalize(vec3(accN * invW, 1.0));
        }

        // Active-axis stochastic triplanar cliff sampler (skips negligible axes -> fast AND zero tiling!)
        void triplanarCliffPair(
          sampler2D albedoTex,
          sampler2D normTex,
          vec3 wp,
          vec3 wpDx,
          vec3 wpDy,
          vec3 wn,
          float sc,
          out vec4 outAlbedo,
          out vec3 outWorldNormDelta
        ) {
          vec3 bw = pow(abs(wn), vec3(6.0));
          bw /= max(bw.x + bw.y + bw.z, 0.0001);
          vec3 sgn = sign(wn);
          vec4 accCol = vec4(0.0);
          vec3 accNorm = vec3(0.0);
          float accW = 0.0;

          if (bw.x > 0.06) {
            vec4 cX; vec3 nX;
            sampleCliffNoTilePairGrad(albedoTex, normTex, vec2(wp.z, wp.y) * sc, vec2(wpDx.z, wpDx.y) * sc, vec2(wpDy.z, wpDy.y) * sc, cX, nX);
            accCol += cX * bw.x;
            accNorm += vec3(0.0, nX.y, nX.x * sgn.x) * bw.x;
            accW += bw.x;
          }
          if (bw.y > 0.06) {
            vec4 cY; vec3 nY;
            sampleCliffNoTilePairGrad(albedoTex, normTex, wp.xz * sc, wpDx.xz * sc, wpDy.xz * sc, cY, nY);
            accCol += cY * bw.y;
            accNorm += vec3(nY.x, 0.0, nY.y * sgn.y) * bw.y;
            accW += bw.y;
          }
          if (bw.z > 0.06) {
            vec4 cZ; vec3 nZ;
            sampleCliffNoTilePairGrad(albedoTex, normTex, vec2(wp.x, wp.y) * sc, vec2(wpDx.x, wpDx.y) * sc, vec2(wpDy.x, wpDy.y) * sc, cZ, nZ);
            accCol += cZ * bw.z;
            accNorm += vec3(nZ.x * sgn.z, nZ.y, 0.0) * bw.z;
            accW += bw.z;
          }
          float invW = 1.0 / max(accW, 0.0001);
          outAlbedo = accCol * invW;
          outWorldNormDelta = accNorm * invW;
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
        if (vCave.z > 17.5 && abs(vCave.x) < 11.8) {
          float archU = abs(vCave.x) / 11.8;
          float archCeil = vCave.y + 9.4 * pow(max(0.0, 1.0 - archU * archU), 0.56);
          float archRough = (atmoNoise(vWPos.xz * 0.24 + vec2(vWPos.y * 0.22)) - 0.5) * 1.4;
          if (vWPos.y < archCeil + archRough) discard;
        }
        float lsRough = 0.92;
        vec3 lsWorldNorm = normalize(vWNorm);
        {
          vec3 wp = vWPos;
          vec3 wn = normalize(vWNorm);
          // Uniform-control-flow screen-space derivatives (safe for textureGrad inside all distance/material branches!)
          vec3 wpDx = dFdx(wp);
          vec3 wpDy = dFdy(wp);
          vec2 wpXZ_dx = wpDx.xz;
          vec2 wpXZ_dy = wpDy.xz;

          float camDist = length(cameraPosition - wp);
          float closeFade = 1.0 - smoothstep(75.0, 290.0, camDist);
          float midFarWeight = smoothstep(32.0, 220.0, camDist);
          float farWeight = smoothstep(180.0, 1200.0, camDist);
          float slope = 1.0 - clamp(wn.y, 0.0, 1.0);

          // Domain-warped macro/meso coordinates so original sunlit moss & biome zones flow organically
          vec2 bioWarp = vec2(
            atmoGNoise(wp.xz * 0.0085 + vec2(1.7, -3.3)) - 0.5,
            atmoGNoise(wp.xz * 0.0085 + vec2(-4.2, 2.9)) - 0.5
          ) * 48.0;
          vec2 wpBio = wp.xz + bioWarp;

          // Smooth C2 multi-octave gradient FBM for seamless non-repetitive macro/meso variation & subtle distant hill relief
          vec3 hillGrad = fbmGrad3(wpBio * 0.014);
          vec3 mesoGrad = fbmGrad3(wpBio * 0.056 + vec2(4.1, -6.7));
          float macroN = clamp((hillGrad.x - 0.5) * 2.1 + 0.5, 0.0, 1.0);
          float midN   = clamp((mesoGrad.x - 0.5) * 2.1 + 0.5, 0.0, 1.0);
          float patchN = clamp(((camDist < 320.0 ? terrainFbm3(wpBio * 0.024 - vec2(7.4, 2.8)) : terrainFbm2(wpBio * 0.024 - vec2(7.4, 2.8))) - 0.5) * 2.2 + 0.5, 0.0, 1.0);
          float biomeN = clamp(((camDist < 320.0 ? terrainFbm3(wpBio * 0.0052 + vec2(11.3, -8.4)) : terrainFbm2(wpBio * 0.0052 + vec2(11.3, -8.4))) - 0.5) * 2.3 + 0.5, 0.0, 1.0);
          float microDetail = closeFade > 0.01 ? (atmoGNoise(wp.xz * 6.5) * 0.58 + atmoGNoise(wp.xz * 15.0 + vec2(3.7, -1.9)) * 0.42) : 0.5;

          // Preserve exact original lush moss-to-cliff balance on hills & escarpments
          float rockRib = smoothstep(0.50, 0.78, patchN) * smoothstep(0.16, 0.36, slope);
          float cliffRaw = clamp(max(max(vSurf.y * 0.84, smoothstep(0.22, 0.46, slope)), rockRib * 0.72), 0.0, 1.0);
          float screeRaw = clamp(vSurf.w * (1.0 - cliffRaw * 0.55), 0.0, 1.0);
          float pathRaw  = clamp(vSurf.z * (1.0 - cliffRaw), 0.0, 1.0);

          // 1) 4-Scale Distance-Adaptive Non-Repeating Stochastic Icelandic Meadow & Woolly Moss!
          // Keeps original lush moss look while eliminating all tiling & mipmap flatness from 1m to 10km!
          float mossLod = clamp(log2(max(camDist, 16.0) / 16.0) * 0.42, 0.0, 3.0);
          vec4 mossSample;
          vec3 mossN;
          if (uInReflection > 0.5) {
            mossSample = texture2D(uMossMap, wp.xz * 0.078);
            mossN = vec3(0.0, 0.0, 1.0);
          } else if (camDist > 360.0) {
            vec2 mUv = wp.xz * 0.019 + vec2(0.73, 0.29);
            mossSample = textureGrad(uMossMap, mUv, wpXZ_dx * 0.019, wpXZ_dy * 0.019);
            mossN = normalize(vec3((textureGrad(uMossNorm, mUv, wpXZ_dx * 0.019, wpXZ_dy * 0.019).xy * 2.0 - 1.0), 1.0));
          } else if (mossLod < 1.0) {
            vec4 s0, s1; vec3 n0, n1;
            sampleNoTilePairGrad(uMossMap, uMossNorm, wp.xz * 0.34, wpXZ_dx * 0.34, wpXZ_dy * 0.34, s1, n1);
            float w0 = (1.0 - smoothstep(0.0, 1.0, mossLod)) * 0.44;
            if (w0 > 0.03) {
              sampleNoTilePairGrad(uMossMap, uMossNorm, wp.xz * 1.15 + vec2(0.19, 0.53), wpXZ_dx * 1.15, wpXZ_dy * 1.15, s0, n0);
              mossSample = mix(s1, s0, w0);
              mossN = normalize(mix(n1, n0, w0));
            } else {
              mossSample = s1;
              mossN = n1;
            }
          } else if (mossLod < 2.0) {
            float w2 = smoothstep(0.0, 1.0, mossLod - 1.0);
            if (w2 < 0.04) {
              sampleNoTilePairGrad(uMossMap, uMossNorm, wp.xz * 0.34, wpXZ_dx * 0.34, wpXZ_dy * 0.34, mossSample, mossN);
            } else if (w2 > 0.96) {
              sampleNoTilePairGrad(uMossMap, uMossNorm, wp.xz * 0.078 + vec2(0.41, 0.17), wpXZ_dx * 0.078, wpXZ_dy * 0.078, mossSample, mossN);
            } else {
              vec4 s1, s2; vec3 n1, n2;
              sampleNoTilePairGrad(uMossMap, uMossNorm, wp.xz * 0.34, wpXZ_dx * 0.34, wpXZ_dy * 0.34, s1, n1);
              sampleNoTilePairGrad(uMossMap, uMossNorm, wp.xz * 0.078 + vec2(0.41, 0.17), wpXZ_dx * 0.078, wpXZ_dy * 0.078, s2, n2);
              mossSample = mix(s1, s2, w2);
              mossN = normalize(mix(n1, n2, w2));
            }
          } else {
            float w3 = smoothstep(0.0, 1.0, mossLod - 2.0) * 0.72;
            if (w3 < 0.04) {
              sampleNoTilePairGrad(uMossMap, uMossNorm, wp.xz * 0.078 + vec2(0.41, 0.17), wpXZ_dx * 0.078, wpXZ_dy * 0.078, mossSample, mossN);
            } else {
              vec4 s2, s3; vec3 n2, n3;
              sampleNoTilePairGrad(uMossMap, uMossNorm, wp.xz * 0.078 + vec2(0.41, 0.17), wpXZ_dx * 0.078, wpXZ_dy * 0.078, s2, n2);
              sampleNoTilePairGrad(uMossMap, uMossNorm, wp.xz * 0.019 + vec2(0.73, 0.29), wpXZ_dx * 0.019, wpXZ_dy * 0.019, s3, n3);
              mossSample = mix(s2, s3, w3);
              mossN = normalize(mix(n2, n3, w3));
            }
          }
          float mossH = mossSample.a;

          // Fade out vertex hummockAO beyond close range to eliminate LOD1/LOD2 polka-dot Worley aliasing!
          float nearHummock = mix(0.55, vHydro.z, 1.0 - smoothstep(26.0, 115.0, camDist));
          float macroReliefAO = clamp(0.32 + macroN * 0.40 + midN * 0.28, 0.14, 1.0);
          float cushionAO = smoothstep(0.08, 0.88, mix(macroReliefAO, nearHummock, closeFade * 0.70) * 0.45 + mossH * 0.60);

          // Exact original vibrant sunlit Icelandic moss & turf palette
          vec3 mossEmerald = vec3(0.38, 0.50, 0.21);
          vec3 mossSunGold = vec3(0.78, 0.84, 0.34);
          vec3 mossSage    = vec3(0.56, 0.63, 0.44);
          vec3 warmMeadow  = vec3(0.72, 0.62, 0.32);

          vec3 mossTint = mix(mossEmerald, mossSunGold, smoothstep(0.22, 0.78, macroN * 0.55 + midN * 0.45));
          mossTint = mix(mossTint, mossSage, smoothstep(0.46, 0.82, biomeN) * 0.48);
          mossTint = mix(mossTint, warmMeadow, smoothstep(0.52, 0.86, patchN + slope * 0.28) * 0.44);
          float bladeCrisp = mix(1.0, 0.90 + microDetail * 0.20, closeFade * 0.65);
          vec3 mossCol = mossSample.rgb * mossTint * mix(0.44, 1.22, cushionAO) * bladeCrisp;

          // Subtle dark volcanic peat / basalt grit peeking through thin soil on slopes & eroded patches
          float soilMask = smoothstep(0.10, 0.32, slope) * smoothstep(0.32, 0.70, 1.0 - patchN) * smoothstep(0.52, 0.14, mossH);
          vec3 peatSoil = vec3(0.15, 0.14, 0.11) * mix(0.75, 1.18, midN);
          mossCol = mix(mossCol, peatSoil, soilMask * 0.68);

          vec3 col = mossCol;
          vec3 horizN = mossN;
          float screeMask = 0.0;
          float pathMask = 0.0;
          float cliffMask = 0.0;
          float cliffDustMask = 0.0;
          float cliffMossMask = 0.0;
          vec3 cliffNormDelta = vec3(0.0);

          // 2) Distance-Adaptive Non-Repeating Weathered Grey-Slate Riverbed Cobbles & Talus Scree
          vec4 screeSample = vec4(0.28, 0.30, 0.32, 0.5);
          if (screeRaw > 0.01 || pathRaw > 0.01) {
            vec3 screeN;
            float screeLod = clamp(log2(max(camDist, 18.0) / 18.0) * 0.45, 0.0, 2.0);
            if (uInReflection > 0.5) {
              screeSample = texture2D(uScreeMap, wp.xz * 0.115);
              screeN = vec3(0.0, 0.0, 1.0);
            } else if (camDist > 340.0) {
              vec2 sUv = wp.xz * 0.028 + vec2(0.63, 0.19);
              screeSample = textureGrad(uScreeMap, sUv, wpXZ_dx * 0.028, wpXZ_dy * 0.028);
              screeN = normalize(vec3((textureGrad(uScreeNorm, sUv, wpXZ_dx * 0.028, wpXZ_dy * 0.028).xy * 2.0 - 1.0), 1.0));
            } else if (screeLod < 1.0) {
              vec4 sc0, sc1; vec3 sn0, sn1;
              sampleNoTilePairGrad(uScreeMap, uScreeNorm, wp.xz * 0.48, wpXZ_dx * 0.48, wpXZ_dy * 0.48, sc0, sn0);
              float sw1 = smoothstep(0.15, 1.0, screeLod);
              if (sw1 > 0.04) {
                sampleNoTilePairGrad(uScreeMap, uScreeNorm, wp.xz * 0.115 + vec2(0.27, 0.61), wpXZ_dx * 0.115, wpXZ_dy * 0.115, sc1, sn1);
                screeSample = mix(sc0, sc1, sw1);
                screeN = normalize(mix(sn0, sn1, sw1));
              } else {
                screeSample = sc0;
                screeN = sn0;
              }
            } else {
              float sw2 = smoothstep(0.0, 1.0, screeLod - 1.0) * 0.72;
              if (sw2 < 0.04) {
                sampleNoTilePairGrad(uScreeMap, uScreeNorm, wp.xz * 0.115 + vec2(0.27, 0.61), wpXZ_dx * 0.115, wpXZ_dy * 0.115, screeSample, screeN);
              } else {
                vec4 sc1, sc2; vec3 sn1, sn2;
                sampleNoTilePairGrad(uScreeMap, uScreeNorm, wp.xz * 0.115 + vec2(0.27, 0.61), wpXZ_dx * 0.115, wpXZ_dy * 0.115, sc1, sn1);
                sampleNoTilePairGrad(uScreeMap, uScreeNorm, wp.xz * 0.028 + vec2(0.63, 0.19), wpXZ_dx * 0.028, wpXZ_dy * 0.028, sc2, sn2);
                screeSample = mix(sc1, sc2, sw2);
                screeN = normalize(mix(sn1, sn2, sw2));
              }
            }
            if (screeRaw > 0.01) {
              vec3 gravelTone = mix(vec3(0.68, 0.72, 0.76), vec3(1.06, 1.09, 1.12), smoothstep(0.26, 0.78, screeSample.a));
              vec3 screeCol = screeSample.rgb * gravelTone * mix(0.54, 1.22, screeSample.a) * mix(1.0, 0.88 + microDetail * 0.24, closeFade * 0.70);
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

          // 4) Non-Repeating Volcanic Dust / Ash Mountain Slopes with Subtle Weathered Basalt & Green Moss
          if (cliffRaw > 0.02) {
            float w1 = (atmoGNoise(wp.xz * 0.011 + vec2(wp.y * 0.013)) - 0.5) * 18.0;
            float w2 = camDist < 420.0 ? (atmoGNoise(vec2(wp.z * 0.023 - wp.y * 0.019, wp.x * 0.023 + wp.y * 0.017)) - 0.5) * 8.0 : 0.0;
            vec3 wpRock = wp + vec3(w1 + w2, w1 * 0.55 - w2 * 0.7, -w1 * 0.8 + w2 * 0.6);

            // Distance-adaptive stochastic triplanar rock (eliminates visible tiling at all ranges!)
            float cliffLod = clamp(log2(max(camDist, 24.0) / 24.0) * 0.44, 0.0, 2.0);
            vec4 cliffMix;
            vec3 cliffTexNorm;
            if (uInReflection > 0.5) {
              cliffMix = texture2D(uCliffMap, wpRock.xz * 0.028);
              cliffTexNorm = vec3(0.0, 0.0, 1.0);
            } else if (camDist > 360.0) {
              triplanarCliffPair(uCliffMap, uCliffNorm, wpRock + vec3(-31.7, 9.3, 23.1), wpDx, wpDy, wn, 0.014, cliffMix, cliffTexNorm);
            } else if (cliffLod < 1.0) {
              vec4 cNear, cMid; vec3 nNear, nMid;
              triplanarCliffPair(uCliffMap, uCliffNorm, wpRock, wpDx, wpDy, wn, 0.088, cNear, nNear);
              triplanarCliffPair(uCliffMap, uCliffNorm, wpRock + vec3(17.3, 4.1, -11.7), wpDx, wpDy, wn, 0.028, cMid, nMid);
              float wMid = clamp(smoothstep(0.0, 1.0, cliffLod) * 0.62 + (1.0 - macroN) * 0.16 + 0.18, 0.18, 0.88);
              cliffMix = mix(cNear, cMid, wMid);
              cliffTexNorm = nNear * (1.0 - wMid * 0.58) + nMid * (0.44 + wMid * 0.52);
            } else {
              float wFar = clamp(smoothstep(0.0, 1.0, cliffLod - 1.0) * 0.74, 0.0, 0.74);
              if (wFar < 0.05) {
                triplanarCliffPair(uCliffMap, uCliffNorm, wpRock + vec3(17.3, 4.1, -11.7), wpDx, wpDy, wn, 0.028, cliffMix, cliffTexNorm);
              } else {
                vec4 cMid, cFar; vec3 nMid, nFar;
                triplanarCliffPair(uCliffMap, uCliffNorm, wpRock + vec3(17.3, 4.1, -11.7), wpDx, wpDy, wn, 0.028, cMid, nMid);
                triplanarCliffPair(uCliffMap, uCliffNorm, wpRock + vec3(-31.7, 9.3, 23.1), wpDx, wpDy, wn, 0.010, cFar, nFar);
                cliffMix = mix(cMid, cFar, wFar);
                cliffTexNorm = nMid * (1.0 - wFar * 0.52) + nFar * (0.44 + wFar * 0.60);
              }
            }
            float cliffH = cliffMix.a;

            // Subtle weathered volcanic rock peeking beneath a rich matte blanket of dark Icelandic volcanic dust / tephra ash
            vec2 cragA = vec2(wpRock.x * 0.022 + wpRock.y * 0.016, wpRock.z * 0.022 - wpRock.y * 0.015);
            vec2 cragB = vec2((wpRock.x - wpRock.z) * 0.013 + wpRock.y * 0.010, wpRock.y * 0.024 + (wpRock.x + wpRock.z) * 0.009);
            float fissureMacro = rockRidged(cragA) * 0.55 + (camDist < 360.0 ? rockRidged(cragB) * 0.45 : 0.22);
            float mineralPatch = terrainFbm2(vec2((wpRock.x + wpRock.z) * 0.008, wpRock.y * 0.014)) * 0.65 + macroN * 0.35;
            float dustDrift    = terrainFbm2(vec2(wpRock.x * 0.022 - wpRock.z * 0.015, wp.y * 0.011 + wpRock.z * 0.018));
            // Fine granular volcanic ash & tephra grit (multi-scale so it stays tactile at both mid & far range without chunky rock blocks!)
            float dustGritCoarse = terrainFbm2(vec2(wp.x * 0.085 + wp.z * 0.045, wp.y * 0.040 + wp.z * 0.065));
            float dustGritFine   = camDist < 180.0
              ? (atmoGNoise(wp.xz * 0.42 + vec2(wp.y * 0.36)) * 0.58 + atmoGNoise(wp.xz * 1.15 - vec2(wp.y * 0.85)) * 0.42)
              : 0.5;
            float dustGrit       = dustGritCoarse * 0.54 + dustGritFine * 0.46;
            // Subtle downslope volcanic sand/ash slide streaks (soft gravity wash, never blocky cracks!)
            float ashWash = atmoGNoise(vec2((wp.x * 0.72 + wp.z * 0.69) * 0.055 + dustDrift * 1.4, wp.y * 0.012)) * 0.55
                          + (camDist < 280.0 ? atmoGNoise(vec2((wp.z * 0.72 - wp.x * 0.69) * 0.095 - dustDrift * 1.1, wp.y * 0.018)) * 0.45 : 0.22);

            // Subtle dark weathered basalt rock ribs peeking out gently on hardest steep ridges
            float softCrev = smoothstep(0.10, 0.80, fissureMacro);
            vec3 mineralTone = mix(vec3(0.50, 0.54, 0.60), vec3(0.84, 0.88, 0.92), smoothstep(0.22, 0.78, mineralPatch));
            mineralTone = mix(mineralTone, vec3(0.76, 0.70, 0.62), smoothstep(0.56, 0.86, macroN) * 0.24);
            float cliffAO = mix(0.52, 1.12, cliffH) * mix(0.72, 1.12, softCrev);
            vec3 basaltCol = cliffMix.rgb * mineralTone * 0.84 * cliffAO;
            float ridgeFacet = smoothstep(0.52, 0.88, cliffH * 0.55 + fissureMacro * 0.45);
            basaltCol += vec3(0.028, 0.033, 0.038) * ridgeFacet * (0.40 + 0.60 * smoothstep(0.25, 0.75, mineralPatch));

            // Authentic dark matte Icelandic volcanic ash / tephra dust blanketing the big mountain slope
            vec3 ashDeep  = vec3(0.030, 0.033, 0.038); // Deep charcoal black-ash volcanic dust
            vec3 ashSlate = vec3(0.076, 0.081, 0.088); // Sunlit dusty dark-slate tephra
            vec3 ashWarm  = vec3(0.068, 0.062, 0.054); // Subtle warm dusty volcanic tuff soil
            vec3 volcDustCol = mix(ashDeep, ashSlate, smoothstep(0.20, 0.82, dustDrift * 0.58 + mineralPatch * 0.42));
            volcDustCol = mix(volcDustCol, ashWarm, smoothstep(0.44, 0.82, patchN) * 0.36);
            volcDustCol *= mix(0.70, 1.32, dustGrit * 0.68 + cliffH * 0.32);
            volcDustCol *= mix(0.78, 1.18, smoothstep(0.18, 0.82, ashWash));

            // Mostly volcanic dust (66%..88%), with subtle weathered dark rock ribs poking through steepest crags
            float rockProtrude = smoothstep(0.52, 0.85, cliffH * 0.46 + fissureMacro * 0.54) * smoothstep(0.24, 0.58, slope);
            cliffDustMask = clamp(0.80 - rockProtrude * 0.46 + (dustDrift - 0.5) * 0.20, 0.32, 0.92);
            vec3 slopeRockCol = mix(basaltCol, volcDustCol, cliffDustMask);

            // Lush green Icelandic moss draping over shoulders/ledges PLUS crisp organic moss patches clinging to the volcanic dust!
            float altGrassFade = 1.0 - smoothstep(180.0, 278.0, wp.y + (macroN - 0.5) * 76.0 + (patchN - 0.5) * 34.0);
            float ledgeMoss = smoothstep(0.24, 0.66, wn.y + (midN - 0.5) * 0.28) * smoothstep(0.14, 0.62, macroN) * altGrassFade;
            float slopeMossField  = terrainFbm2(vec2(wpRock.x * 0.022 + wp.y * 0.011, wpRock.z * 0.022 - wp.y * 0.009));
            float slopeMossDetail = camDist < 220.0 ? atmoGNoise(wp.xz * 0.095 + vec2(wp.y * 0.065, -wp.y * 0.055)) : 0.5;
            float mossSignal = slopeMossField * 0.56 + patchN * 0.22 + slopeMossDetail * 0.28 + (mossH - 0.5) * 0.22;
            float dustSlopeMoss = smoothstep(0.44, 0.72, mossSignal) * smoothstep(0.08, 0.48, wn.y + 0.16) * altGrassFade;
            cliffMossMask = clamp(max(ledgeMoss * 0.92, dustSlopeMoss * 0.78), 0.0, 0.92);
            vec3 cliffCol = mix(slopeRockCol, mossCol * 0.94, cliffMossMask);

            cliffMask = heightBlendFactor(cliffRaw, mossH * 0.88, cliffH, 3.6);
            col = mix(col, cliffCol, cliffMask);

            // Tactile dusty-grit normal relief on volcanic ash (not chunky boulder-rocky!), soft velvety normals on moss patches
            float dustNormScale = mix(0.76, 0.40, cliffDustMask);
            vec3 softMossN = vec3(mossN.x, 0.0, mossN.y) * 0.90;
            cliffNormDelta = mix(cliffTexNorm * dustNormScale, softMossN, cliffMossMask * 0.78);
          }

          // 5) Towering Icelandic High-Altitude Alpine Snowfields & Blue-White Crevassed Mountain Glaciers!
          float glacierRaw = clamp(vSurf.x, 0.0, 1.0);
          float snowRaw = clamp(vHydro.w, 0.0, 1.0);
          float snowMask = 0.0;
          float glacierMask = 0.0;
          float iceGloss = 0.0;

          // Natural dark alpine tundra/scree belt between green foothills & ragged snowpack
          float alpineBelt = smoothstep(185.0, 305.0, wp.y + (macroN - 0.5) * 95.0 + (patchN - 0.5) * 45.0) * (1.0 - cliffMask * 0.65);
          if (alpineBelt > 0.01) {
            vec3 tundraRock = mix(vec3(0.20, 0.22, 0.23), vec3(0.30, 0.29, 0.22), smoothstep(0.30, 0.78, midN));
            col = mix(col, tundraRock, alpineBelt * 0.62);
          }

          if (snowRaw > 0.005 || glacierRaw > 0.005) {
            float aspectBias = dot(normalize(vec2(wn.x, wn.z) + vec2(0.0001)), normalize(vec2(-0.62, -0.78))) * 0.20;
            vec2 driftWarp = vec2(
              atmoGNoise(wp.xz * 0.014 + vec2(2.3, -4.1)) - 0.5,
              atmoGNoise(wp.xz * 0.014 + vec2(-5.7, 1.8)) - 0.5
            ) * 34.0;
            vec2 wpSnow = wp.xz + driftWarp;
            vec2 couloirUv = wpSnow * 0.017 + vec2(wp.y * 0.007, -wp.y * 0.006);
            float couloirGully = 1.0 - rockRidged(couloirUv);
            float patchLarge = atmoGNoise(wpSnow * 0.022 + vec2(wp.y * 0.005, -wp.y * 0.004));
            float patchMed   = atmoGNoise(wpSnow * 0.068 - vec2(wp.y * 0.012));
            float patchFine  = atmoGNoise(wp.xz * 0.22 + vec2(wp.y * 0.03));
            float windPatch  = patchLarge * 0.52 + patchMed * 0.32 + patchFine * 0.16;

            float snowHold = smoothstep(0.38, 0.80, wn.y + (windPatch - 0.5) * 0.42 + (couloirGully - 0.46) * 0.38);
            float snowBreakup = (couloirGully - 0.48) * 0.56 + (patchLarge - 0.50) * 0.54 + (patchMed - 0.50) * 0.28 + aspectBias;
            float transitionZone = smoothstep(0.01, 0.18, snowRaw) * (1.0 - smoothstep(0.68, 0.96, snowRaw) * 0.72);
            float snowSignal = snowRaw * (0.28 + 0.92 * snowHold) + snowBreakup * transitionZone;
            snowMask = clamp(smoothstep(0.26, 0.56, snowSignal), 0.0, 1.0);

            vec3 snowLit = vec3(0.86, 0.91, 0.96);
            vec3 snowShadow = vec3(0.54, 0.66, 0.80);
            vec3 snowCol = mix(snowShadow, snowLit, clamp(0.42 + 0.58 * wn.y + (windPatch - 0.5) * 0.24, 0.0, 1.0));
            col = mix(col, snowCol, snowMask);

            if (glacierRaw > 0.01) {
              vec2 iceCoord = vec2((wp.x * 0.72 + wp.z * 0.69) * 0.055, (wp.z * 0.72 - wp.x * 0.69) * 0.032 + wp.y * 0.024);
              float crevasse = rockRidged(iceCoord + vec2(macroN * 1.4, -midN * 0.9));
              float serac = atmoGNoise(wp.xz * 0.12 + vec2(wp.y * 0.05)) * 0.65 + atmoGNoise(wp.xz * 0.34) * 0.35;
              float slopeHold = smoothstep(0.32, 0.72, wn.y + (serac - 0.5) * 0.28 + (couloirGully - 0.45) * 0.22);

              vec3 crevasseBlue = vec3(0.22, 0.45, 0.60);
              vec3 glacialIce   = vec3(0.58, 0.72, 0.80);
              vec3 firnWhite    = vec3(0.84, 0.89, 0.93);
              float deepCrack = 1.0 - smoothstep(0.08, 0.34, crevasse);
              vec3 iceCol = mix(glacialIce, firnWhite, smoothstep(0.25, 0.74, serac * 0.62 + crevasse * 0.48));
              iceCol = mix(iceCol, crevasseBlue, deepCrack * 0.82);

              float edgeBand = smoothstep(0.06, 0.48, glacierRaw) * (1.0 - smoothstep(0.45, 0.85, glacierRaw));
              float ashStreak = edgeBand * smoothstep(0.38, 0.74, atmoGNoise(wp.xz * 0.058 + vec2(midN * 1.6))) * (1.0 - smoothstep(200.0, 310.0, wp.y));
              iceCol = mix(iceCol, vec3(0.20, 0.22, 0.24), ashStreak * 0.74);

              glacierMask = smoothstep(0.18, 0.58, glacierRaw * (0.42 + 0.72 * slopeHold) + (serac - 0.5) * 0.28 + (couloirGully - 0.48) * 0.22);
              col = mix(col, iceCol, glacierMask);
              iceGloss = glacierMask * (1.0 - ashStreak * 0.75) * (0.35 + 0.65 * deepCrack);
              horizN = mix(horizN, vec3((crevasse - 0.5) * 0.90, (serac - 0.5) * 0.90, 1.0), glacierMask * 0.80);
            }
          }

          // Grazing-angle woolly moss velvet sheen (exact original sunlit glow!)
          vec3 viewDir = normalize(cameraPosition - wp);
          float fres = pow(1.0 - max(dot(wn, viewDir), 0.0), 3.0);
          float mossCoverage = (1.0 - cliffMask) * (1.0 - screeMask) * (1.0 - pathMask) * (1.0 - snowMask) * (1.0 - glacierMask);
          col += vec3(0.068, 0.080, 0.024) * fres * mossCoverage * (1.0 - uNightFactor * 0.88);
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
              atmoNoise(wp.xz * 7.5 + vec2(0.06, 0.0)) - atmoNoise(wp.xz * 7.5 - vec2(0.06, 0.0)),
              atmoNoise(wp.xz * 7.5 + vec2(0.0, 0.06)) - atmoNoise(wp.xz * 7.5 - vec2(0.0, 0.06))
            ) * closeFade * mix(0.14, 0.28, mossCoverage);
          }

          // Subtle analytical macro/meso relief normals on mid/far hills so distant slopes keep organic depth without looking flat
          vec2 macroSlope = hillGrad.yz * mix(0.06, 0.22, farWeight) + mesoGrad.yz * mix(0.04, 0.16, midFarWeight) * (1.0 - farWeight * 0.55);
          vec3 macroNormDelta = vec3(-macroSlope.x, 0.0, -macroSlope.y) * (1.0 - snowMask * 0.60);

          float horizStrength = mix(1.78, 0.95, screeMask + pathMask * 0.35);
          vec3 flatDelta = vec3(horizN.x, 0.0, horizN.y) * horizStrength + vec3(microGrad.x, 0.0, microGrad.y) + macroNormDelta;
          lsWorldNorm = normalize(wn + mix(flatDelta, cliffNormDelta + macroNormDelta * 0.55, cliffMask));

          // Specular AA
          vec3 dNdx = dFdx(lsWorldNorm);
          vec3 dNdy = dFdy(lsWorldNorm);
          float normVar = clamp(max(dot(dNdx, dNdx), dot(dNdy, dNdy)) * 4.5, 0.0, 0.82);

          // Powdery volcanic dust slopes stay matte (~0.92), exposed bare rock slightly crisper (~0.80)
          float bareRockWeight = cliffMask * (1.0 - cliffDustMask * 0.72) * (1.0 - cliffMossMask * 0.85);
          lsRough = mix(0.95, 0.80, clamp(bareRockWeight * 0.85 + screeMask * 0.48, 0.0, 1.0));
          lsRough = mix(lsRough, 0.64, snowMask * 0.85);
          lsRough = mix(lsRough, 0.24, iceGloss * 0.90);
          lsRough = mix(lsRough, 0.44, clamp(rockWet * 0.72, 0.0, 0.82));
          float shoreGlaze = smoothstep(0.68, 0.96, vHydro.x) * screeMask * (1.0 - smoothstep(0.14, 0.34, slope));
          lsRough = mix(lsRough, 0.40, shoreGlaze * 0.72);
          lsRough = mix(lsRough, 0.22, puddle * 0.75 * (1.0 - smoothstep(0.16, 0.36, slope)));
          float minRough = mix(0.36, 0.68, smoothstep(0.20, 0.55, slope));
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
        '#include <lights_fragment_end>',
        /* glsl */`
        #include <lights_fragment_end>
        {
          float tShadow = sampleTerrainShadow(vWPos);
          reflectedLight.directDiffuse *= tShadow;
          reflectedLight.directSpecular *= tShadow;
        }
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
    float blendTerrainFbm3(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      const mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
      for (int i = 0; i < 3; i++) {
        v += a * atmoGNoise(p);
        p = rot * p * 2.04 + vec2(11.3, -19.7);
        a *= 0.5;
      }
      return v / 0.875;
    }

    vec3 evalTerrainMossColor(sampler2D mossMap, vec3 wp, vec3 groundUp, out vec4 outMossS) {
      float camDist = length(cameraPosition - wp);
      float closeFade = 1.0 - smoothstep(75.0, 290.0, camDist);
      float slope = 1.0 - clamp(groundUp.y, 0.0, 1.0);

      vec2 bioWarp = vec2(
        atmoGNoise(wp.xz * 0.0085 + vec2(1.7, -3.3)) - 0.5,
        atmoGNoise(wp.xz * 0.0085 + vec2(-4.2, 2.9)) - 0.5
      ) * 48.0;
      vec2 wpBio = wp.xz + bioWarp;
      float macroN = clamp((blendTerrainFbm3(wpBio * 0.014) - 0.5) * 2.1 + 0.5, 0.0, 1.0);
      float midN   = clamp((blendTerrainFbm3(wpBio * 0.056 + vec2(4.1, -6.7)) - 0.5) * 2.1 + 0.5, 0.0, 1.0);
      float patchN = clamp((blendTerrainFbm3(wpBio * 0.024 - vec2(7.4, 2.8)) - 0.5) * 2.2 + 0.5, 0.0, 1.0);
      float biomeN = clamp((blendTerrainFbm3(wpBio * 0.0052 + vec2(11.3, -8.4)) - 0.5) * 2.3 + 0.5, 0.0, 1.0);
      float microDetail = closeFade > 0.01 ? (atmoGNoise(wp.xz * 6.5) * 0.58 + atmoGNoise(wp.xz * 15.0 + vec2(3.7, -1.9)) * 0.42) : 0.5;

      vec4 mossMid  = texture2D(mossMap, wp.xz * 0.34);
      vec2 rotFar   = mat2(0.80, -0.60, 0.60, 0.80) * wp.xz * 0.078 + vec2(0.41, 0.17);
      vec4 mossFar  = texture2D(mossMap, rotFar);
      vec4 mossFine = closeFade > 0.02 ? texture2D(mossMap, wp.xz * 1.15 + vec2(0.19, 0.53)) : mossMid;
      vec4 mossSample = mix(mix(mossMid, mossFar, smoothstep(70.0, 260.0, camDist) * 0.55), mossFine, closeFade * 0.44);
      outMossS = mossSample;

      float macroReliefAO = clamp(0.32 + macroN * 0.40 + midN * 0.28, 0.14, 1.0);
      float cushionAO = smoothstep(0.08, 0.88, macroReliefAO * 0.45 + mossSample.a * 0.60);
      vec3 mossEmerald = vec3(0.38, 0.50, 0.21);
      vec3 mossSunGold = vec3(0.78, 0.84, 0.34);
      vec3 mossSage    = vec3(0.56, 0.63, 0.44);
      vec3 warmMeadow  = vec3(0.72, 0.62, 0.32);

      vec3 mossTint = mix(mossEmerald, mossSunGold, smoothstep(0.22, 0.78, macroN * 0.55 + midN * 0.45));
      mossTint = mix(mossTint, mossSage, smoothstep(0.46, 0.82, biomeN) * 0.48);
      mossTint = mix(mossTint, warmMeadow, smoothstep(0.52, 0.86, patchN + slope * 0.28) * 0.44);
      float bladeCrisp = mix(1.0, 0.90 + microDetail * 0.20, closeFade * 0.65);
      vec3 mCol = mossSample.rgb * mossTint * mix(0.44, 1.22, cushionAO) * bladeCrisp;
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
  boulderMat.customProgramCacheKey = () => 'ls_tri_boulder_v12';
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
        '#include <lights_fragment_end>',
        /* glsl */`
        #include <lights_fragment_end>
        {
          float tShadow = sampleTerrainShadow(vRWorldPos);
          reflectedLight.directDiffuse *= tShadow;
          reflectedLight.directSpecular *= tShadow;
        }
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

  const smallStoneMat = makeBlendedStoneMat('ls_small_stones_v6', 0.08, 0.86);
  const cobbleMat = makeBlendedStoneMat('ls_cobbles_v6', 0.16, 0.84);

  // Seamless Terrain-Blended Eldhraun Moss-Pillow Mound Material:
  // Exact terrain moss color + terrain-matched base normals so pillows flow organically out of the ground with ZERO seam!
  const cushionMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0.0
  });
  cushionMat.fog = false;
  cushionMat.customProgramCacheKey = () => 'ls_eldhraun_cushion_v4';
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
        '#include <lights_fragment_end>',
        /* glsl */`
        #include <lights_fragment_end>
        {
          float tShadow = sampleTerrainShadow(vCWorldPos);
          reflectedLight.directDiffuse *= tShadow;
          reflectedLight.directSpecular *= tShadow;
        }
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
    map: texLib.grassMap,
    alphaTest: 0.36,
    vertexColors: true,
    roughness: 0.84,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  enhanceMaterialWithAtmo(grassMat, { cacheKey: 'ls_tussock_grass_v2', windSway: 0.36, wetnessBoost: 0.16 });

  // Multi-Colored Lupin Material: uses `aPetalMask` so `instanceColor` tints ONLY flower petals while leaves stay green!
  const lupinMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texLib.lupinMap,
    alphaTest: 0.36,
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  lupinMat.fog = false;
  lupinMat.customProgramCacheKey = () => 'ls_iceland_lupin_multi_v4';
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
        uniform float uWindTime;
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
          float flutter = sin(uWindTime * 1.9 + instSeed) * (0.18 + 0.10 * gustFront);
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
        '#include <lights_fragment_end>',
        /* glsl */`
        #include <lights_fragment_end>
        {
          float tShadow = sampleTerrainShadow(vLsWorldPos);
          reflectedLight.directDiffuse *= tShadow;
          reflectedLight.directSpecular *= tShadow;
        }
        `
      )
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
    map: texLib.bushMap,
    alphaTest: 0.36,
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  enhanceMaterialWithAtmo(bushMat, { cacheKey: 'ls_iceland_bush_v2', windSway: 0.14, wetnessBoost: 0.18 });

  const cottonMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texLib.cottonMap,
    alphaTest: 0.32,
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  enhanceMaterialWithAtmo(cottonMat, { cacheKey: 'ls_cotton_grass_v2', windSway: 0.42, wetnessBoost: 0.10 });

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

  // Authentic Icelandic Nootka Lupin Palette (soft highland violet, lavender-lilac, periwinkle, plum & cream-white!)
  const LUPIN_PALETTE = [
    new THREE.Color().setHex(0x8e6ee0), // Soft Royal Icelandic Violet-Lavender (dominant!)
    new THREE.Color().setHex(0x7c86e8), // Highland Periwinkle-Blue
    new THREE.Color().setHex(0xa27ee8), // Vivid Soft Lavender-Violet
    new THREE.Color().setHex(0xb076d4), // Amethyst-Orchid Violet
    new THREE.Color().setHex(0xbaa8f0), // Pale Soft Lilac
    new THREE.Color().setHex(0xf0ece4)  // Natural Creamy White morph
  ];

  // Natural Weathered Grey-Slate & Warm Taupe Icelandic Stone/Cobble Palette (harmonious, never stark black dots!)
  const STONE_PALETTE = [
    new THREE.Color().setHex(0x586066), // Weathered medium slate
    new THREE.Color().setHex(0x6e757b), // Cool grey weathered river stone
    new THREE.Color().setHex(0x848a8c), // Pale lichen-dusted grey cobble
    new THREE.Color().setHex(0x786f62), // Warm weathered volcanic sandstone-taupe
    new THREE.Color().setHex(0x626e56)  // Mossy grey-olive fieldstone
  ];

  // Double-buffered Far Horizon continuous ring mesh (zero-hitch time-sliced background updates!)
  let farGeo = createFarHorizonRingGeo();
  let farStagingGeo = createFarHorizonRingGeo();
  const farMesh = new THREE.Mesh(farGeo, terrainMat);
  farMesh.frustumCulled = false;
  farMesh.receiveShadow = true;
  root.add(farMesh);

  let lastFarCenterX = 1e9;
  let lastFarCenterZ = 1e9;
  let farJob = null;
  const _farTmpSample = {
    height: 0, moss: 0, cliff: 0, path: 0, scree: 0,
    riverDepth: 0, riverMask: 0, lakeDepth: 0, lakeMask: 0, lakeWaterY: 16, lakeShoreDist: -9999,
    flowX: 0, flowZ: 1, snow: 0, glacier: 0, wetness: 0, hummockAO: 0.5,
    caveSignedD: 99, caveWaterY: 16, caveOverburden: 0
  };

  function finalizeFarRing(geo, sx, sz) {
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const stride = FAR_RAD_SEGS + 1;

    // Fast analytical central-difference grid normals directly from polar ring heights (5x faster than 4x sampleWorld!)
    for (let r = 0; r <= FAR_RING_SEGS; r++) {
      const rPrev = r > 0 ? r - 1 : 0;
      const rNext = r < FAR_RING_SEGS ? r + 1 : FAR_RING_SEGS;
      for (let a = 0; a <= FAR_RAD_SEGS; a++) {
        const aPrev = a > 0 ? a - 1 : FAR_RAD_SEGS - 1;
        const aNext = a < FAR_RAD_SEGS ? a + 1 : 1;
        const vi = r * stride + a;
        const iRp = rPrev * stride + a;
        const iRn = rNext * stride + a;
        const iAp = r * stride + aPrev;
        const iAn = r * stride + aNext;

        const rdx = pos.getX(iRn) - pos.getX(iRp);
        const rdy = pos.getY(iRn) - pos.getY(iRp);
        const rdz = pos.getZ(iRn) - pos.getZ(iRp);
        const adx = pos.getX(iAn) - pos.getX(iAp);
        const ady = pos.getY(iAn) - pos.getY(iAp);
        const adz = pos.getZ(iAn) - pos.getZ(iAp);

        // tR x tA yields upward (+Y) normal on clockwise (cos a, sin a) polar ring
        let nx = rdy * adz - rdz * ady;
        let ny = rdz * adx - rdx * adz;
        let nz = rdx * ady - rdy * adx;
        if (ny < 0.0) { nx = -nx; ny = -ny; nz = -nz; }
        const invL = 1.0 / (Math.hypot(nx, ny, nz) || 1.0);
        norm.setXYZ(vi, nx * invL, ny * invL, nz * invL);
      }
    }
    pos.needsUpdate = true;
    norm.needsUpdate = true;
    geo.attributes.aSurf.needsUpdate = true;
    geo.attributes.aHydro.needsUpdate = true;
    geo.attributes.aCave.needsUpdate = true;
    farMesh.position.set(sx, 0, sz);
    farMesh.geometry = geo;
    farStagingGeo = farGeo;
    farGeo = geo;
  }

  function updateFarRing(px, pz, syncAll = false) {
    const farSnap = CHUNK_SIZE;
    if (
      !farJob &&
      lastFarCenterX < 1e8 &&
      Math.abs(px - lastFarCenterX) <= farSnap * 0.62 &&
      Math.abs(pz - lastFarCenterZ) <= farSnap * 0.62
    ) {
      return;
    }

    if (!farJob || syncAll) {
      const sx = Math.round(px / farSnap) * farSnap;
      const sz = Math.round(pz / farSnap) * farSnap;
      if (sx !== lastFarCenterX || sz !== lastFarCenterZ || syncAll) {
        lastFarCenterX = sx;
        lastFarCenterZ = sz;
        farJob = { sx, sz, r: 0 };
      }
    }
    if (!farJob) return;

    const geo = farStagingGeo;
    const pos = geo.attributes.position;
    const surf = geo.attributes.aSurf;
    const hydro = geo.attributes.aHydro;
    const cave = geo.attributes.aCave;
    const stride = FAR_RAD_SEGS + 1;
    const rowsBudget = syncAll ? (FAR_RING_SEGS + 1) : (IS_MOBILE_DEVICE ? 4 : 10);
    const endR = Math.min(FAR_RING_SEGS, farJob.r + rowsBudget - 1);

    for (let r = farJob.r; r <= endR; r++) {
      const rowBase = r * stride;
      for (let a = 0; a <= FAR_RAD_SEGS; a++) {
        const i = rowBase + a;
        const wx = farJob.sx + pos.getX(i);
        const wz = farJob.sz + pos.getZ(i);
        sampleWorld(wx, wz, _farTmpSample);

        pos.setY(i, _farTmpSample.height - 2.0);
        surf.setXYZW(i, _farTmpSample.glacier || 0, _farTmpSample.cliff, _farTmpSample.path, _farTmpSample.scree);
        hydro.setXYZW(i, _farTmpSample.wetness, _farTmpSample.riverMask, _farTmpSample.hummockAO, _farTmpSample.snow);
        cave.setXYZ(i, _farTmpSample.caveSignedD, _farTmpSample.caveWaterY, _farTmpSample.caveOverburden);
      }
    }

    farJob.r = endR + 1;
    if (farJob.r > FAR_RING_SEGS) {
      finalizeFarRing(geo, farJob.sx, farJob.sz);
      farJob = null;
    }
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
      riverDepth: 0, riverMask: 0, lakeDepth: 0, lakeMask: 0, lakeWaterY: 16, lakeShoreDist: -9999,
      flowX: 0, flowZ: 1, snow: 0, glacier: 0, wetness: 0, hummockAO: 0.5
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
      if (tmpSample.path > 0.22 || tmpSample.lakeDepth > 0.85) continue;
      getTerrainNormal(wx0, wz0, norm, 1.0);

      const onLakeShore = tmpSample.lakeShoreDist > -9.0 && tmpSample.lakeDepth <= 0.85;
      const slopeLimit = (tmpSample.riverMask > 0.12 || onLakeShore) ? 0.62 : 0.74;
      if (norm.y < slopeLimit) continue;

      const rockField = fbm2(wx0 * 0.022 + 2.1, wz0 * 0.022 - 4.7, 2, 419);
      const hRand = hash2i(i, cx * 19 + cz * 31, 419);

      const inRiver = (tmpSample.riverMask > 0.12 || onLakeShore) && hRand > 0.26;
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
        colliders.push({ x: wx0, z: wz0, r: spSc * 0.92, h: spSc * 1.9, baseY: tmpSample.height, kind: 'spire' });
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
          if (tmpSample.path > 0.24 || tmpSample.lakeDepth > 0.90) continue;
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
        if (sc > 0.72) {
          colliders.push({
            x: wx,
            z: wz,
            r: sc * 0.88,
            h: sc * (isCrag ? 0.54 : 0.38),
            baseY: tmpSample.height,
            kind: 'rock',
            rideOnly: sc <= 1.25
          });
        }
      }

      // Surround every Eldhraun lava outcrop with smooth, slope-hugging mossy pillow mounds!
      if (!inRiver && lod <= 1) {
        const maxCushions = lod === 0 ? (IS_MOBILE_DEVICE ? 210 : 280) : 48;
        const cushCount = lod === 0 ? (4 + Math.floor(hash2i(i, cx * 31 + cz, 541) * 5)) : 2;
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
          if (tmpSample.path > 0.24 || tmpSample.riverMask > 0.14 || tmpSample.lakeDepth > 0.02 || tmpSample.lakeShoreDist > -2.0 || tmpSample.cliff > 0.42 || tmpSample.snow > 0.18) continue;
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
        const satCobbles = 4 + Math.floor(hash2i(i, cx + cz * 7, 561) * 4);
        for (let k = 0; k < satCobbles && cobbleMats.length < 220; k++) {
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

        const satStones = 3 + Math.floor(hash2i(i, cz + cx * 11, 603) * 3);
        for (let k = 0; k < satStones && stoneMats.length < 220; k++) {
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
        if (tmpSample.cliff > 0.56 || tmpSample.lakeDepth > 0.45) continue;

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
    const lupinCenters = lod === 0 ? (IS_MOBILE_DEVICE ? 82 : 108) : lod === 1 ? 20 : 0;
    const maxLupins = lod === 0 ? (IS_MOBILE_DEVICE ? 330 : 450) : 60;
    for (let i = 0; i < lupinCenters && lupinMats.length < maxLupins; i++) {
      const cx0 = (hash2i(cx * 131 + i, cz * 79, 613) - 0.5) * CHUNK_SIZE;
      const cz0 = (hash2i(cx * 61, cz * 113 + i, 619) - 0.5) * CHUNK_SIZE;
      const wx0 = ox + cx0;
      const wz0 = oz + cz0;
      if (isInsideBuildingFootprint(wx0, wz0)) continue;

      sampleWorld(wx0, wz0, tmpSample);
      if (tmpSample.moss < 0.20 || tmpSample.height > 78 || tmpSample.path > 0.28 || tmpSample.riverMask > 0.20 || tmpSample.lakeDepth > 0.01 || tmpSample.lakeShoreDist > -2.5 || tmpSample.cliff > 0.40 || tmpSample.snow > 0.18 || tmpSample.glacier > 0.10) continue;
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
          if (tmpSample.path > 0.30 || tmpSample.riverMask > 0.22 || tmpSample.lakeDepth > 0.01 || tmpSample.lakeShoreDist > -2.0 || tmpSample.cliff > 0.44 || tmpSample.snow > 0.20) continue;
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
    const bushCenters = lod === 0 ? (IS_MOBILE_DEVICE ? 76 : 96) : lod === 1 ? 18 : 0;
    const maxBushes = lod === 0 ? (IS_MOBILE_DEVICE ? 220 : 290) : 42;
    for (let i = 0; i < bushCenters && bushMats.length < maxBushes; i++) {
      const cx0 = (hash2i(cx * 149 + i, cz * 83, 653) - 0.5) * CHUNK_SIZE;
      const cz0 = (hash2i(cx * 71, cz * 127 + i, 659) - 0.5) * CHUNK_SIZE;
      const wx0 = ox + cx0;
      const wz0 = oz + cz0;
      if (isInsideBuildingFootprint(wx0, wz0)) continue;

      sampleWorld(wx0, wz0, tmpSample);
      if (tmpSample.moss < 0.20 || tmpSample.path > 0.30 || tmpSample.riverMask > 0.22 || tmpSample.lakeDepth > 0.01 || tmpSample.lakeShoreDist > -2.5 || tmpSample.cliff > 0.44 || tmpSample.snow > 0.20 || tmpSample.glacier > 0.12) continue;
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
          if (tmpSample.path > 0.32 || tmpSample.riverMask > 0.22 || tmpSample.lakeDepth > 0.01 || tmpSample.lakeShoreDist > -2.0 || tmpSample.cliff > 0.45 || tmpSample.snow > 0.20) continue;
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
            const gwx = ox + glx;
            const gwz = oz + glz;
            const gh = getTerrainHeight(gwx, gwz);
            const gs = 0.92 + hash2i(i, 47, 677) * 0.48;
            dummy.position.set(glx, gh - 0.06, glz);
            alignToSlope(gwx, gwz, hash2i(i, 48, 677) * 6.28, 0.92);
            dummy.scale.set(gs * 1.18, gs, gs * 1.18);
            dummy.updateMatrix();
            grassMats.push(dummy.matrix.clone());
          }
        }
      }
    }

    if (lod === 0) {
      // 4c) Dense Sparkling White Arctic Cotton Grass Carpets (Eriophorum grouped in damp marsh hollows & meadow swales!)
      const cottonCenters = IS_MOBILE_DEVICE ? 56 : 78;
      const maxCotton = IS_MOBILE_DEVICE ? 220 : 310;
      for (let i = 0; i < cottonCenters && cottonMats.length < maxCotton; i++) {
        const cx0 = (hash2i(cx * 167 + i, cz * 97, 701) - 0.5) * CHUNK_SIZE;
        const cz0 = (hash2i(cx * 89, cz * 151 + i, 703) - 0.5) * CHUNK_SIZE;
        const wx0 = ox + cx0;
        const wz0 = oz + cz0;
        if (isInsideBuildingFootprint(wx0, wz0)) continue;
        sampleWorld(wx0, wz0, tmpSample);
        if (tmpSample.path > 0.28 || tmpSample.riverMask > 0.24 || tmpSample.lakeDepth > 0.01 || tmpSample.lakeShoreDist > -1.5 || tmpSample.cliff > 0.42 || tmpSample.snow > 0.18 || tmpSample.height > 54) continue;
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

      // 4d) Clustered Sunlit Wild Meadow Grass Swards & Swales (dense close-range grass carpet + mossy pillow clearings!)
      const grassClusters = IS_MOBILE_DEVICE ? 230 : 340;
      const maxGrass = IS_MOBILE_DEVICE ? 840 : 1280;
      for (let i = 0; i < grassClusters && grassMats.length < maxGrass; i++) {
        const cx0 = (hash2i(cx * 173 + i, cz * 103, 671) - 0.5) * CHUNK_SIZE;
        const cz0 = (hash2i(cx * 97, cz * 157 + i, 673) - 0.5) * CHUNK_SIZE;
        const wx0 = ox + cx0;
        const wz0 = oz + cz0;
        if (isInsideBuildingFootprint(wx0, wz0)) continue;

        sampleWorld(wx0, wz0, tmpSample);
        if (tmpSample.moss < 0.16 || tmpSample.path > 0.32 || tmpSample.riverMask > 0.22 || tmpSample.lakeDepth > 0.01 || tmpSample.lakeShoreDist > -2.0 || tmpSample.cliff > 0.44 || tmpSample.snow > 0.20 || tmpSample.glacier > 0.12) continue;
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
            if (tmpSample.path > 0.34 || tmpSample.riverMask > 0.24 || tmpSample.lakeDepth > 0.01 || tmpSample.lakeShoreDist > -2.0 || tmpSample.cliff > 0.45 || tmpSample.snow > 0.22) continue;
          }

          // Fuller, taller grass in drift core -> softer shorter tufts at cluster edge
          const coreBoost = mix(1.14, 0.76, rFrac);
          const s = (0.86 + hash2i(i + c * 9, 45, 677) * 0.58) * coreBoost;
          dummy.position.set(lxC, tmpSample.height - 0.06, lzC);
          alignToSlope(wxC, wzC, hash2i(i + c, 46, 677) * 6.28, 0.92);
          dummy.scale.set(s * 1.24, s, s * 1.24);
          dummy.updateMatrix();
          grassMats.push(dummy.matrix.clone());
        }
      }
    }

    const clutterGroup = new THREE.Group();
    const rockGroup = new THREE.Group();
    group.add(clutterGroup);
    group.add(rockGroup);

    const addInstanced = (geo, mat, mats, castShadow, colorsArr = null, targetParent = group) => {
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
      targetParent.add(im);
      disposables.push(im);
    };

    // Hero boulders & volcanic spires stay visible in close lake reflections; small flora/cobbles go in clutterGroup (hidden in reflection pass!)
    const rockCastShadow = lod <= 1;
    addInstanced(boulderGeoA, boulderMat, boulderMatsA, rockCastShadow, boulderColorsA, rockGroup);
    addInstanced(boulderGeoB, boulderMat, boulderMatsB, rockCastShadow, boulderColorsB, rockGroup);
    addInstanced(spireGeo, boulderMat, spireMats, rockCastShadow, null, rockGroup);
    addInstanced(cobbleGeo, cobbleMat, cobbleMats, false, cobbleColors, clutterGroup);
    addInstanced(stoneClusterGeo, smallStoneMat, stoneMats, false, stoneColors, clutterGroup);
    addInstanced(cushionGeo, cushionMat, cushionMats, false, null, clutterGroup);
    addInstanced(grassGeo, grassMat, grassMats, false, null, clutterGroup);
    addInstanced(lupinGeo, lupinMat, lupinMats, false, lupinColors, clutterGroup);
    addInstanced(bushGeo, bushMat, bushMats, false, null, clutterGroup);
    addInstanced(cottonGeo, cottonMat, cottonMats, false, null, clutterGroup);

    return { disposables, colliders, clutterGroup, rockGroup };
  }

  function createChunk(cx, cz, geoLod, detailLod) {
    const segs = LOD_SEGS[geoLod];
    const geo = buildChunkGeometry(cx, cz, segs);
    const mesh = new THREE.Mesh(geo, terrainMat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    const group = new THREE.Group();
    group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    group.add(mesh);

    const { disposables, colliders, clutterGroup, rockGroup } = populateChunkDetails(cx, cz, detailLod, group);
    root.add(group);

    return {
      key: `${cx},${cz}`,
      cx,
      cz,
      geoLod,
      detailLod,
      group,
      clutterGroup,
      rockGroup,
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

  let lastUpdatePcx = 1e9;
  let lastUpdatePcz = 1e9;
  let hasPendingChunks = true;

  function rebuildAll(centerX, centerZ) {
    for (const c of chunks.values()) disposeChunk(c);
    chunks.clear();
    lastFarCenterX = 1e9;
    lastFarCenterZ = 1e9;
    farJob = null;
    lastUpdatePcx = 1e9;
    lastUpdatePcz = 1e9;
    hasPendingChunks = true;
    update(centerX, centerZ, true);
  }

  function update(centerX, centerZ, syncAll = false) {
    // Hysteresis deadzone (0.62 * CHUNK_SIZE = ~99m) prevents chunk/LOD jitter when walking near boundaries!
    const needGridUpdate =
      syncAll ||
      lastUpdatePcx > 1e8 ||
      Math.abs(centerX - lastUpdatePcx * CHUNK_SIZE) > CHUNK_SIZE * 0.62 ||
      Math.abs(centerZ - lastUpdatePcz * CHUNK_SIZE) > CHUNK_SIZE * 0.62;

    const pcx = needGridUpdate ? Math.round(centerX / CHUNK_SIZE) : lastUpdatePcx;
    const pcz = needGridUpdate ? Math.round(centerZ / CHUNK_SIZE) : lastUpdatePcz;

    if (!syncAll && !hasPendingChunks && !needGridUpdate) {
      updateFarRing(centerX, centerZ, false);
      return;
    }
    lastUpdatePcx = pcx;
    lastUpdatePcz = pcz;

    const needed = new Map();
    for (let dz = -GRID_RADIUS; dz <= GRID_RADIUS; dz++) {
      for (let dx = -GRID_RADIUS; dx <= GRID_RADIUS; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        needed.set(`${cx},${cz}`, {
          cx,
          cz,
          geoLod: getLodForRing(ring),
          detailLod: getDetailLodForRing(ring),
          ring
        });
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
      if (!existing || existing.geoLod !== spec.geoLod || existing.detailLod !== spec.detailLod) {
        queue.push({ key, spec, existing });
      }
    }
    queue.sort((a, b) => a.spec.ring - b.spec.ring);

    const budget = syncAll ? queue.length : MAX_BUILDS_PER_FRAME;
    const maxHeavy = syncAll ? queue.length : (IS_MOBILE_DEVICE ? 1 : 2);
    const buildStart = syncAll ? 0 : performance.now();
    let builtCount = 0;
    let heavyCount = 0;
    for (let i = 0; i < queue.length && builtCount < budget; i++) {
      const { key, spec, existing } = queue[i];
      const isHeavy = spec.detailLod <= 1;
      if (!syncAll && isHeavy && heavyCount >= maxHeavy) continue;
      if (!syncAll && builtCount > 0 && (performance.now() - buildStart) > 4.5) break;
      if (existing) disposeChunk(existing);
      chunks.set(key, createChunk(spec.cx, spec.cz, spec.geoLod, spec.detailLod));
      builtCount++;
      if (isHeavy) heavyCount++;
    }
    hasPendingChunks = queue.length > builtCount;
    if (syncAll || heavyCount === 0) {
      updateFarRing(centerX, centerZ, syncAll);
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

  function setReflectionMode(enabled) {
    ATMO_UNIFORMS.uInReflection.value = enabled ? 1.0 : 0.0;
    const showClutter = !enabled;
    for (const c of chunks.values()) {
      if (c.clutterGroup) c.clutterGroup.visible = showClutter;
      if (c.rockGroup) c.rockGroup.visible = !enabled || c.detailLod === 0;
    }
  }

  return {
    update,
    rebuildAll,
    getCollidersNear,
    setReflectionMode
  };
}
