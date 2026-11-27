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

/** Build organically jagged volcanic basalt boulder geometry (detail=2 -> 320 tris). */
function createNaturalBasaltRockGeo(seed = 101, detail = 2, verticalBias = 0.84) {
  const geo = new THREE.IcosahedronGeometry(1.0, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const nx = v.x;
    const ny = v.y;
    const nz = v.z;

    const macro = fbm2(nx * 1.45 + seed * 0.23, nz * 1.45 - ny * 0.9, 3, seed + 17);
    const ridgeA = ridged2(nx * 2.35 - ny * 0.8 + seed * 0.13, nz * 2.35 + ny * 0.7, 3, seed + 41);
    // Sharper angular lava-rock fracturing (Death Stranding volcanic crag silhouette!)
    const r = 0.60 + macro * 0.26 + Math.pow(ridgeA, 1.35) * 0.42;
    const flatBottom = ny < -0.22 ? 0.56 : 1.0;

    v.set(nx * r, ny * r * verticalBias * flatBottom, nz * r);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build dramatic multi-tiered jagged volcanic lava-rock crag formation (Death Stranding signature!).
 * Merges 2 indexed high-detail displaced basalt lobes with SMOOTH normals so world-space triplanar normal-mapping
 * produces photogrammetry-grade fractured lava rock with ZERO flat low-poly facets!
 */
function createJaggedLavaCragGeo(seed = 37) {
  const lobes = [
    { ox: 0.0,   oy: 0.10, oz: 0.0,   sx: 1.28, sy: 1.04, sz: 1.06, ry: 0.3, s: seed },
    { ox: 0.72,  oy: -0.08, oz: 0.34, sx: 0.88, sy: 0.68, sz: 0.84, ry: 1.9, s: seed + 23 }
  ];

  const pos = [];
  const norm = [];
  const idx = [];
  let vBase = 0;
  const v = new THREE.Vector3();

  for (const lb of lobes) {
    const g = new THREE.IcosahedronGeometry(1.0, 2);
    const p = g.attributes.position;
    const cs = Math.cos(lb.ry);
    const sn = Math.sin(lb.ry);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const macro = fbm2(v.x * 1.4 + lb.s * 0.19, v.z * 1.4 - v.y * 0.9, 3, lb.s + 5);
      const ridge = ridged2(v.x * 2.2 + lb.s * 0.17, v.z * 2.2 - v.y * 1.2, 3, lb.s + 11);
      const strata = Math.sin(v.y * 6.0 + lb.s) * 0.07;
      const r = 0.60 + macro * 0.22 + Math.pow(ridge, 1.25) * 0.42 + strata;
      const peakTaper = v.y > 0.15 ? (1.0 - v.y * 0.20) : 1.0;
      const flatBot = v.y < -0.24 ? 0.52 : 1.0;
      const lx = v.x * r * lb.sx * peakTaper;
      const ly = v.y * r * lb.sy * flatBot + lb.oy;
      const lz = v.z * r * lb.sz * peakTaper;
      p.setXYZ(i, lb.ox + lx * cs - lz * sn, ly, lb.oz + lx * sn + lz * cs);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      norm.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx.push(gi[i] + vBase);
    } else {
      for (let i = 0; i < p.count; i++) idx.push(vBase + i);
    }
    vBase += p.count;
    g.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * Build iconic towering jagged basalt volcanic pinnacle / crag spire (Death Stranding skyline landmark!).
 * Smooth indexed normals + triplanar rock normal-mapping -> crisp weathered obsidian peak, zero flat shards.
 */
function createVolcanicSpireGeo(seed = 83) {
  const parts = [
    { ox: 0.0,   oy: 1.05, oz: 0.0,  sx: 0.94, sy: 1.85, sz: 0.86, leanX: 0.18, ry: 0.5, s: seed },
    { ox: 0.60,  oy: 0.34, oz: 0.26, sx: 0.72, sy: 0.92, sz: 0.68, leanX: -0.06, ry: 2.1, s: seed + 23 }
  ];

  const pos = [];
  const norm = [];
  const idx = [];
  let vBase = 0;
  const v = new THREE.Vector3();

  for (const pt of parts) {
    const g = new THREE.IcosahedronGeometry(1.0, 2);
    const p = g.attributes.position;
    const cs = Math.cos(pt.ry);
    const sn = Math.sin(pt.ry);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const ridge = ridged2(v.x * 2.3 + pt.s * 0.13, v.z * 2.3 - v.y * 1.1, 3, pt.s + 7);
      const r = 0.64 + ridge * 0.42;
      const hNorm = clamp((v.y + 1.0) * 0.5, 0.0, 1.0);
      const taper = mix(1.28, 0.24, Math.pow(hNorm, 1.15));
      const lx = v.x * r * pt.sx * taper + hNorm * pt.leanX;
      const ly = (v.y * 0.5 + 0.42) * r * pt.sy + pt.oy * 0.42;
      const lz = v.z * r * pt.sz * taper;
      p.setXYZ(i, pt.ox + lx * cs - lz * sn, ly, pt.oz + lx * sn + lz * cs);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      norm.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx.push(gi[i] + vBase);
    } else {
      for (let i = 0; i < p.count; i++) idx.push(vBase + i);
    }
    vBase += p.count;
    g.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setIndex(idx);
  return geo;
}

/** Build natural weathered volcanic basalt cobble geometry (smooth indexed detail=1 -> 80 tris, pairs with normalMap!). */
function createFacetedCobbleGeo(seed = 67) {
  const geo = new THREE.IcosahedronGeometry(1.0, 1);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm2(v.x * 1.5 + seed * 0.19, v.z * 1.5 - v.y * 1.1, 2, seed + 13);
    const r = 0.72 + n * 0.40;
    const flatBot = v.y < -0.25 ? 0.55 : 1.0;
    pos.setXYZ(i, v.x * r, v.y * r * 0.66 * flatBot, v.z * r);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build a lightweight 6-stone weathered volcanic pebble cluster (smooth faceted icosahedra -> zero pyramid diamonds up close!).
 */
function createSmallStoneClusterGeo() {
  const stones = [
    { ox: 0.0,   oz: 0.0,   sx: 0.16, sy: 0.09, sz: 0.13, ry: 0.4, seed: 11 },
    { ox: 0.42,  oz: 0.26,  sx: 0.12, sy: 0.07, sz: 0.10, ry: 1.7, seed: 23 },
    { ox: -0.38, oz: 0.32,  sx: 0.14, sy: 0.08, sz: 0.11, ry: 2.8, seed: 37 },
    { ox: 0.30,  oz: -0.40, sx: 0.10, sy: 0.06, sz: 0.09, ry: 4.1, seed: 53 },
    { ox: -0.26, oz: -0.31, sx: 0.09, sy: 0.055, sz: 0.08, ry: 5.3, seed: 71 },
    { ox: 0.14,  oz: 0.48,  sx: 0.08, sy: 0.05, sz: 0.07, ry: 0.9, seed: 89 }
  ];

  const pos = [];
  const norm = [];
  const uv = [];
  const idx = [];
  let vBase = 0;
  const v = new THREE.Vector3();

  for (const st of stones) {
    const g = new THREE.IcosahedronGeometry(1.0, 0);
    const p = g.attributes.position;
    const cs = Math.cos(st.ry);
    const sn = Math.sin(st.ry);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const jitter = 0.80 + hash2i(Math.round(v.x * 10 + st.seed), Math.round(v.z * 10 - v.y * 7), st.seed) * 0.38;
      const lx = v.x * st.sx * jitter;
      const ly = (v.y * 0.5 + 0.32) * st.sy * jitter;
      const lz = v.z * st.sz * jitter;
      p.setXYZ(i, st.ox + lx * cs - lz * sn, ly, st.oz + lx * sn + lz * cs);
    }
    g.computeVertexNormals();
    const n = g.attributes.normal;
    const u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      norm.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx.push(gi[i] + vBase);
    } else {
      for (let i = 0; i < p.count; i++) idx.push(vBase + i);
    }
    vBase += p.count;
    g.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

/** Build organic Icelandic lava-moss cushion cluster (low-poly detail=1 -> 80 tris). */
function createMossCushionGeo() {
  const geo = new THREE.IcosahedronGeometry(0.68, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const squeeze = y < 0 ? 0.14 : 0.36;
    const lobe = 1.0 + 0.18 * Math.sin(x * 4.8 + z * 3.9);
    pos.setXYZ(i, x * lobe, Math.max(-0.04, y * squeeze), z * lobe);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build lush wide Death Stranding sunlit meadow grass carpet patch (36 fine blades across 2.0m = 72 tris).
 * Uses crisp 2-triangle tapered blades so foreground meadows have dense continuous golden-olive grass at 60 FPS!
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
    // Spread across a natural 2.0m meadow patch so adjacent patches weave seamlessly into a continuous grassy carpet!
    const rad = Math.sqrt(hash2i(i, 13, 801)) * 1.02;
    const h = 0.16 + hash2i(i, 17, 801) * 0.24;
    const arch = 0.08 + hash2i(i, 19, 801) * 0.16;
    const w = 0.011 + hash2i(i, 23, 801) * 0.008;
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const px = -dz * w;
    const pz = dx * w;
    const bx = dx * rad;
    const bz = dz * rad;

    const kind = hash2i(i, 29, 801);
    const baseCol = [0.085, 0.125, 0.032];
    // Vibrant sunlit olive-gold & chartreuse grass matching Death Stranding reference foreground!
    const midCol = kind > 0.70 ? [0.34, 0.34, 0.11] : kind > 0.30 ? [0.22, 0.31, 0.072] : [0.18, 0.27, 0.082];
    const tipCol = kind > 0.70 ? [0.54, 0.50, 0.16] : kind > 0.30 ? [0.38, 0.45, 0.12] : [0.29, 0.38, 0.12];

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
 * Build lightweight multi-colored Icelandic Lupin cluster (58 tris) with an `aPetalMask` vertex attribute:
 * - aPetalMask = 0.0 on stems & palmate basal leaves (always stays dusty blue-green!)
 * - aPetalMask = 1.0 on flower florets (tinted per-instance across violet, sky-blue, rose-pink, plum & white!)
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

  // 10 dusty blue-green palmate basal leaves (aPetalMask = 0)
  const leaves = 10;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + hash2i(i, 3, 851) * 0.4;
    const r0 = 0.04 + hash2i(i, 5, 851) * 0.14;
    const len = 0.17 + hash2i(i, 7, 851) * 0.12;
    const h0 = 0.05 + hash2i(i, 9, 851) * 0.10;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz * 0.055;
    const pz = dx * 0.055;
    const bx = dx * r0;
    const bz = dz * r0;
    const shade = 0.80 + hash2i(i, 11, 851) * 0.34;
    pushTri(
      bx - px, h0 * 0.5, bz - pz,
      bx + px, h0 * 0.5, bz + pz,
      bx + dx * len, h0 + 0.05, bz + dz * len,
      [0.15 * shade, 0.26 * shade, 0.15 * shade],
      dx * 0.25, 0.94, dz * 0.25,
      0.0
    );
  }

  // 3 graceful lupin floral spires of varied height & lean (58 tris total!)
  const stems = [
    { ox: 0.0,   oz: 0.0,   h: 0.74, leanX: 0.04,  leanZ: 0.02 },
    { ox: 0.15,  oz: -0.10, h: 0.60, leanX: 0.08,  leanZ: -0.05 },
    { ox: -0.14, oz: 0.09,  h: 0.54, leanX: -0.07, leanZ: 0.06 }
  ];

  for (let s = 0; s < stems.length; s++) {
    const st = stems[s];
    const stemBaseH = st.h * 0.34;
    const bloomH = st.h * 0.66;

    const sw = 0.016;
    const mx = st.ox + st.leanX * 0.5;
    const mz = st.oz + st.leanZ * 0.5;
    pushTri(st.ox - sw, 0, st.oz, st.ox + sw, 0, st.oz, mx, st.h * 0.75, mz, [0.16, 0.25, 0.13], 0, 0.5, 0.85, 0.0);

    // 6 compact whorled tiers x 3 delicate florets (reads botanically fine even 1m from camera!)
    const tiers = 6;
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const y = stemBaseH + f * bloomH;
      const cx = st.ox + st.leanX * (0.35 + f * 0.65);
      const cz = st.oz + st.leanZ * (0.35 + f * 0.65);
      const radius = mix(0.080, 0.024, Math.pow(f, 0.80));
      const florets = 3;

      // Subtle vertical value gradient from richer deeper lower florets to pale bud tip
      const lum = mix(0.74, 1.06, f);
      for (let k = 0; k < florets; k++) {
        const a = (k / florets) * Math.PI * 2 + t * 1.05 + s * 1.3;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const px = -dz * radius * 0.68;
        const pz = dx * radius * 0.68;
        const tipX = cx + dx * radius;
        const tipZ = cz + dz * radius;
        const tipY = y + mix(0.02, 0.055, f);
        const vShade = lum * (0.86 + hash2i(t * 7 + k, s, 863) * 0.28);
        pushTri(
          cx - px, y - 0.02, cz - pz,
          cx + px, y - 0.02, cz + pz,
          tipX, tipY, tipZ,
          [vShade, vShade, vShade],
          dx * 0.65, 0.72, dz * 0.65,
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
 * Build fine-foliage Death Stranding Icelandic Crowberry / Dwarf-Willow Heather Bush (108 tiny dark leaf-sprigs!).
 * Uses fine delicate dark olive-sage sprigs instead of large flat shards so bushes look organic even 2m from camera!
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

  // 12 low spreading woody twigs + 96 tiny fine dark olive-sage heather sprigs forming a soft organic mound
  const branches = 12;
  for (let b = 0; b < branches; b++) {
    const a = (b / branches) * Math.PI * 2 + hash2i(b, 1, 901) * 0.42;
    const reach = 0.24 + hash2i(b, 2, 901) * 0.26;
    const bh = 0.18 + hash2i(b, 3, 901) * 0.20;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz * 0.011;
    const pz = dx * 0.011;
    pushTri(-px, 0, -pz, px, 0, pz, dx * reach * 0.9, bh * 0.85, dz * reach * 0.9, [0.045, 0.040, 0.028], 0, 0.85, 0.5);

    for (let l = 0; l < 8; l++) {
      const f = 0.16 + (l / 8) * 0.90;
      const domeY = Math.sin(clamp(f * 0.92, 0.08, 0.96) * Math.PI) * bh * 1.15 + 0.03;
      const spread = 0.07 + hash2i(b * 13 + l, 4, 901) * 0.14;
      const la = a + (hash2i(b, l * 7, 901) - 0.5) * 3.0;
      const lx = dx * reach * f + Math.cos(la) * spread * 0.55;
      const lz = dz * reach * f + Math.sin(la) * spread * 0.55;
      const ly = Math.max(0.025, domeY + (hash2i(l, b, 907) - 0.45) * 0.10);

      // Tiny fine leaf sprig (3..4cm wide, 6..11cm long -> zero origami triangles!)
      const ldx = Math.cos(la);
      const ldz = Math.sin(la);
      const halfW = 0.020 + hash2i(l, b * 3, 911) * 0.016;
      const lpx = -ldz * halfW;
      const lpz = ldx * halfW;
      const lLen = 0.068 + hash2i(b, l, 911) * 0.046;
      const tipUp = 0.038 + hash2i(b + l, 7, 919) * 0.048;

      const tint = hash2i(b * 19 + l, 5, 919);
      const radialAO = mix(0.42, 1.14, clamp(Math.hypot(lx, lz) / 0.44 * 0.45 + ly / 0.34 * 0.72, 0, 1));
      let cr, cg, cb;
      if (tint < 0.46) {
        // Natural rich dark Icelandic bilberry / crowberry shrub green
        cr = 0.068 * radialAO; cg = 0.135 * radialAO; cb = 0.048 * radialAO;
      } else if (tint < 0.68) {
        // Warm olive-sage leaf crown
        cr = 0.125 * radialAO; cg = 0.175 * radialAO; cb = 0.052 * radialAO;
      } else {
        // Vibrant russet-red / copper-crimson Nordic autumn heather & berry leaves (matches reference foreground!)
        cr = 0.34 * radialAO; cg = 0.092 * radialAO; cb = 0.036 * radialAO;
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

/** Build delicate lightweight Arctic Cotton Grass tuft (14 tris). */
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

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + hash2i(i, 1, 951) * 0.5;
    const r = 0.03 + hash2i(i, 2, 951) * 0.14;
    const h = 0.28 + hash2i(i, 3, 951) * 0.20;
    const lean = 0.07 + hash2i(i, 4, 951) * 0.08;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const px = -dz * 0.010;
    const pz = dx * 0.010;
    const bx = dx * r;
    const bz = dz * r;
    const tx = bx + dx * lean;
    const tz = bz + dz * lean;

    pushTri(bx - px, 0, bz - pz, bx + px, 0, bz + pz, tx, h, tz, [0.16, 0.21, 0.08], dx * 0.2, 0.96, dz * 0.2);

    if (i < 4) {
      const pr = 0.038;
      const cottonCol = [0.76, 0.78, 0.76];
      pushTri(tx - pr, h - 0.01, tz, tx + pr, h - 0.01, tz, tx, h + pr * 1.5, tz, cottonCol, 0, 1, 0);
      pushTri(tx, h - 0.01, tz - pr, tx, h - 0.01, tz + pr, tx, h + pr * 1.5, tz, cottonCol, 0, 1, 0);
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
        if (vCave.z > 15.4 && abs(vCave.x) < 12.6) {
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

  // Fast World-Space Triplanar Fractured Basalt + Velvety Moss Cap Material for Boulders & Cobbles
  const boulderMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.03
  });
  boulderMat.fog = false;
  boulderMat.customProgramCacheKey = () => 'ls_tri_boulder_v8';
  boulderMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ATMO_UNIFORMS);
    shader.uniforms.uRockTex = { value: texLib.basaltCliff.map };
    shader.uniforms.uRockNorm = { value: texLib.basaltCliff.normalMap };
    shader.uniforms.uMossTex = { value: texLib.moss.map };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRWorldPos;\nvarying vec3 vRWorldNorm;')
      .replace(
        '#include <project_vertex>',
        /* glsl */`
        #include <project_vertex>
        {
          vec4 rwp = vec4(transformed, 1.0);
          vec3 rwn = objectNormal;
          #ifdef USE_INSTANCING
            rwp = instanceMatrix * rwp;
            rwn = mat3(instanceMatrix) * rwn;
          #endif
          rwp = modelMatrix * rwp;
          vRWorldPos = rwp.xyz;
          vRWorldNorm = normalize(mat3(modelMatrix) * rwn);
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
        varying vec3 vRWorldPos;
        varying vec3 vRWorldNorm;
        ${ATMO_GLSL_PARS}

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
        float rRough = 0.78;
        vec3 rFinalNorm = normalize(vRWorldNorm);
        {
          vec3 wp = vRWorldPos;
          vec3 wn = normalize(vRWorldNorm);
          vec4 rockNear = triRockRGBA(uRockTex, wp, wn, 0.52);
          vec4 rockMacro = triRockRGBA(uRockTex, wp, wn, 0.16);
          vec4 rock = mix(rockNear, rockMacro, 0.35);

          // Harmonious weathered grey-brown & cool-slate boulders (blends naturally into green valleys, NEVER black coal!)
          float rockAO = mix(0.48, 1.26, rock.a);
          float ridgeLit = smoothstep(0.46, 0.84, rock.a) * (0.45 + 0.55 * clamp(wn.y, 0.0, 1.0));
          float warmVar = atmoNoise(wp.xz * 0.065 + vec2(3.1, -2.4));
          vec3 stoneTone = mix(vec3(0.84, 0.88, 0.92), vec3(0.96, 0.90, 0.80), smoothstep(0.35, 0.78, warmVar) * 0.55);
          vec3 darkBasalt = rock.rgb * stoneTone * 1.42 * rockAO + vec3(0.08, 0.088, 0.092) * ridgeLit;

          // Fine high-frequency mineral/lichen crust grain
          float lichenN = atmoNoise(wp.xz * 3.6 + vec2(wp.y * 2.4)) * 0.6 + atmoNoise(wp.xz * 9.2 - vec2(wp.y * 4.1)) * 0.4;
          float lichen = smoothstep(0.62, 0.86, lichenN) * smoothstep(0.30, 0.78, rockNear.a) * smoothstep(0.18, 0.72, wn.y) * 0.36;
          darkBasalt = mix(darkBasalt, vec3(0.24, 0.27, 0.22), lichen);

          // Natural olive-gold moss caps blending boulders seamlessly into surrounding mossy hillsides
          vec4 mossS = texture2D(uMossTex, wp.xz * 0.46);
          float patchGate = smoothstep(0.22, 0.68, atmoNoise(wp.xz * 0.14 + vec2(wp.y * 0.2)));
          float mossTop = smoothstep(0.48, 0.80, wn.y + (mossS.a - 0.5) * 0.30) * patchGate;
          vec3 mossCap = mossS.rgb * vec3(0.76, 0.84, 0.24) * mix(0.48, 1.16, mossS.a);

          vec3 col = mix(darkBasalt, mossCap, mossTop * 0.88);
          col *= mix(0.80, 1.04, sampleCloudShadow(wp.xz));

          float rockWet = uRainWetness * 0.75 * (1.0 - mossTop * 0.75);
          col *= mix(1.0, 0.76, rockWet * 0.55);
          rRough = mix(0.80, 0.94, mossTop);
          rRough = mix(rRough, 0.44, rockWet * 0.55);

          // World-space triplanar basalt fracture normal-mapping (kills all low-poly facet look!)
          vec3 nDelta = triRockNorm(uRockNorm, wp, wn, 0.52) * 0.95 + triRockNorm(uRockNorm, wp, wn, 0.16) * 0.45;
          rFinalNorm = normalize(wn + nDelta * mix(1.0, 0.35, mossTop));

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

  // Ultra-fast multi-toned basalt cobble & volcanic stone materials (smooth normal-mapped stones -> zero faceted pyramids!)
  const smallStoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    normalMap: texLib.basaltCliff.normalMap,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.84,
    metalness: 0.04,
    flatShading: false
  });
  enhanceMaterialWithAtmo(smallStoneMat, { cacheKey: 'ls_small_stones_v3', wetnessBoost: 0.72 });

  const cobbleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texLib.basaltCliff.map,
    normalMap: texLib.basaltCliff.normalMap,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 0.82,
    metalness: 0.04,
    flatShading: false
  });
  enhanceMaterialWithAtmo(cobbleMat, { cacheKey: 'ls_cobbles_v3', wetnessBoost: 0.75 });

  const cushionMat = new THREE.MeshStandardMaterial({
    color: 0x5c7221,
    map: texLib.moss.map,
    roughness: 0.95,
    metalness: 0.0
  });
  enhanceMaterialWithAtmo(cushionMat, { cacheKey: 'ls_moss_cushion_v5', wetnessBoost: 0.10 });

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

  // Reusable lightweight sculpted basalt crags, spires & Icelandic botanical geometries
  const boulderGeoA = createNaturalBasaltRockGeo(11, 2, 0.78);
  const boulderGeoB = createJaggedLavaCragGeo(37);
  const spireGeo = createVolcanicSpireGeo(83);
  const cobbleGeo = createFacetedCobbleGeo(67);
  const stoneClusterGeo = createSmallStoneClusterGeo();
  const cushionGeo = createMossCushionGeo();
  const grassGeo = createTussockGrassGeo();
  const lupinGeo = createLupinClusterGeo();
  const bushGeo = createIcelandicBushGeo();
  const cottonGeo = createCottonGrassGeo();

  // Authentic Multi-Color Icelandic Lupin Palette (setHex converts sRGB -> linear properly so colors stay rich & velvety!)
  const LUPIN_PALETTE = [
    new THREE.Color().setHex(0x4a2ea8), // Deep Royal Icelandic Violet-Indigo
    new THREE.Color().setHex(0x305bc6), // Nordic Cornflower / Periwinkle Blue
    new THREE.Color().setHex(0xc44a88), // Dusty Heather Rose-Pink
    new THREE.Color().setHex(0x82287e), // Deep Plum-Amethyst Magenta
    new THREE.Color().setHex(0x7c5ad4), // Wild Lavender-Lilac
    new THREE.Color().setHex(0xe2dcd0)  // Natural Creamy Ivory-White morph
  ];

  // Natural Weathered Grey-Slate & Warm Taupe Icelandic Stone/Cobble Palette (harmonious, never black dots!)
  const STONE_PALETTE = [
    new THREE.Color().setHex(0x525960), // Weathered medium-dark slate
    new THREE.Color().setHex(0x697076), // Cool grey weathered river stone
    new THREE.Color().setHex(0x82888a), // Pale lichen-dusted grey cobble
    new THREE.Color().setHex(0x746b5f), // Warm weathered volcanic sandstone-taupe
    new THREE.Color().setHex(0x5c6853)  // Mossy grey-olive fieldstone
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
    const boulderMatsB = [];
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
        dummy.position.set(lx, by - s * 0.20, lz);
        dummy.rotation.set(hash2i(i, 1, 9) * 0.6, hash2i(i, 2, 9) * 6.28, hash2i(i, 3, 9) * 0.6);
        dummy.scale.set(s * 1.25, s * 0.80, s * 1.05);
        dummy.updateMatrix();
        (i % 2 === 0 ? boulderMatsA : boulderMatsB).push(dummy.matrix.clone());
      }
    }

    // 2. Geologically Clustered Basalt Rock Outcrops, Boulder Gardens & Riverbank Shoals (zero random isolated rock peppering!)
    // Hero boulders persist to LOD2 (720m); each outcrop grades naturally: hero boulders -> companion rocks -> cobbles -> pebbles!
    const halfChunkRock = CHUNK_SIZE * 0.49;
    const outcropCenters = lod === 0 ? 48 : lod === 1 ? 24 : 14;
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

      const rockField = fbm2(wx0 * 0.028 + 2.1, wz0 * 0.028 - 4.7, 2, 419);
      const hRand = hash2i(i, cx * 19 + cz * 31, 419);

      const inRiver = tmpSample.riverMask > 0.12 && hRand > 0.24;
      const inOutcrop = (tmpSample.scree > 0.28 && hRand > 0.34) || (rockField > 0.54 && hRand > 0.42);
      if (!inRiver && !inOutcrop) continue;

      // Rare dramatic volcanic crag pinnacle rising from lava plains / rocky ridges (surrounded by clustered boulders!)
      if (!inRiver && rockField > 0.62 && tmpSample.scree > 0.28 && tmpSample.cliff < 0.35 && hRand > 0.94 && spireMats.length < 2) {
        const spSc = 3.2 + hash2i(i, 59, 509) * 4.4;
        dummy.position.set(cx0, tmpSample.height - 0.65, cz0);
        dummy.rotation.set((hash2i(i, 61, 509) - 0.5) * 0.12, hash2i(i, 63, 509) * 6.28, (hash2i(i, 65, 509) - 0.5) * 0.12);
        dummy.scale.set(spSc * 1.08, spSc * 1.15, spSc * 0.96);
        dummy.updateMatrix();
        spireMats.push(dummy.matrix.clone());
        colliders.push({ x: wx0, z: wz0, r: spSc * 0.92 });
      }

      // Elongated geological outcrop orientation (rocks fracture & tumble along natural strike lines!)
      const strikeYaw = hash2i(i, cx * 13 + cz * 29, 501) * Math.PI * 2;
      const sCos = Math.cos(strikeYaw);
      const sSin = Math.sin(strikeYaw);
      const stretch = 1.25 + hash2i(i, 5, 503) * 0.75;

      // Cluster 2..5 boulders tightly per outcrop (1..2 anchor boulders + smaller companion rocks nestled beside them!)
      const bCount = lod === 0
        ? (inRiver ? (3 + Math.floor(hash2i(i, 7, 505) * 3)) : (2 + Math.floor(hash2i(i, 7, 505) * 4)))
        : (lod === 1 ? 2 : 1);

      for (let b = 0; b < bCount; b++) {
        const ang = hash2i(i * 11 + b, cx * 7 + cz * 13, 511) * Math.PI * 2;
        const rFrac = b === 0 ? 0.0 : (0.28 + Math.pow(hash2i(b * 17 + i, cz * 9 + cx, 513), 0.85) * 0.72);
        const rad = rFrac * (inRiver ? 5.2 : 6.2);
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

        const isCrag = !inRiver && hash2i(i + b * 3, 29, 503) > 0.35;
        const coreScale = b === 0 ? 1.18 : mix(0.92, 0.48, rFrac);
        const baseSc = inRiver
          ? (0.58 + hash2i(i + b * 5, 31, 503) * 1.25)
          : (isCrag ? (1.05 + hash2i(i + b * 5, 31, 503) * 2.15) : (0.72 + hash2i(i + b * 5, 31, 503) * 1.55));
        const sc = baseSc * coreScale;

        dummy.position.set(lx, tmpSample.height + (inRiver ? sc * 0.04 : -sc * 0.26), lz);
        dummy.rotation.set(hash2i(i + b, 32, 503) * 0.38, hash2i(i + b, 33, 503) * 6.28, hash2i(i + b, 34, 503) * 0.38);
        dummy.scale.set(sc * 1.30, sc * (isCrag ? 0.88 : 0.70), sc * 1.06);
        dummy.updateMatrix();
        (isCrag ? boulderMatsB : boulderMatsA).push(dummy.matrix.clone());
        if (sc > 1.25) colliders.push({ x: wx, z: wz, r: sc * 0.88 });
      }

      // Natural frost-heaved talus apron of cobbles & angular pebbles spilling around every LOD0 rock outcrop!
      if (lod === 0) {
        const satCobbles = 5 + Math.floor(hash2i(i, cx + cz * 7, 561) * 5);
        for (let k = 0; k < satCobbles && cobbleMats.length < 440; k++) {
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
          const csc = (0.22 + hash2i(i + k, 71, 577) * 0.40) * mix(1.12, 0.72, dist / 8.6);
          dummy.position.set(slx, sh - csc * 0.18, slz);
          dummy.rotation.set(hash2i(k, i, 587) * 0.8, hash2i(i, k, 593) * 6.28, hash2i(k + 2, i, 599) * 0.8);
          dummy.scale.set(csc * 1.32, csc * 0.68, csc * 1.05);
          dummy.updateMatrix();
          cobbleMats.push(dummy.matrix.clone());
          cobbleColors.push(pickStoneColor(i * 11 + k, cx * 17 + cz));
        }

        const satStones = 4 + Math.floor(hash2i(i, cz + cx * 11, 603) * 4);
        for (let k = 0; k < satStones && stoneMats.length < 460; k++) {
          const pang = hash2i(i * 7 + k, cx + 19, 601) * Math.PI * 2;
          const pdist = 1.6 + Math.pow(hash2i(k * 5, i * 11, 605), 0.75) * 7.8;
          const plx = cx0 + Math.cos(pang) * pdist;
          const plz = cz0 + Math.sin(pang) * pdist;
          if (Math.abs(plx) > halfChunkRock || Math.abs(plz) > halfChunkRock) continue;
          const pwx = ox + plx;
          const pwz = oz + plz;
          if (isInsideBuildingFootprint(pwx, pwz)) continue;
          const ph = getTerrainHeight(pwx, pwz);
          const ps = 0.84 + hash2i(i + k, 83, 607) * 0.92;
          dummy.position.set(plx, ph - 0.01, plz);
          dummy.rotation.set(0, hash2i(i + k, 87, 607) * 6.28, 0);
          dummy.scale.set(ps, ps * 0.90, ps);
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
        for (let k = 0; k < cCount && cobbleMats.length < 440; k++) {
          const ang = hash2i(i * 17 + k, cx * 19 + cz, 485) * Math.PI * 2;
          const rFrac = k === 0 ? 0.0 : Math.pow(hash2i(k * 9 + i, cz * 13 + cx, 487), 0.72);
          const lx = cx0 + Math.cos(ang) * rFrac * pRad;
          const lz = cz0 + Math.sin(ang) * rFrac * pRad;
          if (Math.abs(lx) > halfChunkRock || Math.abs(lz) > halfChunkRock) continue;
          const wx = ox + lx;
          const wz = oz + lz;
          if (isInsideBuildingFootprint(wx, wz)) continue;
          const hy = k === 0 ? tmpSample.height : getTerrainHeight(wx, wz);
          const sc = (0.20 + hash2i(i + k, 19, 487) * 0.36) * mix(1.14, 0.72, rFrac);
          dummy.position.set(lx, hy - sc * 0.20, lz);
          dummy.rotation.set(hash2i(i + k, 21, 487) * 0.7, hash2i(i + k, 22, 487) * 6.28, hash2i(i + k, 23, 487) * 0.7);
          dummy.scale.set(sc * 1.34, sc * 0.66, sc * 1.05);
          dummy.updateMatrix();
          cobbleMats.push(dummy.matrix.clone());
          cobbleColors.push(pickStoneColor(i + k + cx * 31, cz * 43 + i));
        }

        const sCount = 4 + Math.floor(hash2i(i, 27, 521) * 5);
        for (let k = 0; k < sCount && stoneMats.length < 460; k++) {
          const ang = hash2i(i * 19 + k, cx * 23 + cz, 523) * Math.PI * 2;
          const rFrac = Math.pow(hash2i(k * 11 + i, cz * 17 + cx, 527), 0.75);
          const lx = cx0 + Math.cos(ang) * rFrac * (pRad * 1.25);
          const lz = cz0 + Math.sin(ang) * rFrac * (pRad * 1.25);
          if (Math.abs(lx) > halfChunkRock || Math.abs(lz) > halfChunkRock) continue;
          const wx = ox + lx;
          const wz = oz + lz;
          if (isInsideBuildingFootprint(wx, wz)) continue;
          const hy = getTerrainHeight(wx, wz);
          const s = (nearFeature ? 0.90 : 0.76) + hash2i(i + k, 41, 547) * 0.96;
          dummy.position.set(lx, hy - 0.01, lz);
          dummy.rotation.set(0, hash2i(i + k, 42, 547) * 6.28, 0);
          dummy.scale.set(s, s * 0.92, s);
          dummy.updateMatrix();
          stoneMats.push(dummy.matrix.clone());
          stoneColors.push(pickStoneColor((i + k) * 3 + cx * 19, cz * 37 + i));
        }
      }
    }

    // 4. Ecologically Clustered Icelandic Flora: Lupin Flower Colonies, Heather Thickets, Meadow Grass Swales & Cotton Grass Clumps
    const halfChunk = CHUNK_SIZE * 0.49;

    // 4a) Multi-Colored Icelandic Lupin Flower Colonies (lush tightly clustered drifts of 5..11 blooms with tall cores & feathered edges!)
    const lupinCenters = lod === 0 ? 82 : lod === 1 ? 22 : 0;
    const maxLupins = lod === 0 ? 330 : 60;
    for (let i = 0; i < lupinCenters && lupinMats.length < maxLupins; i++) {
      const cx0 = (hash2i(cx * 131 + i, cz * 79, 613) - 0.5) * CHUNK_SIZE;
      const cz0 = (hash2i(cx * 61, cz * 113 + i, 619) - 0.5) * CHUNK_SIZE;
      const wx0 = ox + cx0;
      const wz0 = oz + cz0;
      if (isInsideBuildingFootprint(wx0, wz0)) continue;

      sampleWorld(wx0, wz0, tmpSample);
      if (tmpSample.moss < 0.24 || tmpSample.height > 76 || tmpSample.path > 0.28 || tmpSample.riverMask > 0.20 || tmpSample.cliff > 0.40 || tmpSample.snow > 0.18 || tmpSample.glacier > 0.10) continue;
      getTerrainNormal(wx0, wz0, norm, 0.9);
      if (norm.y < 0.70) continue;

      const lupinField = fbm2(wx0 * 0.022 + 3.4, wz0 * 0.022 - 7.1, 2, 647);
      if (lupinField < 0.45) continue;

      // Dominant colony hue + organic elliptical drift orientation so beds flow naturally across slopes
      const hueField = fbm2(wx0 * 0.038 - 11.3, wz0 * 0.038 + 6.8, 2, 709);
      const driftYaw = hash2i(i, cx * 17 + cz * 29, 681) * Math.PI * 2;
      const driftCos = Math.cos(driftYaw);
      const driftSin = Math.sin(driftYaw);
      const stretch = 1.20 + hash2i(i, 7, 683) * 0.65;
      const clusterRadius = 1.55 + smoothstep(0.45, 0.76, lupinField) * 2.25;
      const count = lod === 0
        ? (5 + Math.floor(hash2i(i, cx + cz * 13, 687) * 5) + (lupinField > 0.60 ? 2 : 0))
        : (2 + Math.floor(hash2i(i, cx + cz * 13, 687) * 2));

      for (let c = 0; c < count && lupinMats.length < maxLupins; c++) {
        const ang = hash2i(i * 19 + c, cz * 11 + cx, 689) * Math.PI * 2;
        // Bias plants denser toward center of each flower colony (r^0.75)
        const rFrac = Math.pow(hash2i(c * 23 + i, cx * 7 + cz, 691), 0.75);
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

        // Taller, fuller blooms in colony core -> smaller buds around feathered rim
        const coreBoost = mix(1.16, 0.74, rFrac);
        const s = (0.78 + hash2i(i + c * 13, 61, 683) * 0.62) * coreBoost;
        dummy.position.set(lxC, tmpSample.height - 0.05, lzC);
        dummy.rotation.set(
          (hash2i(i + c, 62, 683) - 0.5) * 0.14,
          hash2i(i + c, 63, 683) * 6.28,
          (hash2i(i + c, 64, 683) - 0.5) * 0.14
        );
        dummy.scale.set(s, s * (0.90 + hash2i(i + c, 65, 683) * 0.32), s);
        dummy.updateMatrix();
        lupinMats.push(dummy.matrix.clone());

        // Cohesive colony palette with natural ~11% white morph & subtle neighbor variation
        const rCol = hash2i(i + c * 7, cx * 13 + cz * 17, 719);
        const jitteredHue = clamp(hueField + (rCol - 0.5) * 0.18, 0.0, 1.0);
        let palIdx;
        if (rCol > 0.89) palIdx = 5;
        else if (jitteredHue < 0.36) palIdx = 0;
        else if (jitteredHue < 0.48) palIdx = 1;
        else if (jitteredHue < 0.58) palIdx = 2;
        else if (jitteredHue < 0.67) palIdx = 4;
        else palIdx = 3;

        const baseC = LUPIN_PALETTE[palIdx];
        const shade = 0.86 + hash2i(i + c, 99, 727) * 0.28;
        tmpColor.setRGB(baseC.r * shade, baseC.g * shade, baseC.b * shade);
        lupinColors.push(tmpColor.clone());
      }
    }

    // 4b) Clustered Russet-Tipped Icelandic Heather & Berry Bush Thickets (3..7 shrubs huddled tightly with open clearings between!)
    const bushCenters = lod === 0 ? 68 : lod === 1 ? 18 : 0;
    const maxBushes = lod === 0 ? 210 : 42;
    for (let i = 0; i < bushCenters && bushMats.length < maxBushes; i++) {
      const cx0 = (hash2i(cx * 149 + i, cz * 83, 653) - 0.5) * CHUNK_SIZE;
      const cz0 = (hash2i(cx * 71, cz * 127 + i, 659) - 0.5) * CHUNK_SIZE;
      const wx0 = ox + cx0;
      const wz0 = oz + cz0;
      if (isInsideBuildingFootprint(wx0, wz0)) continue;

      sampleWorld(wx0, wz0, tmpSample);
      if (tmpSample.moss < 0.22 || tmpSample.path > 0.30 || tmpSample.riverMask > 0.22 || tmpSample.cliff > 0.44 || tmpSample.snow > 0.20 || tmpSample.glacier > 0.12) continue;
      getTerrainNormal(wx0, wz0, norm, 0.9);
      if (norm.y < 0.68) continue;

      const bushField = fbm2(wx0 * 0.032 - 5.2, wz0 * 0.032 + 2.9, 2, 659);
      if (bushField < 0.42) continue;

      const thicketRad = 1.25 + smoothstep(0.42, 0.76, bushField) * 1.85;
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

        // Larger mature central bush surrounded by lower creeping satellite shoots
        const coreScale = c === 0 ? 1.18 : mix(1.02, 0.68, rFrac);
        const s = (0.78 + hash2i(i + c * 11, 51, 661) * 0.62) * coreScale;
        dummy.position.set(lxC, tmpSample.height - 0.05, lzC);
        dummy.rotation.set(0, hash2i(i + c, 52, 661) * 6.28, 0);
        dummy.scale.set(s * 1.28, s * 0.90, s * 1.28);
        dummy.updateMatrix();
        bushMats.push(dummy.matrix.clone());

        // Tuck 1 sheltered grass clump right beside thicket perimeter on LOD0 for natural plant association!
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
      // 4c) Clustered Arctic Cotton Grass Clumps (3..5 delicate white plumes grouped in damp hollows & stream edges)
      const cottonCenters = 26;
      for (let i = 0; i < cottonCenters && cottonMats.length < 76; i++) {
        const cx0 = (hash2i(cx * 167 + i, cz * 97, 701) - 0.5) * CHUNK_SIZE;
        const cz0 = (hash2i(cx * 89, cz * 151 + i, 703) - 0.5) * CHUNK_SIZE;
        const wx0 = ox + cx0;
        const wz0 = oz + cz0;
        if (isInsideBuildingFootprint(wx0, wz0)) continue;
        sampleWorld(wx0, wz0, tmpSample);
        if (tmpSample.path > 0.28 || tmpSample.riverMask > 0.24 || tmpSample.cliff > 0.42 || tmpSample.snow > 0.18) continue;
        const wetSpot = tmpSample.wetness > 0.20 || tmpSample.riverMask > 0.04 || fbm2(wx0 * 0.045, wz0 * 0.045, 2, 707) > 0.66;
        if (!wetSpot) continue;

        const cCount = 3 + Math.floor(hash2i(i, cx * 7 + cz, 709) * 3);
        for (let c = 0; c < cCount && cottonMats.length < 76; c++) {
          const ang = hash2i(i * 9 + c, cx + cz * 17, 711) * Math.PI * 2;
          const r = c === 0 ? 0.0 : (0.35 + hash2i(c, i * 11, 713) * 1.25);
          const lxC = cx0 + Math.cos(ang) * r;
          const lzC = cz0 + Math.sin(ang) * r;
          if (Math.abs(lxC) > halfChunk || Math.abs(lzC) > halfChunk) continue;
          const hy = c === 0 ? tmpSample.height : getTerrainHeight(ox + lxC, oz + lzC);
          const s = 0.78 + hash2i(i + c, 71, 709) * 0.52;
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
    addInstanced(boulderGeoA, boulderMat, boulderMatsA, true);
    addInstanced(boulderGeoB, boulderMat, boulderMatsB, true);
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
