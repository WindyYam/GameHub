        // =====================================================================
        // FULL HUNTER REBUILD: sculpted face, layered coat, harness, gloves, boots
        // (rig interface preserved: upperBody / legL / legR / armFront / armBack / coatPanels / hairStrands)
        // =====================================================================
        const matMetal = new THREE.MeshStandardMaterial({ color: 0x9aa3b2, roughness: 0.32, metalness: 0.9, emissive: 0x1a1d24, emissiveIntensity: 0.3 });
        const matGlove = new THREE.MeshStandardMaterial({ map: coatPBR.map, normalMap: coatPBR.normalMap, color: 0x8a6a52, emissive: 0x2a1a10, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.1 });
        const matHair = new THREE.MeshStandardMaterial({ color: 0x4a3226, emissive: 0x20130d, emissiveIntensity: 0.6, roughness: 0.42, metalness: 0.18, side: THREE.DoubleSide });
        const matBrow = new THREE.MeshStandardMaterial({ color: 0x2a1c16, roughness: 0.7 });
        const matEyeWhite = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.3, emissive: 0x303030, emissiveIntensity: 0.4 });
        const matIris = new THREE.MeshStandardMaterial({ color: 0x4a6a8e, roughness: 0.2, emissive: 0x16243a, emissiveIntensity: 0.8 });
        const matLip = new THREE.MeshStandardMaterial({ color: 0xa8665a, roughness: 0.5 });
        const put = (geo, mat, parent, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, shadow = false) => {
          const m = new THREE.Mesh(geo, mat);
          m.position.set(x, y, z);
          m.rotation.set(rx, ry, rz);
          m.scale.set(sx, sy, sz);
          if (shadow) m.castShadow = true;
          parent.add(m);
          return m;
        };

        // Upper Body Group (leans dynamically in combat lunge & crouching)
        const upperBody = new THREE.Group();
        upperBody.position.y = 0.98;
        bodyPivot.add(upperBody);
        this.hero.upperBody = upperBody;

        // --- Torso: waistcoat core with defined chest, abdomen and lats ---
        const torsoPts = [
          new THREE.Vector2(0.0, 0.0),
          new THREE.Vector2(0.158, 0.015),
          new THREE.Vector2(0.150, 0.12),
          new THREE.Vector2(0.168, 0.30),
          new THREE.Vector2(0.215, 0.48),
          new THREE.Vector2(0.236, 0.60),
          new THREE.Vector2(0.17, 0.70),
          new THREE.Vector2(0.09, 0.74),
          new THREE.Vector2(0.0, 0.74)
        ];
        const torsoGeo = new THREE.LatheGeometry(torsoPts, 28);
        torsoGeo.scale(0.80, 1.0, 1.22);
        put(torsoGeo, matWaistcoat, upperBody, 0, 0, 0, 0, 0, 0, 1, 1, 1, true);
        // Pectoral volume under the shirt
        for (const s of [-1, 1]) put(new THREE.SphereGeometry(0.1, 14, 12), matIvoryShirt, upperBody, 0.1, 0.5, s * 0.085, 0, 0, 0, 0.8, 0.9, 0.9);

        // --- Open coat shell (front opening at +X) with rolled hem line ---
        const coatShellGeo = new THREE.CylinderGeometry(0.252, 0.2, 0.7, 32, 4, true, Math.PI * 0.74, Math.PI * 1.52);
        coatShellGeo.scale(0.85, 1.0, 1.26);
        put(coatShellGeo, matCoatLeather, upperBody, -0.012, 0.35, 0, 0, 0, 0, 1, 1, 1, true);
        // Dark leather coat seam bands + gold piping down the back / waist seam
        put(new THREE.TorusGeometry(0.205, 0.008, 6, 40, Math.PI * 1.5), this.matGoldTrim, upperBody, -0.012, 0.06, 0, Math.PI * 0.5, 0, Math.PI * 0.74, 0.85, 1.26, 1);

        // --- Ivory shirt, open placket and cravat ---
        const shirtV = put(new THREE.ConeGeometry(0.12, 0.34, 12), matIvoryShirt, upperBody, 0.158, 0.55, 0, Math.PI, 0, 0, 0.55, 1.0, 1.2);
        for (let i = 0; i < 4; i++) {
          // Ruffle layers
          put(new THREE.TorusGeometry(0.052 + i * 0.001, 0.012, 6, 12), matIvoryShirt, upperBody, 0.168 - i * 0.005, 0.66 - i * 0.045, 0, 0, Math.PI * 0.5, 0, 1, 1.2, 1);
        }
        put(new THREE.SphereGeometry(0.052, 12, 12), matIvoryShirt, upperBody, 0.162, 0.67, 0, 0, 0, 0, 0.8, 1.1, 1.15);

        // --- Lapels: shaped peak lapels with gold edge ---
        const lapelShape = new THREE.Shape();
        lapelShape.moveTo(0, 0);
        lapelShape.lineTo(0.05, 0.02);
        lapelShape.lineTo(0.085, 0.3);
        lapelShape.lineTo(0.12, 0.5);
        lapelShape.lineTo(0.03, 0.56);
        lapelShape.lineTo(-0.02, 0.3);
        lapelShape.closePath();
        const lapelGeo = new THREE.ExtrudeGeometry(lapelShape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 });
        for (const s of [-1, 1]) {
          const lap = put(lapelGeo, matCoatLeather, upperBody, 0.185, 0.14, s * 0.15 - 0.01, 0, s * 0.42, 0, 1, 1, 1, true);
          put(new THREE.BoxGeometry(0.014, 0.52, 0.014), this.matGoldTrim, upperBody, 0.2, 0.40, s * 0.15, s * 0.1, s * 0.3, -0.06);
        }

        // --- High upturned collar ---
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.135, 0.2, 24, 1, true, Math.PI * 0.76, Math.PI * 1.48), matCoatLeather);
        collar.position.set(-0.012, 0.76, 0);
        collar.rotation.z = -0.1;
        collar.castShadow = true;
        upperBody.add(collar);

        // --- Shoulder mantle (layered cape-let) ---
        for (let L = 0; L < 2; L++) {
          const mantlePts = [
            new THREE.Vector2(0.115, 0.22),
            new THREE.Vector2(0.21, 0.17),
            new THREE.Vector2(0.285 + L * 0.02, 0.04 - L * 0.07),
            new THREE.Vector2(0.298 + L * 0.02, -0.09 - L * 0.1)
          ];
          const mantleGeo = new THREE.LatheGeometry(mantlePts, 28, Math.PI * 0.74, Math.PI * 1.52);
          mantleGeo.scale(0.84, 1.0, 1.12);
          put(mantleGeo, L ? matDarkLeather : matCoatLeather, upperBody, -0.015, 0.54, 0, 0, 0, 0, 1, 1, 1, true);
        }
        // Shoulder pauldron plates + gold rivets
        for (const s of [-1, 1]) {
          put(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), matDarkLeather, upperBody, -0.01, 0.68, s * 0.24, 0, 0, s * 0.35, 1.05, 0.7, 1.0, true);
          for (let r = 0; r < 3; r++) put(new THREE.SphereGeometry(0.01, 6, 6), this.matGoldTrim, upperBody, -0.01 + (r - 1) * 0.05, 0.745 - Math.abs(r - 1) * 0.01, s * (0.26 + (r === 1 ? 0.01 : 0)));
        }

        // --- Cross-chest bandolier with buckles and subweapon cross pendant ---
        const bandolier = put(new THREE.TorusGeometry(0.238, 0.024, 8, 30), matDarkLeather, upperBody, 0.01, 0.37, 0, 0.48, 0.16, 0.65, 0.78, 1.0, 1.12);
        for (const t of [0.25, 0.62]) {
          put(new THREE.BoxGeometry(0.05, 0.05, 0.02), matMetal, upperBody, 0.15 - t * 0.25, 0.28 + t * 0.35, 0.22 * (0.7 + t * 0.4), 0, 0, 0.5);
        }
        const cross = new THREE.Group();
        cross.position.set(0.205, 0.5, 0.0);
        put(new THREE.BoxGeometry(0.012, 0.075, 0.012), this.matGoldTrim, cross, 0, 0, 0);
        put(new THREE.BoxGeometry(0.012, 0.012, 0.05), this.matGoldTrim, cross, 0, 0.012, 0);
        upperBody.add(cross);

        // --- Belt, buckle, back pouches, dagger sheath, coiled spare whip ---
        const belt = put(new THREE.CylinderGeometry(0.19, 0.198, 0.1, 28), matDarkLeather, upperBody, 0, 0.04, 0, 0, 0, 0, 0.84, 1, 1.24);
        put(new THREE.BoxGeometry(0.05, 0.1, 0.12), this.matGoldTrim, upperBody, 0.168, 0.04, 0);
        put(new THREE.BoxGeometry(0.02, 0.06, 0.08), matMetal, upperBody, 0.19, 0.04, 0);
        for (const s of [-1, 1]) {
          put(new THREE.BoxGeometry(0.1, 0.1, 0.05), matGlove, upperBody, -0.1, -0.02, s * 0.235, 0, 0, 0.05);
          put(new THREE.BoxGeometry(0.1, 0.03, 0.055), matDarkLeather, upperBody, -0.1, 0.025, s * 0.236);
        }
        put(new THREE.CylinderGeometry(0.02, 0.016, 0.3, 8), matDarkLeather, upperBody, 0.02, -0.14, 0.235, 0, 0, 0.22);
        put(new THREE.BoxGeometry(0.04, 0.03, 0.04), this.matGoldTrim, upperBody, 0.0, 0.0, 0.235);
        put(new THREE.TorusGeometry(0.05, 0.012, 6, 16), matGlove, upperBody, 0.1, -0.02, 0.23, 0, 0, 0);

        // --- HEAD: sculpted profile ---
        const headGroup = new THREE.Group();
        headGroup.position.set(0.02, 0.88, 0);
        upperBody.add(headGroup);
        this.hero.headGroup = headGroup;

        put(new THREE.CylinderGeometry(0.056, 0.07, 0.15, 14), skinMat, headGroup, -0.012, -0.09, 0);
        put(new THREE.SphereGeometry(0.108, 28, 24), faceMat, headGroup, 0, 0, 0, 0, 0, 0, 1.04, 1.22, 0.86, true);
        // Jaw & chin
        put(new THREE.SphereGeometry(0.075, 18, 14), skinMat, headGroup, 0.035, -0.085, 0, 0, 0, 0, 1.0, 0.85, 0.82);
        put(new THREE.SphereGeometry(0.03, 12, 10), skinMat, headGroup, 0.088, -0.125, 0, 0, 0, 0, 0.9, 0.8, 1.2);
        // Brow ridge, cheekbones
        put(new THREE.BoxGeometry(0.04, 0.02, 0.15), skinMat, headGroup, 0.088, 0.036, 0, 0, 0, -0.1);
        for (const s of [-1, 1]) {
          put(new THREE.SphereGeometry(0.03, 10, 8), skinMat, headGroup, 0.07, -0.03, s * 0.068, 0, 0, 0, 1, 0.8, 0.8);
          // Eye socket, eyeball, iris, brow hair
          put(new THREE.SphereGeometry(0.024, 12, 10), matEyeWhite, headGroup, 0.093, 0.012, s * 0.046, 0, 0, 0, 0.7, 0.9, 1);
          put(new THREE.SphereGeometry(0.0135, 10, 8), matIris, headGroup, 0.108, 0.012, s * 0.047);
          put(new THREE.BoxGeometry(0.02, 0.008, 0.052), matBrow, headGroup, 0.098, 0.05, s * 0.048, s * 0.1, 0, -0.18);
          // Ears
          put(new THREE.SphereGeometry(0.026, 10, 8), skinMat, headGroup, -0.012, -0.012, s * 0.103, 0, 0, 0, 0.7, 1.2, 0.5);
        }
        // Nose with bridge and nostril volume
        put(new THREE.ConeGeometry(0.018, 0.062, 8), skinMat, headGroup, 0.118, -0.012, 0, 0, 0, -Math.PI * 0.46);
        put(new THREE.SphereGeometry(0.014, 8, 8), skinMat, headGroup, 0.138, -0.034, 0, 0, 0, 0, 1, 0.8, 1.1);
        // Lips
        put(new THREE.BoxGeometry(0.02, 0.007, 0.05), matLip, headGroup, 0.108, -0.073, 0);
        put(new THREE.BoxGeometry(0.02, 0.009, 0.046), matLip, headGroup, 0.105, -0.086, 0);

        // Swept-back layered hair: skull cap shell + locks + fringe + long trailing strands
        const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.117, 26, 20, 0, Math.PI * 2, 0, Math.PI * 0.62), matHair);
        hairCap.scale.set(1.06, 1.24, 0.92);
        hairCap.position.set(-0.012, 0.012, 0);
        hairCap.rotation.z = 0.35;
        headGroup.add(hairCap);
        const lockDefs = [];
        for (let i = 0; i < 14; i++) {
          const t = i / 13;
          const z = (t - 0.5) * 0.19;
          lockDefs.push([0.05, 0.115 - Math.abs(z) * 0.4, z * 0.7, -0.12, 0.09 - Math.abs(z) * 0.3, z * 1.1, -0.22 - (i % 3) * 0.03, -0.14 - (1 - Math.abs(t - 0.5) * 2) * 0.12, z * 0.9, 0.019 + (i % 2) * 0.007]);
        }
        lockDefs.forEach(([x0, y0, z0, x1, y1, z1, x2, y2, z2, rad]) => {
          const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2));
          headGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, rad, 7, false), matHair));
        });
        // Front fringe locks falling across forehead
        for (const [z, len] of [[-0.05, 0.05], [0.0, 0.07], [0.05, 0.05]]) {
          const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.0, 0.13, z), new THREE.Vector3(0.1, 0.12, z * 1.3), new THREE.Vector3(0.1, 0.12 - len, z * 1.4));
          headGroup.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.014, 6, false), matHair));
        }
        this.hero.hairStrands = [];
        for (let i = -3; i <= 3; i++) {
          const strandGeo = new THREE.PlaneGeometry(0.07, 0.42, 1, 7);
          strandGeo.translate(0, -0.21, 0);
          const strand = new THREE.Mesh(strandGeo, matHair);
          strand.position.set(-0.115, 0.0, i * 0.03);
          strand.rotation.y = Math.PI * 0.5 + i * 0.14;
          headGroup.add(strand);
          this.hero.hairStrands.push({ mesh: strand, basePos: strandGeo.attributes.position.array.slice(), phase: i * 0.7 });
        }

        // --- Coat tails: 7 flaring panels (outer leather + crimson velvet lining) with hem trim ---
        this.hero.coatPanels = [];
        const panelConfigs = [
          { ang: Math.PI,         w: 0.5,  h: 1.08, flareBias: 0.44 },
          { ang: Math.PI * 0.84,  w: 0.44, h: 1.04, flareBias: 0.38 },
          { ang: -Math.PI * 0.84, w: 0.44, h: 1.04, flareBias: 0.38 },
          { ang: Math.PI * 0.64,  w: 0.38, h: 0.98, flareBias: 0.28 },
          { ang: -Math.PI * 0.64, w: 0.38, h: 0.98, flareBias: 0.28 },
          { ang: Math.PI * 0.46,  w: 0.30, h: 0.84, flareBias: 0.2 },
          { ang: -Math.PI * 0.46, w: 0.30, h: 0.84, flareBias: 0.2 }
        ];
        panelConfigs.forEach((cfg, idx) => {
          const pGeo = new THREE.PlaneGeometry(cfg.w, cfg.h, 5, 14);
          const posAttr = pGeo.attributes.position;
          for (let i = 0; i < posAttr.count; i++) {
            const py = posAttr.getY(i);
            const t = (cfg.h * 0.5 - py) / cfg.h;
            posAttr.setX(i, posAttr.getX(i) * (0.72 + t * 0.78));
          }
          pGeo.translate(0, -cfg.h * 0.5, 0);
          pGeo.computeVertexNormals();
          const outerCoat = new THREE.Mesh(pGeo, matCoatLeather);
          outerCoat.castShadow = true;
          const innerCoat = new THREE.Mesh(pGeo.clone(), this.matCrimsonVelvet);
          innerCoat.position.z = 0.012;
          const pivot = new THREE.Group();
          pivot.position.set(Math.cos(cfg.ang) * 0.16, 0.04, Math.sin(cfg.ang) * 0.21);
          pivot.rotation.y = -cfg.ang + Math.PI * 0.5;
          pivot.add(outerCoat, innerCoat);
          upperBody.add(pivot);
          this.hero.coatPanels.push({
            outerGeo: pGeo,
            innerGeo: innerCoat.geometry,
            basePos: pGeo.attributes.position.array.slice(),
            offset: idx * 0.75,
            flareBias: cfg.flareBias
          });
        });

        // --- LEGS: breeches, thigh straps, kneecaps, tall folded-cuff boots with buckles & soles ---
        const bootPts = [
          new THREE.Vector2(0.0, 0.0),
          new THREE.Vector2(0.078, 0.0),
          new THREE.Vector2(0.082, 0.03),
          new THREE.Vector2(0.066, 0.12),
          new THREE.Vector2(0.066, 0.28),
          new THREE.Vector2(0.086, 0.40),
          new THREE.Vector2(0.118, 0.47),
          new THREE.Vector2(0.124, 0.52),
          new THREE.Vector2(0.092, 0.535),
          new THREE.Vector2(0.0, 0.535)
        ];
        const bootGeo = new THREE.LatheGeometry(bootPts, 20);
        const buildLeg = (zSide) => {
          const hip = new THREE.Group();
          hip.position.set(0, 0.98, zSide * 0.13);
          put(new THREE.CylinderGeometry(0.112, 0.084, 0.5, 18), matBreeches, hip, 0, -0.25, 0, 0, 0, 0, 1, 1, 1, true);
          put(new THREE.TorusGeometry(0.1, 0.012, 6, 16), matDarkLeather, hip, 0, -0.1, 0, Math.PI * 0.5, 0, 0);
          const knee = new THREE.Group();
          knee.position.y = -0.5;
          hip.add(knee);
          put(new THREE.SphereGeometry(0.088, 14, 12), matDarkLeather, knee, 0.03, 0.02, 0, 0, 0, 0, 0.9, 1, 1);
          put(bootGeo, matDarkLeather, knee, 0, -0.52, 0, 0, 0, 0, 1, 1, 1, true);
          for (let b = 0; b < 3; b++) {
            put(new THREE.TorusGeometry(0.08 + (b === 2 ? 0.006 : 0), 0.011, 6, 14), this.matGoldTrim, knee, 0, -0.13 - b * 0.11, 0, Math.PI * 0.5, 0, 0);
            put(new THREE.BoxGeometry(0.03, 0.03, 0.02), this.matGoldTrim, knee, 0.075 - b * 0.004, -0.13 - b * 0.11, 0.02 * zSide);
          }
          // Foot: toe box, sole, heel
          put(new THREE.CapsuleGeometry(0.06, 0.15, 6, 12), matDarkLeather, knee, 0.075, -0.475, 0, 0, 0, Math.PI * 0.5, 1, 1, 0.95, true);
          put(new THREE.BoxGeometry(0.26, 0.026, 0.12), matBreeches, knee, 0.07, -0.525, 0);
          put(new THREE.BoxGeometry(0.06, 0.04, 0.115), matBreeches, knee, -0.04, -0.54, 0);
          bodyPivot.add(hip);
          return { hip, knee };
        };
        this.hero.legL = buildLeg(-1);
        this.hero.legR = buildLeg(1);

        // --- ARMS: puffed sleeve, banded cuff, bracer straps, five-finger leather glove ---
        const buildArm = (zSide) => {
          const shoulder = new THREE.Group();
          shoulder.position.set(0, 0.65, zSide * 0.26);
          put(new THREE.SphereGeometry(0.088, 14, 12), matCoatLeather, shoulder, 0, 0, 0, 0, 0, 0, 1, 1, 1, true);
          put(new THREE.CylinderGeometry(0.084, 0.066, 0.38, 18), matCoatLeather, shoulder, 0, -0.19, 0, 0, 0, 0, 1, 1, 1, true);
          const elbow = new THREE.Group();
          elbow.position.y = -0.37;
          shoulder.add(elbow);
          put(new THREE.SphereGeometry(0.066, 12, 10), matCoatLeather, elbow, 0, 0, 0);
          put(new THREE.CylinderGeometry(0.078, 0.07, 0.09, 16), matDarkLeather, elbow, 0, -0.05, 0);
          put(new THREE.TorusGeometry(0.081, 0.01, 6, 14), this.matGoldTrim, elbow, 0, -0.01, 0, Math.PI * 0.5, 0, 0);
          put(new THREE.CylinderGeometry(0.066, 0.052, 0.28, 16), matGlove, elbow, 0, -0.19, 0, 0, 0, 0, 1, 1, 1, true);
          for (let b = 0; b < 2; b++) put(new THREE.TorusGeometry(0.06 - b * 0.006, 0.008, 6, 12), matDarkLeather, elbow, 0, -0.14 - b * 0.09, 0, Math.PI * 0.5, 0, 0);
          // Hand: palm, 4 fingers, thumb
          put(new THREE.BoxGeometry(0.07, 0.07, 0.07), matGlove, elbow, 0, -0.35, 0);
          for (let f = 0; f < 4; f++) put(new THREE.CapsuleGeometry(0.0125, 0.045, 3, 6), matGlove, elbow, 0.03, -0.395, -0.026 + f * 0.0175, 0, 0, 0.3);
          put(new THREE.CapsuleGeometry(0.014, 0.04, 3, 6), matGlove, elbow, 0.04, -0.34, 0.035 * zSide, 0, 0, -0.9);
          upperBody.add(shoulder);
          return { shoulder, elbow };
        };
        this.hero.armBack = buildArm(-1);
        this.hero.armFront = buildArm(1);

