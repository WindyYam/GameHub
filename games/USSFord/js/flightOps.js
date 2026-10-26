import * as THREE from 'three';
import {
    DECK_Y, RUNWAY_START, RUNWAY_END, RUNWAY_DIR, RUNWAY_YAW, lerpYaw, angleDiff
} from './config.js';
import {
    createF35C,
    createFA18,
    createE2DHawkeye,
    createSeahawk,
    createDeckTractor,
    createNavyPersonnel,
    createParkingChocksGroup,
    setWingFoldRatio,
    spinningPropsAndDomes,
    allHeliRotors
} from './aircraft.js';

export class FlightOpsSystem {
    constructor(carrierContext, onStatusLog, onRosterChanged) {
        this.carrierContext = carrierContext;
        this.deckAssetsGroup = carrierContext.deckAssetsGroup;
        this.deckObstacleList = carrierContext.deckObstacleList;
        this.jbdCat1 = carrierContext.jbdCat1;
        this.jbdCat2 = carrierContext.jbdCat2;
        this.arrestingWireLine = carrierContext.arrestingWireLine;

        this.onStatusLog = onStatusLog || (() => {});
        this.onRosterChanged = onRosterChanged || (() => {});

        this.airWingUnits = [];
        this.mobileDeckVehicles = [];
        this.deckCrewList = [];
        this.autoOpsTimer = 0;

        this.initAirWing();
        this.initDeckSupportVehicles();
        this.initDeckCrew();
    }

    log(msg) {
        this.onStatusLog(msg);
    }

    notifyRoster() {
        this.onRosterChanged();
    }

    registerAircraft({
        id, callsign, type, label, homeX, homeZ, homeRot, homeFolded = true, canCycleJet = true, catPref = 1, tailColor = 0x1e293b
    }) {
        let mesh;
        if (type === 'F-35C') mesh = createF35C({ foldedWings: homeFolded });
        else if (type === 'F/A-18E') mesh = createFA18({ foldedWings: homeFolded, tailColor });
        else if (type === 'E-2D') mesh = createE2DHawkeye({ foldedWings: homeFolded });
        else mesh = createSeahawk();

        mesh.position.set(homeX, 0, homeZ);
        mesh.rotation.set(0, homeRot, 0);
        this.deckAssetsGroup.add(mesh);

        const chocks = createParkingChocksGroup(homeX, homeZ, homeRot);
        this.deckAssetsGroup.add(chocks);

        const unit = {
            id,
            callsign,
            type,
            label,
            mesh,
            chocks,
            homePos: new THREE.Vector3(homeX, 0, homeZ),
            homeRot,
            homeFolded,
            canCycleJet,
            catIndex: catPref,
            state: 'PARKED',
            stateTimer: 0,
            patrolAngle: Math.random() * Math.PI * 2,
            patrolLaps: 0,
            taxiCurve: null,
            taxiDuration: 6.0,
            taxiTargetRot: homeRot,
            currentYaw: homeRot,
            taxiAvoidOffset: new THREE.Vector2(0, 0),
            prevTaxiPos: null
        };
        unit.mesh.userData.unit = unit;
        this.airWingUnits.push(unit);
        return unit;
    }

    initAirWing() {
        // 1. Starboard Edge Echelon Row (Spots 01–12)
        const starboardEdgeLineSpecs = [
            { cs: 'VFA-31 #101',  type: 'F/A-18E', x: -16.8, z: 108, rot: 1.05, cat: 1 },
            { cs: 'VFA-31 #102',  type: 'F/A-18E', x: -19.8, z:  94, rot: 1.08, cat: 1 },
            { cs: 'VFA-31 #103',  type: 'F/A-18E', x: -23.0, z:  80, rot: 1.10, cat: 1 },
            { cs: 'VFA-31 #104',  type: 'F/A-18E', x: -26.2, z:  66, rot: 1.12, cat: 1 },
            { cs: 'VFA-87 #201',  type: 'F/A-18E', x: -29.2, z:  52, rot: 1.14, cat: 1 },
            { cs: 'VFA-87 #202',  type: 'F/A-18E', x: -31.8, z:  38, rot: 1.15, cat: 2 },
            { cs: 'VFA-87 #203',  type: 'F/A-18E', x: -35.2, z:  24, rot: 1.48, cat: 2 },
            { cs: 'VFA-87 #204',  type: 'F/A-18E', x: -34.8, z:  12, rot: 1.48, cat: 2 },
            { cs: 'VFA-213 #205', type: 'F/A-18E', x: -31.8, z:  -2, rot: 1.15, cat: 2 },
            { cs: 'VFA-213 #206', type: 'F/A-18E', x: -34.8, z: -15, rot: 1.16, cat: 2 },
            { cs: 'VFA-213 #207', type: 'F/A-18E', x: -31.6, z: -27, rot: 1.12, cat: 1 },
            { cs: 'VMFA-211 #301',type: 'F-35C',   x: -28.5, z: -38, rot: 1.08, cat: 1 }
        ];
        starboardEdgeLineSpecs.forEach((s, idx) => {
            this.registerAircraft({
                id: `stbd-line-${idx}`,
                callsign: s.cs,
                type: s.type,
                label: s.type === 'F-35C' ? 'F-35C Lightning II' : 'F/A-18E Super Hornet',
                homeX: s.x,
                homeZ: s.z,
                homeRot: s.rot,
                homeFolded: true,
                canCycleJet: true,
                catPref: s.cat
            });
        });

        // 2. Mid-Deck Pair
        const midDeckSpecs = [
            { cs: 'VMFA-211 #302', type: 'F-35C',   folded: false, x: -11.5, z:  4.0, rot: -0.22, cat: 1 },
            { cs: 'VFA-213 #401',  type: 'F/A-18E', folded: false, x: -12.0, z: -9.5, rot: -0.25, cat: 2 }
        ];
        midDeckSpecs.forEach((s, idx) => {
            this.registerAircraft({
                id: `mid-jet-${idx}`,
                callsign: s.cs,
                type: s.type,
                label: s.type === 'F-35C' ? 'F-35C Lightning II' : 'F/A-18E Super Hornet',
                homeX: s.x,
                homeZ: s.z,
                homeRot: s.rot,
                homeFolded: s.folded,
                canCycleJet: true,
                catPref: s.cat
            });
        });

        // 3. Starboard Aft of Island Line
        const aftStarboardSpecs = [
            { cs: 'VFA-147 #304', type: 'F/A-18E', x: -30.5, z: -82,  rot: 0.92, cat: 1 },
            { cs: 'VFA-147 #305', type: 'F/A-18E', x: -29.2, z: -96,  rot: 0.95, cat: 2 },
            { cs: 'VMFA-211 #306',type: 'F-35C',   x: -25.8, z: -126, rot: 1.05, cat: 1 },
            { cs: 'VFA-87 #403',  type: 'F/A-18E', x: -21.8, z: -140, rot: 1.15, cat: 2 }
        ];
        aftStarboardSpecs.forEach((s, idx) => {
            this.registerAircraft({
                id: `aft-stbd-${idx}`,
                callsign: s.cs,
                type: s.type,
                label: s.type === 'F-35C' ? 'F-35C Lightning II' : 'F/A-18E Super Hornet',
                homeX: s.x,
                homeZ: s.z,
                homeRot: s.rot,
                homeFolded: true,
                canCycleJet: true,
                catPref: s.cat
            });
        });

        // 4. Aft E-2D Hawkeyes
        this.registerAircraft({
            id: 'awacs-1',
            callsign: 'VAW-124 #601',
            type: 'E-2D',
            label: 'E-2D Adv. Hawkeye',
            homeX: -27.5,
            homeZ: -111,
            homeRot: 0.85,
            homeFolded: true,
            canCycleJet: false
        });
        this.registerAircraft({
            id: 'awacs-2',
            callsign: 'VAW-124 #602',
            type: 'E-2D',
            label: 'E-2D Adv. Hawkeye',
            homeX: 25.5,
            homeZ: -102,
            homeRot: -0.68,
            homeFolded: true,
            canCycleJet: false
        });

        // 5. Port Aft Hornets
        const portAftHornets = [
            { cs: 'VFA-213 #501', x: 28.5, z: -84, rot: -0.78, cat: 2 },
            { cs: 'VFA-213 #502', x: 31.8, z: -68, rot: -0.82, cat: 2 }
        ];
        portAftHornets.forEach((s, idx) => {
            this.registerAircraft({
                id: `port-hornet-${idx}`,
                callsign: s.cs,
                type: 'F/A-18E',
                label: 'F/A-18E Super Hornet',
                homeX: s.x,
                homeZ: s.z,
                homeRot: s.rot,
                homeFolded: true,
                canCycleJet: true,
                catPref: s.cat
            });
        });

        // 6. Port Aft Fantail Helicopter Row (4 MH-60S Seahawks)
        const seahawkSpecs = [
            { cs: 'HSC-9 #610', x: 19.5, z: -116, rot: -0.75 },
            { cs: 'HSC-9 #611', x: 17.5, z: -125, rot: -0.75 },
            { cs: 'HSC-9 #612', x: 15.5, z: -134, rot: -0.75 },
            { cs: 'HSC-9 #613', x: 13.5, z: -143, rot: -0.75 }
        ];
        seahawkSpecs.forEach((s, idx) => {
            this.registerAircraft({
                id: `seahawk-${idx}`,
                callsign: s.cs,
                type: 'MH-60S',
                label: 'MH-60S Seahawk',
                homeX: s.x,
                homeZ: s.z,
                homeRot: s.rot,
                homeFolded: false,
                canCycleJet: false
            });
        });
    }

    initDeckSupportVehicles() {
        const islandSupportVehicles = [
            { color: 0xf8fafc, x: -24.0, z: -48.0, rot: 1.57 },
            { color: 0xf8fafc, x: -24.0, z: -44.2, rot: 1.57 },
            { color: 0xf8fafc, x: -21.2, z: -41.5, rot: 0.45 },
            { color: 0xf8fafc, x: -24.5, z: -36.5, rot: 1.25 },
            { color: 0xf8fafc, x: -21.5, z: -33.8, rot: 0.85 },
            { color: 0xeab308, x: -26.2, z: -38.0, rot: 0.35 },
            { color: 0xeab308, x: -24.2, z: -54.0, rot: 1.57 },
            { color: 0xeab308, x: -30.5, z: -70.0, rot: 0.10 },
            { color: 0xeab308, x:  25.5, z:  20.0, rot: -0.15, speed: 4.0, route: [
                { x: 16, z: 19 }, { x: 18, z: 24 }, { x: 14, z: 28 }, { x: 11, z: 22 }, { x: 12, z: 16 }
            ] },
            { color: 0xeab308, x:   4.5, z: -78.0, rot:  0.40, speed: 4.0, route: [
                { x: -15, z: -78 }, { x: -17, z: -72 }, { x: -19, z: -77 }, { x: -18, z: -84 }, { x: -15, z: -88 }
            ] },
            { color: 0xf8fafc, x:  16.5, z: -64.0, rot: -0.60, speed: 3.6, route: [
                { x: -7, z: -61 }, { x: -9, z: -56 }, { x: -13, z: -60 }, { x: -12, z: -66 }
            ] }
        ];

        islandSupportVehicles.forEach(t => {
            const tug = createDeckTractor(t.color);
            tug.position.set(t.x, 0, t.z);
            tug.rotation.y = t.rot;
            this.deckAssetsGroup.add(tug);
            if (t.route) {
                this.mobileDeckVehicles.push({ mesh: tug, route: t.route, routeIndex: 0, speed: t.speed });
            } else {
                this.deckObstacleList.push({ x: t.x, z: t.z, radius: 2.8 });
            }
        });
    }

    initDeckCrew() {
        const crewRoleSpecs = [
            { role: 'DIRECTOR', jersey: 0xeab308, vest: 0xfacc15, helmet: 0xeab308, pose: 'MARSHAL' },
            { role: 'CAT_CREW', jersey: 0x16a34a, vest: 0x15803d, helmet: 0x16a34a, pose: 'INSPECT' },
            { role: 'SAFETY',   jersey: 0xf8fafc, vest: 0xe2e8f0, helmet: 0xf8fafc, pose: 'CLIPBOARD' },
            { role: 'CHOCKS',   jersey: 0x2563eb, vest: 0x1d4ed8, helmet: 0x2563eb, pose: 'CARRY' },
            { role: 'ORDNANCE', jersey: 0xdc2626, vest: 0xb91c1c, helmet: 0xdc2626, pose: 'WALK' },
            { role: 'FUELS',    jersey: 0x9333ea, vest: 0x7e22ce, helmet: 0x9333ea, pose: 'WALK' }
        ];

        const isPointInRunwayOrCatapultZone = (x, z, buffer = 2.0) => {
            const rAx = -4.5, rAz = -152.0;
            const rBx = 36.5, rBz = 42.0;
            const rDx = rBx - rAx, rDz = rBz - rAz;
            const rLenSq = rDx * rDx + rDz * rDz;
            const tRunway = THREE.MathUtils.clamp(((x - rAx) * rDx + (z - rAz) * rDz) / rLenSq, 0.0, 1.0);
            const closeRx = rAx + tRunway * rDx;
            const closeRz = rAz + tRunway * rDz;
            const distRunway = Math.hypot(x - closeRx, z - closeRz);
            if (distRunway < 11.8 + buffer) return true;

            if (z >= 40 - buffer && z <= 152 + buffer && Math.abs(x - (-7.0)) < 4.5 + buffer) return true;
            if (z >= 34 - buffer && z <= 152 + buffer && Math.abs(x - 8.0) < 4.5 + buffer) return true;
            return false;
        };

        const clampOutOfRunwayZone = (pos, minClearance = 12.2) => {
            const rAx = -4.5, rAz = -152.0;
            const rBx = 36.5, rBz = 42.0;
            const rDx = rBx - rAx, rDz = rBz - rAz;
            const rLenSq = rDx * rDx + rDz * rDz;
            const tRunway = THREE.MathUtils.clamp(((pos.x - rAx) * rDx + (pos.z - rAz) * rDz) / rLenSq, 0.0, 1.0);
            const closeRx = rAx + tRunway * rDx;
            const closeRz = rAz + tRunway * rDz;
            const dx = pos.x - closeRx;
            const dz = pos.z - closeRz;
            const dist = Math.hypot(dx, dz);
            if (dist < minClearance) {
                const pushDirX = dx < 2.0 ? -1.0 : 1.0;
                const nx = dist > 0.001 ? dx / dist : pushDirX;
                const nz = dist > 0.001 ? dz / dist : 0.0;
                pos.x = closeRx + nx * minClearance;
                pos.z = closeRz + nz * minClearance;
            }
            pos.x = THREE.MathUtils.clamp(pos.x, -33.0, 34.0);
            pos.z = THREE.MathUtils.clamp(pos.z, -142.0, 145.0);
        };

        const strategicCrewZones = [
            { xMin: -25.5, xMax: -13.0, zMin:  -25, zMax:   95, count: 28 },
            { xMin:  -2.2, xMax:   3.2, zMin:   42, zMax:  128, count: 18 },
            { xMin: -24.5, xMax: -14.5, zMin:  -78, zMax:  -28, count: 18 },
            { xMin: -23.5, xMax: -15.5, zMin: -128, zMax:  -80, count: 14 }
        ];

        let crewCounter = 0;
        strategicCrewZones.forEach(zone => {
            for (let i = 0; i < zone.count; i++) {
                const spec = crewRoleSpecs[crewCounter % crewRoleSpecs.length];
                crewCounter++;
                const crew = createNavyPersonnel(spec);

                let bx = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
                let bz = zone.zMin + Math.random() * (zone.zMax - zone.zMin);
                for (let attempt = 0; attempt < 15; attempt++) {
                    if (!isPointInRunwayOrCatapultZone(bx, bz, 2.2)) break;
                    bx = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
                    bz = zone.zMin + Math.random() * (zone.zMax - zone.zMin);
                }

                const safePt = { x: bx, z: bz };
                clampOutOfRunwayZone(safePt, 12.8);
                bx = safePt.x;
                bz = safePt.z;

                const initRot = Math.random() * Math.PI * 2;
                crew.position.set(bx, 0, bz);
                crew.rotation.y = initRot;
                this.deckAssetsGroup.add(crew);

                const isStationary = (spec.pose === 'MARSHAL' || spec.pose === 'CLIPBOARD') && Math.random() < 0.65;
                this.deckCrewList.push({
                    mesh: crew,
                    baseX: bx,
                    baseZ: bz,
                    evadeOffsetX: 0,
                    evadeOffsetZ: 0,
                    evadeVelX: 0,
                    evadeVelZ: 0,
                    isEvading: false,
                    baseRot: initRot,
                    stationary: isStationary,
                    radius: isStationary ? 0.12 : (0.8 + Math.random() * 1.6),
                    speed: 0.75 + Math.random() * 1.15,
                    phase: Math.random() * Math.PI * 2
                });
            }
        });
    }

    isCatapultBusy(catIdx) {
        return this.airWingUnits.some(u =>
            u.catIndex === catIdx &&
            (u.state === 'TAXI_TO_CAT' || u.state === 'PRE_LAUNCH' || u.state === 'LAUNCHING')
        );
    }

    isLandingStripBusy() {
        return this.airWingUnits.some(u =>
            u.state === 'APPROACH' || u.state === 'TOUCHDOWN_ROLLOUT' || u.state === 'TAXI_TO_PARK'
        );
    }

    gatherDynamicDeckObstacles(excludeUnit) {
        const obs = this.deckObstacleList.map(o => ({ x: o.x, z: o.z, r: o.radius }));
        this.mobileDeckVehicles.forEach(vehicle => {
            obs.push({ x: vehicle.mesh.position.x, z: vehicle.mesh.position.z, r: 4.0 });
        });
        this.airWingUnits.forEach(other => {
            if (other === excludeUnit) return;
            if (
                other.state === 'PARKED' ||
                other.state === 'TAXI_TO_CAT' ||
                other.state === 'PRE_LAUNCH' ||
                other.state === 'TAXI_TO_PARK' ||
                other.state === 'TOUCHDOWN_ROLLOUT'
            ) {
                const rad = other.type === 'E-2D' ? 8.5 : 6.4;
                obs.push({ x: other.mesh.position.x, z: other.mesh.position.z, r: rad });
            }
        });
        if (this.jbdCat1.targetAngle > 0.1) obs.push({ x: -7.5, z: 44.0, r: 5.8 });
        if (this.jbdCat2.targetAngle > 0.1) obs.push({ x:  8.5, z: 38.0, r: 5.8 });
        return obs;
    }

    relaxControlPointsAgainstObstacles(pts, obstacles, iterations = 16) {
        for (let iter = 0; iter < iterations; iter++) {
            for (let i = 1; i < pts.length - 1; i++) {
                const p = pts[i];
                obstacles.forEach(ob => {
                    const dx = p.x - ob.x;
                    const dz = p.z - ob.z;
                    const dist = Math.hypot(dx, dz);
                    const minClearance = ob.r + 5.2;
                    if (dist < minClearance && dist > 0.001) {
                        const push = (minClearance - dist) * 0.75;
                        p.x += (dx / dist) * push;
                        p.z += (dz / dist) * push;
                    }
                });
                const prev = pts[i - 1];
                const next = pts[i + 1];
                const smoothWeight = (i === 1 || i === pts.length - 2) ? 0.16 : 0.25;
                p.x = THREE.MathUtils.lerp(p.x, (prev.x + next.x) * 0.5, smoothWeight);
                p.z = THREE.MathUtils.lerp(p.z, (prev.z + next.z) * 0.5, smoothWeight);

                p.x = THREE.MathUtils.clamp(p.x, -21.0, 22.0);
                p.z = THREE.MathUtils.clamp(p.z, -125.0, 130.0);
            }
        }
    }

    planTaxiRouteToCatapult(unit, chosenCat) {
        const startPos = unit.mesh.position.clone();
        const startYaw = unit.mesh.rotation.y;
        const fwdDir = new THREE.Vector3(Math.sin(startYaw), 0, Math.cos(startYaw));

        const catX = chosenCat === 1 ? -7.5 : 8.5;
        const catZ = chosenCat === 1 ? 52.0 : 46.0;

        const pullOutDist = 8.5;
        const p1 = startPos.clone().addScaledVector(fwdDir, pullOutDist);
        p1.x = THREE.MathUtils.clamp(p1.x, -21.0, 22.0);

        const controlPts = [startPos.clone(), p1];
        const corridorX = chosenCat === 1 ? -4.2 : 2.8;

        if (p1.z < catZ - 14.0) {
            const zStep1 = THREE.MathUtils.lerp(p1.z, catZ - 16.0, 0.35);
            const zStep2 = THREE.MathUtils.lerp(p1.z, catZ - 16.0, 0.72);
            controlPts.push(new THREE.Vector3(corridorX, 0, zStep1));
            controlPts.push(new THREE.Vector3(corridorX, 0, zStep2));
        } else if (p1.z > catZ - 4.0) {
            const turnX = chosenCat === 1 ? -1.5 : 1.5;
            controlPts.push(new THREE.Vector3(turnX, 0, Math.max(p1.z - 14.0, catZ - 12.0)));
            controlPts.push(new THREE.Vector3(catX,  0, catZ - 15.0));
        }

        const leadIn = new THREE.Vector3(catX, 0, catZ - 9.5);
        const endPos = new THREE.Vector3(catX, 0, catZ);
        controlPts.push(leadIn, endPos);

        const obstacles = this.gatherDynamicDeckObstacles(unit);
        this.relaxControlPointsAgainstObstacles(controlPts, obstacles, 16);

        const curve = new THREE.CatmullRomCurve3(controlPts, false, 'centripetal', 0.5);
        const totalLen = curve.getLength();
        const taxiSpeed = 13.5;
        unit.taxiCurve = curve;
        unit.taxiDuration = Math.max(2.4, totalLen / taxiSpeed);
        unit.taxiTargetRot = 0.0;
        unit.currentYaw = startYaw;
        unit.taxiAvoidOffset = new THREE.Vector2(0, 0);
        unit.prevTaxiPos = null;
    }

    planTaxiRouteToPark(unit) {
        const startPos = unit.mesh.position.clone();
        const startYaw = unit.mesh.rotation.y;
        const fwdDir = new THREE.Vector3(Math.sin(startYaw), 0, Math.cos(startYaw));

        const homePos = unit.homePos.clone();
        const homeYaw = unit.homeRot;
        const homeDir = new THREE.Vector3(Math.sin(homeYaw), 0, Math.cos(homeYaw));

        const p1 = startPos.clone().addScaledVector(fwdDir, 10.0);
        const controlPts = [startPos.clone(), p1];

        const streetX = homePos.x < 0 ? -5.0 : 4.5;
        const approachPos = homePos.clone().addScaledVector(homeDir, -9.5);
        approachPos.x = THREE.MathUtils.clamp(approachPos.x, -21.0, 21.0);

        const midZ1 = THREE.MathUtils.lerp(p1.z, approachPos.z, 0.35);
        const midZ2 = THREE.MathUtils.lerp(p1.z, approachPos.z, 0.72);
        controlPts.push(new THREE.Vector3(streetX, 0, midZ1));
        controlPts.push(new THREE.Vector3(streetX, 0, midZ2));
        controlPts.push(approachPos, homePos);

        const obstacles = this.gatherDynamicDeckObstacles(unit);
        this.relaxControlPointsAgainstObstacles(controlPts, obstacles, 16);

        const curve = new THREE.CatmullRomCurve3(controlPts, false, 'centripetal', 0.5);
        const totalLen = curve.getLength();
        const taxiSpeed = 13.5;
        unit.taxiCurve = curve;
        unit.taxiDuration = Math.max(4.5, totalLen / taxiSpeed);
        unit.taxiTargetRot = homeYaw;
        unit.currentYaw = startYaw;
        unit.taxiAvoidOffset = new THREE.Vector2(0, 0);
        unit.prevTaxiPos = null;
    }

    stepAircraftAlongTaxiSpline(unit, dt) {
        const m = unit.mesh;
        const dur = unit.taxiDuration || 6.0;
        const rawT = Math.min(unit.stateTimer / dur, 1.0);
        const s = rawT * rawT * (3.0 - 2.0 * rawT);

        if (unit.taxiCurve) {
            const pos = unit.taxiCurve.getPointAt(s);
            const tan = unit.taxiCurve.getTangentAt(s).normalize();

            if (!unit.taxiAvoidOffset) unit.taxiAvoidOffset = new THREE.Vector2(0, 0);

            const obstacles = this.gatherDynamicDeckObstacles(unit);
            const myRadius = unit.type === 'E-2D' ? 8.2 : 5.8;
            let targetAvoidX = 0;
            let targetAvoidZ = 0;

            const normX = -tan.z;
            const normZ = tan.x;
            const curX = pos.x + unit.taxiAvoidOffset.x;
            const curZ = pos.z + unit.taxiAvoidOffset.y;

            obstacles.forEach(ob => {
                const dx = curX - ob.x;
                const dz = curZ - ob.z;
                const dist = Math.hypot(dx, dz);
                const safeDist = ob.r + myRadius + 1.2;
                if (dist < safeDist && dist > 0.001) {
                    const overlap = safeDist - dist;
                    const pushX = dx / dist;
                    const pushZ = dz / dist;
                    const latSign = (pushX * normX + pushZ * normZ) >= 0 ? 1 : -1;
                    targetAvoidX += (pushX * 0.75 + normX * latSign * 0.65) * overlap;
                    targetAvoidZ += (pushZ * 0.75 + normZ * latSign * 0.65) * overlap;
                }
            });

            let blend = 1.0;
            if (rawT < 0.15) {
                blend = rawT / 0.15;
            } else if (rawT > 0.82) {
                blend = Math.max(0.0, (1.0 - rawT) / 0.18);
            }
            targetAvoidX *= blend;
            targetAvoidZ *= blend;

            const maxDeflect = 6.0;
            targetAvoidX = THREE.MathUtils.clamp(targetAvoidX, -maxDeflect, maxDeflect);
            targetAvoidZ = THREE.MathUtils.clamp(targetAvoidZ, -maxDeflect, maxDeflect);

            const lerpFactor = Math.min(1.0, dt * 4.5);
            unit.taxiAvoidOffset.x = THREE.MathUtils.lerp(unit.taxiAvoidOffset.x, targetAvoidX, lerpFactor);
            unit.taxiAvoidOffset.y = THREE.MathUtils.lerp(unit.taxiAvoidOffset.y, targetAvoidZ, lerpFactor);

            const finalX = THREE.MathUtils.clamp(pos.x + unit.taxiAvoidOffset.x, -21.0, 22.0);
            const finalZ = THREE.MathUtils.clamp(pos.z + unit.taxiAvoidOffset.y, -125.0, 130.0);
            m.position.set(finalX, pos.y, finalZ);

            let desiredYaw;
            if (rawT > 0.88) {
                const endBlend = (rawT - 0.88) / 0.12;
                const baseYaw = Math.atan2(tan.x, tan.z);
                desiredYaw = lerpYaw(baseYaw, unit.taxiTargetRot, endBlend);
            } else if (unit.prevTaxiPos) {
                const moveX = finalX - unit.prevTaxiPos.x;
                const moveZ = finalZ - unit.prevTaxiPos.z;
                const moveDist = Math.hypot(moveX, moveZ);
                if (moveDist > 0.015) {
                    desiredYaw = Math.atan2(moveX, moveZ);
                } else {
                    desiredYaw = Math.atan2(tan.x, tan.z);
                }
            } else {
                desiredYaw = Math.atan2(tan.x, tan.z);
            }

            if (!unit.prevTaxiPos) unit.prevTaxiPos = new THREE.Vector3();
            unit.prevTaxiPos.set(finalX, pos.y, finalZ);

            const prevYaw = unit.currentYaw;
            unit.currentYaw = lerpYaw(unit.currentYaw, desiredYaw, Math.min(1.0, dt * 8.5));
            const yawRate = angleDiff(prevYaw, unit.currentYaw) / Math.max(dt, 0.001);

            const turnRoll = THREE.MathUtils.clamp(-yawRate * 0.018, -0.04, 0.04);
            const brakePitch = rawT > 0.85 ? Math.sin(((rawT - 0.85) / 0.15) * Math.PI) * 0.018 : 0.0;
            m.rotation.set(brakePitch, unit.currentYaw, turnRoll);
        }
        return rawT;
    }

    commandJetLaunch(unit) {
        if (!unit || !unit.canCycleJet || unit.state !== 'PARKED') return false;
        let chosenCat = unit.catIndex;
        if (this.isCatapultBusy(chosenCat)) {
            chosenCat = chosenCat === 1 ? 2 : 1;
            if (this.isCatapultBusy(chosenCat)) {
                this.log(`PRI-FLY: BOTH CATAPULTS OCCUPIED — STAND BY FOR ${unit.callsign}`);
                return false;
            }
        }
        unit.catIndex = chosenCat;
        unit.state = 'TAXI_TO_CAT';
        unit.stateTimer = 0;
        this.planTaxiRouteToCatapult(unit, chosenCat);
        this.log(`${unit.callsign} (${unit.type}): TAXIING TO CAT ${chosenCat}`);
        this.notifyRoster();
        return true;
    }

    commandJetRecovery(unit) {
        if (!unit || !unit.canCycleJet || unit.state !== 'AIRBORNE_PATROL') return false;
        if (this.isLandingStripBusy()) {
            this.log(`LSO: FOUL DECK — ${unit.callsign} WAVE OFF`);
            return false;
        }
        const touchdown = new THREE.Vector3(3.5, 0, -98.0);
        const approachEntry = touchdown.clone().addScaledVector(
            new THREE.Vector3(RUNWAY_DIR.x, 0, RUNWAY_DIR.y),
            -215.0
        );
        approachEntry.y = 32.0;
        unit.approachStartPosition = unit.mesh.position.clone();
        unit.approachStartRotation = unit.mesh.rotation.clone();
        unit.approachJoinDuration = Math.max(2.5, unit.mesh.position.distanceTo(approachEntry) / 85.0);
        unit.state = 'APPROACH';
        unit.stateTimer = 0;
        this.log(`LSO: "${unit.callsign} ON FINAL GLIDE SLOPE — CALLING THE BALL"`);
        this.notifyRoster();
        return true;
    }

    commandHeliSortie(unit) {
        if (!unit || unit.type !== 'MH-60S') return false;
        if (unit.state === 'PARKED') {
            unit.liftoffStartY = unit.mesh.position.y;
            unit.state = 'LIFTOFF';
            unit.stateTimer = 0;
            this.log(`${unit.callsign}: LIFTING OFF FOR PATROL ORBIT`);
            this.notifyRoster();
            return true;
        } else if (unit.state === 'PATROL_ORBIT') {
            unit.heliReturnStartPosition = unit.mesh.position.clone();
            unit.heliReturnStartRotation = unit.mesh.rotation.clone();
            unit.heliReturnDuration = Math.max(4.0, unit.mesh.position.distanceTo(unit.homePos) / 14.0);
            unit.state = 'RETURN_APPROACH';
            unit.stateTimer = 0;
            this.log(`${unit.callsign}: RETURNING TO FLIGHT DECK`);
            this.notifyRoster();
            return true;
        }
        return false;
    }

    updateVehicles(dt, hazards) {
        const stepTime = Math.min(dt, 0.05);
        this.mobileDeckVehicles.forEach(vehicle => {
            let waypoint = vehicle.route[vehicle.routeIndex];
            let toX = waypoint.x - vehicle.mesh.position.x;
            let toZ = waypoint.z - vehicle.mesh.position.z;
            let goalDistance = Math.hypot(toX, toZ);
            if (goalDistance < 1.8) {
                vehicle.routeIndex = (vehicle.routeIndex + 1) % vehicle.route.length;
                waypoint = vehicle.route[vehicle.routeIndex];
                toX = waypoint.x - vehicle.mesh.position.x;
                toZ = waypoint.z - vehicle.mesh.position.z;
                goalDistance = Math.hypot(toX, toZ);
            }

            let avoidX = 0;
            let avoidZ = 0;
            let yieldToAircraft = false;
            hazards.forEach(hazard => {
                const dx = vehicle.mesh.position.x - hazard.x;
                const dz = vehicle.mesh.position.z - hazard.z;
                const distance = Math.hypot(dx, dz);
                const clearance = hazard.radius + 3.5;
                if (distance >= clearance) return;

                if (hazard.urgent && distance < hazard.radius + 5.0) yieldToAircraft = true;
                const strength = (clearance - distance) / clearance;
                const awayX = distance > 0.001 ? dx / distance : (vehicle.routeIndex % 2 ? 1 : -1);
                const awayZ = distance > 0.001 ? dz / distance : 0;
                avoidX += awayX * strength;
                avoidZ += awayZ * strength;
            });

            this.deckObstacleList.forEach(obstacle => {
                const dx = vehicle.mesh.position.x - obstacle.x;
                const dz = vehicle.mesh.position.z - obstacle.z;
                const distance = Math.hypot(dx, dz);
                const clearance = obstacle.radius + 3.2;
                if (distance >= clearance || distance < 0.001) return;
                const strength = (clearance - distance) / clearance;
                avoidX += (dx / distance) * strength;
                avoidZ += (dz / distance) * strength;
            });

            this.mobileDeckVehicles.forEach(other => {
                if (other === vehicle) return;
                const dx = vehicle.mesh.position.x - other.mesh.position.x;
                const dz = vehicle.mesh.position.z - other.mesh.position.z;
                const distance = Math.hypot(dx, dz);
                const clearance = 6.0;
                if (distance >= clearance || distance < 0.001) return;
                const strength = (clearance - distance) / clearance;
                avoidX += (dx / distance) * strength;
                avoidZ += (dz / distance) * strength;
            });

            if (yieldToAircraft || goalDistance < 0.001) return;
            const steerX = toX / goalDistance + avoidX * 2.4;
            const steerZ = toZ / goalDistance + avoidZ * 2.4;
            const steerLength = Math.hypot(steerX, steerZ);
            if (steerLength < 0.001) return;

            const desiredYaw = Math.atan2(steerX, steerZ);
            const turnBlend = 1.0 - Math.exp(-4.0 * stepTime);
            vehicle.mesh.rotation.y = lerpYaw(vehicle.mesh.rotation.y, desiredYaw, turnBlend);
            const yawError = Math.abs(angleDiff(vehicle.mesh.rotation.y, desiredYaw));
            const driveFactor = Math.max(0.18, Math.cos(yawError));
            const driveDistance = vehicle.speed * driveFactor * stepTime;
            const moveX = Math.sin(vehicle.mesh.rotation.y) * driveDistance;
            const moveZ = Math.cos(vehicle.mesh.rotation.y) * driveDistance;
            vehicle.mesh.position.x += moveX;
            vehicle.mesh.position.z += moveZ;
        });
    }

    updateCrew(dt, elapsed, hazards) {
        const clampOutOfRunwayZone = (pos, minClearance = 12.2) => {
            const rAx = -4.5, rAz = -152.0;
            const rBx = 36.5, rBz = 42.0;
            const rDx = rBx - rAx, rDz = rBz - rAz;
            const rLenSq = rDx * rDx + rDz * rDz;
            const tRunway = THREE.MathUtils.clamp(((pos.x - rAx) * rDx + (pos.z - rAz) * rDz) / rLenSq, 0.0, 1.0);
            const closeRx = rAx + tRunway * rDx;
            const closeRz = rAz + tRunway * rDz;
            const dx = pos.x - closeRx;
            const dz = pos.z - closeRz;
            const dist = Math.hypot(dx, dz);
            if (dist < minClearance) {
                const pushDirX = dx < 2.0 ? -1.0 : 1.0;
                const nx = dist > 0.001 ? dx / dist : pushDirX;
                const nz = dist > 0.001 ? dz / dist : 0.0;
                pos.x = closeRx + nx * minClearance;
                pos.z = closeRz + nz * minClearance;
            }
            pos.x = THREE.MathUtils.clamp(pos.x, -33.0, 34.0);
            pos.z = THREE.MathUtils.clamp(pos.z, -142.0, 145.0);
        };

        this.deckCrewList.forEach(c => {
            const a = elapsed * c.speed + c.phase;
            const limbs = c.mesh.userData.limbs;

            const patrolX = c.stationary ? c.baseX : (c.baseX + Math.cos(a) * c.radius);
            const patrolZ = c.stationary ? c.baseZ : (c.baseZ + Math.sin(a) * c.radius);

            let curX = patrolX + c.evadeOffsetX;
            let curZ = patrolZ + c.evadeOffsetZ;

            let fleeDirX = 0;
            let fleeDirZ = 0;
            let maxUrgency = 0;

            for (let h = 0; h < hazards.length; h++) {
                const haz = hazards[h];
                const dx = curX - haz.x;
                const dz = curZ - haz.z;
                const dist = Math.hypot(dx, dz);

                if (dist < haz.radius && dist > 0.0001) {
                    const urgency = (1.0 - dist / haz.radius) * (haz.urgent ? 1.8 : 0.7);
                    if (haz.urgent) maxUrgency = Math.max(maxUrgency, urgency);

                    const latX = haz.fwdZ;
                    const latZ = -haz.fwdX;
                    const sideDot = dx * latX + dz * latZ;
                    const sideSign = sideDot >= 0 ? 1.0 : -1.0;

                    const radialX = dx / dist;
                    const radialZ = dz / dist;

                    fleeDirX += (radialX * 0.55 + latX * sideSign * 0.85) * urgency;
                    fleeDirZ += (radialZ * 0.55 + latZ * sideSign * 0.85) * urgency;
                }
            }

            const fleeMag = Math.hypot(fleeDirX, fleeDirZ);
            if (fleeMag > 0.01 && maxUrgency > 0.02) {
                const runSpeed = 9.5 + Math.min(maxUrgency * 6.0, 6.5);
                const targetVx = (fleeDirX / fleeMag) * runSpeed;
                const targetVz = (fleeDirZ / fleeMag) * runSpeed;
                c.evadeVelX = THREE.MathUtils.lerp(c.evadeVelX, targetVx, Math.min(1.0, dt * 12.0));
                c.evadeVelZ = THREE.MathUtils.lerp(c.evadeVelZ, targetVz, Math.min(1.0, dt * 12.0));
                c.evadeOffsetX += c.evadeVelX * dt;
                c.evadeOffsetZ += c.evadeVelZ * dt;
                c.isEvading = true;
            } else {
                const offsetDist = Math.hypot(c.evadeOffsetX, c.evadeOffsetZ);
                if (offsetDist > 0.15) {
                    const returnSpeed = 3.6;
                    const rVx = (-c.evadeOffsetX / offsetDist) * Math.min(returnSpeed, offsetDist * 3.0);
                    const rVz = (-c.evadeOffsetZ / offsetDist) * Math.min(returnSpeed, offsetDist * 3.0);
                    c.evadeVelX = THREE.MathUtils.lerp(c.evadeVelX, rVx, Math.min(1.0, dt * 6.0));
                    c.evadeVelZ = THREE.MathUtils.lerp(c.evadeVelZ, rVz, Math.min(1.0, dt * 6.0));
                    c.evadeOffsetX += c.evadeVelX * dt;
                    c.evadeOffsetZ += c.evadeVelZ * dt;
                    c.isEvading = offsetDist > 0.6;
                } else {
                    c.evadeOffsetX = THREE.MathUtils.lerp(c.evadeOffsetX, 0, Math.min(1.0, dt * 5.0));
                    c.evadeOffsetZ = THREE.MathUtils.lerp(c.evadeOffsetZ, 0, Math.min(1.0, dt * 5.0));
                    c.evadeVelX *= 0.8;
                    c.evadeVelZ *= 0.8;
                    c.isEvading = false;
                }
            }

            const finalPt = { x: patrolX + c.evadeOffsetX, z: patrolZ + c.evadeOffsetZ };
            clampOutOfRunwayZone(finalPt, 12.2);
            c.evadeOffsetX = finalPt.x - patrolX;
            c.evadeOffsetZ = finalPt.z - patrolZ;

            const prevX = c.mesh.position.x;
            const prevZ = c.mesh.position.z;
            c.mesh.position.set(finalPt.x, 0, finalPt.z);

            const moveDx = finalPt.x - prevX;
            const moveDz = finalPt.z - prevZ;
            const moveSpeed = Math.hypot(moveDx, moveDz) / Math.max(dt, 0.001);

            if (c.isEvading && moveSpeed > 0.8) {
                const runHeading = Math.atan2(moveDx, moveDz);
                c.mesh.rotation.y = lerpYaw(c.mesh.rotation.y, runHeading, Math.min(1.0, dt * 14.0));
                if (limbs) {
                    const sprintCycle = Math.sin(elapsed * 18.0 + c.phase) * 0.95;
                    limbs.leftLeg.rotation.x = sprintCycle;
                    limbs.rightLeg.rotation.x = -sprintCycle;
                    limbs.leftArm.rotation.x = -sprintCycle * 1.1;
                    limbs.rightArm.rotation.x = sprintCycle * 1.1;
                    limbs.leftArm.rotation.z = -0.15;
                    limbs.rightArm.rotation.z = 0.15;
                }
            } else if (c.stationary) {
                c.mesh.rotation.y = c.baseRot + Math.sin(a * 0.7) * 0.25;
                if (limbs) {
                    limbs.leftLeg.rotation.x = 0;
                    limbs.rightLeg.rotation.x = 0;
                    if (limbs.pose === 'MARSHAL') {
                        limbs.leftArm.rotation.x = -2.35 + Math.sin(elapsed * 4.5 + c.phase) * 0.45;
                        limbs.rightArm.rotation.x = -2.35 + Math.cos(elapsed * 4.5 + c.phase) * 0.45;
                        limbs.leftArm.rotation.z = -0.35 + Math.sin(elapsed * 4.5) * 0.25;
                        limbs.rightArm.rotation.z = 0.35 - Math.sin(elapsed * 4.5) * 0.25;
                    } else {
                        limbs.leftArm.rotation.x = -0.45;
                        limbs.rightArm.rotation.x = -0.65 + Math.sin(elapsed * 2.5 + c.phase) * 0.15;
                    }
                }
            } else {
                const dx = -Math.sin(a) * c.radius + c.evadeVelX * 0.2;
                const dz =  Math.cos(a) * c.radius + c.evadeVelZ * 0.2;
                c.mesh.rotation.y = Math.atan2(dx, dz);

                if (limbs) {
                    const stride = Math.sin(elapsed * c.speed * 5.2 + c.phase) * 0.52;
                    limbs.leftLeg.rotation.x = stride;
                    limbs.rightLeg.rotation.x = -stride;
                    limbs.leftArm.rotation.x = -stride * 0.75;
                    limbs.rightArm.rotation.x = limbs.pose === 'CARRY' ? -0.45 : stride * 0.75;
                }
            }
        });
    }

    update(dt, elapsed, spawnParticle) {
        // Auto Ops scheduler for realistic carrier activity
        this.autoOpsTimer += dt;
        if (this.autoOpsTimer > 9.0) {
            this.autoOpsTimer = 0;
            if (!this.isCatapultBusy(1) && !this.isCatapultBusy(2)) {
                const parkedJets = this.airWingUnits.filter(u => u.canCycleJet && u.state === 'PARKED' && u.id.startsWith('mid-jet'));
                if (parkedJets.length > 0) {
                    const pick = parkedJets[Math.floor(Math.random() * parkedJets.length)];
                    this.commandJetLaunch(pick);
                }
            }
            if (!this.isLandingStripBusy()) {
                const readyToLand = this.airWingUnits.find(u => u.state === 'AIRBORNE_PATROL' && u.patrolLaps >= 1);
                if (readyToLand) this.commandJetRecovery(readyToLand);
            }
        }

        this.jbdCat1.targetAngle = 0;
        this.jbdCat2.targetAngle = 0;

        const wPos = this.arrestingWireLine.geometry.attributes.position;
        let wireStretched = false;

        const activeDeckHazards = [];

        this.airWingUnits.forEach(u => {
            u.stateTimer += dt;
            const m = u.mesh;

            if (u.canCycleJet) {
                const isCat1 = u.catIndex === 1;
                const catStartX = isCat1 ? -7.5 : 8.5;
                const catEndX   = isCat1 ? -6.5 : 7.5;
                const catStartZ = isCat1 ? 52.0 : 46.0;
                const catEndZ   = 148.0;

                if (u.state === 'PARKED') {
                    m.position.copy(u.homePos);
                    m.rotation.set(0, u.homeRot, 0);
                    u.currentYaw = u.homeRot;
                    if (u.chocks) u.chocks.visible = true;
                    if (m.userData.gearGroup) m.userData.gearGroup.visible = true;
                    if (m.userData.afterburners) m.userData.afterburners.forEach(ab => ab.visible = false);
                    setWingFoldRatio(m, u.homeFolded ? 1.0 : 0.0);

                } else if (u.state === 'TAXI_TO_CAT') {
                    if (u.chocks) u.chocks.visible = false;
                    const t = this.stepAircraftAlongTaxiSpline(u, dt);
                    if (u.homeFolded) {
                        setWingFoldRatio(m, Math.max(0.0, 1.0 - t * 2.0));
                    } else {
                        setWingFoldRatio(m, 0.0);
                    }

                    if (t >= 1.0) {
                        u.state = 'PRE_LAUNCH';
                        u.stateTimer = 0;
                        m.position.set(catStartX, 0, catStartZ);
                        m.rotation.set(0, 0, 0);
                        this.log(`CAT ${u.catIndex}: ${u.callsign} LOCKED IN SHUTTLE`);
                        this.notifyRoster();
                    }

                } else if (u.state === 'PRE_LAUNCH') {
                    if (isCat1) this.jbdCat1.targetAngle = 0.82;
                    else this.jbdCat2.targetAngle = 0.82;

                    m.position.set(catStartX, 0, catStartZ);
                    m.rotation.set(0.025, 0, 0);
                    setWingFoldRatio(m, 0.0);

                    if (u.stateTimer > 0.45 && m.userData.afterburners) {
                        m.userData.afterburners.forEach(ab => {
                            ab.visible = true;
                            ab.scale.z = 0.85 + Math.sin(u.stateTimer * 45) * 0.22;
                        });
                        if (spawnParticle && Math.random() < 0.55) {
                            spawnParticle(
                                new THREE.Vector3(catStartX + (Math.random() - 0.5), DECK_Y + 0.8, catStartZ - 5.5),
                                new THREE.Vector3((Math.random() - 0.5) * 4, 2.5 + Math.random() * 3, -10),
                                0.4, 2.1, 0.6, 0xe2e8f0, 0.35
                            );
                        }
                    }

                    if (u.stateTimer >= 2.2) {
                        u.state = 'LAUNCHING';
                        u.stateTimer = 0;
                        this.log(`CAT ${u.catIndex} LAUNCH! ${u.callsign} AIRBORNE`);
                        this.notifyRoster();
                    }

                } else if (u.state === 'LAUNCHING') {
                    const strokeDur = 1.45;
                    if (u.stateTimer <= strokeDur) {
                        if (isCat1) this.jbdCat1.targetAngle = 0.82;
                        else this.jbdCat2.targetAngle = 0.82;

                        const t = u.stateTimer / strokeDur;
                        const accel = t * t;
                        const cx = THREE.MathUtils.lerp(catStartX, catEndX, accel);
                        const cz = THREE.MathUtils.lerp(catStartZ, catEndZ, accel);
                        m.position.set(cx, 0, cz);
                        m.rotation.set(t > 0.82 ? -0.14 : 0, 0, 0);

                        if (spawnParticle) {
                            spawnParticle(
                                new THREE.Vector3(cx, DECK_Y + 0.25, cz - 3.0),
                                new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.8 + Math.random(), -6),
                                0.35, 1.8, 0.75, 0xf8fafc, 0.38
                            );
                        }
                    } else {
                        const climbT = (u.stateTimer - strokeDur) / 3.0;
                        if (climbT > 0.25 && m.userData.gearGroup) m.userData.gearGroup.visible = false;

                        const cz = catEndZ + climbT * 135;
                        const cy = Math.pow(climbT, 1.35) * 38;
                        const turnDir = isCat1 ? -1 : 1;
                        const cx = catEndX + turnDir * Math.pow(climbT, 1.8) * 55;

                        m.position.set(cx, cy, cz);
                        m.rotation.set(-0.22 * (1 - climbT * 0.5), turnDir * climbT * 0.85, -turnDir * 0.42);

                        if (climbT >= 1.0) {
                            u.state = 'AIRBORNE_PATROL';
                            u.stateTimer = 0;
                            u.patrolLaps = 0;
                            u.patrolAngle = Math.atan2(m.position.x / 145.0, m.position.z / 245.0);
                            u.patrolTransitionStartPosition = m.position.clone();
                            u.patrolTransitionStartRotation = m.rotation.clone();
                            u.patrolTransitionTimer = 0;
                            if (m.userData.afterburners) m.userData.afterburners.forEach(ab => ab.visible = false);
                            this.notifyRoster();
                        }
                    }

                } else if (u.state === 'AIRBORNE_PATROL') {
                    const angularSpeed = 0.42;
                    const prevAngle = u.patrolAngle;
                    u.patrolAngle += angularSpeed * dt;
                    if (Math.floor(u.patrolAngle / (Math.PI * 2)) > Math.floor(prevAngle / (Math.PI * 2))) {
                        u.patrolLaps++;
                    }

                    const rx = 145;
                    const rz = 245;
                    const px = Math.sin(u.patrolAngle) * rx;
                    const pz = Math.cos(u.patrolAngle) * rz;
                    const py = 42 + Math.sin(u.patrolAngle * 2) * 4.0;

                    const dx = Math.cos(u.patrolAngle) * rx;
                    const dz = -Math.sin(u.patrolAngle) * rz;
                    const heading = Math.atan2(dx, dz);

                    if (u.patrolTransitionStartPosition) {
                        u.patrolTransitionTimer = Math.min(u.patrolTransitionTimer + dt, 2.5);
                        const transitionProgress = u.patrolTransitionTimer / 2.5;
                        const easedProgress = transitionProgress * transitionProgress * (3.0 - 2.0 * transitionProgress);
                        m.position.lerpVectors(u.patrolTransitionStartPosition, new THREE.Vector3(px, py, pz), easedProgress);
                        m.rotation.x = THREE.MathUtils.lerp(u.patrolTransitionStartRotation.x, 0.03, easedProgress);
                        m.rotation.y = lerpYaw(u.patrolTransitionStartRotation.y, heading, easedProgress);
                        m.rotation.z = THREE.MathUtils.lerp(u.patrolTransitionStartRotation.z, 0.28, easedProgress);
                        if (transitionProgress >= 1.0) u.patrolTransitionStartPosition = null;
                    } else {
                        m.position.set(px, py, pz);
                        m.rotation.set(0.03, heading, 0.28);
                    }

                } else if (u.state === 'APPROACH') {
                    if (m.userData.gearGroup) m.userData.gearGroup.visible = true;
                    const touchdown = new THREE.Vector3(3.5, 0, -98.0);
                    const approachEntry = touchdown.clone().addScaledVector(
                        new THREE.Vector3(RUNWAY_DIR.x, 0, RUNWAY_DIR.y),
                        -215.0
                    );
                    approachEntry.y = 32.0;

                    const joinDur = u.approachJoinDuration || 3.0;
                    if (u.stateTimer <= joinDur) {
                        const t = u.stateTimer / joinDur;
                        const s = t * t * (3.0 - 2.0 * t);
                        m.position.lerpVectors(u.approachStartPosition, approachEntry, s);
                        m.rotation.y = lerpYaw(u.approachStartRotation.y, RUNWAY_YAW, s);
                        m.rotation.x = THREE.MathUtils.lerp(u.approachStartRotation.x, 0.07, s);
                        m.rotation.z = THREE.MathUtils.lerp(u.approachStartRotation.z, 0, s);
                    } else {
                        const slopeDur = 4.8;
                        const tSlope = Math.min((u.stateTimer - joinDur) / slopeDur, 1.0);
                        m.position.lerpVectors(approachEntry, touchdown, tSlope);
                        m.rotation.set(0.07, RUNWAY_YAW, 0);

                        if (tSlope >= 1.0) {
                            u.state = 'TOUCHDOWN_ROLLOUT';
                            u.stateTimer = 0;
                            this.log(`TRAP! ${u.callsign} CAUGHT 3-WIRE OK`);
                            this.notifyRoster();
                        }
                    }

                } else if (u.state === 'TOUCHDOWN_ROLLOUT') {
                    const dur = 1.75;
                    const t = Math.min(u.stateTimer / dur, 1.0);
                    const decel = 1.0 - Math.pow(1.0 - t, 2.6);
                    const runDist = decel * 74.0;

                    const touchX = 3.5;
                    const touchZ = -98.0;
                    const jx = touchX + RUNWAY_DIR.x * runDist;
                    const jz = touchZ + RUNWAY_DIR.y * runDist;

                    m.position.set(jx, 0, jz);
                    m.rotation.set(Math.sin(t * Math.PI) * 0.055, RUNWAY_YAW, 0);

                    wireStretched = true;
                    wPos.setXYZ(1, jx - RUNWAY_DIR.x * 4.2, 0.2, jz - RUNWAY_DIR.y * 4.2);
                    wPos.needsUpdate = true;

                    if (t >= 1.0) {
                        u.state = 'TAXI_TO_PARK';
                        u.stateTimer = 0;
                        this.planTaxiRouteToPark(u);
                        this.log(`${u.callsign}: TAXIING BACK TO HOME SPOT & FOLDING WINGS`);
                        this.notifyRoster();
                    }

                } else if (u.state === 'TAXI_TO_PARK') {
                    const t = this.stepAircraftAlongTaxiSpline(u, dt);
                    if (u.homeFolded) {
                        setWingFoldRatio(m, Math.max(0.0, (t - 0.35) / 0.65));
                    }

                    if (t >= 1.0) {
                        u.state = 'PARKED';
                        u.stateTimer = 0;
                        m.position.copy(u.homePos);
                        m.rotation.set(0, u.homeRot, 0);
                        setWingFoldRatio(m, u.homeFolded ? 1.0 : 0.0);
                        this.log(`${u.callsign}: SECURED AT HOME POSITION`);
                        this.notifyRoster();
                    }
                }

                // Add active hazard for crew/tractors avoidance
                if (u.state === 'TAXI_TO_CAT' || u.state === 'TAXI_TO_PARK' || u.state === 'TOUCHDOWN_ROLLOUT' || u.state === 'PRE_LAUNCH') {
                    const fwdX = Math.sin(m.rotation.y);
                    const fwdZ = Math.cos(m.rotation.y);
                    activeDeckHazards.push({
                        x: m.position.x + fwdX * 3.5,
                        z: m.position.z + fwdZ * 3.5,
                        fwdX,
                        fwdZ,
                        radius: 11.5,
                        urgent: true
                    });
                }

            } else if (u.type === 'MH-60S') {
                // Spool rotor speed dynamically based on flight status
                if (m.userData.rotorEntry) {
                    const targetRotorSpeed = (u.state === 'PARKED') ? 2.5 : 24.0;
                    m.userData.rotorEntry.speed = THREE.MathUtils.lerp(m.userData.rotorEntry.speed, targetRotorSpeed, dt * 1.5);
                }

                if (u.state === 'PARKED') {
                    m.position.copy(u.homePos);
                    m.rotation.set(0, u.homeRot, 0);
                    if (u.chocks) u.chocks.visible = true;

                } else if (u.state === 'LIFTOFF') {
                    if (u.chocks) u.chocks.visible = false;
                    const dur = 2.8;
                    const progress = Math.min(u.stateTimer / dur, 1.0);
                    const easedProgress = progress * progress * (3.0 - 2.0 * progress);
                    m.position.y = THREE.MathUtils.lerp(u.liftoffStartY || 0, 24, easedProgress);
                    m.rotation.y += dt * 0.45;
                    m.rotation.x = Math.sin(progress * Math.PI) * 0.08;
                    if (progress >= 1.0) {
                        u.state = 'PATROL_ORBIT';
                        u.stateTimer = 0;
                        this.notifyRoster();
                    }

                } else if (u.state === 'PATROL_ORBIT') {
                    const a = u.stateTimer * 0.45;
                    const orbitProgress = Math.min(u.stateTimer / 3.0, 1.0);
                    const orbitRadius = 45.0 * orbitProgress * orbitProgress * (3.0 - 2.0 * orbitProgress);
                    m.position.x = u.homePos.x + Math.sin(a) * orbitRadius;
                    m.position.z = u.homePos.z + Math.cos(a) * orbitRadius;
                    m.position.y = 24 + Math.sin(a * 2) * 2.8 * orbitProgress;
                    m.rotation.y = lerpYaw(m.rotation.y, a + Math.PI / 2, 1.0 - Math.exp(-2.5 * dt));
                    m.rotation.z = -0.12 * Math.sin(a);

                } else if (u.state === 'RETURN_APPROACH') {
                    const duration = u.heliReturnDuration || 4.5;
                    const progress = Math.min(u.stateTimer / duration, 1.0);
                    const easedProgress = progress * progress * (3.0 - 2.0 * progress);
                    m.position.lerpVectors(u.heliReturnStartPosition, u.homePos, easedProgress);
                    m.rotation.x = THREE.MathUtils.lerp(u.heliReturnStartRotation.x, 0, easedProgress);
                    m.rotation.y = lerpYaw(u.heliReturnStartRotation.y, u.homeRot, easedProgress);
                    m.rotation.z = THREE.MathUtils.lerp(u.heliReturnStartRotation.z, 0, easedProgress);
                    if (progress >= 1.0) {
                        u.state = 'PARKED';
                        u.stateTimer = 0;
                        m.position.copy(u.homePos);
                        m.rotation.set(0, u.homeRot, 0);
                        if (u.chocks) u.chocks.visible = true;
                        this.log(`${u.callsign}: SAFELY TOUCHED DOWN & SECURED`);
                        this.notifyRoster();
                    }
                }
            }
        });

        if (!wireStretched) {
            wPos.setXYZ(1, 3.5, 0.14, -98.0);
            wPos.needsUpdate = true;
        }

        // Animate propellers, rotodomes, and helicopter rotors
        spinningPropsAndDomes.forEach(sp => {
            if (sp.axis === 'z') sp.mesh.rotation.z += sp.speed * dt;
            else sp.mesh.rotation.y += sp.speed * dt;
        });

        allHeliRotors.forEach(hr => {
            hr.mainRotor.rotation.y += hr.speed * dt;
            hr.tailRotor.rotation.x += hr.speed * dt * 1.5;
        });

        // Update tractors and skittles
        this.updateVehicles(dt, activeDeckHazards);
        this.updateCrew(dt, elapsed, activeDeckHazards);
    }
}
