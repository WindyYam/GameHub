/**
 * Futuristic Hubless-Wheel Cyber-Expedition Motorcycle & Zero-Stutter Ground-to-Top 3D Laser Printer.
 * Features:
 * - Sculpted aerodynamic matte-graphite monocoque bodywork built via Bézier-curved beveled extrusions
 *   with 3D fuselage cross-section tapering (shark nose fairing, smoked canopy windscreen, arched tank dome,
 *   low ergonomic saddle, floating cantilevered tail, recessed mid-body power core with curved cyan LED trim,
 *   enclosed front aero girder forks, cantilevered lower rear swingarm, and dual open hubless orbital wheels
 *   with glowing cyan rim arcs).
 * - True ground-to-top 3D laser printing from the Porter's back mechanical arm with shader height slicing,
 *   molten-cyan sintering edge, complementary holographic blueprint shell, additive laser beam, and sparks.
 * - Zero-lag rendering: `laserLight` and `headlightSpot` remain permanently attached to `scene` (intensity-only
 *   control so Three.js NEVER recompiles scene shaders when printing starts or completes) and `prewarmShaders()`
 *   compiles all bike/FX shaders upfront during the loading screen.
 * - Long-travel critically-damped 2-wheel suspension & 3D physical drive-over boulder physics.
 */
import * as THREE from 'three';
import { clamp, mix, smoothstep } from './noise.js';
import { getTerrainHeight, getTerrainNormal, sampleWorld, getRiverCaveState } from './world.js';
import { enhanceMaterialWithAtmo, ATMO_UNIFORMS, ATMO_GLSL_PARS } from './atmosphere.js';

function createStealthBodyTextures() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  const b = document.createElement('canvas');
  b.width = size;
  b.height = size;
  const bctx = b.getContext('2d');

  // Sleek satin-matte stealth aerospace titanium-graphite composite (matches concept finish cleanly!)
  ctx.fillStyle = '#5a636e';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Ultra-fine satin micro-grain & subtle directional brushed sheen
  for (let i = 0; i < 240; i++) {
    const x = (i * 59) % size;
    const y = (i * 107) % size;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.022)';
    ctx.fillRect(x, y, 28 + (i % 36), 1.5);
  }

  // Subtle clean aerospace panel seam line (minimalist stealth look!)
  ctx.strokeStyle = 'rgba(12, 16, 20, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(size, 128);
  ctx.stroke();

  bctx.strokeStyle = '#525252';
  bctx.lineWidth = 3;
  bctx.beginPath();
  bctx.moveTo(0, 128);
  bctx.lineTo(size, 128);
  bctx.stroke();

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  return { map, bumpMap };
}

function createSportTireTextures() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');

  const b = document.createElement('canvas');
  b.width = size;
  b.height = size;
  const bctx = b.getContext('2d');

  ctx.fillStyle = '#15181c';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#909090';
  bctx.fillRect(0, 0, size, size);

  // Sleek futuristic diagonal rain-siping sport tire grooves
  ctx.strokeStyle = '#0d0f12';
  ctx.lineWidth = 6;
  bctx.strokeStyle = '#303030';
  bctx.lineWidth = 7;
  for (let y = -32; y < size + 32; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size * 0.5, y + 18);
    ctx.lineTo(size, y);
    ctx.stroke();

    bctx.beginPath();
    bctx.moveTo(0, y);
    bctx.lineTo(size * 0.5, y + 18);
    bctx.lineTo(size, y);
    bctx.stroke();
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 5);
  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 5);
  return { map, bumpMap };
}

/**
 * Create a sculpted 3D automotive panel from a 2D side-profile THREE.Shape (shapeX = bike +Z, shapeY = bike +Y),
 * extruded symmetrically across bike X with smooth rounded bevels and optional 3D fuselage width tapering!
 */
function createSculptedProfileGeo(shape, depth, bevelSize, bevelThickness, taperFn = null) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize,
    bevelThickness,
    curveSegments: 20
  });
  // Center along extrusion axis Z, then rotate -90 deg around Y so shapeX -> +Z (forward), extrusion -> X (width)
  geo.translate(0, 0, -depth * 0.5);
  geo.rotateY(-Math.PI * 0.5);

  if (taperFn) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const sx = taperFn(x, y, z);
      pos.setX(i, x * sx);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Stack ground-to-top 3D laser-print slicing + sintering glow cleanly on top of LandStranding's
 * atmospheric PBR material enhancement.
 */
function enhanceBikePrintMaterial(mat, printUniforms) {
  // Share one unified cache key & wetnessBoost across all bike PBR materials so Three.js compiles only
  // 2 programs total (textured vs untextured) instead of 8 separate heavy atmospheric GLSL shaders!
  enhanceMaterialWithAtmo(mat, { cacheKey: 'ls_bike_shared', wetnessBoost: 0.72 });
  const atmoCompile = mat.onBeforeCompile;
  mat.customProgramCacheKey = () => 'ls_bike_print_shared_v3';

  mat.onBeforeCompile = (shader, renderer) => {
    if (atmoCompile) atmoCompile(shader, renderer);
    Object.assign(shader.uniforms, printUniforms);

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */`
        #include <common>
        uniform float uPrintActive;
        uniform float uPrintCutY;
        uniform vec3 uPrintOrigin;
        uniform vec3 uPrintUp;
        uniform vec3 uLaserHit;
        `
      )
      .replace(
        'void main() {',
        /* glsl */`
        void main() {
          float lsBikeH = dot(vLsWorldPos - uPrintOrigin, uPrintUp);
          if (uPrintActive > 0.5 && lsBikeH > uPrintCutY) discard;
        `
      )
      .replace(
        '#include <dithering_fragment>',
        /* glsl */`
        if (uPrintActive > 0.5) {
          float distBelow = uPrintCutY - lsBikeH;
          float edgeBand = exp(-distBelow * 24.0);
          float hotCore = exp(-distBelow * 85.0);
          float layerLines = 0.5 + 0.5 * sin(lsBikeH * 195.0);
          float trailFade = exp(-distBelow * 6.5);
          float hitDist = length(vLsWorldPos - uLaserHit);
          float laserSpot = exp(-hitDist * hitDist * 38.0);

          vec3 sinterCol = vec3(0.18, 1.35, 1.85) * (edgeBand * 1.65 + trailFade * layerLines * 0.42);
          sinterCol += vec3(1.15, 1.55, 1.80) * (hotCore * 1.45 + laserSpot * 2.1);
          gl_FragColor.rgb += sinterCol;
        }
        #include <dithering_fragment>
        `
      );
  };
  return mat;
}

function createHologramShellMaterial(printUniforms) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    wireframe: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: ATMO_UNIFORMS.uTime,
      uPrintCutY: printUniforms.uPrintCutY,
      uPrintOrigin: printUniforms.uPrintOrigin,
      uPrintUp: printUniforms.uPrintUp,
      uHoloOpacity: { value: 0.0 }
    },
    vertexShader: /* glsl */`
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uPrintCutY;
      uniform vec3 uPrintOrigin;
      uniform vec3 uPrintUp;
      uniform float uHoloOpacity;
      varying vec3 vWorldPos;
      void main() {
        float h = dot(vWorldPos - uPrintOrigin, uPrintUp);
        if (h < uPrintCutY - 0.015) discard;
        float distAbove = max(0.0, h - uPrintCutY);
        float nearPlane = exp(-distAbove * 6.0);
        float pulse = 0.72 + 0.28 * sin(h * 32.0 - uTime * 9.0);
        float alpha = uHoloOpacity * (0.15 + nearPlane * 0.55) * pulse;
        vec3 col = mix(vec3(0.14, 0.85, 1.15), vec3(0.75, 1.55, 1.85), nearPlane);
        gl_FragColor = vec4(col, alpha);
      }
    `
  });
}

export function createMotorcycleSystem(scene, audioSys) {
  const WHEEL_RADIUS = 0.37;
  const BIKE_HEIGHT = 1.24;
  const PRINT_DURATION = 4.0;

  const printUniforms = {
    uPrintActive: { value: 0.0 },
    uPrintCutY: { value: -0.1 },
    uPrintOrigin: { value: new THREE.Vector3() },
    uPrintUp: { value: new THREE.Vector3(0, 1, 0) },
    uLaserHit: { value: new THREE.Vector3() }
  };

  // 1. Sleek Stealth Cyber-Bike PBR Materials
  const bodyTex = createStealthBodyTextures();
  const tireTex = createSportTireTextures();

  // Satin matte-graphite monocoque armor (bright enough to showcase every sculpted curve & bevel!)
  const bodyMat = enhanceBikePrintMaterial(new THREE.MeshStandardMaterial({
    color: 0xdce4ec,
    map: bodyTex.map,
    bumpMap: bodyTex.bumpMap,
    bumpScale: 0.005,
    roughness: 0.38,
    metalness: 0.42
  }), printUniforms);

  // Deeper matte carbon-graphite structural chassis & recessed power core bay
  const carbonMat = enhanceBikePrintMaterial(new THREE.MeshStandardMaterial({
    color: 0x252b33,
    roughness: 0.56,
    metalness: 0.34
  }), printUniforms);

  // Brushed silver-gunmetal orbital hubless rim tracks, clip-ons & kickstand
  const rimMetalMat = enhanceBikePrintMaterial(new THREE.MeshStandardMaterial({
    color: 0x9aa6b2,
    roughness: 0.24,
    metalness: 0.86
  }), printUniforms);

  // Sleek dark low-profile sport tire rubber
  const tireMat = enhanceBikePrintMaterial(new THREE.MeshStandardMaterial({
    color: 0xd8dee4,
    map: tireTex.map,
    bumpMap: tireTex.bumpMap,
    bumpScale: 0.014,
    roughness: 0.78,
    metalness: 0.06
  }), printUniforms);

  // Matte charcoal ergonomic saddle & handlebar grips
  const seatMat = enhanceBikePrintMaterial(new THREE.MeshStandardMaterial({
    color: 0x232830,
    roughness: 0.82,
    metalness: 0.04
  }), printUniforms);

  // Glossy smoked obsidian canopy windscreen
  const canopyMat = enhanceBikePrintMaterial(new THREE.MeshStandardMaterial({
    color: 0x1a2632,
    roughness: 0.08,
    metalness: 0.84
  }), printUniforms);

  // Crisp glowing electric-cyan LED trim lines & hubless wheel arcs
  const cyanLedMat = enhanceBikePrintMaterial(new THREE.MeshStandardMaterial({
    color: 0x4ef0ff,
    emissive: new THREE.Color(0x38e2ff),
    emissiveIntensity: 1.95,
    roughness: 0.16,
    metalness: 0.10
  }), printUniforms);

  // Slim crimson tail/brake light slit
  const tailLedMat = enhanceBikePrintMaterial(new THREE.MeshStandardMaterial({
    color: 0x881612,
    emissive: new THREE.Color(0xff2816),
    emissiveIntensity: 1.25,
    roughness: 0.20,
    metalness: 0.10
  }), printUniforms);

  // 2. Permanent Scene-Level Lights (ALWAYS visible=true so Three.js NEVER recompiles shaders on print start/stop!)
  const headlightSpot = new THREE.SpotLight(0xdff5ff, 0.0, 125, Math.PI * 0.30, 0.56, 1.05);
  const headlightTarget = new THREE.Object3D();
  headlightSpot.position.set(0, -200, 0);
  headlightTarget.position.set(0, -200, 10);
  headlightSpot.target = headlightTarget;
  scene.add(headlightSpot);
  scene.add(headlightTarget);

  const laserLight = new THREE.PointLight(0x38e2ff, 0.0, 14.0, 1.8);
  laserLight.position.set(0, -200, 0);
  scene.add(laserLight);

  // 3. Futuristic Sculpted Motorcycle Root & Articulated Hierarchy
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  const printMeshes = [];
  function registerMesh(mesh, localMinY) {
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    printMeshes.push({ mesh, minY: localMinY });
    return mesh;
  }

  /**
   * Build a true futuristic HUBLESS orbital wheel (completely open hollow center!):
   * - Wide sleek matte-black sport tire
   * - Brushed metallic inner orbital bearing race
   * - Rotating inner rim drive notches (provides crisp wheel-spin motion feedback!)
   * - Stationary glowing cyan LED inner-rim arcs matching the concept silhouette
   */
  function buildHublessWheel(isRear) {
    const wheelHolder = new THREE.Group();
    const spinGroup = new THREE.Group();
    wheelHolder.add(spinGroup);

    const widthScale = isRear ? 1.48 : 1.16;

    // Outer wide sport tire (hollow center radius ~0.195m!)
    const tireGeo = new THREE.TorusGeometry(0.282, 0.088, 18, 36);
    const tire = registerMesh(new THREE.Mesh(tireGeo, tireMat), 0.0);
    tire.rotation.y = Math.PI * 0.5;
    tire.scale.set(1.0, 1.0, widthScale);
    spinGroup.add(tire);

    // Metallic inner orbital rim track (hollow open ring!)
    const rimRing = registerMesh(new THREE.Mesh(new THREE.TorusGeometry(0.208, 0.024, 10, 36), rimMetalMat), 0.14);
    rimRing.rotation.y = Math.PI * 0.5;
    rimRing.scale.set(1.0, 1.0, widthScale * 1.04);
    spinGroup.add(rimRing);

    // Inner dark magnetic stator track ring (still 100% hollow open center!)
    const statorBand = registerMesh(
      new THREE.Mesh(new THREE.CylinderGeometry(0.192, 0.192, isRear ? 0.17 : 0.13, 28, 1, true), carbonMat),
      0.16
    );
    statorBand.rotation.z = Math.PI * 0.5;
    spinGroup.add(statorBand);

    // Subtle machined rotation lugs around the inner rim so tire spin is visually unmistakable
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const lug = registerMesh(new THREE.Mesh(new THREE.BoxGeometry(isRear ? 0.175 : 0.135, 0.016, 0.028), rimMetalMat), 0.18);
      lug.position.set(0, Math.sin(a) * 0.196, Math.cos(a) * 0.196);
      lug.rotation.x = -a;
      spinGroup.add(lug);
    }

    // Glowing cyan LED orbital arcs tucked cleanly inside the open rim cavity (top & bottom arcs!)
    for (const startAng of [Math.PI * 0.28, Math.PI * 1.28]) {
      for (const side of [-1, 1]) {
        const arc = registerMesh(
          new THREE.Mesh(new THREE.TorusGeometry(0.188, 0.007, 6, 18, Math.PI * 0.44), cyanLedMat),
          0.18
        );
        arc.rotation.y = Math.PI * 0.5;
        arc.rotation.x = startAng;
        arc.position.x = side * (isRear ? 0.072 : 0.056);
        wheelHolder.add(arc);
      }
    }

    return { wheelHolder, spinGroup };
  }

  // --- A. SCULPTED AERODYNAMIC MONOCOQUE BODYWORK (Bézier Curved + 3D Fuselage Taper!) ---
  // Main flowing upper spine: pointed nose -> sweeping cowl -> arched tank dome -> low saddle -> floating tail!
  const upperBodyShape = new THREE.Shape();
  upperBodyShape.moveTo(0.95, 0.88); // Sharp shark nose tip
  upperBodyShape.bezierCurveTo(0.84, 1.06, 0.66, 1.15, 0.48, 1.14); // Sweeping front cowl crest
  upperBodyShape.bezierCurveTo(0.38, 1.05, 0.30, 1.05, 0.16, 1.04); // Cockpit notch -> muscular domed tank
  upperBodyShape.bezierCurveTo(-0.02, 1.03, -0.10, 0.87, -0.22, 0.80); // Smooth drop into low saddle scoop
  upperBodyShape.bezierCurveTo(-0.36, 0.77, -0.46, 0.82, -0.58, 0.90); // Raised tail bolster
  upperBodyShape.bezierCurveTo(-0.76, 0.91, -0.94, 0.87, -1.04, 0.83); // Sleek floating duckbill tail tip
  upperBodyShape.bezierCurveTo(-0.92, 0.77, -0.74, 0.74, -0.52, 0.71); // Underside of floating tail
  upperBodyShape.bezierCurveTo(-0.34, 0.66, -0.22, 0.60, -0.14, 0.46); // Transition into mid-frame spine
  upperBodyShape.bezierCurveTo(0.05, 0.58, 0.24, 0.66, 0.44, 0.72); // Sculpted arch over recessed power core!
  upperBodyShape.bezierCurveTo(0.64, 0.76, 0.82, 0.80, 0.95, 0.88); // Sweeping underside of shark nose

  const upperBodyGeo = createSculptedProfileGeo(upperBodyShape, 0.22, 0.085, 0.085, (x, y, z) => {
    // Organic automotive cross-section taper: sleek narrow nose & razor tail, fuller sculpted tank!
    const noseTaper = 1.0 - smoothstep(0.45, 1.02, z) * 0.54;
    const tailTaper = 1.0 - smoothstep(-0.55, -1.08, z) * 0.58;
    const domeTaper = 1.0 - smoothstep(0.95, 1.22, y) * 0.28;
    return clamp(noseTaper * tailTaper * domeTaper, 0.32, 1.08);
  });
  const upperBodyMesh = registerMesh(new THREE.Mesh(upperBodyGeo, bodyMat), 0.45);
  chassisGroup.add(upperBodyMesh);

  // Lower sculpted aerodynamic belly pan & forward chin fairing (sweeping cleanly down from nose to rear pivot!)
  const bellyShape = new THREE.Shape();
  bellyShape.moveTo(0.62, 0.80);
  bellyShape.bezierCurveTo(0.48, 0.74, 0.36, 0.62, 0.30, 0.44); // Front fairing flank behind front wheel
  bellyShape.bezierCurveTo(0.24, 0.32, 0.10, 0.28, -0.24, 0.30); // Low aerodynamic chin & flat belly pan
  bellyShape.bezierCurveTo(-0.32, 0.34, -0.34, 0.42, -0.26, 0.48); // Swingarm pivot housing
  bellyShape.bezierCurveTo(-0.08, 0.42, 0.14, 0.44, 0.22, 0.58); // Lower edge framing recessed dark intake!
  bellyShape.bezierCurveTo(0.34, 0.68, 0.48, 0.76, 0.62, 0.80);

  const bellyGeo = createSculptedProfileGeo(bellyShape, 0.24, 0.065, 0.065, (x, y, z) => {
    const lowTaper = 1.0 - smoothstep(0.42, 0.24, y) * 0.32;
    const fwdTaper = 1.0 - smoothstep(0.32, 0.68, z) * 0.30;
    return clamp(lowTaper * fwdTaper, 0.45, 1.04);
  });
  const bellyMesh = registerMesh(new THREE.Mesh(bellyGeo, bodyMat), 0.24);
  chassisGroup.add(bellyMesh);

  // Recessed dark matte-carbon central electric power core / intake bay (crisp dark cutaway contrast!)
  const coreShape = new THREE.Shape();
  coreShape.moveTo(0.28, 0.59);
  coreShape.bezierCurveTo(0.10, 0.62, -0.06, 0.57, -0.18, 0.45);
  coreShape.lineTo(-0.14, 0.34);
  coreShape.lineTo(0.20, 0.34);
  coreShape.bezierCurveTo(0.28, 0.42, 0.32, 0.51, 0.28, 0.59);
  const coreGeo = createSculptedProfileGeo(coreShape, 0.32, 0.025, 0.025);
  const coreMesh = registerMesh(new THREE.Mesh(coreGeo, carbonMat), 0.32);
  chassisGroup.add(coreMesh);

  // Curved glowing cyan LED intake-brow accents arcing smoothly along left & right recessed bay rims!
  for (const side of [-1, 1]) {
    const intakeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.195, 0.59, 0.28),
      new THREE.Vector3(side * 0.202, 0.625, 0.12),
      new THREE.Vector3(side * 0.192, 0.595, -0.04)
    ]);
    const intakeLed = registerMesh(new THREE.Mesh(new THREE.TubeGeometry(intakeCurve, 14, 0.0085, 6, false), cyanLedMat), 0.56);
    chassisGroup.add(intakeLed);

    // Subtle secondary forward fairing accent vent slash
    const fwdSlashCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.185, 0.72, 0.56),
      new THREE.Vector3(side * 0.198, 0.68, 0.42)
    ]);
    const fwdSlash = registerMesh(new THREE.Mesh(new THREE.TubeGeometry(fwdSlashCurve, 8, 0.006, 6, false), cyanLedMat), 0.66);
    chassisGroup.add(fwdSlash);

    // Sculpted side circular pivot boss at rear swingarm hinge (matching the photo's mechanical accent!)
    const pivotBoss = registerMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.072, 0.055, 16), carbonMat), 0.34);
    pivotBoss.rotation.z = Math.PI * 0.5;
    pivotBoss.position.set(side * 0.165, 0.41, -0.26);
    chassisGroup.add(pivotBoss);

    // Sleek dark rider footpegs tucked cleanly beside the rear pivot
    const footpeg = registerMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.11, 8), rimMetalMat), 0.32);
    footpeg.rotation.z = Math.PI * 0.5;
    footpeg.position.set(side * 0.245, 0.36, -0.06);
    chassisGroup.add(footpeg);
  }

  // Contoured low-profile matte-black ergonomic saddle nestled cleanly into the monocoque scoop
  const saddleShape = new THREE.Shape();
  saddleShape.moveTo(0.02, 0.89);
  saddleShape.bezierCurveTo(-0.08, 0.80, -0.22, 0.77, -0.38, 0.79);
  saddleShape.bezierCurveTo(-0.46, 0.80, -0.52, 0.85, -0.56, 0.89);
  saddleShape.lineTo(-0.46, 0.84);
  saddleShape.bezierCurveTo(-0.30, 0.81, -0.14, 0.84, 0.02, 0.89);
  const saddleGeo = createSculptedProfileGeo(saddleShape, 0.22, 0.032, 0.032);
  const saddleMesh = registerMesh(new THREE.Mesh(saddleGeo, seatMat), 0.76);
  chassisGroup.add(saddleMesh);

  // Glossy smoked dark canopy windscreen hugging the aerodynamic shark nose
  const canopyShape = new THREE.Shape();
  canopyShape.moveTo(0.92, 0.92);
  canopyShape.bezierCurveTo(0.80, 1.09, 0.64, 1.18, 0.47, 1.18);
  canopyShape.lineTo(0.49, 1.11);
  canopyShape.bezierCurveTo(0.64, 1.10, 0.78, 1.02, 0.92, 0.92);
  const canopyGeo = createSculptedProfileGeo(canopyShape, 0.14, 0.04, 0.04, (x, y, z) => {
    return 1.0 - smoothstep(0.55, 0.95, z) * 0.55;
  });
  const canopyMesh = registerMesh(new THREE.Mesh(canopyGeo, canopyMat), 0.90);
  chassisGroup.add(canopyMesh);

  // Twin razor-sharp cyan LED headlight/DRL brow slits on the pointed nose tip
  for (const side of [-1, 1]) {
    const noseLedCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.055, 0.885, 0.975),
      new THREE.Vector3(side * 0.125, 0.892, 0.87),
      new THREE.Vector3(side * 0.165, 0.905, 0.77)
    ]);
    const noseLed = registerMesh(new THREE.Mesh(new THREE.TubeGeometry(noseLedCurve, 10, 0.0085, 6, false), cyanLedMat), 0.86);
    chassisGroup.add(noseLed);
  }

  // Headlight SpotLight anchor in local bike space (world position synced each frame to permanent scene light!)
  const headlightOriginAnchor = new THREE.Object3D();
  headlightOriginAnchor.position.set(0, 0.88, 1.02);
  chassisGroup.add(headlightOriginAnchor);
  const headlightAimAnchor = new THREE.Object3D();
  headlightAimAnchor.position.set(0, -0.65, 18.0);
  chassisGroup.add(headlightAimAnchor);

  // Slim crimson LED taillight slit tucked cleanly underneath the floating duckbill tail tip
  const tailLed = registerMesh(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.045), tailLedMat), 0.80);
  tailLed.position.set(0, 0.825, -1.02);
  chassisGroup.add(tailLed);

  // Slender brushed-titanium side kickstand (matching reference photo's sleek angled stand!)
  const kickstandPivot = new THREE.Group();
  kickstandPivot.position.set(0.12, 0.28, -0.14);
  chassisGroup.add(kickstandPivot);
  const kickstandRod = registerMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.009, 0.34, 8), rimMetalMat), 0.03);
  kickstandRod.position.set(0.06, -0.15, -0.02);
  kickstandRod.rotation.z = 0.34;
  kickstandPivot.add(kickstandRod);

  // --- B. CANTILEVERED SCULPTED REAR HUBLESS SWINGARM & REAR HUBLESS WHEEL ---
  const rearSwingarmPivot = new THREE.Group();
  rearSwingarmPivot.position.set(0, 0.41, -0.26);
  chassisGroup.add(rearSwingarmPivot);

  const rearWheelPivot = new THREE.Group();
  rearWheelPivot.position.set(0, WHEEL_RADIUS - 0.41, -0.56);
  rearSwingarmPivot.add(rearWheelPivot);
  const rearWheel = buildHublessWheel(true);
  rearWheelPivot.add(rearWheel.wheelHolder);
  const rearWheelSpin = rearWheel.spinGroup;

  // Sculpted cantilevered lower rear swingarm blades embracing the rear hubless rim (leaving center hollow!)
  const swingarmShape = new THREE.Shape();
  swingarmShape.moveTo(0.04, 0.06);
  swingarmShape.bezierCurveTo(-0.14, 0.04, -0.34, -0.04, -0.52, -0.16); // Sweeps down to lower hubless rim mount!
  swingarmShape.lineTo(-0.56, -0.23);
  swingarmShape.bezierCurveTo(-0.36, -0.15, -0.14, -0.08, 0.04, -0.06);
  swingarmShape.closePath();
  const swingarmGeo = createSculptedProfileGeo(swingarmShape, 0.055, 0.018, 0.018);

  for (const side of [-1, 1]) {
    const swArm = registerMesh(new THREE.Mesh(swingarmGeo, bodyMat), 0.20);
    swArm.position.set(side * 0.175, 0, 0);
    rearSwingarmPivot.add(swArm);

    const rearArmLed = registerMesh(new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.012, 0.14), cyanLedMat), 0.24);
    rearArmLed.position.set(side * 0.214, -0.155, -0.45);
    rearArmLed.rotation.x = 0.38;
    rearSwingarmPivot.add(rearArmLed);
  }

  // --- C. ARTICULATED FRONT STEERING ASSEMBLY (Enclosed Aero Girder Forks + Front Hubless Wheel + Clip-Ons) ---
  const steerPivot = new THREE.Group();
  steerPivot.position.set(0, 0.94, 0.56);
  steerPivot.rotation.x = -0.36;
  chassisGroup.add(steerPivot);

  const frontSuspGroup = new THREE.Group();
  steerPivot.add(frontSuspGroup);

  // Sculpted aerodynamic front hubless fork blades sweeping forward onto the front wheel rim (leaving center 100% open!)
  const frontForkShape = new THREE.Shape();
  frontForkShape.moveTo(0.06, -0.06);
  frontForkShape.bezierCurveTo(0.14, -0.22, 0.22, -0.42, 0.24, -0.60);
  frontForkShape.lineTo(0.10, -0.64);
  frontForkShape.bezierCurveTo(0.06, -0.46, -0.02, -0.24, -0.06, -0.08);
  frontForkShape.closePath();
  const frontForkGeo = createSculptedProfileGeo(frontForkShape, 0.042, 0.018, 0.018);

  for (const side of [-1, 1]) {
    const forkBlade = registerMesh(new THREE.Mesh(frontForkGeo, bodyMat), 0.26);
    forkBlade.position.set(side * 0.145, 0.0, 0.0);
    frontSuspGroup.add(forkBlade);
  }

  // Front hubless wheel mounted cleanly to the sculpted aero girder fork tips
  const frontWheelPivot = new THREE.Group();
  frontWheelPivot.position.set(0, -0.635, 0.06);
  frontSuspGroup.add(frontWheelPivot);
  const frontWheel = buildHublessWheel(false);
  frontWheelPivot.add(frontWheel.wheelHolder);
  const frontWheelSpin = frontWheel.spinGroup;

  // Recessed sporty clip-on handlebars tucked cleanly behind the shark nose cowl + glowing holo dash
  const dashGlow = registerMesh(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.02), cyanLedMat), 1.02);
  dashGlow.position.set(0, 0.12, 0.04);
  dashGlow.rotation.x = -0.58;
  steerPivot.add(dashGlow);

  const leftGripAnchor = new THREE.Object3D();
  const rightGripAnchor = new THREE.Object3D();

  for (const side of [-1, 1]) {
    const clipBar = registerMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 8), rimMetalMat), 0.98);
    clipBar.rotation.z = Math.PI * 0.5;
    clipBar.rotation.y = side * 0.28;
    clipBar.position.set(side * 0.22, 0.09, -0.05);
    steerPivot.add(clipBar);

    const grip = registerMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.13, 10), seatMat), 0.98);
    grip.rotation.z = Math.PI * 0.5;
    grip.rotation.y = side * 0.28;
    grip.position.set(side * 0.30, 0.085, -0.075);
    steerPivot.add(grip);

    const anchor = side === 1 ? leftGripAnchor : rightGripAnchor;
    anchor.position.set(side * 0.30, 0.095, -0.08);
    steerPivot.add(anchor);
  }

  // Exact Rider Seat & Footpeg Anchors
  const riderSeatAnchor = new THREE.Object3D();
  riderSeatAnchor.position.set(0, -0.03, -0.24);
  chassisGroup.add(riderSeatAnchor);

  const leftFootpegAnchor = new THREE.Object3D();
  leftFootpegAnchor.position.set(0.245, 0.38, -0.06);
  chassisGroup.add(leftFootpegAnchor);

  const rightFootpegAnchor = new THREE.Object3D();
  rightFootpegAnchor.position.set(-0.245, 0.38, -0.06);
  chassisGroup.add(rightFootpegAnchor);

  // 4. Complementary Holographic Blueprint Wireframe Shell (matches new futuristic silhouette!)
  const holoMat = createHologramShellMaterial(printUniforms);
  const holoGroup = new THREE.Group();
  holoGroup.visible = false;
  chassisGroup.add(holoGroup);

  const holoBody = new THREE.Mesh(upperBodyGeo, holoMat);
  holoGroup.add(holoBody);
  const holoBelly = new THREE.Mesh(bellyGeo, holoMat);
  holoGroup.add(holoBelly);
  for (const [zPos, wSc] of [[-0.82, 1.42], [0.84, 1.15]]) {
    const hw = new THREE.Mesh(new THREE.TorusGeometry(0.282, 0.086, 8, 22), holoMat);
    hw.position.set(0, WHEEL_RADIUS, zPos);
    hw.rotation.y = Math.PI * 0.5;
    hw.scale.set(1, 1, wSc);
    holoGroup.add(hw);
  }

  // 5. 3D Laser Printer Visual FX (NO lights inside fxGroup -> toggling visible causes ZERO shader recompile!)
  const fxGroup = new THREE.Group();
  fxGroup.visible = false;
  scene.add(fxGroup);

  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  beamGeo.translate(0, 0.5, 0);

  const beamCoreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.2, 3.0, 3.6),
    transparent: true,
    opacity: 0.98,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const beamGlowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.24, 1.75, 2.45),
    transparent: true,
    opacity: 0.48,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const beamFanMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.18, 1.35, 1.95),
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const beamPivot = new THREE.Group();
  const beamCore = new THREE.Mesh(beamGeo, beamCoreMat);
  const beamGlow = new THREE.Mesh(beamGeo, beamGlowMat);
  const beamFanGeo = new THREE.CylinderGeometry(1, 0.08, 1, 12, 1, true);
  beamFanGeo.translate(0, 0.5, 0);
  const beamFan = new THREE.Mesh(beamFanGeo, beamFanMat);
  beamPivot.add(beamCore);
  beamPivot.add(beamGlow);
  beamPivot.add(beamFan);
  fxGroup.add(beamPivot);

  const muzzleFlare = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 10, 10),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.4, 2.4, 3.0),
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  fxGroup.add(muzzleFlare);

  const hotSpot = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 10, 10),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.6, 2.4, 2.8),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  fxGroup.add(hotSpot);

  const hotHalo = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 10),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.25, 1.6, 2.2),
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  fxGroup.add(hotHalo);

  const scanRingMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.35, 1.85, 2.35),
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const scanRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.12, 40), scanRingMat);
  scanRing.rotation.x = -Math.PI * 0.5;
  scanRing.scale.set(0.56, 1.22, 1.0);
  root.add(scanRing);

  const groundPadMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.16, 1.25, 1.65),
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const groundPad = new THREE.Mesh(new THREE.RingGeometry(1.12, 1.24, 48), groundPadMat);
  groundPad.rotation.x = -Math.PI * 0.5;
  groundPad.position.y = 0.04;
  groundPad.scale.set(0.60, 1.28, 1.0);
  root.add(groundPad);

  const SPARK_COUNT = 64;
  const sparkPositions = new Float32Array(SPARK_COUNT * 3);
  const sparkVel = new Float32Array(SPARK_COUNT * 3);
  const sparkLife = new Float32Array(SPARK_COUNT);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparkPoints = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({
      color: new THREE.Color(0.9, 2.0, 2.5),
      size: 0.085,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  sparkPoints.frustumCulled = false;
  fxGroup.add(sparkPoints);
  let sparkCursor = 0;

  // Rear Tire Off-Road Billowing Dust & Water Spray Particle System (1 draw call InstancedMesh billboards)
  const DUST_COUNT = 64;
  const dustDataArr = new Float32Array(DUST_COUNT * 4); // x=opacity, y=rot, z=waterMix, w=ageU
  const dustColorArr = new Float32Array(DUST_COUNT * 3);
  const dustGeo = new THREE.PlaneGeometry(1, 1);
  const dustAttr = new THREE.InstancedBufferAttribute(dustDataArr, 4);
  const dustColAttr = new THREE.InstancedBufferAttribute(dustColorArr, 3);
  dustGeo.setAttribute('aDustData', dustAttr);
  dustGeo.setAttribute('aDustColor', dustColAttr);

  const dustMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...ATMO_UNIFORMS
    },
    vertexShader: /* glsl */`
      attribute vec4 aDustData;
      attribute vec3 aDustColor;
      varying vec2 vUv;
      varying vec4 vDustData;
      varying vec3 vDustColor;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vDustData = aDustData;
        vDustColor = aDustColor;
        vec4 worldCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sx = length((modelMatrix * instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        float sy = length((modelMatrix * instanceMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        float c = cos(aDustData.y);
        float s = sin(aDustData.y);
        vec2 rotPos = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp = worldCenter.xyz + camRight * (rotPos.x * sx) + camUp * (rotPos.y * sy);
        vWorldPos = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying vec4 vDustData;
      varying vec3 vDustColor;
      varying vec3 vWorldPos;
      ${ATMO_GLSL_PARS}
      void main() {
        float opacity = vDustData.x;
        if (opacity <= 0.004) discard;
        vec2 p = vUv * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 >= 1.0) discard;

        // Organic billowing wispy cloud shape using multi-octave gradient noise (zero hard sphere edges!)
        float wisp = atmoGNoise(vUv * 3.6 + vec2(vDustData.y * 1.7, vDustData.w * 0.9)) * 0.62
                   + atmoGNoise(vUv * 7.4 - vec2(vDustData.w * 1.3, vDustData.y * 2.1)) * 0.38;
        float radial = pow(1.0 - r2, 1.65);
        float puff = smoothstep(0.14, 0.84, radial * (0.68 + wisp * 0.68));
        float alpha = puff * opacity;
        if (alpha <= 0.004) discard;

        // Top-lit atmospheric shading (sunlit rim + soft ground shadow)
        float topLight = mix(0.68, 1.18, clamp(vUv.y * 0.85 + wisp * 0.25, 0.0, 1.0));
        vec3 dayTint = mix(vec3(0.62, 0.68, 0.74), uSunColor, 0.48) * topLight;
        vec3 nightTint = vec3(0.04, 0.06, 0.09);
        vec3 col = vDustColor * mix(dayTint, nightTint, uNightFactor);
        col = applyIcelandAtmo(col, vWorldPos);
        gl_FragColor = vec4(col, alpha);
      }
    `
  });

  const dustInst = new THREE.InstancedMesh(dustGeo, dustMat, DUST_COUNT);
  dustInst.frustumCulled = false;
  dustInst.renderOrder = 6;
  scene.add(dustInst);

  const dustPool = [];
  const _dustDummy = new THREE.Object3D();
  for (let i = 0; i < DUST_COUNT; i++) {
    _dustDummy.position.set(0, -9999, 0);
    _dustDummy.scale.setScalar(0.0001);
    _dustDummy.updateMatrix();
    dustInst.setMatrixAt(i, _dustDummy.matrix);
    dustPool.push({
      active: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      age: 99,
      maxAge: 0.85,
      baseScale: 0.45,
      growScale: 1.6,
      rot: 0,
      rotSpd: 0,
      maxOpacity: 0.3,
      waterMix: 0,
      r: 0.45,
      g: 0.45,
      b: 0.42
    });
  }
  dustInst.instanceMatrix.needsUpdate = true;
  let dustCursor = 0;
  let dustEmitAccum = 0;

  // 6. State & Physics Variables
  const state = {
    exists: false,
    printing: false,
    printProgress: 0,
    printAge: 0,
    completeFlash: 0,
    riding: false,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    speed: 0,
    steerAngle: 0,
    rollAngle: 0,
    pitchOffset: 0,
    suspY: 0,
    suspVel: 0,
    frontWheelTravel: 0,
    rearWheelTravel: 0,
    prevWheelAvgY: 0,
    lastGroundY: 0,
    onRock: false,
    grounded: true,
    wasGrounded: true,
    boosting: false,
    braking: false,
    surfaceType: 'moss',
    terrainPitch: 0,
    terrainPitchVel: 0,
    terrainRoll: 0,
    wheelSpinAngle: 0,
    laserHitWorld: new THREE.Vector3()
  };

  const _groundNorm = new THREE.Vector3(0, 1, 0);
  const _smoothNorm = new THREE.Vector3(0, 1, 0);
  const _upAxis = new THREE.Vector3(0, 1, 0);
  const _emitterPos = new THREE.Vector3();
  const _beamDir = new THREE.Vector3();
  const _beamQuat = new THREE.Quaternion();
  const _localHit = new THREE.Vector3();
  const _bikeQuat = new THREE.Quaternion();
  const _yawQuat = new THREE.Quaternion();
  const _alignQuat = new THREE.Quaternion();
  const _tiltEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const _rearTireWorld = new THREE.Vector3();
  const _seatWorldPos = new THREE.Vector3();
  const _seatWorldQuat = new THREE.Quaternion();
  const _leftGripW = new THREE.Vector3();
  const _rightGripW = new THREE.Vector3();
  const _leftPegW = new THREE.Vector3();
  const _rightPegW = new THREE.Vector3();
  const _hlOriginW = new THREE.Vector3();
  const _hlAimW = new THREE.Vector3();
  const _tmpSample = {
    height: 0, moss: 0, cliff: 0, path: 0, scree: 0,
    riverDepth: 0, riverMask: 0, lakeDepth: 0, lakeMask: 0, lakeWaterY: 16, lakeShoreDist: -9999,
    flowX: 0, flowZ: 1, snow: 0, glacier: 0, wetness: 0, hummockAO: 0.5
  };
  const _wheelSample = {
    height: 0, moss: 0, cliff: 0, path: 0, scree: 0,
    riverDepth: 0, riverMask: 0, lakeDepth: 0, lakeMask: 0, lakeWaterY: 16, lakeShoreDist: -9999,
    flowX: 0, flowZ: 1, snow: 0, glacier: 0, wetness: 0, hummockAO: 0.5
  };

  /**
   * Prewarm all motorcycle, hologram, laser FX, dust, and shadow-depth shaders directly through
   * the HDR HalfFloat EffectComposer pipeline during bootWorld() so pressing Print (B) or finishing
   * the 3D print triggers ZERO runtime WebGL shader compilations!
   */
  function prewarmShaders(composer, camera) {
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const warmPos = camera.position.clone().addScaledVector(camDir, 8.0);

    root.visible = true;
    fxGroup.visible = true;
    holoGroup.visible = true;
    dustInst.visible = true;

    root.position.copy(warmPos);
    root.scale.setScalar(0.0005);
    fxGroup.position.copy(warmPos);
    fxGroup.scale.setScalar(0.0005);
    _dustDummy.position.copy(warmPos);
    _dustDummy.scale.setScalar(0.0005);
    _dustDummy.updateMatrix();
    dustInst.setMatrixAt(0, _dustDummy.matrix);
    dustInst.instanceMatrix.needsUpdate = true;
    dustDataArr[0] = 0.05;
    dustAttr.needsUpdate = true;

    for (let i = 0; i < printMeshes.length; i++) {
      printMeshes[i].mesh.castShadow = true;
    }

    // Render one full composer pass into HalfFloat msaaTarget + shadow map -> caches exact runtime programs!
    composer.render();

    root.scale.setScalar(1.0);
    fxGroup.scale.setScalar(1.0);
    fxGroup.position.set(0, 0, 0);
    _dustDummy.position.set(0, -9999, 0);
    _dustDummy.scale.setScalar(0.0001);
    _dustDummy.updateMatrix();
    dustInst.setMatrixAt(0, _dustDummy.matrix);
    dustInst.instanceMatrix.needsUpdate = true;
    dustDataArr[0] = 0.0;
    dustAttr.needsUpdate = true;
    root.visible = false;
    fxGroup.visible = false;
    holoGroup.visible = false;
    for (let i = 0; i < printMeshes.length; i++) {
      printMeshes[i].mesh.castShadow = false;
    }
  }

  function sampleBikeSurfaceY(x, z, refY, nearbyRocks, outInfo = null) {
    sampleWorld(x, z, _wheelSample);
    const caveInfo = getRiverCaveState(x, z, refY);
    let baseY = caveInfo.inCave ? caveInfo.floorY : _wheelSample.height;
    const lakeSub = _wheelSample.lakeDepth || 0;
    if (lakeSub > 0.75) {
      baseY = Math.max(baseY, _wheelSample.lakeWaterY - 0.75);
    }
    let y = baseY;
    let onRock = false;

    if (nearbyRocks && nearbyRocks.length > 0 && !caveInfo.inCave) {
      for (let i = 0; i < nearbyRocks.length; i++) {
        const c = nearbyRocks[i];
        if (c.kind !== 'rock') continue;
        const dx = x - c.x;
        const dz = z - c.z;
        const effR = c.r * 1.24;
        const dSq = dx * dx + dz * dz;
        if (dSq >= effR * effR) continue;
        const d = Math.sqrt(dSq);
        const u = clamp(1.0 - d / effR, 0.0, 1.0);
        const smoothDome = u * u * (3.0 - 2.0 * u);
        const rockY = c.baseY + (c.h || 0.55) * (0.45 * smoothDome + 0.55 * Math.pow(u, 0.78));
        if (rockY > y) {
          y = rockY;
          if (rockY > baseY + 0.06) onRock = true;
        }
      }
    }

    if (outInfo) {
      outInfo.y = y;
      outInfo.baseY = baseY;
      outInfo.onRock = onRock;
      outInfo.inCave = caveInfo.inCave;
      outInfo.lakeSub = lakeSub;
    }
    return y;
  }

  function alignToTerrainImmediate(x, z, yaw) {
    sampleWorld(x, z, _tmpSample);
    const caveInfo = getRiverCaveState(x, z, _tmpSample.height);
    let y = caveInfo.inCave ? caveInfo.floorY : _tmpSample.height;
    const lakeSub = _tmpSample.lakeDepth || 0;
    if (lakeSub > 0.75) y = Math.max(y, _tmpSample.lakeWaterY - 0.75);

    state.pos.set(x, y, z);
    state.prevWheelAvgY = y;
    state.lastGroundY = y;
    state.yaw = yaw;
    state.frontWheelTravel = 0;
    state.rearWheelTravel = 0;
    state.terrainPitch = 0;
    state.terrainPitchVel = 0;
    state.terrainRoll = 0;
    getTerrainNormal(x, z, _groundNorm, 1.4);
    if (caveInfo.inCave || lakeSub > 0.4) _groundNorm.set(0, 1, 0);
    _smoothNorm.copy(_groundNorm);
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const fy = getTerrainHeight(x + fwdX * 0.84, z + fwdZ * 0.84);
    const ry = getTerrainHeight(x - fwdX * 0.82, z - fwdZ * 0.82);
    const ly = getTerrainHeight(x + rightX * 0.48, z + rightZ * 0.48);
    const rty = getTerrainHeight(x - rightX * 0.48, z - rightZ * 0.48);
    if (!caveInfo.inCave && lakeSub <= 0.4) {
      state.terrainPitch = clamp(-Math.atan2(fy - ry, 1.66), -0.58, 0.58);
      state.terrainRoll = clamp(Math.atan2(ly - rty, 0.96), -0.42, 0.42);
    }
    applyRootTransform();
  }

  function applyRootTransform() {
    root.position.copy(state.pos);
    if (state.printing) {
      _alignQuat.setFromUnitVectors(_upAxis, _smoothNorm);
      _yawQuat.setFromAxisAngle(_upAxis, state.yaw);
      _bikeQuat.copy(_alignQuat).multiply(_yawQuat);
      root.quaternion.copy(_bikeQuat);
    } else {
      _tiltEuler.set(state.terrainPitch, state.yaw, state.terrainRoll, 'YXZ');
      root.quaternion.setFromEuler(_tiltEuler);
    }

    const targetRoll = state.printing ? 0.0 : (state.riding ? state.rollAngle : 0.115);
    chassisGroup.position.y = state.suspY;
    chassisGroup.rotation.set(state.pitchOffset, 0, targetRoll);

    frontSuspGroup.position.y = state.printing ? 0.0 : clamp(state.frontWheelTravel, -0.22, 0.28);
    rearSwingarmPivot.rotation.x = state.printing ? 0.0 : clamp(state.rearWheelTravel * 1.45, -0.36, 0.38);

    kickstandPivot.rotation.z = (!state.riding && !state.printing) ? 0.0 : -1.15;
    kickstandPivot.rotation.x = (!state.riding && !state.printing) ? 0.0 : -0.85;
  }

  function clear() {
    state.exists = false;
    state.printing = false;
    state.printProgress = 0;
    state.printAge = 0;
    state.riding = false;
    state.speed = 0;
    state.vel.set(0, 0, 0);
    root.visible = false;
    fxGroup.visible = false;
    holoGroup.visible = false;
    laserLight.intensity = 0;
    headlightSpot.intensity = 0;
    printUniforms.uPrintActive.value = 0.0;
    if (audioSys && audioSys.setLaserPrintAudio) audioSys.setLaserPrintAudio(false, 0);
    if (audioSys && audioSys.setBikeAudio) audioSys.setBikeAudio(false, 0, false);
  }

  function startPrint(porter) {
    if (state.riding) return false;

    const pPos = porter.state.pos;
    const pYaw = porter.state.yaw;
    const fwdX = Math.sin(pYaw);
    const fwdZ = Math.cos(pYaw);
    const rightX = -Math.cos(pYaw);
    const rightZ = Math.sin(pYaw);

    const dist = 3.35;
    const sideOff = 1.15;
    const spawnX = pPos.x + fwdX * dist + rightX * sideOff;
    const spawnZ = pPos.z + fwdZ * dist + rightZ * sideOff;
    const bikeYaw = pYaw + Math.PI * 0.32;

    state.exists = true;
    state.printing = true;
    state.printProgress = 0.0;
    state.printAge = 0.0;
    state.completeFlash = 0.0;
    state.riding = false;
    state.speed = 0;
    state.vel.set(0, 0, 0);
    state.steerAngle = 0;
    state.rollAngle = 0;
    state.pitchOffset = 0;
    state.suspY = 0;
    state.suspVel = 0;
    state.grounded = true;
    state.wasGrounded = true;

    alignToTerrainImmediate(spawnX, spawnZ, bikeYaw);
    steerPivot.rotation.y = 0;

    for (let i = 0; i < printMeshes.length; i++) {
      printMeshes[i].mesh.castShadow = false;
    }

    for (let i = 0; i < SPARK_COUNT; i++) {
      sparkLife[i] = 0;
      sparkPositions[i * 3 + 1] = -9999;
    }
    sparkGeo.attributes.position.needsUpdate = true;

    root.visible = true;
    fxGroup.visible = true;
    holoGroup.visible = true;
    printUniforms.uPrintActive.value = 1.0;
    printUniforms.uPrintCutY.value = -0.02;
    printUniforms.uPrintOrigin.value.copy(state.pos);
    printUniforms.uPrintUp.value.copy(_smoothNorm);

    if (audioSys && audioSys.playOdradekChime) audioSys.playOdradekChime();
    return true;
  }

  function evalRasterLocalPoint(cutY, tSec, out) {
    let zMin = -1.08;
    let zMax = 1.08;
    let xHalf = 0.16;

    if (cutY < 0.38) {
      zMin = -1.12;
      zMax = 1.12;
      xHalf = 0.16;
    } else if (cutY < 0.72) {
      zMin = -1.05;
      zMax = 1.04;
      xHalf = 0.22;
    } else if (cutY < 0.96) {
      zMin = -1.04;
      zMax = 0.96;
      xHalf = 0.22;
    } else {
      zMin = 0.05;
      zMax = 0.92;
      xHalf = 0.28;
    }

    const sweepZ = 0.5 + 0.5 * Math.sin(tSec * 14.5);
    const sweepX = Math.sin(tSec * 29.0 + 0.7);
    const lx = sweepX * xHalf;
    const lz = mix(zMin, zMax, sweepZ);
    out.set(lx, clamp(cutY, 0.02, BIKE_HEIGHT), lz);
    return out;
  }

  function emitSpark(origin) {
    const idx = sparkCursor;
    sparkCursor = (sparkCursor + 1) % SPARK_COUNT;
    sparkPositions[idx * 3] = origin.x + (Math.random() - 0.5) * 0.04;
    sparkPositions[idx * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.04;
    sparkPositions[idx * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.04;
    const ang = Math.random() * Math.PI * 2;
    const spd = 0.9 + Math.random() * 2.4;
    sparkVel[idx * 3] = Math.cos(ang) * spd;
    sparkVel[idx * 3 + 1] = 1.2 + Math.random() * 2.5;
    sparkVel[idx * 3 + 2] = Math.sin(ang) * spd;
    sparkLife[idx] = 0.22 + Math.random() * 0.34;
  }

  function updateSparks(dt) {
    for (let i = 0; i < SPARK_COUNT; i++) {
      if (sparkLife[i] > 0) {
        sparkLife[i] -= dt;
        if (sparkLife[i] <= 0) {
          sparkPositions[i * 3 + 1] = -9999;
        } else {
          sparkVel[i * 3 + 1] -= 7.8 * dt;
          sparkPositions[i * 3] += sparkVel[i * 3] * dt;
          sparkPositions[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
          sparkPositions[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        }
      }
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  function emitRearDust(dt) {
    const absSpd = Math.abs(state.speed);
    if (!state.grounded || absSpd < 2.4) return;
    const slipBoost = 1.0 + Math.min(Math.abs(state.steerAngle) * 2.2, 1.1) + (state.boosting ? 0.65 : 0.0);
    dustEmitAccum += dt * clamp(absSpd * 1.9 * slipBoost, 6, 48);
    while (dustEmitAccum >= 1.0) {
      dustEmitAccum -= 1.0;
      const p = dustPool[dustCursor];
      dustCursor = (dustCursor + 1) % DUST_COUNT;
      _rearTireWorld.set(0, 0.14, -1.06).applyQuaternion(root.quaternion).add(state.pos);
      p.pos.copy(_rearTireWorld);
      p.pos.x += (Math.random() - 0.5) * 0.28;
      p.pos.z += (Math.random() - 0.5) * 0.28;

      const backX = -Math.sin(state.yaw);
      const backZ = -Math.cos(state.yaw);
      const kick = absSpd * 0.22;
      const isWater = state.surfaceType === 'water';
      p.vel.set(
        backX * kick + (Math.random() - 0.5) * 1.6,
        (isWater ? 2.1 : 1.05) + Math.random() * 1.45 + clamp(absSpd * 0.05, 0, 1.2),
        backZ * kick + (Math.random() - 0.5) * 1.6
      );

      if (isWater) {
        p.r = 0.84; p.g = 0.93; p.b = 0.97;
        p.waterMix = 1.0;
        p.maxOpacity = 0.44;
        p.baseScale = 0.42 + Math.random() * 0.24;
        p.growScale = 1.95;
        p.maxAge = 0.55 + Math.random() * 0.30;
      } else if (state.surfaceType === 'gravel') {
        const s = 0.36 + Math.random() * 0.12;
        p.r = s * 1.05; p.g = s; p.b = s * 0.94;
        p.waterMix = 0.0;
        p.maxOpacity = 0.34;
        p.baseScale = 0.46 + Math.random() * 0.28;
        p.growScale = 2.25;
        p.maxAge = 0.70 + Math.random() * 0.42;
      } else {
        const s = 0.30 + Math.random() * 0.10;
        p.r = s * 0.95; p.g = s * 1.04; p.b = s * 0.86;
        p.waterMix = 0.0;
        p.maxOpacity = 0.26;
        p.baseScale = 0.40 + Math.random() * 0.25;
        p.growScale = 1.95;
        p.maxAge = 0.62 + Math.random() * 0.36;
      }
      p.rot = Math.random() * Math.PI * 2;
      p.rotSpd = (Math.random() - 0.5) * 2.2;
      p.age = 0;
      p.active = true;
    }
  }

  function updateDust(dt) {
    let anyActive = false;
    for (let i = 0; i < DUST_COUNT; i++) {
      const p = dustPool[i];
      if (!p.active) {
        dustDataArr[i * 4] = 0.0;
        continue;
      }
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        dustDataArr[i * 4] = 0.0;
        _dustDummy.position.set(0, -9999, 0);
        _dustDummy.scale.setScalar(0.0001);
        _dustDummy.updateMatrix();
        dustInst.setMatrixAt(i, _dustDummy.matrix);
        continue;
      }
      anyActive = true;
      const u = p.age / p.maxAge;
      const drag = Math.exp(-2.4 * dt);
      p.vel.x *= drag;
      p.vel.z *= drag;
      p.vel.y += (p.waterMix > 0.5 ? -3.4 : 0.35) * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot += p.rotSpd * dt;

      const sc = p.baseScale + Math.pow(u, 0.72) * p.growScale;
      _dustDummy.position.copy(p.pos);
      _dustDummy.scale.setScalar(sc);
      _dustDummy.updateMatrix();
      dustInst.setMatrixAt(i, _dustDummy.matrix);

      const fadeIn = smoothstep(0.0, 0.14, u);
      const fadeOut = Math.pow(1.0 - u, 1.45);
      dustDataArr[i * 4] = fadeIn * fadeOut * p.maxOpacity;
      dustDataArr[i * 4 + 1] = p.rot;
      dustDataArr[i * 4 + 2] = p.waterMix;
      dustDataArr[i * 4 + 3] = u;

      dustColorArr[i * 3] = p.r;
      dustColorArr[i * 3 + 1] = p.g;
      dustColorArr[i * 3 + 2] = p.b;
    }
    if (anyActive) {
      dustInst.instanceMatrix.needsUpdate = true;
      dustAttr.needsUpdate = true;
      dustColAttr.needsUpdate = true;
    }
  }

  function canMount(porterPos) {
    if (!state.exists || state.printing || state.riding) return false;
    return state.pos.distanceTo(porterPos) <= 4.0;
  }

  function mount(porter) {
    if (!state.exists || state.printing || state.riding) return false;
    state.riding = true;
    state.rollAngle = 0;
    porter.setRiding(true);
    if (audioSys && audioSys.playOdradekChime) audioSys.playOdradekChime();
    return true;
  }

  function dismount(porter, terrainSystem, landmarkSystem) {
    if (!state.riding) return false;
    state.riding = false;
    state.boosting = false;
    state.braking = false;
    porter.setRiding(false);

    const rightX = Math.cos(state.yaw);
    const rightZ = -Math.sin(state.yaw);
    const exitX = state.pos.x + rightX * 1.18;
    const exitZ = state.pos.z + rightZ * 1.18;
    porter.placeAt(exitX, exitZ, state.yaw);
    state.speed *= 0.25;
    state.vel.multiplyScalar(0.25);
    if (audioSys && audioSys.setBikeAudio) audioSys.setBikeAudio(false, 0, false);
    return true;
  }

  function teleportWithRider(x, z, yaw) {
    state.speed = 0;
    state.vel.set(0, 0, 0);
    state.steerAngle = 0;
    state.rollAngle = 0;
    state.pitchOffset = 0;
    state.suspY = 0;
    state.suspVel = 0;
    alignToTerrainImmediate(x, z, yaw);
  }

  function setPrintProgressForDebug(p, porter) {
    if (!state.exists) startPrint(porter);
    state.printing = p < 1.0;
    state.printProgress = clamp(p, 0, 1);
    state.printAge = state.printProgress * PRINT_DURATION;
    updatePrintSequence(0.016, porter);
  }

  function updatePrintSequence(dt, porter) {
    state.printAge += dt;
    state.printProgress = clamp(state.printAge / PRINT_DURATION, 0, 1);

    const p = state.printProgress;
    const cutY = mix(-0.02, BIKE_HEIGHT + 0.08, p);

    printUniforms.uPrintActive.value = 1.0;
    printUniforms.uPrintCutY.value = cutY;
    printUniforms.uPrintOrigin.value.copy(state.pos);
    printUniforms.uPrintUp.value.copy(_smoothNorm);

    for (let i = 0; i < printMeshes.length; i++) {
      const pm = printMeshes[i];
      if (!pm.mesh.castShadow && cutY > pm.minY + 0.08) {
        pm.mesh.castShadow = true;
      }
    }

    root.updateMatrixWorld(true);
    evalRasterLocalPoint(Math.min(cutY, BIKE_HEIGHT), state.printAge, _localHit);
    state.laserHitWorld.copy(_localHit).applyMatrix4(root.matrixWorld);
    printUniforms.uLaserHit.value.copy(state.laserHitWorld);

    if (porter && porter.setArmLaserTarget) {
      porter.setArmLaserTarget(state.laserHitWorld, true);
    }

    if (porter && porter.getArmEmitterWorldPos) {
      porter.getArmEmitterWorldPos(_emitterPos);
    } else {
      _emitterPos.copy(state.pos).add(new THREE.Vector3(0, 2.0, -2.5));
    }

    _beamDir.subVectors(state.laserHitWorld, _emitterPos);
    const beamLen = Math.max(0.05, _beamDir.length());
    _beamDir.divideScalar(beamLen);
    _beamQuat.setFromUnitVectors(_upAxis, _beamDir);

    const pulse = 0.86 + 0.14 * Math.sin(state.printAge * 48.0);
    beamPivot.position.copy(_emitterPos);
    beamPivot.quaternion.copy(_beamQuat);
    beamCore.scale.set(0.022 * pulse, beamLen, 0.022 * pulse);
    beamGlow.scale.set(0.072 * pulse, beamLen, 0.072 * pulse);
    beamFan.scale.set(0.24 * pulse, beamLen, 0.24 * pulse);
    muzzleFlare.position.copy(_emitterPos);
    muzzleFlare.scale.setScalar(0.85 + 0.35 * pulse);

    hotSpot.position.copy(state.laserHitWorld);
    hotSpot.scale.setScalar(0.85 + 0.35 * pulse);
    hotHalo.position.copy(state.laserHitWorld);
    hotHalo.scale.setScalar(0.9 + 0.3 * Math.sin(state.printAge * 36.0));

    laserLight.position.copy(state.laserHitWorld).addScaledVector(_smoothNorm, 0.18);
    laserLight.intensity = 4.6 * pulse;

    const holoFade = smoothstep(0.0, 0.08, p) * (1.0 - smoothstep(0.92, 1.0, p));
    holoMat.uniforms.uHoloOpacity.value = holoFade;

    scanRing.position.y = clamp(cutY, 0.03, BIKE_HEIGHT);
    scanRingMat.opacity = holoFade * (0.48 + 0.14 * Math.sin(state.printAge * 24.0));
    groundPadMat.opacity = holoFade * 0.34;
    groundPad.rotation.z = state.printAge * 0.65;

    if (p > 0.02 && p < 0.98) {
      emitSpark(state.laserHitWorld);
      if (Math.random() < 0.65) emitSpark(state.laserHitWorld);
    }
    updateSparks(dt);

    if (audioSys && audioSys.setLaserPrintAudio) {
      audioSys.setLaserPrintAudio(true, p);
    }

    if (state.printProgress >= 1.0) {
      state.printing = false;
      state.completeFlash = 1.0;
      printUniforms.uPrintActive.value = 0.0;
      holoGroup.visible = false;
      fxGroup.visible = false;
      scanRingMat.opacity = 0.0;
      groundPadMat.opacity = 0.0;
      laserLight.intensity = 0.0;
      for (let i = 0; i < printMeshes.length; i++) {
        printMeshes[i].mesh.castShadow = true;
      }
      if (porter && porter.setArmLaserTarget) {
        porter.setArmLaserTarget(null, false);
      }
      if (audioSys && audioSys.setLaserPrintAudio) {
        audioSys.setLaserPrintAudio(false, 1.0);
      }
      if (audioSys && audioSys.playPrintCompleteChime) {
        audioSys.playPrintCompleteChime();
      }
    }
  }

  function updateDriving(dt, input, terrainSystem, landmarkSystem) {
    let throttle = -(input.analogY || 0);
    if (input.forward) throttle += 1;
    if (input.backward) throttle -= 1;
    throttle = clamp(throttle, -1, 1);

    let steerIn = -(input.analogX || 0);
    if (input.left) steerIn += 1;
    if (input.right) steerIn -= 1;
    steerIn = clamp(steerIn, -1, 1);

    state.boosting = input.sprint && throttle > 0.25 && state.speed > 2.0;
    const maxFwd = state.boosting ? 28.0 : 18.5;
    const maxRev = -5.8;

    state.braking = false;

    if (input.jump && state.grounded && Math.abs(state.speed) > 1.5 && throttle <= 0.1) {
      state.braking = true;
      state.speed = mix(state.speed, 0, clamp(dt * 6.5, 0, 1));
    } else if (throttle > 0.05) {
      if (state.speed < -0.5) {
        state.braking = true;
        state.speed += 26.0 * dt;
      } else {
        const accel = state.boosting ? 18.5 : 12.2;
        state.speed += throttle * accel * dt;
      }
    } else if (throttle < -0.05) {
      if (state.speed > 0.8) {
        state.braking = true;
        state.speed -= 24.0 * dt;
      } else {
        state.speed += throttle * 7.5 * dt;
      }
    } else {
      const drag = state.grounded ? 1.85 : 0.35;
      state.speed = mix(state.speed, 0, clamp(dt * drag, 0, 1));
      if (Math.abs(state.speed) < 0.06) state.speed = 0;
    }

    if (state.grounded) {
      const slopeAssist = Math.sin(state.terrainPitch);
      state.speed += slopeAssist * 6.8 * dt;
    }

    const waterDrag = state.surfaceType === 'water' ? 0.62 : 1.0;
    state.speed = clamp(state.speed, maxRev * waterDrag, maxFwd * waterDrag);

    if (input.jump && state.grounded && throttle > 0.05) {
      state.vel.y = 6.6;
      state.grounded = false;
    }

    const maxSteer = mix(0.56, 0.28, clamp(Math.abs(state.speed) / 22.0, 0, 1));
    const targetSteer = steerIn * maxSteer;
    state.steerAngle = mix(state.steerAngle, targetSteer, clamp(dt * 9.5, 0, 1));

    const speedSign = state.speed >= 0 ? 1 : -1;
    const turnAuthority = clamp(Math.abs(state.speed) / 2.2, 0, 1);
    const yawRate = steerIn * mix(2.35, 1.32, clamp(Math.abs(state.speed) / 24.0, 0, 1)) * turnAuthority * speedSign;
    state.yaw += yawRate * dt;

    const newFwdX = Math.sin(state.yaw);
    const newFwdZ = Math.cos(state.yaw);
    state.vel.x = newFwdX * state.speed;
    state.vel.z = newFwdZ * state.speed;

    const nextX = state.pos.x + state.vel.x * dt;
    const nextZ = state.pos.z + state.vel.z * dt;
    getTerrainNormal(nextX, nextZ, _groundNorm, 1.6);

    if (_groundNorm.y < 0.36 && state.grounded) {
      const pushDot = state.vel.x * _groundNorm.x + state.vel.z * _groundNorm.z;
      if (pushDot < 0) {
        state.vel.x -= _groundNorm.x * pushDot * 1.15;
        state.vel.z -= _groundNorm.z * pushDot * 1.15;
        state.speed *= 0.84;
      }
      state.pos.x += state.vel.x * dt;
      state.pos.z += state.vel.z * dt;
    } else {
      state.pos.x = nextX;
      state.pos.z = nextZ;
    }

    const terrainCols = terrainSystem ? terrainSystem.getCollidersNear(state.pos.x, state.pos.z, 7.5) : null;
    const landmarkCols = landmarkSystem ? landmarkSystem.getCollidersNear(state.pos.x, state.pos.z, 6.0) : null;

    // Smooth glancing deflection ONLY for giant vertical spires & village buildings (never stops on field rocks!)
    const resolveSolidWalls = (cols) => {
      if (!cols) return;
      const bikeR = 0.72;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (c.kind === 'rock') continue;
        if (c.kind === 'box') {
          if (c.isInterior) continue;
          const dx = state.pos.x - c.x;
          const dz = state.pos.z - c.z;
          const lx = dx * c.cosY - dz * c.sinY;
          const lz = dx * c.sinY + dz * c.cosY;
          const cx = Math.max(-c.hx, Math.min(c.hx, lx));
          const cz = Math.max(-c.hz, Math.min(c.hz, lz));
          const dlx = lx - cx;
          const dlz = lz - cz;
          const dist = Math.hypot(dlx, dlz);
          if (dist < bikeR) {
            let nlx = 0;
            let nlz = 0;
            let push = 0;
            if (dist > 0.0001) {
              nlx = dlx / dist;
              nlz = dlz / dist;
              push = bikeR - dist;
            } else {
              const ox = c.hx - Math.abs(lx);
              const oz = c.hz - Math.abs(lz);
              if (ox < oz) { nlx = lx >= 0 ? 1 : -1; push = ox + bikeR; }
              else { nlz = lz >= 0 ? 1 : -1; push = oz + bikeR; }
            }
            const nx = nlx * c.cosY + nlz * c.sinY;
            const nz = -nlx * c.sinY + nlz * c.cosY;
            state.pos.x += nx * push;
            state.pos.z += nz * push;
            const fx = Math.sin(state.yaw);
            const fz = Math.cos(state.yaw);
            const headOn = -(fx * nx + fz * nz);
            if (headOn > 0.0) {
              const cross = fx * nz - fz * nx;
              const deflectDir = cross >= 0 ? 1 : -1;
              state.yaw += deflectDir * clamp((1.0 - headOn * 0.5) * 2.2 * dt, 0, 0.22);
              state.speed *= mix(0.95, 0.70, clamp(headOn, 0, 1));
            }
          }
          continue;
        }
        const dx = state.pos.x - c.x;
        const dz = state.pos.z - c.z;
        const d = Math.hypot(dx, dz);
        const minR = c.r + bikeR;
        if (d > 0.001 && d < minR) {
          const nx = dx / d;
          const nz = dz / d;
          state.pos.x = c.x + nx * minR;
          state.pos.z = c.z + nz * minR;
          const fx = Math.sin(state.yaw);
          const fz = Math.cos(state.yaw);
          const headOn = -(fx * nx + fz * nz);
          if (headOn > 0.0) {
            const cross = fx * nz - fz * nx;
            const deflectDir = cross >= 0 ? 1 : -1;
            state.yaw += deflectDir * clamp((1.0 - headOn * 0.5) * 2.2 * dt, 0, 0.22);
            const keepFactor = mix(0.95, 0.70, clamp(headOn, 0, 1));
            state.speed *= keepFactor;
          }
        }
      }
    };
    resolveSolidWalls(terrainCols);
    resolveSolidWalls(landmarkCols);

    // 2-Wheel Independent Ground & 3D Boulder Surface Contact Sampling
    const fwdX2 = Math.sin(state.yaw);
    const fwdZ2 = Math.cos(state.yaw);
    const rightX2 = Math.cos(state.yaw);
    const rightZ2 = -Math.sin(state.yaw);

    const FRONT_Z = 0.84;
    const REAR_Z = -0.82;
    const WHEELBASE = FRONT_Z - REAR_Z;

    const frontInfo = { y: 0, baseY: 0, onRock: false, inCave: false, lakeSub: 0 };
    const rearInfo = { y: 0, baseY: 0, onRock: false, inCave: false, lakeSub: 0 };
    const frontGroundY = sampleBikeSurfaceY(
      state.pos.x + fwdX2 * FRONT_Z,
      state.pos.z + fwdZ2 * FRONT_Z,
      state.pos.y,
      terrainCols,
      frontInfo
    );
    const rearGroundY = sampleBikeSurfaceY(
      state.pos.x + fwdX2 * REAR_Z,
      state.pos.z + fwdZ2 * REAR_Z,
      state.pos.y,
      terrainCols,
      rearInfo
    );
    const leftGroundY = sampleBikeSurfaceY(
      state.pos.x + rightX2 * 0.48,
      state.pos.z + rightZ2 * 0.48,
      state.pos.y,
      terrainCols
    );
    const rightGroundY = sampleBikeSurfaceY(
      state.pos.x - rightX2 * 0.48,
      state.pos.z - rightZ2 * 0.48,
      state.pos.y,
      terrainCols
    );

    const wheelAvgY = (frontGroundY + rearGroundY) * 0.5;
    state.onRock = frontInfo.onRock || rearInfo.onRock;
    state.lastGroundY = wheelAvgY;

    sampleWorld(state.pos.x, state.pos.z, _tmpSample);
    const caveInfo = getRiverCaveState(state.pos.x, state.pos.z, state.pos.y);
    const lakeSub = _tmpSample.lakeDepth || 0;
    if (lakeSub > 0.75) {
      state.speed *= Math.max(0.25, 1.0 - dt * 2.8);
    }

    // Critically-Damped Long-Travel Off-Road Suspension
    const MAX_COMP = 0.36;
    const MAX_DROOP = 0.38;
    const groundRiseRate = dt > 0.0001 ? clamp((wheelAvgY - state.prevWheelAvgY) / dt, -10, 12) : 0;
    state.prevWheelAvgY = wheelAvgY;

    state.wasGrounded = state.grounded;
    const rideError = wheelAvgY - state.pos.y;

    if (state.grounded) {
      const steepDrop = rideError < -MAX_DROOP && groundRiseRate < -2.4 && Math.abs(state.speed) > 11.5;
      const fastRockLaunch = state.onRock && frontGroundY > rearGroundY + 0.18 && Math.abs(state.speed) > 10.0 && groundRiseRate > 2.2;
      if (steepDrop || fastRockLaunch) {
        state.grounded = false;
        if (fastRockLaunch) {
          state.vel.y = clamp(Math.max(state.vel.y, groundRiseRate * 0.65) + 1.2, 2.2, 5.8);
        }
      }
    }

    if (state.grounded) {
      const kSpring = 21.0;
      const cDamper = 11.2;
      const compExcess = Math.max(0, rideError - 0.22);
      const progBumpForce = compExcess * compExcess * 180.0;
      const rampKick = (frontInfo.onRock && groundRiseRate > 1.5 && Math.abs(state.speed) > 6.5)
        ? clamp(groundRiseRate * 0.38, 0, 3.4)
        : 0.0;
      const springAccel = rideError * kSpring + progBumpForce - (state.vel.y - rampKick) * cDamper;
      state.vel.y += springAccel * dt;
      state.pos.y += state.vel.y * dt;

      if (state.pos.y < wheelAvgY - MAX_COMP) {
        state.pos.y = wheelAvgY - MAX_COMP;
        if (state.vel.y < groundRiseRate * 0.35) state.vel.y = groundRiseRate * 0.35;
      } else if (state.pos.y > wheelAvgY + MAX_DROOP) {
        if (state.vel.y > 1.6 && Math.abs(state.speed) > 9.5) {
          state.grounded = false;
        } else {
          state.pos.y = wheelAvgY + MAX_DROOP;
          if (state.vel.y > 0) state.vel.y *= 0.2;
        }
      }
    } else {
      state.vel.y -= 19.5 * dt;
      state.pos.y += state.vel.y * dt;
      if (state.pos.y <= wheelAvgY + 0.10) {
        if (state.vel.y < -3.2 && audioSys && audioSys.playFootstep) {
          audioSys.playFootstep(state.surfaceType, true);
        }
        state.vel.y *= 0.42;
        state.pos.y = Math.max(state.pos.y, wheelAvgY - MAX_COMP * 0.80);
        state.grounded = true;
      }
    }

    const isWet = caveInfo.inCave || _tmpSample.riverDepth > 0.16 || lakeSub > 0.14;
    if (isWet) state.surfaceType = 'water';
    else if (state.onRock || _tmpSample.scree > 0.45 || _tmpSample.path > 0.35) state.surfaceType = 'gravel';
    else state.surfaceType = 'moss';

    const targetTerrainPitch = state.grounded
      ? clamp(-Math.atan2(frontGroundY - rearGroundY, WHEELBASE), -0.62, 0.62)
      : clamp(-state.vel.y * 0.042, -0.34, 0.34);
    const targetTerrainRoll = state.grounded
      ? clamp(Math.atan2(leftGroundY - rightGroundY, 0.96), -0.40, 0.40)
      : 0.0;

    const pitchRate = state.grounded ? 4.8 : 2.4;
    state.terrainPitch = mix(state.terrainPitch, targetTerrainPitch, 1.0 - Math.exp(-pitchRate * dt));
    state.terrainRoll = mix(state.terrainRoll, targetTerrainRoll, 1.0 - Math.exp(-(state.grounded ? 4.4 : 2.2) * dt));

    const chassisFrontY = state.pos.y - Math.sin(state.terrainPitch) * FRONT_Z;
    const chassisRearY = state.pos.y - Math.sin(state.terrainPitch) * REAR_Z;
    const targetFrontTravel = state.grounded
      ? clamp(frontGroundY - chassisFrontY, -0.22, 0.28)
      : -0.18;
    const targetRearTravel = state.grounded
      ? clamp(rearGroundY - chassisRearY, -0.22, 0.26)
      : -0.18;
    const wheelResp = 1.0 - Math.exp(-16.0 * dt);
    state.frontWheelTravel = mix(state.frontWheelTravel, targetFrontTravel, wheelResp);
    state.rearWheelTravel = mix(state.rearWheelTravel, targetRearTravel, wheelResp);

    const targetRoll = -steerIn * clamp(Math.abs(state.speed) / 14.0, 0, 1) * 0.42 * speedSign;
    state.rollAngle = mix(state.rollAngle, targetRoll, clamp(dt * 8.0, 0, 1));

    let targetPitch = 0;
    if (state.grounded) {
      if (state.braking) targetPitch = 0.075;
      else if (state.boosting) targetPitch = -0.085;
      else if (throttle > 0.2) targetPitch = -0.036;
    }
    state.pitchOffset = mix(state.pitchOffset, targetPitch, clamp(dt * 6.5, 0, 1));
    state.suspY = 0;

    state.wheelSpinAngle += (state.speed / WHEEL_RADIUS) * dt;
    frontWheelSpin.rotation.x = state.wheelSpinAngle;
    rearWheelSpin.rotation.x = state.wheelSpinAngle;
    steerPivot.rotation.y = state.steerAngle * 0.92;

    emitRearDust(dt);
  }

  function update(dt, input, porter, terrainSystem, landmarkSystem) {
    const safeDt = Math.min(dt, 0.05);
    updateDust(safeDt);

    if (!state.exists) return;

    if (state.printing) {
      updatePrintSequence(safeDt, porter);
      applyRootTransform();
      return;
    }

    if (state.completeFlash > 0) {
      state.completeFlash = Math.max(0, state.completeFlash - safeDt * 1.4);
    }

    if (state.riding) {
      updateDriving(safeDt, input, terrainSystem, landmarkSystem);
    } else if (Math.abs(state.speed) > 0.05) {
      state.speed = mix(state.speed, 0, clamp(safeDt * 4.5, 0, 1));
      state.pos.x += Math.sin(state.yaw) * state.speed * safeDt;
      state.pos.z += Math.cos(state.yaw) * state.speed * safeDt;
      const parkCols = terrainSystem ? terrainSystem.getCollidersNear(state.pos.x, state.pos.z, 6.0) : null;
      const parkY = sampleBikeSurfaceY(state.pos.x, state.pos.z, state.pos.y, parkCols);
      state.pos.y = mix(state.pos.y, parkY, clamp(safeDt * 10.0, 0, 1));
      state.frontWheelTravel = mix(state.frontWheelTravel, 0, clamp(safeDt * 8.0, 0, 1));
      state.rearWheelTravel = mix(state.rearWheelTravel, 0, clamp(safeDt * 8.0, 0, 1));
      state.wheelSpinAngle += (state.speed / WHEEL_RADIUS) * safeDt;
      frontWheelSpin.rotation.x = state.wheelSpinAngle;
      rearWheelSpin.rotation.x = state.wheelSpinAngle;
    }

    applyRootTransform();
    root.updateMatrixWorld(true);

    // Sync permanent scene-level headlight SpotLight position & intensity (ZERO shader recompiles!)
    const caveInfo = getRiverCaveState(state.pos.x, state.pos.z, state.pos.y);
    const darkNeed = Math.max(smoothstep(0.25, 0.80, ATMO_UNIFORMS.uNightFactor.value), caveInfo.darkness || 0);
    const activeGlow = state.riding ? 1.0 : 0.45;
    headlightOriginAnchor.getWorldPosition(_hlOriginW);
    headlightAimAnchor.getWorldPosition(_hlAimW);
    headlightSpot.position.copy(_hlOriginW);
    headlightTarget.position.copy(_hlAimW);
    headlightSpot.intensity = state.riding ? (6.5 + darkNeed * 28.0) : darkNeed * 5.0;

    tailLedMat.emissiveIntensity = state.braking ? 3.2 : (state.riding ? 1.35 : 0.55);
    cyanLedMat.emissiveIntensity = (state.boosting ? 2.8 : 1.75) * activeGlow + state.completeFlash * 2.0;

    if (state.riding && porter) {
      riderSeatAnchor.getWorldPosition(_seatWorldPos);
      riderSeatAnchor.getWorldQuaternion(_seatWorldQuat);
      leftGripAnchor.getWorldPosition(_leftGripW);
      rightGripAnchor.getWorldPosition(_rightGripW);
      leftFootpegAnchor.getWorldPosition(_leftPegW);
      rightFootpegAnchor.getWorldPosition(_rightPegW);

      porter.syncRidingPose(safeDt, {
        bikePos: state.pos,
        bikeYaw: state.yaw,
        bikeSpeed: state.speed,
        steerAngle: state.steerAngle,
        suspVel: state.vel.y,
        boosting: state.boosting,
        braking: state.braking,
        seatWorldPos: _seatWorldPos,
        seatWorldQuat: _seatWorldQuat,
        leftGripWorld: _leftGripW,
        rightGripWorld: _rightGripW,
        leftPegWorld: _leftPegW,
        rightPegWorld: _rightPegW
      });
    }

    if (audioSys && audioSys.setBikeAudio) {
      audioSys.setBikeAudio(state.riding, Math.abs(state.speed), state.boosting);
    }
  }

  return {
    root,
    state,
    prewarmShaders,
    startPrint,
    clear,
    canMount,
    mount,
    dismount,
    teleportWithRider,
    setPrintProgressForDebug,
    update
  };
}
