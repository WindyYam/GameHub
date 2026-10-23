// ============================================================================
// HAUNTED HOUSE — PBR TEXTURES, TANGENT-SPACE NORMAL MAPS & SHADERS
// ============================================================================
(() => {
  'use strict';
  const { clamp, lerp, smooth, rand, rr, hash, fbm, maxAniso } = window.HH;

  const cl255 = v => clamp(v | 0, 0, 255);
  const rgb = (r, g, b) => `rgb(${cl255(r)},${cl255(g)},${cl255(b)})`;

  function canvasTex(w, h, paint, { srgb = true, repeat = [1, 1], clampEdge = false } = {}) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    paint(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = clampEdge ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.repeat.set(repeat[0], repeat[1]);
    return t;
  }

  function pixelFill(g, w, h, fn) {
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const c = fn(x / w, y / h, x, y, d[o], d[o + 1], d[o + 2], d[o + 3]);
        d[o] = cl255(c[0]);
        d[o + 1] = cl255(c[1]);
        d[o + 2] = cl255(c[2]);
        if (c.length > 3) d[o + 3] = cl255(c[3]);
      }
    }
    g.putImageData(img, 0, 0);
  }

  // Sobel Height-to-Tangent-Space Normal Map Generator
  function makeNormalTex(w, h, heightFn, strength = 3.0, repeat = [1, 1]) {
    const heights = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        heights[y * w + x] = heightFn(x / w, y / h);
      }
    }
    return canvasTex(w, h, g => {
      const img = g.createImageData(w, h);
      const d = img.data;
      const sample = (x, y) => {
        const wx = ((x % w) + w) % w;
        const wy = ((y % h) + h) % h;
        return heights[wy * w + wx];
      };
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const tl = sample(x - 1, y - 1), t = sample(x, y - 1), tr = sample(x + 1, y - 1);
          const l  = sample(x - 1, y),                           r  = sample(x + 1, y);
          const bl = sample(x - 1, y + 1), b = sample(x, y + 1), br = sample(x + 1, y + 1);
          const dX = (tr + 2 * r + br) - (tl + 2 * l + bl);
          const dY = (bl + 2 * b + br) - (tl + 2 * t + tr);
          let nx = -dX * strength;
          let ny = dY * strength;
          let nz = 1.0;
          const invLen = 1.0 / Math.hypot(nx, ny, nz);
          nx *= invLen; ny *= invLen; nz *= invLen;
          const o = (y * w + x) * 4;
          d[o]     = cl255((nx * 0.5 + 0.5) * 255);
          d[o + 1] = cl255((ny * 0.5 + 0.5) * 255);
          d[o + 2] = cl255((nz * 0.5 + 0.5) * 255);
          d[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    }, { srgb: false, repeat });
  }

  const TEX = {};

  // --------------------------------------------------------------------------
  // 1. CRIMSON & GOLD ROYAL CARPET RUNNER (Color + Normal Map)
  // --------------------------------------------------------------------------
  function carpetHeight(u, v) {
    const edge = Math.min(u, 1 - u);
    const weave = fbm(u * 32, v * 32, 3, 19, 32, 32) * 0.22;
    const b1 = smooth(0.012, 0.002, Math.abs(edge - 0.045));
    const b2 = smooth(0.010, 0.002, Math.abs(edge - 0.135));
    const scroll = 0.5 + 0.5 * Math.sin(v * Math.PI * 24 + Math.sin(edge * 90) * 1.8);
    const innerScroll = (edge > 0.055 && edge < 0.125) ? smooth(0.48, 0.82, scroll * Math.cos((edge - 0.09) * 55)) : 0;
    const du = (u - 0.5) * 6.0, dv = (v * 4.0) % 1.0 - 0.5;
    const damask = (edge > 0.16) ? smooth(0.4, 0.85, Math.cos(du * Math.PI * 2) * Math.cos(dv * Math.PI * 2)) * 0.30 : 0;
    return weave + (b1 + b2 + innerScroll) * 0.55 + damask;
  }

  TEX.carpet = canvasTex(1024, 1024, (g, W, H) => {
    pixelFill(g, W, H, (u, v) => {
      const edge = Math.min(u, 1 - u);
      const weave = (Math.sin(u * W * 1.4) * Math.cos(v * H * 1.4)) * 0.07 + (fbm(u * 14, v * 14, 3, 19, 14, 14) - 0.5) * 0.22;

      let R = 98 + weave * 30;
      let G = 10 + weave * 7;
      let B = 15 + weave * 9;

      const du = (u - 0.5) * 6.0;
      const dv = (v * 4.0) % 1.0 - 0.5;
      const damask = Math.cos(du * Math.PI * 2) * Math.cos(dv * Math.PI * 2) + 0.4 * Math.sin(u * 36) * Math.sin(v * 36);
      if (edge > 0.16 && damask > 0.42) {
        const k = smooth(0.42, 0.85, damask) * 0.48;
        R = lerp(R, 174, k);
        G = lerp(G, 42, k);
        B = lerp(B, 28, k);
      }

      const b1 = Math.abs(edge - 0.045);
      const b2 = Math.abs(edge - 0.135);
      const scroll = 0.5 + 0.5 * Math.sin(v * Math.PI * 24 + Math.sin(edge * 90) * 1.8);
      const innerScroll = (edge > 0.055 && edge < 0.125) ? smooth(0.48, 0.82, scroll * Math.cos((edge - 0.09) * 55)) : 0;
      const goldLine = smooth(0.012, 0.002, b1) + smooth(0.010, 0.002, b2) + innerScroll * 0.85;

      const wear = fbm(u * 6, v * 6, 4, 77, 6, 6);
      const goldMask = clamp(goldLine * (0.78 + 0.26 * wear), 0, 1);

      R = lerp(R, 218, goldMask);
      G = lerp(G, 166, goldMask);
      B = lerp(B, 64, goldMask);

      if (edge < 0.022) {
        R *= 0.42; G *= 0.42; B *= 0.42;
      }
      return [R, G, B, 255];
    });
  }, { repeat: [1, 1] });

  TEX.carpetNormal = makeNormalTex(256, 256, carpetHeight, 1.5, [1, 1]);

  // --------------------------------------------------------------------------
  // 2. VARIED ANTIQUE CHECKERED MARBLE FLOOR (16 Unique Slabs per Repeat + Multi-Mineral Veins)
  // --------------------------------------------------------------------------
  function marbleHeight(u, v) {
    const tx = (u + v) * 2.0;
    const ty = (u - v + 2.0) * 2.0;
    const ix = Math.floor(tx) & 3, iy = Math.floor(ty) & 3;
    const fx = tx - Math.floor(tx), fy = ty - Math.floor(ty);
    const grout = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy));
    const bevel = smooth(0.008, 0.032, grout);
    // Subtle per-slab settling height offset & worn center dish
    const slabTilt = (hash(ix, iy, 11) - 0.5) * 0.08 * (fx - 0.5) + (hash(ix, iy, 12) - 0.5) * 0.08 * (fy - 0.5);
    const micro = fbm(u * 12, v * 12, 3, 31, 12, 12) * 0.035;
    return bevel * 0.85 + slabTilt + micro;
  }

  TEX.marbleFloor = canvasTex(1024, 1024, (g, W, H) => {
    pixelFill(g, W, H, (u, v) => {
      const tx = (u + v) * 2.0;
      const ty = (u - v + 2.0) * 2.0;
      const ix = Math.floor(tx), iy = Math.floor(ty);
      const fx = tx - ix, fy = ty - iy;
      const sx = ((ix % 4) + 4) % 4, sy = ((iy % 4) + 4) % 4;
      const grout = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy));
      const isDark = ((ix + iy) & 1) === 0;

      // Per-slab deterministic variation so every tile has its own geological character
      const hTone = hash(sx, sy, 21);
      const hWarm = hash(sx, sy, 22);
      const hAng  = hash(sx, sy, 23) * Math.PI;
      const hOffU = hash(sx, sy, 24) * 5.0;
      const hOffV = hash(sx, sy, 25) * 5.0;

      const n1 = fbm(u * 6, v * 6, 4, 31, 6, 6);
      const n2 = fbm(u * 18, v * 18, 3, 47, 18, 18);
      const rotU = (fx - 0.5) * Math.cos(hAng) - (fy - 0.5) * Math.sin(hAng) + hOffU;
      const rotV = (fx - 0.5) * Math.sin(hAng) + (fy - 0.5) * Math.cos(hAng) + hOffV;
      const vein1 = Math.pow(Math.abs(Math.sin((rotU * 2.8 + n1 * 2.4) * Math.PI)), 14);
      const vein2 = Math.pow(Math.abs(Math.cos((rotV * 3.4 - n2 * 1.9) * Math.PI)), 18);
      const edgeWear = smooth(0.18, 0.02, grout);

      let R, G, B;
      if (isDark) {
        // Dark slabs vary between Nero Marquina (gold-veined charcoal), Rosso Levanto (burgundy-slate) & Verde Antico (serpentine slate)
        const baseLum = 36 + hTone * 18 + n1 * 18 + (n2 - 0.5) * 10;
        const rShift = (hWarm < 0.35) ? 10 : (hWarm > 0.70 ? -5 : 2);
        const gShift = (hWarm > 0.70) ? 7 : -2;
        const bShift = (hWarm < 0.35) ? 4 : (hWarm > 0.70 ? 3 : 8);
        R = baseLum + rShift + vein1 * 82 + vein2 * 38;
        G = baseLum + gShift + vein1 * 64 + vein2 * 34;
        B = baseLum + bShift + vein1 * 42 + vein2 * 36;
      } else {
        // Light slabs vary between warm Siena ivory-gold, cool Carrara blue-grey, and aged travertine
        const baseLum = 136 + hTone * 28 + n1 * 26 + (n2 - 0.5) * 14;
        const warmTint = (hWarm - 0.45) * 26;
        R = baseLum + warmTint + 14 - vein1 * 38 + vein2 * 18;
        G = baseLum + warmTint * 0.45 - 2 - vein1 * 36 + vein2 * 12;
        B = baseLum - warmTint * 0.85 - 22 - vein1 * 32 + vein2 * 6;
      }

      // Subtle patina & dust accumulation near slab edges
      R = lerp(R, 74, edgeWear * 0.24);
      G = lerp(G, 68, edgeWear * 0.24);
      B = lerp(B, 58, edgeWear * 0.24);

      if (grout < 0.026) {
        const k = smooth(0.005, 0.026, grout);
        const moss = smooth(0.55, 0.85, n1);
        const gR = lerp(32, 38, moss), gG = lerp(30, 46, moss), gB = lerp(26, 28, moss);
        R = lerp(gR, R, k);
        G = lerp(gG, G, k);
        B = lerp(gB, B, k);
      }
      return [R, G, B, 255];
    });
  }, { repeat: [1, 1] });

  TEX.marbleNormal = makeNormalTex(256, 256, marbleHeight, 1.35, [1, 1]);
  TEX.marbleRough = canvasTex(256, 256, (g, W, H) => {
    pixelFill(g, W, H, (u, v) => {
      const tx = (u + v) * 2.0, ty = (u - v + 2.0) * 2.0;
      const ix = ((Math.floor(tx) % 4) + 4) % 4, iy = ((Math.floor(ty) % 4) + 4) % 4;
      const fx = tx - Math.floor(tx), fy = ty - Math.floor(ty);
      const grout = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy));
      const slabPolish = hash(ix, iy, 29) * 26;
      const n = fbm(u * 10, v * 10, 3, 44, 10, 10);
      const scuff = fbm(u * 28, v * 28, 2, 49, 28, 28);
      const edgeWear = smooth(0.14, 0.02, grout) * 45;
      const rVal = grout < 0.028 ? 220 : (18 + slabPolish + n * 38 + (scuff - 0.5) * 18 + edgeWear);
      return [rVal, rVal, rVal, 255];
    });
  }, { srgb: false, repeat: [1, 1] });

  // --------------------------------------------------------------------------
  // 3. WEATHERED VICTORIAN MAHOGANY & BURLED WALNUT WAINSCOTING (Per-Panel Variation)
  // --------------------------------------------------------------------------
  function woodPanelHeight(u, v) {
    // u is vertical (0..1 over wall height), v is horizontal (0..1 over 4 bays)
    const pu = (u * 3) % 1, pv = (v * 4) % 1;
    const edgeU = Math.min(pu, 1 - pu), edgeV = Math.min(pv, 1 - pv);
    const d = Math.min(edgeU, edgeV);

    let h = 0.5;
    if (d < 0.08) h = 0.85; // outer stile/rail
    else if (d < 0.12) h = 0.35 + 0.5 * Math.cos(((d - 0.08) / 0.04) * Math.PI); // outer bevel
    else if (d < 0.16) h = 0.65; // inner molding bead
    else if (d < 0.21) h = 0.15; // deep recess groove
    else if (d < 0.28) h = lerp(0.15, 0.72, (d - 0.21) / 0.07); // raised panel bevel
    else h = 0.72; // raised center panel

    const grain = fbm(u * 10, v * 48, 3, 52, 10, 48) * 0.065;
    return h + grain;
  }

  TEX.woodPanel = canvasTex(1024, 1024, (g, W, H) => {
    pixelFill(g, W, H, (u, v) => {
      const idxU = Math.floor(u * 3) % 3, idxV = Math.floor(v * 4) % 4;
      const pu = (u * 3) % 1, pv = (v * 4) % 1;
      const d = Math.min(Math.min(pu, 1 - pu), Math.min(pv, 1 - pv));

      // Per-panel stain & burl variation inspired by HollowMoorManor's plank hash
      const pTone = 0.84 + hash(idxU, idxV, 61) * 0.32;
      const pWarm = (hash(idxU, idxV, 62) - 0.5) * 18;
      const warp = fbm(u * 8, v * 8, 3, 51, 8, 8) * 0.25;
      const grain = fbm(u * 6 + warp, v * 36, 4, 52, 6, 36);
      const fine = fbm(u * 16, v * 96, 2, 63, 16, 96);
      const streak = fbm(u * 3, v * 24, 3, 67, 3, 24);
      const h = woodPanelHeight(u, v);
      const ao = smooth(0.10, 0.45, h) * 0.42 + 0.58;
      const w = (0.52 + grain * 0.48 + (fine - 0.5) * 0.16) * ao * pTone * (0.86 + 0.24 * streak);

      let R = (112 + pWarm) * w + 22;
      let G = (58 + pWarm * 0.35) * w + 12;
      let B = (33 - pWarm * 0.25) * w + 7;

      // Tarnished antique gold-leaf fillet along the inner ogee molding with age wear
      if (d >= 0.125 && d <= 0.155) {
        const gWear = smooth(0.28, 0.72, fbm(u * 14, v * 14, 3, 79, 14, 14));
        const gMask = smooth(0.016, 0.003, Math.abs(d - 0.14)) * (0.35 + 0.50 * gWear);
        R = lerp(R, 204, gMask);
        G = lerp(G, 154, gMask);
        B = lerp(B, 66, gMask);
      }
      return [R, G, B, 255];
    });
  }, { repeat: [1, 1] });

  TEX.woodPanelNormal = makeNormalTex(256, 256, woodPanelHeight, 2.0, [1, 1]);
  TEX.fineWoodNormal = makeNormalTex(128, 128, (u, v) => fbm(u * 24, v * 4, 3, 55, 24, 4) * 0.35, 1.2, [1, 1]);

  // --------------------------------------------------------------------------
  // 4. FLUTED CLASSICAL COLUMN SHAFT NORMAL MAP
  // --------------------------------------------------------------------------
  TEX.columnNormal = makeNormalTex(256, 256, (u, v) => {
    const flutes = Math.sin(u * Math.PI * 2 * 16);
    const fluteDepth = flutes * 0.35;
    const grain = fbm(u * 16, v * 8, 2, 17, 16, 8) * 0.04;
    return fluteDepth + grain;
  }, 1.5, [1, 1]);

  // --------------------------------------------------------------------------
  // 5. COFFERED GOTHIC VAULT CEILING (Per-Coffer Patina + Deep Coffer Normal Map)
  // --------------------------------------------------------------------------
  function vaultCofferHeight(u, v) {
    const cu = (u * 6) % 1, cv = (v * 3) % 1;
    const d = Math.min(Math.min(cu, 1 - cu), Math.min(cv, 1 - cv));
    let h = 0.2;
    if (d < 0.09) h = 0.95; // main rib
    else if (d < 0.15) h = 0.65; // inner step
    else if (d < 0.21) h = 0.35; // inner molding
    const distCenter = Math.hypot(cu - 0.5, cv - 0.5);
    if (distCenter < 0.16) {
      h += Math.cos((distCenter / 0.16) * Math.PI * 0.5) * 0.45;
    }
    return h + fbm(u * 16, v * 16, 2, 71, 16, 16) * 0.05;
  }

  TEX.vaultCeiling = canvasTex(512, 512, (g, W, H) => {
    pixelFill(g, W, H, (u, v) => {
      const n = fbm(u * 10, v * 10, 4, 71, 10, 10);
      const soot = fbm(u * 4, v * 4, 3, 73, 4, 4);
      const ix = Math.floor(u * 6) % 6, iy = Math.floor(v * 3) % 3;
      const cofferTone = 0.85 + hash(ix, iy, 75) * 0.30;
      const cu = (u * 6) % 1, cv = (v * 3) % 1;
      const border = Math.min(Math.min(cu, 1 - cu), Math.min(cv, 1 - cv));
      const distCenter = Math.hypot(cu - 0.5, cv - 0.5);
      let shade = (0.66 + n * 0.38) * cofferTone * (0.82 + 0.28 * soot);
      let gold = 0;
      if (border < 0.08) shade *= 1.22;
      else if (border < 0.14) gold = 0.72 * (0.65 + 0.35 * n);
      else if (border < 0.20) shade *= 0.64;
      if (distCenter < 0.14) gold = Math.max(gold, 0.74 * (0.7 + 0.3 * n));

      const R = lerp(114 * shade, 212, gold);
      const G = lerp(70 * shade, 158, gold);
      const B = lerp(42 * shade, 64, gold);
      return [R, G, B, 255];
    });
  }, { repeat: [1, 1] });

  TEX.vaultNormal = makeNormalTex(256, 256, vaultCofferHeight, 3.2, [1, 1]);

  // --------------------------------------------------------------------------
  // 6. WEATHERED ASHLAR MANOR STONE BLOCKS (HollowMoorManor 16-Course Technique + Moss & Streaks)
  // --------------------------------------------------------------------------
  TEX.stoneWall = canvasTex(1024, 1024, (g, W, H) => {
    g.fillStyle = '#1b1d20';
    g.fillRect(0, 0, W, H);
    const rows = 14;
    const rh = H / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      const widths = [];
      let sum = 0;
      while (sum < W - 110) {
        const w = rr(85, 195);
        widths.push(w);
        sum += w;
      }
      widths.push(W - sum);
      const scale = W / widths.reduce((a, b) => a + b, 0);
      let x = ((r * 83) % 160) - 160;
      let idx = 0;
      while (x < W) {
        const bw = widths[idx % widths.length] * scale;
        const drawX = (x + W) % W;
        const tone = rr(78, 126);
        const warm = rr(-10, 16);
        const grd = g.createLinearGradient(0, y, 0, y + rh);
        grd.addColorStop(0, rgb(tone + warm + 10, tone + warm * 0.4 + 8, tone - warm * 0.5 + 4));
        grd.addColorStop(0.55, rgb(tone + warm, tone + warm * 0.3, tone - warm * 0.5));
        grd.addColorStop(1, rgb(tone + warm - 16, tone + warm * 0.2 - 14, tone - warm * 0.5 - 12));
        g.fillStyle = grd;
        const pad = 3.5;
        const wDraw = Math.min(bw - pad * 2, W - drawX - pad);
        if (wDraw > 2) g.fillRect(drawX + pad, y + pad, wDraw, rh - pad * 2);
        if (drawX + bw > W) {
          const rem = (drawX + bw) - W - pad;
          if (rem > 2) g.fillRect(pad, y + pad, rem, rh - pad * 2);
        }
        x += bw;
        idx++;
      }
    }
    // Per-pixel lichen, mineral grain, vertical damp rainwater streaks & lower moss
    pixelFill(g, W, H, (u, v, x, y, r, gg, b) => {
      const grain = (fbm(u * 24, v * 24, 4, 88, 24, 24) - 0.5) * 44;
      const pock = (fbm(u * 64, v * 64, 2, 91, 64, 64) - 0.5) * 24;
      const streak = fbm(u * 18, v * 2, 3, 95, 18, 2);
      const grime = smooth(0.45, 0.82, streak) * 0.34;
      const mossMask = smooth(0.54, 0.82, fbm(u * 7, v * 7, 3, 99, 7, 7)) * smooth(0.35, 0.95, v);
      let R = (r + grain + pock) * (1 - grime);
      let G = (gg + grain + pock) * (1 - grime * 0.85);
      let B = (b + grain + pock) * (1 - grime * 0.70);
      R = lerp(R, 38, mossMask * 0.55);
      G = lerp(G, 64, mossMask * 0.55);
      B = lerp(B, 34, mossMask * 0.55);
      return [R, G, B, 255];
    });
  }, { repeat: [1, 1] });

  TEX.stoneNormal = makeNormalTex(256, 256, (u, v) => {
    const row = Math.floor(v * 14);
    const fy = (v * 14) % 1;
    const fx = ((u * 6) + (row % 2) * 0.43 + hash(row, 1, 84) * 0.25) % 1;
    const mortar = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy));
    const blockBevel = smooth(0.02, 0.09, mortar);
    const rock = fbm(u * 24, v * 24, 4, 88, 24, 24) * 0.45;
    return blockBevel * 0.78 + rock;
  }, 3.6, [1, 1]);

  // --------------------------------------------------------------------------
  // 7. CRUSHED & DIAMOND-TUFTED VELVET MAPS (for Armchairs & Window Curtains)
  // --------------------------------------------------------------------------
  TEX.velvetNormal = makeNormalTex(128, 128, (u, v) => {
    return fbm(u * 16, v * 16, 3, 105, 16, 16) * 0.5 + Math.sin(u * 180) * Math.cos(v * 180) * 0.08;
  }, 2.2, [3, 3]);

  function tuftedVelvetHeight(u, v) {
    // 4x6 diamond-tufted Chesterfield pattern with button dimples and radiating pleats
    const su = u * 4.0, sv = v * 5.0;
    const d1 = (su + sv) % 1.0, d2 = ((su - sv) % 1.0 + 1.0) % 1.0;
    const bx = Math.min(d1, 1.0 - d1), by = Math.min(d2, 1.0 - d2);
    const pillow = Math.sin(Math.min(1.0, bx * 2.0) * Math.PI * 0.5) * Math.sin(Math.min(1.0, by * 2.0) * Math.PI * 0.5);
    // Distance to nearest diamond vertex (button pit)
    const cx = Math.min(su % 1.0, 1.0 - (su % 1.0));
    const cy = Math.min(sv % 1.0, 1.0 - (sv % 1.0));
    const cAltX = Math.abs((su % 1.0) - 0.5);
    const cAltY = Math.abs((sv % 1.0) - 0.5);
    const rPit = Math.min(Math.hypot(cx, cy), Math.hypot(cAltX, cAltY));
    const pit = smooth(0.03, 0.16, rPit);
    const crease = 1.0 - 0.35 * (smooth(0.06, 0.0, bx) + smooth(0.06, 0.0, by));
    const nap = fbm(u * 24, v * 24, 3, 109, 24, 24) * 0.12;
    return (0.25 + pillow * 0.65) * pit * crease + nap;
  }

  TEX.tuftedVelvet = canvasTex(512, 512, (g, W, H) => {
    pixelFill(g, W, H, (u, v) => {
      const h = tuftedVelvetHeight(u, v);
      const wear = fbm(u * 8, v * 8, 3, 114, 8, 8);
      const sheen = Math.pow(clamp(h, 0, 1), 1.45);
      const R = 42 + sheen * 72 + wear * 14;
      const G = 5 + sheen * 11 + wear * 3;
      const B = 9 + sheen * 14 + wear * 4;
      return [R, G, B, 255];
    });
  }, { repeat: [1, 1] });

  TEX.tuftedVelvetNormal = makeNormalTex(256, 256, tuftedVelvetHeight, 3.4, [1, 1]);

  // --------------------------------------------------------------------------
  // 8. GOTHIC ARCHED MOONLIT WINDOW TEXTURE
  // --------------------------------------------------------------------------
  TEX.windowMoon = canvasTex(512, 768, (g, W, H) => {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#050c1a');
    sky.addColorStop(0.38, '#132a4f');
    sky.addColorStop(0.75, '#09152b');
    sky.addColorStop(1, '#040811');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    const mx = W * 0.52, my = H * 0.24, mr = W * 0.19;
    const halo = g.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 2.5);
    halo.addColorStop(0, 'rgba(210, 232, 255, 0.92)');
    halo.addColorStop(0.35, 'rgba(120, 175, 235, 0.65)');
    halo.addColorStop(0.68, 'rgba(45, 95, 165, 0.22)');
    halo.addColorStop(1, 'rgba(12, 28, 60, 0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);

    // Moon with subtle crater mares
    g.fillStyle = '#d8ebff';
    g.beginPath();
    g.arc(mx, my, mr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(130, 160, 195, 0.35)';
    g.beginPath();
    g.arc(mx - mr * 0.25, my - mr * 0.15, mr * 0.32, 0, Math.PI * 2);
    g.arc(mx + mr * 0.22, my + mr * 0.20, mr * 0.24, 0, Math.PI * 2);
    g.fill();

    g.strokeStyle = '#05080f';
    g.lineCap = 'round';
    function branch(x, y, len, ang, w, depth) {
      if (depth <= 0 || len < 8) return;
      const nx = x + Math.cos(ang) * len;
      const ny = y + Math.sin(ang) * len;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo((x + nx) * 0.5 + rr(-12, 12), (y + ny) * 0.5 + rr(-12, 12), nx, ny);
      g.stroke();
      branch(nx, ny, len * rr(0.68, 0.82), ang - rr(0.22, 0.55), w * 0.68, depth - 1);
      branch(nx, ny, len * rr(0.65, 0.80), ang + rr(0.22, 0.55), w * 0.68, depth - 1);
    }
    branch(W * 0.15, H * 0.95, 150, -1.15, 14, 6);
    branch(W * 0.88, H * 0.88, 140, -1.95, 12, 6);

    g.strokeStyle = '#040508';
    g.lineWidth = 10;
    for (let i = 1; i < 4; i++) {
      g.beginPath();
      g.moveTo((W * i) / 4, 0);
      g.lineTo((W * i) / 4, H);
      g.stroke();
    }
    for (let j = 1; j < 6; j++) {
      g.beginPath();
      g.moveTo(0, (H * j) / 6);
      g.lineTo(W, (H * j) / 6);
      g.stroke();
    }
    g.lineWidth = 14;
    g.beginPath();
    g.arc(W * 0.5, H * 0.28, W * 0.48, Math.PI, 0);
    g.stroke();
  }, { clampEdge: true });

  // --------------------------------------------------------------------------
  // 9. REALISTIC REMBRANDT / VICTORIAN CHIAROSCURO OIL PORTRAITS
  // --------------------------------------------------------------------------
  TEX.portraits = [];
  const portraitThemes = [
    { name: 'Lady Victoria', dress: '#8a7968', dressDark: '#2c221b', bg1: '#261810', bg2: '#090604', hair: '#140d09', skinHi: '#d4b59b', skinMid: '#9c785c', skinShad: '#3b2618', lip: '#7a3b36' },
    { name: 'Lord Ravenscroft', dress: '#1e161b', dressDark: '#0b080a', bg1: '#221912', bg2: '#080605', hair: '#241f1d', skinHi: '#c8a488', skinMid: '#8f6b50', skinShad: '#332014', lip: '#663832' },
    { name: 'Countess Carmilla', dress: '#541218', dressDark: '#1c0508', bg1: '#1b1a26', bg2: '#07070c', hair: '#0c090d', skinHi: '#d6c4be', skinMid: '#9a847e', skinShad: '#362826', lip: '#6e1e26' },
    { name: 'Duchess Eleanor', dress: '#1e2c2e', dressDark: '#0b1112', bg1: '#1a211c', bg2: '#060807', hair: '#2c1f15', skinHi: '#cbb098', skinMid: '#91735a', skinShad: '#342316', lip: '#6e3832' }
  ];

  for (let i = 0; i < portraitThemes.length; i++) {
    const th = portraitThemes[i];
    const tex = canvasTex(512, 768, (g, W, H) => {
      // Rich chiaroscuro oil background
      const bg = g.createRadialGradient(W * 0.46, H * 0.32, 20, W * 0.5, H * 0.5, W * 0.85);
      bg.addColorStop(0, th.bg1);
      bg.addColorStop(1, th.bg2);
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      // Victorian Gown / Coat with pleated shading
      const dressGrad = g.createLinearGradient(W * 0.2, H * 0.48, W * 0.8, H);
      dressGrad.addColorStop(0, th.dress);
      dressGrad.addColorStop(0.55, th.dressDark);
      dressGrad.addColorStop(1, '#050404');
      g.fillStyle = dressGrad;
      g.beginPath();
      g.moveTo(W * 0.12, H);
      g.bezierCurveTo(W * 0.16, H * 0.65, W * 0.24, H * 0.50, W * 0.37, H * 0.46);
      g.lineTo(W * 0.63, H * 0.46);
      g.bezierCurveTo(W * 0.76, H * 0.50, W * 0.84, H * 0.65, W * 0.88, H);
      g.closePath();
      g.fill();

      // Draped dress folds
      for (let f = -3; f <= 3; f++) {
        g.strokeStyle = f < 0 ? 'rgba(255,235,210,0.07)' : 'rgba(0,0,0,0.32)';
        g.lineWidth = 10;
        g.beginPath();
        g.moveTo(W * (0.5 + f * 0.04), H * 0.50);
        g.quadraticCurveTo(W * (0.5 + f * 0.07), H * 0.75, W * (0.5 + f * 0.10), H);
        g.stroke();
      }

      // Victorian Lace Bodice / Ruffled Collar
      g.fillStyle = 'rgba(220, 204, 180, 0.22)';
      g.beginPath();
      g.ellipse(W * 0.5, H * 0.46, W * 0.14, H * 0.045, 0, 0, Math.PI);
      g.fill();

      // Neck & Décolletage with realistic cylindrical shading
      const neckGrad = g.createLinearGradient(W * 0.42, 0, W * 0.58, 0);
      neckGrad.addColorStop(0, th.skinHi);
      neckGrad.addColorStop(0.6, th.skinMid);
      neckGrad.addColorStop(1, th.skinShad);
      g.fillStyle = neckGrad;
      g.beginPath();
      g.moveTo(W * 0.44, H * 0.34);
      g.lineTo(W * 0.56, H * 0.34);
      g.lineTo(W * 0.60, H * 0.47);
      g.lineTo(W * 0.40, H * 0.47);
      g.closePath();
      g.fill();

      // Chin cast shadow on neck
      const chinShad = g.createRadialGradient(W * 0.5, H * 0.36, 4, W * 0.5, H * 0.37, W * 0.09);
      chinShad.addColorStop(0, 'rgba(15, 8, 5, 0.78)');
      chinShad.addColorStop(1, 'rgba(15, 8, 5, 0)');
      g.fillStyle = chinShad;
      g.fillRect(W * 0.38, H * 0.34, W * 0.24, H * 0.10);

      // Sculpted Victorian Coiffure / Hair
      g.fillStyle = th.hair;
      g.beginPath();
      g.ellipse(W * 0.5, H * 0.24, W * 0.165, H * 0.115, 0, 0, Math.PI * 2);
      g.fill();
      // Trailing curls on shoulders
      g.beginPath();
      g.ellipse(W * 0.37, H * 0.34, W * 0.045, H * 0.09, 0.15, 0, Math.PI * 2);
      g.ellipse(W * 0.63, H * 0.34, W * 0.045, H * 0.09, -0.15, 0, Math.PI * 2);
      g.fill();

      // Head & Chiaroscuro Face (3/4 Rembrandt lighting from upper-left)
      const faceGrad = g.createRadialGradient(W * 0.45, H * 0.24, 8, W * 0.51, H * 0.26, W * 0.145);
      faceGrad.addColorStop(0, th.skinHi);
      faceGrad.addColorStop(0.52, th.skinMid);
      faceGrad.addColorStop(1, th.skinShad);
      g.fillStyle = faceGrad;
      g.beginPath();
      g.moveTo(W * 0.39, H * 0.22);
      g.bezierCurveTo(W * 0.39, H * 0.15, W * 0.61, H * 0.15, W * 0.61, H * 0.22);
      g.bezierCurveTo(W * 0.61, H * 0.31, W * 0.55, H * 0.365, W * 0.50, H * 0.37);
      g.bezierCurveTo(W * 0.45, H * 0.365, W * 0.39, H * 0.31, W * 0.39, H * 0.22);
      g.closePath();
      g.fill();

      // Parted hair bangs framing forehead
      g.fillStyle = th.hair;
      g.beginPath();
      g.moveTo(W * 0.50, H * 0.16);
      g.quadraticCurveTo(W * 0.42, H * 0.18, W * 0.385, H * 0.245);
      g.quadraticCurveTo(W * 0.41, H * 0.15, W * 0.50, H * 0.15);
      g.moveTo(W * 0.50, H * 0.16);
      g.quadraticCurveTo(W * 0.58, H * 0.18, W * 0.615, H * 0.245);
      g.quadraticCurveTo(W * 0.59, H * 0.15, W * 0.50, H * 0.15);
      g.fill();

      // Brow ridge & deep shadowed eye sockets
      for (const sx of [-1, 1]) {
        const ex = W * (0.5 + sx * 0.046), ey = H * 0.245;
        const sock = g.createRadialGradient(ex, ey, 2, ex, ey, 18);
        sock.addColorStop(0, 'rgba(20, 10, 8, 0.85)');
        sock.addColorStop(1, 'rgba(20, 10, 8, 0)');
        g.fillStyle = sock;
        g.beginPath();
        g.ellipse(ex, ey, 16, 11, 0, 0, Math.PI * 2);
        g.fill();

        // Eyebrow arch
        g.strokeStyle = th.hair;
        g.lineWidth = 3.5;
        g.beginPath();
        g.moveTo(ex - sx * 14, ey - 7);
        g.quadraticCurveTo(ex, ey - 12, ex + sx * 13, ey - 6);
        g.stroke();

        // Almond sclera & dark iris
        g.fillStyle = '#a89688';
        g.beginPath();
        g.ellipse(ex, ey, 9, 4.5, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1c120e';
        g.beginPath();
        g.arc(ex, ey, 4.2, 0, Math.PI * 2);
        g.fill();
        // Tiny realistic catchlight
        g.fillStyle = 'rgba(245, 235, 220, 0.85)';
        g.beginPath();
        g.arc(ex - 1.5, ey - 1.2, 1.3, 0, Math.PI * 2);
        g.fill();
      }

      // Nose bridge highlight & shadow
      g.strokeStyle = 'rgba(255, 235, 215, 0.35)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(W * 0.495, H * 0.24);
      g.lineTo(W * 0.492, H * 0.295);
      g.stroke();
      g.fillStyle = 'rgba(25, 12, 8, 0.55)';
      g.beginPath();
      g.ellipse(W * 0.505, H * 0.302, 8, 4, 0, 0, Math.PI * 2);
      g.fill();

      // Sculpted Lips
      g.fillStyle = th.lip;
      g.beginPath();
      g.ellipse(W * 0.5, H * 0.328, 13, 4.5, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(18, 6, 6, 0.75)';
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(W * 0.472, H * 0.328);
      g.lineTo(W * 0.528, H * 0.328);
      g.stroke();

      // Oil canvas brushwork & craquelure varnish aging
      pixelFill(g, W, H, (u, v, x, y, r, gg, b) => {
        const canvasWeave = (Math.sin(x * 1.5) * Math.cos(y * 1.5)) * 0.04;
        const n = fbm(u * 36, v * 36, 3, 40 + i, 36, 36);
        const vig = 1.0 - 0.42 * smooth(0.32, 0.74, Math.hypot(u - 0.5, (v - 0.5) * 0.9));
        const m = (0.86 + n * 0.28 + canvasWeave) * vig;
        return [r * m, gg * m, b * m, 255];
      });
    }, { clampEdge: true });
    TEX.portraits.push(tex);
  }

  // 10. LACY COBWEB ALPHA TEXTURE
  TEX.cobweb = canvasTex(256, 256, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(215, 220, 230, 0.48)';
    const spokes = 14;
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * (Math.PI * 0.5);
      g.lineWidth = rr(0.7, 1.5);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(Math.cos(a) * W * 0.5, Math.sin(a) * H * 0.5 + rr(-8, 12), Math.cos(a) * W * 1.1, Math.sin(a) * H * 1.1);
      g.stroke();
    }
    for (let r = 18; r < W * 1.05; r += rr(14, 24)) {
      g.lineWidth = rr(0.5, 1.1);
      g.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * (Math.PI * 0.5);
        const radJ = r + rr(-3, 3);
        const px = Math.cos(a) * radJ, py = Math.sin(a) * radJ;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.stroke();
    }
  }, { srgb: false, clampEdge: true });

  // 11. SOFT PARTICLE / MIST TEXTURE & AMBIENT OCCLUSION CONTACT SHADOW DECAL
  TEX.softGlow = canvasTex(128, 128, (g, W, H) => {
    const gr = g.createRadialGradient(W / 2, H / 2, 2, W / 2, H / 2, W / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }, { srgb: false, clampEdge: true });

  TEX.aoShadow = canvasTex(128, 128, (g, W, H) => {
    const gr = g.createRadialGradient(W / 2, H / 2, W * 0.08, W / 2, H / 2, W * 0.48);
    gr.addColorStop(0, 'rgba(0,0,0,0.82)');
    gr.addColorStop(0.45, 'rgba(0,0,0,0.52)');
    gr.addColorStop(0.78, 'rgba(0,0,0,0.18)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }, { srgb: false, clampEdge: true });

  // Pumpkin rind: vertical ribs, mottled orange and subtle skin pores
  TEX.pumpkinRind = canvasTex(256, 256, (g, W, H) => {
    pixelFill(g, W, H, (u, v) => {
      const rib = 0.5 + 0.5 * Math.cos(u * Math.PI * 2 * 12);
      const n = fbm(u * 10, v * 10, 4, 61, 10, 10);
      const f = fbm(u * 60, v * 60, 2, 62, 60, 60);
      const m = 0.55 + rib * 0.35 + (n - 0.5) * 0.5 + (f - 0.5) * 0.15;
      return [200 * m, 78 * m * (0.6 + n * 0.5), 14 * m, 255];
    });
  });
  TEX.pumpkinNormal = makeNormalTex(256, 256, (u, v) => {
    const rib = Math.cos(u * Math.PI * 2 * 12) * 0.5;
    return rib * 0.6 + fbm(u * 40, v * 40, 3, 66, 40, 40) * 0.15;
  }, 2.0, [1, 1]);

  // ---------- Shared PBR Materials Library with Normal & Roughness Maps (SSR Enabled) ----------
  const MAT = {
    carpet: new THREE.MeshStandardMaterial({
      color: 0x742830,
      map: TEX.carpet,
      normalMap: TEX.carpetNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.82,
      metalness: 0.0,
      envMapIntensity: 0.18,
      userData: { ssr: 0.0 }
    }),
    marbleFloor: new THREE.MeshPhysicalMaterial({
      color: 0x3b3640,
      clearcoat: 0.92,
      clearcoatRoughness: 0.09,
      map: TEX.marbleFloor,
      normalMap: TEX.marbleNormal,
      normalScale: new THREE.Vector2(0.30, 0.30),
      roughnessMap: TEX.marbleRough,
      roughness: 0.16,
      metalness: 0.02,
      envMapIntensity: 0.48,
      userData: { ssr: 0.85 }
    }),
    woodPanel: new THREE.MeshStandardMaterial({
      color: 0xd8b49a,
      map: TEX.woodPanel,
      normalMap: TEX.woodPanelNormal,
      normalScale: new THREE.Vector2(0.80, 0.80),
      roughness: 0.42,
      metalness: 0.02,
      envMapIntensity: 0.38,
      userData: { ssr: 0.26 }
    }),
    columnWood: new THREE.MeshStandardMaterial({
      color: 0xd8b49a,
      map: TEX.woodPanel,
      normalMap: TEX.columnNormal,
      normalScale: new THREE.Vector2(0.80, 0.80),
      roughness: 0.38,
      metalness: 0.02,
      envMapIntensity: 0.40,
      userData: { ssr: 0.28 }
    }),
    vaultCeiling: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: TEX.vaultCeiling,
      normalMap: TEX.vaultNormal,
      normalScale: new THREE.Vector2(0.80, 0.80),
      roughness: 0.46,
      metalness: 0.08,
      envMapIntensity: 0.35,
      userData: { ssr: 0.16 }
    }),
    darkWood: new THREE.MeshStandardMaterial({
      color: 0x6b381e,
      normalMap: TEX.fineWoodNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.36,
      metalness: 0.02,
      envMapIntensity: 0.42,
      side: THREE.DoubleSide,
      userData: { ssr: 0.28 }
    }),
    stoneWall: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: TEX.stoneWall,
      normalMap: TEX.stoneNormal,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughness: 0.76,
      metalness: 0.02,
      envMapIntensity: 0.26,
      userData: { ssr: 0.06 }
    }),
    goldTrim: new THREE.MeshStandardMaterial({
      color: 0x73581f,
      normalMap: TEX.velvetNormal,
      normalScale: new THREE.Vector2(0.10, 0.10),
      roughness: 0.28,
      metalness: 0.62,
      envMapIntensity: 0.95,
      userData: { ssr: 0.72 }
    }),
    agedBrass: new THREE.MeshStandardMaterial({
      color: 0x59421e,
      normalMap: TEX.velvetNormal,
      normalScale: new THREE.Vector2(0.12, 0.12),
      roughness: 0.34,
      metalness: 0.56,
      envMapIntensity: 0.85,
      userData: { ssr: 0.62 }
    }),
    darkIron: new THREE.MeshStandardMaterial({
      color: 0x323640,
      normalMap: TEX.stoneNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.44,
      metalness: 0.48,
      envMapIntensity: 0.82,
      userData: { ssr: 0.38 }
    }),
    velvetDrape: new THREE.MeshPhysicalMaterial({
      sheen: new THREE.Color(0xd4384a),
      color: 0x6e0a14,
      normalMap: TEX.velvetNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
      userData: { ssr: 0.0 }
    }),
    tuftedVelvet: new THREE.MeshPhysicalMaterial({
      sheen: new THREE.Color(0x982030),
      color: 0xb5787e,
      map: TEX.tuftedVelvet,
      normalMap: TEX.tuftedVelvetNormal,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughness: 0.78,
      metalness: 0.0,
      side: THREE.DoubleSide,
      userData: { ssr: 0.04 }
    }),
    crystalDrop: new THREE.MeshStandardMaterial({
      color: 0xfff6ea,
      emissive: 0x442208,
      emissiveIntensity: 0.25,
      roughness: 0.04,
      metalness: 0.15,
      envMapIntensity: 2.4,
      userData: { ssr: 0.95 }
    }),
    candleWax: new THREE.MeshStandardMaterial({
      color: 0x948a78, roughness: 0.62, metalness: 0.0, emissive: 0x3a1a08, emissiveIntensity: 0.06,
      userData: { ssr: 0.0 }
    }),
    bone: new THREE.MeshStandardMaterial({
      color: 0xa89272,
      normalMap: TEX.stoneNormal,
      normalScale: new THREE.Vector2(0.30, 0.30),
      roughness: 0.62,
      metalness: 0.02,
      userData: { ssr: 0.0 }
    }),
    pumpkinRind: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x3a0c00,
      emissiveIntensity: 0.55,
      map: TEX.pumpkinRind,
      normalMap: TEX.pumpkinNormal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.52,
      metalness: 0.02,
      userData: { ssr: 0.05 }
    }),
    pumpkinGlow: null, // Assigned below with dynamic pumpkinFireMat
    burlap: new THREE.MeshStandardMaterial({
      color: 0x261a10,
      normalMap: TEX.velvetNormal,
      normalScale: new THREE.Vector2(0.65, 0.65),
      roughness: 0.92,
      metalness: 0.0,
      userData: { ssr: 0.0 }
    }),
    straw: new THREE.MeshStandardMaterial({
      color: 0x5c4218,
      normalMap: TEX.velvetNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.90,
      metalness: 0.0,
      userData: { ssr: 0.0 }
    }),
    cobweb: new THREE.MeshBasicMaterial({
      map: TEX.cobweb,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      side: THREE.DoubleSide
    }),
    aoDecal: new THREE.MeshBasicMaterial({
      map: TEX.aoShadow,
      transparent: true,
      opacity: 0.78,
      depthWrite: false
    }),
    windowMoon: new THREE.MeshBasicMaterial({
      map: TEX.windowMoon
    }),
    moonBeam: null, // Replaced by modern volumetricBeamMat below
    autumnLeaf: new THREE.MeshStandardMaterial({
      color: 0x9c4620,
      roughness: 0.82,
      metalness: 0.0,
      envMapIntensity: 0.20,
      side: THREE.DoubleSide,
      userData: { ssr: 0.0 }
    })
  };

  // Explicitly guarantee SSR values on material instances
  MAT.marbleFloor.userData.ssr = 0.85;
  MAT.goldTrim.userData.ssr = 0.72;
  MAT.agedBrass.userData.ssr = 0.62;
  MAT.darkIron.userData.ssr = 0.38;
  MAT.darkWood.userData.ssr = 0.28;
  MAT.columnWood.userData.ssr = 0.25;
  MAT.woodPanel.userData.ssr = 0.24;
  MAT.vaultCeiling.userData.ssr = 0.12;
  MAT.stoneWall.userData.ssr = 0.04;
  MAT.carpet.userData.ssr = 0.0;
  MAT.velvetDrape.userData.ssr = 0.0;

  // ---------- Modern Animated HDR Candle Flame Shader ----------
  const candleFlameMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }
    },
    vertexShader: `
      uniform float uTime;
      attribute float aPhase;
      varying vec2 vUv;
      varying float vPhase;
      void main() {
        vUv = uv;
        vPhase = aPhase;
        vec3 pos = position;
        float h = clamp(uv.y, 0.0, 1.0);
        // Multi-frequency turbulent draft flutter
        float flutterX = sin(uTime * 14.0 + aPhase * 9.3) * 0.014
                       + cos(uTime * 27.5 + aPhase * 16.1) * 0.007
                       + sin(uTime * 6.2 + aPhase * 3.7) * 0.020;
        float flutterZ = cos(uTime * 12.5 + aPhase * 8.7) * 0.014
                       + sin(uTime * 24.1 + aPhase * 14.3) * 0.007;
        pos.x += flutterX * h * h;
        pos.z += flutterZ * h * h;
        pos.y += (sin(uTime * 18.0 + aPhase * 11.0) * 0.015 + cos(uTime * 31.0) * 0.007) * h;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vPhase;
      void main() {
        vec2 p = vec2((vUv.x - 0.5) * 2.2, vUv.y);
        float width = mix(0.70, 0.04, pow(clamp(p.y, 0.0, 1.0), 0.80));
        float d = length(vec2(p.x / max(0.06, width), (p.y - 0.36) * 1.18));
        float alpha = smoothstep(0.85, 0.10, d) * smoothstep(0.0, 0.12, p.y) * smoothstep(1.0, 0.70, p.y);
        if (alpha < 0.015) discard;

        // Modern HDR candle flame coloration:
        // Base: vibrant blue reaction zone
        vec3 blueBase = vec3(0.35, 0.85, 2.8);
        // Outer mantle: rich golden-amber
        vec3 amberMantle = vec3(2.4, 0.95, 0.12);
        // Core: radiant incandescent white-gold (produces gorgeous dual-Kawase bloom!)
        vec3 hotCore = vec3(3.4, 2.5, 1.2);

        float coreFactor = smoothstep(0.48, 0.05, d);
        vec3 col = mix(amberMantle, hotCore, coreFactor);
        float blueFactor = smoothstep(0.24, 0.02, p.y) * 0.65;
        col = mix(col, blueBase, blueFactor);

        // Organic micro-flicker
        float fl = 1.0 + 0.12 * sin(uTime * 17.0 + vPhase * 7.1) + 0.06 * cos(uTime * 33.0 + vPhase * 13.0);
        gl_FragColor = vec4(col * alpha * fl, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  // ---------- Modern Atmospheric Candle Corona / Halo Billboard Shader ----------
  const candleCoronaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }
    },
    vertexShader: `
      uniform float uTime;
      attribute float aPhase;
      varying vec2 vUv;
      varying float vPhase;
      void main() {
        vUv = uv;
        vPhase = aPhase;
        // Spherical view-facing billboard centered at the candle flame position
        vec4 mvPos = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float fl = 1.0 + 0.08 * sin(uTime * 14.0 + aPhase * 6.28) + 0.04 * cos(uTime * 29.0);
        mvPos.xy += position.xy * fl;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vPhase;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 > 1.0) discard;
        float r = sqrt(r2);
        float halo = exp(-r * 3.4) * (1.0 - smoothstep(0.68, 1.0, r));
        float fl = 1.0 + 0.15 * sin(uTime * 15.0 + vPhase * 6.28) + 0.08 * cos(uTime * 31.0 + vPhase * 11.5);
        vec3 col = mix(vec3(2.2, 0.95, 0.18), vec3(3.2, 2.1, 0.65), exp(-r * 6.5));
        gl_FragColor = vec4(col * halo * fl * 0.30, halo * fl * 0.30);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  // ---------- Modern Carved Jack-o'-Lantern Internal Fire & SSS Shader ----------
  const pumpkinFireMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vNormal = normalMatrix * normal;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      float hash13p(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.zyx + 31.32);
        return fract((p.x + p.y) * p.z);
      }
      float noise3p(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash13p(i), hash13p(i+vec3(1,0,0)), f.x), mix(hash13p(i+vec3(0,1,0)), hash13p(i+vec3(1,1,0)), f.x), f.y),
          mix(mix(hash13p(i+vec3(0,0,1)), hash13p(i+vec3(1,0,1)), f.x), mix(hash13p(i+vec3(0,1,1)), hash13p(i+vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }
      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewPos);
        float nv = clamp(dot(N, V), 0.0, 1.0);
        // Swirling internal hearth flame turbulence
        vec3 p = vWorldPos * 7.5 + vec3(0.0, -uTime * 3.4, 0.0);
        float f1 = noise3p(p);
        float f2 = noise3p(p * 2.1 + vec3(uTime * 1.3, 0.0, uTime * 0.9));
        float fire = f1 * 0.6 + f2 * 0.4;

        float pulse = 1.0 + 0.22 * sin(uTime * 8.0 + vWorldPos.x * 4.0) + 0.14 * cos(uTime * 15.0);

        // Radiant HDR incandescent core
        vec3 hotCore = vec3(4.8, 3.0, 0.85);
        // Middle fire amber
        vec3 midFire = vec3(2.5, 0.95, 0.12);
        // Translucent SSS edge glow
        vec3 rimGlow = vec3(1.2, 0.25, 0.03);

        vec3 col = mix(midFire, hotCore, smoothstep(0.35, 0.72, fire));
        col = mix(rimGlow, col, smoothstep(0.12, 0.48, nv));
        col *= pulse;

        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  MAT.pumpkinGlow = pumpkinFireMat;

  // ---------- Modern Volumetric Moonbeam God-Ray Shader ----------
  const volumetricBeamMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      tDepth: { value: null },
      uRes: { value: new THREE.Vector2() },
      uNear: { value: 0.15 },
      uFar: { value: 130.0 },
      uCamPos: { value: new THREE.Vector3() },
      uBeamLen: { value: 14.5 },
      uRadiusTop: { value: 0.96 },
      uRadiusBottom: { value: 4.1 },
      uSoftRange: { value: 1.25 },
      uOpacity: { value: 0.65 }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      varying vec3 vLightDir;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vLocalPos = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;

        // Beam propagation direction: slants down and into the room
        vLightDir = normalize((modelMatrix * vec4(0.0, -0.68, 0.73, 0.0)).xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform sampler2D tDepth;
      uniform vec2 uRes;
      uniform float uNear, uFar;
      uniform vec3 uCamPos;
      uniform float uBeamLen, uRadiusTop, uRadiusBottom, uSoftRange, uOpacity;
      varying vec3 vWorldPos;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      varying vec3 vLightDir;
      varying vec2 vUv;

      float hash13v(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.zyx + 31.32);
        return fract((p.x + p.y) * p.z);
      }
      float vn3v(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash13v(i), hash13v(i + vec3(1.0, 0.0, 0.0)), f.x),
              mix(hash13v(i + vec3(0.0, 1.0, 0.0)), hash13v(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
          mix(mix(hash13v(i + vec3(0.0, 0.0, 1.0)), hash13v(i + vec3(1.0, 0.0, 1.0)), f.x),
              mix(hash13v(i + vec3(0.0, 1.0, 1.0)), hash13v(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
          f.z
        );
      }
      float fbm3v(vec3 p) {
        return 0.55 * vn3v(p) + 0.30 * vn3v(p * 2.05 + 7.3) + 0.15 * vn3v(p * 4.12 - 3.7);
      }

      void main() {
        float t = clamp(-vLocalPos.y / max(0.1, uBeamLen), 0.0, 1.0);
        float currentRad = mix(uRadiusTop, uRadiusBottom, t);
        float r = length(vLocalPos.xz) / max(0.01, currentRad);
        if (r > 1.0) discard;

        // 1. Radial cosine soft perimeter attenuation (100% seamless, no mesh edges)
        float radialFade = cos(clamp(r, 0.0, 1.0) * 1.5707963);
        radialFade = pow(radialFade, 1.45);

        // 2. Optical depth distance attenuation along the beam (Beer-Lambert decay)
        float distFade = exp(-t * 1.65) * smoothstep(1.0, 0.85, t) * smoothstep(0.0, 0.035, t);

        // 3. Cornette-Shanks / Mie forward scattering phase function
        vec3 V = normalize(uCamPos - vWorldPos);
        float cosTheta = dot(V, vLightDir);
        float g = 0.58;
        float g2 = g * g;
        float phase = (3.0 * (1.0 - g2) * (1.0 + cosTheta * cosTheta)) /
                      (8.0 * 3.1415926 * (2.0 + g2) * pow(max(0.001, 1.0 + g2 - 2.0 * g * cosTheta), 1.5));

        // 4. Gothic Tracery Cookie / Gobo Light Shafts & Stone Mullion Shadows
        vec2 apertureCoord = vLocalPos.xz / max(0.01, 1.0 + t * 2.8);
        float lancet = sin(apertureCoord.x * 3.1415926 * 2.4);
        float lancetMask = smoothstep(-0.30, 0.45, lancet);
        float transom = abs(fract(apertureCoord.y * 1.6 + 0.5) - 0.5);
        float transomMask = smoothstep(0.08, 0.24, transom);
        float gobo = mix(0.32, 1.18, lancetMask * transomMask);

        // 5. Soft depth buffer intersection (smoothly dissolves into floor, railings & columns)
        vec2 screenUv = gl_FragCoord.xy / uRes;
        float d = texture2D(tDepth, screenUv).x;
        float zScene = (2.0 * uNear * uFar) / (uFar + uNear - (d * 2.0 - 1.0) * (uFar - uNear));
        float zFrag = -vViewPos.z;
        float depthDiff = zScene - zFrag;
        if (depthDiff < -0.05) discard;
        float softDepth = smoothstep(0.0, uSoftRange, depthDiff);

        // 6. Dynamic 3D dust turbulence & sparkling motes
        vec3 np = vWorldPos * 0.75 + vec3(0.0, -uTime * 0.12, 0.0);
        float turb = 0.74 + 0.26 * fbm3v(np);
        float dustMotes = pow(max(0.0, vn3v(vWorldPos * 4.8 + vec3(uTime * 0.12, uTime * 0.16, 0.0)) - 0.60) * 2.5, 3.0);

        // 7. HDR color grading: luminous silver-blue core + cyan-indigo mantle
        vec3 coreCol = vec3(0.70, 0.92, 1.35);
        vec3 mantleCol = vec3(0.35, 0.60, 1.05);
        vec3 beamCol = mix(mantleCol, coreCol, radialFade * (1.0 - t * 0.45));
        beamCol += vec3(1.4, 1.6, 2.0) * dustMotes * 0.75;

        float finalAlpha = clamp(phase * radialFade * distFade * gobo * turb * softDepth * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(beamCol * finalAlpha, finalAlpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  // ---------- Modern Handheld Player Lantern Volumetric Cone Shader ----------
  const volumetricLanternMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      tDepth: { value: null },
      uRes: { value: new THREE.Vector2() },
      uNear: { value: 0.15 },
      uFar: { value: 130.0 },
      uCamPos: { value: new THREE.Vector3() },
      uColor: { value: new THREE.Color(0xffaa44) },
      uOpacity: { value: 0.09 },
      uLength: { value: 11.0 },
      uSoftRange: { value: 0.95 }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vLocalPos = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform sampler2D tDepth;
      uniform vec2 uRes;
      uniform float uNear, uFar;
      uniform vec3 uCamPos;
      uniform vec3 uColor;
      uniform float uOpacity, uLength, uSoftRange;
      varying vec3 vWorldPos;
      varying vec3 vViewPos;
      varying vec3 vLocalPos;
      varying vec2 vUv;

      float hash13l(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.zyx + 31.32);
        return fract((p.x + p.y) * p.z);
      }
      float n3l(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash13l(i), hash13l(i+vec3(1,0,0)), f.x), mix(hash13l(i+vec3(0,1,0)), hash13l(i+vec3(1,1,0)), f.x), f.y),
          mix(mix(hash13l(i+vec3(0,0,1)), hash13l(i+vec3(1,0,1)), f.x), mix(hash13l(i+vec3(0,1,1)), hash13l(i+vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      void main() {
        float t = clamp(-vLocalPos.y / uLength, 0.0, 1.0);
        float currentRad = mix(0.08, 2.7, t);
        float r = length(vLocalPos.xz) / max(0.01, currentRad);
        if (r > 1.0) discard;

        float radialFade = cos(clamp(r, 0.0, 1.0) * 1.5707963);
        radialFade = pow(radialFade, 1.4);

        float distFade = exp(-t * 1.9) * smoothstep(1.0, 0.85, t) * smoothstep(0.0, 0.03, t);

        // Soft depth buffer intersection
        vec2 su = gl_FragCoord.xy / uRes;
        float d = texture2D(tDepth, su).x;
        float zScene = (2.0 * uNear * uFar) / (uFar + uNear - (d * 2.0 - 1.0) * (uFar - uNear));
        float zFrag = -vViewPos.z;
        float diff = zScene - zFrag;
        if (diff < -0.04) discard;
        float softFade = smoothstep(0.0, uSoftRange, diff);

        // Dust motes drifting in lantern beam
        float dust = pow(max(0.0, n3l(vWorldPos * 5.0 + vec3(uTime * 0.1, uTime * 0.15, 0.0)) - 0.62) * 2.6, 2.5);

        float alpha = clamp(radialFade * distFade * softFade * uOpacity * (1.0 + dust * 0.6), 0.0, 1.0);
        gl_FragColor = vec4(uColor * alpha, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const lanternBeamGeo = new THREE.CylinderGeometry(0.08, 2.7, 11.0, 24, 16, true);
  lanternBeamGeo.translate(0, -5.5, 0);
  const playerLanternBeam = new THREE.Mesh(lanternBeamGeo, volumetricLanternMat);
  playerLanternBeam.frustumCulled = false;
  playerLanternBeam.visible = false;
  if (window.HH.registerVolumetricBeam) {
    window.HH.registerVolumetricBeam(playerLanternBeam, 'player');
  }
  window.HH.playerLanternBeam = playerLanternBeam;

  // ---------- Custom Spectral Ghost Shader ----------
  function createGhostMaterial(baseColorHex = 0x62c4f0) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(baseColorHex) },
        uOpacity: { value: 0.76 },
        uAgitation: { value: 0.0 }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uAgitation;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec2 vUv;
        varying float vHeight;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float lowerFactor = clamp(1.0 - (pos.y + 0.2) / 2.2, 0.0, 1.0);
          float speed = 2.8 + uAgitation * 7.0;
          float waveX = sin(uTime * speed + pos.y * 4.5 + pos.z * 3.0) * (0.055 + 0.13 * lowerFactor);
          float waveZ = cos(uTime * (speed * 0.85) + pos.y * 3.8 + pos.x * 3.0) * (0.055 + 0.13 * lowerFactor);
          pos.x += waveX * (1.0 + uAgitation * 0.6);
          pos.z += waveZ * (1.0 + uAgitation * 0.6);
          vHeight = pos.y;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          vViewPosition = -mvPosition.xyz;
          vNormal = normalMatrix * normal;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uAgitation;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec2 vUv;
        varying float vHeight;
        float h21(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
        float vn(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y);
        }
        float fbm2(vec2 p) { return 0.5 * vn(p) + 0.25 * vn(p * 2.03) + 0.125 * vn(p * 4.1) + 0.0625 * vn(p * 8.3); }
        void main() {
          vec3 n = normalize(vNormal);
          if (!gl_FrontFacing) n = -n;
          vec3 v = normalize(vViewPosition);
          float ndv = clamp(abs(dot(n, v)), 0.0, 1.0);
          float fresnel = pow(1.0 - ndv, 2.2);

          // Drifting ectoplasm: flowing wisps of fabric, thin translucent core, bright limb-lit edges
          vec2 flow = vec2(vUv.x * 9.0, vHeight * 2.2 - uTime * (0.55 + uAgitation * 1.4));
          float wisp = fbm2(flow + vec2(0.0, fbm2(flow * 0.7 + uTime * 0.2) * 1.6));
          float pleats = 0.55 + 0.45 * sin(vUv.x * 56.0 + wisp * 5.0 + sin(vHeight * 4.5 - uTime * 2.0) * 1.2);

          // Ragged, dissolving hem that fades into the air
          float hem = smoothstep(0.0, 1.25, vHeight + 0.05 + wisp * 0.55);
          float tatter = smoothstep(0.30, 0.62, wisp + hem * 0.55);

          vec3 deepFold = vec3(0.04, 0.13, 0.24);
          vec3 rimGlow = mix(uColor, vec3(0.85, 0.97, 1.15), 0.5 + uAgitation * 0.35);
          vec3 col = mix(deepFold, rimGlow, clamp(fresnel * 0.9 + pleats * 0.18 + wisp * 0.25, 0.0, 1.0));
          col += vec3(0.25, 0.55, 0.8) * fresnel * fresnel * 0.9;

          float alpha = (0.14 + fresnel * 0.62 + wisp * 0.16) * (0.80 + 0.20 * pleats) * uOpacity * tatter;
          alpha *= mix(0.25, 1.0, hem);
          if (alpha < 0.012) discard;
          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.85));
        }
      `,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  // ---------- Multi-Layered Volumetric Floor Fog Cluster Shader ----------
  const FOG_LIGHT_COUNT = 8;
  const floorFogMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLightPos: { value: Array.from({ length: FOG_LIGHT_COUNT }, () => new THREE.Vector4(0, -100, 0, 1)) },
      uLightCol: { value: Array.from({ length: FOG_LIGHT_COUNT }, () => new THREE.Vector3(0, 0, 0)) }
    },
    vertexShader: `
      uniform float uTime;
      attribute float aLayer;
      attribute float aSeed;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vLayer;
      varying float vSeed;
      varying float vViewDist;
      void main() {
        vUv = uv;
        vLayer = aLayer;
        vSeed = aSeed;
        vec3 pos = position;
        // 3D billowing undulation across each stratum of the fog cluster
        float wave1 = sin(uTime * 1.35 + pos.x * 1.45 + aSeed * 6.283) * 0.048;
        float wave2 = cos(uTime * 1.05 + pos.z * 1.65 - aSeed * 4.12) * 0.042;
        pos.y += (wave1 + wave2) * (0.55 + aLayer * 0.85);

        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        vec4 mvPos = viewMatrix * worldPos;
        vViewDist = length(mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec4 uLightPos[8];
      uniform vec3 uLightCol[8];
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying float vLayer;
      varying float vSeed;
      varying float vViewDist;

      float h21(vec2 p) {
        p = fract(p * vec2(233.34, 851.73));
        p += dot(p, p + 23.45);
        return fract(p.x * p.y);
      }
      float vn(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
          mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }
      float fbm3(vec2 p) {
        return 0.533 * vn(p) + 0.267 * vn(p * 2.07 + 13.7) + 0.133 * vn(p * 4.19 - 7.3) + 0.067 * vn(p * 8.11);
      }

      void main() {
        vec2 centered = vUv * 2.0 - 1.0;
        float r2 = dot(centered, centered);
        if (r2 > 1.0) discard;

        // Stratified flow velocity: lower layers creep steadily, upper plumes swirl faster
        float speed = 0.36 + vLayer * 0.28;
        vec2 flowOffset = vec2(
          sin(uTime * 0.25 + vSeed * 6.28) * 0.35,
          uTime * speed
        );
        vec2 wp = vWorldPos.xz * 0.42 + vec2(vSeed * 7.1, vLayer * 3.7);

        // Domain-warped FBM turbulence for rolling, curling vapor tendrils
        vec2 warp = vec2(
          fbm3(wp * 0.9 + flowOffset * 0.65),
          fbm3(wp * 0.9 - flowOffset * 0.55 + vec2(5.2, 1.3))
        );
        float vapor = fbm3(wp * 1.45 + (warp - 0.5) * 1.85 + flowOffset);
        float fineTendril = fbm3(wp * 3.1 - (warp - 0.5) * 1.3 + flowOffset * 1.35);

        // Multi-lobed organic cluster silhouette
        float rad = sqrt(r2);
        float lobeWarp = (warp.x - 0.5) * 0.34 + (vapor - 0.5) * 0.24;
        float clusterMask = smoothstep(0.98, 0.18, rad + lobeWarp);

        // Lower strata form a dense ground-hugging blanket; upper strata form wispy billowing curls
        float threshold = mix(0.22, 0.42, vLayer);
        float billow = smoothstep(threshold, 0.84, vapor * 0.68 + fineTendril * 0.32);
        float density = clusterMask * billow;

        float distFade = smoothstep(0.55, 2.1, vViewDist) * (1.0 - smoothstep(26.0, 44.0, vViewDist));
        float layerOpacity = mix(0.22, 0.12, vLayer);
        float alpha = clamp(density * layerOpacity * distFade, 0.0, 0.42);
        if (alpha < 0.008) discard;

        // Volumetric scattering from nearby candle & fire lights with believable inverse-square falloff
        vec3 baseColdMist = mix(vec3(0.030, 0.022, 0.030), vec3(0.046, 0.040, 0.062), vLayer);
        vec3 lightScatter = vec3(0.0);
        for (int i = 0; i < 8; i++) {
          vec3 lPos = uLightPos[i].xyz;
          float lCutoff = uLightPos[i].w;
          vec3 dVec = lPos - vWorldPos;
          float d = length(dVec);
          if (d < lCutoff) {
            float dNorm = d / max(lCutoff, 0.1);
            float win = max(0.0, 1.0 - dNorm * dNorm);
            win = win * win;
            float invSq = 1.0 / (1.0 + 0.45 * d + 0.32 * d * d);
            // Warm vs. Cold Mie scattering inside the vapor cloud with forward directional phase
            vec3 warmShift = mix(vec3(1.24, 1.02, 0.76), vec3(1.02, 0.54, 0.22), smoothstep(0.4, 5.5, d));
            vec3 coldShift = mix(vec3(1.05, 1.18, 1.32), vec3(0.52, 0.76, 1.18), smoothstep(0.4, 5.5, d));
            vec3 tempShift = (uLightCol[i].r >= uLightCol[i].b) ? warmShift : coldShift;
            // Enhanced forward scattering when fog is between light and camera
            vec3 lightDir = normalize(dVec);
            float forwardScat = 1.0 + 0.45 * max(0.0, dot(normalize(-vWorldPos), lightDir));
            lightScatter += uLightCol[i] * tempShift * (invSq * win * 0.50 * forwardScat);
          }
        }

        // Upper wisps catch slightly more warm candlelight; deeper pockets retain rich shadow contrast
        vec3 fogColor = baseColdMist + lightScatter * (0.55 + 0.45 * vapor) * (0.75 + 0.35 * vLayer);
        gl_FragColor = vec4(fogColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  window.HH.TEX = TEX;
  window.HH.MAT = MAT;
  window.HH.candleFlameMat = candleFlameMat;
  window.HH.candleCoronaMat = candleCoronaMat;
  window.HH.pumpkinFireMat = pumpkinFireMat;
  window.HH.volumetricBeamMat = volumetricBeamMat;
  window.HH.volumetricLanternMat = volumetricLanternMat;
  window.HH.floorFogMat = floorFogMat;
  window.HH.createGhostMaterial = createGhostMaterial;
})();
