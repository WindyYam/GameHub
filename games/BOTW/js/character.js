import * as THREE from 'three';
import { enhancePBRMaterial } from './atmosphere.js';

export function createAdventurer(texLib) {
  const root = new THREE.Group();

  const tunicMat = new THREE.MeshStandardMaterial({
    map: texLib.tunicFabric.map,
    normalMap: texLib.tunicFabric.normalMap,
    roughness: 0.78,
    metalness: 0.04
  });
  const undershirtMat = new THREE.MeshStandardMaterial({
    color: 0xd8ceb8,
    roughness: 0.85
  });
  const leatherMat = new THREE.MeshStandardMaterial({
    map: texLib.leather.map,
    normalMap: texLib.leather.normalMap,
    roughness: 0.62,
    metalness: 0.08
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x3b3d46,
    roughness: 0.86
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xe6b995,
    roughness: 0.68
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x8b673c,
    roughness: 0.68,
    metalness: 0.03
  });
  const metalGoldMat = new THREE.MeshStandardMaterial({
    color: 0xdab45c,
    roughness: 0.34,
    metalness: 0.82
  });
  const metalSteelMat = new THREE.MeshStandardMaterial({
    color: 0xaab4c2,
    roughness: 0.28,
    metalness: 0.88
  });
  const bladeGlowMat = new THREE.MeshStandardMaterial({
    color: 0xc8e4f4,
    emissive: 0x38d8ff,
    emissiveIntensity: 0.15,
    roughness: 0.18,
    metalness: 0.90
  });
  const scarfMat = new THREE.MeshStandardMaterial({
    color: 0x9c3a28,
    roughness: 0.82,
    side: THREE.DoubleSide
  });

  [
    tunicMat,
    undershirtMat,
    leatherMat,
    pantsMat,
    skinMat,
    hairMat,
    metalGoldMat,
    metalSteelMat,
    bladeGlowMat,
    scarfMat
  ].forEach((m, idx) => enhancePBRMaterial(m, { cacheKey: `botw_char_${idx}` }));

  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // Anatomical sculpted tunic profile (LatheGeometry: flared skirt -> cinched waist -> broad chest/shoulders)
  const tunicProfile = [
    new THREE.Vector2(0.01, 0.56),
    new THREE.Vector2(0.30, 0.57),
    new THREE.Vector2(0.26, 0.72),
    new THREE.Vector2(0.21, 0.88),
    new THREE.Vector2(0.23, 1.15),
    new THREE.Vector2(0.255, 1.38),
    new THREE.Vector2(0.20, 1.49),
    new THREE.Vector2(0.11, 1.52)
  ];
  const tunicGeo = new THREE.LatheGeometry(tunicProfile, 16);
  tunicGeo.scale(1.04, 1.0, 0.76); // realistic shoulder-to-chest depth proportion!
  const torso = new THREE.Mesh(tunicGeo, tunicMat);
  torso.castShadow = torso.receiveShadow = true;
  bodyPivot.add(torso);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.032, 8, 16), undershirtMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.50;
  bodyPivot.add(collar);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.078, 0.14, 10), skinMat);
  neck.position.y = 1.55;
  neck.castShadow = true;
  bodyPivot.add(neck);

  // Leather belt, gold buckle & side hip pouch
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.222, 0.226, 0.075, 14), leatherMat);
  belt.scale.set(1.04, 1.0, 0.78);
  belt.position.y = 0.87;
  bodyPivot.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.035), metalGoldMat);
  buckle.position.set(0, 0.87, -0.185);
  bodyPivot.add(buckle);

  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.13, 0.075), leatherMat);
  pouch.position.set(0.22, 0.82, 0.04);
  pouch.rotation.z = -0.15;
  pouch.castShadow = true;
  bodyPivot.add(pouch);

  // Diagonal leather baldric strap & curved shoulder guard
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.024, 6, 18), leatherMat);
  strap.position.set(0, 1.18, 0);
  strap.rotation.set(0.18, 0, -0.78);
  strap.scale.set(0.95, 1.24, 0.76);
  bodyPivot.add(strap);

  const pauldron = new THREE.Mesh(
    new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    leatherMat
  );
  pauldron.position.set(-0.26, 1.41, 0);
  pauldron.rotation.z = 0.52;
  pauldron.scale.set(1.0, 0.82, 1.12);
  pauldron.castShadow = true;
  bodyPivot.add(pauldron);

  // Draped traveler's shoulder mantle/capelet & flowing weathered scarf
  const mantleGeo = new THREE.CylinderGeometry(0.15, 0.34, 0.28, 16, 4, true, -Math.PI * 0.65, Math.PI * 1.3);
  const mp = mantleGeo.attributes.position;
  for (let i = 0; i < mp.count; i++) {
    const x = mp.getX(i);
    const y = mp.getY(i);
    const z = mp.getZ(i);
    const fold = Math.sin(Math.atan2(x, z) * 6.0) * 0.018 * (0.14 - y);
    mp.setXYZ(i, x * 1.05, y, z * 0.82 + fold);
  }
  mantleGeo.computeVertexNormals();
  const hoodCowl = new THREE.Mesh(mantleGeo, scarfMat);
  hoodCowl.position.set(0, 1.41, 0.02);
  hoodCowl.castShadow = true;
  bodyPivot.add(hoodCowl);

  const scarfGeo = new THREE.PlaneGeometry(0.20, 0.62, 3, 6);
  scarfGeo.translate(0, -0.31, 0);
  const sp = scarfGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i);
    sp.setX(i, sp.getX(i) * (1.0 - (-y / 0.62) * 0.35));
    sp.setZ(i, Math.sin(-y * 5.0) * 0.025);
  }
  scarfGeo.computeVertexNormals();
  const scarf = new THREE.Mesh(scarfGeo, scarfMat);
  scarf.position.set(0, 1.45, 0.19);
  scarf.rotation.x = 0.22;
  scarf.castShadow = true;
  bodyPivot.add(scarf);

  // Back Gear: Sword Scabbard + Winged Gold Crossguard + Sculpted Hylian Kite Shield + Quiver
  const scabbard = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.86, 0.042), leatherMat);
  scabbard.position.set(0.03, 1.18, 0.21);
  scabbard.rotation.z = -0.48;
  scabbard.castShadow = true;
  bodyPivot.add(scabbard);

  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.20, 8), metalSteelMat);
  hilt.position.set(-0.18, 1.58, 0.21);
  hilt.rotation.z = -0.48;
  bodyPivot.add(hilt);

  const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.032, 0.04), metalGoldMat);
  crossguard.position.set(-0.12, 1.49, 0.21);
  crossguard.rotation.z = -0.48;
  bodyPivot.add(crossguard);

  const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.036, 0.44, 8), leatherMat);
  quiver.position.set(0.16, 1.18, 0.20);
  quiver.rotation.z = 0.36;
  quiver.castShadow = true;
  bodyPivot.add(quiver);

  for (let a = 0; a < 3; a++) {
    const arrow = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 5), undershirtMat);
    arrow.position.set(0.24 + (a - 1) * 0.022, 1.42, 0.20 + (a % 2) * 0.015);
    arrow.rotation.z = 0.36 + (a - 1) * 0.06;
    bodyPivot.add(arrow);
  }

  // Sculpted Curved Hylian-Style Heater/Kite Shield on back
  const shieldGroup = new THREE.Group();
  shieldGroup.position.set(-0.02, 1.13, 0.255);
  shieldGroup.rotation.set(0.08, 0.05, 0);

  const shieldShape = new THREE.Shape();
  shieldShape.moveTo(0, 0.24);
  shieldShape.quadraticCurveTo(0.19, 0.23, 0.21, 0.06);
  shieldShape.quadraticCurveTo(0.19, -0.14, 0, -0.28);
  shieldShape.quadraticCurveTo(-0.19, -0.14, -0.21, 0.06);
  shieldShape.quadraticCurveTo(-0.19, 0.23, 0, 0.24);

  const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 });
  const shieldFace = new THREE.Mesh(shieldGeo, tunicMat);
  shieldFace.castShadow = true;
  const shieldTrim = new THREE.Mesh(shieldGeo, metalGoldMat);
  shieldTrim.scale.set(1.08, 1.07, 0.72);
  shieldTrim.position.z = -0.003;
  const shieldBoss = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 1), metalGoldMat);
  shieldBoss.scale.set(1.0, 1.3, 0.55);
  shieldBoss.position.set(0, 0.02, 0.032);
  shieldGroup.add(shieldTrim, shieldFace, shieldBoss);
  bodyPivot.add(shieldGroup);

  // Proportional Head & Smooth Sculpted Layered Hair (NO spiky cones!)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.67, -0.01);
  bodyPivot.add(headGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.146, 16, 14), skinMat);
  head.scale.set(0.92, 1.06, 0.96);
  head.castShadow = true;
  headGroup.add(head);

  const hairGeo = new THREE.SphereGeometry(0.162, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.72);
  const hp = hairGeo.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i);
    const y = hp.getY(i);
    const z = hp.getZ(i);
    const ang = Math.atan2(x, z);
    // Natural layered strand contour waves wrapping cleanly over skull & nape
    const strand = Math.sin(ang * 9.0) * 0.008 + Math.cos(y * 22.0 + ang * 3.0) * 0.006;
    const napePull = z > 0.02 && y < 0.02 ? 1.08 : 1.0;
    hp.setXYZ(i, x * (1.0 + strand), y, z * (1.0 + strand) * napePull);
  }
  hairGeo.computeVertexNormals();
  const hairCrown = new THREE.Mesh(hairGeo, hairMat);
  hairCrown.position.set(0, 0.022, 0.016);
  hairCrown.rotation.x = 0.22;
  hairCrown.castShadow = true;
  headGroup.add(hairCrown);

  // Smooth curved side-locks framing ears & cheeks
  for (const side of [-1, 1]) {
    const lock = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), hairMat);
    lock.scale.set(0.55, 1.9, 0.72);
    lock.position.set(side * 0.132, -0.02, -0.04);
    lock.rotation.set(-0.18, 0, side * 0.14);
    headGroup.add(lock);
  }

  // Sleek wind-swept ponytail
  const ponytailGeo = new THREE.CylinderGeometry(0.036, 0.012, 0.26, 8);
  ponytailGeo.translate(0, -0.13, 0);
  const ponytail = new THREE.Mesh(ponytailGeo, hairMat);
  ponytail.position.set(0, 0.01, 0.155);
  ponytail.rotation.x = 0.42;
  ponytail.castShadow = true;
  headGroup.add(ponytail);

  // Articulated Limbs with Bracers & Cuffed Boots
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.265, 1.41, 0);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.056, 0.31, 9), tunicMat);
    upper.position.y = -0.155;
    upper.castShadow = true;
    pivot.add(upper);

    const bracer = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.046, 0.24, 9), leatherMat);
    bracer.position.y = -0.41;
    bracer.castShadow = true;
    pivot.add(bracer);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.046, 8, 6), skinMat);
    hand.position.y = -0.55;
    pivot.add(hand);

    return pivot;
  }

  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.115, 0.74, 0);

    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.068, 0.40, 10), pantsMat);
    thigh.position.y = -0.20;
    thigh.castShadow = true;
    pivot.add(thigh);

    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.070, 0.076, 0.36, 10), leatherMat);
    boot.position.y = -0.54;
    boot.castShadow = true;
    pivot.add(boot);

    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.080, 0.074, 0.065, 10), leatherMat);
    cuff.position.y = -0.38;
    pivot.add(cuff);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.07, 0.19), leatherMat);
    foot.position.set(0, -0.71, -0.045);
    foot.castShadow = true;
    pivot.add(foot);

    return pivot;
  }

  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);
  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);
  bodyPivot.add(leftArm, rightArm, leftLeg, rightLeg);

  // Detailed Paraglider Canopy
  const gliderGroup = new THREE.Group();
  gliderGroup.position.set(0, 2.28, 0);
  gliderGroup.visible = false;

  const clothMat = new THREE.MeshStandardMaterial({
    map: texLib.paragliderCloth,
    roughness: 0.72,
    side: THREE.DoubleSide
  });
  enhancePBRMaterial(clothMat, { cacheKey: 'botw_glider_cloth', subsurfaceStrength: 0.35 });

  function makeWing(side) {
    const wg = new THREE.PlaneGeometry(1.92, 1.18, 12, 6);
    const p = wg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i); // -0.96..+0.96
      const y = p.getY(i); // -0.59..+0.59
      // Spanwise fraction 0 (root) -> 1 (outer wingtip)
      const u = clamp01((side * x + 0.96) / 1.92);
      // Taper chord gracefully toward wingtip + gull-wing swept-back curvature + scalloped trailing edge
      const chordScale = 1.0 - Math.pow(u, 1.65) * 0.56;
      const sweepZ = -Math.pow(u, 1.5) * 0.42;
      const scallop = y < 0 ? Math.sin(u * Math.PI * 3.0) * 0.065 : 0.0;
      const newY = y * chordScale + sweepZ + scallop;
      const camber = Math.cos((y / 0.59) * Math.PI * 0.5) * 0.14 * (1.0 - u * 0.35);
      const dihedral = -Math.pow(u, 1.6) * 0.12;
      p.setXYZ(i, x, newY, camber + dihedral);
    }
    wg.computeVertexNormals();
    const w = new THREE.Mesh(wg, clothMat);
    w.position.set(side * 0.88, 0.12, 0.02);
    w.rotation.set(-Math.PI / 2 + 0.08, 0, side * 0.12);
    w.castShadow = true;

    // Underside bamboo wing ribs tucked cleanly beneath the airfoil canopy
    for (const rFrac of [0.35, 0.72]) {
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.010, 0.92 * (1.0 - rFrac * 0.35), 6), leatherMat);
      rib.rotation.x = Math.PI / 2 + 0.06;
      rib.rotation.z = -side * rFrac * 0.25;
      rib.position.set(side * (0.28 + rFrac * 0.85), 0.07, 0.06 + rFrac * 0.12);
      gliderGroup.add(rib);
    }

    // Slender trailing crimson wingtip streamer ribbon behind trailing edge
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.44), scarfMat);
    ribbon.position.set(side * 1.78, 0.01, 0.64);
    ribbon.rotation.x = 1.48;
    gliderGroup.add(ribbon);

    return w;
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  gliderGroup.add(makeWing(-1), makeWing(1));

  const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 3.55, 8), leatherMat);
  spar.rotation.z = Math.PI / 2;
  spar.position.y = 0.05;
  gliderGroup.add(spar);

  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 1.18, 8), leatherMat);
  spine.rotation.x = Math.PI / 2;
  spine.position.set(0, 0.08, 0.04);
  gliderGroup.add(spine);

  const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.92, 8), leatherMat);
  handleBar.rotation.z = Math.PI / 2;
  handleBar.position.y = -0.35;
  gliderGroup.add(handleBar);

  for (const s of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.48, 6), leatherMat);
    strut.position.set(s * 0.36, -0.16, 0);
    strut.rotation.z = -s * 0.25;
    gliderGroup.add(strut);
  }

  bodyPivot.add(gliderGroup);

  // Drawn Master Broadsword attached to Right Hand Pivot (hidden until attacking!)
  const handSword = new THREE.Group();
  handSword.position.set(0, -0.54, -0.02);
  handSword.rotation.x = -Math.PI * 0.46;
  handSword.visible = false;

  const sGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.22, 8), leatherMat);
  const sPommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.036, 0), metalGoldMat);
  sPommel.position.y = -0.12;
  const sGuard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.038, 0.055), metalGoldMat);
  sGuard.position.y = 0.11;
  const sBlade = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.92, 0.022), bladeGlowMat);
  sBlade.position.y = 0.58;
  sBlade.castShadow = true;
  const sTip = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.16, 4), bladeGlowMat);
  sTip.rotation.y = Math.PI * 0.25;
  sTip.position.y = 1.12;
  handSword.add(sGrip, sPommel, sGuard, sBlade, sTip);
  rightArm.add(handSword);

  // 3D Energy Crescent Slash Arc (sweeps gracefully around hero during melee combos & spin attacks!)
  const slashGeo = new THREE.RingGeometry(1.15, 2.35, 28, 1, -Math.PI * 0.62, Math.PI * 1.24);
  slashGeo.rotateX(-Math.PI / 2);
  const slashMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      uProgress: { value: 0.0 },
      uOpacity: { value: 0.0 },
      uSpinMode: { value: 0.0 }
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uProgress;
      uniform float uOpacity;
      uniform float uSpinMode;
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        float ang = (atan(vPos.z, vPos.x) / 3.14159265) * 0.5 + 0.5;
        float rad = clamp((length(vPos.xz) - 1.15) / 1.20, 0.0, 1.0);
        float edge = smoothstep(0.05, 0.55, rad) * (1.0 - smoothstep(0.82, 1.0, rad));
        float streak = smoothstep(0.0, 0.4, vUv.x) * (1.0 - smoothstep(0.6, 1.0, vUv.x));
        vec3 colGold = mix(vec3(0.25, 0.85, 1.0), vec3(1.15, 0.92, 0.45), rad);
        vec3 colSpin = mix(vec3(0.35, 0.95, 1.25), vec3(1.1, 1.0, 0.72), rad);
        vec3 col = mix(colGold, colSpin, uSpinMode) * (1.2 + streak * 0.5);
        gl_FragColor = vec4(col, edge * uOpacity);
      }
    `
  });
  const slashArc = new THREE.Mesh(slashGeo, slashMat);
  slashArc.position.set(0, 1.12, 0);
  slashArc.visible = false;
  bodyPivot.add(slashArc);

  return {
    root,
    bodyPivot,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    gliderGroup,
    ponytail,
    scarf,
    handSword,
    backHilt: hilt,
    backCrossguard: crossguard,
    slashArc,
    slashMat
  };
}
