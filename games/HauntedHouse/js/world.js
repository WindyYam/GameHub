// ============================================================================
// HAUNTED HOUSE — TUNNELS CONNECTING COLOSSAL GRAND STAIRCASE HALLS
// ============================================================================
(() => {
  'use strict';
  const {
    clamp, lerp, smooth, rand, rr,
    scene, MAT, PROPS, ENTITIES,
    registerLightAnchor, removeLightAnchorsByTag,
    registerVolumetricBeam, removeVolumetricBeamsByTag,
    mergeStaticGroup
  } = window.HH;

  const SEG_LEN = 28.0; // nominal reference length

  // Alternating sequence: Colossal Grand Staircase Hall (Ascending) -> Tunnel -> Colossal Grand Staircase Hall (Descending) -> Tunnel
  const THEMES = [
    'GRAND_GALLERY',        // Colossal 26m-wide, 15.6m-high Grand Staircase Hall (Ascending to Mezzanine)
    'CATACOMB_TUNNEL',      // Vaulted Stone Catacomb Tunnel connecting at upper mezzanine level
    'STAIRCASE_HALL',       // Colossal 26m-wide, 15.6m-high Imperial Staircase Hall (Descending to Main Floor)
    'HAUNTED_CONSERVATORY'  // Moonlit Gothic Cloister Tunnel connecting at lower floor level
  ];

  const activeSegments = [];
  let nextSegIndex = 0;
  let cursorPos = new THREE.Vector3(0, 0, 0);
  let cursorYaw = 0;
  let cursorS = 0;

  //Shared step geometries for the 40-step Grand Sweeping Staircase & Floor Weathering
  const STAIR_GEO = {
    stepWood: new THREE.BoxGeometry(5.6, 0.20, 0.62),
    stepNosing: new THREE.CylinderGeometry(0.032, 0.032, 5.64, 10),
    stepCarpet: new THREE.BoxGeometry(3.75, 0.212, 0.635),
    stepRod: new THREE.CylinderGeometry(0.014, 0.014, 3.85, 8),
    leafPlane: new THREE.PlaneGeometry(0.16, 0.11),
    stoneSlab: new THREE.BoxGeometry(0.42, 0.045, 0.34)
  };
  STAIR_GEO.stepNosing.rotateZ(Math.PI * 0.5);
  STAIR_GEO.stepRod.rotateZ(Math.PI * 0.5);
  STAIR_GEO.leafPlane.rotateX(-Math.PI * 0.5);
  Object.values(STAIR_GEO).forEach(g => { g._shared = true; });

  // Scatter HollowMoorManor-style fallen autumn leaf clusters & weathered stone slabs along floor edges (merged into staticArch)
  function scatterFloorWeathering(frames, minLat, maxLat, clustersCount, staticArch) {
    for (let c = 0; c < clustersCount; c++) {
      const t = rr(0.08, 0.92);
      const side = (c % 2 === 0) ? -1 : 1;
      const baseLat = side * rr(minLat, maxLat);
      const f = sampleFrameAt(frames, t);

      // Weathered stone slab / threshold fragment near baseboard or colonnade
      if (c % 3 === 0) {
        const slab = new THREE.Mesh(STAIR_GEO.stoneSlab, MAT.stoneWall);
        slab.scale.set(rr(0.8, 1.5), rr(0.7, 1.3), rr(0.8, 1.4));
        slab.position.set(
          f.pos.x + f.right.x * baseLat,
          f.pos.y + 0.018,
          f.pos.z + f.right.z * baseLat
        );
        slab.rotation.y = f.yaw + rr(-0.4, 0.4);
        staticArch.add(slab);
      }

      // Wind-blown cluster of 5-8 fallen autumn leaves
      const leavesInCluster = 6;
      for (let l = 0; l < leavesInCluster; l++) {
        const lx = baseLat + rr(-0.85, 0.85);
        const lz = rr(-0.85, 0.85);
        const leaf = new THREE.Mesh(STAIR_GEO.leafPlane, MAT.autumnLeaf);
        const s = rr(0.75, 1.45);
        leaf.scale.set(s, 1, s * rr(0.75, 1.25));
        leaf.position.set(
          f.pos.x + f.right.x * lx + f.forward.x * lz,
          f.pos.y + 0.006 + (l * 0.0012),
          f.pos.z + f.right.z * lx + f.forward.z * lz
        );
        leaf.rotation.y = rr(0, Math.PI * 2);
        staticArch.add(leaf);
      }
    }
  }

  function buildExtrudedRibbon(frames, profilePts, mat, vRepeat = 4, flipNormals = false, castShad = false) {
    const numF = frames.length;
    const numP = profilePts.length;
    const positions = new Float32Array(numF * numP * 3);
    const uvs = new Float32Array(numF * numP * 2);
    const indices = [];

    for (let i = 0; i < numF; i++) {
      const f = frames[i];
      const v = (i / (numF - 1)) * vRepeat;
      for (let j = 0; j < numP; j++) {
        const px = profilePts[j][0];
        const py = profilePts[j][1];
        const u = profilePts[j][2];
        const idx = (i * numP + j) * 3;
        positions[idx] = f.pos.x + f.right.x * px;
        positions[idx + 1] = f.pos.y + py;
        positions[idx + 2] = f.pos.z + f.right.z * px;

        const uvIdx = (i * numP + j) * 2;
        uvs[uvIdx] = u;
        uvs[uvIdx + 1] = v;
      }
    }

    for (let i = 0; i < numF - 1; i++) {
      for (let j = 0; j < numP - 1; j++) {
        const a = i * numP + j;
        const b = (i + 1) * numP + j;
        const c = (i + 1) * numP + (j + 1);
        const d = i * numP + (j + 1);
        if (flipNormals) {
          indices.push(a, c, b, a, d, c);
        } else {
          indices.push(a, b, c, a, c, d);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = castShad;
    return mesh;
  }

  // Compute high-resolution path frames with customizable vertical elevation profile fn(t)
  function computeSegmentFrames(startPos, startYaw, segLen, turnAngle, yOffsetFn, steps = 48) {
    const frames = [];
    const pos = startPos.clone();
    const ds = segLen / steps;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const smoothTurn = t * t * (3 - 2 * t);
      const yaw = startYaw + turnAngle * smoothTurn;
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();

      const yOffset = yOffsetFn(t);
      const framePos = new THREE.Vector3(pos.x, startPos.y + yOffset, pos.z);

      frames.push({
        t,
        pos: framePos,
        yaw,
        forward,
        right
      });

      if (i < steps) {
        const midT = (i + 0.5) / steps;
        const midYaw = startYaw + turnAngle * (midT * midT * (3 - 2 * midT));
        pos.x += -Math.sin(midYaw) * ds;
        pos.z += -Math.cos(midYaw) * ds;
      }
    }
    return frames;
  }

  function sampleFrameAt(frames, t) {
    const fFloat = clamp(t, 0, 1) * (frames.length - 1);
    const i0 = Math.floor(fFloat);
    const i1 = Math.min(frames.length - 1, i0 + 1);
    const frac = fFloat - i0;
    const f0 = frames[i0];
    const f1 = frames[i1];
    const yaw = lerp(f0.yaw, f1.yaw, frac);
    return {
      pos: f0.pos.clone().lerp(f1.pos, frac),
      yaw,
      forward: new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize(),
      right: new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).normalize()
    };
  }

  function placeAtFrame(frames, t, latX, latY, obj, yawOffset = 0) {
    const f = sampleFrameAt(frames, t);
    obj.position.set(
      f.pos.x + f.right.x * latX,
      f.pos.y + latY,
      f.pos.z + f.right.z * latX
    );
    obj.rotation.y = f.yaw + yawOffset;
    obj.userData.baseX = obj.position.x;
    obj.userData.baseY = obj.position.y;
    obj.userData.baseZ = obj.position.z;
    return f;
  }

  function frameWorldPos(frames, t, latX, latY, fwdZ = 0) {
    const f = sampleFrameAt(frames, t);
    return new THREE.Vector3(
      f.pos.x + f.right.x * latX + f.forward.x * fwdZ,
      f.pos.y + latY,
      f.pos.z + f.right.z * latX + f.forward.z * fwdZ
    );
  }

  // ---------- Halloween dressing helper: places a themed prop (+ warm light) at a path frame ----------
  const DECOR_LIGHT = {
    candles: { c: 0xff8a2a, i: 0.55, d: 4.6, h: 0.6, pr: 1.0 },
    pumpkins: { c: 0xff6e18, i: 0.75, d: 4.2, h: 0.4, pr: 1.1 },
    table: { c: 0xff8a2a, i: 0.65, d: 4.8, h: 1.1, pr: 1.1 },
    console: { c: 0xff8624, i: 0.85, d: 5.8, h: 1.15, pr: 1.2 },
    candelabra: { c: 0xff8a2a, i: 1.1, d: 8.0, h: 1.95, pr: 1.3 }
  };
  function dress(frames, t, lat, y, kind, yaw, arch, tag, scale = 1) {
    let obj;
    switch (kind) {
      case 'candles': obj = PROPS.makeCandleCluster(1.0); break;
      case 'pumpkins': obj = PROPS.makePumpkinPatch(); break;
      case 'table': obj = PROPS.makeSkullTable(); break;
      case 'bones': obj = PROPS.makeBoneHeap(); break;
      case 'skull': obj = PROPS.makeSkull(1.0); break;
      case 'candelabra': obj = PROPS.makeFloorCandelabra(); break;
      case 'console': obj = PROPS.makeConsoleTable(); break;
      case 'bats': obj = PROPS.makeHangingBats(scale); break;
      case 'web': obj = PROPS.makeCobweb(scale); break;
      default: return null;
    }
    if (kind !== 'web') obj.scale.setScalar(scale);
    placeAtFrame(frames, t, lat, y, obj, yaw);
    arch.add(obj);
    const L = DECOR_LIGHT[kind];
    if (L) {
      registerLightAnchor({
        pos: frameWorldPos(frames, t, lat, y + L.h, 0),
        color: L.c, intensity: L.i, distance: L.d,
        flickerSpeed: rr(6, 9), flickerAmp: 0.22, priority: L.pr, tag
      });
    }
    return obj;
  }

  // Build an authentic curved Transverse Vault Rib Arch spanning the ceiling
  function makeVaultArchRib(halfW, wallH, vaultApex = 1.48) {
    const ribGroup = new THREE.Group();
    const archPts = [
      [-halfW + 0.22, wallH - 0.05],
      [-halfW * 0.65, wallH + vaultApex * 0.66],
      [0, wallH + vaultApex],
      [halfW * 0.65, wallH + vaultApex * 0.66],
      [halfW - 0.22, wallH - 0.05]
    ];
    const beamH = vaultApex > 2.0 ? 0.38 : 0.22;
    const beamD = vaultApex > 2.0 ? 0.52 : 0.32;
    for (let i = 0; i < archPts.length - 1; i++) {
      const [x0, y0] = archPts[i];
      const [x1, y1] = archPts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const ang = Math.atan2(y1 - y0, x1 - x0);

      const woodBeam = new THREE.Mesh(new THREE.BoxGeometry(len + 0.12, beamH, beamD), MAT.darkWood);
      woodBeam.position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5, 0);
      woodBeam.rotation.z = ang;
      woodBeam.castShadow = true;
      woodBeam.receiveShadow = true;

      const goldFillet = new THREE.Mesh(new THREE.BoxGeometry(len + 0.10, beamH * 0.28, beamD + 0.06), MAT.goldTrim);
      goldFillet.position.set((x0 + x1) * 0.5, (y0 + y1) * 0.5 - beamH * 0.42, 0);
      goldFillet.rotation.z = ang;

      ribGroup.add(woodBeam, goldFillet);
    }
    const boss = new THREE.Mesh(new THREE.SphereGeometry(vaultApex > 2.0 ? 0.28 : 0.16, 12, 10), MAT.goldTrim);
    boss.position.set(0, wallH + vaultApex - 0.06, 0);
    ribGroup.add(boss);
    return ribGroup;
  }

  // Build a Monumental End-Wall with a Molded Gothic Portal Archway connecting a 7.6m Tunnel to the 26m Colossal Hall
  function makeGrandPortalWall(roomHalfW, roomWallH, vaultApex, openHalfW, openFloorY, openH) {
    const g = new THREE.Group();
    const wallThick = 0.48;
    const totalH = roomWallH + vaultApex;

    // Left & Right Wing Walls flanking the tunnel opening
    const wingW = roomHalfW - openHalfW;
    if (wingW > 0.1) {
      for (const side of [-1, 1]) {
        const wx = side * (openHalfW + wingW * 0.5);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(wingW, totalH, wallThick), MAT.woodPanel);
        wing.position.set(wx, totalH * 0.5, 0);
        wing.castShadow = true;
        wing.receiveShadow = true;
        g.add(wing);

        // Giant Molded Pilaster flanking the portal opening
        const pilaster = PROPS.makeColumn(roomWallH);
        pilaster.position.set(side * (openHalfW + 0.35), 0, 0);
        g.add(pilaster);
      }
    }

    // Lower Wall Below Tunnel Opening (when tunnel enters at Upper Mezzanine level, openFloorY > 0!)
    if (openFloorY > 0.1) {
      const underWall = new THREE.Mesh(new THREE.BoxGeometry(openHalfW * 2 + 0.2, openFloorY, wallThick), MAT.woodPanel);
      underWall.position.set(0, openFloorY * 0.5, 0);
      underWall.castShadow = true;
      underWall.receiveShadow = true;
      g.add(underWall);
    }

    // Upper Wall Lintel Above Tunnel Opening up to the Vaulted Ceiling
    const lintelBottom = openFloorY + openH;
    const lintelH = totalH - lintelBottom;
    if (lintelH > 0.1) {
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(openHalfW * 2 + 0.2, lintelH, wallThick), MAT.woodPanel);
      lintel.position.set(0, lintelBottom + lintelH * 0.5, 0);
      lintel.castShadow = true;
      lintel.receiveShadow = true;
      g.add(lintel);
    }

    // Ornate Molded Archway Casing & Gold Trim framing the tunnel portal
    const archTopBeam = new THREE.Mesh(new THREE.BoxGeometry(openHalfW * 2 + 0.9, 0.36, wallThick + 0.18), MAT.darkWood);
    archTopBeam.position.set(0, lintelBottom + 0.12, 0);
    const archGoldTrim = new THREE.Mesh(new THREE.BoxGeometry(openHalfW * 2 + 0.96, 0.10, wallThick + 0.24), MAT.goldTrim);
    archGoldTrim.position.set(0, lintelBottom - 0.04, 0);
    g.add(archTopBeam, archGoldTrim);

    return g;
  }

  // ============================================================================
  // COLOSSAL GRAND STAIRCASE HALL BUILDER (26m Wide x 15.6m High x 38m Long!)
  // ============================================================================
  function buildColossalStaircaseHall(segIndex, theme, tag, group, actors, portraits) {
    const isAscending = (theme === 'GRAND_GALLERY');
    const segLen = 38.0;
    const stepsCount = 56;
    const balcH = 5.6; // Upper Mezzanine Balcony height above Main Hall Floor
    const halfW = 13.0; // 26.0 METERS WIDE Colossal Hall!
    const wallH = 12.0; // 12.0m walls + 3.6m vault = 15.6 METERS TALL Cathedral Volume!
    const vaultApex = 3.6;

    // Gentle S-curve or sweeping turn through the colossal hall
    const turnDir = (segIndex % 2 === 0) ? -1 : 1;
    const turnAngle = (segIndex === 0) ? -0.32 : turnDir * 0.30;

    // Staircase span along normalized path t
    const stairT0 = isAscending ? 0.30 : 0.16;
    const stairT1 = isAscending ? 0.84 : 0.70;

    const startPos = cursorPos.clone();
    const startYaw = cursorYaw;
    // Absolute world Y of the Main Hall Floor (lower level)
    const hallFloorY = isAscending ? startPos.y : (startPos.y - balcH);

    // 1. Player & Staircase Spine Frames (climbs or descends smoothly between hallFloorY and hallFloorY + balcH)
    const pathFrames = computeSegmentFrames(startPos, startYaw, segLen, turnAngle, t => {
      const s = smooth(stairT0, stairT1, t);
      return isAscending ? (s * balcH) : (-s * balcH);
    }, stepsCount);

    // 2. Horizontal Room Envelope Frames (same X/Z curve, fixed Y = hallFloorY so floor, balconies & ceiling are level!)
    const roomFrames = pathFrames.map(f => ({
      t: f.t,
      pos: new THREE.Vector3(f.pos.x, hallFloorY, f.pos.z),
      yaw: f.yaw,
      forward: f.forward,
      right: f.right
    }));

    const endFrame = pathFrames[pathFrames.length - 1];
    cursorPos.copy(endFrame.pos);
    cursorYaw = endFrame.yaw;

    // Static architecture & static prop batch group (merged into ~12 draw calls for the entire Colossal Hall!)
    const staticArch = new THREE.Group();

    // --- A. VAST CHECKERED MARBLE FLOOR (26m Wide x 38m Long at y = hallFloorY) ---
    staticArch.add(buildExtrudedRibbon(roomFrames, [
      [-halfW, 0, 0],
      [halfW, 0, 7]
    ], MAT.marbleFloor, 10, true));

    // --- B. SOARING 12m MAHOGANY WAINSCOT WALLS & 15.6m COFFERED VAULTED CEILING ---
    staticArch.add(buildExtrudedRibbon(roomFrames, [[-halfW, 0, 0], [-halfW, wallH, 2.2]], MAT.woodPanel, 9, false));
    staticArch.add(buildExtrudedRibbon(roomFrames, [[halfW, wallH, 0], [halfW, 0, 2.2]], MAT.woodPanel, 9, false));

    // Multi-tiered Baseboards, Dado Rails, Mezzanine Cornices & Crown Moldings on Perimeter Walls
    for (const side of [-1, 1]) {
      const wx = side * halfW;
      const inX = side * (halfW - 0.16);
      const flip = side > 0;
      // Heavy palace baseboard plinth
      staticArch.add(buildExtrudedRibbon(roomFrames, [
        [wx, 0, 0], [inX, 0, 0.2], [inX, 0.45, 0.8], [wx, 0.52, 1]
      ], MAT.darkWood, 6, flip, true));
      // Lower gold chair-rail molding
      staticArch.add(buildExtrudedRibbon(roomFrames, [
        [wx, 1.35, 0], [inX, 1.40, 0.5], [inX, 1.50, 0.8], [wx, 1.55, 1]
      ], MAT.goldTrim, 6, flip, true));
      // Mezzanine belt-course cornice at y = balcH (5.6m)
      staticArch.add(buildExtrudedRibbon(roomFrames, [
        [wx, balcH - 0.25, 0], [inX, balcH - 0.12, 0.5], [inX, balcH + 0.10, 0.8], [wx, balcH + 0.16, 1]
      ], MAT.goldTrim, 6, flip, true));
      // Soaring upper crown cornice at y = wallH (12.0m)
      const cInX = side * (halfW - 0.32);
      staticArch.add(buildExtrudedRibbon(roomFrames, [
        [wx, wallH - 0.42, 0], [cInX, wallH - 0.18, 0.5], [cInX, wallH, 0.8], [wx, wallH, 1]
      ], MAT.darkWood, 6, flip, true));
    }

    // Colossal Coffered Gothic Vaulted Ceiling (spanning 26m width, apex at 15.6m!)
    const vaultProfile = [
      [-halfW, wallH, 0],
      [-halfW * 0.65, wallH + vaultApex * 0.68, 0.25],
      [0, wallH + vaultApex, 0.5],
      [halfW * 0.65, wallH + vaultApex * 0.68, 0.75],
      [halfW, wallH, 1.0]
    ];
    staticArch.add(buildExtrudedRibbon(roomFrames, vaultProfile, MAT.vaultCeiling, 7, false));

    // --- C. MONUMENTAL ENTRANCE & EXIT PORTAL WALLS (Framing the 7.6m Tunnel Openings) ---
    const entryOpenY = isAscending ? 0 : balcH;
    const exitOpenY = isAscending ? balcH : 0;
    const portalIn = makeGrandPortalWall(halfW, wallH, vaultApex, 3.8, entryOpenY, 5.2);
    placeAtFrame(roomFrames, 0.0, 0, 0, portalIn, 0);
    staticArch.add(portalIn);

    const portalOut = makeGrandPortalWall(halfW, wallH, vaultApex, 3.8, exitOpenY, 5.2);
    placeAtFrame(roomFrames, 1.0, 0, 0, portalOut, 0);
    staticArch.add(portalOut);

    // --- D. SWEEPING CRIMSON & GOLD ROYAL CARPET ON LOWER FLOOR & UPPER LANDING ---
    const carpetW = 2.05;
    const carpetProfile = [
      [-carpetW - 0.04, 0.004, 0.0],
      [-carpetW, 0.026, 0.02],
      [carpetW, 0.026, 0.98],
      [carpetW + 0.04, 0.004, 1.0]
    ];
    // Carpet along lower floor approach and upper landing
    const preStairFrames = pathFrames.filter(f => f.t <= stairT0 + 0.02);
    const postStairFrames = pathFrames.filter(f => f.t >= stairT1 - 0.02);
    if (preStairFrames.length >= 2) {
      staticArch.add(buildExtrudedRibbon(preStairFrames, carpetProfile, MAT.carpet, 3, true));
    }
    if (postStairFrames.length >= 2) {
      staticArch.add(buildExtrudedRibbon(postStairFrames, carpetProfile, MAT.carpet, 2, true));
    }

    // --- E. THE GRAND SWEEPING CARPETED STAIRCASE (40 Individual 3D Steps + Curved Balustrades!) ---
    const stairFrames = pathFrames.filter(f => f.t >= stairT0 && f.t <= stairT1);
    const stairHalfW = 2.8; // 5.6m wide grand imperial staircase!

    // 1. Molded Curved Staircase Carriage Soffit & Side Stringers
    const soffitProfile = [
      [-stairHalfW - 0.16, 0.12, 0.0],
      [-stairHalfW - 0.16, -0.55, 0.2],
      [0, -0.68, 0.5],
      [stairHalfW + 0.16, -0.55, 0.8],
      [stairHalfW + 0.16, 0.12, 1.0]
    ];
    staticArch.add(buildExtrudedRibbon(stairFrames, soffitProfile, MAT.darkWood, 4, false, true));

    // Gold Stringer Fascia Trim along both sides of the sweeping staircase
    for (const side of [-1, 1]) {
      const sx = side * (stairHalfW + 0.17);
      staticArch.add(buildExtrudedRibbon(stairFrames, [
        [sx, -0.38, 0], [sx, -0.22, 1]
      ], MAT.goldTrim, 4, side < 0, false));

      // Continuous Sweeping Curved Mahogany Handrail at y + 0.86m along both sides of the stairs
      const rX = side * stairHalfW;
      const railW = 0.095;
      staticArch.add(buildExtrudedRibbon(stairFrames, [
        [rX - railW, 0.82, 0.0],
        [rX - railW, 0.92, 0.3],
        [rX + railW, 0.92, 0.7],
        [rX + railW, 0.82, 1.0]
      ], MAT.darkWood, 5, true, true));
    }

    // 2. 40 Individual 3D Wooden Stair Treads, Bullnose Nosings, Crimson Carpet Treads & Brass Stair Rods!
    const numStairSteps = 40;
    for (let s = 0; s < numStairSteps; s++) {
      const st = lerp(stairT0, stairT1, (s + 0.5) / numStairSteps);
      const sf = sampleFrameAt(pathFrames, st);

      const stepGroup = new THREE.Group();
      stepGroup.position.set(sf.pos.x, sf.pos.y - 0.09, sf.pos.z);
      stepGroup.rotation.y = sf.yaw;

      const woodStep = new THREE.Mesh(STAIR_GEO.stepWood, MAT.darkWood);
      woodStep.castShadow = true;
      woodStep.receiveShadow = true;

      const carpetStep = new THREE.Mesh(STAIR_GEO.stepCarpet, MAT.carpet);
      carpetStep.position.y = 0.008;
      carpetStep.receiveShadow = true;

      // Bullnose front edge & brass stair rod on the step face facing the lower hall
      const noseDir = isAscending ? -1 : 1;
      const nosing = new THREE.Mesh(STAIR_GEO.stepNosing, MAT.darkWood);
      nosing.position.set(0, 0.08, noseDir * 0.31);
      const brassRod = new THREE.Mesh(STAIR_GEO.stepRod, MAT.goldTrim);
      brassRod.position.set(0, 0.105, -noseDir * 0.26);

      stepGroup.add(woodStep, carpetStep, nosing, brassRod);
      staticArch.add(stepGroup);

      // Lathe-turned Balusters on every step along both left and right stair stringers
      for (const side of [-1, 1]) {
        const bal = PROPS.makeBaluster();
        bal.position.set(
          sf.pos.x + sf.right.x * (side * stairHalfW),
          sf.pos.y,
          sf.pos.z + sf.right.z * (side * stairHalfW)
        );
        bal.rotation.y = sf.yaw;
        staticArch.add(bal);
      }
    }

    // Carved Baroque Newel Posts at Foot, Mid-Tier & Top of the Grand Staircase
    for (const nt of [stairT0, (stairT0 + stairT1) * 0.5, stairT1]) {
      for (const side of [-1, 1]) {
        const newel = PROPS.makeNewelPost();
        placeAtFrame(pathFrames, nt, side * stairHalfW, -0.05, newel, 0);
        staticArch.add(newel);
      }
    }

    // Supporting Corinthian Columns under the Grand Staircase & Upper Landing
    for (const ct of [lerp(stairT0, stairT1, 0.55), stairT1]) {
      const sf = sampleFrameAt(pathFrames, ct);
      const colH = sf.pos.y - hallFloorY - 0.35;
      if (colH > 1.8) {
        for (const side of [-1, 1]) {
          const underCol = PROPS.makeColumn(colH);
          placeAtFrame(roomFrames, ct, side * (stairHalfW - 0.35), 0, underCol, 0);
          staticArch.add(underCol);
        }
      }
    }

    // --- F. WRAP-AROUND UPPER MEZZANINE BALCONIES & COLONNADES (Left & Right Galleries at y = balcH) ---
    const balcInnerX = halfW - 4.4; // 4.4m-deep wrap-around upper mezzanine galleries on BOTH sides!
    for (const side of [-1, 1]) {
      const innerX = side * balcInnerX;
      const outerX = side * halfW;
      const flip = side > 0;

      // Molded Mezzanine Floor Slab & Fascia Beam
      staticArch.add(buildExtrudedRibbon(roomFrames, [
        [outerX, balcH - 0.34, 0.0],
        [innerX, balcH - 0.34, 0.35],
        [innerX - side * 0.08, balcH - 0.16, 0.5],
        [innerX, balcH, 0.65],
        [outerX, balcH, 1.0]
      ], MAT.darkWood, 7, flip, true));

      // Gold Fascia Trim along Mezzanine Edge
      staticArch.add(buildExtrudedRibbon(roomFrames, [
        [innerX - side * 0.09, balcH - 0.24, 0],
        [innerX - side * 0.09, balcH - 0.12, 1]
      ], MAT.goldTrim, 7, flip, false));

      // Continuous Mezzanine Handrail at y = balcH + 0.86
      const railW = 0.09;
      staticArch.add(buildExtrudedRibbon(roomFrames, [
        [innerX - railW, balcH + 0.82, 0.0],
        [innerX - railW, balcH + 0.92, 0.3],
        [innerX + railW, balcH + 0.92, 0.7],
        [innerX + railW, balcH + 0.82, 1.0]
      ], MAT.darkWood, 7, true, true));

      // 36 Lathe-Turned Balusters along each side's Upper Mezzanine Railing
      const numBalcBalusters = 36;
      for (let b = 0; b <= numBalcBalusters; b++) {
        const bt = b / numBalcBalusters;
        const bal = PROPS.makeBaluster();
        placeAtFrame(roomFrames, bt, innerX, balcH, bal, 0);
        staticArch.add(bal);
      }
    }

    // Upper Landing Bridge Platform connecting the top of the Grand Staircase to the Side Mezzanines & Portal
    const bridgeFrames = isAscending
      ? roomFrames.filter(f => f.t >= stairT1 - 0.02)
      : roomFrames.filter(f => f.t <= stairT0 + 0.02);
    if (bridgeFrames.length >= 2) {
      staticArch.add(buildExtrudedRibbon(bridgeFrames, [
        [-balcInnerX, balcH - 0.34, 0.0],
        [balcInnerX, balcH - 0.34, 0.4],
        [balcInnerX, balcH, 0.6],
        [-balcInnerX, balcH, 1.0]
      ], MAT.darkWood, 2, true, true));
    }

    // --- G. DOUBLE-TIER COLOSSAL CORINTHIAN COLONNADE, VAULT RIBS & 3 GRAND CHANDELIERS ---
    const numBays = 4;
    for (let b = 0; b < numBays; b++) {
      const tBay = (b + 0.5) / numBays;

      // Massive Transverse Curved Vault Rib Arch spanning all 26m across the 15.6m ceiling!
      const vaultRib = makeVaultArchRib(halfW, wallH, vaultApex);
      placeAtFrame(roomFrames, tBay, 0, 0, vaultRib, 0);
      staticArch.add(vaultRib);

      for (const side of [-1, 1]) {
        // Lower-tier Corinthian Column supporting the Mezzanine Balcony (height = balcH)
        const colLower = PROPS.makeColumn(balcH - 0.15);
        placeAtFrame(roomFrames, tBay, side * balcInnerX, 0, colLower, 0);
        staticArch.add(colLower);

        // Upper-tier Corinthian Column rising from Mezzanine Balcony to Vault Cornice (height = wallH - balcH)
        const colUpper = PROPS.makeColumn(wallH - balcH);
        placeAtFrame(roomFrames, tBay, side * balcInnerX, balcH, colUpper, 0);
        staticArch.add(colUpper);

        // Wall Sconces on Lower Colonnade Pillars & Upper Mezzanine Walls
        const sconceLow = PROPS.makeWallSconce();
        placeAtFrame(roomFrames, tBay, side * (balcInnerX - 0.42), 2.55, sconceLow, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
        staticArch.add(sconceLow);

        const sconceHigh = PROPS.makeWallSconce();
        placeAtFrame(roomFrames, tBay, side * (halfW - 0.45), balcH + 2.45, sconceHigh, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
        staticArch.add(sconceHigh);

        registerLightAnchor({
          pos: frameWorldPos(roomFrames, tBay, side * (balcInnerX - 1.1), 2.8, 0),
          color: 0xff8624,
          intensity: 1.95,
          distance: 11.5,
          flickerSpeed: rr(6, 8.5),
          flickerAmp: 0.20,
          priority: 1.3,
          tag
        });
      }

      // 3 Colossal Multi-Tiered Brass Chandeliers hanging from the 15.6m Vault Apex!
      if (b <= 2) {
        const chand = PROPS.makeChandelier();
        chand.scale.setScalar(1.65);
        placeAtFrame(roomFrames, (b + 0.5) / 3, 0, wallH + vaultApex - 0.15, chand, 0);
        staticArch.add(chand);

        registerLightAnchor({
          pos: frameWorldPos(roomFrames, (b + 0.5) / 3, 0, wallH - 0.6, 0),
          color: 0xff9a3c,
          intensity: 3.45,
          distance: 22.0,
          flickerSpeed: 5.8,
          flickerAmp: 0.16,
          priority: 2.2,
          tag
        });
      }
    }

    // --- H. TOWERING 6-METER MOONLIT GOTHIC ARCHED WINDOWS HIGH ON THE MEZZANINE WALLS (COLD VS WARM CONTRAST!) ---
    for (const wt of [0.28, 0.68]) {
      for (const side of [-1, 1]) {
        const gWin = PROPS.makeGothicWindow();
        gWin.scale.setScalar(1.75); // Towering 6.6m tall cathedral windows like the concept art!
        const winYaw = side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        placeAtFrame(roomFrames, wt, side * (halfW - 0.34), balcH + 3.05, gWin, winYaw);
        staticArch.add(gWin);

        // Modern Volumetric Moonbeam God-Ray Shafts streaming into the grand hall
        if (PROPS.createVolumetricMoonbeam && registerVolumetricBeam) {
          const beam = PROPS.createVolumetricMoonbeam(1.75);
          placeAtFrame(roomFrames, wt, side * (halfW - 0.34), balcH + 3.05, beam, winYaw);
          registerVolumetricBeam(beam, tag);
        }

        // High cold silver-blue moonlight streaming through the Gothic tracery
        registerLightAnchor({
          pos: frameWorldPos(roomFrames, wt, side * (halfW - 2.6), balcH + 2.8, 0),
          color: 0x58a8ff,
          intensity: 3.35,
          distance: 21.0,
          flickerSpeed: 1.4,
          flickerAmp: 0.05,
          priority: 2.15,
          tag
        });

        // Cold cyan-indigo moonbeam pool striking the side gallery floor & columns below
        registerLightAnchor({
          pos: frameWorldPos(roomFrames, wt, side * (balcInnerX - 0.8), 2.2, 0),
          color: 0x4892f0,
          intensity: 2.25,
          distance: 14.0,
          flickerSpeed: 1.6,
          flickerAmp: 0.06,
          priority: 1.65,
          tag
        });
      }
    }

    // --- I. ICONIC CONCEPT-ART FOREGROUND & MIDGROUND SET PIECES ---
    const footT = isAscending ? (stairT0 - 0.04) : (stairT1 + 0.04);
    const yawFlip = isAscending ? 0 : Math.PI;

    // 1. Left Foreground near Carpet & Stair Foot: Victorian Armchair + Seated Skeleton + Parlor Table + Candelabras!
    const chairSetMain = PROPS.makeVictorianArmchairSet();
    chairSetMain.scale.setScalar(1.24);
    placeAtFrame(roomFrames, footT - 0.06, -3.55, 0, chairSetMain, 0.46 + yawFlip);
    staticArch.add(chairSetMain);

    const seatedSkelMain = ENTITIES.createSkeletonActor(true);
    seatedSkelMain.scale.setScalar(1.24);
    placeAtFrame(roomFrames, footT - 0.06, -3.55, 0, seatedSkelMain, 0.46 + yawFlip);
    group.add(seatedSkelMain);
    actors.push(seatedSkelMain);

    const candLeft = PROPS.makeFloorCandelabra();
    candLeft.scale.setScalar(1.15);
    placeAtFrame(roomFrames, footT, -3.35, 0, candLeft, 0);
    staticArch.add(candLeft);

    registerLightAnchor({
      pos: frameWorldPos(roomFrames, footT - 0.01, -2.45, 2.05, 0),
      color: 0xff8422,
      intensity: 1.25,
      distance: 9.5,
      flickerSpeed: 7.5,
      flickerAmp: 0.22,
      priority: 2.0,
      tag
    });

    // 2. Right Foreground at the Foot of the Grand Staircase: Perched Raven on Newel Post, Suit of Armor & Candelabra!
    const raven = ENTITIES.createRavenActor();
    placeAtFrame(pathFrames, stairT0, stairHalfW, 1.20, raven, -0.65);
    group.add(raven);
    actors.push(raven);

    const candRight = PROPS.makeFloorCandelabra();
    candRight.scale.setScalar(1.15);
    placeAtFrame(roomFrames, footT + 0.02, 3.55, 0, candRight, 0);
    staticArch.add(candRight);

    const armorRight = ENTITIES.createArmorActor();
    armorRight.scale.setScalar(1.15);
    placeAtFrame(roomFrames, footT + 0.06, 4.15, 0, armorRight, -Math.PI * 0.42);
    group.add(armorRight);
    actors.push(armorRight);

    registerLightAnchor({
      pos: frameWorldPos(roomFrames, footT + 0.02, 2.65, 2.05, 0),
      color: 0xff8a26,
      intensity: 1.35,
      distance: 9.8,
      flickerSpeed: 7.2,
      flickerAmp: 0.20,
      priority: 2.0,
      tag
    });

    // 3. Glowing Jack-o'-Lanterns & Candelabras perched directly on the Grand Staircase Steps!
    for (const stFrac of [0.15, 0.45, 0.78]) {
      const st = lerp(stairT0, stairT1, stFrac);
      const side = (stFrac === 0.45) ? -1 : 1;
      const stepPumpkin = PROPS.makeJackOLantern(1.12);
      placeAtFrame(pathFrames, st, side * (stairHalfW - 0.52), 0.02, stepPumpkin, -side * 0.5);
      staticArch.add(stepPumpkin);

      registerLightAnchor({
        pos: frameWorldPos(pathFrames, st, side * (stairHalfW - 0.52), 0.35, 0),
        color: 0xff6e18,
        intensity: 1.55,
        distance: 6.2,
        flickerSpeed: 8.5,
        flickerAmp: 0.25,
        priority: 1.5,
        tag
      });
    }

    // Mid-staircase Candelabra illumination so the entire 40-step climb glows warmly
    const midStairT = (stairT0 + stairT1) * 0.5;
    const midCandL = PROPS.makeFloorCandelabra();
    placeAtFrame(pathFrames, midStairT, -(stairHalfW + 0.55), 0, midCandL, 0);
    staticArch.add(midCandL);
    const midCandR = PROPS.makeFloorCandelabra();
    placeAtFrame(pathFrames, midStairT, stairHalfW + 0.55, 0, midCandR, 0);
    staticArch.add(midCandR);

    for (const side of [-1, 1]) {
      registerLightAnchor({
        pos: frameWorldPos(pathFrames, midStairT, side * (stairHalfW + 0.45), 1.95, 0),
        color: 0xff8828,
        intensity: 2.25,
        distance: 10.5,
        flickerSpeed: 6.8,
        flickerAmp: 0.20,
        priority: 1.9,
        tag
      });
    }

    // 4. Giant Multi-Tiered Baroque Haunted Portraits along the Left & Right Colonnades and Perimeter Walls
    let pCounter = segIndex * 7;
    for (const pt of [0.16, 0.42, 0.64, 0.86]) {
      for (const side of [-1, 1]) {
        // Lower gallery giant portrait on outer wall
        const pLow = PROPS.makeHauntedPortrait(pCounter++, 1.65);
        placeAtFrame(roomFrames, pt, side * (halfW - 0.30), 2.85, pLow, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
        group.add(pLow);
        portraits.push(pLow);

        // Upper mezzanine portrait on outer wall (between the Gothic windows)
        if (Math.abs(pt - 0.28) > 0.10 && Math.abs(pt - 0.68) > 0.10) {
          const pHigh = PROPS.makeHauntedPortrait(pCounter++, 1.45);
          placeAtFrame(roomFrames, pt, side * (halfW - 0.30), balcH + 2.65, pHigh, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
          group.add(pHigh);
          portraits.push(pHigh);
        }
      }
    }

    // Additional Parlor Vignettes & Candelabras in the Deep Side Galleries under the Mezzanines
    for (const side of [-1, 1]) {
      const sideSet = PROPS.makeVictorianArmchairSet();
      sideSet.scale.setScalar(1.20);
      placeAtFrame(roomFrames, 0.52, side * (halfW - 2.2), 0, sideSet, side < 0 ? 0.85 : -0.85);
      staticArch.add(sideSet);

      const upperCand = PROPS.makeFloorCandelabra();
      placeAtFrame(roomFrames, 0.48, side * (balcInnerX + 0.75), balcH, upperCand, 0);
      staticArch.add(upperCand);

      registerLightAnchor({
        pos: frameWorldPos(roomFrames, 0.48, side * (balcInnerX + 0.75), balcH + 1.95, 0),
        color: 0xff8624,
        intensity: 1.95,
        distance: 9.8,
        flickerSpeed: 7.1,
        flickerAmp: 0.20,
        priority: 1.4,
        tag
      });
    }

    // Scatter HollowMoorManor-style fallen autumn leaf clusters & weathered stone slabs along the side galleries
    // --- J. HALLOWEEN DRESSING: candle pools, pumpkin patches, skull tables, bone heaps, cobwebs & velvet drapes ---
    {
      if (isAscending) {
        // Carefully staged forecourt props (t = 0.11..0.28) that frame the carpet & armchair without overlapping
        const fore = [
          [0.115, -1, 'pumpkins', 2.75], [0.115, 1, 'pumpkins', 2.85],
          [0.140, -1, 'candles',  2.55], [0.145, 1, 'table',    3.85],
          [0.165, -1, 'bones',    3.15], [0.175, 1, 'pumpkins', 2.95],
          [0.190, 1,  'candles',  2.50], [0.210, 1, 'bones',    3.40],
          [0.235, 1,  'pumpkins', 2.85], [0.245, 1, 'table',    5.15],
          [0.150, -1, 'candelabra', 5.40], [0.195, 1, 'candelabra', 5.40],
          [0.255, -1, 'pumpkins', 5.20], [0.265, -1, 'candles', 2.30]
        ];
        for (const [t, side, kind, lat] of fore) {
          dress(roomFrames, t, side * lat, 0, kind, rr(-0.6, 0.6), staticArch, tag);
        }
      } else {
        const lowZone = [stairT1 + 0.10, 0.94];
        const kinds = ['candelabra', 'pumpkins', 'table', 'candles', 'bones', 'pumpkins', 'candelabra', 'table', 'pumpkins', 'bones'];
        const lats  = [3.2, 2.8, 4.4, 2.5, 3.4, 2.9, 5.0, 4.2, 2.8, 3.6];
        for (let i = 0; i < kinds.length; i++) {
          const t = lerp(lowZone[0], lowZone[1], (i + 0.5) / kinds.length);
          const side = (i % 2 === 0) ? -1 : 1;
          dress(roomFrames, t, side * lats[i], 0, kinds[i], rr(-0.6, 0.6), staticArch, tag);
        }
      }

      // Landing beyond the staircase (path frames carry the correct elevation)
      const landZone = isAscending ? [stairT1 + 0.05, 0.94] : [0.06, stairT0 - 0.05];
      const landKinds = ['candelabra', 'pumpkins', 'candles', 'skull', 'pumpkins', 'candelabra'];
      for (let i = 0; i < landKinds.length; i++) {
        const t = lerp(landZone[0], landZone[1], (i + 0.5) / landKinds.length);
        const side = (i % 2 === 0) ? 1 : -1;
        dress(pathFrames, t, side * 2.55, 0, landKinds[i], rr(-0.8, 0.8), staticArch, tag);
      }

      // Candles, skulls and cobwebs dressing the grand staircase and its balustrades
      const stairDress = [[0.30, -1, 'candles'], [0.62, 1, 'candles'], [0.92, -1, 'candles'], [0.08, -1, 'skull'], [0.55, -1, 'skull'], [0.86, 1, 'skull'], [0.70, -1, 'pumpkins']];
      for (const [fr, side, kind] of stairDress) {
        const st = lerp(stairT0, stairT1, fr);
        dress(pathFrames, st, side * (stairHalfW - 0.38), 0.02, kind, rr(-0.6, 0.6), staticArch, tag, kind === 'pumpkins' ? 0.8 : 1.0);
      }
      for (const fr of [0.10, 0.28, 0.46, 0.64, 0.82]) {
        for (const side of [-1, 1]) {
          const st = lerp(stairT0, stairT1, fr);
          const web = dress(pathFrames, st, side * (stairHalfW - 0.02), 0.28, 'web', side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, staticArch, tag, 1.25);
          if (web && fr > 0.4) web.scale.x = -1;
        }
      }

      // High corner cobwebs draped along both long walls
      for (let k = 0; k < 8; k++) {
        const t = 0.07 + k * 0.12;
        for (const side of [-1, 1]) {
          const web = dress(roomFrames, t, side * (halfW - 0.2), wallH - 0.1, 'web', side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, staticArch, tag, 3.2);
          if (web) { web.scale.y = -1; if ((k + (side > 0 ? 1 : 0)) % 2) web.scale.x = -1; }
        }
      }

      // Crimson velvet drapes on the lower perimeter wall between the portraits
      for (const ct of [0.29, 0.53, 0.75]) {
        for (const side of [-1, 1]) {
          const cur = PROPS.makeCurtain(5.0, 1.7);
          placeAtFrame(roomFrames, ct, side * (halfW - 0.34), 0, cur, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
          staticArch.add(cur);
        }
      }

      // Monumental Foreground Left-Wall Portrait behind the Seated Skeleton (matching the giant gilded Lady Portrait in the concept art!)
      {
        const heroP = PROPS.makeHauntedPortrait(0, 2.75);
        placeAtFrame(roomFrames, isAscending ? 0.105 : 0.895, -4.95, 3.25, heroP, Math.PI * 0.46);
        group.add(heroP);
        portraits.push(heroP);
      }

      // Giant Concept-Art Foreground Portraits mounted along the inner colonnade bays (angled slightly toward the viewer like the concept art!)
      for (const ptCol of [0.17, 0.40, 0.63]) {
        for (const side of [-1, 1]) {
          const pYaw = side < 0 ? (Math.PI * 0.38) : (-Math.PI * 0.38);
          const pCol = PROPS.makeHauntedPortrait(pCounter++, 1.95);
          placeAtFrame(roomFrames, ptCol, side * (balcInnerX - 0.55), 2.70, pCol, pYaw);
          group.add(pCol);
          portraits.push(pCol);

          // Ornate Baroque Console Table with Jack-o'-Lantern, Skull & Candles directly beneath each colonnade portrait
          dress(roomFrames, ptCol, side * (balcInnerX - 0.85), 0, 'console', pYaw, staticArch, tag);
        }
      }

      // Upper Mezzanine Balustrade Halloween Dressing: Jack-o'-Lanterns, Candelabras & Cobwebs along the balcony rails!
      for (const mt of [0.18, 0.34, 0.52, 0.68, 0.82]) {
        for (const side of [-1, 1]) {
          const mKind = (Math.round(mt * 100) % 2 === 0) ? 'pumpkins' : 'candles';
          dress(roomFrames, mt, side * (balcInnerX + 0.45), balcH, mKind, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, staticArch, tag, 0.9);
          const mWeb = dress(roomFrames, mt + 0.03, side * balcInnerX, balcH + 0.05, 'web', 0, staticArch, tag, 1.35);
          if (mWeb && side > 0) mWeb.scale.x = -1;
        }
      }

      // Silhouetted Vampire Bats swooping & hanging under the Vault Arches and Chandeliers (like the top of the concept art!)
      for (const btArch of [0.14, 0.26, 0.38, 0.52, 0.66, 0.80]) {
        for (const side of [-1, 0, 1]) {
          const bScale = side === 0 ? 1.55 : 1.25;
          const bY = side === 0 ? (wallH + 0.35) : (balcH + 4.4);
          const bLat = side * (balcInnerX - 1.8) + rr(-0.8, 0.8);
          dress(roomFrames, btArch + rr(-0.02, 0.02), bLat, bY, 'bats', rr(-0.5, 0.5), staticArch, tag, bScale);
        }
      }
    }

    scatterFloorWeathering(roomFrames, 3.6, halfW - 1.2, 18, staticArch);

    // Merge all static hall architecture, steps, balusters & static furniture into ~12 draw calls!
    mergeStaticGroup(staticArch, false);
    group.add(staticArch);

    // 5. Spectral Ghosts (1 by the Left Colonnade/Stair Foot like the concept art, 1 on the Staircase, 2 on the Upper Mezzanine Balconies!)
    const hallGhost = ENTITIES.createGhostActor('corridor_lunge', tag);
    const ghostT = lerp(stairT0, stairT1, 0.36);
    placeAtFrame(pathFrames, ghostT, -1.85, 0.15, hallGhost, 0.3);
    group.add(hallGhost);
    actors.push(hallGhost);

    const floorGhost = ENTITIES.createGhostActor('balcony_watcher', tag);
    const floorGhostT = isAscending ? (stairT0 + 0.05) : (stairT1 - 0.05);
    placeAtFrame(roomFrames, floorGhostT, -3.95, 0.12, floorGhost, 0.35);
    group.add(floorGhost);
    actors.push(floorGhost);

    // Eerie cold ectoplasmic cyan light around the staircase apparition
    registerLightAnchor({
      pos: frameWorldPos(pathFrames, ghostT, -1.85, 1.45, 0),
      color: 0x38d8ff,
      intensity: 1.95,
      distance: 10.5,
      flickerSpeed: 4.2,
      flickerAmp: 0.18,
      priority: 1.75,
      tag
    });

    for (const side of [-1, 1]) {
      const balcGhost = ENTITIES.createGhostActor('balcony_watcher', tag);
      const bGhostT = side < 0 ? 0.38 : 0.62;
      placeAtFrame(roomFrames, bGhostT, side * (balcInnerX + 0.65), balcH + 0.10, balcGhost, 0);
      group.add(balcGhost);
      actors.push(balcGhost);

      // Spectral violet-indigo accent glow on the upper mezzanine gallery
      registerLightAnchor({
        pos: frameWorldPos(roomFrames, bGhostT, side * (balcInnerX + 0.65), balcH + 1.5, 0),
        color: side < 0 ? 0x6a5cff : 0x3ad0f8,
        intensity: 1.75,
        distance: 10.0,
        flickerSpeed: 3.6,
        flickerAmp: 0.15,
        priority: 1.5,
        tag
      });
    }

    // 6. Vampire Bat Swarms wheeling across the Chandeliers & Upper Vault
    for (const bt of [0.16, 0.34, 0.54, 0.76]) {
      const batSwarm = ENTITIES.createBatSwarmActor(12);
      placeAtFrame(roomFrames, bt, 0, balcH + 3.6, batSwarm, 0);
      group.add(batSwarm);
      actors.push(batSwarm);
    }

    return { segLen, frames: pathFrames };
  }

  // ============================================================================
  // CONNECTING TUNNEL BUILDER (Catacomb Stone Tunnel & Moonlit Cloister Tunnel)
  // ============================================================================
  function buildConnectingTunnel(segIndex, theme, tag, group, actors, portraits) {
    const isCatacomb = (theme === 'CATACOMB_TUNNEL');
    const segLen = 20.0;
    const stepsCount = 36;
    const halfW = 3.8;
    const wallH = 5.2;
    const vaultApex = 1.45;
    const wallMat = isCatacomb ? MAT.stoneWall : MAT.woodPanel;

    const turnDir = (segIndex % 2 === 0) ? 1 : -1;
    const turnAngle = turnDir * rr(0.24, 0.38);

    const startPos = cursorPos.clone();
    const startYaw = cursorYaw;
    const frames = computeSegmentFrames(startPos, startYaw, segLen, turnAngle, () => 0, stepsCount);
    const endFrame = frames[frames.length - 1];
    cursorPos.copy(endFrame.pos);
    cursorYaw = endFrame.yaw;

    const staticArch = new THREE.Group();

    // 1. Curved Checkered Marble Floor + Royal Carpet Runner
    staticArch.add(buildExtrudedRibbon(frames, [[-halfW, 0, 0], [halfW, 0, 2]], MAT.marbleFloor, 5, true));

    const carpetW = 1.72;
    staticArch.add(buildExtrudedRibbon(frames, [
      [-carpetW - 0.03, 0.002, 0.0],
      [-carpetW, 0.022, 0.02],
      [carpetW, 0.022, 0.98],
      [carpetW + 0.03, 0.002, 1.0]
    ], MAT.carpet, 5, true));

    // 2. Left & Right Tunnel Walls + Moldings
    staticArch.add(buildExtrudedRibbon(frames, [[-halfW, 0, 0], [-halfW, wallH, 1]], wallMat, 6, false));
    staticArch.add(buildExtrudedRibbon(frames, [[halfW, wallH, 0], [halfW, 0, 1]], wallMat, 6, false));

    for (const side of [-1, 1]) {
      const wx = side * halfW;
      const inX = side * (halfW - 0.09);
      const flip = side > 0;
      staticArch.add(buildExtrudedRibbon(frames, [
        [wx, 0, 0], [inX, 0, 0.2], [inX, 0.28, 0.8], [wx, 0.32, 1]
      ], MAT.darkWood, 4, flip, true));
      staticArch.add(buildExtrudedRibbon(frames, [
        [wx, 1.10, 0], [inX, 1.13, 0.4], [inX, 1.20, 0.7], [wx, 1.23, 1]
      ], MAT.goldTrim, 4, flip, true));
      const cInX = side * (halfW - 0.16);
      staticArch.add(buildExtrudedRibbon(frames, [
        [wx, wallH - 0.22, 0], [cInX, wallH - 0.12, 0.5], [cInX, wallH, 0.8], [wx, wallH, 1]
      ], MAT.darkWood, 4, flip, true));
    }

    // 3. Vaulted Tunnel Ceiling & Rib Arches
    staticArch.add(buildExtrudedRibbon(frames, [
      [-halfW, wallH, 0],
      [-halfW * 0.65, wallH + 0.98, 0.2],
      [0, wallH + vaultApex, 0.5],
      [halfW * 0.65, wallH + 0.98, 0.8],
      [halfW, wallH, 1.0]
    ], isCatacomb ? MAT.stoneWall : MAT.vaultCeiling, 4, false));

    const numBays = 3;
    for (let b = 0; b < numBays; b++) {
      const tBay = (b + 0.5) / numBays;
      const vaultRib = makeVaultArchRib(halfW, wallH, vaultApex);
      placeAtFrame(frames, tBay, 0, 0, vaultRib, 0);
      staticArch.add(vaultRib);

      for (const side of [-1, 1]) {
        const col = PROPS.makeColumn(wallH);
        placeAtFrame(frames, tBay, side * (halfW - 0.30), 0, col, 0);
        staticArch.add(col);

        const sconce = PROPS.makeWallSconce();
        placeAtFrame(frames, tBay, side * (halfW - 0.55), 2.35, sconce, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
        staticArch.add(sconce);

        registerLightAnchor({
          pos: frameWorldPos(frames, tBay, side * (halfW - 0.95), 2.55, 0),
          color: 0xff8222,
          intensity: 1.55,
          distance: 7.5,
          flickerSpeed: rr(6, 9),
          flickerAmp: 0.22,
          priority: 1.2,
          tag
        });
      }

      if (b === 1) {
        const chand = PROPS.makeChandelier();
        placeAtFrame(frames, tBay, 0, wallH + vaultApex - 0.12, chand, 0);
        staticArch.add(chand);

        registerLightAnchor({
          pos: frameWorldPos(frames, tBay, 0, wallH - 0.85, 0),
          color: 0xff9232,
          intensity: 2.15,
          distance: 11.5,
          flickerSpeed: 6.2,
          flickerAmp: 0.16,
          priority: 1.6,
          tag
        });
      }
    }

    // 4. Tunnel Props & Scare Actors
    if (isCatacomb) {
      for (const tSkel of [0.32, 0.72]) {
        const side = tSkel < 0.5 ? -1 : 1;
        const ambushSkel = ENTITIES.createSkeletonActor(false);
        placeAtFrame(frames, tSkel, side * (halfW - 1.15), 0, ambushSkel, side < 0 ? 0.6 : -0.6);
        group.add(ambushSkel);
        actors.push(ambushSkel);
      }

      const cand = PROPS.makeFloorCandelabra();
      placeAtFrame(frames, 0.50, -(halfW - 1.05), 0, cand, 0);
      staticArch.add(cand);

      registerLightAnchor({
        pos: frameWorldPos(frames, 0.50, -(halfW - 1.25), 1.95, 0),
        color: 0xff8624,
        intensity: 2.25,
        distance: 9.5,
        flickerSpeed: 7.4,
        flickerAmp: 0.22,
        priority: 1.8,
        tag
      });

      const tunnelGhost = ENTITIES.createGhostActor('corridor_lunge', tag);
      placeAtFrame(frames, 0.60, halfW - 1.25, 0.1, tunnelGhost, -0.4);
      group.add(tunnelGhost);
      actors.push(tunnelGhost);

      // Cold spectral cyan-violet crypt lights contrasting against the warm candelabra & sconces
      registerLightAnchor({
        pos: frameWorldPos(frames, 0.28, -(halfW - 1.1), 1.65, 0),
        color: 0x4c78ff,
        intensity: 1.85,
        distance: 9.5,
        flickerSpeed: 3.4,
        flickerAmp: 0.14,
        priority: 1.65,
        tag
      });
      registerLightAnchor({
        pos: frameWorldPos(frames, 0.64, halfW - 1.15, 1.55, 0),
        color: 0x38d8ff,
        intensity: 2.10,
        distance: 10.0,
        flickerSpeed: 4.5,
        flickerAmp: 0.18,
        priority: 1.85,
        tag
      });
    } else {
      for (const side of [-1, 1]) {
        const winT = side < 0 ? 0.34 : 0.68;
        const gWin = PROPS.makeGothicWindow();
        const winYaw = side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        placeAtFrame(frames, winT, side * (halfW - 0.28), 2.45, gWin, winYaw);
        staticArch.add(gWin);

        // Modern Volumetric Moonbeam God-Ray Shafts in cloister tunnel
        if (PROPS.createVolumetricMoonbeam && registerVolumetricBeam) {
          const beam = PROPS.createVolumetricMoonbeam(1.0);
          placeAtFrame(frames, winT, side * (halfW - 0.28), 2.45, beam, winYaw);
          registerVolumetricBeam(beam, tag);
        }

        // Crisp cold silver-blue moonlight pouring from the Gothic cloister windows onto the marble & fog
        registerLightAnchor({
          pos: frameWorldPos(frames, winT, side * (halfW - 1.25), 2.25, 0),
          color: 0x58a8ff,
          intensity: 2.65,
          distance: 13.5,
          flickerSpeed: 1.5,
          flickerAmp: 0.05,
          priority: 1.85,
          tag
        });
      }

      const scare1 = ENTITIES.createScarecrowActor();
      placeAtFrame(frames, 0.42, -(halfW - 1.35), 0, scare1, 0.45);
      group.add(scare1);
      actors.push(scare1);

      const scare2 = ENTITIES.createScarecrowActor();
      placeAtFrame(frames, 0.76, halfW - 1.35, 0, scare2, -0.45);
      group.add(scare2);
      actors.push(scare2);

      for (let p = 0; p < 3; p++) {
        const pt = 0.36 + p * 0.18;
        const pLat = (p % 2 === 0 ? -1 : 1) * (halfW - 1.50);
        const jack = PROPS.makeJackOLantern(rr(0.85, 1.15));
        placeAtFrame(frames, pt, pLat, 0, jack, rr(-0.6, 0.6));
        staticArch.add(jack);

        registerLightAnchor({
          pos: frameWorldPos(frames, pt, pLat, 0.35, 0),
          color: 0xff6e18,
          intensity: 1.65,
          distance: 6.2,
          flickerSpeed: 8.8,
          flickerAmp: 0.25,
          priority: 1.55,
          tag
        });
      }
    }

    // Scatter weathered stone slabs & wind-blown autumn leaves along tunnel borders
    // Halloween dressing along the tunnel: candle pools, pumpkin patches, skull tables, bone heaps & cobwebs
    {
      const spec = isCatacomb
        ? [[0.08, -1, 'bones'], [0.18, 1, 'candles'], [0.27, -1, 'candles'], [0.47, 1, 'table'], [0.56, -1, 'bones'], [0.66, 1, 'candles'], [0.88, -1, 'candles'], [0.93, 1, 'bones'], [0.14, -1, 'pumpkins'], [0.82, 1, 'pumpkins'], [0.38, -1, 'table']]
        : [[0.08, -1, 'pumpkins'], [0.16, 1, 'candles'], [0.27, 1, 'pumpkins'], [0.50, 1, 'table'], [0.58, -1, 'pumpkins'], [0.66, -1, 'candles'], [0.86, 1, 'pumpkins'], [0.92, -1, 'table'], [0.34, -1, 'candles'], [0.82, -1, 'bones']];
      for (const [t, side, kind] of spec) {
        dress(frames, t, side * 2.3, 0, kind, rr(-0.8, 0.8), staticArch, tag);
      }
      for (let k = 0; k < 6; k++) {
        const t = 0.06 + k * 0.17;
        for (const side of [-1, 1]) {
          const web = dress(frames, t, side * (halfW - 0.12), wallH - 0.08, 'web', side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, staticArch, tag, 2.3);
          if (web) { web.scale.y = -1; if ((k + (side > 0 ? 1 : 0)) % 2) web.scale.x = -1; }
        }
      }
    }

    scatterFloorWeathering(frames, 1.85, halfW - 0.55, 10, staticArch);

    mergeStaticGroup(staticArch, false);
    group.add(staticArch);

    return { segLen, frames };
  }

  function createSegment(segIndex) {
    const tag = `seg_${segIndex}`;
    const group = new THREE.Group();
    const theme = THEMES[segIndex % THEMES.length];
    const actors = [];
    const portraits = [];

    const sStart = cursorS;
    let built;
    if (theme === 'GRAND_GALLERY' || theme === 'STAIRCASE_HALL') {
      built = buildColossalStaircaseHall(segIndex, theme, tag, group, actors, portraits);
    } else {
      built = buildConnectingTunnel(segIndex, theme, tag, group, actors, portraits);
    }
    const sEnd = sStart + built.segLen;
    cursorS = sEnd;

    scene.add(group);

    const seg = {
      index: segIndex,
      tag,
      theme,
      group,
      frames: built.frames,
      len: built.segLen,
      actors,
      portraits,
      sStart,
      sEnd
    };
    activeSegments.push(seg);
    return seg;
  }

  function destroySegment(seg) {
    removeLightAnchorsByTag(seg.tag);
    if (removeVolumetricBeamsByTag) removeVolumetricBeamsByTag(seg.tag);
    scene.remove(seg.group);
    seg.group.traverse(obj => {
      if (obj.geometry && !obj.geometry._shared) {
        if (obj.geometry.attributes && obj.geometry.index && obj.geometry.type === 'BufferGeometry') {
          obj.geometry.dispose();
        }
      }
    });
  }

  const _tmpWorldPos = new THREE.Vector3();

  function updateWorldStream(currentDistanceS, time, dt, camPos, onScareTrigger) {
    while (activeSegments.length === 0 || activeSegments[activeSegments.length - 1].sEnd < currentDistanceS + 72.0) {
      createSegment(nextSegIndex++);
    }

    while (activeSegments.length > 1 && activeSegments[0].sEnd < currentDistanceS - 28.0) {
      const old = activeSegments.shift();
      destroySegment(old);
    }

    for (let i = 0; i < activeSegments.length; i++) {
      const seg = activeSegments[i];
      for (let j = 0; j < seg.actors.length; j++) {
        const actor = seg.actors[j];
        if (actor.userData.update) {
          actor.userData.update(time, dt, camPos, onScareTrigger);
        }
      }
      for (let j = 0; j < seg.portraits.length; j++) {
        const p = seg.portraits[j];
        p.getWorldPosition(_tmpWorldPos);
        const d = _tmpWorldPos.distanceTo(camPos);
        if (p.userData.eyeMat) {
          p.userData.eyeMat.opacity = d < 9.0 ? clamp((9.0 - d) / 4.5, 0, 0.65) : 0.0;
        }
      }
    }
  }

  function samplePath(s) {
    let seg = activeSegments.find(g => s >= g.sStart && s <= g.sEnd);
    if (!seg && activeSegments.length > 0) {
      seg = s < activeSegments[0].sStart ? activeSegments[0] : activeSegments[activeSegments.length - 1];
    }
    if (!seg) {
      return {
        pos: new THREE.Vector3(0, 0, 0),
        forward: new THREE.Vector3(0, 0, -1),
        right: new THREE.Vector3(1, 0, 0),
        yaw: 0,
        theme: 'GRAND_GALLERY'
      };
    }

    const localT = clamp((s - seg.sStart) / seg.len, 0, 1);
    const sampled = sampleFrameAt(seg.frames, localT);
    return {
      pos: sampled.pos,
      forward: sampled.forward,
      right: sampled.right,
      yaw: sampled.yaw,
      theme: seg.theme,
      seg
    };
  }

  function triggerNearestScare(camPos, onScareTrigger) {
    let bestActor = null;
    let bestDist = 999;
    const wp = new THREE.Vector3();
    for (const seg of activeSegments) {
      for (const actor of seg.actors) {
        if (actor.userData.triggerScareNow) {
          actor.getWorldPosition(wp);
          const d = wp.distanceTo(camPos);
          if (d < bestDist && d < 24) {
            bestDist = d;
            bestActor = actor;
          }
        }
      }
    }
    if (bestActor) {
      bestActor.userData.triggerScareNow(camPos, onScareTrigger);
      return true;
    }
    return false;
  }

  function banishNearbyGhosts(camPos) {
    let count = 0;
    const wp = new THREE.Vector3();
    for (const seg of activeSegments) {
      for (const actor of seg.actors) {
        if (actor.userData.banish) {
          actor.getWorldPosition(wp);
          if (wp.distanceTo(camPos) < 18.0) {
            actor.userData.banish();
            count++;
          }
        }
      }
    }
    return count;
  }

  window.HH.WORLD = {
    SEG_LEN,
    activeSegments,
    updateWorldStream,
    samplePath,
    triggerNearestScare,
    banishNearbyGhosts
  };
})();
