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
  getTrunkCenterOverburden,
  sampleWorld
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
    const waterY = getTrunkWaterY(rx, z);
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
    }
  }

  for (let i = 0; i < alongSegs; i++) {
    for (let j = 0; j < crossSegs; j++) {
      const a = i * (crossSegs + 1) + j;
      const b = a + 1;
      const c = a + (crossSegs + 1);
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aDepth', new THREE.BufferAttribute(depthAttr, 1));
  geo.setAttribute('aFlowT', new THREE.BufferAttribute(flowAttr, 1));
  geo.setAttribute('aTunnelDark', new THREE.BufferAttribute(tunnelDarkAttr, 1));
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
    const waterY = getTrunkWaterY(rx, z);
    const over = getTrunkCenterOverburden(z, bandIdx);
    samples.push({ z, rx, waterY, over });
  }

  // Group contiguous subterranean mountain spans right where the rising cliff face closes overhead (over > 16.6m)
  const spans = [];
  let inSpan = false;
  let sStart = 0;
  for (let i = 0; i < samples.length; i++) {
    const under = samples[i].over > 16.6;
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

        // Tuck high crag peaks neatly beneath the mountain hillside while GUARANTEEING the cave arch stays wide open (>10.7m)!
        if (ri <= archSegs && localY > 0.5 && portalDist < 16.0) {
          const archClearY = sp.waterY + Math.max(0.0, sa) * 10.75;
          const actualSurfY = getTerrainHeight(wx, wz);
          const maxRoofY = Math.max(archClearY, actualSurfY - 0.20);
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
  const idx = [];

  const tmpS = {
    height: 0, moss: 0, cliff: 0, path: 0, scree: 0,
    riverDepth: 0, riverMask: 0, flowX: 0, flowZ: 1, snow: 0, wetness: 0, hummockAO: 0.5
  };

  // Sample smooth monotonic channel floor heights & lock confluence endpoint cleanly to trunk river waterY!
  const spanWaterY = new Float32Array(samples.length);
  const endPt = samples[samples.length - 1];
  const confWaterY = getTrunkWaterY(endPt.x, endPt.z);
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
    const localY = minBedY + 1.08;
    const confBlend = Math.pow(clamp((sp.t - 0.65) / 0.35, 0, 1), 1.5);
    spanWaterY[i] = mix(localY, confWaterY + 0.02, confBlend);
  }
  // Smooth pass to prevent sudden vertical kinks in water surface
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < samples.length - 1; i++) {
      spanWaterY[i] = spanWaterY[i - 1] * 0.25 + spanWaterY[i] * 0.5 + spanWaterY[i + 1] * 0.25;
    }
  }

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
  const dropH = clamp(crestY - baseY + 4.0, 42, 138);
  const lipStartX = wf.x + forwardX * 4.5;
  const lipStartZ = wf.z + forwardZ * 4.5;

  // 3 graceful braided 3D cascade layers (slender multi-stream profile with dark wet cliff peeking between jets!)
  const layers = [
    { width: 8.8,  curveOut: 11.4, zOff: -0.4, alphaMul: 0.92, fanAmt: 0.62, speedMul: 1.00 },
    { width: 12.6, curveOut: 12.6, zOff: 0.8,  alphaMul: 0.72, fanAmt: 0.78, speedMul: 1.22 },
    { width: 17.0, curveOut: 14.0, zOff: 2.2,  alphaMul: 0.36, fanAmt: 1.02, speedMul: 0.88 }
  ];

  for (let l = 0; l < layers.length; l++) {
    const spec = layers[l];
    const geo = new THREE.PlaneGeometry(spec.width, dropH, 16, 40);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const t = clamp(1.0 - (y + dropH * 0.5) / dropH, 0.0, 1.0); // 0 at lip crest, 1 at plunge pool

      // Smooth parabolic free-fall arc rolling organically over the cliff lip
      const lipTuck = (1.0 - Math.min(t * 8.0, 1.0)) * -3.2;
      const parabola = Math.pow(t, 0.74) * spec.curveOut;
      const lateralBow = Math.cos((x / (spec.width * 0.5)) * 1.45) * 1.9;
      // Graceful narrowing at cliff notch, fanning into airy mist spray toward plunge boulders
      const fan = 0.62 + Math.pow(t, 1.2) * spec.fanAmt;
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
    mesh.position.set(lipStartX, baseY + dropH * 0.5 - 2.0, lipStartZ);
    mesh.rotation.y = wf.yaw;
    mesh.renderOrder = 4 + l;
    grp.add(mesh);
  }

  // Churning turbulent whitewater foam disc at plunge pool impact zone
  const poolGeo = new THREE.CircleGeometry(15.5, 28);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMesh = new THREE.Mesh(poolGeo, plungePoolMat);
  poolMesh.position.set(plungeCenterX, baseY + 1.05, plungeCenterZ);
  poolMesh.renderOrder = 3;
  grp.add(poolMesh);

  // Translucent swirling volumetric plunge-pool spray plume (lets dark boulders peek through!)
  const puffCount = 30;
  const puffGeo = new THREE.PlaneGeometry(1, 1);
  const puffInst = new THREE.InstancedMesh(puffGeo, mistMat, puffCount);
  const dummy = new THREE.Object3D();
  const seeds = new Float32Array(puffCount * 4);

  for (let i = 0; i < puffCount; i++) {
    const angle = hash2i(i, 11, 881) * Math.PI * 2;
    const rad = Math.pow(hash2i(i, 23, 881), 0.7) * 20.0;
    // Bias spray gently forward out of cliff cleft & bottom-anchored cleanly above plunge pool water (ZERO hard ground/cliff cuts!)
    const spreadX = Math.cos(angle) * rad * 1.05 + forwardX * 7.5;
    const spreadZ = Math.sin(angle) * rad * 0.90 + forwardZ * 7.5;
    const sc = 11.0 + hash2i(i, 41, 881) * 14.0;
    const hOff = 0.65 + hash2i(i, 37, 881) * 9.5;
    dummy.position.set(plungeCenterX + spreadX, baseY + hOff, plungeCenterZ + spreadZ);
    dummy.scale.set(sc * 1.45, sc * 0.88, 1);
    dummy.updateMatrix();
    puffInst.setMatrixAt(i, dummy.matrix);
    seeds[i * 4] = hash2i(i, 53, 881) * 100.0;              // phase seed
    seeds[i * 4 + 1] = 0.14 + hash2i(i, 67, 881) * 0.16;    // subtle translucent opacity!
    seeds[i * 4 + 2] = 0.42 + hash2i(i, 79, 881) * 0.45;    // swirl speed
    seeds[i * 4 + 3] = 1.0;                                  // isSpray (brighter mist)
  }
  puffInst.instanceMatrix.needsUpdate = true;
  puffGeo.setAttribute('aMistSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  puffInst.renderOrder = 8;
  puffInst.frustumCulled = false;
  grp.add(puffInst);

  return { group: grp, plungePos: new THREE.Vector3(plungeCenterX, baseY + 6, plungeCenterZ) };
}

export function createWaterSystem(texLib, scene) {
  const root = new THREE.Group();
  scene.add(root);

  // 1. Dark Glassy Braided Glacial River Shader Material (soft bank feathering, crisp whitewater rapids)
  const riverMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
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
      varying vec3 vWorldPos;
      varying vec2 vUv;
      varying float vDepth;
      varying float vFlowT;
      varying float vTunnelDark;
      void main() {
        vUv = uv;
        vDepth = aDepth;
        vFlowT = aFlowT;
        vTunnelDark = aTunnelDark;
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
      ${ATMO_GLSL_PARS}

      void main() {
        // Soft natural bank feathering (zero jagged polygon edges!)
        if (vDepth <= -0.04) discard;
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

        // Physically balanced sky Fresnel reflection (reflects bright azure/silver sky by day, dark starry sky + moonlight + aurora at night!)
        vec3 reflDir = reflect(-viewDir, n);
        float cosT = clamp(dot(n, viewDir), 0.0, 1.0);
        float fresnel = 0.045 + 0.54 * pow(1.0 - cosT, 3.8);
        vec3 dayZenith = mix(uSkyZenith * 0.78, vec3(0.16, 0.22, 0.26), uCloudCoverage * 0.65);
        vec3 skyZen = mix(dayZenith, uSkyZenith * 0.55, uNightFactor);
        vec3 skyHor = mix(uSkyHorizon * 0.62, uSkyHorizon * 0.45, uNightFactor);
        vec3 reflSky = mix(skyHor, skyZen, smoothstep(0.06, 0.60, max(reflDir.y, 0.0)));
        reflSky += vec3(0.04, 0.34, 0.24) * uAuroraStrength * uNightFactor * 0.48;

        // Sun specular by day + crisp cool lunar glint by night!
        vec3 halfSun = normalize(viewDir + normalize(vec3(uSunDir.x, max(uSunDir.y, 0.38), uSunDir.z)));
        float sunSpec = pow(max(dot(n, halfSun), 0.0), 64.0) * 0.24 * dayFactor;
        vec3 halfMoon = normalize(viewDir + normalize(vec3(uMoonDir.x, max(uMoonDir.y, 0.25), uMoonDir.z)));
        float moonSpec = pow(max(dot(n, halfMoon), 0.0), 96.0) * 0.14 * uNightFactor * (1.0 - uCloudCoverage * 0.65);

        vec3 col = mix(waterCol, reflSky, clamp(fresnel * 0.74, 0.10, 0.62)) + uSunColor * sunSpec + vec3(0.55, 0.70, 0.92) * moonSpec;

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
        float bankAlpha = smoothstep(0.0, 0.20, depthClean);
        float alpha = bankAlpha * mix(0.90, 0.99, clamp(foam + fresnel * 0.5, 0.0, 1.0));
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

        // Organic tattered edges & smooth top/bottom transitions
        float sideFade = smoothstep(0.05, 0.26, vUv.x) * (1.0 - smoothstep(0.74, 0.95, vUv.x));
        float topFade = smoothstep(0.0, 0.10, t + (fB.r - 0.5) * 0.07);
        float botSpray = smoothstep(0.65, 0.98, t) * fC.b * 0.48;

        float alpha = clamp((breakup * 0.88 + 0.04 + botSpray) * coreShape * sideFade * topFade * uLayerOpacity, 0.0, 0.94);
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
    side: THREE.DoubleSide
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
  const waterfallPositions = [];

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
      group.add(wfBuilt.group);
      cellWaterfalls.push(wfBuilt.plungePos);
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
        const poolGeo = new THREE.CircleGeometry(hs.radius * 1.15, 24);
        poolGeo.rotateX(-Math.PI / 2);
        const poolMesh = new THREE.Mesh(poolGeo, hotSpringMat);
        poolMesh.position.set(hs.x, gy + 0.42, hs.z);
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

    // Geothermal steam fumaroles in volcanic cells
    if (f.fumaroles && f.fumaroles.length > 0) {
      const fumGeo = new THREE.PlaneGeometry(1, 1);
      const count = f.fumaroles.length * 6;
      const fumInst = new THREE.InstancedMesh(fumGeo, mistMat, count);
      const dummy = new THREE.Object3D();
      const seeds = new Float32Array(count * 4);
      let idx = 0;
      for (const fm of f.fumaroles) {
        const gy = getTerrainHeight(fm.x, fm.z);
        for (let k = 0; k < 6; k++) {
          const fx = fm.x + (k - 2.5) * 1.2;
          const fz = fm.z + (k % 2 - 0.5) * 1.4;
          const localY = Math.max(gy, getTerrainHeight(fx, fz));
          dummy.position.set(fx, localY + 0.40 + k * 1.45, fz);
          dummy.scale.set(5.5 + k * 2.0, 5.5 + k * 2.0, 1);
          dummy.updateMatrix();
          fumInst.setMatrixAt(idx, dummy.matrix);
          seeds[idx * 4] = idx * 7.3;
          seeds[idx * 4 + 1] = 0.28 * (1 - k * 0.12);
          seeds[idx * 4 + 2] = 0.55;
          seeds[idx * 4 + 3] = 1.0;
          idx++;
        }
      }
      fumInst.instanceMatrix.needsUpdate = true;
      fumGeo.setAttribute('aMistSeed', new THREE.InstancedBufferAttribute(seeds, 4));
      fumInst.renderOrder = 8;
      group.add(fumInst);
      disposables.push(fumGeo);
    }

    root.add(group);
    return { key: `${cx},${cz}`, group, disposables, cellWaterfalls };
  }

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
    update(centerX, centerZ);
  }

  function update(centerX, centerZ) {
    const pcx = Math.round(centerX / CELL_SIZE);
    const pcz = Math.round(centerZ / CELL_SIZE);
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
    const pBand = Math.round(centerX / TRUNK_SPACING);
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

    waterfallPositions.length = 0;
    for (const cell of activeCells.values()) {
      for (const p of cell.cellWaterfalls) waterfallPositions.push(p);
    }
  }

  return {
    update,
    rebuildAll,
    getWaterfallPositions: () => waterfallPositions
  };
}
