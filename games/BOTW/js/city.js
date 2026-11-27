import * as THREE from 'three';
import {
  CITY_BOUNDS,
  ROAD_X,
  ROAD_Z,
  HIGHWAY_SAMPLES,
  WATER_LEVEL,
  getQuayX,
  getCityTerraceY,
  isInCityBounds,
  getTerrainHeight,
  getHighwayInfo,
  hash2,
  clamp,
  mix
} from './noise.js';
import { ATMO_UNIFORMS, ATMO_GLSL_PARS, enhancePBRMaterial } from './atmosphere.js';
import { createBillboardTexture, createHighwaySignTexture } from './textures.js';
import { mergeGeometries, scaleBoxUVs, createLODInstancedBatch } from './assets.js';
import { generateCityLayout, insetPoly, pointInPoly, polyCentroid } from './cityLayout.js';

// ============================================================================
// 1. UNIFIED CITY GROUND HEIGHT LOOKUP (Walkable Piers, Bridges, Streets, Terraces)
// ============================================================================
const MARINA_PIER_Z = -560.0;
const _MARINA_QUAY_X = getQuayX(MARINA_PIER_Z);

export function getCityGroundY(x, z) {
  // Timber Marina Pier jutting east into Great Lake Hylia at z = -560
  if (x >= _MARINA_QUAY_X - 4.0 && x <= _MARINA_QUAY_X + 54.0 && Math.abs(z - MARINA_PIER_Z) <= 7.0) {
    return CITY_BOUNDS.y + 0.26;
  }

  // Ring Expressway & Lakeside Causeway Bridge outside city core
  const hw = getHighwayInfo(x, z);
  if (hw.dist <= 8.2 && !hw.inCity) {
    return hw.roadY;
  }

  // City Promenade, Streets & Terraced Foothill Districts
  if (isInCityBounds(x, z, 6.0)) {
    const qx = getQuayX(clamp(z, -1760.0, -140.0));
    if (x >= qx - 16.0 && x <= qx + 1.5 && z >= -1760.0 && z <= -140.0) {
      return CITY_BOUNDS.y + 0.28;
    }
    return getCityTerraceY(x, z) + 0.14;
  }

  return getTerrainHeight(x, z);
}

// ============================================================================
// 2. BABYLON HEIGHT-FIELD VERTEX AO BAKER (with Buried-Vertex Extrapolation!)
// ============================================================================
function createCityAOBaker(parcels) {
  const MIN_X = -1720.0;
  const MAX_X = -60.0;
  const MIN_Z = -1800.0;
  const MAX_Z = -100.0;
  const CELL = 4.0;
  const NX = Math.ceil((MAX_X - MIN_X) / CELL);
  const NZ = Math.ceil((MAX_Z - MIN_Z) / CELL);
  const hGrid = new Float32Array(NX * NZ);

  for (let iz = 0; iz < NZ; iz++) {
    const wz = MIN_Z + (iz + 0.5) * CELL;
    for (let ix = 0; ix < NX; ix++) {
      const wx = MIN_X + (ix + 0.5) * CELL;
      hGrid[iz * NX + ix] = getTerrainHeight(wx, wz);
    }
  }

  // Rasterize building heights cleanly into the AO heightfield
  for (let pi = 0; pi < parcels.length; pi++) {
    const p = parcels[pi];
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let vi = 0; vi < p.poly.p.length; vi++) {
      const pt = p.poly.p[vi];
      if (pt[0] < x0) x0 = pt[0];
      if (pt[0] > x1) x1 = pt[0];
      if (pt[1] < z0) z0 = pt[1];
      if (pt[1] > z1) z1 = pt[1];
    }
    const ix0 = Math.max(0, Math.floor((x0 - MIN_X) / CELL));
    const ix1 = Math.min(NX - 1, Math.ceil((x1 - MIN_X) / CELL));
    const iz0 = Math.max(0, Math.floor((z0 - MIN_Z) / CELL));
    const iz1 = Math.min(NZ - 1, Math.ceil((z1 - MIN_Z) / CELL));
    const mainTop = p.baseY + p.height;
    const courtPts = p.courtPoly ? p.courtPoly.p : null;

    for (let iz = iz0; iz <= iz1; iz++) {
      const wz = MIN_Z + (iz + 0.5) * CELL;
      for (let ix = ix0; ix <= ix1; ix++) {
        const wx = MIN_X + (ix + 0.5) * CELL;
        if (!pointInPoly(wx, wz, p.poly.p)) continue;
        if (courtPts && pointInPoly(wx, wz, courtPts)) continue;
        const idx = iz * NX + ix;
        if (mainTop > hGrid[idx]) hGrid[idx] = mainTop;
      }
    }
  }

  function sampleH(wx, wz) {
    const ix = clamp(Math.floor((wx - MIN_X) / CELL), 0, NX - 1);
    const iz = clamp(Math.floor((wz - MIN_Z) / CELL), 0, NZ - 1);
    return hGrid[iz * NX + ix];
  }

  const MARCH_DISTS = [3.5, 8.0, 15.0, 26.0, 42.0];
  const WALL_ANGLES = [-1.05, -0.52, 0.0, 0.52, 1.05];

  function evalWallRaw(x, y, z, nx, nz, groundY) {
    let occ = 0.0;
    let wSum = 0.0;
    for (let a = 0; a < WALL_ANGLES.length; a++) {
      const ang = WALL_ANGLES[a];
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const rx = nx * ca - nz * sa;
      const rz = nx * sa + nz * ca;
      let maxSin = 0.0;
      for (let s = 0; s < MARCH_DISTS.length; s++) {
        const d = MARCH_DISTS[s];
        const dh = sampleH(x + rx * d, z + rz * d) - y;
        if (dh > 0.2) {
          const sinA = dh / Math.hypot(dh, d);
          const falloff = 1.0 / (1.0 + d * 0.022);
          if (sinA * falloff > maxSin) maxSin = sinA * falloff;
        }
      }
      occ += maxSin * ca;
      wSum += ca;
    }
    const skyVis = 1.0 - clamp((occ / Math.max(wSum, 1.0)) * 0.85, 0.0, 0.55);
    const contactH = 2.6;
    const contactT = clamp((y - groundY) / contactH, 0.0, 1.0);
    const s = contactT * contactT * (3.0 - 2.0 * contactT);
    const groundAO = 0.62 + 0.38 * s;
    return clamp(skyVis * groundAO, 0.28, 1.0);
  }

  function wallAO(x, y, z, nx, nz, groundY) {
    if (y >= groundY - 0.02) return evalWallRaw(x, y, z, nx, nz, groundY);
    // Babylon buried-vertex extrapolation: ensures sloped foundation seam evaluates to full contact AO right at groundY!
    const ao0 = evalWallRaw(x, groundY, z, nx, nz, groundY);
    const ao1 = evalWallRaw(x, groundY + 1.8, z, nx, nz, groundY);
    const ex = ao0 - (ao1 - ao0) * ((groundY - y) / 1.8);
    return clamp(ex, 0.22, 1.0);
  }

  function upAO(x, y, z) {
    let occ = 0.0;
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const rx = Math.cos(ang);
      const rz = Math.sin(ang);
      let maxSin = 0.0;
      for (let s = 0; s < 4; s++) {
        const d = [4.0, 10.0, 20.0, 34.0][s];
        const dh = sampleH(x + rx * d, z + rz * d) - y;
        if (dh > 0.5) {
          const sinA = (dh / Math.hypot(dh, d)) * (1.0 / (1.0 + d * 0.025));
          if (sinA > maxSin) maxSin = sinA;
        }
      }
      occ += maxSin;
    }
    return clamp(1.0 - (occ / 8.0) * 0.72, 0.38, 1.0);
  }

  return { wallAO, upAO };
}

// ============================================================================
// 3. SPATIAL MATERIAL-TILE BATCH WRITER (256m x 256m Buckets + Vertex Attributes)
// ============================================================================
class CityTileBatcher {
  constructor() {
    this.buckets = new Map();
  }

  getBucket(tx, tz, matKey) {
    const key = `${tx},${tz}|${matKey}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = {
        tx,
        tz,
        matKey,
        pos: [],
        norm: [],
        uv: [],
        col: [],
        stag: [], // vec2: x = stagger threshold [0..1], y = groundY at column base (for foot grime!)
        idx: []
      };
      this.buckets.set(key, b);
    }
    return b;
  }

  addWallQuad(cx, cz, matKey, ax, ay0, az, bx, by0, bz, yTop, tileW, tileH, perimOffset, nx, nz, r, g, bl, aoFn, groundY, staggerTh) {
    const tx = Math.floor(cx / 256.0);
    const tz = Math.floor(cz / 256.0);
    const b = this.getBucket(tx, tz, matKey);
    const base = b.pos.length / 3;
    const segLen = Math.hypot(bx - ax, bz - az);

    const aoA0 = aoFn.wallAO(ax, ay0, az, nx, nz, groundY);
    const aoB0 = aoFn.wallAO(bx, by0, bz, nx, nz, groundY);
    const aoA1 = aoFn.wallAO(ax, yTop, az, nx, nz, groundY);
    const aoB1 = aoFn.wallAO(bx, yTop, bz, nx, nz, groundY);

    const u0 = perimOffset / tileW;
    const u1 = (perimOffset + segLen) / tileW;
    const vA0 = ay0 / tileH;
    const vB0 = by0 / tileH;
    const vTop = yTop / tileH;

    // Outward CCW winding when looking from outside CW XZ polygon: (b_bot, a_bot, a_top, b_top)
    b.pos.push(
      bx, by0, bz,
      ax, ay0, az,
      ax, yTop, az,
      bx, yTop, bz
    );
    b.norm.push(
      nx, 0, nz,
      nx, 0, nz,
      nx, 0, nz,
      nx, 0, nz
    );
    b.uv.push(
      u1, vB0,
      u0, vA0,
      u0, vTop,
      u1, vTop
    );
    b.col.push(
      r * aoB0, g * aoB0, bl * aoB0,
      r * aoA0, g * aoA0, bl * aoA0,
      r * aoA1, g * aoA1, bl * aoA1,
      r * aoB1, g * aoB1, bl * aoB1
    );
    b.stag.push(
      staggerTh, groundY,
      staggerTh, groundY,
      staggerTh, groundY,
      staggerTh, groundY
    );
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return segLen;
  }

  addFlatPolygon(cx, cz, matKey, contourPts, holesPts, y, ny, tileSize, r, g, bl, aoFn, staggerTh, groundY) {
    const tx = Math.floor(cx / 256.0);
    const tz = Math.floor(cz / 256.0);
    const b = this.getBucket(tx, tz, matKey);
    const base = b.pos.length / 3;

    const contour = contourPts.map(([px, pz]) => new THREE.Vector2(px, pz));
    const holes = (holesPts || []).map((h) => h.map(([px, pz]) => new THREE.Vector2(px, pz)));
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    if (!tris || tris.length === 0) return;

    const yIsFn = typeof y === 'function';
    const gIsFn = typeof groundY === 'function';
    const allPts = contourPts.concat(...(holesPts || []));
    for (let i = 0; i < allPts.length; i++) {
      const [px, pz] = allPts[i];
      const vy = yIsFn ? y(px, pz) : y;
      const vg = gIsFn ? groundY(px, pz) : groundY;
      const ao = aoFn ? aoFn.upAO(px, vy, pz) : 1.0;
      b.pos.push(px, vy, pz);
      b.norm.push(0, ny, 0);
      b.uv.push(px / tileSize, pz / tileSize);
      b.col.push(r * ao, g * ao, bl * ao);
      b.stag.push(staggerTh, vg);
    }

    for (let i = 0; i < tris.length; i++) {
      const [i0, i1, i2] = tris[i];
      // Verify geometric triangle winding matches desired ny (+1 up or -1 down)
      const ax = allPts[i0][0], az = allPts[i0][1];
      const bx = allPts[i1][0], bz = allPts[i1][1];
      const cxp = allPts[i2][0], czp = allPts[i2][1];
      // cross((b-a), (c-a)).y = (bz-az)*(cx-ax) - (bx-ax)*(cz-az)
      const crossY = (bz - az) * (cxp - ax) - (bx - ax) * (czp - az);
      if ((ny > 0 && crossY >= 0) || (ny < 0 && crossY <= 0)) {
        b.idx.push(base + i0, base + i1, base + i2);
      } else {
        b.idx.push(base + i0, base + i2, base + i1);
      }
    }
  }

  compileToGroup(materialsMap) {
    const grp = new THREE.Group();
    let meshCount = 0;
    for (const b of this.buckets.values()) {
      if (b.idx.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      geo.setAttribute('aCityMeta', new THREE.Float32BufferAttribute(b.stag, 2));
      geo.setIndex(b.idx);
      geo.computeBoundingSphere();

      const m = new THREE.Mesh(geo, materialsMap[b.matKey]);
      const isRoofOrPodium = b.matKey !== 'cityRoad' && b.matKey !== 'citySidewalk';
      m.castShadow = isRoofOrPodium;
      m.receiveShadow = true;
      grp.add(m);
      meshCount++;
    }
    return { group: grp, tileMeshes: meshCount };
  }
}

// ============================================================================
// 4. BABYLON CITY ENHANCEMENT HOOK (Staggered Twilight Lights + Foot Grime)
// ============================================================================
function attachCityShaderHooks(mat, { cacheKey, hasEmissive = false, hasGrime = true, isGlass = false, grazingSpec = 0.0 }) {
  enhancePBRMaterial(mat, {
    cacheKey,
    cloudShadows: true,
    grazingSpec
  });
  const baseCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    baseCompile(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        attribute vec2 aCityMeta;
        varying vec2 vCityMeta;
        `
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */`
        #include <project_vertex>
        vCityMeta = aCityMeta;
        `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        varying vec2 vCityMeta;
        `
      );

    if (hasGrime) {
      // Babylon-style ground-contact exhaust/splash grime band along bottom 1.2m of walls!
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        /* glsl */`
        #include <color_fragment>
        {
          float hAboveG = max(vAtmoWPos.y - vCityMeta.y, 0.0);
          float grimeBand = smoothstep(0.0, 1.35, hAboveG);
          diffuseColor.rgb *= mix(0.80, 1.0, grimeBand);
        }
        `
      );
    }

    if (hasEmissive) {
      // Staggered per-building + per-room twilight window ignition matching Babylon nightfx!
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        /* glsl */`
        #include <emissivemap_fragment>
        {
          float th = vCityMeta.x;
          float winOn = smoothstep(th, th + 0.18, uNightFactor);
          vec2 cell = floor(vec2((vAtmoWPos.x + vAtmoWPos.z) * 0.28, vAtmoWPos.y * 0.26));
          float rRoom = atmoHash(cell);
          float occ = smoothstep(0.28, 0.45, rRoom);
          vec3 tint = mix(vec3(1.0, 0.78, 0.46), vec3(0.95, 0.92, 0.86), atmoHash(cell + vec2(19.3, 7.1)));
          totalEmissiveRadiance *= tint * (winOn * occ * (0.48 + 0.45 * rRoom));
        }
        `
      );
    }
    void isGlass;
  };
  return mat;
}

// ============================================================================
// 5. MAIN BABYLON-INSPIRED MODERN METROPOLIS BUILDER
// ============================================================================
export function createModernCity(texLib, assetManager, lodManager) {
  const root = new THREE.Group();
  const yBase = CITY_BOUNDS.y;
  const colliders = [];
  const mooredBoats = [];
  const lampMats = [];

  // A) Generate Zero-Gap Organic City Graph
  const layout = generateCityLayout();
  const aoFn = createCityAOBaker(layout.parcels);
  const batcher = new CityTileBatcher();

  // B) 6 Calibrated White-Base Modern PBR Materials (tinted per-parcel via baked AO * vertex color!)
  const cityTravertineMat = attachCityShaderHooks(
    new THREE.MeshStandardMaterial({
      map: texLib.cityTravertine.map,
      normalMap: texLib.cityTravertine.normalMap,
      roughnessMap: texLib.cityTravertine.roughnessMap,
      vertexColors: true,
      roughness: 0.90,
      metalness: 0.04
    }),
    { cacheKey: 'botw_bbl_trav', hasEmissive: false, hasGrime: true, grazingSpec: 0.48 }
  );

  const cityConcreteMat = attachCityShaderHooks(
    new THREE.MeshStandardMaterial({
      map: texLib.cityConcrete.map,
      normalMap: texLib.cityConcrete.normalMap,
      roughnessMap: texLib.cityConcrete.roughnessMap,
      emissiveMap: texLib.cityConcrete.emissiveMap,
      emissive: new THREE.Color(0xffdfa8),
      emissiveIntensity: 1.0,
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.08
    }),
    { cacheKey: 'botw_bbl_conc', hasEmissive: true, hasGrime: true, grazingSpec: 0.55 }
  );

  const cityGlassMat = attachCityShaderHooks(
    new THREE.MeshStandardMaterial({
      map: texLib.cityCurtainGlass.map,
      normalMap: texLib.cityCurtainGlass.normalMap,
      roughnessMap: texLib.cityCurtainGlass.roughnessMap,
      emissiveMap: texLib.cityCurtainGlass.emissiveMap,
      emissive: new THREE.Color(0xffe4b6),
      emissiveIntensity: 1.0,
      vertexColors: true,
      roughness: 0.44,
      metalness: 0.52
    }),
    { cacheKey: 'botw_bbl_glass', hasEmissive: true, hasGrime: true, isGlass: true, grazingSpec: 0.65 }
  );

  const cityStorefrontMat = attachCityShaderHooks(
    new THREE.MeshStandardMaterial({
      map: texLib.cityStorefront.map,
      normalMap: texLib.cityStorefront.normalMap,
      roughnessMap: texLib.cityStorefront.roughnessMap,
      emissiveMap: texLib.cityStorefront.emissiveMap,
      emissive: new THREE.Color(0xffdba0),
      emissiveIntensity: 1.0,
      vertexColors: true,
      roughness: 0.36,
      metalness: 0.50
    }),
    { cacheKey: 'botw_bbl_store', hasEmissive: true, hasGrime: true, isGlass: true }
  );

  const cityRoofMat = attachCityShaderHooks(
    new THREE.MeshStandardMaterial({
      map: texLib.cityRoof.map,
      normalMap: texLib.cityRoof.normalMap,
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.04
    }),
    { cacheKey: 'botw_bbl_roof', hasEmissive: false, hasGrime: false, grazingSpec: 0.45 }
  );

  const cityRoadMat = attachCityShaderHooks(
    new THREE.MeshStandardMaterial({
      map: texLib.asphalt.map,
      normalMap: texLib.asphalt.normalMap,
      roughnessMap: texLib.asphalt.roughnessMap,
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.04
    }),
    { cacheKey: 'botw_bbl_road', hasEmissive: false, hasGrime: false, grazingSpec: 0.28 }
  );

  const citySidewalkMat = attachCityShaderHooks(
    new THREE.MeshStandardMaterial({
      map: texLib.sidewalk.map,
      normalMap: texLib.sidewalk.normalMap,
      roughnessMap: texLib.sidewalk.roughnessMap,
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.03
    }),
    { cacheKey: 'botw_bbl_walk', hasEmissive: false, hasGrime: false, grazingSpec: 0.42 }
  );

  const materialsMap = {
    trav: cityTravertineMat,
    conc: cityConcreteMat,
    glass: cityGlassMat,
    store: cityStorefrontMat,
    roof: cityRoofMat,
    cityRoad: cityRoadMat,
    citySidewalk: citySidewalkMat
  };

  // Helper: Extrude closed ring walls from yBotFn -> yTop into batcher with optional inner void facing opposite
  function emitRingWalls(cx, cz, ringPts, matKey, yBotFn, yTop, tileW, tileH, colR, colG, colB, groundY, staggerTh, isHole = false) {
    const pts = isHole ? ringPts.slice().reverse() : ringPts;
    const n = pts.length;
    let perim = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.25) continue;
      // Outer CW edge outward normal is (dz/len, -dx/len); reversed CCW hole normal points into hole!
      const nx = dz / len;
      const nz = -dx / len;
      const ya0 = typeof yBotFn === 'function' ? yBotFn(a[0], a[1]) : yBotFn;
      const yb0 = typeof yBotFn === 'function' ? yBotFn(b[0], b[1]) : yBotFn;
      perim += batcher.addWallQuad(cx, cz, matKey, a[0], ya0, a[1], b[0], yb0, b[1], yTop, tileW, tileH, perim, nx, nz, colR, colG, colB, aoFn, groundY, staggerTh);
    }
  }

  // C) Build Every Parcel with Real Stepped Volumes, Courtyards, Parapets & Podiums!
  const tmpColor = new THREE.Color();
  const rooftopProps = [];
  const roofHvacMat = new THREE.MeshStandardMaterial({ color: 0x62666e, roughness: 0.82, metalness: 0.25 });
  const trimDarkMat = new THREE.MeshStandardMaterial({ color: 0x20252d, roughness: 0.44, metalness: 0.55 });
  enhancePBRMaterial(roofHvacMat, { cacheKey: 'botw_bbl_hvac' });
  enhancePBRMaterial(trimDarkMat, { cacheKey: 'botw_bbl_trim' });

  for (let pi = 0; pi < layout.parcels.length; pi++) {
    const p = layout.parcels[pi];
    const outerPts = p.poly.p;
    const courtPts = p.courtPoly ? p.courtPoly.p : null;
    const mainMatKey = p.materialClass === 'glass' ? 'glass' : 'conc';

    // Convert display palette hex into scene linear & jitter slightly for Babylon per-parcel richness
    tmpColor.setHex(p.baseHex).multiplyScalar(p.shadeJitter);
    const cr = tmpColor.r;
    const cg = tmpColor.g;
    const cb = tmpColor.b;
    const th = 0.08 + p.staggerSeed * 0.72; // staggered twilight window ignition!

    // Buried sloped foundation down to minY - 1.8m so hillside corners NEVER float
    const foundY = p.minY - 1.8;
    const topY = p.baseY + p.height;
    const tileW = 12.0;
    const tileH = 14.4;

    if (p.podiumH > 0.1 && p.height > p.podiumH + 4.0) {
      // Podium ground-floor storefront ring + cornice collar + main upper facade
      const podTop = p.baseY + p.podiumH;
      emitRingWalls(p.cx, p.cz, outerPts, 'store', foundY, podTop, 14.0, 5.2, 0.92, 0.92, 0.92, p.baseY, th * 0.65);
      // Slight overhanging architectural podium cornice belt (0.4m lip via reversed/outer rim)
      const podCornice = insetPoly(p.poly, -0.25, 40.0);
      if (podCornice) {
        batcher.addFlatPolygon(p.cx, p.cz, 'trav', podCornice.p, [outerPts], podTop + 0.06, 1, 8.0, cr * 0.85, cg * 0.85, cb * 0.85, aoFn, th, p.baseY);
      }
      emitRingWalls(p.cx, p.cz, outerPts, mainMatKey, podTop, topY, tileW, tileH, cr, cg, cb, p.baseY, th);
    } else {
      // Monolithic travertine/concrete facade starting on dark buried stone foundation
      emitRingWalls(p.cx, p.cz, outerPts, mainMatKey, foundY, topY, tileW, tileH, cr, cg, cb, p.baseY, th);
    }

    // Real carved interior courtyard lining & sunken floor
    if (courtPts) {
      const cFloorY = p.baseY + 0.06;
      emitRingWalls(p.cx, p.cz, courtPts, 'conc', cFloorY - 0.5, topY, 12.0, 14.4, cr * 0.9, cg * 0.9, cb * 0.9, cFloorY, th, true);
      batcher.addFlatPolygon(p.cx, p.cz, 'citySidewalk', courtPts, [], cFloorY, 1, 8.0, 0.68, 0.66, 0.62, aoFn, th, cFloorY);
    }

    // Physical-Thickness Roof Parapet (0.45m wall thickness, sunk roof 0.85m below crest -> NO toy box tops!)
    const parapetH = p.height > 20 ? 1.05 : 0.72;
    const innerRoofPoly = insetPoly(p.poly, 0.48, 22.0);
    const roofSlabY = topY - parapetH;
    if (innerRoofPoly) {
      // Parapet outer lip extends to topY, inner face drops parapetH down to sunk roofSlabY
      emitRingWalls(p.cx, p.cz, innerRoofPoly.p, 'trav', roofSlabY, topY, 8.0, 4.0, cr * 0.86, cg * 0.86, cb * 0.86, roofSlabY, th, true);
      batcher.addFlatPolygon(p.cx, p.cz, 'trav', outerPts, courtPts ? [innerRoofPoly.p] : [innerRoofPoly.p], topY, 1, 8.0, cr * 0.88, cg * 0.88, cb * 0.88, aoFn, th, roofSlabY);
      batcher.addFlatPolygon(p.cx, p.cz, 'roof', innerRoofPoly.p, courtPts ? [courtPts] : [], roofSlabY, 1, 10.0, 0.62, 0.60, 0.58, aoFn, th, roofSlabY);
    } else {
      batcher.addFlatPolygon(p.cx, p.cz, 'roof', outerPts, courtPts ? [courtPts] : [], topY, 1, 10.0, 0.62, 0.60, 0.58, aoFn, th, topY);
    }

    // Stepped Multi-Volume Upper Crown / Penthouse (Babylon roofParts!)
    if (p.upperPoly && p.upperHeight > 1.8) {
      const upBase = roofSlabY - 0.1;
      const upTop = topY + p.upperHeight;
      emitRingWalls(p.cx, p.cz, p.upperPoly.p, mainMatKey, upBase, upTop, tileW, tileH, cr * 0.98, cg * 0.98, cb * 0.98, p.baseY, clamp(th * 0.85, 0.05, 0.9));
      const upInner = insetPoly(p.upperPoly, 0.42, 16.0);
      if (upInner) {
        const upSlabY = upTop - 0.75;
        emitRingWalls(p.cx, p.cz, upInner.p, 'trav', upSlabY, upTop, 8.0, 4.0, cr * 0.86, cg * 0.86, cb * 0.86, upSlabY, th, true);
        batcher.addFlatPolygon(p.cx, p.cz, 'trav', p.upperPoly.p, [upInner.p], upTop, 1, 8.0, cr * 0.88, cg * 0.88, cb * 0.88, aoFn, th, upSlabY);
        batcher.addFlatPolygon(p.cx, p.cz, 'roof', upInner.p, [], upSlabY, 1, 10.0, 0.60, 0.58, 0.56, aoFn, th, upSlabY);
      } else {
        batcher.addFlatPolygon(p.cx, p.cz, 'roof', p.upperPoly.p, [], upTop, 1, 10.0, 0.60, 0.58, 0.56, aoFn, th, upTop);
      }

      if (p.isSignatureSpire) {
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.85, 28.0, 8), trimDarkMat);
        spire.position.set(p.cx, upTop + 14.0, p.cz);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.65, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
        beacon.position.set(p.cx, upTop + 28.2, p.cz);
        root.add(spire, beacon);
      }
    } else if (p.height > 10.0 && (pi % 3 === 0)) {
      // Rooftop mechanical bulkhead / HVAC detail
      rooftopProps.push([p.cx, roofSlabY, p.cz, clamp(Math.sqrt(p.area) * 0.18, 2.2, 5.2)]);
    }

    // Bounding collider for smooth player & vehicle street collisions
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let vi = 0; vi < outerPts.length; vi++) {
      const pt = outerPts[vi];
      if (pt[0] < x0) x0 = pt[0];
      if (pt[0] > x1) x1 = pt[0];
      if (pt[1] < z0) z0 = pt[1];
      if (pt[1] > z1) z1 = pt[1];
    }
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, maxY: topY + p.upperHeight });
  }

  // Batched Rooftop HVAC Mechanical Units (1 InstancedMesh draw call for hundreds of roofs!)
  if (rooftopProps.length > 0) {
    const hvacGeo = new THREE.BoxGeometry(1.0, 1.4, 0.85);
    const hvacInst = new THREE.InstancedMesh(hvacGeo, roofHvacMat, rooftopProps.length);
    const d = new THREE.Object3D();
    for (let i = 0; i < rooftopProps.length; i++) {
      const [rx, ry, rz, sc] = rooftopProps[i];
      d.position.set(rx, ry + 0.65, rz);
      d.rotation.set(0, (i * 0.7) % Math.PI, 0);
      d.scale.set(sc, sc * 0.42, sc);
      d.updateMatrix();
      hvacInst.setMatrixAt(i, d.matrix);
    }
    hvacInst.castShadow = true;
    hvacInst.receiveShadow = true;
    root.add(hvacInst);
  }

  // D) Render All Street Ribbons, Sidewalks, Pocket Plazas & Grand Waterfront Promenade!
  // Base metro tarmac apron + curb-inset sidewalk terrace per block (leaving streets open to dark asphalt!)
  const walkYFn = (px, pz) => getCityTerraceY(px, pz) + 0.16;
  for (let bi = 0; bi < layout.blocks.length; bi++) {
    const blk = layout.blocks[bi];
    const sw = blk.sidewalkPoly;
    if (!sw) continue;
    batcher.addFlatPolygon(blk.cx, blk.cz, 'citySidewalk', sw.p, [], walkYFn, 1, 9.0, 0.78, 0.76, 0.73, aoFn, 0, walkYFn);
  }

  const plazaYFn = (px, pz) => getCityTerraceY(px, pz) + 0.22;
  for (let zi = 0; zi < layout.plazas.length; zi++) {
    const pz = layout.plazas[zi];
    batcher.addFlatPolygon(pz.cx, pz.cz, 'citySidewalk', pz.poly.p, [], plazaYFn, 1, 8.0, 0.74, 0.78, 0.68, aoFn, 0, plazaYFn);
  }

  // Swept Curved Stone Seawall Quay + Promenade along getQuayX(z) (z = -1750..-140)
  const quayWalkMat = new THREE.MeshStandardMaterial({
    map: texLib.cityQuay.map,
    normalMap: texLib.cityQuay.normalMap,
    roughness: 0.86,
    metalness: 0.04
  });
  enhancePBRMaterial(quayWalkMat, { cacheKey: 'botw_bbl_quay', grazingSpec: 0.45 });

  (function buildCurvedQuaySeawall() {
    const pos = [];
    const norm = [];
    const uv = [];
    const idx = [];
    const prof = [
      // Outer bay face dipping below riverbed -> lower walkway ledge -> battered upper seawall -> promenade top -> road curb
      [4.5, WATER_LEVEL - 4.0],
      [4.0, WATER_LEVEL + 1.0],
      [1.8, WATER_LEVEL + 1.05],
      [1.2, yBase + 0.30],
      [-15.0, yBase + 0.30],
      [-15.0, yBase - 0.15]
    ];
    const zSteps = 56;
    const z0 = -1750.0;
    const z1 = -140.0;

    for (let i = 0; i <= zSteps; i++) {
      const f = i / zSteps;
      const z = mix(z0, z1, f);
      const qx = getQuayX(z);
      const vCoord = (z - z0) / 8.0;
      for (let j = 0; j < prof.length; j++) {
        pos.push(qx + prof[j][0], prof[j][1], z);
        uv.push(j * 0.45, vCoord);
      }
    }
    const stride = prof.length;
    for (let i = 0; i < zSteps; i++) {
      for (let j = 0; j < stride - 1; j++) {
        const a = i * stride + j;
        const b = a + 1;
        const c = (i + 1) * stride + j;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const qGeo = new THREE.BufferGeometry();
    qGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    qGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    qGeo.setIndex(idx);
    qGeo.computeVertexNormals();
    const qMesh = new THREE.Mesh(qGeo, quayWalkMat);
    qMesh.castShadow = qMesh.receiveShadow = true;
    root.add(qMesh);
  })();

  // Continuous City Roadbed Asphalt ribbons matching layout.streets (subdivided & extended to seal T-junction corners)
  const streetYFn = (px, pz) => getCityTerraceY(px, pz) + 0.06;
  const cityYellowParts = [];
  for (let si = 0; si < layout.streets.length; si++) {
    const st = layout.streets[si];
    const pts = st.pts;
    for (let j = 0; j < pts.length - 1; j++) {
      const ax0 = pts[j][0], az0 = pts[j][1];
      const bx0 = pts[j + 1][0], bz0 = pts[j + 1][1];
      const dx = bx0 - ax0, dz = bz0 - az0;
      const len = Math.hypot(dx, dz);
      if (len < 1.0) continue;
      const tx = dx / len, tz = dz / len;
      const nx = -tz, nz = tx;
      const hw = st.hw + 1.2;
      const padEnd = st.hw * 0.45;
      const ax = ax0 - tx * padEnd, az = az0 - tz * padEnd;
      const bx = bx0 + tx * padEnd, bz = bz0 + tz * padEnd;
      const segs = Math.max(1, Math.ceil((len + padEnd * 2) / 28.0));
      const stripeYaw = Math.atan2(tx, tz);
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs;
        const t1 = (s + 1) / segs;
        const x0 = mix(ax, bx, t0), z0 = mix(az, bz, t0);
        const x1 = mix(ax, bx, t1), z1 = mix(az, bz, t1);
        const midX = (x0 + x1) * 0.5, midZ = (z0 + z1) * 0.5;
        const quad = [
          [x0 + nx * hw, z0 + nz * hw],
          [x1 + nx * hw, z1 + nz * hw],
          [x1 - nx * hw, z1 - nz * hw],
          [x0 - nx * hw, z0 - nz * hw]
        ];
        batcher.addFlatPolygon(midX, midZ, 'cityRoad', quad, [], streetYFn, 1, 14.0, 0.72, 0.72, 0.74, aoFn, 0, streetYFn);

        if (st.hw >= 6.0) {
          const segLen = Math.hypot(x1 - x0, z1 - z0);
          const midY = getCityTerraceY(midX, midZ) + 0.085;
          const ys = new THREE.PlaneGeometry(0.20, segLen);
          ys.rotateX(-Math.PI / 2);
          ys.rotateY(stripeYaw);
          ys.translate(midX, midY, midZ);
          cityYellowParts.push(ys);
        }
      }
    }
  }

  // Compile all 1,100+ Buildings + Streets into Spatial 256m Tile Meshes!
  const compiledCity = batcher.compileToGroup(materialsMap);
  root.add(compiledCity.group);

  // E) Painted Asphalt Ribbons + Lane Lines for Ring Expressway & Southern Lakefront Causeway Bridge!
  const roadMat = new THREE.MeshStandardMaterial({
    map: texLib.asphalt.map,
    normalMap: texLib.asphalt.normalMap,
    roughnessMap: texLib.asphalt.roughnessMap,
    roughness: 0.86,
    metalness: 0.04
  });
  const paintYellowMat = new THREE.MeshStandardMaterial({ color: 0xcca030, roughness: 0.72, polygonOffset: true, polygonOffsetFactor: -1 });
  const paintWhiteMat = new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.72, polygonOffset: true, polygonOffsetFactor: -1 });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x8e9296, roughness: 0.88 });
  enhancePBRMaterial(roadMat, { cacheKey: 'botw_hwy_asphalt', grazingSpec: 0.28 });
  enhancePBRMaterial(paintYellowMat, { cacheKey: 'botw_paint_y' });
  enhancePBRMaterial(paintWhiteMat, { cacheKey: 'botw_paint_w' });
  enhancePBRMaterial(curbMat, { cacheKey: 'botw_hwy_curb' });
  if (cityYellowParts.length > 0) root.add(new THREE.Mesh(mergeGeometries(cityYellowParts), paintYellowMat));

  (function buildRingExpresswayAndBridge() {
    const N = HIGHWAY_SAMPLES.length;
    const hwPos = [], hwNorm = [], hwUv = [], hwIdx = [];
    const barrierParts = [];
    const yellowParts = [];
    const whiteParts = [];
    const halfW = 7.8;

    let accumLen = 0;
    for (let i = 0; i < N; i++) {
      const s = HIGHWAY_SAMPLES[i];
      const next = HIGHWAY_SAMPLES[(i + 1) % N];
      if (s.inCity) continue;
      const segLen = Math.hypot(next.x - s.x, next.z - s.z);
      const nx = -s.tz, nz = s.tx;
      const nx2 = -next.tz, nz2 = next.tx;
      const base = hwPos.length / 3;
      const u0 = accumLen / 12.0;
      accumLen += segLen;
      const u1 = accumLen / 12.0;

      hwPos.push(
        s.x - nx * halfW, s.y + 0.05, s.z - nz * halfW,
        s.x + nx * halfW, s.y + 0.05, s.z + nz * halfW,
        next.x - nx2 * halfW, next.y + 0.05, next.z - nz2 * halfW,
        next.x + nx2 * halfW, next.y + 0.05, next.z + nz2 * halfW
      );
      hwNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      hwUv.push(0, u0, 1.3, u0, 0, u1, 1.3, u1);
      hwIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);

      const midX = 0.5 * (s.x + next.x);
      const midY = 0.5 * (s.y + next.y);
      const midZ = 0.5 * (s.z + next.z);
      const yaw = Math.atan2(next.x - s.x, next.z - s.z);
      const stripe = new THREE.PlaneGeometry(0.18, segLen + 0.25);
      stripe.rotateX(-Math.PI / 2);
      stripe.rotateY(yaw);
      stripe.translate(midX, midY + 0.075, midZ);
      yellowParts.push(stripe);

      if (i % 2 === 0) {
        for (const side of [-1, 1]) {
          const ws = new THREE.PlaneGeometry(0.16, segLen * 0.72);
          ws.rotateX(-Math.PI / 2);
          ws.rotateY(yaw);
          ws.translate(midX + nx * side * (halfW - 0.5), midY + 0.075, midZ + nz * side * (halfW - 0.5));
          whiteParts.push(ws);
        }
      }

      if (s.isBridge) {
        const deck = new THREE.BoxGeometry(halfW * 2.08, 0.95, segLen + 0.4);
        deck.rotateY(yaw);
        deck.translate(midX, midY - 0.44, midZ);
        barrierParts.push(deck);
        for (const side of [-1, 1]) {
          const wall = new THREE.BoxGeometry(0.55, 1.0, segLen + 0.3);
          wall.rotateY(yaw);
          wall.translate(midX + nx * side * (halfW + 0.2), midY + 0.5, midZ + nz * side * (halfW + 0.2));
          barrierParts.push(wall);
        }
        if (i % 3 === 0) {
          const pierH = Math.max(4.0, midY - (WATER_LEVEL - 8.0));
          const pier = new THREE.BoxGeometry(halfW * 1.4, pierH, 2.2);
          pier.rotateY(yaw);
          pier.translate(midX, midY - pierH * 0.5 - 0.5, midZ);
          barrierParts.push(pier);
        }
      }
    }

    if (hwPos.length > 0) {
      const hGeo = new THREE.BufferGeometry();
      hGeo.setAttribute('position', new THREE.Float32BufferAttribute(hwPos, 3));
      hGeo.setAttribute('normal', new THREE.Float32BufferAttribute(hwNorm, 3));
      hGeo.setAttribute('uv', new THREE.Float32BufferAttribute(hwUv, 2));
      hGeo.setIndex(hwIdx);
      const hMesh = new THREE.Mesh(hGeo, roadMat);
      hMesh.receiveShadow = true;
      root.add(hMesh);
    }
    if (barrierParts.length > 0) {
      const bm = new THREE.Mesh(mergeGeometries(barrierParts), curbMat);
      bm.castShadow = bm.receiveShadow = true;
      root.add(bm);
    }
    if (yellowParts.length > 0) root.add(new THREE.Mesh(mergeGeometries(yellowParts), paintYellowMat));
    if (whiteParts.length > 0) root.add(new THREE.Mesh(mergeGeometries(whiteParts), paintWhiteMat));
  })();

  // F) Timber Marina Pier & 6 Moored Yachts (at Grand Waterfront Plaza z = -560)
  const pierWoodMat = new THREE.MeshStandardMaterial({
    map: texLib.barkOak.map,
    normalMap: texLib.barkOak.normalMap,
    color: 0xa47d58,
    roughness: 0.88
  });
  enhancePBRMaterial(pierWoodMat, { cacheKey: 'botw_bbl_pier' });

  {
    const pxStart = _MARINA_QUAY_X;
    const pierDeck = new THREE.Mesh(scaleBoxUVs(new THREE.BoxGeometry(54.0, 0.38, 13.0), 54.0, 0.38, 13.0, 6.0, 6.0), pierWoodMat);
    pierDeck.position.set(pxStart + 26.0, yBase + 0.12, MARINA_PIER_Z);
    pierDeck.castShadow = pierDeck.receiveShadow = true;
    root.add(pierDeck);

    const pilingGeos = [];
    for (let dx = 4; dx <= 50; dx += 7.5) {
      for (const dz of [-6.0, 6.0]) {
        const g = new THREE.CylinderGeometry(0.24, 0.28, 7.6, 8);
        g.translate(pxStart + dx, yBase - 2.4, MARINA_PIER_Z + dz);
        pilingGeos.push(g);
        const cap = new THREE.BoxGeometry(0.62, 0.12, 0.62);
        cap.translate(pxStart + dx, yBase + 1.44, MARINA_PIER_Z + dz);
        pilingGeos.push(cap);
      }
    }
    for (const dz of [-6.0, 6.0]) {
      for (const ry of [yBase + 0.98, yBase + 0.56]) {
        const rail = new THREE.BoxGeometry(47.0, 0.14, 0.14);
        rail.translate(pxStart + 27.0, ry, MARINA_PIER_Z + dz);
        pilingGeos.push(rail);
      }
    }
    root.add(new THREE.Mesh(mergeGeometries(pilingGeos), pierWoodMat));

    const yachtHullMat = new THREE.MeshStandardMaterial({ color: 0xeaecef, roughness: 0.28, metalness: 0.22 });
    const yachtDeckMat = new THREE.MeshStandardMaterial({ color: 0x1e3c58, roughness: 0.42, metalness: 0.35 });
    const yachtGlassMat = new THREE.MeshStandardMaterial({ color: 0x0d1b28, roughness: 0.12, metalness: 0.80 });
    const yachtTeakMat = new THREE.MeshStandardMaterial({ color: 0x866140, roughness: 0.82 });
    [yachtHullMat, yachtDeckMat, yachtGlassMat, yachtTeakMat].forEach((m, i) => enhancePBRMaterial(m, { cacheKey: `botw_bbl_yacht_${i}` }));

    [
      [pxStart + 20, MARINA_PIER_Z - 14.5, 0.10],
      [pxStart + 42, MARINA_PIER_Z - 14.5, -0.05],
      [pxStart + 22, MARINA_PIER_Z + 14.5, Math.PI + 0.08],
      [pxStart + 44, MARINA_PIER_Z + 14.5, Math.PI - 0.06],
      [pxStart + 62, MARINA_PIER_Z, Math.PI * 0.5],
      [pxStart + 96, MARINA_PIER_Z - 48.0, 0.45]
    ].forEach(([bx, bz, rot], idx) => {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 9.8), yachtHullMat);
      hull.position.y = 0.2;
      const bow = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3.2, 4), yachtHullMat);
      bow.rotation.x = -Math.PI * 0.5;
      bow.rotation.y = Math.PI * 0.25;
      bow.position.set(0, 0.25, -6.2);
      const aftTeak = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.06, 3.4), yachtTeakMat);
      aftTeak.position.set(0, 0.93, 2.85);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.35, 4.4), yachtDeckMat);
      cabin.position.set(0, 1.35, 0.4);
      const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.56, 3.2), yachtGlassMat);
      windshield.position.set(0, 1.56, -0.35);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 2.0), yachtHullMat);
      bridge.position.set(0, 2.35, 0.8);
      boat.add(hull, bow, aftTeak, cabin, windshield, bridge);
      boat.position.set(bx, WATER_LEVEL + 0.62, bz);
      boat.rotation.y = rot;
      root.add(boat);
      mooredBoats.push({ mesh: boat, baseY: WATER_LEVEL + 0.62, phase: idx * 1.3 });
    });
  }

  // G) Boulevard Streetlamps & Staggered Night Glow Halos (Babylon nightfx additive glow!)
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.45, metalness: 0.65 });
  const lampHeadMat = new THREE.MeshStandardMaterial({
    color: 0xffe4b8,
    emissive: new THREE.Color(0xffc978),
    emissiveIntensity: 0.0,
    roughness: 0.2
  });
  enhancePBRMaterial(poleMat, { cacheKey: 'botw_bbl_pole' });
  enhancePBRMaterial(lampHeadMat, { cacheKey: 'botw_bbl_lamp_head', noSpecularKnee: true });
  lampMats.push(lampHeadMat);

  if (layout.lampAnchors.length > 0) {
    const shaft = new THREE.CylinderGeometry(0.075, 0.14, 7.5, 6);
    shaft.translate(0, 3.75, 0);
    const basePlinth = new THREE.CylinderGeometry(0.18, 0.22, 0.45, 6);
    basePlinth.translate(0, 0.225, 0);
    const arm = new THREE.BoxGeometry(0.10, 0.09, 1.15);
    arm.translate(0, 7.52, 0.48);
    const housing = new THREE.BoxGeometry(0.42, 0.10, 0.92);
    housing.translate(0, 7.50, 0.92);
    const poleGeo = mergeGeometries([shaft, basePlinth, arm, housing]);

    const headGeo = new THREE.BoxGeometry(0.34, 0.04, 0.78);
    headGeo.translate(0, 7.44, 0.92);
    const maxLamps = Math.min(layout.lampAnchors.length, 240);
    const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, maxLamps);
    const headInst = new THREE.InstancedMesh(headGeo, lampHeadMat, maxLamps);
    const d = new THREE.Object3D();
    for (let i = 0; i < maxLamps; i++) {
      const [lx, lz] = layout.lampAnchors[i];
      const ly = getCityGroundY(lx, lz);
      d.position.set(lx, ly, lz);
      d.rotation.set(0, 0, 0);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      poleInst.setMatrixAt(i, d.matrix);
      headInst.setMatrixAt(i, d.matrix);
    }
    root.add(poleInst, headInst);

    // Babylon-style Additive Glow Halos over lamps that softly bloom only during twilight/night
    const glowMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uNightFactor: ATMO_UNIFORMS.uNightFactor
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 7.5, 0.0, 1.0);
          mv.xy += position.xy * 5.2;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uNightFactor;
        varying vec2 vUv;
        void main() {
          float on = smoothstep(0.18, 0.72, uNightFactor);
          if (on <= 0.002) discard;
          float r = length(vUv - 0.5) * 2.0;
          if (r > 1.0) discard;
          float g = exp(-4.2 * r * r) * (1.0 - r * r);
          gl_FragColor = vec4(vec3(1.15, 0.74, 0.32) * g * on * 0.42, 1.0);
        }
      `
    });
    const glowInst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowMat, maxLamps);
    for (let i = 0; i < maxLamps; i++) {
      const [lx, lz] = layout.lampAnchors[i];
      const ly = getCityGroundY(lx, lz);
      d.position.set(lx, ly, lz);
      d.rotation.set(0, 0, 0);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      glowInst.setMatrixAt(i, d.matrix);
    }
    glowInst.frustumCulled = false;
    root.add(glowInst);
  }

  // Interstate Gantries & Commercial Billboards along Highway & Citadel
  const signPostMat = trimDarkMat;
  [
    { x: -195, z: -320, rotY: 0.0, lines: ['I-77 NORTH • CITADEL CENTER', 'LAKEFRONT QUAY'], dir: 'down' },
    { x: -135, z: -240, rotY: Math.PI * 0.5, lines: ['LAKEFRONT MARINA', 'VOLCANO OVERLOOK'], dir: 'right' },
    { x: 145, z: -150, rotY: 0.35, lines: ['HYRULE RING EXPRESSWAY', 'DOWNTOWN 1.2 KM'], dir: 'left' }
  ].forEach((gs) => {
    const gy = getCityGroundY(gs.x, gs.z);
    const tex = createHighwaySignTexture(gs.lines, gs.dir);
    const sMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.15, roughness: 0.4 });
    enhancePBRMaterial(sMat, { cacheKey: 'botw_bbl_hwysign' });
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(17.5, 0.35, 0.35), signPostMat);
    beam.position.y = 6.9;
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 7.2, 8), signPostMat);
    pl.position.set(-8.5, 3.6, 0);
    const pr = pl.clone();
    pr.position.set(8.5, 3.6, 0);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.5, 0.22), sMat);
    sign.position.set(0, 6.7, 0.25);
    g.add(beam, pl, pr, sign);
    g.position.set(gs.x, gy, gs.z);
    g.rotation.y = gs.rotY;
    root.add(g);
  });

  // H) PEDESTRIANS (32), MARAUDERS (8) & LSPD POLICE (5)
  const npcs = [];
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xdab08c, roughness: 0.72 });
  const darkPantsMat = new THREE.MeshStandardMaterial({ color: 0x262a34, roughness: 0.85 });
  const marauderRedMat = new THREE.MeshStandardMaterial({ color: 0x822626, roughness: 0.82 });
  const policeNavyMat = new THREE.MeshStandardMaterial({ color: 0x1a2846, roughness: 0.72 });
  const policeBadgeMat = new THREE.MeshBasicMaterial({ color: 0x56d8ff });
  const woodClubMat = new THREE.MeshStandardMaterial({ color: 0x5c4430, roughness: 0.9 });
  const shirtColors = [0x3b6fa8, 0xa8523d, 0xb89c4c, 0x3b785c, 0x6c4c80, 0xc2beb6, 0x262a32, 0x9c5674];
  const shirtMats = shirtColors.map((c) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.82 });
    enhancePBRMaterial(m, { cacheKey: 'botw_bbl_npc_cloth' });
    return m;
  });

  function createNpcMesh(role, variant = 0) {
    const grp = new THREE.Group();
    const torsoMat = role === 'police' ? policeNavyMat : role === 'marauder' ? marauderRedMat : shirtMats[variant % shirtMats.length];
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.66, 0.25), torsoMat);
    torso.position.y = 1.07;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skinMat);
    head.position.y = 1.56;
    head.castShadow = true;
    grp.add(torso, head);

    if (role === 'police') {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.10, 8), policeNavyMat);
      cap.position.y = 1.68;
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.10, 0.04), policeBadgeMat);
      badge.position.set(0.11, 1.18, -0.14);
      grp.add(cap, badge);
    } else if (role === 'marauder') {
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.26, 7), marauderRedMat);
      hood.position.y = 1.69;
      grp.add(hood);
    }

    const armGeo = new THREE.CylinderGeometry(0.055, 0.048, 0.56, 6);
    armGeo.translate(0, -0.26, 0);
    const legGeo = new THREE.CylinderGeometry(0.068, 0.055, 0.72, 6);
    legGeo.translate(0, -0.36, 0);
    const leftArm = new THREE.Mesh(armGeo, torsoMat);
    leftArm.position.set(-0.29, 1.36, 0);
    const rightArm = new THREE.Mesh(armGeo, torsoMat);
    rightArm.position.set(0.29, 1.36, 0);
    const leftLeg = new THREE.Mesh(legGeo, darkPantsMat);
    leftLeg.position.set(-0.11, 0.74, 0);
    const rightLeg = new THREE.Mesh(legGeo, darkPantsMat);
    rightLeg.position.set(0.11, 0.74, 0);

    if (role === 'marauder') {
      const club = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.025, 0.78, 6), woodClubMat);
      club.position.set(0, -0.48, -0.25);
      club.rotation.x = Math.PI * 0.45;
      rightArm.add(club);
    }
    grp.add(leftArm, rightArm, leftLeg, rightLeg);
    root.add(grp);
    return { grp, leftArm, rightArm, leftLeg, rightLeg };
  }

  for (let i = 0; i < 32; i++) {
    const px = mix(-920, _MARINA_QUAY_X - 18, hash2(i, 33));
    const pz = mix(-1100, -240, hash2(i, 57));
    const rig = createNpcMesh('civilian', i);
    const pos = new THREE.Vector3(px, getCityGroundY(px, pz), pz);
    rig.grp.position.copy(pos);
    npcs.push({
      id: `civ_${i}`,
      role: 'civilian',
      ...rig,
      pos,
      spawnPos: pos.clone(),
      yaw: hash2(i, 71) * Math.PI * 2,
      vel: new THREE.Vector3(),
      hp: 40,
      maxHp: 40,
      state: 'walk',
      fleeTimer: 0,
      attackCd: 0,
      downTimer: 0,
      phase: i * 0.9,
      cashReward: 25
    });
  }

  [
    [-42, -165], [-55, -240], [-72, -310], [-90, -145],
    [25, -135], [-1620, -450], [-1480, -1100], [-360, -1720]
  ].forEach(([mx, mz], i) => {
    const rig = createNpcMesh('marauder', i);
    const pos = new THREE.Vector3(mx, getCityGroundY(mx, mz), mz);
    rig.grp.position.copy(pos);
    npcs.push({
      id: `marauder_${i}`,
      role: 'marauder',
      ...rig,
      pos,
      spawnPos: pos.clone(),
      yaw: hash2(i, 91) * Math.PI * 2,
      vel: new THREE.Vector3(),
      hp: 75,
      maxHp: 75,
      state: 'patrol',
      fleeTimer: 0,
      attackCd: 0,
      downTimer: 0,
      phase: i * 1.4,
      cashReward: 50
    });
  });

  [
    [-260, -560], [-460, -560], [-460, -245], [_MARINA_QUAY_X - 24, -560], [-740, -610]
  ].forEach(([px, pz], i) => {
    const rig = createNpcMesh('police', i);
    const pos = new THREE.Vector3(px, getCityGroundY(px, pz), pz);
    rig.grp.position.copy(pos);
    rig.grp.visible = false;
    npcs.push({
      id: `police_${i}`,
      role: 'police',
      ...rig,
      pos,
      spawnPos: pos.clone(),
      yaw: 0,
      vel: new THREE.Vector3(),
      hp: 95,
      maxHp: 95,
      state: 'standby',
      fleeTimer: 0,
      attackCd: 0,
      downTimer: 0,
      phase: i * 1.1,
      cashReward: 100
    });
  });

  function pushOutOfBuildings(pos, r = 0.45) {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (pos.x + r > c.minX && pos.x - r < c.maxX && pos.z + r > c.minZ && pos.z - r < c.maxZ) {
        const dl = Math.abs(pos.x - c.minX);
        const dr = Math.abs(c.maxX - pos.x);
        const dt = Math.abs(pos.z - c.minZ);
        const db = Math.abs(c.maxZ - pos.z);
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) pos.x = c.minX - r;
        else if (m === dr) pos.x = c.maxX + r;
        else if (m === dt) pos.z = c.minZ - r;
        else pos.z = c.maxZ + r;
      }
    }
  }

  function panicNear(x, z, radius = 16.0) {
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      if (npc.role !== 'civilian' || npc.state === 'down') continue;
      if (Math.hypot(npc.pos.x - x, npc.pos.z - z) < radius) {
        npc.state = 'flee';
        npc.fleeTimer = 5.5;
      }
    }
  }

  function spawnFleeingDriver(x, z, carYaw) {
    const sideX = x - Math.cos(carYaw) * 1.8;
    const sideZ = z + Math.sin(carYaw) * 1.8;
    const rig = createNpcMesh('civilian', Math.floor(Math.random() * shirtMats.length));
    const pos = new THREE.Vector3(sideX, getCityGroundY(sideX, sideZ), sideZ);
    rig.grp.position.copy(pos);
    npcs.push({
      id: `driver_${npcs.length}`,
      role: 'civilian',
      ...rig,
      pos,
      spawnPos: pos.clone(),
      yaw: carYaw + Math.PI * 0.5,
      vel: new THREE.Vector3(),
      hp: 40,
      maxHp: 40,
      state: 'flee',
      fleeTimer: 6.0,
      attackCd: 0,
      downTimer: 0,
      phase: npcs.length * 0.7,
      cashReward: 35
    });
  }

  function damageNpc(npc, amount, fromPos, callbacks = {}) {
    if (!npc || npc.state === 'down') return false;
    npc.hp -= amount;
    if (fromPos) {
      const dx = npc.pos.x - fromPos.x;
      const dz = npc.pos.z - fromPos.z;
      const len = Math.max(0.01, Math.hypot(dx, dz));
      npc.vel.x += (dx / len) * 6.5;
      npc.vel.z += (dz / len) * 6.5;
    }
    if (npc.role === 'civilian') {
      npc.state = 'flee';
      npc.fleeTimer = 6.0;
    }
    if (npc.hp <= 0) {
      npc.state = 'down';
      npc.downTimer = 14.0;
      npc.grp.rotation.x = -Math.PI * 0.48;
      npc.grp.position.y = getCityGroundY(npc.pos.x, npc.pos.z) + 0.16;
      if (callbacks.onNpcKo) callbacks.onNpcKo(npc);
      return true;
    }
    return false;
  }

  function update(dt, time, playerState, wantedStars, callbacks = {}) {
    const night = ATMO_UNIFORMS.uNightFactor.value;
    for (let i = 0; i < lampMats.length; i++) {
      lampMats[i].emissiveIntensity = night > 0.15 ? 0.4 + night * 2.2 : 0.0;
    }

    for (let i = 0; i < mooredBoats.length; i++) {
      const b = mooredBoats[i];
      b.mesh.position.y = b.baseY + Math.sin(time * 1.4 + b.phase) * 0.12;
      b.mesh.rotation.z = Math.sin(time * 1.1 + b.phase) * 0.035;
      b.mesh.rotation.x = Math.cos(time * 0.9 + b.phase) * 0.025;
    }

    const pPos = playerState.pos;
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      if (npc.state === 'down') {
        npc.downTimer -= dt;
        if (npc.downTimer <= 0) {
          npc.hp = npc.maxHp;
          npc.grp.rotation.x = 0;
          npc.state = npc.role === 'police' && wantedStars === 0 ? 'standby' : npc.role === 'civilian' ? 'walk' : npc.role === 'marauder' ? 'patrol' : 'chase';
          if (npc.role === 'police' && wantedStars === 0) npc.grp.visible = false;
          else if (npc.spawnPos) npc.pos.copy(npc.spawnPos);
        }
        continue;
      }

      if (npc.role === 'police') {
        if (wantedStars <= 0) {
          npc.state = 'standby';
          npc.grp.visible = false;
          continue;
        }
        npc.grp.visible = true;
        npc.state = 'chase';
      }

      const distToPlayer = Math.hypot(pPos.x - npc.pos.x, pPos.z - npc.pos.z);
      if (npc.role === 'civilian' && distToPlayer > 280.0) {
        npc.grp.visible = false;
        continue;
      }
      npc.grp.visible = true;

      let targetSpeed = 0, moveX = 0, moveZ = 0;
      if (npc.role === 'civilian') {
        if (npc.state === 'flee') {
          npc.fleeTimer -= dt;
          if (npc.fleeTimer <= 0) npc.state = 'walk';
          const len = Math.max(0.01, distToPlayer);
          moveX = (npc.pos.x - pPos.x) / len;
          moveZ = (npc.pos.z - pPos.z) / len;
          targetSpeed = 5.4;
        } else {
          const tx = npc.spawnPos.x + Math.sin(time * 0.25 + npc.phase) * 14.0;
          const tz = npc.spawnPos.z + Math.cos(time * 0.21 + npc.phase) * 14.0;
          const dx = tx - npc.pos.x, dz = tz - npc.pos.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.6) {
            moveX = dx / d;
            moveZ = dz / d;
            targetSpeed = 1.7;
          }
        }
      } else {
        npc.attackCd = Math.max(0, npc.attackCd - dt);
        const aggroRange = npc.role === 'police' ? 95.0 : 24.0;
        if (distToPlayer < aggroRange) {
          if (distToPlayer > 1.8) {
            moveX = (pPos.x - npc.pos.x) / distToPlayer;
            moveZ = (pPos.z - npc.pos.z) / distToPlayer;
            targetSpeed = npc.role === 'police' ? 6.0 : 4.4;
          } else {
            npc.yaw = Math.atan2(-(pPos.x - npc.pos.x), -(pPos.z - npc.pos.z));
            if (npc.attackCd <= 0 && !playerState.inVehicle) {
              npc.attackCd = 1.45;
              if (callbacks.onPlayerHit) callbacks.onPlayerHit(npc.role === 'police' ? 10 : 8, npc);
            }
          }
        } else if (npc.role === 'marauder') {
          const tx = npc.spawnPos.x + Math.sin(time * 0.4 + npc.phase) * 4.5;
          const tz = npc.spawnPos.z + Math.cos(time * 0.35 + npc.phase) * 4.5;
          const dx = tx - npc.pos.x, dz = tz - npc.pos.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.3) {
            moveX = dx / d;
            moveZ = dz / d;
            targetSpeed = 1.6;
          }
        }
      }

      npc.vel.x = THREE.MathUtils.lerp(npc.vel.x, moveX * targetSpeed, Math.min(1, 7.0 * dt));
      npc.vel.z = THREE.MathUtils.lerp(npc.vel.z, moveZ * targetSpeed, Math.min(1, 7.0 * dt));
      npc.pos.x += npc.vel.x * dt;
      npc.pos.z += npc.vel.z * dt;
      pushOutOfBuildings(npc.pos);
      npc.pos.y = getCityGroundY(npc.pos.x, npc.pos.z);

      const spd = Math.hypot(npc.vel.x, npc.vel.z);
      if (spd > 0.2) {
        const tyaw = Math.atan2(-npc.vel.x, -npc.vel.z);
        let diff = tyaw - npc.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        npc.yaw += diff * Math.min(1, 8.0 * dt);
      }
      const swing = Math.sin(time * (targetSpeed > 3 ? 11.0 : 5.5) + npc.phase) * Math.min(0.65, spd * 0.18);
      npc.leftLeg.rotation.x = swing;
      npc.rightLeg.rotation.x = -swing;
      npc.leftArm.rotation.x = npc.state === 'flee' ? -2.2 + swing * 0.4 : -swing * 0.75;
      npc.rightArm.rotation.x = npc.attackCd > 1.1 ? -1.4 : (npc.state === 'flee' ? -2.2 - swing * 0.4 : swing * 0.75);
      npc.grp.position.copy(npc.pos);
      npc.grp.rotation.y = npc.yaw;
    }
  }

  return {
    root,
    colliders,
    blocks: layout.blocks,
    layout,
    trafficRoutes: layout.trafficRoutes,
    npcs,
    roadX: ROAD_X,
    roadZ: ROAD_Z,
    signals: { nsGreen: true, ewGreen: false },
    buildingCount: layout.parcels.length,
    tileCount: compiledCity.tileMeshes,
    update,
    panicNear,
    spawnFleeingDriver,
    damageNpc
  };
}
