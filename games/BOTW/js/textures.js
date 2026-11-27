import * as THREE from 'three';
import { clamp, mix, mulberry32 } from './noise.js';

/** Integer periodic hash for 100% seamless tileable textures. */
function tileHash(ix, iy, period, seed) {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  let n = Math.imul(px, 374761393) ^ Math.imul(py, 668265263) ^ Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
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
    period *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

function tileRidged(u, v, basePeriod, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let period = basePeriod;
  for (let i = 0; i < octaves; i++) {
    const n = 1.0 - Math.abs(tileNoise(u, v, period, seed + i * 131) * 2.0 - 1.0);
    sum += amp * n * n;
    norm += amp;
    period *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

function tileWorley(u, v, cells, seed) {
  const x = u * cells;
  const y = v * cells;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  let f1 = 8;
  let f2 = 8;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const rx = tileHash(ix + dx, iy + dy, cells, seed);
      const ry = tileHash(ix + dx, iy + dy, cells, seed + 577);
      const d = Math.hypot(dx + rx - fx, dy + ry - fy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2, edge: f2 - f1 };
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function configureTexture(tex, { srgb = false, repeat = true, repeatX = 1, repeatY = 1, anisotropy = 16 } = {}) {
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/** Converts a seamless Float32Array heightfield [0..1] into a crisp tangent-space normalMap. */
function heightToNormalTexture(heights, size, strength = 2.4, repeatX = 1, repeatY = 1) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  const sample = (x, y) => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return heights[wy * size + wx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 3x3 Sobel kernel for clean anti-aliased tangent normals
      const tl = sample(x - 1, y - 1);
      const t  = sample(x,     y - 1);
      const tr = sample(x + 1, y - 1);
      const l  = sample(x - 1, y);
      const r  = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b  = sample(x,     y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);

      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * size + x) * 4;
      d[idx]     = Math.round((nx * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      d[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return configureTexture(new THREE.CanvasTexture(c), { srgb: false, repeat: true, repeatX, repeatY });
}

function roughnessToTexture(roughBuf, size, repeatX = 1, repeatY = 1) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(clamp(roughBuf[i], 0.04, 1.0) * 255);
    const idx = i * 4;
    d[idx] = d[idx + 1] = d[idx + 2] = v;
    d[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return configureTexture(new THREE.CanvasTexture(c), { srgb: false, repeat: true, repeatX, repeatY });
}

/**
 * Prevents dark/gray mipmap halos on alpha-tested botanical cards by bleeding
 * neighboring opaque leaf colors outward into fully transparent pixels.
 */
function bleedTransparentRGB(ctx, size, passes = 4) {
  const img = ctx.getImageData(0, 0, size, size);
  let src = new Uint8ClampedArray(img.data);
  let dst = new Uint8ClampedArray(img.data);

  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        if (src[idx + 3] > 20) continue;
        let r = 0, g = 0, b = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
            const nIdx = (ny * size + nx) * 4;
            if (src[nIdx + 3] > 20) {
              r += src[nIdx];
              g += src[nIdx + 1];
              b += src[nIdx + 2];
              cnt++;
            }
          }
        }
        if (cnt > 0) {
          dst[idx] = Math.round(r / cnt);
          dst[idx + 1] = Math.round(g / cnt);
          dst[idx + 2] = Math.round(b / cnt);
        }
      }
    }
    src.set(dst);
  }
  img.data.set(dst);
  ctx.putImageData(img, 0, 0);
}

export function createTextureLibrary() {
  const lib = {};

  // -------------------------------------------------------------------------
  // 1. LUSH MEADOW GRASS + LOAM MICRO-DETAIL (512x512 seamless PBR)
  // -------------------------------------------------------------------------
  {
    const size = 512;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const hBuf = new Float32Array(size * size);
    const rBuf = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const patch = tileFbm(u, v, 4, 4, 11);
        const tuft = tileFbm(u * 2.0 + patch * 0.12, v * 2.0, 16, 3, 23);
        const micro = tileNoise(u, v, 64, 37);
        const blade = tileNoise(u + tuft * 0.04, v * 2.2, 48, 49);

        const h = clamp(patch * 0.35 + tuft * 0.42 + blade * 0.23, 0, 1);
        hBuf[y * size + x] = h;
        rBuf[y * size + x] = mix(0.88, 0.62, blade * 0.6 + tuft * 0.4);

        // Rich olive-emerald meadow grass mottled with dark soil flecks
        const soilMix = smoothstepCompat(0.32, 0.16, tuft);
        let r = mix(72, 126, patch * 0.6 + blade * 0.4);
        let g = mix(96, 152, patch * 0.5 + tuft * 0.5);
        let b = mix(34, 58, patch * 0.7 + micro * 0.3);

        r = mix(r, 78, soilMix * 0.65);
        g = mix(g, 66, soilMix * 0.65);
        b = mix(b, 42, soilMix * 0.65);

        const idx = (y * size + x) * 4;
        img.data[idx] = clamp(Math.round(r * (0.86 + micro * 0.26)), 0, 255);
        img.data[idx + 1] = clamp(Math.round(g * (0.86 + micro * 0.26)), 0, 255);
        img.data[idx + 2] = clamp(Math.round(b * (0.86 + micro * 0.26)), 0, 255);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    lib.grass = {
      map: configureTexture(new THREE.CanvasTexture(c), { srgb: true }),
      normalMap: heightToNormalTexture(hBuf, size, 2.2),
      roughnessMap: roughnessToTexture(rBuf, size)
    };
  }

  // -------------------------------------------------------------------------
  // 2. OCHRE PACKED TRAIL DIRT + GRAVEL PEBBLES (512x512 seamless PBR)
  // -------------------------------------------------------------------------
  {
    const size = 512;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const hBuf = new Float32Array(size * size);
    const rBuf = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const base = tileFbm(u, v, 4, 4, 71);
        const grit = tileFbm(u, v, 24, 3, 89);
        const pebbles = tileWorley(u, v, 22, 103);
        const pebbleBump = clamp(1.0 - pebbles.f1 * 2.3, 0, 1);
        const micro = tileNoise(u, v, 64, 117);

        const h = clamp(base * 0.35 + grit * 0.35 + pebbleBump * 0.35, 0, 1);
        hBuf[y * size + x] = h;
        rBuf[y * size + x] = mix(0.92, 0.65, pebbleBump * 0.8);

        let r = mix(118, 166, base * 0.6 + grit * 0.4);
        let g = mix(94, 134, base * 0.6 + grit * 0.4);
        let b = mix(64, 92, base * 0.55 + grit * 0.45);

        // Scattered small trail stones
        if (pebbleBump > 0.35) {
          const stoneShade = 0.78 + pebbles.f2 * 0.32;
          r = mix(r, 148 * stoneShade, 0.55);
          g = mix(g, 142 * stoneShade, 0.55);
          b = mix(b, 132 * stoneShade, 0.55);
        }

        const idx = (y * size + x) * 4;
        img.data[idx] = clamp(Math.round(r * (0.9 + micro * 0.2)), 0, 255);
        img.data[idx + 1] = clamp(Math.round(g * (0.9 + micro * 0.2)), 0, 255);
        img.data[idx + 2] = clamp(Math.round(b * (0.9 + micro * 0.2)), 0, 255);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    lib.dirt = {
      map: configureTexture(new THREE.CanvasTexture(c), { srgb: true }),
      normalMap: heightToNormalTexture(hBuf, size, 2.8),
      roughnessMap: roughnessToTexture(rBuf, size)
    };
  }

  // -------------------------------------------------------------------------
  // 3. STRATIFIED GRANITE & SEDIMENTARY CLIFF ROCK (512x512 seamless PBR)
  // -------------------------------------------------------------------------
  {
    const size = 512;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const hBuf = new Float32Array(size * size);
    const rBuf = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const warpX = tileFbm(u, v, 4, 3, 201) * 0.14;
        const warpY = tileFbm(u + 0.3, v + 0.7, 4, 3, 207) * 0.10;
        const strata = tileFbm(u * 0.65 + warpX, v * 3.5 + warpY, 4, 5, 211);
        const ridge = tileRidged(u + warpX * 0.7, v + warpY * 0.7, 6, 4, 223);
        const microCrack = tileRidged(u * 1.6 + warpY, v * 1.1 + warpX, 8, 3, 239);
        const crevice = smoothstepCompat(0.78, 0.96, microCrack);
        const lichen = smoothstepCompat(0.68, 0.85, tileFbm(u, v, 8, 3, 251));
        const micro = tileNoise(u, v, 64, 263);

        const h = clamp(strata * 0.44 + ridge * 0.44 - crevice * 0.22 + micro * 0.12, 0, 1);
        hBuf[y * size + x] = h;
        rBuf[y * size + x] = mix(0.72, 0.94, crevice * 0.5 + strata * 0.5);

        // Warm ochre-gray granite strata + cool slate crevices
        let r = mix(72, 134, strata * 0.65 + ridge * 0.35);
        let g = mix(70, 126, strata * 0.65 + ridge * 0.35);
        let b = mix(74, 118, strata * 0.6 + ridge * 0.4);

        // Fine organic weathering cracks
        r = mix(r, 42, crevice * 0.58);
        g = mix(g, 42, crevice * 0.58);
        b = mix(b, 46, crevice * 0.58);

        // Subtle dry moss/lichen flecks
        r = mix(r, 94, lichen * 0.28);
        g = mix(g, 110, lichen * 0.32);
        b = mix(b, 64, lichen * 0.28);

        const idx = (y * size + x) * 4;
        img.data[idx] = clamp(Math.round(r * (0.9 + micro * 0.2)), 0, 255);
        img.data[idx + 1] = clamp(Math.round(g * (0.9 + micro * 0.2)), 0, 255);
        img.data[idx + 2] = clamp(Math.round(b * (0.9 + micro * 0.2)), 0, 255);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    lib.cliffRock = {
      map: configureTexture(new THREE.CanvasTexture(c), { srgb: true }),
      normalMap: heightToNormalTexture(hBuf, size, 3.2),
      roughnessMap: roughnessToTexture(rBuf, size)
    };
  }

  // -------------------------------------------------------------------------
  // 4. SHORELINE SAND & RIVER PEBBLES (512x512 seamless PBR)
  // -------------------------------------------------------------------------
  {
    const size = 512;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const hBuf = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const sand = tileFbm(u, v, 8, 4, 307);
        const w1 = tileWorley(u, v, 18, 313);
        const peb = smoothstepCompat(0.42, 0.14, w1.f1);
        const micro = tileNoise(u, v, 64, 331);
        hBuf[y * size + x] = clamp(sand * 0.4 + peb * 0.55 + micro * 0.08, 0, 1);

        let r = mix(158, 184, sand);
        let g = mix(142, 166, sand);
        let b = mix(106, 128, sand);
        if (peb > 0.1) {
          const tint = 0.72 + w1.f2 * 0.38;
          r = mix(r, 125 * tint, peb * 0.65);
          g = mix(g, 122 * tint, peb * 0.65);
          b = mix(b, 114 * tint, peb * 0.65);
        }
        const idx = (y * size + x) * 4;
        img.data[idx] = clamp(Math.round(r), 0, 255);
        img.data[idx + 1] = clamp(Math.round(g), 0, 255);
        img.data[idx + 2] = clamp(Math.round(b), 0, 255);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    lib.shore = {
      map: configureTexture(new THREE.CanvasTexture(c), { srgb: true }),
      normalMap: heightToNormalTexture(hBuf, size, 2.5)
    };
  }

  // -------------------------------------------------------------------------
  // 5. WEATHERED ANCIENT ASHLAR STONE MASONRY (512x512 seamless PBR)
  // -------------------------------------------------------------------------
  {
    const size = 512;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const hBuf = new Float32Array(size * size);
    const rBuf = new Float32Array(size * size);

    const rows = 6;
    const cols = 4;
    for (let y = 0; y < size; y++) {
      const v = y / size;
      const row = Math.floor(v * rows);
      const rowFrac = (v * rows) - row;
      const stagger = (row % 2) * 0.5;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const colCoord = u * cols + stagger;
        const col = Math.floor(colCoord);
        const colFrac = colCoord - col;

        const warp = tileFbm(u, v, 12, 2, 401) * 0.04;
        const mortarV = smoothstepCompat(0.055, 0.015, Math.min(rowFrac, 1.0 - rowFrac) + warp * 0.35);
        const mortarH = smoothstepCompat(0.045, 0.012, Math.min(colFrac, 1.0 - colFrac) + warp * 0.35);
        const mortar = Math.max(mortarV, mortarH);

        const blockVar = tileHash(col, row, cols * 2, 419);
        const grain = tileFbm(u, v, 8, 4, 431);
        const pits = tileRidged(u, v, 16, 3, 443);
        const moss = smoothstepCompat(0.62, 0.85, tileFbm(u, v, 6, 3, 457) + mortar * 0.35);

        const h = clamp((0.68 + grain * 0.22 - pits * 0.14) * (1.0 - mortar * 0.72), 0, 1);
        hBuf[y * size + x] = h;
        rBuf[y * size + x] = mix(0.76, 0.96, mortar * 0.6 + pits * 0.4);

        const shade = 0.82 + blockVar * 0.24;
        let r = mix(118, 152, grain) * shade;
        let g = mix(116, 146, grain) * shade;
        let b = mix(110, 138, grain) * shade;

        // Recessed dark mortar
        r = mix(r, 56, mortar * 0.75);
        g = mix(g, 58, mortar * 0.75);
        b = mix(b, 55, mortar * 0.75);

        // Aged moss stain in crevices
        r = mix(r, 76, moss * 0.52);
        g = mix(g, 98, moss * 0.55);
        b = mix(b, 52, moss * 0.52);

        const idx = (y * size + x) * 4;
        img.data[idx] = clamp(Math.round(r), 0, 255);
        img.data[idx + 1] = clamp(Math.round(g), 0, 255);
        img.data[idx + 2] = clamp(Math.round(b), 0, 255);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    lib.masonry = {
      map: configureTexture(new THREE.CanvasTexture(c), { srgb: true }),
      normalMap: heightToNormalTexture(hBuf, size, 3.1),
      roughnessMap: roughnessToTexture(rBuf, size)
    };
  }

  // -------------------------------------------------------------------------
  // 6. SHEIKAH ANCIENT CARVED STONE + GLOWING CYAN FILIGREE (512x512)
  // -------------------------------------------------------------------------
  {
    const size = 512;
    const colC = makeCanvas(size);
    const ctx = colC.getContext('2d');
    const emC = makeCanvas(size);
    const eCtx = emC.getContext('2d');
    const hBuf = new Float32Array(size * size);

    // Base dark carved bronze-slate stone
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const n = tileFbm(u, v, 8, 4, 503);
        hBuf[y * size + x] = 0.55 + n * 0.25;
        const idx = (y * size + x) * 4;
        img.data[idx] = Math.round(mix(52, 78, n));
        img.data[idx + 1] = Math.round(mix(54, 76, n));
        img.data[idx + 2] = Math.round(mix(62, 84, n));
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Draw intricate geometric concentric Sheikah panel lines & glowing cyan channels
    eCtx.fillStyle = '#000000';
    eCtx.fillRect(0, 0, size, size);

    const drawPattern = (targetCtx, strokeColor, lw, glow = false) => {
      targetCtx.strokeStyle = strokeColor;
      targetCtx.lineWidth = lw;
      if (glow) {
        targetCtx.shadowColor = '#28c4e8';
        targetCtx.shadowBlur = 5;
      }
      for (let row = 0; row < 4; row++) {
        const y0 = row * (size / 4);
        targetCtx.beginPath();
        targetCtx.moveTo(0, y0 + 8);
        targetCtx.lineTo(size, y0 + 8);
        targetCtx.stroke();
        for (let col = 0; col < 4; col++) {
          const cx = col * (size / 4) + size / 8;
          const cy = y0 + size / 8;
          targetCtx.strokeRect(cx - 52, cy - 52, 104, 104);
          if (!glow || (row + col) % 2 === 0) {
            targetCtx.beginPath();
            targetCtx.arc(cx, cy, 24, 0, Math.PI * 1.45);
            targetCtx.stroke();
          }
          if (!glow) {
            targetCtx.beginPath();
            targetCtx.arc(cx, cy, 40, 0.2, Math.PI * 1.8);
            targetCtx.stroke();
          }
        }
      }
      targetCtx.shadowBlur = 0;
    };

    drawPattern(ctx, '#736a5a', 3, false);
    drawPattern(eCtx, '#1ea8cc', 2, true);

    // Carve pattern brightness into height buffer for crisp normal relief
    const colData = ctx.getImageData(0, 0, size, size).data;
    const emData = eCtx.getImageData(0, 0, size, size).data;
    for (let i = 0; i < size * size; i++) {
      const glow = emData[i * 4 + 2] / 255;
      const bronze = colData[i * 4] / 255;
      hBuf[i] = clamp(hBuf[i] + bronze * 0.25 - glow * 0.32, 0, 1);
    }

    lib.sheikah = {
      map: configureTexture(new THREE.CanvasTexture(colC), { srgb: true }),
      normalMap: heightToNormalTexture(hBuf, size, 3.0),
      emissiveMap: configureTexture(new THREE.CanvasTexture(emC), { srgb: true })
    };
  }

  // -------------------------------------------------------------------------
  // 7. TREE BARK: DEEP FURROWED OAK & PALE SILVER BIRCH (512x512)
  // -------------------------------------------------------------------------
  {
    const size = 512;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const hBuf = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const warp = tileFbm(u, v, 4, 3, 601) * 0.06;
        const furrow = tileRidged(u * 3.5 + warp, v * 0.7, 6, 4, 613);
        const micro = tileNoise(u, v, 48, 631);
        hBuf[y * size + x] = clamp(furrow * 0.85 + micro * 0.15, 0, 1);
        const r = mix(46, 108, furrow);
        const g = mix(36, 86, furrow);
        const b = mix(28, 64, furrow);
        const idx = (y * size + x) * 4;
        img.data[idx] = Math.round(r * (0.9 + micro * 0.2));
        img.data[idx + 1] = Math.round(g * (0.9 + micro * 0.2));
        img.data[idx + 2] = Math.round(b * (0.9 + micro * 0.2));
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    lib.barkOak = {
      map: configureTexture(new THREE.CanvasTexture(c), { srgb: true, repeatX: 2, repeatY: 3 }),
      normalMap: heightToNormalTexture(hBuf, size, 3.4, 2, 3)
    };

    // Silver Birch Bark
    const bc = makeCanvas(size);
    const bctx = bc.getContext('2d');
    const bimg = bctx.createImageData(size, size);
    const bhBuf = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const grain = tileFbm(u * 0.8, v * 4.0, 6, 3, 653);
        const lenticel = tileFbm(u * 1.4, v * 12.0, 8, 2, 673);
        const darkMark = smoothstepCompat(0.68, 0.82, lenticel);
        bhBuf[y * size + x] = clamp(grain * 0.65 - darkMark * 0.45 + 0.2, 0, 1);
        let r = mix(188, 224, grain);
        let g = mix(184, 218, grain);
        let b = mix(174, 206, grain);
        r = mix(r, 56, darkMark * 0.85);
        g = mix(g, 52, darkMark * 0.85);
        b = mix(b, 48, darkMark * 0.85);
        const idx = (y * size + x) * 4;
        bimg.data[idx] = Math.round(r);
        bimg.data[idx + 1] = Math.round(g);
        bimg.data[idx + 2] = Math.round(b);
        bimg.data[idx + 3] = 255;
      }
    }
    bctx.putImageData(bimg, 0, 0);
    lib.barkBirch = {
      map: configureTexture(new THREE.CanvasTexture(bc), { srgb: true, repeatX: 1, repeatY: 3 }),
      normalMap: heightToNormalTexture(bhBuf, size, 2.4, 1, 3)
    };
  }

  // -------------------------------------------------------------------------
  // 8. VOLCANIC BASALT + GLOWING MAGMA VEINS (512x512 seamless PBR)
  // -------------------------------------------------------------------------
  {
    const size = 512;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const emC = makeCanvas(size);
    const ectx = emC.getContext('2d');
    const img = ctx.createImageData(size, size);
    const eimg = ectx.createImageData(size, size);
    const hBuf = new Float32Array(size * size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const warp = tileFbm(u, v, 4, 3, 701) * 0.08;
        const crag = tileRidged(u + warp, v + warp, 6, 4, 719);
        const cracks = tileWorley(u + warp * 0.8, v + warp * 0.8, 7, 733);
        const vein = smoothstepCompat(0.065, 0.008, cracks.edge) * smoothstepCompat(0.35, 0.72, tileFbm(u, v, 3, 2, 743));

        hBuf[y * size + x] = clamp(crag * 0.8 - vein * 0.4, 0, 1);

        const idx = (y * size + x) * 4;
        const shade = mix(48, 92, crag);
        img.data[idx] = Math.round(shade * 1.05);
        img.data[idx + 1] = Math.round(shade * 0.94);
        img.data[idx + 2] = Math.round(shade * 0.90);
        img.data[idx + 3] = 255;

        eimg.data[idx] = Math.round(255 * vein);
        eimg.data[idx + 1] = Math.round(92 * vein * vein);
        eimg.data[idx + 2] = Math.round(14 * vein);
        eimg.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ectx.putImageData(eimg, 0, 0);
    lib.volcanoRock = {
      map: configureTexture(new THREE.CanvasTexture(c), { srgb: true, repeatX: 12, repeatY: 8 }),
      normalMap: heightToNormalTexture(hBuf, size, 3.6, 12, 8),
      emissiveMap: configureTexture(new THREE.CanvasTexture(emC), { srgb: true, repeatX: 12, repeatY: 8 })
    };
  }

  // -------------------------------------------------------------------------
  // 9. ALPHA-CUTOUT BOTANICAL ATLASES (512x512 RGBA with alpha color-bleed)
  // -------------------------------------------------------------------------
  lib.leafOak = buildLeafSprayTexture('oak');
  lib.leafPine = buildPineBoughTexture();
  lib.leafBirch = buildLeafSprayTexture('birch');
  lib.fernCard = buildFernTexture();
  lib.shrubCard = buildShrubTexture();
  lib.flowerCard = buildWildflowerTexture();

  // -------------------------------------------------------------------------
  // 10. CHARACTER FABRIC, LEATHER & PARAGLIDER CLOTH
  // -------------------------------------------------------------------------
  {
    const size = 256;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const hBuf = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const weave = (Math.sin(x * 2.2) * 0.5 + 0.5) * 0.5 + (Math.sin(y * 2.2) * 0.5 + 0.5) * 0.5;
        const n = tileFbm(x / size, y / size, 12, 3, 811);
        hBuf[y * size + x] = weave * 0.35 + n * 0.65;
        const idx = (y * size + x) * 4;
        const f = 0.94 + weave * 0.04 + n * 0.12;
        img.data[idx] = clamp(Math.round(36 * f), 0, 255);
        img.data[idx + 1] = clamp(Math.round(126 * f), 0, 255);
        img.data[idx + 2] = clamp(Math.round(142 * f), 0, 255);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Subtle BotW gold embroidered trim band at bottom
    ctx.fillStyle = '#d9b561';
    ctx.fillRect(0, size - 22, size, 8);
    ctx.fillStyle = '#f2e8cc';
    ctx.fillRect(0, size - 12, size, 3);
    lib.tunicFabric = {
      map: configureTexture(new THREE.CanvasTexture(c), { srgb: true, repeatX: 2, repeatY: 1 }),
      normalMap: heightToNormalTexture(hBuf, size, 1.8, 2, 1)
    };
  }

  {
    const size = 256;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const hBuf = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cell = tileWorley(x / size, y / size, 24, 839);
        const crease = smoothstepCompat(0.14, 0.02, cell.edge);
        const n = tileFbm(x / size, y / size, 8, 3, 853);
        hBuf[y * size + x] = clamp(0.65 - crease * 0.35 + n * 0.18, 0, 1);
        const shade = (0.85 + n * 0.25) * (1.0 - crease * 0.28);
        const idx = (y * size + x) * 4;
        img.data[idx] = clamp(Math.round(108 * shade), 0, 255);
        img.data[idx + 1] = clamp(Math.round(70 * shade), 0, 255);
        img.data[idx + 2] = clamp(Math.round(44 * shade), 0, 255);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    lib.leather = {
      map: configureTexture(new THREE.CanvasTexture(c), { srgb: true }),
      normalMap: heightToNormalTexture(hBuf, size, 2.0)
    };
  }

  {
    const size = 512;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#efe5ca';
    ctx.fillRect(0, 0, size, size);
    const rng = mulberry32(991);
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(205,190,155,0.22)' : 'rgba(255,250,240,0.2)';
      ctx.fillRect(rng() * size, rng() * size, 3, 1);
    }
    // Stitched canvas wing ribs & warm amber Hylian crest emblem
    ctx.strokeStyle = 'rgba(130, 96, 58, 0.55)';
    ctx.lineWidth = 4;
    for (let k = 1; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(k * (size / 5), 0);
      ctx.lineTo(k * (size / 5), size);
      ctx.stroke();
    }
    ctx.strokeStyle = '#c49642';
    ctx.lineWidth = 7;
    ctx.strokeRect(10, 10, size - 20, size - 20);

    // Ornate golden crest wings on sail
    ctx.save();
    ctx.translate(size * 0.5, size * 0.5);
    ctx.fillStyle = 'rgba(190, 138, 48, 0.72)';
    ctx.beginPath();
    ctx.moveTo(0, -56);
    ctx.lineTo(42, 16);
    ctx.lineTo(-42, 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#9c6e26';
    ctx.lineWidth = 5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 22, -8);
      ctx.quadraticCurveTo(side * 120, -48, side * 165, -82);
      ctx.quadraticCurveTo(side * 125, -18, side * 52, 22);
      ctx.stroke();
    }
    ctx.restore();
    lib.paragliderCloth = configureTexture(new THREE.CanvasTexture(c), { srgb: true, repeat: false });
  }

  // -------------------------------------------------------------------------
  // 11. DUAL ISOTROPIC WATER RIPPLE NORMAL MAPS (256x256 seamless)
  // -------------------------------------------------------------------------
  {
    const size = 256;
    const hA = new Float32Array(size * size);
    const hB = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        // Multi-directional isotropic FBM wavelets (zero periodic stripe artifacts!)
        const w1 =
          tileFbm(u, v, 6, 4, 907) * 0.58 +
          tileFbm(u * 1.0 + 0.37, v * 1.0 + 0.19, 14, 3, 919) * 0.42;
        const w2 =
          tileFbm(u + 0.53, v + 0.71, 8, 4, 941) * 0.58 +
          tileFbm(u + 0.11, v + 0.83, 18, 3, 953) * 0.42;
        hA[y * size + x] = w1;
        hB[y * size + x] = w2;
      }
    }
    lib.waterNormalA = heightToNormalTexture(hA, size, 1.45);
    lib.waterNormalB = heightToNormalTexture(hB, size, 1.45);
  }

  // -------------------------------------------------------------------------
  // 12. REALISTIC TEXTURE-SIMPLIFIED GRASS CARD, PALM FROND & TREE IMPOSTORS
  // -------------------------------------------------------------------------
  lib.grassCard = buildGrassCardTexture();
  lib.leafPalm = buildPalmFrondTexture();
  lib.impostorOak = buildTreeImpostorTexture('oak');
  lib.impostorPine = buildTreeImpostorTexture('pine');
  lib.impostorBirch = buildTreeImpostorTexture('birch');
  lib.impostorPalm = buildTreeImpostorTexture('palm');

  // -------------------------------------------------------------------------
  // 13. MODERN GTA CITY PBR TEXTURES (TARMAC, SIDEWALK & 6 ARCHITECTURAL SETS)
  // -------------------------------------------------------------------------
  {
    const size = 512;

    // A) Photorealistic Fine Asphalt Tarmac (calibrated low-noise tarmac + specular wheel wear)
    const cAsph = makeCanvas(size);
    const ctxAsph = cAsph.getContext('2d');
    const imgAsph = ctxAsph.createImageData(size, size);
    const hAsph = new Float32Array(size * size);
    const rAsph = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const patch = tileFbm(u, v, 4, 3, 1201);
        const grit = tileNoise(u, v, 128, 1213);
        const micro = tileNoise(u, v, 256, 1229);
        const crack = smoothstepCompat(0.016, 0.003, tileWorley(u, v, 5, 1249).edge) * smoothstepCompat(0.56, 0.80, patch);
        const laneWear = Math.sin(u * Math.PI * 4.0) * 0.5 + 0.5;
        hAsph[y * size + x] = clamp(0.54 + grit * 0.14 + micro * 0.10 - crack * 0.25, 0, 1);
        rAsph[y * size + x] = mix(0.58, 0.84, grit * 0.5 + (1 - laneWear) * 0.35 + (1 - patch) * 0.15);
        const base = mix(46, 59, patch * 0.45 + grit * 0.35 + micro * 0.20) * (1 - crack * 0.42) * (0.93 + laneWear * 0.09);
        const idx = (y * size + x) * 4;
        imgAsph.data[idx] = clamp(Math.round(base * 0.99), 0, 255);
        imgAsph.data[idx + 1] = clamp(Math.round(base * 1.00), 0, 255);
        imgAsph.data[idx + 2] = clamp(Math.round(base * 1.05), 0, 255);
        imgAsph.data[idx + 3] = 255;
      }
    }
    ctxAsph.putImageData(imgAsph, 0, 0);
    lib.asphalt = {
      map: configureTexture(new THREE.CanvasTexture(cAsph), { srgb: true, anisotropy: 16 }),
      normalMap: heightToNormalTexture(hAsph, size, 0.85),
      roughnessMap: roughnessToTexture(rAsph, size)
    };

    // B) Architectural Precast Concrete Sidewalk Slabs (fine broom finish + subtle expansion joints)
    const cWalk = makeCanvas(size);
    const ctxWalk = cWalk.getContext('2d');
    const imgWalk = ctxWalk.createImageData(size, size);
    const hWalk = new Float32Array(size * size);
    const rWalk = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      const v = y / size;
      const fy = (v * 6) % 1;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const fx = (u * 6) % 1;
        const seamDist = Math.min(fx, 1 - fx, fy, 1 - fy);
        const seam = smoothstepCompat(0.022, 0.0, seamDist);
        const slabId = tileHash(Math.floor(u * 6), Math.floor(v * 6), 6, 1303);
        const grain = tileFbm(u, v, 10, 3, 1319) * 0.6 + tileNoise(u, v, 96, 1327) * 0.4;
        hWalk[y * size + x] = clamp(0.65 + grain * 0.16 - seam * 0.48, 0, 1);
        rWalk[y * size + x] = mix(0.76, 0.93, grain);
        const base = mix(142, 168, grain * 0.65 + slabId * 0.35) * (1 - seam * 0.32);
        const idx = (y * size + x) * 4;
        imgWalk.data[idx] = clamp(Math.round(base * 1.01), 0, 255);
        imgWalk.data[idx + 1] = clamp(Math.round(base * 1.00), 0, 255);
        imgWalk.data[idx + 2] = clamp(Math.round(base * 0.97), 0, 255);
        imgWalk.data[idx + 3] = 255;
      }
    }
    ctxWalk.putImageData(imgWalk, 0, 0);
    lib.sidewalk = {
      map: configureTexture(new THREE.CanvasTexture(cWalk), { srgb: true, anisotropy: 16 }),
      normalMap: heightToNormalTexture(hWalk, size, 1.1),
      roughnessMap: roughnessToTexture(rWalk, size)
    };

    // C) 6 Photorealistic Architectural Facade Sets (12m x 14.4m real-world tile = 4 floors x 10-12 bays)
    function buildArchitecturalFacade(style, seed) {
      const cMap = makeCanvas(size);
      const ctxM = cMap.getContext('2d');
      const cEm = makeCanvas(size);
      const ctxE = cEm.getContext('2d');
      const cRough = makeCanvas(size);
      const ctxR = cRough.getContext('2d');
      const hBuf = new Float32Array(size * size);
      const rng = mulberry32(seed);

      const cols = style === 'storefront' ? 4 : (style.startsWith('glass') ? 10 : 8);
      const rows = style === 'storefront' ? 1 : 4;
      const cellW = size / cols;
      const cellH = size / rows;

      // Wall base & roughness base
      let wallHex = '#a8a296';
      let wallRough = '#d8d8d8';
      if (style === 'glassBlue') {
        wallHex = '#2a3948';
        wallRough = '#686868';
      } else if (style === 'glassDark') {
        wallHex = '#1b2028';
        wallRough = '#585858';
      } else if (style === 'limestone') {
        wallHex = '#b7ab96';
        wallRough = '#dadada';
      } else if (style === 'brickUrban') {
        wallHex = '#6c3c31';
        wallRough = '#e2e2e2';
      } else if (style === 'concreteMod') {
        wallHex = '#969a9f';
        wallRough = '#d2d2d2';
      } else if (style === 'storefront') {
        wallHex = '#23272e';
        wallRough = '#9e9e9e';
      }

      ctxM.fillStyle = wallHex;
      ctxM.fillRect(0, 0, size, size);
      ctxE.fillStyle = '#000000';
      ctxE.fillRect(0, 0, size, size);
      ctxR.fillStyle = wallRough;
      ctxR.fillRect(0, 0, size, size);

      if (style === 'brickUrban') {
        const brickH = 6;
        const brickW = 16;
        for (let by = 0; by < size; by += brickH) {
          const offset = ((by / brickH) % 2) * (brickW * 0.5);
          for (let bx = -brickW; bx < size + brickW; bx += brickW) {
            const shade = 0.78 + rng() * 0.40;
            const redBias = rng() * 14;
            ctxM.fillStyle = `rgb(${Math.round((118 + redBias) * shade)}, ${Math.round(62 * shade)}, ${Math.round(48 * shade)})`;
            ctxM.fillRect(bx + offset + 1, by + 1, brickW - 1.5, brickH - 1.5);
          }
        }
      } else if (style === 'limestone' || style === 'concreteMod') {
        for (let py = 0; py < size; py += 32) {
          const vShade = style === 'limestone' ? (0.94 + rng() * 0.10) : (0.92 + rng() * 0.12);
          ctxM.fillStyle = style === 'limestone'
            ? `rgb(${Math.round(184 * vShade)}, ${Math.round(172 * vShade)}, ${Math.round(151 * vShade)})`
            : `rgb(${Math.round(148 * vShade)}, ${Math.round(152 * vShade)}, ${Math.round(157 * vShade)})`;
          ctxM.fillRect(0, py, size, 30);
          ctxM.fillStyle = 'rgba(0,0,0,0.14)';
          ctxM.fillRect(0, py + 30, size, 2);
        }
      }

      for (let r = 0; r < rows; r++) {
        // Slim horizontal spandrel floor beam matching facade cladding tone
        const floorY = r * cellH;
        const spandrelH = style === 'storefront' ? 52 : (style.startsWith('glass') ? Math.round(cellH * 0.15) : Math.round(cellH * 0.12));
        ctxM.fillStyle = style === 'storefront'
          ? '#1d2229'
          : (style === 'glassBlue' ? '#243547' : (style === 'glassDark' ? '#1f2631' : (style === 'limestone' ? '#a09480' : (style === 'brickUrban' ? '#5c362c' : '#7a7f86'))));
        ctxM.fillRect(0, floorY, size, spandrelH);
        if (style === 'storefront') {
          // Architectural granite piers + brushed aluminum fascia trim strip
          ctxM.fillStyle = '#292e36';
          ctxM.fillRect(0, spandrelH, size, size - spandrelH);
          for (let px = 0; px < cols; px++) {
            for (let s = 0; s < 35; s++) {
              ctxM.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)';
              ctxM.fillRect(px * cellW + rng() * 14, spandrelH + rng() * (size - spandrelH), 3, 2);
            }
          }
          ctxM.fillStyle = '#6b7480';
          ctxM.fillRect(0, spandrelH - 5, size, 4);
        }
        ctxR.fillStyle = style.startsWith('glass') ? '#6a6a6a' : '#c6c6c6';
        ctxR.fillRect(0, floorY, size, spandrelH);

        // Subtle vertical structural pilasters every 2 bays to break horizontal monotony
        if (!style.startsWith('storefront')) {
          ctxM.fillStyle = style === 'glassBlue'
            ? '#2a3d52'
            : (style === 'glassDark' ? '#242b36' : (style === 'limestone' ? '#b0a591' : '#585b62'));
          for (let c = 0; c < cols; c += 2) {
            ctxM.fillRect(c * cellW - 2, floorY, 4, cellH);
          }
        }

        for (let c = 0; c < cols; c++) {
          const padX = style === 'storefront' ? 9 : (style.startsWith('glass') ? 3.5 : 10);
          const topGap = spandrelH + (style === 'storefront' ? 14 : 4);
          const botGap = style === 'storefront' ? 32 : (style.startsWith('glass') ? 3 : 12);
          const wx = c * cellW + padX;
          const wy = floorY + topGap;
          const ww = cellW - padX * 2;
          const wh = cellH - topGap - botGap;

          // Anodized mullion frame
          ctxM.fillStyle = style === 'storefront' ? '#565e69' : (style.startsWith('glass') ? '#15202c' : '#2c3138');
          ctxM.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);

          // Glossy glass pane roughness (mirrors sky & sun!)
          ctxR.fillStyle = style === 'storefront' ? '#121212' : (style.startsWith('glass') ? '#161616' : '#2a2a2a');
          ctxR.fillRect(wx, wy, ww, wh);

          const isLit = style === 'storefront' ? (rng() < 0.78) : (rng() < 0.42);
          const officeTint = rng();

          // Subtle glass gradient with bright upper sky reflection & interior ceiling depth
          const gGrad = ctxM.createLinearGradient(wx, wy, wx, wy + wh);
          if (style === 'glassBlue') {
            gGrad.addColorStop(0, `rgb(${Math.round(88 + officeTint * 28)}, ${Math.round(138 + officeTint * 32)}, ${Math.round(178 + officeTint * 34)})`);
            gGrad.addColorStop(0.55, `rgb(${Math.round(48 + officeTint * 18)}, ${Math.round(84 + officeTint * 24)}, ${Math.round(118 + officeTint * 26)})`);
            gGrad.addColorStop(1, '#1e3246');
          } else if (style === 'glassDark') {
            gGrad.addColorStop(0, `rgb(${Math.round(66 + officeTint * 22)}, ${Math.round(78 + officeTint * 22)}, ${Math.round(92 + officeTint * 24)})`);
            gGrad.addColorStop(1, '#1a2028');
          } else if (style === 'storefront') {
            gGrad.addColorStop(0, '#1d2e3e');
            gGrad.addColorStop(0.55, '#152330');
            gGrad.addColorStop(1, '#101b26');
          } else {
            gGrad.addColorStop(0, isLit ? '#52687c' : '#2c3a48');
            gGrad.addColorStop(1, '#1b2632');
          }
          ctxM.fillStyle = gGrad;
          ctxM.fillRect(wx, wy, ww, wh);

          if (!style.startsWith('storefront')) {
            // Crisp upper sky sheen highlight across glass panes
            ctxM.fillStyle = style === 'glassBlue' ? 'rgba(155, 205, 245, 0.24)' : 'rgba(145, 170, 198, 0.16)';
            ctxM.fillRect(wx + 1, wy + 1, ww - 2, Math.max(3, Math.round(wh * 0.24)));
          }

          // Venetian blinds / interior office ceiling fixtures vs modern street-level display glass
          const blindFrac = 0.20 + rng() * 0.42;
          if (!style.startsWith('storefront')) {
            ctxM.fillStyle = 'rgba(205, 224, 240, 0.14)';
            ctxM.fillRect(wx, wy, ww, Math.round(wh * blindFrac));
          } else {
            // Interior ceiling dark soffit + subtle retail display silhouettes + diagonal glass sheen
            ctxM.fillStyle = 'rgba(10, 14, 20, 0.55)';
            ctxM.fillRect(wx + 6, wy + Math.round(wh * 0.58), ww - 12, Math.round(wh * 0.42));
            ctxM.fillStyle = 'rgba(155, 195, 230, 0.14)';
            ctxM.beginPath();
            ctxM.moveTo(wx + 2, wy + 2);
            ctxM.lineTo(wx + ww * 0.58, wy + 2);
            ctxM.lineTo(wx + ww * 0.18, wy + wh - 2);
            ctxM.lineTo(wx + 2, wy + wh - 2);
            ctxM.closePath();
            ctxM.fill();

            // Granite sidewalk bulkhead kickplate + horizontal transom mullion
            ctxM.fillStyle = '#252930';
            ctxM.fillRect(0, size - 32, size, 32);
            ctxM.fillStyle = '#5c6570';
            ctxM.fillRect(wx - 2, wy + wh * 0.24, ww + 4, 4);

            // Aluminum double-entry glass doors in bay 1
            if (c === 1) {
              const dx = wx + 6;
              const dw = ww - 12;
              const dy = wy + Math.round(wh * 0.25);
              const dh = wh - Math.round(wh * 0.25);
              ctxM.strokeStyle = '#8b95a2';
              ctxM.lineWidth = 3;
              ctxM.strokeRect(dx, dy, dw, dh);
              ctxM.fillStyle = '#7e8896';
              ctxM.fillRect(dx + dw * 0.5 - 2, dy, 4, dh);
              ctxM.fillStyle = '#b4bec8';
              ctxM.fillRect(dx + dw * 0.5 - 16, dy + dh * 0.52, 10, 4);
              ctxM.fillRect(dx + dw * 0.5 + 6, dy + dh * 0.52, 10, 4);
            }
          }

          if (style === 'brickUrban' || style === 'limestone') {
            ctxM.fillStyle = '#c4baa8';
            ctxM.fillRect(wx - 3, wy + wh, ww + 6, 4);
          }

          if (isLit) {
            const warm = rng();
            const er = Math.round(mix(255, 215, warm * 0.4));
            const eg = Math.round(mix(222, 185, warm));
            const eb = Math.round(mix(155, 118, warm));
            if (style === 'storefront') {
              // Subtle recessed ceiling strip + shop interior highlight for dusk/night
              ctxE.fillStyle = `rgb(${er}, ${eg}, ${eb})`;
              ctxE.fillRect(wx + 6, wy + 5, ww - 12, 10);
              const sGrad = ctxE.createLinearGradient(wx, wy, wx, wy + wh);
              sGrad.addColorStop(0, `rgba(${er}, ${eg}, ${eb}, 0.55)`);
              sGrad.addColorStop(1, `rgba(${Math.round(er * 0.4)}, ${Math.round(eg * 0.4)}, ${Math.round(eb * 0.4)}, 0.16)`);
              ctxE.fillStyle = sGrad;
              ctxE.fillRect(wx + 4, wy + 18, ww - 8, wh - 22);
            } else {
              const eGrad = ctxE.createLinearGradient(wx, wy, wx, wy + wh);
              eGrad.addColorStop(0, `rgb(${er}, ${eg}, ${eb})`);
              eGrad.addColorStop(0.55, `rgb(${Math.round(er * 0.72)}, ${Math.round(eg * 0.72)}, ${Math.round(eb * 0.72)})`);
              eGrad.addColorStop(1, `rgb(${Math.round(er * 0.35)}, ${Math.round(eg * 0.35)}, ${Math.round(eb * 0.35)})`);
              ctxE.fillStyle = eGrad;
              ctxE.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
            }
          }

          // Height buffer for crisp recessed window normals
          for (let py = Math.max(0, Math.floor(wy)); py < Math.min(size, Math.floor(wy + wh)); py++) {
            for (let px = Math.max(0, Math.floor(wx)); px < Math.min(size, Math.floor(wx + ww)); px++) {
              hBuf[py * size + px] = 0.16;
            }
          }
        }
      }

      for (let i = 0; i < size * size; i++) {
        if (hBuf[i] === 0) hBuf[i] = 0.80 + ((i * 13) % 7) * 0.012;
      }

      return {
        map: configureTexture(new THREE.CanvasTexture(cMap), { srgb: true, anisotropy: 16 }),
        normalMap: heightToNormalTexture(hBuf, size, 2.0),
        roughnessMap: configureTexture(new THREE.CanvasTexture(cRough), { srgb: false, anisotropy: 8 }),
        emissiveMap: configureTexture(new THREE.CanvasTexture(cEm), { srgb: true, anisotropy: 8 })
      };
    }

    lib.facadeGlassBlue = buildArchitecturalFacade('glassBlue', 8101);
    lib.facadeGlassDark = buildArchitecturalFacade('glassDark', 8147);
    lib.facadeLimestone = buildArchitecturalFacade('limestone', 8209);
    lib.facadeBrickUrban = buildArchitecturalFacade('brickUrban', 8273);
    lib.facadeConcreteMod = buildArchitecturalFacade('concreteMod', 8317);
    lib.facadeStorefront = buildArchitecturalFacade('storefront', 8389);

    // D) Babylon-Calibrated White-Base Urban Material Sets (tinted per-building by muted vertex color!)
    // 1. Travertine / Architectural Stone Stucco (fine ashlar joints + multi-scale weathering, near-white for vertex tinting)
    {
      const cTrav = makeCanvas(size);
      const ctxT = cTrav.getContext('2d');
      const imgT = ctxT.createImageData(size, size);
      const hTrav = new Float32Array(size * size);
      const rTrav = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        const v = y / size;
        const rowIdx = Math.floor(v * 16);
        const fy = (v * 16) % 1;
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const colIdx = Math.floor(u * 8 + (rowIdx % 2) * 0.5);
          const fx = (u * 8 + (rowIdx % 2) * 0.5) % 1;
          const blockTint = tileHash(colIdx, rowIdx, 8, 9103);
          const joint = smoothstepCompat(0.03, 0.0, Math.min(fx, 1 - fx, fy, 1 - fy));
          const fine = tileFbm(u, v, 14, 3, 9127) * 0.65 + tileNoise(u, v, 128, 9151) * 0.35;
          const streak = tileFbm(u * 2.4, v * 0.25, 6, 3, 9173);
          hTrav[y * size + x] = clamp(0.68 + fine * 0.16 - joint * 0.34, 0, 1);
          rTrav[y * size + x] = mix(0.84, 0.96, fine * 0.6 + joint * 0.4);
          const base = mix(204, 240, fine * 0.55 + blockTint * 0.30 - streak * 0.15) * (1 - joint * 0.14);
          const idx = (y * size + x) * 4;
          imgT.data[idx] = clamp(Math.round(base * 1.01), 0, 255);
          imgT.data[idx + 1] = clamp(Math.round(base * 0.99), 0, 255);
          imgT.data[idx + 2] = clamp(Math.round(base * 0.95), 0, 255);
          imgT.data[idx + 3] = 255;
        }
      }
      ctxT.putImageData(imgT, 0, 0);
      lib.cityTravertine = {
        map: configureTexture(new THREE.CanvasTexture(cTrav), { srgb: true, anisotropy: 16 }),
        normalMap: heightToNormalTexture(hTrav, size, 1.35),
        roughnessMap: roughnessToTexture(rTrav, size)
      };
    }

    // 2. Modern Architectural Concrete / Punched-Window Midrise Matrix (world-scale 4 floors x 8 bays)
    {
      const cMap = makeCanvas(size);
      const ctxM = cMap.getContext('2d');
      const cEm = makeCanvas(size);
      const ctxE = cEm.getContext('2d');
      const cRough = makeCanvas(size);
      const ctxR = cRough.getContext('2d');
      const hBuf = new Float32Array(size * size);
      const rng = mulberry32(9417);

      // Neutral pale plaster/concrete base so vertex tint drives travertine, slate, concrete & terracotta variation
      ctxM.fillStyle = '#dad6cf';
      ctxM.fillRect(0, 0, size, size);
      ctxE.fillStyle = '#000000';
      ctxE.fillRect(0, 0, size, size);
      ctxR.fillStyle = '#dfdfdf';
      ctxR.fillRect(0, 0, size, size);

      for (let py = 0; py < size; py += 32) {
        const band = 0.94 + rng() * 0.08;
        ctxM.fillStyle = `rgb(${Math.round(216 * band)}, ${Math.round(212 * band)}, ${Math.round(205 * band)})`;
        ctxM.fillRect(0, py, size, 30);
        ctxM.fillStyle = 'rgba(0,0,0,0.08)';
        ctxM.fillRect(0, py + 30, size, 2);
      }

      const cols = 8;
      const rows = 4;
      const cellW = size / cols;
      const cellH = size / rows;
      for (let r = 0; r < rows; r++) {
        const fy = r * cellH;
        // Subtle recessed floor spandrel course
        ctxM.fillStyle = 'rgba(30, 34, 40, 0.14)';
        ctxM.fillRect(0, fy, size, Math.round(cellH * 0.14));
        for (let c = 0; c < cols; c++) {
          const padX = 11;
          const topG = Math.round(cellH * 0.22);
          const botG = 14;
          const wx = c * cellW + padX;
          const wy = fy + topG;
          const ww = cellW - padX * 2;
          const wh = cellH - topG - botG;

          // Deep stone/metal window reveal shadow & bronze sill
          ctxM.fillStyle = '#3c4046';
          ctxM.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
          ctxM.fillStyle = '#bdb6ab';
          ctxM.fillRect(wx - 3, wy + wh + 1, ww + 6, 4);

          const tint = rng();
          const gGrad = ctxM.createLinearGradient(wx, wy, wx, wy + wh);
          gGrad.addColorStop(0, `rgb(${Math.round(52 + tint * 18)}, ${Math.round(64 + tint * 18)}, ${Math.round(76 + tint * 20)})`);
          gGrad.addColorStop(1, '#1c222a');
          ctxM.fillStyle = gGrad;
          ctxM.fillRect(wx, wy, ww, wh);
          ctxR.fillStyle = '#262626';
          ctxR.fillRect(wx, wy, ww, wh);

          if (rng() < 0.44) {
            const warm = rng();
            const er = Math.round(mix(255, 224, warm * 0.35));
            const eg = Math.round(mix(216, 178, warm));
            const eb = Math.round(mix(146, 108, warm));
            const eGrad = ctxE.createLinearGradient(wx, wy, wx, wy + wh);
            eGrad.addColorStop(0, `rgb(${er}, ${eg}, ${eb})`);
            eGrad.addColorStop(1, `rgb(${Math.round(er * 0.45)}, ${Math.round(eg * 0.45)}, ${Math.round(eb * 0.45)})`);
            ctxE.fillStyle = eGrad;
            ctxE.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
          }

          for (let py = Math.floor(wy); py < Math.floor(wy + wh); py++) {
            for (let px = Math.floor(wx); px < Math.floor(wx + ww); px++) {
              hBuf[py * size + px] = 0.14;
            }
          }
        }
      }
      for (let i = 0; i < size * size; i++) {
        if (hBuf[i] === 0) hBuf[i] = 0.82 + ((i * 17) % 7) * 0.01;
      }
      lib.cityConcrete = {
        map: configureTexture(new THREE.CanvasTexture(cMap), { srgb: true, anisotropy: 16 }),
        normalMap: heightToNormalTexture(hBuf, size, 2.1),
        roughnessMap: configureTexture(new THREE.CanvasTexture(cRough), { srgb: false, anisotropy: 8 }),
        emissiveMap: configureTexture(new THREE.CanvasTexture(cEm), { srgb: true, anisotropy: 8 })
      };
    }

    // 3. Modern Curtain-Wall Glazing (Babylon GLAZE-inspired per-pane subtle tilt & muted architectural tint)
    {
      const cMap = makeCanvas(size);
      const ctxM = cMap.getContext('2d');
      const cEm = makeCanvas(size);
      const ctxE = cEm.getContext('2d');
      const cRough = makeCanvas(size);
      const ctxR = cRough.getContext('2d');
      const nCanvas = makeCanvas(size);
      const ctxN = nCanvas.getContext('2d');
      const rng = mulberry32(9623);

      ctxM.fillStyle = '#242c34';
      ctxM.fillRect(0, 0, size, size);
      ctxE.fillStyle = '#000000';
      ctxE.fillRect(0, 0, size, size);
      ctxR.fillStyle = '#5c5c5c';
      ctxR.fillRect(0, 0, size, size);
      ctxN.fillStyle = 'rgb(128,128,255)';
      ctxN.fillRect(0, 0, size, size);

      const cols = 10;
      const rows = 4;
      const cellW = size / cols;
      const cellH = size / rows;
      for (let r = 0; r < rows; r++) {
        const fy = r * cellH;
        const spH = Math.round(cellH * 0.18);
        ctxM.fillStyle = '#343d47';
        ctxM.fillRect(0, fy, size, spH);
        ctxR.fillStyle = '#707070';
        ctxR.fillRect(0, fy, size, spH);
        for (let c = 0; c < cols; c++) {
          const wx = c * cellW + 3;
          const wy = fy + spH + 3;
          const ww = cellW - 6;
          const wh = cellH - spH - 5;

          const paneV = rng();
          const gGrad = ctxM.createLinearGradient(wx, wy, wx, wy + wh);
          gGrad.addColorStop(0, `rgb(${Math.round(92 + paneV * 24)}, ${Math.round(112 + paneV * 24)}, ${Math.round(130 + paneV * 24)})`);
          gGrad.addColorStop(1, '#263442');
          ctxM.fillStyle = gGrad;
          ctxM.fillRect(wx, wy, ww, wh);
          ctxR.fillStyle = `rgb(${Math.round(28 + rng() * 22)}, ${Math.round(28 + rng() * 22)}, ${Math.round(28 + rng() * 22)})`;
          ctxR.fillRect(wx, wy, ww, wh);

          // Per-pane subtle glass warpage normal (so skyscraper reflections shimmer realistically, never flat mirrors!)
          const nx = Math.round(128 + (rng() - 0.5) * 14);
          const ny = Math.round(128 + (rng() - 0.5) * 14);
          ctxN.fillStyle = `rgb(${nx}, ${ny}, 252)`;
          ctxN.fillRect(wx, wy, ww, wh);

          if (rng() < 0.45) {
            const warm = rng();
            ctxE.fillStyle = `rgb(${Math.round(240 + warm * 15)}, ${Math.round(196 + warm * 25)}, ${Math.round(132 + warm * 22)})`;
            ctxE.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
          }
        }
      }
      lib.cityCurtainGlass = {
        map: configureTexture(new THREE.CanvasTexture(cMap), { srgb: true, anisotropy: 16 }),
        normalMap: configureTexture(new THREE.CanvasTexture(nCanvas), { srgb: false, anisotropy: 8 }),
        roughnessMap: configureTexture(new THREE.CanvasTexture(cRough), { srgb: false, anisotropy: 8 }),
        emissiveMap: configureTexture(new THREE.CanvasTexture(cEm), { srgb: true, anisotropy: 8 })
      };
    }

    // 4. Weathered Gravel & Membrane Roof + Monumental Quay Ashlar Blocks
    {
      const cRoof = makeCanvas(size);
      const ctxR = cRoof.getContext('2d');
      const imgR = ctxR.createImageData(size, size);
      const hRoof = new Float32Array(size * size);
      const cQuay = makeCanvas(size);
      const ctxQ = cQuay.getContext('2d');
      const imgQ = ctxQ.createImageData(size, size);
      const hQuay = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        const v = y / size;
        const qRow = Math.floor(v * 6);
        const qfy = (v * 6) % 1;
        for (let x = 0; x < size; x++) {
          const u = x / size;
          const patch = tileFbm(u, v, 5, 3, 9803);
          const grit = tileNoise(u, v, 160, 9817);
          hRoof[y * size + x] = clamp(0.5 + grit * 0.28 + patch * 0.14, 0, 1);
          const rv = mix(118, 152, patch * 0.6 + grit * 0.4);
          const idx = (y * size + x) * 4;
          imgR.data[idx] = Math.round(rv * 1.02);
          imgR.data[idx + 1] = Math.round(rv * 0.99);
          imgR.data[idx + 2] = Math.round(rv * 0.94);
          imgR.data[idx + 3] = 255;

          const qCol = Math.floor(u * 4 + (qRow % 2) * 0.5);
          const qfx = (u * 4 + (qRow % 2) * 0.5) % 1;
          const qHash = tileHash(qCol, qRow, 4, 9839);
          const qJoint = smoothstepCompat(0.045, 0.0, Math.min(qfx, 1 - qfx, qfy, 1 - qfy));
          hQuay[y * size + x] = clamp(0.76 - qJoint * 0.55 + grit * 0.14, 0, 1);
          const qv = mix(144, 186, patch * 0.45 + qHash * 0.40 + grit * 0.15) * (1 - qJoint * 0.34);
          imgQ.data[idx] = Math.round(qv * 1.04);
          imgQ.data[idx + 1] = Math.round(qv * 0.99);
          imgQ.data[idx + 2] = Math.round(qv * 0.91);
          imgQ.data[idx + 3] = 255;
        }
      }
      ctxR.putImageData(imgR, 0, 0);
      ctxQ.putImageData(imgQ, 0, 0);
      lib.cityRoof = {
        map: configureTexture(new THREE.CanvasTexture(cRoof), { srgb: true, anisotropy: 8 }),
        normalMap: heightToNormalTexture(hRoof, size, 1.4)
      };
      lib.cityQuay = {
        map: configureTexture(new THREE.CanvasTexture(cQuay), { srgb: true, anisotropy: 16 }),
        normalMap: heightToNormalTexture(hQuay, size, 2.2)
      };
    }

    lib.cityStorefront = lib.facadeStorefront;

    // Backwards-compatible aliases
    lib.facadeGlass = lib.facadeGlassBlue;
    lib.facadeBrick = lib.facadeBrickUrban;
    lib.facadeConcrete = lib.facadeConcreteMod;
  }

  return lib;
}

/** Creates a vibrant GTA-style commercial billboard CanvasTexture. */
export function createBillboardTexture(title, subtitle, accentHex, bgHex, stripeHex = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 512, 256);
  grad.addColorStop(0, bgHex);
  grad.addColorStop(1, '#10141c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Diagonal dynamic GTA graphic slash
  ctx.fillStyle = stripeHex;
  ctx.globalAlpha = 0.14;
  ctx.beginPath();
  ctx.moveTo(310, 0);
  ctx.lineTo(512, 0);
  ctx.lineTo(512, 256);
  ctx.lineTo(210, 256);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1.0;

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 492, 236);

  ctx.fillStyle = accentHex;
  ctx.font = '900 54px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, 102);

  ctx.fillStyle = '#f4f6f8';
  ctx.font = '700 28px Inter, sans-serif';
  ctx.fillText(subtitle, 256, 174);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Creates an interstate green highway overhead gantry sign CanvasTexture. */
export function createHighwaySignTexture(lines, arrowDir = 'down') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#0d5a34';
  ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.strokeRect(10, 10, 492, 172);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 36px Inter, sans-serif';
  if (lines.length === 1) {
    ctx.fillText(lines[0], 256, 82);
  } else {
    ctx.fillText(lines[0], 256, 58);
    ctx.font = '600 26px Inter, sans-serif';
    ctx.fillText(lines[1], 256, 106);
  }

  ctx.fillStyle = '#ffe066';
  ctx.font = '900 34px Inter, sans-serif';
  const arrow = arrowDir === 'left' ? '←  EXIT' : arrowDir === 'right' ? 'EXIT  →' : '↓   THRU LANES   ↓';
  ctx.fillText(arrow, 256, 152);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function smoothstepCompat(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function buildLeafSprayTexture(species) {
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const rng = mulberry32(species === 'birch' ? 4021 : 3011);

  // Woody central twigs
  ctx.strokeStyle = species === 'birch' ? '#7a7265' : '#4f3b2a';
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.96);
  ctx.quadraticCurveTo(size * 0.48, size * 0.6, size * 0.52, size * 0.18);
  ctx.stroke();

  const branches = [
    [0.5, 0.78, 0.22, 0.54],
    [0.5, 0.74, 0.78, 0.50],
    [0.5, 0.55, 0.18, 0.30],
    [0.51, 0.52, 0.82, 0.28],
    [0.51, 0.35, 0.32, 0.14],
    [0.51, 0.34, 0.70, 0.13]
  ];
  ctx.lineWidth = 4;
  branches.forEach(([x0, y0, x1, y1]) => {
    ctx.beginPath();
    ctx.moveTo(x0 * size, y0 * size);
    ctx.lineTo(x1 * size, y1 * size);
    ctx.stroke();
  });

  // Layer 72 leaves (inner darker shaded leaves first, sunlit outer leaves on top)
  const count = species === 'birch' ? 84 : 72;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const rad = Math.pow(rng(), 0.55) * size * 0.38;
    const ang = rng() * Math.PI * 2;
    const lx = size * 0.5 + Math.cos(ang) * rad;
    const ly = size * 0.48 + Math.sin(ang) * rad * 0.92;
    const rot = ang + (rng() - 0.5) * 0.9;

    const len = species === 'birch' ? (24 + rng() * 18) : (34 + rng() * 24);
    const wid = species === 'birch' ? len * 0.68 : len * 0.54;

    // Subtle tonal depth: inner leaves darker cool-green, outer sunlit olive-chartreuse
    const shade = 0.62 + t * 0.45 + (rng() - 0.5) * 0.14;
    const r = clamp(Math.round((species === 'birch' ? 148 : 112) * shade), 35, 235);
    const g = clamp(Math.round((species === 'birch' ? 174 : 156) * shade), 55, 240);
    const b = clamp(Math.round((species === 'birch' ? 66 : 58) * shade), 20, 140);

    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(rot);

    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.moveTo(0, -len * 0.55);
    ctx.bezierCurveTo(wid * 0.95, -len * 0.2, wid * 0.75, len * 0.38, 0, len * 0.55);
    ctx.bezierCurveTo(-wid * 0.75, len * 0.38, -wid * 0.95, -len * 0.2, 0, -len * 0.55);
    ctx.fill();

    // Leaf midrib highlight
    ctx.strokeStyle = `rgba(${Math.min(255, r + 35)}, ${Math.min(255, g + 35)}, ${Math.min(255, b + 20)}, 0.45)`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -len * 0.42);
    ctx.lineTo(0, len * 0.45);
    ctx.stroke();

    ctx.restore();
  }

  bleedTransparentRGB(ctx, size, 5);
  return configureTexture(new THREE.CanvasTexture(c), { srgb: true, repeat: false });
}

function buildPineBoughTexture() {
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rng = mulberry32(5099);

  // Radiating woody bough skeleton
  ctx.strokeStyle = '#4a3524';
  ctx.lineCap = 'round';
  const boughs = 9;
  for (let b = 0; b < boughs; b++) {
    const ang = -Math.PI * 0.5 + (b - 4) * 0.27;
    const len = size * (0.40 + (1 - Math.abs(b - 4) * 0.16) * 0.18);
    ctx.lineWidth = 7.5;
    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.90);
    ctx.lineTo(size * 0.5 + Math.cos(ang) * len, size * 0.90 + Math.sin(ang) * len);
    ctx.stroke();
  }

  // Dense inner evergreen body tufts (ensures solid mipmap silhouette at 150-350m)
  for (let i = 0; i < 185; i++) {
    const t = i / 185;
    const bIdx = Math.floor(rng() * boughs);
    const bAng = -Math.PI * 0.5 + (bIdx - 4) * 0.27;
    const maxLen = size * (0.42 + (1 - Math.abs(bIdx - 4) * 0.15) * 0.18);
    const dist = (0.14 + rng() * 0.84) * maxLen;
    const ox = size * 0.5 + Math.cos(bAng) * dist + (rng() - 0.5) * 26;
    const oy = size * 0.90 + Math.sin(bAng) * dist + (rng() - 0.5) * 24;
    const shade = 0.52 + t * 0.42 + (rng() - 0.5) * 0.14;
    const r = clamp(Math.round(44 * shade), 16, 120);
    const g = clamp(Math.round(86 * shade), 34, 165);
    const b = clamp(Math.round(40 * shade), 16, 100);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.ellipse(ox, oy, 16 + rng() * 14, 7 + rng() * 7, bAng + (rng() - 0.5) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Thick feathery layered pine needle clusters over top
  ctx.lineCap = 'round';
  for (let i = 0; i < 820; i++) {
    const t = i / 820;
    const bIdx = Math.floor(rng() * boughs);
    const bAng = -Math.PI * 0.5 + (bIdx - 4) * 0.27;
    const maxLen = size * (0.44 + (1 - Math.abs(bIdx - 4) * 0.14) * 0.20);
    const dist = (0.14 + rng() * 0.88) * maxLen;
    const ox = size * 0.5 + Math.cos(bAng) * dist + (rng() - 0.5) * 24;
    const oy = size * 0.90 + Math.sin(bAng) * dist + (rng() - 0.5) * 24;
    const nAng = bAng + (rng() - 0.5) * 1.45;
    const nLen = 22 + rng() * 20;

    const shade = 0.60 + t * 0.52 + (rng() - 0.5) * 0.14;
    const r = clamp(Math.round(52 * shade), 20, 145);
    const g = clamp(Math.round(98 * shade), 42, 195);
    const b = clamp(Math.round(46 * shade), 20, 125);

    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(nAng) * nLen, oy + Math.sin(nAng) * nLen);
    ctx.stroke();
  }

  bleedTransparentRGB(ctx, size, 5);
  return configureTexture(new THREE.CanvasTexture(c), { srgb: true, repeat: false });
}

function buildFernTexture() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  // Delicate curved fern rachis stem
  ctx.strokeStyle = '#4e7828';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.96);
  ctx.quadraticCurveTo(size * 0.54, size * 0.52, size * 0.48, size * 0.06);
  ctx.stroke();

  const pairs = 22;
  for (let i = 1; i < pairs; i++) {
    const t = i / pairs;
    const stemX = size * (0.5 + Math.sin(t * Math.PI) * 0.025 - t * 0.02);
    const y = size * (0.93 - t * 0.84);
    const span = size * 0.34 * Math.sin(Math.pow(1 - t, 0.72) * Math.PI * 0.88);
    const shade = 0.72 + t * 0.42;

    for (const side of [-1, 1]) {
      // Split each pinna into fine serrated sub-leaflets for crisp realistic silhouette
      const subCount = Math.max(2, Math.round(6 * (1 - t * 0.65)));
      ctx.strokeStyle = `rgb(${Math.round(78 * shade)}, ${Math.round(118 * shade)}, ${Math.round(34 * shade)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(stemX, y);
      ctx.lineTo(stemX + side * span, y - 5);
      ctx.stroke();

      ctx.fillStyle = `rgb(${Math.round(98 * shade)}, ${Math.round(146 * shade)}, ${Math.round(44 * shade)})`;
      for (let k = 0; k < subCount; k++) {
        const sf = (k + 0.5) / subCount;
        const px = stemX + side * span * sf;
        const py = y - 5 * sf;
        const lw = (span / subCount) * 0.52;
        const lh = 5.5 * (1 - sf * 0.45);
        ctx.beginPath();
        ctx.ellipse(px, py, lw, lh, side * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  bleedTransparentRGB(ctx, size, 4);
  return configureTexture(new THREE.CanvasTexture(c), { srgb: true, repeat: false });
}

function buildShrubTexture() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rng = mulberry32(6101);

  ctx.strokeStyle = '#4e3c28';
  ctx.lineWidth = 3;
  for (let b = 0; b < 5; b++) {
    const bx = size * (0.28 + b * 0.11);
    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.96);
    ctx.quadraticCurveTo(size * 0.5, size * 0.7, bx, size * (0.28 + (b % 2) * 0.15));
    ctx.stroke();
  }

  for (let i = 0; i < 82; i++) {
    const t = i / 82;
    const ang = -Math.PI * 0.94 + rng() * Math.PI * 0.88;
    const dist = (0.18 + Math.pow(rng(), 0.75) * 0.76) * size * 0.42;
    const x = size * 0.5 + Math.cos(ang) * dist;
    const y = size * 0.86 + Math.sin(ang) * dist * 0.9;
    const len = 13 + rng() * 11;
    const wid = len * 0.48;
    const shade = 0.62 + t * 0.48;
    ctx.fillStyle = `rgb(${Math.round(94 * shade)}, ${Math.round(134 * shade)}, ${Math.round(44 * shade)})`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + (rng() - 0.5) * 0.8);
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.bezierCurveTo(wid, -len * 0.4, wid * 0.8, len * 0.3, 0, len);
    ctx.bezierCurveTo(-wid * 0.8, len * 0.3, -wid, -len * 0.4, 0, -len);
    ctx.fill();
    ctx.restore();
  }
  bleedTransparentRGB(ctx, size, 4);
  return configureTexture(new THREE.CanvasTexture(c), { srgb: true, repeat: false });
}

function buildWildflowerTexture() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rng = mulberry32(7321);

  const blossoms = [
    { petal: '#f6d860', center: '#b87624' }, // golden buttercup
    { petal: '#f8f5e8', center: '#e0b040' }, // highland daisy
    { petal: '#82d8ff', center: '#e8faff' }, // Silent Princess pale-blue bloom
    { petal: '#c4a6e8', center: '#f2e088' }  // wild heather
  ];

  for (let s = 0; s < 7; s++) {
    const bx = size * (0.22 + (s / 6) * 0.56) + (rng() - 0.5) * 18;
    const topY = size * (0.18 + rng() * 0.25);

    // Stem & tiny basal leaves
    ctx.strokeStyle = '#5c8432';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(size * 0.5 + (s - 3) * 8, size * 0.96);
    ctx.quadraticCurveTo(bx * 0.6 + size * 0.2, size * 0.65, bx, topY);
    ctx.stroke();

    const b = blossoms[s % blossoms.length];
    const petals = 5;
    for (let p = 0; p < petals; p++) {
      const a = (p / petals) * Math.PI * 2 + rng() * 0.4;
      ctx.fillStyle = b.petal;
      ctx.beginPath();
      ctx.ellipse(bx + Math.cos(a) * 10, topY + Math.sin(a) * 10, 8, 5, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = b.center;
    ctx.beginPath();
    ctx.arc(bx, topY, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  bleedTransparentRGB(ctx, size, 4);
  return configureTexture(new THREE.CanvasTexture(c), { srgb: true, repeat: false });
}

/** Alpha-cutout dense grass clump card (46 curved arched blades + seed stalks) for ultra-fast textured grass. */
function buildGrassCardTexture() {
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rng = mulberry32(9103);

  const bladeCount = 46;
  for (let i = 0; i < bladeCount; i++) {
    const tLayer = i / bladeCount;
    const baseX = size * (0.08 + rng() * 0.84);
    const lean = (rng() - 0.5) * size * 0.36;
    const height = size * (0.50 + rng() * 0.44);
    const tipY = size - height;
    const tipX = clamp(baseX + lean, size * 0.04, size * 0.96);
    const baseW = 7 + rng() * 6;
    const ctrlX = (baseX + tipX) * 0.5 + lean * 0.15;
    const ctrlY = size - height * 0.52;

    const grad = ctx.createLinearGradient(baseX, size, tipX, tipY);
    const shade = 0.65 + tLayer * 0.48 + (rng() - 0.5) * 0.14;
    const r0 = clamp(Math.round(28 * shade), 12, 80);
    const g0 = clamp(Math.round(48 * shade), 20, 110);
    const b0 = clamp(Math.round(14 * shade), 6, 45);
    const r1 = clamp(Math.round(86 * shade), 38, 175);
    const g1 = clamp(Math.round(138 * shade), 65, 220);
    const b1 = clamp(Math.round(36 * shade), 16, 85);
    const isGold = rng() < 0.18;
    const r2 = clamp(Math.round((isGold ? 172 : 128) * shade), 75, 240);
    const g2 = clamp(Math.round((isGold ? 168 : 176) * shade), 95, 245);
    const b2 = clamp(Math.round((isGold ? 58 : 48) * shade), 22, 110);

    grad.addColorStop(0.0, `rgb(${r0},${g0},${b0})`);
    grad.addColorStop(0.45, `rgb(${r1},${g1},${b1})`);
    grad.addColorStop(1.0, `rgb(${r2},${g2},${b2})`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(baseX - baseW, size);
    ctx.quadraticCurveTo(ctrlX - baseW * 0.4, ctrlY, tipX, tipY);
    ctx.quadraticCurveTo(ctrlX + baseW * 0.4, ctrlY, baseX + baseW, size);
    ctx.closePath();
    ctx.fill();

    // Subtle central blade vein highlight
    ctx.strokeStyle = `rgba(${Math.min(255, r2 + 25)}, ${Math.min(255, g2 + 25)}, ${b2}, 0.32)`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(baseX, size * 0.96);
    ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY + 6);
    ctx.stroke();

    // Occasional wild oat seed head atop slender golden stalks
    if (isGold && rng() < 0.65) {
      ctx.fillStyle = '#c8aa48';
      for (let s = 0; s < 4; s++) {
        ctx.beginPath();
        ctx.ellipse(tipX + (s % 2 === 0 ? -4 : 4), tipY + s * 7, 4.5, 2.5, (s % 2 === 0 ? -0.5 : 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  bleedTransparentRGB(ctx, size, 5);
  return configureTexture(new THREE.CanvasTexture(c), { srgb: true, repeat: false });
}

/** Alpha-cutout feathered palm frond card for waterfront boulevards. */
function buildPalmFrondTexture() {
  const size = 512;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rng = mulberry32(9217);

  ctx.strokeStyle = '#6f7c34';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.96);
  ctx.quadraticCurveTo(size * 0.51, size * 0.48, size * 0.5, size * 0.06);
  ctx.stroke();

  const pairs = 28;
  for (let i = 1; i < pairs; i++) {
    const t = i / pairs;
    const y = size * (0.93 - t * 0.84);
    const len = size * 0.42 * Math.sin(Math.pow(1.0 - t * 0.72, 0.8) * Math.PI * 0.85);
    const shade = 0.72 + t * 0.36 + (rng() - 0.5) * 0.1;

    for (const side of [-1, 1]) {
      const tipX = size * 0.5 + side * len;
      const tipY = y - len * 0.24 + (t > 0.6 ? -10 : 12);
      ctx.fillStyle = `rgb(${clamp(Math.round(78 * shade), 30, 160)}, ${clamp(Math.round(132 * shade), 55, 210)}, ${clamp(Math.round(44 * shade), 20, 100)})`;
      ctx.beginPath();
      ctx.moveTo(size * 0.5, y + 3);
      ctx.quadraticCurveTo(size * 0.5 + side * len * 0.55, y - 14, tipX, tipY);
      ctx.quadraticCurveTo(size * 0.5 + side * len * 0.50, y + 8, size * 0.5, y - 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  bleedTransparentRGB(ctx, size, 5);
  return configureTexture(new THREE.CanvasTexture(c), { srgb: true, repeat: false });
}

/** Pre-baked 256x256 tree impostor billboard sprite for ultra-fast LOD2 distant forests. */
function buildTreeImpostorTexture(species) {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rng = mulberry32(species === 'pine' ? 9301 : species === 'birch' ? 9311 : species === 'palm' ? 9319 : 9323);

  // Trunk & asymmetric scaffold branches tucked into fuller natural crown (never thin lollipop sticks!)
  ctx.strokeStyle = species === 'birch' ? '#d4cec2' : species === 'palm' ? '#7a634b' : '#463222';
  ctx.lineWidth = species === 'pine' ? 12 : species === 'palm' ? 10 : 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.98);
  ctx.quadraticCurveTo(size * (species === 'palm' ? 0.54 : 0.49), size * 0.78, size * 0.5, species === 'pine' ? size * 0.22 : (species === 'palm' ? size * 0.34 : size * 0.60));
  ctx.stroke();

  if (species === 'palm') {
    for (let f = 0; f < 9; f++) {
      const ang = -Math.PI + (f / 8) * Math.PI;
      const tipX = size * 0.5 + Math.cos(ang) * 92;
      const tipY = size * 0.34 + Math.sin(ang) * 56 + 26;
      ctx.strokeStyle = f % 2 === 0 ? '#4d7c2e' : '#65953c';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(size * 0.5, size * 0.32);
      ctx.quadraticCurveTo(size * 0.5 + Math.cos(ang) * 48, size * 0.18, tipX, tipY);
      ctx.stroke();
    }
  } else if (species === 'pine') {
    for (let tier = 0; tier < 8; tier++) {
      const tf = tier / 7;
      const y = size * (0.86 - tf * 0.72);
      const halfW = size * (0.42 - tf * 0.31);
      const col = `rgb(${Math.round(46 + tf * 26)}, ${Math.round(86 + tf * 36)}, ${Math.round(38 + tf * 18)})`;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(size * (0.48 + rng() * 0.04), y - 34);
      ctx.lineTo(size * 0.5 + halfW, y + 12 + rng() * 6);
      ctx.lineTo(size * 0.5 - halfW * (0.9 + rng() * 0.2), y + 10 + rng() * 6);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Broad organic canopy spanning 0.18..0.78 height with wide layered sunlit boughs
    ctx.strokeStyle = species === 'birch' ? '#c2bbb0' : '#4a3524';
    ctx.lineWidth = 6;
    [[-42, 4], [40, -2], [-28, -32], [30, -38]].forEach(([bx, by]) => {
      ctx.beginPath();
      ctx.moveTo(size * 0.5, size * 0.66);
      ctx.lineTo(size * 0.5 + bx, size * 0.50 + by);
      ctx.stroke();
    });

    const clusters = [
      { ox: -0.22, oy: 0.04, rx: 0.24, ry: 0.18, bias: 0.74 },
      { ox: 0.22, oy: 0.02, rx: 0.23, ry: 0.18, bias: 0.78 },
      { ox: -0.09, oy: -0.18, rx: 0.26, ry: 0.20, bias: 0.96 },
      { ox: 0.14, oy: -0.20, rx: 0.22, ry: 0.18, bias: 1.06 },
      { ox: 0.0, oy: 0.12, rx: 0.25, ry: 0.14, bias: 0.68 }
    ];
    const baseR = species === 'birch' ? 118 : 82;
    const baseG = species === 'birch' ? 152 : 132;
    const baseB = species === 'birch' ? 54 : 46;
    for (let i = 0; i < 120; i++) {
      const t = i / 120;
      const cl = clusters[i % clusters.length];
      const ang = rng() * Math.PI * 2;
      const rad = Math.pow(rng(), 0.58) * size;
      const cx = size * (0.5 + cl.ox) + Math.cos(ang) * rad * cl.rx;
      const cy = clamp(size * (0.50 + cl.oy) + Math.sin(ang) * rad * cl.ry, size * 0.14, size * 0.80);
      const r = 11 + rng() * 15;
      // Underside darker shadow vs sunlit upper crown
      const vertLit = clamp(1.22 - (cy / size) * 0.85, 0.54, 1.26);
      const shade = (0.54 + t * 0.46) * cl.bias * vertLit;
      ctx.fillStyle = `rgb(${clamp(Math.round(baseR * shade), 22, 225)}, ${clamp(Math.round(baseG * shade), 38, 235)}, ${clamp(Math.round(baseB * shade), 16, 130)})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * (0.9 + rng() * 0.45), r * (0.76 + rng() * 0.40), rng() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  bleedTransparentRGB(ctx, size, 4);
  return configureTexture(new THREE.CanvasTexture(c), { srgb: true, repeat: false });
}
