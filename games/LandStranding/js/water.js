/**
 * Icelandic Hydrological & Atmospheric Mist System:
 * - Dark Glassy Braided Glacial Stream with softly feathered wet pebble banks,
 *   anti-aliased flow ripples, Fresnel sky/aurora reflections, & churning whitewater rapids
 * - Multi-Stream Curved Plunging Cliff Waterfall with gravity-accelerated froth filaments,
 *   ledge splash flares, churning plunge pool, & translucent swirling spray plume
 * - Wind-Sheared Orographic Cloud/Mist Ribbons weaving organically over basalt cliff headlands
 * - Geothermal Fumarole Steam Plumes across infinite macro-cells
 */
import * as THREE from 'three';
import { clamp, mix, smoothstep, hash2i, fbm2, ridged2 } from './noise.js';
import {
  CELL_SIZE,
  TRUNK_SPACING,
  getCellFeatures,
  getTerrainHeight,
  getTrunkRiverX,
  getTrunkWaterY,
  getTrunkWaterYAt,
  getTrunkCenterOverburden,
  sampleLake,
  sampleWorld,
  evalSingleLake,
  getActiveLakesAround
} from './world.js';
import { ATMO_UNIFORMS, ATMO_GLSL_PARS } from './atmosphere.js';

/**
 * Build seamless 800m ribbon segment of the infinite continental glacial trunk river
 * PLUS sculpted 3D vaulted volcanic basalt cave tunnels wherever the river passes beneath a mountain!
 */
function buildTrunkRiverSegment(bandIdx, zIdx) {
  const zStart = zIdx * CELL_SIZE - CELL_SIZE * 0.5;
  const zEnd = zIdx * CELL_SIZE + CELL_SIZE * 0.5;
  const alongSegs = 120;
  const crossSegs = 16;
  const vertCount = (alongSegs + 1) * (crossSegs + 1);
  const pos = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const depthAttr = new Float32Array(vertCount);
  const flowAttr = new Float32Array(vertCount);
  const tunnelDarkAttr = new Float32Array(vertCount);
  const lakeFadeAttr = new Float32Array(vertCount);
  const idx = [];
  const tmpS = {
    height: 0, moss: 0, cliff: 0, path: 0, scree: 0,
    riverDepth: 0, riverMask: 0, flowX: 0, flowZ: 1, snow: 0, glacier: 0, wetness: 0, hummockAO: 0.5,
    caveSignedD: 99, caveWaterY: 16, caveOverburden: 0
  };

  for (let i = 0; i <= alongSegs; i++) {
    const f = i / alongSegs;
    const z = mix(zStart, zEnd, f);
    const rx = getTrunkRiverX(z, bandIdx);
    const dxdz = (getTrunkRiverX(z + 4.0, bandIdx) - getTrunkRiverX(z - 4.0, bandIdx)) * 0.125;
    const invLen = 1.0 / Math.hypot(1.0, dxdz);
    const nx = invLen;
    const nz = -dxdz * invLen;
    const waterY = getTrunkWaterYAt(rx, z);
    const halfW = 17.5;

    for (let j = 0; j <= crossSegs; j++) {
      const u = j / crossSegs;
      const offset = (u - 0.5) * 2.0 * halfW;
      const wx = rx + nx * offset;
      const wz = z + nz * offset;
      const vi = i * (crossSegs + 1) + j;

      sampleWorld(wx, wz, tmpS);
      pos[vi * 3] = wx;
      pos[vi * 3 + 1] = waterY;
      pos[vi * 3 + 2] = wz;

      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = (z / CELL_SIZE) * 20.0;

      // Inside subterranean mountain cave tunnels, compute true underground riverbed depth instead of overhead mountain roof!
      const inTunnel = smoothstep(14.8, 20.0, tmpS.caveOverburden);
      const openDepth = waterY - tmpS.height;
      const caveDepth = 1.40 * (1.0 - Math.pow(clamp(Math.abs(offset) / 14.2, 0, 1), 2.0)) - 0.06;
      depthAttr[vi] = mix(openDepth, caveDepth, inTunnel);
      flowAttr[vi] = 0.5;
      tunnelDarkAttr[vi] = smoothstep(15.5, 31.0, tmpS.caveOverburden);
      lakeFadeAttr[vi] = 1.0 - smoothstep(-18.0, -1.0, tmpS.lakeShoreDist || -9999);
    }
  }

  for (let i = 0; i < alongSegs; i++) {
    for (let j = 0; j < crossSegs; j++) {
      const a = i * (crossSegs + 1) + j;
      const b = a + 1;
      const c = a + (crossSegs + 1);
      const d = c + 1;
      if (
        lakeFadeAttr[a] <= 0.005 &&
        lakeFadeAttr[b] <= 0.005 &&
        lakeFadeAttr[c] <= 0.005 &&
        lakeFadeAttr[d] <= 0.005
      ) {
        continue;
      }
      idx.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aDepth', new THREE.BufferAttribute(depthAttr, 1));
  geo.setAttribute('aFlowT', new THREE.BufferAttribute(flowAttr, 1));
  geo.setAttribute('aTunnelDark', new THREE.BufferAttribute(tunnelDarkAttr, 1));
  geo.setAttribute('aLakeFade', new THREE.BufferAttribute(lakeFadeAttr, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Build sculpted 3D vaulted volcanic basalt cave tunnels + overhanging rocky portal collars
 * wherever the infinite glacial trunk river passes beneath a mountain or cliff ridge!
 */
function buildRiverCaveTunnels(bandIdx, zIdx) {
  const pad = 24.0;
  const zMin = zIdx * CELL_SIZE - CELL_SIZE * 0.5 - pad;
  const zMax = zIdx * CELL_SIZE + CELL_SIZE * 0.5 + pad;
  const stepZ = 4.0;
  const steps = Math.ceil((zMax - zMin) / stepZ);

  // Sample smooth river centerline overburden to detect every real mountain/cliff cave span cleanly
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    const z = zMin + (i / steps) * (zMax - zMin);
    const rx = getTrunkRiverX(z, bandIdx);
    const waterY = getTrunkWaterYAt(rx, z);
    const over = getTrunkCenterOverburden(z, bandIdx);
    samples.push({ z, rx, waterY, over });
  }

  // Group contiguous subterranean mountain spans right where the rising cliff face closes overhead (over > 15.2m)
  const spans = [];
  let inSpan = false;
  let sStart = 0;
  for (let i = 0; i < samples.length; i++) {
    const under = samples[i].over > 15.2;
    if (under && !inSpan) {
      inSpan = true;
      sStart = i;
    } else if (!under && inSpan) {
      inSpan = false;
      spans.push([sStart, Math.max(sStart, i - 1)]);
    }
  }
  if (inSpan) spans.push([sStart, samples.length - 1]);
  if (spans.length === 0) return null;

  const pos = [];
  const norm = [];
  const portalDistAttr = [];
  const idx = [];
  let vBase = 0;

  // High-res full closed cross-section: 24 vaulted basalt arch segments + 4 submerged riverbed floor segments (ZERO gaps!)
  const archSegs = 24;
  const ringSegs = archSegs + 4;

  for (const [i0, i1] of spans) {
    if (i1 - i0 < 2) continue;
    const lenCount = i1 - i0 + 1;
    const startIsPortal = samples[i0].over <= 20.5;
    const endIsPortal = samples[i1].over <= 20.5;

    for (let li = 0; li < lenCount; li++) {
      const si = i0 + li;
      const sp = samples[si];
      const dxdz = (getTrunkRiverX(sp.z + 4.0, bandIdx) - getTrunkRiverX(sp.z - 4.0, bandIdx)) * 0.125;
      const invLen = 1.0 / Math.hypot(1.0, dxdz);
      const nx = invLen;
      const nz = -dxdz * invLen;

      // Distance inside cave from nearest open mouth (for smooth daylight -> deep subterranean basalt shadow)
      const distFromStart = startIsPortal ? li * stepZ : 999.0;
      const distFromEnd = endIsPortal ? (lenCount - 1 - li) * stepZ : 999.0;
      const portalDist = Math.min(distFromStart, distFromEnd);

      for (let ri = 0; ri <= ringSegs; ri++) {
        let localX, localY, ca, sa;
        if (ri <= archSegs) {
          // Vaulted craggy basalt ceiling & canyon walls (sweeps right waterline -> irregular rocky ceiling -> left waterline)
          const u = ri / archSegs;
          const ang = mix(-0.22, Math.PI + 0.22, u);
          ca = Math.cos(ang);
          sa = Math.sin(ang);

          // Organic irregular Icelandic sea-cave / lava-tube proportions cleanly wider than the 12.6m/10.4m terrain cutout
          const baseRadX = 13.4;
          const baseRadY = 11.4;

          const rockN = ridged2(sp.z * 0.055 + ca * 1.6, ang * 2.1 + sp.rx * 0.03, 3, 733);
          const rockB = fbm2(sp.z * 0.12 - sa * 1.4, ca * 2.8, 2, 757);
          const cragDisp = (rockN - 0.45) * 2.2 + (rockB - 0.5) * 1.4;

          const radX = baseRadX + cragDisp * (0.35 + 0.65 * Math.abs(ca));
          const radY = baseRadY + cragDisp * (0.28 + 0.72 * Math.max(sa, 0.0));
          localX = ca * radX;
          localY = sa * radY;
        } else {
          // Submerged dark basalt riverbed floor closing the bottom loop under the water ribbon!
          const fu = (ri - archSegs) / 4; // 0 (left bank) -> 1 (right bank)
          localX = mix(-13.4, 13.4, fu);
          const midDip = Math.sin(fu * Math.PI);
          localY = -2.0 - midDip * 1.2;
          ca = 0.0;
          sa = -1.0;
        }

        const wx = sp.rx + nx * localX;
        const wz = sp.z + nz * localX;
        let wy = sp.waterY + localY;

        // Tuck cave roof cleanly beneath the actual mountain hillside so it never pokes through outside slopes
        if (ri <= archSegs && localY > 0.2 && portalDist < 24.0) {
          const actualSurfY = getTerrainHeight(wx, wz);
          const maxRoofY = actualSurfY - 0.25;
          if (wy > maxRoofY) wy = maxRoofY;
        }

        pos.push(wx, wy, wz);
        const inNx = -(nx * ca);
        const inNy = -sa;
        const inNz = -(nz * ca);
        const nLen = Math.hypot(inNx, inNy, inNz) || 1.0;
        norm.push(inNx / nLen, inNy / nLen, inNz / nLen);
        portalDistAttr.push(portalDist);
      }
    }

    const ringStride = ringSegs + 1;
    for (let li = 0; li < lenCount - 1; li++) {
      for (let ri = 0; ri < ringSegs; ri++) {
        const a = vBase + li * ringStride + ri;
        const b = a + 1;
        const c = a + ringStride;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    vBase += lenCount * ringStride;
  }

  if (pos.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('aPortalDist', new THREE.Float32BufferAttribute(portalDistAttr, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Build high-resolution conforming ribbon mesh along any procedural tributary river polyline (merges smoothly into trunk waterY!). */
function buildRiverGeometry(pts) {
  const segsPerSpan = 22;
  const crossSegs = 20;
  const samples = [];

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const tx = dx / len;
    const tz = dz / len;
    const nx = -tz;
    const nz = tx;

    const count = i === pts.length - 2 ? segsPerSpan + 1 : segsPerSpan;
    for (let s = 0; s < count; s++) {
      const t = s / segsPerSpan;
      const gx = mix(a.x, b.x, t);
      const gz = mix(a.z, b.z, t);
      const globalT = (i + t) / (pts.length - 1);
      samples.push({ x: gx, z: gz, nx, nz, tx, tz, t: globalT });
    }
  }

  const vertCount = samples.length * (crossSegs + 1);
  const pos = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const depthAttr = new Float32Array(vertCount);
  const flowAttr = new Float32Array(vertCount);
  const lakeFadeAttr = new Float32Array(vertCount);
  const idx = [];

  const tmpS = {
    height: 0, moss: 0, cliff: 0, path: 0, scree: 0,
    riverDepth: 0, riverMask: 0, flowX: 0, flowZ: 1, snow: 0, wetness: 0, hummockAO: 0.5
  };
  const _rivLakeTmp = { lake: null, shoreMeters: -9999, bedDepth: 0, waterY: 16, shoreGrade: 60, isletBoost: 0 };

  // Sample smooth monotonic channel floor heights & lock confluence endpoint cleanly to trunk/lake waterY!
  const spanWaterY = new Float32Array(samples.length);
  const endPt = samples[samples.length - 1];
  const confWaterY = getTrunkWaterYAt(endPt.x, endPt.z);
  for (let i = 0; i < samples.length; i++) {
    const sp = samples[i];
    const halfW = mix(10.0, 15.8, sp.t);
    let minBedY = 1e9;
    for (let c = -4; c <= 4; c++) {
      const sx = sp.x + sp.nx * (c / 4) * halfW * 0.52;
      const sz = sp.z + sp.nz * (c / 4) * halfW * 0.52;
      const y = getTerrainHeight(sx, sz);
      if (y < minBedY) minBedY = y;
    }
    let localY = minBedY + 1.08;
    sampleLake(sp.x, sp.z, _rivLakeTmp);
    if (_rivLakeTmp.lake && _rivLakeTmp.shoreMeters > -_rivLakeTmp.shoreGrade * 1.2) {
      const lkBlend = smoothstep(-_rivLakeTmp.shoreGrade * 1.2, -4.0, _rivLakeTmp.shoreMeters);
      localY = mix(localY, _rivLakeTmp.waterY, lkBlend);
    }
    const confBlend = Math.pow(clamp((sp.t - 0.65) / 0.35, 0, 1), 1.5);
    spanWaterY[i] = mix(localY, confWaterY + 0.02, confBlend);
  }
  // Smooth pass to prevent sudden vertical kinks in water surface
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < samples.length - 1; i++) {
      spanWaterY[i] = spanWaterY[i - 1] * 0.25 + spanWaterY[i] * 0.5 + spanWaterY[i + 1] * 0.25;
    }
  }
  // Enforce strict gravity-consistent downhill profile anchored at plunge pool (never climbs uphill or floats in mid-air)
  spanWaterY[0] = Math.max(spanWaterY[0], confWaterY + 0.02);
  for (let i = 1; i < samples.length; i++) {
    spanWaterY[i] = Math.max(confWaterY + 0.02, Math.min(spanWaterY[i], spanWaterY[i - 1]));
  }
  spanWaterY[samples.length - 1] = confWaterY + 0.02;

  for (let i = 0; i < samples.length; i++) {
    const sp = samples[i];
    const halfW = mix(10.0, 15.8, sp.t);
    const waterY = spanWaterY[i];

    for (let j = 0; j <= crossSegs; j++) {
      const u = j / crossSegs;
      const offset = (u - 0.5) * 2.0 * halfW;
      const wx = sp.x + sp.nx * offset;
      const wz = sp.z + sp.nz * offset;
      const vi = i * (crossSegs + 1) + j;

      sampleWorld(wx, wz, tmpS);
      const depth = waterY - tmpS.height;

      pos[vi * 3] = wx;
      pos[vi * 3 + 1] = waterY;
      pos[vi * 3 + 2] = wz;

      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = sp.t * 16.0;
      depthAttr[vi] = depth;
      flowAttr[vi] = sp.t;
      lakeFadeAttr[vi] = 1.0 - smoothstep(-18.0, -1.0, tmpS.lakeShoreDist || -9999);
    }
  }

  for (let i = 0; i < samples.length - 1; i++) {
    for (let j = 0; j < crossSegs; j++) {
      const a = i * (crossSegs + 1) + j;
      const b = a + 1;
      const c = a + (crossSegs + 1);
      const d = c + 1;
      // Upward-facing (+Y) winding order so river surface is never back-face culled
      idx.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aDepth', new THREE.BufferAttribute(depthAttr, 1));
  geo.setAttribute('aFlowT', new THREE.BufferAttribute(flowAttr, 1));
  geo.setAttribute('aTunnelDark', new THREE.BufferAttribute(new Float32Array(vertCount), 1));
  geo.setAttribute('aLakeFade', new THREE.BufferAttribute(lakeFadeAttr, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Build photorealistic multi-stream plunging waterfall + curved crest roll-over +
 * churning whitewater plunge pool + translucent swirling spray mist plumes.
 */
function buildWaterfallGroup(wf, waterfallMat, plungePoolMat, mistMat) {
  const grp = new THREE.Group();
  const forwardX = Math.sin(wf.yaw);
  const forwardZ = Math.cos(wf.yaw);
  const plungeCenterX = wf.plungeX !== undefined ? wf.plungeX : wf.x + forwardX * 22.0;
  const plungeCenterZ = wf.plungeZ !== undefined ? wf.plungeZ : wf.z + forwardZ * 22.0;

  // Sample true cliff crest height behind notch & true plunge pool elevation at valley floor
  const baseY = getTerrainHeight(plungeCenterX, plungeCenterZ);
  const crestY = Math.max(
    getTerrainHeight(wf.x - forwardX * 16.0, wf.z - forwardZ * 16.0),
    getTerrainHeight(wf.x - forwardX * 24.0, wf.z - forwardZ * 24.0)
  );
  if (crestY - baseY < 14.0) return null;
  const dropH = clamp(crestY - baseY + 4.0, 42, 138);
  const lipStartX = wf.x + forwardX * 4.5;
  const lipStartZ = wf.z + forwardZ * 4.5;

  // 3 graceful braided 3D cascade ribbons nestled inside the recessed basalt cliff cleft:
  // 1 dramatic main cascade + 2 slender companion silver ribbons plunging cleanly into the misty plunge pool!
  const tangentX = Math.cos(wf.yaw);
  const tangentZ = -Math.sin(wf.yaw);
  const cascadeSpecs = [
    { offT: 0.0,  width: 7.4,  curveOut: 11.2, zOff: -0.4, alphaMul: 0.90, fanAmt: 0.62, speedMul: 1.00 },
    { offT: 0.0,  width: 11.2, curveOut: 12.4, zOff: 0.9,  alphaMul: 0.64, fanAmt: 0.80, speedMul: 1.22 },
    { offT: 0.0,  width: 15.8, curveOut: 13.8, zOff: 2.3,  alphaMul: 0.34, fanAmt: 1.05, speedMul: 0.88 },
    // Companion slender Icelandic cliff ribbons inside the amphitheater cleft (plunging cleanly into plunge mist!)
    { offT: -8.2, width: 4.2,  curveOut: 12.6, zOff: 0.6,  alphaMul: 0.72, fanAmt: 0.66, speedMul: 1.14 },
    { offT: 9.8,  width: 3.6,  curveOut: 12.4, zOff: 0.8,  alphaMul: 0.62, fanAmt: 0.60, speedMul: 0.92 }
  ];

  const companionBases = [];
  for (let l = 0; l < cascadeSpecs.length; l++) {
    const spec = cascadeSpecs[l];
    const cxLip = lipStartX + tangentX * spec.offT;
    const czLip = lipStartZ + tangentZ * spec.offT;
    const localBaseY = baseY;
    const localCrestY = spec.offT === 0 ? crestY : Math.max(
      getTerrainHeight(cxLip - forwardX * 16.0, czLip - forwardZ * 16.0),
      getTerrainHeight(cxLip - forwardX * 24.0, czLip - forwardZ * 24.0)
    );
    const localDropH = clamp(localCrestY - localBaseY + 4.0, 38, 142);
    if (localDropH < 40 && spec.offT !== 0) continue;

    if (spec.offT !== 0) {
      companionBases.push({
        x: plungeCenterX + tangentX * spec.offT,
        y: baseY + 0.8,
        z: plungeCenterZ + tangentZ * spec.offT
      });
    }

    const geo = new THREE.PlaneGeometry(spec.width, localDropH, 12, 32);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const t = clamp(1.0 - (y + localDropH * 0.5) / localDropH, 0.0, 1.0);

      const lipTuck = (1.0 - Math.min(t * 8.0, 1.0)) * -3.2;
      const parabola = Math.pow(t, 0.74) * spec.curveOut;
      const lateralBow = Math.cos((x / (spec.width * 0.5)) * 1.45) * 1.8;
      const fan = 0.54 + Math.pow(t, 1.2) * spec.fanAmt;
      p.setXYZ(i, x * fan, y, lipTuck + parabola + lateralBow + spec.zOff);
    }
    geo.computeVertexNormals();

    const mat = waterfallMat.clone();
    mat.uniforms = THREE.UniformsUtils.clone(waterfallMat.uniforms);
    for (const k of Object.keys(ATMO_UNIFORMS)) {
      if (mat.uniforms[k]) mat.uniforms[k] = ATMO_UNIFORMS[k];
    }
    mat.uniforms.uFoamTex.value = waterfallMat.uniforms.uFoamTex.value;
    mat.uniforms.uLayerOpacity.value = spec.alphaMul;
    mat.uniforms.uLayerSeed.value = l * 3.71;
    mat.uniforms.uSpeedMul.value = spec.speedMul;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cxLip, localBaseY + localDropH * 0.5 - 2.0, czLip);
    mesh.rotation.y = wf.yaw;
    mesh.renderOrder = 4 + Math.min(l, 2);
    grp.add(mesh);
  }

  // Churning turbulent whitewater foam disc at plunge pool impact zone
  const poolGeo = new THREE.CircleGeometry(15.5, 28);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMesh = new THREE.Mesh(poolGeo, plungePoolMat);
  poolMesh.position.set(plungeCenterX, baseY + 1.05, plungeCenterZ);
  poolMesh.renderOrder = 3;
  grp.add(poolMesh);

  // Translucent swirling volumetric plunge-pool spray plumes (main + companion cascade bases!)
  const extraPuffs = companionBases.length * 6;
  const puffCount = 30 + extraPuffs;
  const puffGeo = new THREE.PlaneGeometry(1, 1);
  const puffInst = new THREE.InstancedMesh(puffGeo, mistMat, puffCount);
  const dummy = new THREE.Object3D();
  const seeds = new Float32Array(puffCount * 4);

  for (let i = 0; i < 30; i++) {
    const angle = hash2i(i, 11, 881) * Math.PI * 2;
    const rad = Math.pow(hash2i(i, 23, 881), 0.7) * 20.0;
    const spreadX = Math.cos(angle) * rad * 1.05 + forwardX * 7.5;
    const spreadZ = Math.sin(angle) * rad * 0.90 + forwardZ * 7.5;
    const sc = 11.0 + hash2i(i, 41, 881) * 14.0;
    const hOff = 0.65 + hash2i(i, 37, 881) * 9.5;
    dummy.position.set(plungeCenterX + spreadX, baseY + hOff, plungeCenterZ + spreadZ);
    dummy.scale.set(sc * 1.45, sc * 0.88, 1);
    dummy.updateMatrix();
    puffInst.setMatrixAt(i, dummy.matrix);
    seeds[i * 4] = hash2i(i, 53, 881) * 100.0;
    seeds[i * 4 + 1] = 0.14 + hash2i(i, 67, 881) * 0.16;
    seeds[i * 4 + 2] = 0.42 + hash2i(i, 79, 881) * 0.45;
    seeds[i * 4 + 3] = 1.0;
  }
  let pIdx = 30;
  for (let cb = 0; cb < companionBases.length; cb++) {
    const b = companionBases[cb];
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2 + cb;
      const rad = 2.0 + hash2i(k, cb + 7, 883) * 6.5;
      const sc = 7.5 + hash2i(k, cb + 19, 883) * 7.5;
      dummy.position.set(b.x + Math.cos(ang) * rad, b.y + hash2i(k, cb + 31, 883) * 5.0, b.z + Math.sin(ang) * rad);
      dummy.scale.set(sc * 1.35, sc * 0.85, 1);
      dummy.updateMatrix();
      puffInst.setMatrixAt(pIdx, dummy.matrix);
      seeds[pIdx * 4] = (pIdx + 11) * 7.7;
      seeds[pIdx * 4 + 1] = 0.16 + hash2i(k, cb + 41, 883) * 0.14;
      seeds[pIdx * 4 + 2] = 0.50;
      seeds[pIdx * 4 + 3] = 1.0;
      pIdx++;
    }
  }
  puffInst.instanceMatrix.needsUpdate = true;
  puffGeo.setAttribute('aMistSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  puffInst.renderOrder = 8;
  puffInst.frustumCulled = false;
  grp.add(puffInst);

  return { group: grp, plungePos: new THREE.Vector3(plungeCenterX, baseY + 6, plungeCenterZ) };
}

/**
 * Build seamless, crack-free world-space surface geometry for a glacial lake (230m..3.5km+).
 * - 100% uniform grid (ZERO T-junction pinholes!) extending generously beneath surrounding terrain banks
 *   so the water surface never terminates prematurely in shallow water.
 * - Exact sub-meter shoreline depth & beach slope are sampled per-pixel via a camera-centered
 *   rolling 160x160 GPU terrain-depth map (1.6m/texel, hardware bilinear filtered).
 */
function buildLakeGeometry(lake) {
  const segs = lake.tier === 'macro' ? (lake.rx > 2400 ? 224 : 128) : 64;
  const gridN = segs + 1;
  const extent = 1.60;
  const evalTmp = { inside: false, shoreMeters: -9999, bedDepth: 0, isletBoost: 0 };

  const gridX = new Float32Array(gridN * gridN);
  const gridZ = new Float32Array(gridN * gridN);
  const gridDepth = new Float32Array(gridN * gridN);
  const gridShore = new Float32Array(gridN * gridN);

  for (let iv = 0; iv <= segs; iv++) {
    const v = ((iv / segs) * 2.0 - 1.0) * extent;
    const lz = v * lake.rz;
    for (let iu = 0; iu <= segs; iu++) {
      const u = ((iu / segs) * 2.0 - 1.0) * extent;
      const lx = u * lake.rx;
      const wx = lake.cx + lx * lake.cosR - lz * lake.sinR;
      const wz = lake.cz + lx * lake.sinR + lz * lake.cosR;
      const gi = iv * gridN + iu;
      gridX[gi] = wx;
      gridZ[gi] = wz;
      evalSingleLake(lake, wx, wz, evalTmp);
      gridDepth[gi] = evalTmp.bedDepth;
      gridShore[gi] = evalTmp.shoreMeters;
    }
  }

  // Generous tuck-under margin into surrounding hillsides so the mesh never stops short of any cove or bay!
  const shorePad = lake.tier === 'macro' ? Math.min(-135.0, -lake.avgR * 0.06) : -65.0;
  const remap = new Int32Array(gridN * gridN).fill(-1);
  const pos = [];
  const depthAttr = [];
  const shoreAttr = [];
  const scaleAttr = [];
  const idx = [];

  const getVert = (gi) => {
    let vi = remap[gi];
    if (vi < 0) {
      vi = pos.length / 3;
      remap[gi] = vi;
      pos.push(gridX[gi], lake.waterY, gridZ[gi]);
      depthAttr.push(gridDepth[gi]);
      shoreAttr.push(gridShore[gi]);
      scaleAttr.push(lake.avgR);
    }
    return vi;
  };

  for (let iv = 0; iv < segs; iv++) {
    for (let iu = 0; iu < segs; iu++) {
      const a = iv * gridN + iu;
      const b = a + 1;
      const c = a + gridN;
      const d = c + 1;
      if (
        gridShore[a] <= shorePad &&
        gridShore[b] <= shorePad &&
        gridShore[c] <= shorePad &&
        gridShore[d] <= shorePad
      ) {
        continue;
      }
      const va = getVert(a);
      const vb = getVert(b);
      const vc = getVert(c);
      const vd = getVert(d);
      idx.push(va, vc, vb, vb, vc, vd);
    }
  }

  if (idx.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aLakeDepth', new THREE.Float32BufferAttribute(depthAttr, 1));
  geo.setAttribute('aShoreDist', new THREE.Float32BufferAttribute(shoreAttr, 1));
  geo.setAttribute('aLakeScale', new THREE.Float32BufferAttribute(scaleAttr, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export function createWaterSystem(texLib, scene) {
  const root = new THREE.Group();
  scene.add(root);

  // 1. Dark Glassy Braided Glacial River Shader Material (soft bank feathering, crisp whitewater rapids)
  const riverMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      ...ATMO_UNIFORMS,
      uNormalA: { value: texLib.waterNormalA },
      uNormalB: { value: texLib.waterNormalB },
      uFoamTex: { value: texLib.waterfallFoam }
    },
    vertexShader: /* glsl */`
      attribute float aDepth;
      attribute float aFlowT;
      attribute float aTunnelDark;
      attribute float aLakeFade;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vDepth;
      varying float vFlowT;
      varying float vTunnelDark;
      varying float vLakeFade;
      void main() {
        vUv = uv;
        vDepth = aDepth;
        vFlowT = aFlowT;
        vTunnelDark = aTunnelDark;
        vLakeFade = aLakeFade;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uNormalA;
      uniform sampler2D uNormalB;
      uniform sampler2D uFoamTex;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vDepth;
      varying float vFlowT;
      varying float vTunnelDark;
      varying float vLakeFade;
      ${ATMO_GLSL_PARS}

      void main() {
        // Soft natural bank feathering & smooth river-to-lake transition (zero jagged or straight cut edges!)
        if (vDepth <= -0.04 || vLakeFade <= 0.005) discard;
        float depthClean = max(vDepth, 0.0);

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float camDist = length(cameraPosition - vWorldPos);

        // Smooth liquid normal ripples (low-frequency silky flow, ZERO grainy sand-like glitter!)
        vec2 flowUvA = vec2(vUv.x * 1.45, vUv.y * 0.72 - uTime * 0.54);
        vec2 flowUvB = vec2(vUv.x * 2.65 + 0.37, vUv.y * 1.35 - uTime * 0.84);
        vec3 nA = texture2D(uNormalA, flowUvA).xyz * 2.0 - 1.0;
        vec3 nB = texture2D(uNormalB, flowUvB).xyz * 2.0 - 1.0;
        float rippleDamp = mix(0.13, 0.05, smoothstep(14.0, 120.0, camDist));
        vec3 n = normalize(vec3((nA.x + nB.x * 0.65) * rippleDamp, 1.0, (nA.y + nB.y * 0.65) * rippleDamp));

        // Cool translucent shallow glacial blue-grey river water (properly dark & moonlit at night!)
        float dayFactor = 1.0 - uNightFactor;
        float shallow = exp(-depthClean * 2.1);
        vec3 deepWater = vec3(0.018, 0.036, 0.048) * mix(0.06, 1.0, dayFactor);
        vec3 shallowBed = vec3(0.046, 0.062, 0.068) * mix(0.07, 1.0, dayFactor);
        vec3 waterCol = mix(deepWater, shallowBed, shallow);

        // Physically calibrated Icelandic glacial river reflection (linear PBR space!):
        // Dark glassy translucent slate-blue water close-up with crisp ripples -> luminous silver-blue sky sheen at grazing valley angles!
        vec3 reflDir = reflect(-viewDir, n);
        float cosT = clamp(dot(n, viewDir), 0.0, 1.0);
        float fresnel = 0.04 + 0.72 * pow(1.0 - cosT, 3.8);
        vec3 dayZenith = mix(uSkyZenith * 0.65, vec3(0.11, 0.145, 0.185), uCloudCoverage * 0.75);
        vec3 skyZen = mix(dayZenith, uSkyZenith * 0.45, uNightFactor);
        vec3 skyHor = mix(uSkyHorizon * 0.54, uSkyHorizon * 0.38, uNightFactor);
        vec3 reflSky = mix(skyHor, skyZen, smoothstep(0.03, 0.48, max(reflDir.y, 0.0)));
        reflSky += uAuroraTint * 0.20 * uAuroraStrength * uNightFactor * 0.45;
        // Pronounced flowing ripple luminance variation so water reads liquid & alive (never flat white!)
        float ripMod = 0.68 + 0.48 * clamp((nA.x + nB.y) * 1.65 + 0.5, 0.0, 1.0);
        reflSky *= ripMod;

        // Sun specular by day + crisp cool lunar glint by night (masked by mountain terrain shadow)!
        float rTerrainShadow = sampleTerrainShadow(vWorldPos);
        vec3 halfSun = normalize(viewDir + normalize(vec3(uSunDir.x, max(uSunDir.y, 0.38), uSunDir.z)));
        float sunSpec = pow(max(dot(n, halfSun), 0.0), 64.0) * 0.22 * dayFactor * rTerrainShadow;
        vec3 halfMoon = normalize(viewDir + normalize(vec3(uMoonDir.x, max(uMoonDir.y, 0.25), uMoonDir.z)));
        float moonSpec = pow(max(dot(n, halfMoon), 0.0), 96.0) * 0.14 * uNightFactor * (1.0 - uCloudCoverage * 0.65) * rTerrainShadow;

        vec3 col = mix(waterCol, reflSky, clamp(fresnel * 0.85, 0.10, 0.76)) + uSunColor * sunSpec + vec3(0.55, 0.70, 0.92) * moonSpec;

        // Crisp broken whitewater riffles & shallow bank ripples (true physical moonlit foam brightness at night!)
        vec2 foamUvA = vec2(vUv.x * 2.2, vUv.y * 0.82 - uTime * 0.78);
        vec2 foamUvB = vec2(vUv.x * 5.0 + 0.41, vUv.y * 1.65 - uTime * 1.32);
        vec3 fA = texture2D(uFoamTex, foamUvA).rgb;
        vec3 fB = texture2D(uFoamTex, foamUvB).rgb;
        float rapidPattern = fA.r * 0.50 + fB.g * 0.50;
        float turbulence = atmoFbm(vec2(vUv.x * 6.5, vUv.y * 2.8 - uTime * 1.45));

        float plungeBoost = (1.0 - smoothstep(0.0, 0.16, vFlowT)) * 0.34;
        float bankNoise = smoothstep(0.36, 0.78, turbulence * 0.65 + fA.r * 0.50);
        float bankEdge = (1.0 - smoothstep(0.02, 0.20, depthClean)) * smoothstep(0.0, 0.05, depthClean) * bankNoise;
        float riffleBand = smoothstep(0.56, 0.80, rapidPattern + (0.42 - depthClean) * 0.36 + plungeBoost);
        float centerThread = smoothstep(0.62, 0.84, fB.g * 0.62 + turbulence * 0.54) * smoothstep(0.05, 0.45, depthClean) * 0.62;

        float foam = clamp(bankEdge * 0.55 + riffleBand * 0.72 + centerThread, 0.0, 0.84);

        vec3 foamDay = mix(vec3(0.80, 0.86, 0.91), vec3(0.98, 0.99, 1.0) * uSunColor, 0.68);
        vec3 foamNight = vec3(0.016, 0.024, 0.036) * (0.65 + 0.50 * (1.0 - uCloudCoverage * 0.55)) + vec3(0.010, 0.045, 0.032) * uAuroraStrength;
        vec3 foamLit = mix(foamDay, foamNight, uNightFactor);
        col = mix(col, foamLit, foam);

        // Smooth subterranean shadow as the river glides deep into a volcanic mountain cave tunnel!
        float darkT = clamp(vTunnelDark, 0.0, 1.0);
        col *= mix(1.0, 0.09, darkT);

        vec3 atmoWater = applyIcelandAtmo(col, vWorldPos);
        col = mix(atmoWater, mix(col, atmoWater * 0.35, 0.45), darkT * 0.78);
        float bankAlpha = smoothstep(0.0, 0.32, depthClean);
        float alpha = bankAlpha * clamp(vLakeFade, 0.0, 1.0) * mix(0.84, 0.98, clamp(foam + fresnel * 0.5, 0.0, 1.0));
        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  // 2. Photorealistic Multi-Stream Plunging Waterfall Material
  const waterfallMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      ...ATMO_UNIFORMS,
      uFoamTex: { value: texLib.waterfallFoam },
      uLayerOpacity: { value: 1.0 },
      uLayerSeed: { value: 0.0 },
      uSpeedMul: { value: 1.0 }
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNorm;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNorm = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uFoamTex;
      uniform float uLayerOpacity;
      uniform float uLayerSeed;
      uniform float uSpeedMul;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNorm;
      ${ATMO_GLSL_PARS}

      void main() {
        float t = clamp(1.0 - vUv.y, 0.0, 1.0); // 0 at lip crest -> 1 at plunge pool

        // Gravity acceleration: water stretches & falls faster toward bottom (guarded against MSAA negative pow)
        float fallStretch = pow(max(t, 0.0001), 0.84) * 1.35;
        float speed = uSpeedMul;

        // Multi-scale turbulent cascading foam ribbons + droplet spray breakup
        vec2 uvA = vec2(vUv.x * 1.65 + uLayerSeed * 0.17, fallStretch * 1.10 - uTime * 0.72 * speed);
        vec2 uvB = vec2(vUv.x * 3.40 - uLayerSeed * 0.23, fallStretch * 2.15 - uTime * 1.18 * speed);
        vec2 uvC = vec2(vUv.x * 6.20 + uLayerSeed * 0.41, fallStretch * 3.60 - uTime * 1.72 * speed);

        vec3 fA = texture2D(uFoamTex, uvA).rgb;
        vec3 fB = texture2D(uFoamTex, uvB).rgb;
        vec3 fC = texture2D(uFoamTex, uvC).rgb;

        // Crisp multi-braided Icelandic split-stream silhouette (dark wet rock peeks organically between braided jets!)
        float wobbleA = sin(t * 3.4 + uLayerSeed) * 0.028 + (fA.b - 0.5) * 0.075;
        float wobbleB = cos(t * 2.7 - uLayerSeed) * 0.024 + (fB.b - 0.5) * 0.065;
        float jMainD  = (vUv.x - 0.40 - wobbleA) * mix(7.2, 4.4, t);
        float jRightD = (vUv.x - 0.68 - wobbleB) * mix(9.2, 5.6, t);
        float jThinD  = (vUv.x - 0.24 + wobbleB) * 11.5;
        float jetMain  = exp(-(jMainD * jMainD));
        float jetRight = exp(-(jRightD * jRightD)) * 0.78;
        float jetThin  = exp(-(jThinD * jThinD)) * 0.42;
        float coreShape = clamp(jetMain + jetRight + jetThin, 0.0, 1.0);

        // Airy feathery water filaments & dramatic droplet spray breakup
        float ribbons = fA.r * 0.44 + fB.g * 0.36 + fC.g * 0.20;
        float breakup = smoothstep(0.24, 0.82, ribbons + t * 0.16);

        // Organic tattered edges & smooth top + soft misty bottom fade (zero flat horizontal ribbon cutoffs!)
        float sideFade = smoothstep(0.05, 0.26, vUv.x) * (1.0 - smoothstep(0.74, 0.95, vUv.x));
        float topFade = smoothstep(0.0, 0.10, t + (fB.r - 0.5) * 0.07);
        float botFade = 1.0 - smoothstep(0.84, 1.0, t + (fA.b - 0.5) * 0.08);
        float botSpray = smoothstep(0.62, 0.94, t) * fC.b * 0.48;

        float alpha = clamp((breakup * 0.88 + 0.04 + botSpray) * coreShape * sideFade * topFade * botFade * uLayerOpacity, 0.0, 0.94);
        if (alpha < 0.015) discard;

        float foamDensity = clamp(breakup * 0.78 + fC.b * 0.22 + botSpray, 0.0, 1.0);
        vec3 deepAqua = mix(vec3(0.14, 0.20, 0.25), vec3(0.006, 0.011, 0.018), uNightFactor);
        vec3 brightFoam = mix(
          vec3(0.90, 0.94, 0.97) * mix(vec3(0.84, 0.88, 0.92), uSunColor * 1.08, 0.55),
          vec3(0.026, 0.036, 0.052) * (0.70 + 0.45 * (1.0 - uCloudCoverage * 0.5)),
          uNightFactor
        );
        vec3 col = mix(deepAqua, brightFoam, smoothstep(0.16, 0.78, foamDensity));
        // Subtle cloud shadow variation across tall cliff drop
        col *= mix(0.78, 1.04, sampleCloudShadow(vWorldPos.xz));
        col += vec3(0.018, 0.14, 0.10) * uAuroraStrength * uNightFactor * 0.45;

        col = applyIcelandAtmo(col, vWorldPos);
        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  // 3. Churning Whitewater Plunge Pool Surface Material
  const plungePoolMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      ...ATMO_UNIFORMS,
      uFoamTex: { value: texLib.waterfallFoam }
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uFoamTex;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      ${ATMO_GLSL_PARS}

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (r >= 0.98) discard;
        float ang = atan(p.y, p.x);
        vec2 radUv = vec2(ang * 0.65, r * 2.2 - uTime * 0.75);
        float churn = texture2D(uFoamTex, radUv).b * 0.6 + atmoFbm(p * 4.2 - vec2(0.0, uTime * 0.9)) * 0.4;
        float ring = pow(max(1.0 - r / 0.98, 0.0), 1.75) * smoothstep(0.28, 0.76, churn + (1.0 - r) * 0.40);
        if (ring < 0.02) discard;

        vec3 poolNight = vec3(0.020, 0.030, 0.042) + vec3(0.010, 0.055, 0.040) * uAuroraStrength;
        vec3 col = mix(vec3(0.84, 0.89, 0.93) * uSunColor, poolNight, uNightFactor);
        col = applyIcelandAtmo(col, vWorldPos);
        gl_FragColor = vec4(col, clamp(ring * 0.88, 0.0, 0.92));
      }
    `
  });

  // 4. Wispy, Wind-Sheared Multi-Octave Orographic Mist & Spray Material (ZERO visible circular blobs or quad edges!)
  const mistMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      ...ATMO_UNIFORMS,
      uMistTex: { value: texLib.mistPuff }
    },
    vertexShader: /* glsl */`
      attribute vec4 aMistSeed;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vAlpha;
      varying float vSeed;
      varying float vIsSpray;
      uniform float uTime;
      uniform vec2 uWindDir;
      uniform float uWindStrength;

      void main() {
        vUv = uv;
        vSeed = aMistSeed.x;
        vAlpha = aMistSeed.y;
        vIsSpray = aMistSeed.w;

        #ifdef USE_INSTANCING
          vec4 baseCol = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec3 center = baseCol.xyz;
          float sx = length(instanceMatrix[0].xyz);
          float sy = length(instanceMatrix[1].xyz);
        #else
          vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float sx = 1.0;
          float sy = 1.0;
        #endif

        // Gentle organic billowing drift (spray rises slightly; cliff mist drifts horizontally with wind)
        float phase = uTime * aMistSeed.z + aMistSeed.x;
        center.y += sin(phase) * mix(1.2, 2.2, vIsSpray);
        center.x += cos(phase * 0.65 + aMistSeed.x) * mix(3.5, 1.8, vIsSpray) * (0.5 + uWindStrength * 0.5);

        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        // Bottom-anchor mist billboards (0..sy) with upright-biased axis so steam & spray NEVER stab below ground level!
        vec3 upAxis = normalize(mix(vec3(0.0, 1.0, 0.0), camUp, 0.32));
        vec3 wp = center + camRight * (position.x * sx) + upAxis * ((position.y + 0.5) * sy);
        vWorldPos = wp;

        float camDist = length(cameraPosition - wp);
        vAlpha *= smoothstep(10.0, 30.0, camDist);

        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uMistTex;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vAlpha;
      varying float vSeed;
      varying float vIsSpray;
      ${ATMO_GLSL_PARS}

      void main() {
        // Ultra-soft Gaussian radial + deep bottom feathering (ZERO quad boundaries or sharp terrain cuts!)
        vec2 c = (vUv - 0.5) * 2.0;
        float r2 = dot(c, c);
        if (r2 >= 0.95) discard;
        float radial = exp(-r2 * 2.9) * (1.0 - smoothstep(0.30, 0.95, r2)) * smoothstep(0.0, 0.36, vUv.y);

        // Domain-warped tattered wind-sheared cloud wisps (breaks up circular silhouette completely!)
        vec2 flow = mix(vec2(-uTime * 0.045, 0.015), vec2(0.02, -uTime * 0.14), vIsSpray);
        vec2 uvWarp = vUv * vec2(1.4, 1.9) + vec2(vSeed * 0.37, vSeed * 0.19) + flow;
        float wX = atmoFbm(uvWarp * 1.4) - 0.5;
        float wY = atmoFbm(uvWarp * 1.4 + vec2(5.2, -3.1)) - 0.5;
        float wispA = atmoFbm(uvWarp * 2.4 + vec2(wX, wY) * 1.1);
        float wispB = atmoFbm(uvWarp * 5.2 - flow * 1.6);
        float texA = texture2D(uMistTex, clamp(vUv + vec2(wX, wY) * 0.16, 0.01, 0.99)).a;

        float wispMask = smoothstep(0.24, 0.78, wispA * 0.58 + wispB * 0.24 + texA * 0.42);
        float a = radial * wispMask * vAlpha;
        if (a < 0.008) discard;

        // Soft 3D self-shading: bright silver upper wisps, cooler slate-grey undersides
        float topLit = smoothstep(0.15, 0.88, vUv.y + (wispB - 0.5) * 0.35);
        vec3 sprayDay = mix(vec3(0.70, 0.75, 0.79), vec3(0.92, 0.95, 0.98), topLit);
        vec3 cloudDay = mix(uFogColor * 0.84, uFogLowColor * 1.18, topLit);
        vec3 mistDay = mix(cloudDay, sprayDay, vIsSpray);

        vec3 mistNight = vec3(0.012, 0.018, 0.026) + vec3(0.008, 0.042, 0.032) * uAuroraStrength;
        vec3 mistLit = mix(mistDay, mistNight, uNightFactor);
        mistLit = applyIcelandAtmo(mistLit, vWorldPos);
        gl_FragColor = vec4(mistLit, clamp(a, 0.0, 0.52));
      }
    `
  });

  /** Build procedural wind-sheared orographic cliff-crest mist banks safely elevated above 9-point full terrain footprint (ZERO sharp depth cuts!). */
  function buildProceduralCliffMist(mistSpecs) {
    if (!mistSpecs || mistSpecs.length === 0) return null;
    const valid = [];
    for (let i = 0; i < mistSpecs.length; i++) {
      const w = mistSpecs[i];
      const rCheck = w.sx * 0.56;
      const dCheck = rCheck * 0.71;
      const hs = [
        getTerrainHeight(w.x, w.z),
        getTerrainHeight(w.x + rCheck, w.z),
        getTerrainHeight(w.x - rCheck, w.z),
        getTerrainHeight(w.x, w.z + rCheck),
        getTerrainHeight(w.x, w.z - rCheck),
        getTerrainHeight(w.x + dCheck, w.z + dCheck),
        getTerrainHeight(w.x - dCheck, w.z + dCheck),
        getTerrainHeight(w.x + dCheck, w.z - dCheck),
        getTerrainHeight(w.x - dCheck, w.z - dCheck)
      ];
      let maxH = -1e9;
      let minH = 1e9;
      for (let j = 0; j < hs.length; j++) {
        if (hs[j] > maxH) maxH = hs[j];
        if (hs[j] < minH) minH = hs[j];
      }
      // Skip any billboard near steep rising peaks (ray-marched volumetric mountain fog handles steep cliffs seamlessly!)
      if (maxH - minH > 20.0) continue;
      // Bottom-anchored mistMat sits cleanly ABOVE maxH across its entire width -> guaranteed zero terrain intersection!
      valid.push({ w, y: maxH + 6.0, idx: i });
    }
    if (valid.length === 0) return null;

    const geo = new THREE.PlaneGeometry(1, 1);
    const inst = new THREE.InstancedMesh(geo, mistMat, valid.length);
    const dummy = new THREE.Object3D();
    const seeds = new Float32Array(valid.length * 4);

    for (let k = 0; k < valid.length; k++) {
      const { w, y, idx } = valid[k];
      dummy.position.set(w.x, y, w.z);
      dummy.scale.set(w.sx * 0.85, w.sy * 0.85, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(k, dummy.matrix);
      seeds[k * 4] = idx * 13.7 + w.x * 0.05;
      seeds[k * 4 + 1] = w.op * 0.72;
      seeds[k * 4 + 2] = 0.12;
      seeds[k * 4 + 3] = 0.0;
    }
    inst.instanceMatrix.needsUpdate = true;
    geo.setAttribute('aMistSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    inst.frustumCulled = false;
    inst.renderOrder = 9;
    return inst;
  }

  // Steaming Milky-Turquoise Icelandic Geothermal Hot Spring Surface Shader
  const hotSpringMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: { ...ATMO_UNIFORMS },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorldPos;
      ${ATMO_GLSL_PARS}

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float edgeWarp = (atmoFbm(p * 3.2 + vec2(2.1, -1.7)) - 0.5) * 0.28;
        float d = r + edgeWarp;
        if (d >= 0.96) discard;

        float rip = atmoFbm(p * 5.0 + vec2(uTime * 0.18, -uTime * 0.14));
        // Iconic milky silica-blue Icelandic hot spring center -> pale mineral sinter rim
        vec3 deepAqua = vec3(0.14, 0.44, 0.50);
        vec3 milkyCenter = vec3(0.42, 0.72, 0.76);
        vec3 sinterRim = vec3(0.56, 0.58, 0.54);

        vec3 col = mix(milkyCenter, deepAqua, smoothstep(0.15, 0.75, d + (rip - 0.5) * 0.25));
        col = mix(col, sinterRim, smoothstep(0.70, 0.92, d));
        col *= mix(vec3(0.86, 0.90, 0.94), uSunColor, 0.45) * mix(1.0, 0.055, uNightFactor);
        col += vec3(0.006, 0.024, 0.020) * uAuroraStrength * uNightFactor;
        col = applyIcelandAtmo(col, vWorldPos);
        float alpha = (1.0 - smoothstep(0.76, 0.96, d)) * 0.92;
        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  // Triplanar Wet Volcanic Basalt Cave Tunnel Material (matches mountainside rock at mouth -> mysterious dark vaulted interior!)
  const caveRockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.04,
    side: THREE.FrontSide
  });
  caveRockMat.fog = false;
  caveRockMat.customProgramCacheKey = () => 'ls_river_cave_rock_v1';
  caveRockMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ATMO_UNIFORMS);
    shader.uniforms.uRockTex = { value: texLib.basaltCliff.map };
    shader.uniforms.uRockNorm = { value: texLib.basaltCliff.normalMap };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPortalDist;\nvarying vec3 vCWorldPos;\nvarying vec3 vCWorldNorm;\nvarying float vPortalDist;')
      .replace(
        '#include <project_vertex>',
        /* glsl */`
        #include <project_vertex>
        {
          vec4 cwp = modelMatrix * vec4(transformed, 1.0);
          vCWorldPos = cwp.xyz;
          vCWorldNorm = normalize(mat3(modelMatrix) * objectNormal);
          vPortalDist = aPortalDist;
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
        varying vec3 vCWorldPos;
        varying vec3 vCWorldNorm;
        varying float vPortalDist;
        ${ATMO_GLSL_PARS}

        vec4 triCaveRGBA(sampler2D t, vec3 wp, vec3 wn, float sc) {
          vec3 bw = pow(abs(wn), vec3(4.0));
          bw /= max(bw.x + bw.y + bw.z, 0.0001);
          return texture2D(t, vec2(wp.z, wp.y) * sc) * bw.x +
                 texture2D(t, wp.xz * sc) * bw.y +
                 texture2D(t, vec2(wp.x, wp.y) * sc) * bw.z;
        }
        vec3 triCaveNorm(sampler2D t, vec3 wp, vec3 wn, float sc) {
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
        vec3 cFinalNorm = normalize(vCWorldNorm);
        {
          vec3 wp = vCWorldPos;
          vec3 wn = normalize(vCWorldNorm);
          if (!gl_FrontFacing) wn = -wn;
          vec4 rNear = triCaveRGBA(uRockTex, wp, wn, 0.14);
          vec4 rFar  = triCaveRGBA(uRockTex, wp, wn, 0.045);
          vec4 rock  = mix(rNear, rFar, 0.35);

          float rockAO = mix(0.28, 1.24, rock.a);
          // Smooth subterranean shadow falloff: weathered volcanic basalt at mouth -> deep mysterious dark cavern inside!
          float caveDim = mix(1.02, 0.04, smoothstep(1.2, 26.0, vPortalDist));
          vec3 col = rock.rgb * vec3(0.68, 0.72, 0.78) * rockAO * caveDim;

          // Subtle wet sheen & cool subterranean bounce from underground river below
          float riverBounce = smoothstep(0.0, 0.65, -wn.y) * smoothstep(5.0, 24.0, vPortalDist) * (1.0 - uNightFactor * 0.78);
          col += vec3(0.008, 0.016, 0.022) * riverBounce;

          cFinalNorm = normalize(wn + triCaveNorm(uRockNorm, wp, wn, 0.14) * 0.90);
          diffuseColor.rgb = col;
        }
        `
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */`
        #include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(cFinalNorm, 0.0)).xyz);
        `
      )
      .replace(
        '#include <dithering_fragment>',
        /* glsl */`
        gl_FragColor.rgb += sampleOdradekScan(vCWorldPos, cFinalNorm);
        vec3 caveAtmo = applyIcelandAtmo(gl_FragColor.rgb, vCWorldPos);
        // Attenuate bright distance sky-fog washout inside deep cave recesses so cave mouths stay dark & dramatic even from 400m away!
        float deepRecess = smoothstep(1.5, 18.0, vPortalDist);
        gl_FragColor.rgb = mix(caveAtmo, mix(gl_FragColor.rgb, caveAtmo * 0.30, 0.48), deepRecess * 0.80);
        #include <dithering_fragment>
        `
      );
  };

  const activeCells = new Map();
  const activeTrunkSegs = new Map();
  const activeLakes = new Map();
  const waterfallPositions = [];

  // Lake group inside main scene (hidden automatically during planar reflection pass -> zero recursive reflection!)
  const lakeGroup = new THREE.Group();
  root.add(lakeGroup);

  // Rolling camera-centered 112x112 GPU Shoreline Depth & Beach-Slope Map (256m x 256m = ~2.28m/texel, bilinear filtered!)
  // Gives sub-meter exact terrain-waterline depth on EVERY pixel -> ZERO sharp edges, ZERO staircase cutouts!
  const LOCAL_DEPTH_RES = 112;
  const LOCAL_DEPTH_HALF = 128.0;
  const localDepthPixels = new Uint8Array(LOCAL_DEPTH_RES * LOCAL_DEPTH_RES * 4);
  const localDepthHeights = new Float32Array(LOCAL_DEPTH_RES * LOCAL_DEPTH_RES);
  const localDepthTex = new THREE.DataTexture(
    localDepthPixels,
    LOCAL_DEPTH_RES,
    LOCAL_DEPTH_RES,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  localDepthTex.minFilter = THREE.LinearFilter;
  localDepthTex.magFilter = THREE.LinearFilter;
  localDepthTex.wrapS = THREE.ClampToEdgeWrapping;
  localDepthTex.wrapT = THREE.ClampToEdgeWrapping;
  localDepthTex.flipY = false;
  localDepthTex.generateMipmaps = false;
  localDepthTex.needsUpdate = true;
  let lastDepthLakeId = '';
  let lastDepthX = 1e9;
  let lastDepthZ = 1e9;
  const _depthEvalTmp = { inside: false, shoreMeters: -9999, bedDepth: 0, isletBoost: 0 };

  function updateLocalShoreDepthMap(lake, camX, camZ) {
    if (!lake) {
      glacialLakeMat.uniforms.uLocalDepthRect.value.w = 0.0;
      return;
    }
    const distCenter = Math.hypot(lake.cx - camX, lake.cz - camZ);
    if (distCenter > lake.boundR + LOCAL_DEPTH_HALF) {
      glacialLakeMat.uniforms.uLocalDepthRect.value.w = 0.0;
      return;
    }
    const snapX = Math.round(camX / 16.0) * 16.0;
    const snapZ = Math.round(camZ / 16.0) * 16.0;
    if (
      lake.id === lastDepthLakeId &&
      Math.hypot(snapX - lastDepthX, snapZ - lastDepthZ) < 36.0
    ) {
      glacialLakeMat.uniforms.uLocalDepthRect.value.w = 1.0;
      return;
    }
    lastDepthLakeId = lake.id;
    lastDepthX = snapX;
    lastDepthZ = snapZ;

    const res = LOCAL_DEPTH_RES;
    const span = LOCAL_DEPTH_HALF * 2.0;
    const step = span / res;
    const minX = snapX - LOCAL_DEPTH_HALF;
    const minZ = snapZ - LOCAL_DEPTH_HALF;
    const waterY = lake.waterY;

    // Pass 1: Sample exact terrain height across shoreline band (early-out deep interior & far inland -> <2ms!)
    for (let iz = 0; iz < res; iz++) {
      const wz = minZ + (iz + 0.5) * step;
      const row = iz * res;
      for (let ix = 0; ix < res; ix++) {
        const wx = minX + (ix + 0.5) * step;
        evalSingleLake(lake, wx, wz, _depthEvalTmp);
        let depth;
        if (_depthEvalTmp.shoreMeters > 72.0 && _depthEvalTmp.isletBoost < 0.01) {
          depth = Math.max(_depthEvalTmp.bedDepth, 6.8);
        } else if (_depthEvalTmp.shoreMeters < -95.0) {
          depth = -1.5;
        } else {
          depth = waterY - getTerrainHeight(wx, wz);
        }
        localDepthHeights[row + ix] = depth;
      }
    }

    // Pass 2: Pack clamped signed depth [-1.2m .. +6.8m] into R (3.1cm precision) and beach slope into G
    const inv2Step = 0.5 / step;
    for (let iz = 0; iz < res; iz++) {
      const izM = iz > 0 ? iz - 1 : 0;
      const izP = iz < res - 1 ? iz + 1 : res - 1;
      const row = iz * res;
      for (let ix = 0; ix < res; ix++) {
        const ixM = ix > 0 ? ix - 1 : 0;
        const ixP = ix < res - 1 ? ix + 1 : res - 1;
        const d = localDepthHeights[row + ix];
        const encD = clamp((d + 1.2) / 8.0, 0.0, 1.0);
        const gx = (localDepthHeights[row + ixP] - localDepthHeights[row + ixM]) * inv2Step;
        const gz = (localDepthHeights[izP * res + ix] - localDepthHeights[izM * res + ix]) * inv2Step;
        const slope = clamp(Math.hypot(gx, gz) * 1.15, 0.0, 1.0);

        const pi = (row + ix) * 4;
        localDepthPixels[pi] = Math.round(encD * 255);
        localDepthPixels[pi + 1] = Math.round(slope * 255);
        localDepthPixels[pi + 2] = 0;
        localDepthPixels[pi + 3] = 255;
      }
    }
    localDepthTex.needsUpdate = true;
    glacialLakeMat.uniforms.uLocalDepthRect.value.set(snapX, snapZ, 1.0 / LOCAL_DEPTH_HALF, 1.0);
    glacialLakeMat.uniforms.uLocalDepthWaterY.value = waterY;
  }

  // 5. High-FPS Astonishing Glacial Blue Lake Shader with Optimized Planar Mirror Reflections:
  // - Single-Tap Perturbed Planar Mirror Reflection (ZERO ghosting, ZERO SSR artifacts, ~10x faster than SSR!)
  // - Exact Glacial Rock-Flour Optical Model (Luminous Turquoise Shallows -> Alpine Cerulean -> Deep Sapphire)
  // - Smooth Beer-Lambert Transparency + Underwater Sun Caustics + Wave-Crest Subsurface Scattering
  // - Non-Repeating Multi-Scale Noise Ripples + Per-Pixel Shoreline Swash & Water Splash
  // - 3-Tier HDR Physical Sun Reflection (Rippled Sun-Path + Crisp Mirror Column + Twinkling Diamond Sparkles)
  const glacialLakeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: {
      ...ATMO_UNIFORMS,
      uNormalA: { value: texLib.waterNormalA },
      uNormalB: { value: texLib.waterNormalB },
      uFoamTex: { value: texLib.waterfallFoam },
      uReflTex: { value: null },
      uReflMatrix: { value: new THREE.Matrix4() },
      uReflPlaneY: { value: 16.5 },
      uHasRefl: { value: 0.0 },
      uLocalDepthTex: { value: localDepthTex },
      uLocalDepthRect: { value: new THREE.Vector4(0, 0, 1.0 / LOCAL_DEPTH_HALF, 0.0) },
      uLocalDepthWaterY: { value: 16.5 }
    },
    vertexShader: /* glsl */`
      attribute float aLakeDepth;
      attribute float aShoreDist;
      attribute float aLakeScale;
      uniform mat4 uReflMatrix;
      uniform float uTime;
      uniform vec2 uWindDir;
      uniform float uWindStrength;
      varying vec3 vWorldPos;
      varying vec4 vReflCoord;
      varying float vLakeDepth;
      varying float vShoreDist;
      varying float vLakeScale;
      void main() {
        vLakeDepth = aLakeDepth;
        vShoreDist = aShoreDist;
        vLakeScale = aLakeScale;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        // Gentle living lake swell displacement (damped cleanly to 0 near the shoreline so shore swash stays grounded!)
        vec2 wd = normalize(uWindDir + vec2(0.0001));
        vec2 wp2 = vec2(-wd.y, wd.x);
        float shoreDamp = smoothstep(0.45, 4.2, aLakeDepth);
        float wAmp = (0.035 + 0.048 * clamp(uWindStrength, 0.0, 1.6)) * shoreDamp;
        float swell = sin(dot(wp.xz, wd) * 0.23 - uTime * 1.45 + sin(wp.x * 0.05 - wp.z * 0.04)) * 0.58
                    + sin(dot(wp.xz, wd * 0.61 + wp2 * 0.79) * 0.37 - uTime * 1.92 + 1.3) * 0.42;
        wp.y += swell * wAmp;
        vWorldPos = wp.xyz;
        vReflCoord = uReflMatrix * wp;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D uNormalA;
      uniform sampler2D uNormalB;
      uniform sampler2D uFoamTex;
      uniform sampler2D uReflTex;
      uniform float uReflPlaneY;
      uniform float uHasRefl;
      uniform sampler2D uLocalDepthTex;
      uniform vec4 uLocalDepthRect;
      uniform float uLocalDepthWaterY;
      uniform vec3 uPlayerPos;

      varying vec3 vWorldPos;
      varying vec4 vReflCoord;
      varying float vLakeDepth;
      varying float vShoreDist;
      varying float vLakeScale;
      ${ATMO_GLSL_PARS}

      // GGX Normal Distribution for realistic sun glitter road & crisp mirror disc reflections
      float lakeGGX(float NdotH, float rough) {
        float a = rough * rough;
        float a2 = a * a;
        float d = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
        return a2 / (3.14159265 * d * d + 0.00001);
      }

      // Fast C2 quintic gradient noise with EXACT analytical derivatives (returns x=value, yz=dVal/dp)
      // 100% non-repeating across infinite world space — completely eliminates periodic sine/texture stripes!
      vec3 lakeGNoiseD(vec2 p) {
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
        float k4 = va - vb - vc + vd;
        float val = k0 + k1 * u.x + k2 * u.y + k4 * u.x * u.y;
        vec2 grad = ga + (gb - ga) * u.x + (gc - ga) * u.y + (ga - gb - gc + gd) * u.x * u.y
                  + du * vec2(k1 + k4 * u.y, k2 + k4 * u.x);
        return vec3(val, grad);
      }

      // 5-Scale Non-Repeating Organic Wind-Driven Lake Ripples (returns xy = normal slope, z = crest height)
      // Golden-angle rotated, domain-warped multi-octave procedural gradient noise -> ZERO repetition at any distance!
      vec3 lakeMultiScaleNoise(vec2 pos, vec2 wDir, vec2 wPerp, float t, float camDist) {
        float fMid  = 1.0 - smoothstep(140.0, 1250.0, camDist);
        float fNear = 1.0 - smoothstep(45.0, 360.0, camDist);
        float fFine = 1.0 - smoothstep(16.0, 115.0, camDist);

        // Anisotropic stretch perpendicular to wind so ripples look like authentic wind-driven water wavelets (never isotropic blobs!)
        vec2 anisoPos = vec2(dot(pos, wDir) * 1.45, dot(pos, wPerp) * 0.72);

        // Scale 1: Broad organic wind-gust swell packets (~18..35m) — drives domain warp for all finer scales!
        vec2 p1 = anisoPos * 0.055 - vec2(t * 0.26, t * 0.07);
        vec3 n1 = lakeGNoiseD(p1);
        vec2 warp = n1.yz * 0.55;

        // Scale 2: Medium choppy wind wavelets (~6..12m), golden-angle rotated (38 deg) & warped
        const mat2 R2 = mat2(0.788, -0.616, 0.616, 0.788);
        vec2 p2 = R2 * (anisoPos * 0.145) - vec2(t * 0.62, -t * 0.24) + warp;
        vec3 n2 = lakeGNoiseD(p2);

        // Scale 3: Active crossing wind ripples (~2.5..5m), counter-rotated (117 deg) & warped
        vec2 grad = (wDir * n1.y * 1.45 + wPerp * n1.z * 0.72) * 0.055
                  + (R2 * n2.yz) * (0.095 * (0.28 + 0.72 * fMid));
        float crest = n1.x * 0.35 + n2.x * 0.32;

        if (fNear > 0.005) {
          const mat2 R3 = mat2(-0.454, -0.891, 0.891, -0.454);
          vec2 p3 = R3 * (anisoPos * 0.34) - vec2(t * 1.18, t * 0.44) + n2.yz * 0.42;
          vec3 n3 = lakeGNoiseD(p3);
          grad += (R3 * n3.yz) * (0.088 * fNear);
          crest += n3.x * 0.22 * fNear;
        }

        // Scale 4: Crisp fine foreground capillary ripples (~0.8..1.8m), rotated (64 deg)
        if (fFine > 0.005) {
          const mat2 R4 = mat2(0.438, -0.899, 0.899, 0.438);
          vec2 p4 = R4 * (anisoPos * 0.82) - vec2(t * 2.05, -t * 0.85) + warp * 1.4;
          vec3 n4 = lakeGNoiseD(p4);
          grad += (R4 * n4.yz) * (0.068 * fFine);
          crest += n4.x * 0.14 * fFine;
        }

        return vec3(grad, crest);
      }

      // Procedural dual-layer animated underwater sun caustics in shallow glacial water
      float lakeCaustic(vec2 p, float t) {
        vec2 p1 = p * 0.62 + vec2(t * 0.34, -t * 0.27);
        vec2 p2 = mat2(0.80, -0.60, 0.60, 0.80) * p * 0.94 + vec2(-t * 0.30, t * 0.38);
        float c1 = abs(atmoGNoise(p1) * 2.0 - 1.0);
        float c2 = abs(atmoGNoise(p2) * 2.0 - 1.0);
        return pow(clamp(1.0 - min(c1, c2) * 1.45, 0.0, 1.0), 3.4);
      }

      // Expanding concentric wake ripples radiating outward around the wading porter!
      vec2 lakePlayerRipples(vec3 wp, float t) {
        if (abs(uPlayerPos.y - wp.y) > 2.2) return vec2(0.0);
        vec2 diff = wp.xz - uPlayerPos.xz;
        float r = length(diff);
        if (r < 0.22 || r > 15.0) return vec2(0.0);
        float env = smoothstep(0.22, 0.75, r) * exp(-r * 0.24);
        float ring = cos(r * 5.6 - t * 5.4) * 0.65 + cos(r * 9.8 - t * 7.8) * 0.35;
        return (diff / r) * (ring * env * 0.19);
      }

      // Crisp concentric raindrop impact ripples when raining (close-range only -> zero far cost!)
      vec2 lakeRainRipples(vec2 wp, float t, float rainAmt) {
        if (rainAmt < 0.05) return vec2(0.0);
        vec2 acc = vec2(0.0);
        for (int i = 0; i < 2; i++) {
          float fi = float(i);
          vec2 p = wp * (1.15 + fi * 0.65) + vec2(fi * 17.3, -fi * 9.7);
          vec2 cell = floor(p);
          vec2 f = fract(p) - 0.5;
          float rnd = atmoHash(cell + fi * 31.1);
          float phase = fract(t * (1.15 + rnd * 0.75) + rnd * 6.28);
          vec2 center = (vec2(atmoHash(cell + 1.7), atmoHash(cell + 4.3)) - 0.5) * 0.52;
          vec2 d = f - center;
          float r = length(d);
          float ringR = phase * 0.48;
          float wave = sin((r - ringR) * 38.0) * exp(-abs(r - ringR) * 14.0) * (1.0 - phase) * smoothstep(0.0, 0.08, phase);
          acc += (d / max(r, 0.01)) * wave * 0.14;
        }
        return acc * rainAmt;
      }

      // Analytical Nordic sky + storm clouds + sun halo + aurora fallback (for distant elevation-mismatched plateau tarns)
      vec3 lakeEvalSkyFallback(vec3 rd) {
        float elev = clamp(rd.y, 0.0, 1.0);
        float hMix = pow(clamp(1.0 - elev, 0.0, 1.0), 2.1);
        vec3 sky = mix(uSkyZenith, uSkyHorizon, hMix);

        float sunCos = max(dot(rd, uSunDir), 0.0);
        float sunGlow = (pow(sunCos, 6.0) * 0.42 + pow(sunCos, 42.0) * 0.55) * (1.0 - uCloudCoverage * 0.52);
        sky += uSunColor * sunGlow * (1.0 - uNightFactor * 0.92);

        vec2 drift = uWindDir * (uTime * 0.011);
        vec2 cUv = rd.xz * (1.0 / (max(elev, 0.03) + 0.24)) * 0.90 + drift;
        float cN = atmoGNoise(cUv * 1.05) * 0.65 + atmoGNoise(cUv * 2.4 - drift * 0.5) * 0.35;
        float thresh = mix(0.72, 0.24, uCloudCoverage);
        float cDens = smoothstep(thresh, thresh + 0.38, cN) * smoothstep(0.0, 0.10, elev);
        vec3 cDark = mix(vec3(0.46, 0.55, 0.68), vec3(0.10, 0.13, 0.16), smoothstep(0.12, 0.78, uCloudDarkness));
        vec3 cBright = mix(vec3(0.96, 0.96, 0.94), vec3(0.82, 0.86, 0.90), smoothstep(0.12, 0.78, uCloudDarkness)) * uSunColor;
        vec3 cloudCol = mix(cDark, cBright, smoothstep(0.28, 0.80, cN));
        vec3 cloudNight = mix(vec3(0.015, 0.022, 0.034), vec3(0.055, 0.075, 0.105), cN);
        cloudCol = mix(cloudCol, cloudNight, uNightFactor);
        sky = mix(sky, cloudCol, cDens * clamp(0.45 + uCloudCoverage * 0.52, 0.0, 0.92));

        if (uAuroraStrength > 0.01 && uNightFactor > 0.1) {
          float aurWarp = atmoGNoise(rd.xz * 2.4 + vec2(uAuroraTime * 0.04, -uAuroraTime * 0.03)) * 2.8;
          float aurWaveA = sin(rd.x * 3.8 + rd.z * 2.6 + uAuroraTime * 0.28 + aurWarp);
          float aurWaveB = sin(rd.x * 6.4 - rd.z * 3.4 - uAuroraTime * 0.22 + aurWarp * 1.2);
          float aurCurtain = max(exp(-aurWaveA * aurWaveA * 4.5), exp(-aurWaveB * aurWaveB * 6.0) * 0.72)
                           * smoothstep(0.02, 0.20, elev) * (1.0 - smoothstep(0.38, 0.92, elev));
          vec3 aurLow = mix(vec3(0.10, 0.96, 0.46), vec3(0.88, 0.24, 0.72), uAuroraProfile.z * 0.45);
          vec3 aurHigh = mix(vec3(0.14, 0.68, 0.94), vec3(0.92, 0.12, 0.26), uAuroraProfile.w * 0.72);
          vec3 aurCol = mix(aurLow, aurHigh, smoothstep(0.10, 0.48, elev));
          sky += aurCol * aurCurtain * uAuroraStrength * uNightFactor * 0.32;
        }
        return mix(sky, uSkyHorizon, 1.0 - smoothstep(0.0, 0.085, elev));
      }

      void main() {
        vec3 toCam = cameraPosition - vWorldPos;
        float camDist = length(toCam);
        vec3 viewDir = toCam / max(camDist, 0.0001);

        // Per-pixel exact terrain waterline depth from rolling 160x160 GPU height-depth map (1.6m/texel, bilinear filtered!)
        // Guarantees ZERO sawtooth edges and ZERO staircase cutouts at every shore slope!
        vec2 wDir = normalize(uWindDir + vec2(0.0001));
        vec2 wPerp = vec2(-wDir.y, wDir.x);

        vec2 luv = (vWorldPos.xz - uLocalDepthRect.xy) * uLocalDepthRect.z * 0.5 + 0.5;
        float matchY = 1.0 - smoothstep(1.2, 3.2, abs(vWorldPos.y - uLocalDepthWaterY));
        float inLocal = step(0.002, luv.x) * step(luv.x, 0.998) * step(0.002, luv.y) * step(luv.y, 0.998) * uLocalDepthRect.w * matchY;
        float lEdge = smoothstep(0.0, 0.12, luv.x) * smoothstep(0.0, 0.12, 1.0 - luv.x)
                    * smoothstep(0.0, 0.12, luv.y) * smoothstep(0.0, 0.12, 1.0 - luv.y);
        float localWeight = inLocal * lEdge;

        vec2 localSample = localWeight > 0.001 ? texture2D(uLocalDepthTex, clamp(luv, 0.004, 0.996)).rg : vec2(0.5, 0.25);
        float localDepth = localSample.r * 8.0 - 1.2;
        float shoreSlope = localSample.g;

        // Organic shoreline contour micro-variation + rhythmic lapping swash oscillation
        float shoreOrg = (atmoGNoise(vWorldPos.xz * 0.42) - 0.5) * 0.09
                       + (atmoGNoise(vWorldPos.xz * 1.45 + vec2(3.7, -2.1)) - 0.5) * 0.04;
        float swashN = atmoGNoise(vWorldPos.xz * 0.14 - wDir * uTime * 0.04) * 4.6
                     + atmoGNoise(vWorldPos.xz * 0.52) * 1.5;
        float swashWave = sin(uTime * 1.85 + swashN) * 0.5 + 0.5;
        float swashWave2 = sin(uTime * 1.22 + swashN * 0.72 + 2.1) * 0.5 + 0.5;

        float farDepth = max(vLakeDepth, 0.0);
        float signedDepth = mix(farDepth, localDepth, localWeight);
        float exactDepth = signedDepth + shoreOrg * localWeight;
        float waterDepth = max(exactDepth, 0.0);

        float nearShoreFade = smoothstep(0.0, 0.34, exactDepth);
        float farShoreFade = smoothstep(0.15, 5.5, vShoreDist);
        float shoreFade = mix(farShoreFade, nearShoreFade, localWeight);
        if (shoreFade < 0.003) discard;

        // 1. 100% Non-Repeating Multi-Scale Noise Ripples + Domain-Warped Normal Maps + Gust Patches + Wading Wake
        float gustMacro = atmoGNoise(vWorldPos.xz * 0.0038 - wDir * uTime * 0.032) * 0.58
                        + atmoGNoise(vWorldPos.xz * 0.0115 + wPerp * 0.6 - wDir * uTime * 0.068) * 0.42;
        float gustMask = smoothstep(0.16, 0.82, gustMacro);
        float fetchScale = smoothstep(0.15, 2.2, waterDepth) * clamp(vLakeScale / 180.0, 0.78, 1.32);
        float waveActivity = clamp((0.55 + uWindStrength * 0.70) * mix(0.42, 1.42, gustMask) * mix(0.55, 1.0, fetchScale), 0.32, 1.60);

        float t = uWindTime;
        float speedScale = 1.0;

        // Pure non-repeating 4-octave analytical gradient noise ripples (ZERO stripes or tiling!)
        vec3 msNoise = lakeMultiScaleNoise(vWorldPos.xz, wDir, wPerp, t, camDist);

        // Domain-warped, irrational-ratio rotated normal maps for extra crisp micro-detail (warping destroys ALL texture tiling!)
        vec2 uvWarp = vec2(
          atmoGNoise(vWorldPos.xz * 0.024 - wDir * t * 0.04) - 0.5,
          atmoGNoise(vWorldPos.xz * 0.024 + vec2(7.3, -4.9) - wPerp * t * 0.03) - 0.5
        ) * 0.36;
        vec2 windDriftA = wDir * (t * 0.72 * speedScale);
        vec2 windDriftB = (wDir * 0.64 + wPerp * 0.77) * (t * 1.18 * speedScale);
        vec2 windDriftC = (wDir * 0.39 - wPerp * 0.92) * (t * 1.85 * speedScale);

        float nearDetail = 1.0 - smoothstep(32.0, 380.0, camDist);
        float midDetail  = 1.0 - smoothstep(180.0, 2200.0, camDist);
        float farDetail  = 1.0 - smoothstep(950.0, 5600.0, camDist);

        const mat2 R_A = mat2(0.848, -0.530, 0.530, 0.848);  // 32 deg
        const mat2 R_B = mat2(-0.375, -0.927, 0.927, -0.375); // 112 deg
        const mat2 R_C = mat2(0.515, 0.857, -0.857, 0.515);   // -59 deg

        vec3 nSwell = texture2D(uNormalA, vWorldPos.xz * 0.015 + uvWarp * 0.45 - windDriftA * 0.032).xyz * 2.0 - 1.0;
        vec3 nWaveA = texture2D(uNormalA, R_A * vWorldPos.xz * 0.053 + uvWarp - windDriftA * 0.095).xyz * 2.0 - 1.0;
        vec3 nWaveB = texture2D(uNormalB, R_B * vWorldPos.xz * 0.131 - uvWarp * 0.85 - windDriftB * 0.135).xyz * 2.0 - 1.0;
        vec3 nMicro = texture2D(uNormalB, R_C * vWorldPos.xz * 0.317 + uvWarp * 0.65 - windDriftC * 0.21).xyz * 2.0 - 1.0;

        vec2 rainN = camDist < 58.0 ? lakeRainRipples(vWorldPos.xz, t, smoothstep(0.45, 0.98, uRainWetness) * (1.0 - camDist / 58.0)) : vec2(0.0);
        vec2 playerN = camDist < 65.0 ? lakePlayerRipples(vWorldPos, t) : vec2(0.0);

        vec2 texGrad = (nSwell.xy * 0.38 * (0.42 + 0.58 * farDetail)
                      + nWaveA.xy * 0.46 * (0.24 + 0.76 * midDetail)
                      + nWaveB.xy * 0.34 * (0.14 + 0.86 * midDetail)
                      + nMicro.xy * 0.16 * nearDetail) * 0.20;

        const float rippleNormalScale = 0.20;
        vec2 gradSurf = ((msNoise.xy * 1.15 + texGrad) * waveActivity + rainN + playerN) * rippleNormalScale;

        vec3 nSurf = normalize(vec3(gradSurf.x, 1.0, gradSurf.y));
        vec3 nRefl = normalize(vec3(gradSurf.x * 0.80, 1.0, gradSurf.y * 0.80));
        vec2 gradSpec = gradSurf * 1.38
                      + (nWaveB.xy * 0.060 * (0.32 + 0.68 * midDetail)
                       + nMicro.xy * 0.055 * (0.35 + 0.65 * nearDetail)) * (0.55 + 0.60 * waveActivity) * rippleNormalScale;
        vec3 nSpec = normalize(vec3(gradSpec.x, 1.0, gradSpec.y));

        // 2. Single-Tap Rippled Planar Mirror Reflection (liquid undulating reflections, ZERO ghosting!)
        vec3 reflWorld = reflect(-viewDir, nRefl);
        if (reflWorld.y < 0.004) {
          reflWorld = normalize(vec3(reflWorld.x, abs(reflWorld.y) * 0.30 + 0.005, reflWorld.z));
        }
        vec3 reflCol = lakeEvalSkyFallback(reflWorld);
        float planeMatch = (1.0 - smoothstep(2.5, 9.0, abs(vWorldPos.y - uReflPlaneY))) * uHasRefl;

        if (planeMatch > 0.01 && vReflCoord.w > 0.001) {
          vec2 baseUv = vReflCoord.xy / vReflCoord.w;
          vec2 edgeDamp = smoothstep(vec2(0.0), vec2(0.07), baseUv) * (1.0 - smoothstep(vec2(0.93), vec2(1.0), baseUv));
          float distScale = clamp(42.0 / max(camDist, 16.0), 0.42, 1.30);
          vec2 waveDistort = vec2(nRefl.x * 0.20, nRefl.z * 0.34) * distScale * edgeDamp;
          vec2 sampleUv = clamp(baseUv + waveDistort, vec2(0.003), vec2(0.997));

          vec3 planarCol = texture2D(uReflTex, sampleUv).rgb;
          float inBounds = smoothstep(0.0, 0.008, baseUv.x) * (1.0 - smoothstep(0.992, 1.0, baseUv.x))
                         * smoothstep(0.0, 0.008, baseUv.y) * (1.0 - smoothstep(0.992, 1.0, baseUv.y));
          reflCol = mix(reflCol, planarCol, clamp(inBounds * planeMatch, 0.0, 1.0));
        }

        // Organic ripple-slope sky-light vs shaded-trough contrast (vivid natural liquid texture even under overcast skies!)
        float rippleLight = dot(nSurf, normalize(vec3(viewDir.x * 0.35 + uSunDir.x * 0.45, 0.86, viewDir.z * 0.35 + uSunDir.z * 0.45)));
        float rippleContrast = mix(0.78, 1.22, clamp(0.5 + (rippleLight - 0.84) * 3.4 + msNoise.z * 0.25, 0.0, 1.0));
        reflCol *= mix(1.0, rippleContrast, 0.70);

        // 3. Iconic Glacial Rock-Flour Blue Optical Volume + Sun Caustics + Wave-Crest SSS!
        float dayFactor = 1.0 - uNightFactor;
        float cloudShadow = sampleCloudShadow(vWorldPos.xz);
        float terrainShadow = sampleTerrainShadow(vWorldPos);
        float sunAbove = smoothstep(-0.04, 0.14, uSunDir.y) * dayFactor * terrainShadow;
        float clearSkyFactor = 1.0 - smoothstep(0.18, 0.94, uCloudCoverage);

        float siltPlume = atmoGNoise(vWorldPos.xz * 0.0022 + vec2(3.1, -4.7)) * 0.62 + atmoGNoise(vWorldPos.xz * 0.0068) * 0.38;
        vec3 shallowTurquoise = mix(vec3(0.036, 0.44, 0.58), vec3(0.072, 0.60, 0.72), siltPlume);
        vec3 midGlacialBlue   = mix(vec3(0.015, 0.25, 0.54), vec3(0.030, 0.40, 0.66), siltPlume);
        vec3 deepSapphire     = mix(vec3(0.007, 0.11, 0.34), vec3(0.016, 0.20, 0.46), siltPlume);

        vec3 glacialBase = mix(shallowTurquoise, midGlacialBlue, smoothstep(0.35, 4.8, waterDepth));
        glacialBase = mix(glacialBase, deepSapphire, smoothstep(3.8, 19.0, waterDepth));
        glacialBase *= mix(0.86, 1.16, clamp(0.5 + msNoise.z * 0.46 + (nWaveA.y + nWaveB.y) * 0.24, 0.0, 1.0));

        float sunElevBoost = 0.62 + 0.66 * smoothstep(0.0, 0.52, max(uSunDir.y, 0.0));
        vec3 dayIrradiance = mix(vec3(0.62, 0.74, 0.84), uSunColor * 1.24, 0.50 + 0.36 * clearSkyFactor) * sunElevBoost * mix(0.68, 1.15, cloudShadow) * mix(0.65, 1.0, terrainShadow);
        vec3 nightIrradiance = vec3(0.026, 0.052, 0.105) + uAuroraTint * 0.085 * uAuroraStrength;
        vec3 glacialLit = glacialBase * mix(dayIrradiance, nightIrradiance, uNightFactor);

        // Animated underwater sun caustics shimmering in clear glacial shallows
        if (waterDepth < 4.8 && dayFactor > 0.05 && camDist < 160.0 && terrainShadow > 0.02) {
          vec2 caustPos = vWorldPos.xz - uSunDir.xz * (waterDepth * 0.65);
          float caust = lakeCaustic(caustPos, uTime);
          float caustFade = smoothstep(0.08, 0.55, waterDepth) * (1.0 - smoothstep(1.4, 4.6, waterDepth)) * (1.0 - smoothstep(55.0, 155.0, camDist)) * terrainShadow;
          glacialLit += vec3(0.18, 0.64, 0.76) * uSunColor * caust * caustFade * (0.35 + 0.85 * clearSkyFactor) * cloudShadow * dayFactor * 0.52;
        }

        // Translucent aquamarine subsurface scattering when sunlight back-lights rolling wave crests!
        float sssDir = pow(clamp(dot(viewDir, normalize(-uSunDir + nSurf * 0.52)), 0.0, 1.0), 3.0);
        float crestHeight = clamp(0.45 + msNoise.z * 0.55 + nWaveA.y * 0.30, 0.0, 1.0);
        float sssMask = sssDir * crestHeight * smoothstep(0.30, 2.2, waterDepth) * sunAbove * mix(0.45, 1.0, clearSkyFactor) * cloudShadow;
        glacialLit += vec3(0.050, 0.52, 0.66) * uSunColor * sssMask * 1.05;

        // 4. Physically Calibrated Schlick Fresnel Blending
        float NdotV = clamp(dot(nSurf, viewDir), 0.0, 1.0);
        float fresnel = 0.032 + 0.968 * pow(1.0 - NdotV, 4.2);
        float reflMix = clamp(fresnel * mix(0.92, 0.84, uCloudCoverage * 0.35), 0.08, 0.88);
        vec3 col = mix(glacialLit, reflCol, reflMix);

        // 5. ASTONISHING 3-Tier Rippled Physical Sun Reflection (Organic Dancing Glitter + Sun Column + Diamond Sparkles!)
        float cloudSunTrans = mix(0.36, 1.0, clearSkyFactor) * mix(0.54, 1.18, cloudShadow);
        float sunVis = sunAbove * cloudSunTrans;
        if (sunVis > 0.005) {
          vec3 Lsun = normalize(vec3(uSunDir.x, max(uSunDir.y, 0.035), uSunDir.z));
          vec3 Hsun = normalize(viewDir + Lsun);
          float NdotH_surf = max(dot(nSurf, Hsun), 0.0);
          float NdotH_spec = max(dot(nSpec, Hsun), 0.0);
          float NdotH_calm = max(dot(nRefl, Hsun), 0.0);
          float VdotH = clamp(dot(viewDir, Hsun), 0.0, 1.0);
          float specFres = 0.06 + 0.94 * pow(1.0 - VdotH, 3.8);

          // Non-periodic organic shimmer breakup from multi-scale noise (never straight bands!)
          float shimmerN = clamp(0.52 + msNoise.z * 0.65 + (nWaveA.x + nWaveB.y) * 0.45, 0.25, 1.55);
          float rippleShimmer = mix(1.0, shimmerN, clamp(waveActivity * 0.85, 0.25, 1.0));

          float goldenHour = smoothstep(0.34, 0.04, max(uSunDir.y, 0.0));
          vec3 sunSpecTint = mix(uSunColor * vec3(1.06, 1.02, 0.94), vec3(1.0, 0.70, 0.34), goldenHour * 0.72);

          float broadPath = lakeGGX(NdotH_surf, mix(0.16, 0.26, waveActivity)) * 0.15 * rippleShimmer;
          float tightCol = lakeGGX(NdotH_calm, mix(0.022, 0.058, waveActivity)) * 0.125 * rippleShimmer;
          float sparkleN = pow(NdotH_spec, mix(260.0, 150.0, waveActivity)) * (2.6 + 2.2 * clearSkyFactor) * rippleShimmer;
          vec3 nFacet = normalize(vec3((nMicro.x * 0.22 + nWaveB.x * 0.14 + msNoise.x * 0.65) * rippleNormalScale, 1.0, (nMicro.y * 0.22 + nWaveB.y * 0.14 + msNoise.y * 0.65) * rippleNormalScale));
          float diamondGlint = pow(max(dot(nFacet, Hsun), 0.0), 620.0) * (5.6 + 4.2 * clearSkyFactor) * (0.45 + 0.55 * nearDetail);

          float totalSunSpec = (broadPath + tightCol + sparkleN + diamondGlint) * specFres * sunVis * mix(1.0, 1.75, goldenHour);
          col += sunSpecTint * min(totalSunSpec, 12.0);
        }

        // Cool silvery Moon Reflection Path at Night (occluded by mountain terrain shadows)!
        float moonVis = uNightFactor * (1.0 - uCloudCoverage * 0.68) * smoothstep(0.02, 0.20, uMoonDir.y) * terrainShadow;
        if (moonVis > 0.01) {
          vec3 Lmoon = normalize(uMoonDir);
          vec3 Hmoon = normalize(viewDir + Lmoon);
          float NdotH_m = max(dot(nSpec, Hmoon), 0.0);
          float moonBroad = lakeGGX(max(dot(nSurf, Hmoon), 0.0), 0.16) * 0.06;
          float moonGlint = pow(NdotH_m, 340.0) * 1.45;
          col += vec3(0.62, 0.78, 1.0) * (moonBroad + moonGlint) * moonVis * (0.25 + 0.75 * fresnel);
        }

        // 6. Natural Shoreline Swash, Shoreward-Rolling Wavelets & Delicate Water-Splash Lace!
        // Unified across ALL LOD distances: exact local depth up close, analytical shelf depth from afar
        float shoreSplashAlpha = 0.0;
        float beachWidth = mix(1.22, 0.62, smoothstep(0.22, 0.78, shoreSlope));
        float nearDNorm = exactDepth / beachWidth;
        float approxShelfW = vLakeScale > 600.0 ? clamp(vLakeScale * 0.055, 22.0, 90.0) : clamp(vLakeScale * 0.085, 11.0, 26.0);
        float farShoreDepth = smoothstep(0.0, approxShelfW, max(vShoreDist, 0.0)) * 3.6;
        float farBeachW = beachWidth * mix(1.0, 1.8, smoothstep(500.0, 4000.0, camDist));
        float farDNorm = farShoreDepth / farBeachW;
        float dNorm = mix(farDNorm, nearDNorm, localWeight);
        float splashDepth = mix(farShoreDepth, exactDepth, localWeight);

        if (dNorm < 1.15 && camDist < 7600.0 && splashDepth > 0.002) {
          float distFade = 1.0 - smoothstep(2600.0, 7500.0, camDist);
          float lodScale = mix(1.0, 0.35, smoothstep(450.0, 3500.0, camDist));
          float edgeIn = smoothstep(0.008, 0.055, splashDepth);

          vec2 foamWarp = vec2(
            atmoGNoise(vWorldPos.xz * (0.36 * lodScale) - wDir * uTime * 0.07) - 0.5,
            atmoGNoise(vWorldPos.xz * (0.36 * lodScale) + vec2(4.1, -3.3)) - 0.5
          ) * 0.42;
          float foamA = texture2D(uFoamTex, vWorldPos.xz * (0.30 * lodScale) + foamWarp + wDir * uTime * 0.08).b;
          float foamB = texture2D(uFoamTex, R_B * vWorldPos.xz * (0.68 * lodScale) - foamWarp * 0.8 - wPerp * uTime * 0.10).g;
          float laceNoise = atmoGNoise(vWorldPos.xz * (2.6 * lodScale) - wDir * uTime * 0.38);

          // Band A: Feathery advancing/receding swash rim lapping softly right onto wet volcanic pebbles!
          float swashCenter = mix(0.05, 0.17, swashWave);
          float leadBand = exp(-pow((dNorm - swashCenter) / 0.085, 2.0)) * edgeIn;
          float leadFoam = leadBand * smoothstep(0.24, 0.76, foamA * 0.52 + foamB * 0.38 + swashWave * 0.25 + (laceNoise - 0.5) * 0.30);

          // Band B: Shoreward-rolling curling wavelet & lacy water splash trail (+uTime moves wavelets ONTO shore!)
          float wavePhase = fract(dNorm * 1.55 + uTime * 0.38 + swashN * 0.16);
          float breakerCrest = exp(-pow((wavePhase - 0.28) * 6.8, 2.0)) * smoothstep(0.05, 0.19, dNorm) * (1.0 - smoothstep(0.30, 0.86, dNorm));
          float splashLace = breakerCrest * smoothstep(0.32, 0.74, foamB * 0.55 + laceNoise * 0.52);

          // Band C: Sparkling frothy water-splash flecks popping along the lapping wavelets
          float microSpray = smoothstep(0.64, 0.88, laceNoise * foamB + swashWave2 * 0.24) * (leadBand * 0.9 + breakerCrest) * 0.62;

          float totalSurf = clamp((leadFoam * 0.72 + splashLace * 0.56 + microSpray * 0.44) * distFade, 0.0, 0.78);
          if (totalSurf > 0.002) {
            shoreSplashAlpha = totalSurf * 0.88;

            // Natural Nordic cold-water surf tint (adapts softly to overcast vs sunny skies!)
            vec3 overcastSurf = mix(vec3(0.62, 0.74, 0.80), vec3(0.80, 0.86, 0.90), 0.55);
            vec3 sunnySurf = vec3(0.95, 0.97, 0.99) * uSunColor;
            vec3 surfDay = mix(overcastSurf, sunnySurf, 0.25 + 0.65 * clearSkyFactor) * mix(0.80, 1.08, cloudShadow);
            vec3 surfNight = vec3(0.025, 0.038, 0.058) + vec3(0.012, 0.052, 0.042) * uAuroraStrength;
            col = mix(col, mix(surfDay, surfNight, uNightFactor), totalSurf);
          }
        }

        // Subtle wind-driven offshore whitecap flecks ONLY in strong North Atlantic gales
        if (uWindStrength > 0.90 && waterDepth > 1.8) {
          float galeAmt = smoothstep(0.90, 1.50, uWindStrength);
          float capN = texture2D(uFoamTex, vWorldPos.xz * 0.065 + uvWarp * 0.5 - windDriftA * 0.08).g;
          float capMask = smoothstep(0.70, 0.90, capN + msNoise.z * 0.26) * galeAmt * 0.36 * (1.0 - smoothstep(160.0, 620.0, camDist));
          vec3 capCol = mix(vec3(0.82, 0.88, 0.92) * uSunColor, vec3(0.025, 0.038, 0.055), uNightFactor);
          col = mix(col, capCol, capMask);
        }

        col += sampleOdradekScan(vWorldPos, nSurf) * 0.65;
        col = applyIcelandAtmo(col, vWorldPos);

        // Silky Beer-Lambert shallow transparency + feathered shoreline swash foam (ZERO hard sawtooth cutoff!)
        float opticalAlpha = 1.0 - exp(-waterDepth * 0.95);
        float baseWaterAlpha = clamp(max(opticalAlpha, reflMix * 0.78) * shoreFade, 0.0, 0.985);
        float splashEdgeMask = smoothstep(0.0, 0.045, splashDepth);
        float alpha = clamp(max(baseWaterAlpha, shoreSplashAlpha * splashEdgeMask), 0.0, 0.985);
        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  const _frustum = new THREE.Frustum();
  const _projScreenMat = new THREE.Matrix4();

  function setLakesVisible(v) {
    lakeGroup.visible = v;
  }

  /** Return the closest glacial lake currently inside the camera frustum (null if none visible -> skip reflection pass!). */
  function getBestVisibleLake(camera) {
    if (activeLakes.size === 0) return null;
    _projScreenMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMat);

    let bestLake = null;
    let bestDist = Infinity;
    const cx = camera.position.x;
    const cz = camera.position.z;

    for (const entry of activeLakes.values()) {
      const bs = entry.geo.boundingSphere;
      if (!bs || !_frustum.intersectsSphere(bs)) continue;
      // Edge-to-camera distance (0 if camera is right above the lake!)
      const d = Math.max(0.0, Math.hypot(entry.lake.cx - cx, entry.lake.cz - cz) - entry.lake.avgR);
      if (d < bestDist) {
        bestDist = d;
        bestLake = entry.lake;
      }
    }
    updateLocalShoreDepthMap(bestLake, cx, cz);
    return bestLake && bestDist <= 2200.0 ? bestLake : null;
  }

  function updateLakeUniforms(reflTex, reflMatrix, planeY, hasRefl) {
    glacialLakeMat.uniforms.uReflTex.value = reflTex;
    if (reflMatrix) glacialLakeMat.uniforms.uReflMatrix.value.copy(reflMatrix);
    glacialLakeMat.uniforms.uReflPlaneY.value = planeY;
    glacialLakeMat.uniforms.uHasRefl.value = hasRefl ? 1.0 : 0.0;
  }

  function buildCellHydro(cx, cz) {
    const f = getCellFeatures(cx, cz);
    const group = new THREE.Group();
    const disposables = [];
    const cellWaterfalls = [];

    if (f.riverPts && f.riverPts.length >= 2) {
      const riverGeo = buildRiverGeometry(f.riverPts);
      const riverMesh = new THREE.Mesh(riverGeo, riverMat);
      riverMesh.renderOrder = 2;
      group.add(riverMesh);
      disposables.push(riverGeo);
    }

    if (f.waterfall) {
      const wfBuilt = buildWaterfallGroup(f.waterfall, waterfallMat, plungePoolMat, mistMat);
      if (wfBuilt) {
        group.add(wfBuilt.group);
        cellWaterfalls.push(wfBuilt.plungePos);
      }
    }

    if (f.cliffMist && f.cliffMist.length > 0) {
      const cMist = buildProceduralCliffMist(f.cliffMist);
      if (cMist) {
        group.add(cMist);
        disposables.push(cMist.geometry);
      }
    }

    // Steaming Geothermal Hot Springs (milky silica pools + rising steam plumes)
    if (f.hotSprings && f.hotSprings.length > 0) {
      const steamGeo = new THREE.PlaneGeometry(1, 1);
      const steamCount = f.hotSprings.length * 8;
      const steamInst = new THREE.InstancedMesh(steamGeo, mistMat, steamCount);
      const dummy = new THREE.Object3D();
      const seeds = new Float32Array(steamCount * 4);
      let sIdx = 0;

      for (const hs of f.hotSprings) {
        const gy = getTerrainHeight(hs.x, hs.z);
        const poolGeo = new THREE.CircleGeometry(hs.radius * 1.12, 32);
        poolGeo.rotateX(-Math.PI / 2);
        const poolMesh = new THREE.Mesh(poolGeo, hotSpringMat);
        poolMesh.position.set(hs.x, gy + 0.92, hs.z);
        poolMesh.renderOrder = 3;
        group.add(poolMesh);
        disposables.push(poolGeo);

        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2;
          const rad = (k % 3) * hs.radius * 0.28;
          const sx = hs.x + Math.cos(ang) * rad;
          const sz = hs.z + Math.sin(ang) * rad;
          const localY = Math.max(gy, getTerrainHeight(sx, sz));
          // Bottom-anchored steam rises cleanly from hot spring surface upward (ZERO ground clipping!)
          dummy.position.set(sx, localY + 0.45 + k * 0.85, sz);
          const sc = 5.0 + k * 1.3;
          dummy.scale.set(sc * 1.25, sc, 1);
          dummy.updateMatrix();
          steamInst.setMatrixAt(sIdx, dummy.matrix);
          seeds[sIdx * 4] = sIdx * 9.1;
          seeds[sIdx * 4 + 1] = 0.24 * (1 - k * 0.08);
          seeds[sIdx * 4 + 2] = 0.55;
          seeds[sIdx * 4 + 3] = 1.0;
          sIdx++;
        }
      }
      steamInst.instanceMatrix.needsUpdate = true;
      steamGeo.setAttribute('aMistSeed', new THREE.InstancedBufferAttribute(seeds, 4));
      steamInst.renderOrder = 8;
      group.add(steamInst);
      disposables.push(steamGeo);
    }

    // Animated rising billowing Icelandic geothermal steam plumes across the valley!
    if (f.fumaroles && f.fumaroles.length > 0) {
      const fumGeo = new THREE.PlaneGeometry(1, 1);
      const puffsPerVent = 10;
      const count = f.fumaroles.length * puffsPerVent;
      const fumInst = new THREE.InstancedMesh(fumGeo, mistMat, count);
      const dummy = new THREE.Object3D();
      const seeds = new Float32Array(count * 4);
      let idx = 0;
      for (const fm of f.fumaroles) {
        const gy = getTerrainHeight(fm.x, fm.z);
        for (let k = 0; k < puffsPerVent; k++) {
          const frac = k / (puffsPerVent - 1);
          const windDrift = Math.pow(frac, 1.35) * 14.0;
          const fx = fm.x + windDrift * 0.86 + Math.sin(k * 1.9 + fm.x) * 1.4;
          const fz = fm.z + windDrift * 0.51 + Math.cos(k * 1.7 + fm.z) * 1.4;
          const localY = Math.max(gy, getTerrainHeight(fx, fz));
          dummy.position.set(fx, localY + 0.35 + frac * 17.5, fz);
          const sz = mix(4.2, 16.5, Math.pow(frac, 0.75));
          dummy.scale.set(sz * 1.25, sz * 1.05, 1);
          dummy.updateMatrix();
          fumInst.setMatrixAt(idx, dummy.matrix);
          seeds[idx * 4] = idx * 7.3 + fm.x * 0.13;
          seeds[idx * 4 + 1] = 0.42 * (1.0 - Math.pow(frac, 1.35) * 0.82);
          seeds[idx * 4 + 2] = 0.65 + frac * 0.35;
          seeds[idx * 4 + 3] = 1.0;
          idx++;
        }
      }
      fumInst.instanceMatrix.needsUpdate = true;
      fumGeo.setAttribute('aMistSeed', new THREE.InstancedBufferAttribute(seeds, 4));
      fumInst.renderOrder = 8;
      fumInst.frustumCulled = false;
      group.add(fumInst);
      disposables.push(fumGeo);
    }

    root.add(group);
    return { key: `${cx},${cz}`, group, disposables, cellWaterfalls };
  }

  let lastWaterPcx = 1e9;
  let lastWaterPcz = 1e9;
  let lastWaterBand = 1e9;

  function rebuildAll(centerX, centerZ) {
    for (const c of activeCells.values()) {
      root.remove(c.group);
      c.disposables.forEach((d) => d.dispose && d.dispose());
    }
    activeCells.clear();
    for (const seg of activeTrunkSegs.values()) {
      root.remove(seg.group);
      seg.disposables.forEach((d) => d.dispose && d.dispose());
    }
    activeTrunkSegs.clear();
    for (const lk of activeLakes.values()) {
      lakeGroup.remove(lk.mesh);
      lk.geo.dispose();
    }
    activeLakes.clear();
    lastDepthLakeId = '';
    lastDepthX = 1e9;
    lastDepthZ = 1e9;
    lastWaterPcx = 1e9;
    lastWaterPcz = 1e9;
    lastWaterBand = 1e9;
    glacialLakeMat.uniforms.uLocalDepthRect.value.w = 0.0;
    update(centerX, centerZ);
  }

  function update(centerX, centerZ) {
    const pcx = Math.round(centerX / CELL_SIZE);
    const pcz = Math.round(centerZ / CELL_SIZE);
    const pBand = Math.round(centerX / TRUNK_SPACING);
    if (pcx === lastWaterPcx && pcz === lastWaterPcz && pBand === lastWaterBand) return;
    lastWaterPcx = pcx;
    lastWaterPcz = pcz;
    lastWaterBand = pBand;
    const needed = new Set();

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = `${cx},${cz}`;
        needed.add(key);
        if (!activeCells.has(key)) {
          activeCells.set(key, buildCellHydro(cx, cz));
        }
      }
    }

    for (const [key, cell] of activeCells.entries()) {
      if (!needed.has(key)) {
        root.remove(cell.group);
        cell.disposables.forEach((d) => d.dispose && d.dispose());
        activeCells.delete(key);
      }
    }

    // Stream continuous unbroken 4km infinite glacial trunk rivers + sculpted 3D volcanic cave tunnels under mountains!
    const neededTrunks = new Set();
    for (let db = -1; db <= 1; db++) {
      const band = pBand + db;
      for (let dz = -2; dz <= 2; dz++) {
        const zIdx = pcz + dz;
        const key = `${band},${zIdx}`;
        neededTrunks.add(key);
        if (!activeTrunkSegs.has(key)) {
          const segGroup = new THREE.Group();
          const disposables = [];
          const geo = buildTrunkRiverSegment(band, zIdx);
          const mesh = new THREE.Mesh(geo, riverMat);
          mesh.renderOrder = 2;
          segGroup.add(mesh);
          disposables.push(geo);

          const caveGeo = buildRiverCaveTunnels(band, zIdx);
          if (caveGeo) {
            const caveMesh = new THREE.Mesh(caveGeo, caveRockMat);
            caveMesh.receiveShadow = true;
            segGroup.add(caveMesh);
            disposables.push(caveGeo);
          }

          root.add(segGroup);
          activeTrunkSegs.set(key, { group: segGroup, disposables });
        }
      }
    }
    for (const [key, seg] of activeTrunkSegs.entries()) {
      if (!neededTrunks.has(key)) {
        root.remove(seg.group);
        seg.disposables.forEach((d) => d.dispose && d.dispose());
        activeTrunkSegs.delete(key);
      }
    }

    // Stream multi-scale Glacial Lakes (several hundred meters up to 10km) out to the expanded horizon!
    const visibleLakes = getActiveLakesAround(centerX, centerZ, 12000);
    const neededLakes = new Set();
    for (let i = 0; i < visibleLakes.length; i++) {
      const lake = visibleLakes[i];
      neededLakes.add(lake.id);
      if (!activeLakes.has(lake.id)) {
        const geo = buildLakeGeometry(lake);
        if (geo) {
          const mesh = new THREE.Mesh(geo, glacialLakeMat);
          mesh.frustumCulled = true;
          mesh.renderOrder = 3;
          lakeGroup.add(mesh);
          activeLakes.set(lake.id, { lake, mesh, geo });
        }
      }
    }
    for (const [id, entry] of activeLakes.entries()) {
      if (!neededLakes.has(id)) {
        lakeGroup.remove(entry.mesh);
        entry.geo.dispose();
        activeLakes.delete(id);
      }
    }

    waterfallPositions.length = 0;
    for (const cell of activeCells.values()) {
      for (const p of cell.cellWaterfalls) waterfallPositions.push(p);
    }
  }

  return {
    update,
    rebuildAll,
    setLakesVisible,
    getBestVisibleLake,
    updateLakeUniforms,
    getActiveLakeCount: () => activeLakes.size,
    getWaterfallPositions: () => waterfallPositions
  };
}
