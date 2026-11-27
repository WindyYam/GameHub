/**
 * High-Resolution Procedural Seamless PBR Texture Synthesis Library.
 * Generates DataTextures with height/cavity-AO packed in the alpha channel
 * for height-based material blending, crisp micro-normals, and zero canvas overhead:
 * - Icelandic woolly moss (Racomitrium lanuginosum) cushions + lichen tips
 * - Fractured columnar & stratified dark volcanic basalt cliff rock
 * - Wet volcanic basalt scree, angular gravel & river cobbles
 * - Damp dark volcanic peat/earth footpath with embedded grit
 * - Dual-layer flowing water ripple normal maps
 * - Photographic wispy multi-octave mist/cloud sheet texture
 * - Stretched turbulent waterfall foam & droplet-streak texture
 * - Weathered rusted iron & ribbed Bridges outpost cladding
 */
import * as THREE from 'three';
import { clamp, mix, hash2i } from './noise.js';

function tileHash(ix, iy, period, seed) {
  let px = ix % period;
  if (px < 0) px += period;
  let py = iy % period;
  if (py < 0) py += period;
  let n = Math.imul(px, 374761393) ^ Math.imul(py, 668265263) ^ Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) * 2.3283064365386963e-10;
}

function tileNoise(u, v, period, seed) {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = tileHash(ix, iy, period, seed);
  const b = tileHash(ix + 1, iy, period, seed);
  const c = tileHash(ix, iy + 1, period, seed);
  const d = tileHash(ix + 1, iy + 1, period, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function tileFbm(u, v, basePeriod, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let period = basePeriod;
  for (let i = 0; i < octaves; i++) {
    sum += amp * tileNoise(u, v, period, seed + i * 97);
    norm += amp;
    period <<= 1;
    amp *= 0.5;
  }
  return sum / norm;
}

function tileRidged(u, v, basePeriod, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let period = basePeriod;
  let weight = 1.0;
  for (let i = 0; i < octaves; i++) {
    const raw = 1.0 - Math.abs(tileNoise(u, v, period, seed + i * 131) * 2.0 - 1.0);
    const sig = raw * raw * weight;
    weight = clamp(sig * 1.55, 0.25, 1.0);
    sum += amp * sig;
    norm += amp;
    period <<= 1;
    amp *= 0.5;
  }
  return sum / norm;
}

const _wRes = { f1: 0, f2: 0, edge: 0, id: 0 };
function tileWorley(u, v, cells, seed, out = _wRes) {
  const x = u * cells;
  const y = v * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  let f1 = 8;
  let f2 = 8;
  let bestId = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx;
      const cy = iy + dy;
      const rx = tileHash(cx, cy, cells, seed);
      const ry = tileHash(cx, cy, cells, seed + 577);
      const vx = dx + rx - fx;
      const vy = dy + ry - fy;
      const d = Math.sqrt(vx * vx + vy * vy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        bestId = tileHash(cx, cy, cells, seed + 1237);
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  out.f1 = f1;
  out.f2 = f2;
  out.edge = f2 - f1;
  out.id = bestId;
  return out;
}

function makeDataTexture(rgba, size, { srgb = false, repeat = true, anisotropy = 16 } = {}) {
  const tex = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function heightToNormalDataTexture(heights, size, strength = 3.2) {
  const rgba = new Uint8Array(size * size * 4);
  const mask = size - 1;

  for (let y = 0; y < size; y++) {
    const ym = (y - 1) & mask;
    const yp = (y + 1) & mask;
    const rowM = ym * size;
    const row0 = y * size;
    const rowP = yp * size;

    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & mask;
      const xp = (x + 1) & mask;

      const tl = heights[rowM + xm];
      const t = heights[rowM + x];
      const tr = heights[rowM + xp];
      const l = heights[row0 + xm];
      const r = heights[row0 + xp];
      const bl = heights[rowP + xm];
      const b = heights[rowP + x];
      const br = heights[rowP + xp];

      const dx = tr + 2 * r + br - (tl + 2 * l + bl);
      const dy = bl + 2 * b + br - (tl + 2 * t + tr);
      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1.0;
      const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (row0 + x) * 4;
      rgba[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      rgba[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      rgba[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      rgba[idx + 3] = 255;
    }
  }
  return makeDataTexture(rgba, size, { srgb: false });
}

/**
 * 1. Crisp Sunlit Icelandic Meadow Turf & Woolly Moss — 512x512 high-detail botanical ground.
 * Synthesizes fine directional grass/moss micro-blades, sunlit chartreuse-gold tips, crisp root crevices
 * & mossy micro-tufts with full sRGB PBR dynamic range (never muddy or blurry!).
 */
function createMossTextures(size = 512) {
  const rgba = new Uint8Array(size * size * 4);
  const hBuf = new Float32Array(size * size);
  const wA = { f1: 0, f2: 0, edge: 0, id: 0 };
  const wB = { f1: 0, f2: 0, edge: 0, id: 0 };

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Domain warp breaks up cellular regularity into organic turf/moss clusters
      const warpU = (tileFbm(u, v, 4, 3, 71) - 0.5) * 0.10;
      const warpV = (tileFbm(u + 0.37, v - 0.21, 4, 3, 89) - 0.5) * 0.10;
      const wu = (u + warpU + 1.0) % 1.0;
      const wv = (v + warpV + 1.0) % 1.0;

      // Soft turf swells + crisp fine grass-blade & moss-tuft micro-strands (two crossed anisotropic directions!)
      tileWorley(wu, wv, 8, 107, wA);
      tileWorley(wu, wv, 28, 211, wB);
      const pillow = Math.pow(clamp(1.0 - wA.f1 * 1.05, 0, 1), 0.78);
      const crevice = clamp(wA.edge * 2.6, 0, 1);
      const clump = Math.pow(clamp(1.0 - wB.f1 * 1.18, 0, 1), 0.80);

      // Crisp fine directional micro-grass strands so terrain looks razor-sharp up close AND at mid-range!
      const strandA = tileNoise((u * 2.0 + v * 0.35) % 1.0, (v * 0.45 - u * 0.15 + 1.0) % 1.0, 96, 331);
      const strandB = tileNoise((u * 0.40 - v * 0.25 + 1.0) % 1.0, (v * 2.0 + u * 0.30) % 1.0, 96, 389);
      const blades = Math.max(strandA, strandB);
      const fuzz = tileFbm(u, v, 32, 4, 307);
      const microBud = tileNoise(u, v, 160, 409);
      const grain = tileNoise(u, v, 256, 463);

      const h = clamp(
        pillow * 0.24 * (0.45 + 0.55 * crevice) +
        clump * 0.22 +
        blades * 0.26 +
        fuzz * 0.14 +
        microBud * 0.09 +
        grain * 0.05,
        0,
        1
      );
      hBuf[y * size + x] = h;

      // Vibrant sunlit Icelandic meadow turf palette (full sRGB dynamic range, matching Death Stranding grass/moss!)
      // Deep emerald-peat root gaps (#202d0d) -> rich meadow olive (#648024) -> sunlit golden-chartreuse tips (#b4c642)
      const tipMask = clamp((h - 0.34) * 1.85, 0, 1);
      const darkCrev = clamp(h * 1.38, 0, 1);
      const patchTint = wA.id;

      let r = mix(30, mix(88, 142, patchTint), darkCrev);
      let g = mix(42, mix(116, 152, patchTint * 0.75), darkCrev);
      let b = mix(13, mix(28, 38, patchTint * 0.5), darkCrev);

      // Crisp sunlit golden-olive grass blade tips & woolly moss highlights
      const bladeTip = clamp(tipMask * (0.35 + 0.65 * blades) * (0.55 + 0.45 * microBud), 0, 1);
      r = mix(r, 186, bladeTip * 0.64);
      g = mix(g, 198, bladeTip * 0.62);
      b = mix(b, 64, bladeTip * 0.50);

      // Subtle dry golden-straw & pale lichen micro-flecks for photographic natural breakup
      if (fuzz > 0.68 && h > 0.54) {
        const lt = clamp((fuzz - 0.68) * 3.0, 0, 0.45);
        r = mix(r, 178, lt);
        g = mix(g, 170, lt);
        b = mix(b, 92, lt);
      }

      const idx = (y * size + x) * 4;
      rgba[idx] = clamp(Math.round(r), 0, 255);
      rgba[idx + 1] = clamp(Math.round(g), 0, 255);
      rgba[idx + 2] = clamp(Math.round(b), 0, 255);
      rgba[idx + 3] = clamp(Math.round(h * 255), 0, 255);
    }
  }

  return {
    map: makeDataTexture(rgba, size, { srgb: true }),
    normalMap: heightToNormalDataTexture(hBuf, size, 6.8)
  };
}

/**
 * 2. Weathered Columnar & Fractured Icelandic Basalt Cliff — 512x512.
 * Full-range weathered slate-grey stone, crisp vertical columnar striations, angular fracture blocks & quartz edges.
 */
function createBasaltCliffTextures(size = 512) {
  const rgba = new Uint8Array(size * size * 4);
  const hBuf = new Float32Array(size * size);
  const wBlock = { f1: 0, f2: 0, edge: 0, id: 0 };
  const wFract = { f1: 0, f2: 0, edge: 0, id: 0 };

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;

      // Strong isotropic geological domain warp breaks any directional striping or tiling
      const wU = (tileFbm(u, v, 4, 3, 503) - 0.5) * 0.16;
      const wV = (tileFbm(u + 0.37, v - 0.23, 4, 3, 521) - 0.5) * 0.16;
      const uu = (u + wU + 1.0) % 1.0;
      const vv = (v + wV + 1.0) % 1.0;

      // Chaotic isotropic Voronoi basalt fracture blocks (zero vertical stripes!)
      tileWorley(uu, vv, 7, 607, wBlock);
      tileWorley(uu, vv, 17, 653, wFract);

      const blockEdge = clamp(wBlock.edge * 4.4, 0, 1);
      const fractEdge = clamp(wFract.edge * 3.8, 0, 1);
      const blockStep = 0.44 + 0.56 * wBlock.id;

      const ridgeA = tileRidged(uu, vv, 8, 4, 601);
      const ridgeB = tileRidged((uu + 0.41) % 1.0, (vv + 0.19) % 1.0, 16, 4, 709);
      const rockGrain = tileFbm(u, v, 24, 4, 811);
      const microChip = tileNoise(u, v, 144, 907);

      const fissureAO = Math.min(blockEdge, 0.34 + 0.66 * fractEdge);
      const h = clamp(
        (blockStep * 0.34 + ridgeA * 0.26 + ridgeB * 0.16 + rockGrain * 0.15 + microChip * 0.09) * (0.34 + 0.66 * fissureAO),
        0,
        1
      );
      hBuf[y * size + x] = h;

      // Weathered cool slate-grey basalt with rich contrast (#242a30 fissures -> #8e969e sunlit rock faces!)
      const edgeHighlight = clamp((1.0 - wBlock.f1) * 0.32 + ridgeA * 0.22, 0, 1);
      const base = mix(34, 128, Math.pow(h, 0.88)) + edgeHighlight * 20;
      const mineralTint = (wBlock.id - 0.5) * 14.0;
      const r = base - 1.5 + mineralTint * 0.50;
      const g = base + 0.5 + mineralTint * 0.20;
      const b = base + 4.5 - mineralTint * 0.30;

      const idx = (y * size + x) * 4;
      rgba[idx] = clamp(Math.round(r), 0, 255);
      rgba[idx + 1] = clamp(Math.round(g), 0, 255);
      rgba[idx + 2] = clamp(Math.round(b), 0, 255);
      rgba[idx + 3] = clamp(Math.round(h * 255), 0, 255);
    }
  }

  return {
    map: makeDataTexture(rgba, size, { srgb: true }),
    normalMap: heightToNormalDataTexture(hBuf, size, 6.8)
  };
}

/**
 * 3. Weathered Icelandic Volcanic Cobbles, River Stones & Scree Gravel — 512x512.
 * High-contrast multi-toned grey river cobbles & fractured scree with crisp normal relief.
 */
function createScreeTextures(size = 512) {
  const rgba = new Uint8Array(size * size * 4);
  const hBuf = new Float32Array(size * size);
  const wA = { f1: 0, f2: 0, edge: 0, id: 0 };
  const wB = { f1: 0, f2: 0, edge: 0, id: 0 };
  const wC = { f1: 0, f2: 0, edge: 0, id: 0 };

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      tileWorley(u, v, 12, 1103, wA);
      tileWorley(u, v, 28, 1201, wB);
      tileWorley(u, v, 56, 1277, wC);
      const ash = tileFbm(u, v, 16, 4, 1307);
      const grit = tileNoise(u, v, 160, 1361);

      const stoneA = clamp(1.0 - wA.f1 * 1.22, 0, 1) * clamp(wA.edge * 4.2, 0, 1);
      const stoneB = clamp(1.0 - wB.f1 * 1.22, 0, 1) * clamp(wB.edge * 3.6, 0, 1);
      const stoneC = clamp(1.0 - wC.f1 * 1.18, 0, 1);

      const h = clamp(stoneA * 0.48 + stoneB * 0.28 + stoneC * 0.14 + ash * 0.06 + grit * 0.04, 0, 1);
      hBuf[y * size + x] = h;

      // Multi-toned weathered grey basalt cobbles & pebbles (#262a2e crevices -> #929aa0 lit pebbles)
      const stoneVar = mix(0.68, 1.32, wA.id);
      const warmTint = (wB.id - 0.5) * 10.0;
      const c = mix(32, 118, Math.pow(h, 0.88)) * stoneVar;
      const idx = (y * size + x) * 4;
      rgba[idx] = clamp(Math.round(c - 1 + warmTint * 0.5), 0, 255);
      rgba[idx + 1] = clamp(Math.round(c + 0.5 + warmTint * 0.2), 0, 255);
      rgba[idx + 2] = clamp(Math.round(c + 4.0 - warmTint * 0.4), 0, 255);
      rgba[idx + 3] = clamp(Math.round(h * 255), 0, 255);
    }
  }

  return {
    map: makeDataTexture(rgba, size, { srgb: true }),
    normalMap: heightToNormalDataTexture(hBuf, size, 5.8)
  };
}

/**
 * 4. Damp Volcanic Peat, Mud & Pebble Footpath — 512x512.
 * Rich earthy dark umber-charcoal soil with embedded volcanic pebbles.
 */
function createDirtPathTextures(size = 512) {
  const rgba = new Uint8Array(size * size * 4);
  const hBuf = new Float32Array(size * size);
  const wGrit = { f1: 0, f2: 0, edge: 0, id: 0 };
  const wPeb = { f1: 0, f2: 0, edge: 0, id: 0 };

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const mud = tileFbm(u, v, 8, 4, 1409);
      tileWorley(u, v, 20, 1511, wPeb);
      tileWorley(u, v, 48, 1559, wGrit);
      const micro = tileNoise(u, v, 144, 1583);

      const peb = clamp(1.0 - wPeb.f1 * 1.45, 0, 1);
      const grit = clamp(1.0 - wGrit.f1 * 1.3, 0, 1);
      const h = clamp(mud * 0.50 + peb * 0.28 + grit * 0.14 + micro * 0.08, 0, 1);
      hBuf[y * size + x] = h;

      // Earthy damp Icelandic brown-peat soil with dark grey volcanic stones
      const isPebble = clamp((peb - 0.38) * 3.0, 0, 1);
      const soilR = mix(24, 68, h);
      const soilG = mix(19, 54, h);
      const soilB = mix(13, 35, h);
      const rockC = mix(24, 52, wPeb.id);

      const idx = (y * size + x) * 4;
      rgba[idx] = clamp(Math.round(mix(soilR, rockC, isPebble * 0.72)), 0, 255);
      rgba[idx + 1] = clamp(Math.round(mix(soilG, rockC + 1, isPebble * 0.72)), 0, 255);
      rgba[idx + 2] = clamp(Math.round(mix(soilB, rockC + 3, isPebble * 0.72)), 0, 255);
      rgba[idx + 3] = clamp(Math.round(h * 255), 0, 255);
    }
  }

  return {
    map: makeDataTexture(rgba, size, { srgb: true }),
    normalMap: heightToNormalDataTexture(hBuf, size, 3.8)
  };
}

/** 5. Smooth Flow-Aligned Water Ripple Normal Maps (256x256) */
function createWaterNormal(size = 256, seed = 1601) {
  const hBuf = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Anisotropic ripples elongated along stream flow (V axis)
      const w1 = tileFbm(u, v, 8, 4, seed);
      const w2 = tileRidged(u, v * 0.5, 12, 3, seed + 73);
      const w3 = tileNoise(u, v, 32, seed + 149);
      hBuf[y * size + x] = w1 * 0.56 + w2 * 0.30 + w3 * 0.14;
    }
  }
  return heightToNormalDataTexture(hBuf, size, 1.85);
}

/** 6. Seamless Multi-Octave Wispy Cloud/Mist Texture (512x512, RGB = soft light density, A = wispy alpha) */
function createMistPuffTexture(size = 512) {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const ny = v * 2 - 1;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const nx = u * 2 - 1;
      const r = Math.sqrt(nx * nx + ny * ny);
      const radial = Math.pow(clamp(1.0 - r, 0, 1), 1.85);

      const wu = (u + (tileFbm(u, v, 4, 3, 1777) - 0.5) * 0.16 + 1) % 1;
      const wv = (v + (tileFbm(u + 0.4, v - 0.2, 4, 3, 1789) - 0.5) * 0.16 + 1) % 1;
      const n1 = tileFbm(wu, wv, 4, 5, 1801);
      const n2 = tileFbm(u, v, 8, 4, 1903);
      const wisp = clamp((n1 * 0.68 + n2 * 0.32 - 0.24) * 1.75, 0, 1);
      const alpha = clamp(radial * wisp * 1.25, 0, 1);

      // Subtle internal self-shadow shading (top slightly brighter than bottom)
      const shade = clamp(0.84 + 0.16 * (1.0 - v) + (n2 - 0.5) * 0.12, 0.7, 1.0);
      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(234 * shade);
      rgba[idx + 1] = Math.round(240 * shade);
      rgba[idx + 2] = Math.round(246 * shade);
      rgba[idx + 3] = Math.round(alpha * 255);
    }
  }
  return makeDataTexture(rgba, size, { srgb: true, repeat: false });
}

/** 7. Seamless Vertically-Stretched Turbulent Waterfall Foam & Droplet Veil Texture (512x512) */
function createWaterfallFoamTexture(size = 512) {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Vertically stretched multi-scale cascades & fine water-drop filaments
      const warp = (tileFbm(u, v, 4, 3, 2503) - 0.5) * 0.08;
      const uu = (u + warp + 1) % 1;
      const streakWide = tileFbm(uu, v * 0.25, 8, 4, 2531);
      const streakFine = tileRidged(uu, v * 0.25, 16, 4, 2579);
      const spray = tileFbm(u, v, 24, 4, 2617);
      const droplets = tileNoise(u, v * 0.5, 96, 2663);

      const core = clamp(streakWide * 0.55 + streakFine * 0.45, 0, 1);
      const fine = clamp(streakFine * 0.65 + spray * 0.25 + droplets * 0.10, 0, 1);
      const froth = clamp(spray * 0.70 + droplets * 0.30, 0, 1);

      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(core * 255);     // R: wide frothy water ribbons
      rgba[idx + 1] = Math.round(fine * 255); // G: sharp high-speed water tendrils
      rgba[idx + 2] = Math.round(froth * 255);// B: turbulent mist/droplet breakup
      rgba[idx + 3] = 255;
    }
  }
  return makeDataTexture(rgba, size, { srgb: false, repeat: true });
}

/**
 * 8. Photorealistic Icelandic Architectural & Landmark PBR Textures (512x512):
 * - Weathered rusted iron & ribbed Bridges outpost cladding
 * - Weathered corrugated metal roof sheets (fine subtle ribs + rain streaks & oxidation)
 * - Driftwood silver-grey vertical barn timber planks (knots, seams, damp bottom staining)
 * - Pitch-black tarred Nordic church timber siding
 * - Dry-stacked mossy volcanic basalt rubble stone walls (for authentic turf-house walls!)
 */
function createLandmarkTextures(size = 256) {
  const rustBuf = new Uint8Array(size * size * 4);
  const rustH = new Float32Array(size * size);
  const outBuf = new Uint8Array(size * size * 4);
  const outH = new Float32Array(size * size);
  const corrBuf = new Uint8Array(size * size * 4);
  const corrH = new Float32Array(size * size);
  const woodBuf = new Uint8Array(size * size * 4);
  const woodH = new Float32Array(size * size);
  const tarBuf = new Uint8Array(size * size * 4);
  const tarH = new Float32Array(size * size);
  const stoneBuf = new Uint8Array(size * size * 4);
  const stoneH = new Float32Array(size * size);
  const wStone = { f1: 0, f2: 0, edge: 0, id: 0 };

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      // 8a. Rusted iron
      const grime = tileFbm(u, v, 8, 4, 2111);
      const streak = tileFbm(u * 2.0, v * 0.4, 12, 3, 2203);
      const rVal = clamp(grime * 0.55 + streak * 0.45, 0, 1);
      rustH[y * size + x] = rVal;
      rustBuf[idx] = clamp(Math.round(mix(44, 118, rVal)), 0, 255);
      rustBuf[idx + 1] = clamp(Math.round(mix(18, 48, rVal)), 0, 255);
      rustBuf[idx + 2] = clamp(Math.round(mix(11, 24, rVal)), 0, 255);
      rustBuf[idx + 3] = 255;

      // 8b. Ribbed Bridges outpost cladding
      const rib = Math.pow(Math.abs(Math.sin(u * Math.PI * 16)), 0.35);
      const seam = (v * 8) % 1 < 0.04 ? 0.50 : 1.0;
      const brushed = tileFbm(u * 3, v, 10, 2, 2309) * 0.14;
      const oVal = clamp(rib * 0.72 * seam + brushed, 0, 1);
      outH[y * size + x] = oVal;
      const oc = mix(52, 134, oVal);
      outBuf[idx] = clamp(Math.round(oc - 4), 0, 255);
      outBuf[idx + 1] = clamp(Math.round(oc), 0, 255);
      outBuf[idx + 2] = clamp(Math.round(oc + 6), 0, 255);
      outBuf[idx + 3] = 255;

      // 8c. Weathered Icelandic standing-seam / corrugated zinc-iron roofing (clean anti-aliased ribs + rain weathering, zero moiré!)
      const seamPhase = (u * 12) % 1;
      const standingRib = seamPhase < 0.14 ? 0.35 + (seamPhase / 0.14) * 0.65 : seamPhase < 0.24 ? 1.0 - ((seamPhase - 0.14) / 0.10) * 0.55 : 0.45;
      const rainStreak = tileFbm(u * 3.0, v * 0.6, 8, 4, 2411);
      const grimePatch = tileFbm(u, v, 6, 4, 2423);
      const cVal = clamp(standingRib * 0.36 + rainStreak * 0.38 + grimePatch * 0.26, 0, 1);
      corrH[y * size + x] = standingRib * 0.60 + grimePatch * 0.40;
      const cc = mix(112, 198, cVal) * (0.80 + 0.20 * rainStreak);
      corrBuf[idx] = clamp(Math.round(cc - 2), 0, 255);
      corrBuf[idx + 1] = clamp(Math.round(cc), 0, 255);
      corrBuf[idx + 2] = clamp(Math.round(cc + 4), 0, 255);
      corrBuf[idx + 3] = 255;

      // 8d. Weathered Silver-Grey Vertical Barn Planks (driftwood Iceland barn siding!)
      const plankIdx = Math.floor(u * 14);
      const plankLocal = (u * 14) % 1;
      const plankGap = plankLocal < 0.075 || plankLocal > 0.96 ? 0.18 : 1.0;
      const plankVar = tileHash(plankIdx, 0, 14, 2447);
      const vertGrain = tileFbm(u * 6.0, v * 0.65, 14, 4, 2459);
      const dampBot = mix(0.62, 1.04, clamp((1.0 - v) * 1.4, 0, 1));
      const wVal = clamp((0.35 + vertGrain * 0.55 + (plankVar - 0.5) * 0.28) * plankGap, 0, 1);
      woodH[y * size + x] = wVal;
      const wr = mix(46, 134, wVal) * dampBot;
      const wg = mix(45, 132, wVal) * dampBot;
      const wb = mix(43, 127, wVal) * dampBot;
      woodBuf[idx] = clamp(Math.round(wr), 0, 255);
      woodBuf[idx + 1] = clamp(Math.round(wg), 0, 255);
      woodBuf[idx + 2] = clamp(Math.round(wb), 0, 255);
      woodBuf[idx + 3] = 255;

      // 8e. Pitch-Black Tarred Nordic Church Timber Siding (Búðakirkja dark weathered clapboard)
      const boardIdx = Math.floor(v * 16);
      const boardLocal = (v * 16) % 1;
      const boardEdge = boardLocal < 0.09 ? 0.25 : 0.72 + boardLocal * 0.28;
      const boardVar = tileHash(0, boardIdx, 16, 2473);
      const hGrain = tileFbm(u * 0.6, v * 5.0, 12, 3, 2489);
      const tVal = clamp((0.28 + hGrain * 0.45 + (boardVar - 0.5) * 0.20) * boardEdge, 0, 1);
      tarH[y * size + x] = tVal;
      const tc = mix(14, 44, tVal);
      tarBuf[idx] = clamp(Math.round(tc), 0, 255);
      tarBuf[idx + 1] = clamp(Math.round(tc + 1), 0, 255);
      tarBuf[idx + 2] = clamp(Math.round(tc + 3), 0, 255);
      tarBuf[idx + 3] = 255;

      // 8f. Dry-Stacked Volcanic Basalt Rubble Stone Wall with Mossy Mortar Crevices (authentic turf-house walls!)
      const rowOffset = (Math.floor(v * 7) % 2) * 0.5;
      tileWorley((u + rowOffset * 0.14) % 1.0, (v * 1.45) % 1.0, 7, 2521, wStone);
      const stoneEdge = clamp(wStone.edge * 4.8, 0, 1);
      const stoneFace = clamp(1.0 - wStone.f1 * 0.85, 0, 1) * stoneEdge;
      const stoneTex = tileFbm(u, v, 18, 4, 2543);
      const sVal = clamp(stoneFace * (0.55 + 0.45 * stoneTex), 0, 1);
      stoneH[y * size + x] = sVal;

      const isMossCrevice = stoneEdge < 0.36 && stoneTex > 0.38;
      const stoneShade = mix(18, 72, sVal) * mix(0.75, 1.22, wStone.id);
      if (isMossCrevice) {
        stoneBuf[idx] = clamp(Math.round(mix(24, 58, stoneTex)), 0, 255);
        stoneBuf[idx + 1] = clamp(Math.round(mix(32, 74, stoneTex)), 0, 255);
        stoneBuf[idx + 2] = clamp(Math.round(mix(12, 24, stoneTex)), 0, 255);
      } else {
        stoneBuf[idx] = clamp(Math.round(stoneShade - 1), 0, 255);
        stoneBuf[idx + 1] = clamp(Math.round(stoneShade + 1), 0, 255);
        stoneBuf[idx + 2] = clamp(Math.round(stoneShade + 3), 0, 255);
      }
      stoneBuf[idx + 3] = clamp(Math.round(sVal * 255), 0, 255);
    }
  }

  return {
    rustedIron: {
      map: makeDataTexture(rustBuf, size, { srgb: true }),
      normalMap: heightToNormalDataTexture(rustH, size, 2.8)
    },
    outpostMetal: {
      map: makeDataTexture(outBuf, size, { srgb: true }),
      normalMap: heightToNormalDataTexture(outH, size, 2.4)
    },
    corrugatedIron: {
      map: makeDataTexture(corrBuf, size, { srgb: true }),
      normalMap: heightToNormalDataTexture(corrH, size, 2.6)
    },
    weatheredWood: {
      map: makeDataTexture(woodBuf, size, { srgb: true }),
      normalMap: heightToNormalDataTexture(woodH, size, 3.6)
    },
    tarredWood: {
      map: makeDataTexture(tarBuf, size, { srgb: true }),
      normalMap: heightToNormalDataTexture(tarH, size, 3.4)
    },
    dryStone: {
      map: makeDataTexture(stoneBuf, size, { srgb: true }),
      normalMap: heightToNormalDataTexture(stoneH, size, 5.2)
    }
  };
}

/**
 * Procedural RGBA botanical alpha-cutout textures (lupin raceme + palmate leaf, meadow grass tuft,
 * dwarf-willow bush twig/leaves, and Arctic cotton-grass plume).
 */
function createFloraTextures() {
  const makeCanvasTex = (w, h, drawFn) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    drawFn(ctx, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  };

  // 1. Lupin Atlas (256x256): Left half = dense multi-floret lupin raceme spike; Right half = 7-leaflet palmate leaf
  const lupinMap = makeCanvasTex(256, 256, (ctx, w, h) => {
    // Left half (x: 0..128): Floral spike painted in bright neutral lavender-white so instanceColor tints cleanly
    const cx = 64;
    // Central stem
    const stemGrad = ctx.createLinearGradient(cx, h - 8, cx, 18);
    stemGrad.addColorStop(0, 'rgba(130, 165, 115, 1)');
    stemGrad.addColorStop(0.5, 'rgba(165, 185, 145, 1)');
    stemGrad.addColorStop(1, 'rgba(210, 215, 200, 1)');
    ctx.strokeStyle = stemGrad;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, h - 4);
    ctx.lineTo(cx, 20);
    ctx.stroke();

    // 14 whorled tiers of overlapping rounded pea-like lupin florets tapering to bud tip
    const tiers = 14;
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const ty = h - 22 - f * (h - 46);
      const maxSpread = mix(36, 9, Math.pow(f, 0.85));
      const fSize = mix(13.5, 5.8, Math.pow(f, 0.78));
      const count = f > 0.82 ? 3 : 5;
      for (let k = 0; k < count; k++) {
        const u = count === 1 ? 0 : (k / (count - 1)) * 2 - 1;
        const jx = (hash2i(t * 7 + k, 11, 31) - 0.5) * 5;
        const jy = (hash2i(t * 7 + k, 19, 31) - 0.5) * 5;
        const fx = cx + u * maxSpread + jx;
        const fy = ty + Math.abs(u) * 5 + jy;

        // Calyx / shadow base (neutral grey so instanceColor tints without blue crushing)
        ctx.fillStyle = `rgba(175, 172, 178, 0.98)`;
        ctx.beginPath();
        ctx.ellipse(fx * 0.35 + cx * 0.65, fy + 2.5, fSize * 0.55, fSize * 0.42, u * 0.35, 0, Math.PI * 2);
        ctx.fill();

        // Main rounded banner + wing petals (neutral white-to-silver so LUPIN_PALETTE tints accurately)
        const bright = Math.round(mix(214, 254, f * 0.6 + (1 - Math.abs(u)) * 0.4));
        const g = ctx.createRadialGradient(fx - u * 2, fy - fSize * 0.3, fSize * 0.15, fx, fy, fSize);
        g.addColorStop(0, `rgba(255, 255, 255, 1)`);
        g.addColorStop(0.55, `rgba(${bright}, ${bright}, ${bright}, 1)`);
        g.addColorStop(1, `rgba(${Math.round(bright * 0.78)}, ${Math.round(bright * 0.76)}, ${Math.round(bright * 0.80)}, 0.96)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(fx, fy, fSize * 0.92, fSize * 0.72, u * 0.45 - 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Right half (x: 128..256): 7-leaflet palmate lupin basal leaf
    const lx = 192;
    const ly = 146;
    // Petiole stem
    ctx.strokeStyle = 'rgba(135, 175, 115, 1)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(lx, h - 4);
    ctx.lineTo(lx, ly);
    ctx.stroke();

    const leaflets = 7;
    for (let i = 0; i < leaflets; i++) {
      const ang = -Math.PI * 0.5 + (i - (leaflets - 1) * 0.5) * 0.40;
      const len = 74 - Math.abs(i - 3) * 8;
      const lw = 11.5 - Math.abs(i - 3) * 1.1;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(ang + Math.PI * 0.5);
      const lg = ctx.createLinearGradient(0, 0, 0, -len);
      lg.addColorStop(0, 'rgba(110, 155, 98, 1)');
      lg.addColorStop(0.6, 'rgba(155, 200, 138, 1)');
      lg.addColorStop(1, 'rgba(195, 225, 178, 0.98)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-lw, -len * 0.52, 0, -len);
      ctx.quadraticCurveTo(lw, -len * 0.52, 0, 0);
      ctx.fill();
      // Midrib vein
      ctx.strokeStyle = 'rgba(215, 235, 195, 0.72)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -4);
      ctx.lineTo(0, -len * 0.88);
      ctx.stroke();
      ctx.restore();
    }
  });

  // 2. Meadow Grass Tuft Card (256x256): 14 arching sedge blades + 3 delicate seed heads
  const grassMap = makeCanvasTex(256, 256, (ctx, w, h) => {
    const blades = 14;
    for (let i = 0; i < blades; i++) {
      const bx = 46 + (i / (blades - 1)) * 164 + (hash2i(i, 3, 91) - 0.5) * 12;
      const tipX = bx + (i - blades * 0.5) * 9.5 + (hash2i(i, 5, 91) - 0.5) * 28;
      const tipY = 16 + hash2i(i, 7, 91) * 76;
      const midX = (bx + tipX) * 0.5 + (tipX - bx) * 0.15;
      const midY = (h + tipY) * 0.46;
      const bw = 6.5 + hash2i(i, 9, 91) * 4.5;

      const grad = ctx.createLinearGradient(bx, h, tipX, tipY);
      const tint = hash2i(i, 11, 91);
      if (tint > 0.72) {
        grad.addColorStop(0, 'rgba(140, 165, 110, 1)');
        grad.addColorStop(0.55, 'rgba(205, 218, 155, 1)');
        grad.addColorStop(1, 'rgba(248, 240, 185, 0.98)');
      } else {
        grad.addColorStop(0, 'rgba(125, 165, 105, 1)');
        grad.addColorStop(0.55, 'rgba(185, 222, 150, 1)');
        grad.addColorStop(1, 'rgba(225, 244, 182, 0.98)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(bx - bw, h);
      ctx.quadraticCurveTo(midX - bw * 0.45, midY, tipX, tipY);
      ctx.quadraticCurveTo(midX + bw * 0.45, midY, bx + bw, h);
      ctx.closePath();
      ctx.fill();
    }

    // 3 delicate Nordic sedge seed panicles
    for (let s = 0; s < 3; s++) {
      const sx = 84 + s * 44;
      const sy = 26 + (s % 2) * 18;
      ctx.strokeStyle = 'rgba(195, 210, 145, 0.95)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(sx + (s - 1) * 10, h);
      ctx.quadraticCurveTo(sx, h * 0.5, sx, sy);
      ctx.stroke();

      ctx.fillStyle = 'rgba(245, 232, 182, 0.98)';
      for (let g = 0; g < 6; g++) {
        const gy = sy + g * 8;
        const gx = sx + (g % 2 === 0 ? -4 : 4);
        ctx.beginPath();
        ctx.ellipse(gx, gy, 3.2, 5.5, g % 2 === 0 ? -0.4 : 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });

  // 3. Icelandic Dwarf-Willow / Crowberry Twig & Leaf Cluster (256x256)
  const bushMap = makeCanvasTex(256, 256, (ctx, w, h) => {
    // Woody branching twigs
    ctx.strokeStyle = 'rgba(92, 78, 64, 1)';
    ctx.lineCap = 'round';
    const stems = [
      [128, 252, 128, 34, 6],
      [128, 195, 58, 72, 4.2],
      [128, 180, 198, 66, 4.2],
      [128, 130, 74, 48, 3.2],
      [128, 122, 182, 46, 3.2]
    ];
    for (const [x0, y0, x1, y1, lw] of stems) {
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) * 0.5, (y0 + y1) * 0.55 + 14, x1, y1);
      ctx.stroke();
    }

    // 32 overlapping silvery-sage & deep crowberry oval leaves
    for (let i = 0; i < 32; i++) {
      const lx = 44 + hash2i(i, 3, 141) * 168;
      const ly = 32 + hash2i(i, 7, 141) * 176;
      const ang = (hash2i(i, 11, 141) - 0.5) * 2.6;
      const len = 16 + hash2i(i, 13, 141) * 14;
      const wid = 8 + hash2i(i, 17, 141) * 6;
      const sage = hash2i(i, 19, 141);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(ang);
      const lg = ctx.createRadialGradient(-wid * 0.2, -len * 0.2, 2, 0, 0, len);
      if (sage > 0.42) {
        lg.addColorStop(0, 'rgba(225, 240, 224, 1)');
        lg.addColorStop(1, 'rgba(155, 182, 156, 0.98)');
      } else {
        lg.addColorStop(0, 'rgba(175, 208, 155, 1)');
        lg.addColorStop(1, 'rgba(112, 150, 102, 0.98)');
      }
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.ellipse(0, 0, wid, len, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(235, 245, 230, 0.45)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(0, len * 0.7);
      ctx.lineTo(0, -len * 0.7);
      ctx.stroke();
      ctx.restore();
    }
  });

  // 4. Arctic Cotton Grass Plume (128x128)
  const cottonMap = makeCanvasTex(128, 128, (ctx, w, h) => {
    const cx = 64;
    const cy = 62;
    for (let i = 0; i < 42; i++) {
      const a = (i / 42) * Math.PI * 2 + (hash2i(i, 3, 211) - 0.5) * 0.25;
      const len = 26 + hash2i(i, 5, 211) * 26;
      const ex = cx + Math.cos(a) * len;
      const ey = cy + Math.sin(a) * len * 0.85 - 6;
      ctx.strokeStyle = `rgba(255, 255, 252, ${0.65 + hash2i(i, 7, 211) * 0.35})`;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy + 8);
      ctx.quadraticCurveTo(cx + Math.cos(a) * len * 0.5, cy + Math.sin(a) * len * 0.35 - 10, ex, ey);
      ctx.stroke();
    }
    const coreG = ctx.createRadialGradient(cx, cy, 4, cx, cy, 28);
    coreG.addColorStop(0, 'rgba(255, 255, 255, 1)');
    coreG.addColorStop(0.7, 'rgba(242, 246, 240, 0.92)');
    coreG.addColorStop(1, 'rgba(225, 232, 224, 0)');
    ctx.fillStyle = coreG;
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fill();
    // Dark bract cup at base
    ctx.fillStyle = 'rgba(72, 60, 44, 1)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 20, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  return { lupinMap, grassMap, bushMap, cottonMap };
}

export function createTextureLibrary() {
  const moss = createMossTextures(512);
  const basaltCliff = createBasaltCliffTextures(512);
  const scree = createScreeTextures(512);
  const dirtPath = createDirtPathTextures(512);
  const waterNormalA = createWaterNormal(256, 1601);
  const waterNormalB = createWaterNormal(256, 1733);
  const mistPuff = createMistPuffTexture(512);
  const waterfallFoam = createWaterfallFoamTexture(512);
  const landmarks = createLandmarkTextures(256);
  const flora = createFloraTextures();

  return {
    moss,
    basaltCliff,
    scree,
    dirtPath,
    waterNormalA,
    waterNormalB,
    mistPuff,
    waterfallFoam,
    lupinMap: flora.lupinMap,
    grassMap: flora.grassMap,
    bushMap: flora.bushMap,
    cottonMap: flora.cottonMap,
    rustedIron: landmarks.rustedIron,
    outpostMetal: landmarks.outpostMetal,
    corrugatedIron: landmarks.corrugatedIron,
    weatheredWood: landmarks.weatheredWood,
    tarredWood: landmarks.tarredWood,
    dryStone: landmarks.dryStone
  };
}
