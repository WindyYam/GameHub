const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const shadersSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'shaders.js'), 'utf8').replace(/\r\n/g, '\n');
const envSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'environment.js'), 'utf8').replace(/\r\n/g, '\n');

function extractSection(src, startMarker, endMarker) {
    const start = src.indexOf(startMarker);
    assert.ok(start >= 0, `Could not find start marker: ${startMarker}`);
    const end = src.indexOf(endMarker, start);
    assert.ok(end > start, `Could not find end marker: ${endMarker}`);
    return src.slice(start, end);
}

function createMockTHREE() {
    class Vector2 {
        constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    }
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        clone() { return new Vector3(this.x, this.y, this.z); }
        sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
        length() { return Math.hypot(this.x, this.y, this.z); }
        divideScalar(s) { this.x /= s; this.y /= s; this.z /= s; return this; }
        normalize() {
            const l = this.length() || 1;
            this.x /= l; this.y /= l; this.z /= l;
            return this;
        }
    }
    class BufferAttribute {
        constructor(array, itemSize) {
            this.array = array;
            this.itemSize = itemSize;
            this.count = array.length / itemSize;
        }
        getX(i) { return this.array[i * this.itemSize]; }
        getY(i) { return this.array[i * this.itemSize + 1]; }
        getZ(i) { return this.array[i * this.itemSize + 2]; }
        setX(i, v) { this.array[i * this.itemSize] = v; }
        setZ(i, v) { this.array[i * this.itemSize + 2] = v; }
        setXY(i, x, y) { this.array[i * 2] = x; this.array[i * 2 + 1] = y; }
        setXYZ(i, x, y, z) {
            const b = i * this.itemSize;
            this.array[b] = x; this.array[b + 1] = y; this.array[b + 2] = z;
        }
    }
    class Float32BufferAttribute extends BufferAttribute {
        constructor(arr, itemSize) {
            super(arr instanceof Float32Array ? arr : new Float32Array(arr), itemSize);
        }
    }
    class Uint32BufferAttribute extends BufferAttribute {
        constructor(arr, itemSize) {
            super(arr instanceof Uint32Array ? arr : new Uint32Array(arr), itemSize);
        }
    }
    class BufferGeometry {
        constructor() {
            this.attributes = {};
            this.index = null;
            this.userData = {};
            this.boundingBox = null;
            this.boundingSphere = null;
        }
        setAttribute(name, attr) { this.attributes[name] = attr; return this; }
        setIndex(idx) {
            this.index = Array.isArray(idx) ? new BufferAttribute(new Uint32Array(idx), 1) : idx;
            return this;
        }
        translate(tx, ty, tz) {
            const p = this.attributes.position;
            for (let i = 0; i < p.count; i++) {
                p.setXYZ(i, p.getX(i) + tx, p.getY(i) + ty, p.getZ(i) + tz);
            }
            return this;
        }
        scale(sx, sy, sz) {
            const p = this.attributes.position;
            for (let i = 0; i < p.count; i++) {
                p.setXYZ(i, p.getX(i) * sx, p.getY(i) * sy, p.getZ(i) * sz);
            }
            return this;
        }
        rotateY(ang) {
            const c = Math.cos(ang), s = Math.sin(ang);
            const p = this.attributes.position;
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), z = p.getZ(i);
                p.setXYZ(i, x * c + z * s, p.getY(i), -x * s + z * c);
            }
            if (this.attributes.normal) {
                const n = this.attributes.normal;
                for (let i = 0; i < n.count; i++) {
                    const x = n.getX(i), z = n.getZ(i);
                    n.setXYZ(i, x * c + z * s, n.getY(i), -x * s + z * c);
                }
            }
            return this;
        }
        rotateX(ang) {
            const c = Math.cos(ang), s = Math.sin(ang);
            const p = this.attributes.position;
            for (let i = 0; i < p.count; i++) {
                const y = p.getY(i), z = p.getZ(i);
                p.setXYZ(i, p.getX(i), y * c - z * s, y * s + z * c);
            }
            if (this.attributes.normal) {
                const n = this.attributes.normal;
                for (let i = 0; i < n.count; i++) {
                    const y = n.getY(i), z = n.getZ(i);
                    n.setXYZ(i, n.getX(i), y * c - z * s, y * s + z * c);
                }
            }
            return this;
        }
        rotateZ(ang) {
            const c = Math.cos(ang), s = Math.sin(ang);
            const p = this.attributes.position;
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), y = p.getY(i);
                p.setXYZ(i, x * c - y * s, x * s + y * c, p.getZ(i));
            }
            return this;
        }
        computeVertexNormals() {
            if (!this.attributes.normal && this.attributes.position) {
                const n = new Float32Array(this.attributes.position.count * 3);
                for (let i = 0; i < this.attributes.position.count; i++) n[i * 3 + 1] = 1;
                this.attributes.normal = new BufferAttribute(n, 3);
            }
        }
        computeBoundingBox() {
            const p = this.attributes.position;
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            }
            this.boundingBox = { min: new Vector3(minX, minY, minZ), max: new Vector3(maxX, maxY, maxZ) };
        }
        computeBoundingSphere() {}
    }
    class BoxGeometry extends BufferGeometry {
        constructor(w = 1, h = 1, d = 1, ws = 1, hs = 1, ds = 1) {
            super();
            const pos = [], norm = [], uvs = [], idx = [];
            let vertCount = 0;
            const buildPlane = (uAxis, vAxis, wAxis, udir, vdir, width, height, depth, gridX, gridY) => {
                const segW = width / gridX, segH = height / gridY;
                const wHalf = width / 2, hHalf = height / 2, dHalf = depth / 2;
                const nVec = [0, 0, 0];
                nVec[wAxis] = depth > 0 ? 1 : -1;
                const base = vertCount;
                for (let iy = 0; iy <= gridY; iy++) {
                    const y = iy * segH - hHalf;
                    for (let ix = 0; ix <= gridX; ix++) {
                        const x = ix * segW - wHalf;
                        const pt = [0, 0, 0];
                        pt[uAxis] = x * udir;
                        pt[vAxis] = y * vdir;
                        pt[wAxis] = dHalf;
                        pos.push(pt[0], pt[1], pt[2]);
                        norm.push(nVec[0], nVec[1], nVec[2]);
                        uvs.push(ix / gridX, 1 - (iy / gridY));
                        vertCount++;
                    }
                }
                for (let iy = 0; iy < gridY; iy++) {
                    for (let ix = 0; ix < gridX; ix++) {
                        const a = base + ix + (gridX + 1) * iy;
                        const b = base + ix + (gridX + 1) * (iy + 1);
                        const c = base + (ix + 1) + (gridX + 1) * (iy + 1);
                        const dP = base + (ix + 1) + (gridX + 1) * iy;
                        idx.push(a, b, dP, b, c, dP);
                    }
                }
            };
            buildPlane(2, 1, 0, -1, -1, d, h, w, ds, hs);  // +X
            buildPlane(2, 1, 0, 1, -1, d, h, -w, ds, hs);  // -X
            buildPlane(0, 2, 1, 1, 1, w, d, h, ws, ds);    // +Y
            buildPlane(0, 2, 1, 1, -1, w, d, -h, ws, ds);  // -Y
            buildPlane(0, 1, 2, 1, -1, w, h, d, ws, hs);   // +Z
            buildPlane(0, 1, 2, -1, -1, w, h, -d, ws, hs); // -Z
            this.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
            this.setAttribute('normal', new BufferAttribute(new Float32Array(norm), 3));
            this.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
            this.setIndex(idx);
        }
    }
    class CylinderGeometry extends BoxGeometry {
        constructor(rt = 1, rb = 1, h = 1) {
            super(Math.max(rt, rb) * 2, h, Math.max(rt, rb) * 2);
        }
    }
    class SphereGeometry extends BoxGeometry {
        constructor(r = 1) { super(r * 2, r * 2, r * 2); }
    }
    class DodecahedronGeometry extends BoxGeometry {
        constructor(r = 1) { super(r * 1.8, r * 1.8, r * 1.8); }
    }

    return {
        Vector2,
        Vector3,
        BufferAttribute,
        Float32BufferAttribute,
        Uint32BufferAttribute,
        BufferGeometry,
        BoxGeometry,
        CylinderGeometry,
        SphereGeometry,
        DodecahedronGeometry
    };
}

test('createVillagePBRAtlas generates Q0 cutout fences and vines, Q2 brickwork with scratches/cracks, and Q3 clapboard wood', () => {
    const atlasSection = extractSection(
        shadersSrc,
        'let _villagePBRAtlas = null;',
        '// Procedural Seamless PBR Terrain Normal Atlas'
    );

    const drawLog = { clearedQ0: false, fillRectsInQ2: 0, fillRectsInQ3: 0, putImages: [] };
    function makeMockCanvas() {
        const canvas = { width: 0, height: 0 };
        canvas.getContext = () => {
            const stateStack = [];
            let clipRect = null;
            return {
                fillStyle: '#000',
                strokeStyle: '#000',
                lineWidth: 1,
                lineCap: 'butt',
                save: () => { stateStack.push(clipRect); },
                restore: () => { clipRect = stateStack.pop() || null; },
                translate: () => {},
                rotate: () => {},
                beginPath: () => {},
                closePath: () => {},
                moveTo: () => {},
                lineTo: () => {},
                quadraticCurveTo: () => {},
                bezierCurveTo: () => {},
                arc: () => {},
                rect: (x, y, w, h) => { clipRect = { x, y, w, h }; },
                clip: () => {},
                clearRect: (x, y, w, h) => {
                    if (x === 0 && y === 0 && w >= 512 && h >= 512) drawLog.clearedQ0 = true;
                },
                fillRect: () => {
                    if (clipRect && clipRect.x === 0 && clipRect.y >= 512) drawLog.fillRectsInQ2++;
                    if (clipRect && clipRect.x >= 512 && clipRect.y >= 512) drawLog.fillRectsInQ3++;
                },
                strokeRect: () => {},
                fill: () => {},
                stroke: () => {},
                createLinearGradient: () => ({ addColorStop: () => {} }),
                createRadialGradient: () => ({ addColorStop: () => {} }),
                createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
                getImageData: (x, y, w, h) => {
                    const data = new Uint8ClampedArray(w * h * 4);
                    // Simulate Q0 transparent gap at (10, 40) and opaque leaf at (256, 120) plus opaque fence picket at (256, 380)
                    for (let py = 0; py < h; py++) {
                        for (let px = 0; px < w; px++) {
                            const idx = (py * w + px) * 4;
                            const isOpaqueLeaf = (px >= 240 && px <= 270 && py >= 100 && py <= 140);
                            const isOpaqueFence = (px >= 248 && px <= 264 && py >= 280 && py <= 490);
                            const isLowerQuads = (px >= 512 || py >= 512);
                            data[idx] = isOpaqueLeaf ? 52 : 140;
                            data[idx + 1] = isOpaqueLeaf ? 118 : 110;
                            data[idx + 2] = isOpaqueLeaf ? 38 : 88;
                            data[idx + 3] = (isLowerQuads || isOpaqueLeaf || isOpaqueFence) ? 255 : 0;
                        }
                    }
                    return { data, width: w, height: h };
                },
                putImageData: (img) => { drawLog.putImages.push(img); }
            };
        };
        return canvas;
    }

    class MockCanvasTexture {
        constructor(c) { this.image = c; }
    }

    const ctx = vm.createContext({
        Math,
        Float32Array,
        Uint8ClampedArray,
        document: { createElement: () => makeMockCanvas() },
        THREE: { CanvasTexture: MockCanvasTexture, sRGBEncoding: 3001 }
    });
    vm.runInContext(`${atlasSection}; this.createVillagePBRAtlas = createVillagePBRAtlas;`, ctx);
    const atlas = ctx.createVillagePBRAtlas();

    assert.ok(atlas && atlas.albedo && atlas.normal && atlas.roughness, 'createVillagePBRAtlas must return albedo, normal, roughness textures');
    assert.equal(drawLog.clearedQ0, true, 'Q0 quadrant must clear alpha to 0 for cutout fences & vines');
    assert.ok(drawLog.fillRectsInQ2 >= 180, `Q2 brickwork must draw fine Flemish-bond brick courses (got ${drawLog.fillRectsInQ2})`);
    assert.ok(drawLog.fillRectsInQ3 >= 160, `Q3 wood siding must draw clapboard courses and wood grain (got ${drawLog.fillRectsInQ3})`);
    assert.ok(drawLog.putImages.length >= 3, 'Albedo (with mip-safe Q0 color dilation), normal, and roughness maps must be written');

    // Verify Q0 mip-safe color dilation populated non-black RGB onto transparent pixels
    const albedoImg = drawLog.putImages[0];
    const vineGapIdx = (40 * 1024 + 10) * 4;
    const fenceGapIdx = (380 * 1024 + 10) * 4;
    assert.ok(albedoImg.data[vineGapIdx + 1] > 70 && albedoImg.data[vineGapIdx + 3] === 0, 'Vine cutout transparent gaps must have green edge color dilation');
    assert.ok(albedoImg.data[fenceGapIdx] > 140 && albedoImg.data[fenceGapIdx + 3] === 0, 'Fence cutout transparent gaps must have timber/iron edge color dilation');
});

test('houses are larger in varied sizes, include wooden & brick types, and have alpha-cutout fences leaving gate & door clear', () => {
    const THREE = createMockTHREE();
    const geomHelpers = extractSection(
        envSrc,
        'function mergeBufferGeometries(geometries)',
        'function createCurvedFoliageCard('
    );
    const uvAndFoliage = extractSection(
        envSrc,
        'function createCurvedFoliageCard(',
        'function createDetailedSpruceGeometry()'
    );
    const houseAndRuinSection = extractSection(
        envSrc,
        'function createPitchedRoofGeometry(',
        'function createStoneWallGeometry()'
    );
    const expandedHousesSection = extractSection(
        envSrc,
        '// 5M. North African Desert Adobe',
        '// 5O. Alpine Jagged Granite Peak Crag'
    ) + '\n' + extractSection(
        envSrc,
        '// 5Q. Grand Two-Story European Brick Townhouse',
        '// 5U. Additional Botanical Variety:'
    );

    const ctx = vm.createContext({ Math, Float32Array, Uint32Array, THREE });
    vm.runInContext(`${geomHelpers}\n${uvAndFoliage}\n${houseAndRuinSection}\n${expandedHousesSection}`, ctx);

    const cottage = ctx.createEuropeanCottageGeometry();
    const townhouse = ctx.createVillageTownhouseGeometry();
    const farmhouse = ctx.createStoneFarmhouseGeometry();
    const barn = ctx.createBarnGeometry();
    const chalet = ctx.createAlpineChaletGeometry();
    const kasbah = ctx.createDesertKasbahGeometry();
    const adobe = ctx.createDesertAdobeHouseGeometry();

    // 1. All house types are larger than previous compact footprints & span varied sizes
    const houses = [
        { name: 'cottage', geo: cottage },
        { name: 'townhouse', geo: townhouse },
        { name: 'farmhouse', geo: farmhouse },
        { name: 'barn', geo: barn },
        { name: 'chalet', geo: chalet },
        { name: 'kasbah', geo: kasbah },
        { name: 'adobe', geo: adobe }
    ];
    for (const h of houses) {
        const s = h.geo.userData.enterableSpec;
        assert.ok(s, `${h.name} must preserve enterableSpec`);
        assert.ok(s.w >= 6.4 && s.l >= 7.8, `${h.name} should be enlarged (got w=${s.w}, l=${s.l})`);
        assert.equal(h.geo.userData.hasCutoutFence, true, `${h.name} must include a texture-cutout fence`);
    }

    const widths = new Set(houses.map(h => h.geo.userData.enterableSpec.w));
    const heights = new Set(houses.map(h => h.geo.userData.enterableSpec.h));
    const lengths = new Set(houses.map(h => h.geo.userData.enterableSpec.l));
    assert.ok(widths.size >= 5 && heights.size >= 5 && lengths.size >= 6, 'Houses must come in distinct sizes across archetypes');
    assert.ok(townhouse.userData.enterableSpec.h > cottage.userData.enterableSpec.h, 'Townhouse must be taller than cottage');
    assert.ok(farmhouse.userData.enterableSpec.w > cottage.userData.enterableSpec.w, 'Farmhouse must be wider than cottage');

    // 2. Explicit wooden and brick types with correct UV quadrants & fence cutout UVs
    assert.equal(cottage.userData.houseStyle, 'brick', 'Cottage must be brick type');
    assert.equal(townhouse.userData.houseStyle, 'brick', 'Townhouse must be brick type');
    assert.equal(farmhouse.userData.houseStyle, 'brick', 'Farmhouse must be brick/stone type');
    assert.equal(barn.userData.houseStyle, 'wood', 'Barn must be wooden type');
    assert.equal(chalet.userData.houseStyle, 'wood', 'Chalet must be wooden type');

    function inspectHouseUVs(geo, expectedWallU) {
        const pos = geo.attributes.position;
        const uv = geo.attributes.uv;
        const idx = geo.index.array;
        const spec = geo.userData.enterableSpec;
        let fenceTris = 0;
        let wallTrisInExpectedQuad = 0;
        let gateBlocked = false;

        for (let t = 0; t < idx.length; t += 3) {
            const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
            const uAvg = (uv.getX(i0) + uv.getX(i1) + uv.getX(i2)) / 3;
            const vAvg = (uv.getY(i0) + uv.getY(i1) + uv.getY(i2)) / 3;
            const yMax = Math.max(pos.getY(i0), pos.getY(i1), pos.getY(i2));
            const zAvg = (pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3;
            const xMin = Math.min(pos.getX(i0), pos.getX(i1), pos.getX(i2));
            const xMax = Math.max(pos.getX(i0), pos.getX(i1), pos.getX(i2));

            if (uAvg >= 0.02 && uAvg <= 0.48 && vAvg >= 0.51 && vAvg <= 0.74) {
                fenceTris++;
                // Check lower yard fence (yMax < 2.2m) does not block front gate walkway into +Z doorway
                if (yMax < 2.2 && zAvg > spec.l * 0.5 + 0.5) {
                    const overlapsCenterCorridor = (xMax > -(spec.doorW * 0.5 + 0.35)) && (xMin < (spec.doorW * 0.5 + 0.35));
                    if (overlapsCenterCorridor) gateBlocked = true;
                }
            }
            if (vAvg >= 0.02 && vAvg <= 0.48 && yMax > spec.floorY + 0.5 && yMax < spec.floorY + spec.h - 0.1) {
                if (uAvg >= expectedWallU[0] && uAvg <= expectedWallU[1]) {
                    wallTrisInExpectedQuad++;
                }
            }
        }
        return { fenceTris, wallTrisInExpectedQuad, gateBlocked };
    }

    const cottageUV = inspectHouseUVs(cottage, [0.02, 0.48]);
    const townhouseUV = inspectHouseUVs(townhouse, [0.02, 0.48]);
    const chaletUV = inspectHouseUVs(chalet, [0.52, 0.98]);
    const barnUV = inspectHouseUVs(barn, [0.52, 0.98]);

    assert.ok(cottageUV.fenceTris >= 8 && chaletUV.fenceTris >= 8, 'Houses must contain Q0 alpha-cutout fence panel triangles');
    assert.ok(townhouseUV.fenceTris >= 10, 'Townhouse must contain courtyard fence and balcony iron balustrade cutout panels');
    assert.equal(cottageUV.gateBlocked, false, 'Cottage front fence gate must remain open for soldier doorway walk-in');
    assert.equal(barnUV.gateBlocked, false, 'Barn front fence gate must remain open for soldier walk-in');
    assert.ok(cottageUV.wallTrisInExpectedQuad > 20, 'Brick cottage walls must map to Q2 masonry/brick UV quadrant');
    assert.ok(chaletUV.wallTrisInExpectedQuad > 20, 'Wooden chalet walls must map to Q3 clapboard wood UV quadrant');

    // 3. Verify identical brick/wood texel density on front walls vs side walls + harmonious wall/roof color schemes
    const expectedFrontU = 0.46 / 4.2;
    const expectedFrontV = 0.46 / 6.0;
    function measureWallTexelDensity(geo, wallU) {
        const pos = geo.attributes.position;
        const nrm = geo.attributes.normal;
        const uv = geo.attributes.uv;
        const col = geo.attributes.color;
        const idx = geo.index.array;
        const spec = geo.userData.enterableSpec;
        const frontRatesU = [], frontRatesV = [];
        const sideRatesU = [], sideRatesV = [];

        for (let t = 0; t < idx.length; t += 3) {
            const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
            const nz = Math.abs(nrm.getZ(i0) + nrm.getZ(i1) + nrm.getZ(i2)) / 3;
            const nx = Math.abs(nrm.getX(i0) + nrm.getX(i1) + nrm.getX(i2)) / 3;
            const uAvg = (uv.getX(i0) + uv.getX(i1) + uv.getX(i2)) / 3;
            const vAvg = (uv.getY(i0) + uv.getY(i1) + uv.getY(i2)) / 3;
            const rAvg = col ? (col.getX(i0) + col.getX(i1) + col.getX(i2)) / 3 : 1;
            const yMin = Math.min(pos.getY(i0), pos.getY(i1), pos.getY(i2));
            const yMax = Math.max(pos.getY(i0), pos.getY(i1), pos.getY(i2));
            if (uAvg < wallU[0] || uAvg > wallU[1] || vAvg < 0.02 || vAvg > 0.48) continue;
            if (rAvg < 0.40) continue; // Exclude dark window glass & shutters
            if (yMin < spec.floorY + 0.36 || yMax > spec.floorY + spec.h - 0.15) continue;

            const xs = [pos.getX(i0), pos.getX(i1), pos.getX(i2)];
            const ys = [pos.getY(i0), pos.getY(i1), pos.getY(i2)];
            const zs = [pos.getZ(i0), pos.getZ(i1), pos.getZ(i2)];
            const us = [uv.getX(i0), uv.getX(i1), uv.getX(i2)];
            const vs = [uv.getY(i0), uv.getY(i1), uv.getY(i2)];

            const du = Math.max(...us) - Math.min(...us);
            const dv = Math.max(...vs) - Math.min(...vs);
            const dy = Math.max(...ys) - Math.min(...ys);
            const dx = Math.max(...xs) - Math.min(...xs);
            const dz = Math.max(...zs) - Math.min(...zs);

            if (nz > 0.9 && Math.abs(Math.abs((zs[0] + zs[1] + zs[2]) / 3) - (spec.l * 0.5)) < 0.5 && dx > 0.5 && dy > 0.5) {
                frontRatesU.push(du / dx);
                frontRatesV.push(dv / dy);
            } else if (nx > 0.9 && Math.abs(Math.abs((xs[0] + xs[1] + xs[2]) / 3) - (spec.w * 0.5)) < 0.5 && dz > 0.5 && dy > 0.5) {
                sideRatesU.push(du / dz);
                sideRatesV.push(dv / dy);
            }
        }
        const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
        return {
            frontU: avg(frontRatesU), frontV: avg(frontRatesV),
            sideU: avg(sideRatesU), sideV: avg(sideRatesV),
            nFront: frontRatesU.length, nSide: sideRatesU.length
        };
    }

    for (const [name, geo, rangeU] of [
        ['cottage', cottage, [0.02, 0.48]],
        ['townhouse', townhouse, [0.02, 0.48]],
        ['farmhouse', farmhouse, [0.02, 0.48]],
        ['barn', barn, [0.52, 0.98]],
        ['chalet', chalet, [0.52, 0.98]]
    ]) {
        const d = measureWallTexelDensity(geo, rangeU);
        assert.ok(d.nFront >= 2 && d.nSide >= 4, `${name} must have measurable front and side exterior wall faces`);
        assert.ok(Math.abs(d.frontU - expectedFrontU) / expectedFrontU < 0.02, `${name} front U texel density must equal uniform scale`);
        assert.ok(Math.abs(d.sideU - expectedFrontU) / expectedFrontU < 0.02, `${name} side U texel density (${d.sideU.toFixed(4)}) must match front (${d.frontU.toFixed(4)})`);
        assert.ok(Math.abs(d.sideV - expectedFrontV) / expectedFrontV < 0.02, `${name} side V texel density (${d.sideV.toFixed(4)}) must match front (${d.frontV.toFixed(4)})`);
        assert.ok(geo.userData.colorScheme && geo.userData.colorScheme.wall && geo.userData.colorScheme.roof, `${name} must define a matching wall+roof colorScheme`);
    }
    assert.ok(shadersSrc.includes('#aba299'), 'Q1 roof tiles must use a neutral-tintable base so each house gets a matching roof color');
});

test('ruins look aged with scratches, lush moss, and Q0 alpha-cutout climbing vines while keeping walkable platforms', () => {
    const THREE = createMockTHREE();
    const geomHelpers = extractSection(
        envSrc,
        'function mergeBufferGeometries(geometries)',
        'function createCurvedFoliageCard('
    );
    const uvAndFoliage = extractSection(
        envSrc,
        'function createCurvedFoliageCard(',
        'function createDetailedSpruceGeometry()'
    );
    const houseAndRuinSection = extractSection(
        envSrc,
        'function createPitchedRoofGeometry(',
        'function createStoneWallGeometry()'
    );
    const desertRuinSection = extractSection(
        envSrc,
        '// 5N. Desert Ruined Sandstone / Mud-Brick Compound',
        '// 5O. Alpine Jagged Granite Peak Crag'
    );

    const ctx = vm.createContext({ Math, Float32Array, Uint32Array, THREE });
    vm.runInContext(`${geomHelpers}\n${uvAndFoliage}\n${houseAndRuinSection}\n${desertRuinSection}`, ctx);

    const euroRuin = ctx.createRuinedHouseGeometry();
    const desertRuin = ctx.createDesertRuinGeometry();

    for (const { name, geo } of [{ name: 'euroRuin', geo: euroRuin }, { name: 'desertRuin', geo: desertRuin }]) {
        assert.equal(geo.userData.hasScratches, true, `${name} must flag weathered scratches`);
        assert.equal(geo.userData.hasVines, true, `${name} must flag climbing vines`);
        assert.equal(geo.userData.hasMoss, true, `${name} must flag moss coverage`);
        assert.ok(geo.userData.collisionBoxes.length >= 6, `${name} must preserve standing wall + step collisionBoxes`);
        assert.ok(geo.userData.walkablePlatforms.length >= 4, `${name} must preserve walkable multi-level platforms`);

        const uv = geo.attributes.uv;
        const col = geo.attributes.color;
        let vineVerts = 0;
        let mossVerts = 0;
        for (let i = 0; i < uv.count; i++) {
            const u = uv.getX(i), v = uv.getY(i);
            if (u >= 0.02 && u <= 0.48 && v >= 0.75 && v <= 0.99) vineVerts++;
            const r = col.getX(i), g = col.getY(i);
            if (g > r * 1.20) mossVerts++;
        }
        assert.ok(vineVerts >= 24, `${name} must have Q0 alpha-cutout climbing/hanging vine geometry (got ${vineVerts} verts)`);
        assert.ok(mossVerts >= 40, `${name} must have moss-tinted masonry and 3D moss cushions (got ${mossVerts} verts)`);
    }
});

test('villageMat enables alphaTest and shader moss/scratch detail, and near/far chunk generators share villageTemplates and scale variance', () => {
    assert.ok(envSrc.includes('alphaTest: 0.42'), 'villageMat must enable alphaTest for Q0 cutout fences and vines');
    assert.ok(envSrc.includes('getVillageDepthMaterial()'), 'villageMat must wire cutout depth material for shadows');
    assert.ok(envSrc.includes('isQ2Masonry') && envSrc.includes('isRuinAged'), 'villageMat shader must restrict moss & ruin cracks cleanly to Q2 masonry/ruins');
    assert.ok(envSrc.includes('getVillageTemplates(isCrossroadsVillage, isWestVillage)'), 'Chunk and far-LOD must share getVillageTemplates helper');
    const roadScaleMatches = envSrc.match(/const bScale = 0\.86 \+ rng\(\) \* 0\.46;/g) || [];
    assert.equal(roadScaleMatches.length, 2, 'Both near TerrainChunk and getFarChunkProps must share the wider 0.86..1.32 roadside house scale');
});

test('grass rendering uses fast platform-agnostic GPU shader paths and consistent instance budgets across desktop and mobile', () => {
    // 1. Fast grass terrain lookup & pruned shader loops
    assert.ok(envSrc.includes('float getGrassTerrainSurfaceHeight_gpu('), 'SHARED_TERRAIN_GLSL must provide getGrassTerrainSurfaceHeight_gpu');
    assert.ok(envSrc.includes('if (w[dominantZone] >= 0.999)'), 'getGrassTerrainSurfaceHeight_gpu must take a fast single-zone path when weight is 1.0');
    assert.ok(envSrc.includes('if (greenMeadowMask > 0.5 && speciesRand < 0.16'), 'grass vertex shader must gate 6-species patch loop on speciesRand < 0.16');
    assert.ok(envSrc.includes('float dBSq = dot(dBVec, dBVec);'), 'grass building culling must pre-filter with squared distance');
    assert.ok(envSrc.includes('(uLowGraphics < 0.5 && vGrassDistCam < 55.0)'), 'grass fragment shader must skip secondary edge atlas fetch on low/medium graphics or distance');
    assert.ok(envSrc.includes('if ( receiveShadow && uLowGraphics < 0.5 && vGrassDistCam < 60.0 )'), 'grass SSS shadow must skip distant/low-graphics shadow lookups');

    // 2. Unified instance budgets & radii (no mobile-specific grass branching) and Zone 2 central-difference normal check
    assert.ok(envSrc.includes('vec3(hMx_z2 - hPx_z2, 2.0 * slopeEps, hMz_z2 - hPz_z2)'), 'Zone 2 slope check must use matching central differences instead of groundY baseline');
    assert.ok(envSrc.includes('const tuftCount      = 14000;'), 'close tuftCount must be unified at 14000');
    assert.ok(envSrc.includes('const midCount       = 24000;'), 'midCount must be unified at 24000');
    assert.ok(envSrc.includes('const farCount       = 45000;'), 'farCount must be unified at 45000');
    assert.ok(envSrc.includes('const closeBillboardCount = 7000;'), 'closeBillboardCount must be unified at 7000');
    assert.ok(!envSrc.includes('grassLOD0FarMesh.visible = !isMobile;'), 'grass preset visibility must not branch on isMobile');
    assert.ok(envSrc.includes("} else if (mode === 'medium') {"), 'setGrassMode must handle dedicated medium tier');
    assert.ok(shadersSrc.includes('generateMipmaps = false'), 'NPOT grass atlas textures must disable mipmap generation');
});
