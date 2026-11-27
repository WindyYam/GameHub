import * as THREE from 'three';

/**
 * Merges an array of BufferGeometries into a single BufferGeometry, preserving
 * position, normal, uv, and optional vertex color attributes cleanly.
 */
export function mergeGeometries(geos) {
  let totalVerts = 0;
  let hasColor = false;
  const prepared = [];

  for (let i = 0; i < geos.length; i++) {
    const g = geos[i];
    if (!g) continue;
    const ni = g.index ? g.toNonIndexed() : g;
    if (ni.attributes.color) hasColor = true;
    totalVerts += ni.attributes.position.count;
    prepared.push({ src: g, ni });
  }

  const posArr = new Float32Array(totalVerts * 3);
  const normArr = new Float32Array(totalVerts * 3);
  const uvArr = new Float32Array(totalVerts * 2);
  const colArr = hasColor ? new Float32Array(totalVerts * 3) : null;

  let offset = 0;
  for (let i = 0; i < prepared.length; i++) {
    const { src, ni } = prepared[i];
    const p = ni.attributes.position;
    const n = ni.attributes.normal;
    const u = ni.attributes.uv;
    const c = ni.attributes.color;
    const count = p.count;

    posArr.set(p.array, offset * 3);
    if (n) {
      normArr.set(n.array, offset * 3);
    } else {
      for (let k = 0; k < count; k++) {
        normArr[(offset + k) * 3 + 1] = 1.0;
      }
    }
    if (u) {
      uvArr.set(u.array, offset * 2);
    }
    if (colArr) {
      if (c) {
        colArr.set(c.array, offset * 3);
      } else {
        for (let k = 0; k < count; k++) {
          const ci = (offset + k) * 3;
          colArr[ci] = colArr[ci + 1] = colArr[ci + 2] = 1.0;
        }
      }
    }
    offset += count;
    if (src.index) ni.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  if (colArr) out.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  return out;
}

/**
 * Scales BoxGeometry UVs to consistent real-world architectural story/bay dimensions
 * so dozens of skyscrapers & brick buildings share cached PBR materials with zero cloning
 * and never stretch or slice window bays mid-pane.
 */
export function scaleBoxUVs(geo, w, h, d, tileW = 12.0, tileH = 14.4, bayDiv = 8) {
  const uv = geo.attributes.uv;
  const norm = geo.attributes.normal;
  if (!uv || !norm) return geo;

  const snapRep = (len, tile) => Math.max(1 / bayDiv, Math.round((len / tile) * bayDiv) / bayDiv);
  const repX = snapRep(w, tileW);
  const repZ = snapRep(d, tileW);
  const repY = Math.max(0.25, Math.round((h / tileH) * 4) / 4);
  const repTopZ = snapRep(d, tileW);

  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (nx > 0.7) {
      uv.setXY(i, u * repZ, v * repY);
    } else if (ny > 0.7) {
      uv.setXY(i, u * repX, v * repTopZ);
    } else {
      uv.setXY(i, u * repX, v * repY);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Centralized Modern Game Asset Manager:
 * Holds deduplicated registries for Textures, Geometries, Materials, and multi-LOD Prefabs.
 */
export function createAssetManager(texLib) {
  const textures = new Map();
  const geometries = new Map();
  const materials = new Map();
  const prefabs = new Map();

  // Auto-register texture library assets
  if (texLib) {
    Object.entries(texLib).forEach(([key, val]) => {
      if (!val) return;
      if (val.isTexture) {
        textures.set(key, val);
      } else {
        if (val.map) textures.set(`${key}.map`, val.map);
        if (val.normalMap) textures.set(`${key}.normal`, val.normalMap);
        if (val.roughnessMap) textures.set(`${key}.rough`, val.roughnessMap);
        if (val.emissiveMap) textures.set(`${key}.emissive`, val.emissiveMap);
      }
    });
  }

  function registerTexture(id, tex) {
    textures.set(id, tex);
    return tex;
  }

  function getTexture(id) {
    return textures.get(id) || null;
  }

  function registerGeometry(id, geo) {
    geometries.set(id, geo);
    return geo;
  }

  function getGeometry(id) {
    return geometries.get(id) || null;
  }

  function registerMaterial(id, mat) {
    materials.set(id, mat);
    return mat;
  }

  function getMaterial(id) {
    return materials.get(id) || null;
  }

  function registerPrefab(id, spec) {
    prefabs.set(id, spec);
    return spec;
  }

  function getPrefab(id) {
    return prefabs.get(id) || null;
  }

  function getStats() {
    return {
      textures: textures.size,
      geometries: geometries.size,
      materials: materials.size,
      prefabs: prefabs.size
    };
  }

  function disposeAll() {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    geometries.clear();
    materials.clear();
    textures.clear();
    prefabs.clear();
  }

  return {
    registerTexture,
    getTexture,
    registerGeometry,
    getGeometry,
    registerMaterial,
    getMaterial,
    registerPrefab,
    getPrefab,
    getStats,
    disposeAll
  };
}

/**
 * Spatial-grid + Frustum-culled Multi-LOD InstancedBatch:
 * Buckets visible instances into LOD0 (near high-detail), LOD1 (mid simplified),
 * and LOD2 (far impostor/low-poly) InstancedMesh pools in O(visibleCells).
 */
export function createLODInstancedBatch(assetManager, prefabId, instances, options = {}) {
  const prefab = assetManager.getPrefab(prefabId);
  if (!prefab || !prefab.lods || prefab.lods.length === 0) {
    throw new Error(`Missing prefab or LODs for '${prefabId}'`);
  }

  const cellSize = options.cellSize || 140;
  const maxDist = options.maxDist || prefab.lods[prefab.lods.length - 1].dist;
  const group = new THREE.Group();
  const hasColors = instances.some((inst) => !!inst.color);

  const tiers = prefab.lods.map((lod, idx) => {
    const cap = Math.min(instances.length, lod.maxVisible || instances.length);
    const mesh = new THREE.InstancedMesh(lod.geo, lod.mat, Math.max(1, cap));
    mesh.castShadow = !!lod.castShadow;
    mesh.receiveShadow = lod.receiveShadow !== false;
    mesh.frustumCulled = false;
    mesh.count = 0;
    if (hasColors) {
      const dummyCol = new THREE.Color(1, 1, 1);
      for (let i = 0; i < Math.max(1, cap); i++) {
        mesh.setColorAt(i, dummyCol);
      }
    }
    group.add(mesh);
    return {
      idx,
      maxDist: lod.dist,
      maxDistSq: lod.dist * lod.dist,
      mesh,
      cap: Math.max(1, cap),
      count: 0
    };
  });

  // Spatial bucket grid
  const cells = new Map();
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    const cx = Math.floor(inst.x / cellSize);
    const cz = Math.floor(inst.z / cellSize);
    const key = `${cx},${cz}`;
    let cell = cells.get(key);
    if (!cell) {
      const centerX = (cx + 0.5) * cellSize;
      const centerZ = (cz + 0.5) * cellSize;
      cell = {
        center: new THREE.Vector3(centerX, inst.y || 15, centerZ),
        radius: cellSize * 0.78 + 26,
        minY: inst.y || 0,
        maxY: inst.y || 0,
        items: []
      };
      cells.set(key, cell);
    } else {
      cell.minY = Math.min(cell.minY, inst.y || 0);
      cell.maxY = Math.max(cell.maxY, inst.y || 0);
      cell.center.y = (cell.minY + cell.maxY) * 0.5 + 8.0;
      cell.radius = Math.max(cell.radius, cellSize * 0.78 + (cell.maxY - cell.minY) * 0.5 + 24);
    }
    cell.items.push(inst);
  }
  const cellList = Array.from(cells.values());
  const sphere = new THREE.Sphere();
  const countsOut = { lod0: 0, lod1: 0, lod2: 0, total: instances.length };

  function update(camera, frustum) {
    for (let t = 0; t < tiers.length; t++) tiers[t].count = 0;

    const camX = camera.position.x;
    const camY = camera.position.y;
    const camZ = camera.position.z;
    const tierCount = tiers.length;

    for (let c = 0; c < cellList.length; c++) {
      const cell = cellList[c];
      const cdx = cell.center.x - camX;
      const cdy = cell.center.y - camY;
      const cdz = cell.center.z - camZ;
      const maxReach = maxDist + cell.radius;
      if (cdx * cdx + cdy * cdy * 0.25 + cdz * cdz > maxReach * maxReach) continue;

      sphere.center.copy(cell.center);
      sphere.radius = cell.radius;
      if (frustum && !frustum.intersectsSphere(sphere)) continue;

      const items = cell.items;
      for (let i = 0; i < items.length; i++) {
        const inst = items[i];
        const dx = inst.x - camX;
        const dz = inst.z - camZ;
        const dy = (inst.y || 0) - camY;
        const dSq = dx * dx + dz * dz + dy * dy * 0.25;

        for (let t = 0; t < tierCount; t++) {
          const tier = tiers[t];
          if (dSq <= tier.maxDistSq) {
            if (tier.count < tier.cap) {
              tier.mesh.setMatrixAt(tier.count, inst.matrix);
              if (hasColors && inst.color) {
                tier.mesh.setColorAt(tier.count, inst.color);
              }
              tier.count++;
            }
            break;
          }
        }
      }
    }

    for (let t = 0; t < tiers.length; t++) {
      const tier = tiers[t];
      tier.mesh.count = tier.count;
      tier.mesh.instanceMatrix.needsUpdate = true;
      if (hasColors && tier.mesh.instanceColor) tier.mesh.instanceColor.needsUpdate = true;
    }

    countsOut.lod0 = tiers[0] ? tiers[0].count : 0;
    countsOut.lod1 = tiers[1] ? tiers[1].count : 0;
    countsOut.lod2 = tiers[2] ? tiers[2].count : 0;
    return countsOut;
  }

  return { id: prefabId, group, update, counts: countsOut };
}

/**
 * Coordinates both LODInstancedBatches (trees, foliage, rocks, streetlights, props)
 * and individual THREE.LOD objects (buildings, vehicles, castle, watchtowers).
 */
export function createLODManager() {
  const batches = [];
  const lodObjects = [];
  const frustum = new THREE.Frustum();
  const projScreenMatrix = new THREE.Matrix4();
  const lastCamPos = new THREE.Vector3(1e9, 1e9, 1e9);
  const lastCamDir = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();

  const stats = {
    lod0: 0,
    lod1: 0,
    lod2: 0,
    lodObjects: 0,
    batches: 0
  };

  function addBatch(batch) {
    batches.push(batch);
    stats.batches = batches.length;
    return batch;
  }

  function addLODObject(lod) {
    lodObjects.push(lod);
    stats.lodObjects = lodObjects.length;
    return lod;
  }

  function update(camera, force = false) {
    camera.getWorldDirection(tmpDir);
    const moved = camera.position.distanceToSquared(lastCamPos) > 16.0; // > 4.0m
    const rotated = tmpDir.dot(lastCamDir) < 0.994; // > ~6.2 deg

    if (!force && !moved && !rotated) return;

    lastCamPos.copy(camera.position);
    lastCamDir.copy(tmpDir);

    camera.updateMatrixWorld();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);

    let l0 = 0;
    let l1 = 0;
    let l2 = 0;
    for (let i = 0; i < batches.length; i++) {
      const c = batches[i].update(camera, frustum);
      l0 += c.lod0;
      l1 += c.lod1;
      l2 += c.lod2;
    }

    for (let i = 0; i < lodObjects.length; i++) {
      lodObjects[i].update(camera);
    }

    stats.lod0 = l0;
    stats.lod1 = l1;
    stats.lod2 = l2;
  }

  function getStats() {
    return { ...stats };
  }

  return { addBatch, addLODObject, update, getStats };
}
