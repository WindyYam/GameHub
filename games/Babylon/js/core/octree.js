// js/core/octree.js — 3D Spatial Octree, hierarchical frustum/distance/Hi-Z occlusion culling, and adaptive LOD manager.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { createOcclusion } from './occlusion.js';

const MAX_ITEMS = 12;
const MAX_DEPTH = 7;
const SHADOW_BUBBLE = 85; // keep nearby meshes visible even behind camera so shadows fall into view

class OctreeNode {
  constructor(bounds, depth = 0) {
    this.bounds = bounds;
    this.depth = depth;
    this.items = [];
    this.children = null;
  }

  subdivide() {
    const min = this.bounds.min, max = this.bounds.max;
    const mid = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    this.children = [];
    for (let ix = 0; ix < 2; ix++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let iz = 0; iz < 2; iz++) {
          const bMin = new THREE.Vector3(
            ix ? mid.x : min.x,
            iy ? mid.y : min.y,
            iz ? mid.z : min.z
          );
          const bMax = new THREE.Vector3(
            ix ? max.x : mid.x,
            iy ? max.y : mid.y,
            iz ? max.z : mid.z
          );
          this.children.push(new OctreeNode(new THREE.Box3(bMin, bMax), this.depth + 1));
        }
      }
    }
  }

  insert(item) {
    if (!this.bounds.intersectsBox(item.box)) return false;
    if (!this.children) {
      this.items.push(item);
      if (this.items.length > MAX_ITEMS && this.depth < MAX_DEPTH) {
        this.subdivide();
        const prev = this.items;
        this.items = [];
        for (const it of prev) {
          let placed = false;
          for (const ch of this.children) {
            if (ch.bounds.containsBox(it.box)) {
              ch.insert(it);
              placed = true;
              break;
            }
          }
          if (!placed) this.items.push(it);
        }
      }
      return true;
    }
    for (const ch of this.children) {
      if (ch.bounds.containsBox(item.box)) return ch.insert(item);
    }
    this.items.push(item);
    return true;
  }
}

export function createOctree(ctx) {
  const rootGroup = ctx.geom.root;
  const occlusion = createOcclusion(ctx);
  const _frustum = new THREE.Frustum();
  const _projScreen = new THREE.Matrix4();
  const _box = new THREE.Box3();
  const _camPos = new THREE.Vector3();

  const worldBounds = new THREE.Box3(
    new THREE.Vector3(-7500, -250, -7500),
    new THREE.Vector3(7500, 600, 7500)
  );

  let root = new OctreeNode(worldBounds.clone(), 0);
  const allItems = [];
  const indexedSet = new WeakSet();
  const hiddenByOctree = new Set();

  // Adaptive performance & LOD state
  const state = {
    enabled: true,
    occlusionEnabled: true,
    lodScale: 1.15,
    maxDrawDist: 2200,
    fps: 60,
    avgFrameMs: 16.6,
    lastTime: performance.now(),
    totalMeshes: 0,
    visibleMeshes: 0,
    culledMeshes: 0,
    occludedMeshes: 0,
    nodesVisited: 0,
    nodesCulled: 0,
  };
  let lastChildCount = -1;

  function computeMeshBox(mesh) {
    const g = mesh.geometry;
    if (!g) return null;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingBox) return null;
    const b = g.boundingBox.clone();
    mesh.updateMatrixWorld();
    b.applyMatrix4(mesh.matrixWorld);
    // Expand slightly for instanced meshes if needed
    if (mesh.isInstancedMesh && mesh.boundingBox) {
      b.copy(mesh.boundingBox).applyMatrix4(mesh.matrixWorld);
    }
    return b;
  }

  function indexMesh(mesh) {
    if (indexedSet.has(mesh) || !mesh.isMesh || !mesh.geometry) return;
    const box = computeMeshBox(mesh);
    if (!box || box.isEmpty()) return;
    indexedSet.add(mesh);
    const item = { mesh, box, shadowProxy: !!mesh.userData.shadowProxy };
    allItems.push(item);
    if (!worldBounds.containsBox(box)) {
      worldBounds.union(box);
    }
    root.insert(item);
    state.totalMeshes = allItems.length;
  }

  function rebuild() {
    root = new OctreeNode(worldBounds.clone(), 0);
    for (const it of allItems) root.insert(it);
  }

  function syncNewMeshes() {
    let added = false;
    rootGroup.traverse((o) => {
      if (o.isMesh && !indexedSet.has(o)) {
        indexMesh(o);
        added = true;
      }
    });
    if (added && allItems.length > 0 && !worldBounds.equals(root.bounds)) {
      rebuild();
    }
  }

  // Initial index of all meshes in geom.root
  syncNewMeshes();

  function restore() {
    for (const m of hiddenByOctree) {
      m.visible = true;
    }
    hiddenByOctree.clear();
  }

  function updateAdaptive(dtMs) {
    if (dtMs <= 0 || dtMs > 500) return;
    state.avgFrameMs = state.avgFrameMs * 0.9 + dtMs * 0.1;
    state.fps = Math.round(1000 / Math.max(1, state.avgFrameMs));
    // Adaptive LOD scale: relax at >=52fps, tighten if <42fps
    if (state.avgFrameMs > 24) {
      state.lodScale = Math.min(2.4, state.lodScale + 0.04);
      state.maxDrawDist = Math.max(1200, state.maxDrawDist - 70);
    } else if (state.avgFrameMs < 18.5) {
      state.lodScale = Math.max(1.0, state.lodScale - 0.02);
      state.maxDrawDist = Math.min(3000, state.maxDrawDist + 40);
    }
  }

  function cullNode(node, maxDist, useOcc) {
    state.nodesVisited++;
    const dist = node.bounds.distanceToPoint(_camPos);
    if (dist > maxDist) {
      state.nodesCulled++;
      hideSubtree(node, false);
      return;
    }
    // Outside frustum AND outside nearby shadow-caster bubble -> cull entire octree branch
    if (dist > SHADOW_BUBBLE && !_frustum.intersectsBox(node.bounds)) {
      state.nodesCulled++;
      hideSubtree(node, false);
      return;
    }
    // Hierarchical-Z Occlusion Culling for entire octree branch
    if (useOcc && dist > SHADOW_BUBBLE && occlusion.isOccluded(_projScreen, node.bounds, _camPos.x, _camPos.y, _camPos.z)) {
      state.nodesCulled++;
      hideSubtree(node, true);
      return;
    }
    for (const it of node.items) {
      const m = it.mesh;
      if (!m.parent || !m.visible) continue;
      const d = it.box.distanceToPoint(_camPos);
      if (d > maxDist || (d > SHADOW_BUBBLE && !_frustum.intersectsBox(it.box))) {
        m.visible = false;
        hiddenByOctree.add(m);
        state.culledMeshes++;
      } else if (useOcc && d > SHADOW_BUBBLE && occlusion.isOccluded(_projScreen, it.box, _camPos.x, _camPos.y, _camPos.z)) {
        m.visible = false;
        hiddenByOctree.add(m);
        state.culledMeshes++;
        state.occludedMeshes++;
      } else {
        state.visibleMeshes++;
      }
    }
    if (node.children) {
      for (const ch of node.children) cullNode(ch, maxDist, useOcc);
    }
  }

  function hideSubtree(node, occluded) {
    for (const it of node.items) {
      const m = it.mesh;
      if (m.parent && m.visible) {
        m.visible = false;
        hiddenByOctree.add(m);
        state.culledMeshes++;
        if (occluded) state.occludedMeshes++;
      }
    }
    if (node.children) {
      for (const ch of node.children) hideSubtree(ch, occluded);
    }
  }

  function cull(camera, frame) {
    const now = performance.now();
    updateAdaptive(now - state.lastTime);
    state.lastTime = now;

    if (!state.enabled) return;
    if (rootGroup.children.length !== lastChildCount) {
      lastChildCount = rootGroup.children.length;
      syncNewMeshes();
    }

    camera.updateMatrixWorld();
    _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreen);
    _camPos.copy(camera.position);

    const useOcc = state.occlusionEnabled && occlusion.prepare(_projScreen, _camPos.x, _camPos.y, _camPos.z);

    // High aerial views need a larger far draw distance than ground-level 3rd-person play
    const camHeight = Math.max(0, _camPos.y);
    const maxDist = camHeight > 120 ? Math.max(state.maxDrawDist, 6500) : state.maxDrawDist;

    state.visibleMeshes = 0;
    state.culledMeshes = 0;
    state.occludedMeshes = 0;
    state.nodesVisited = 0;
    state.nodesCulled = 0;

    cullNode(root, maxDist, useOcc);
  }

  /** Spatial query for meshes intersecting an AABB (e.g., for local collision/inspection). */
  function queryBox(box, out = []) {
    const walk = (node) => {
      if (!node.bounds.intersectsBox(box)) return;
      for (const it of node.items) {
        if (it.mesh.parent && it.box.intersectsBox(box)) out.push(it.mesh);
      }
      if (node.children) for (const ch of node.children) walk(ch);
    };
    walk(root);
    return out;
  }

  return {
    state,
    get lodScale() { return state.enabled ? state.lodScale : 1.0; },
    restore,
    cull,
    queryBox,
    syncNewMeshes,
  };
}
