import * as THREE from 'three';
import { DECK_MIN_X, DECK_MAX_X, DECK_MIN_Z, DECK_MAX_Z } from './config.js';

// Utility: Convert a greyscale height canvas into a Tangent-Space RGB Normal Map Texture
export function heightCanvasToNormalTex(heightCanvas, strength = 2.6, repeatS = 1, repeatT = 1, maxAniso = 4) {
    const w = heightCanvas.width;
    const h = heightCanvas.height;
    const srcCtx = heightCanvas.getContext('2d');
    const srcData = srcCtx.getImageData(0, 0, w, h).data;

    const normCanvas = document.createElement('canvas');
    normCanvas.width = w;
    normCanvas.height = h;
    const nCtx = normCanvas.getContext('2d');
    const nImg = nCtx.createImageData(w, h);
    const dst = nImg.data;

    const sampleH = (x, y) => {
        const cx = (x + w) % w;
        const cy = Math.max(0, Math.min(h - 1, y));
        return srcData[(cy * w + cx) * 4] / 255.0;
    };

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const hL = sampleH(x - 1, y);
            const hR = sampleH(x + 1, y);
            const hU = sampleH(x, y - 1);
            const hD = sampleH(x, y + 1);

            let dx = (hL - hR) * strength;
            let dy = (hU - hD) * strength;
            let dz = 1.0;
            const invLen = 1.0 / Math.sqrt(dx * dx + dy * dy + dz * dz);
            dx *= invLen;
            dy *= invLen;
            dz *= invLen;

            const idx = (y * w + x) * 4;
            dst[idx]     = Math.round((dx * 0.5 + 0.5) * 255);
            dst[idx + 1] = Math.round((dy * 0.5 + 0.5) * 255);
            dst[idx + 2] = Math.round((dz * 0.5 + 0.5) * 255);
            dst[idx + 3] = 255;
        }
    }
    nCtx.putImageData(nImg, 0, 0);

    const normalTex = new THREE.CanvasTexture(normCanvas);
    normalTex.anisotropy = maxAniso;
    if (repeatS > 1 || repeatT > 1) {
        normalTex.wrapS = THREE.RepeatWrapping;
        normalTex.wrapT = THREE.RepeatWrapping;
        normalTex.repeat.set(repeatS, repeatT);
    }
    normalTex.needsUpdate = true;
    return normalTex;
}

// Procedural Aircraft Fuselage & Wing Panel-Line Diffuse + Tangent Normal Map
export function createAircraftSurfaceMaps(baseHex = '#b8c2ce', seamAlpha = 0.28, maxAniso = 4) {
    const size = 512;
    const cCanvas = document.createElement('canvas');
    cCanvas.width = size;
    cCanvas.height = size;
    const cCtx = cCanvas.getContext('2d');

    const hCanvas = document.createElement('canvas');
    hCanvas.width = size;
    hCanvas.height = size;
    const hCtx = hCanvas.getContext('2d');

    cCtx.fillStyle = baseHex;
    cCtx.fillRect(0, 0, size, size);

    hCtx.fillStyle = '#808080';
    hCtx.fillRect(0, 0, size, size);

    // Subtle tonal airframe panel variations & access hatches
    for (let y = 0; y < size; y += 64) {
        for (let x = 0; x < size; x += 64) {
            const shade = ((x + y) % 128 === 0) ? 'rgba(255,255,255,0.045)' : 'rgba(15,23,42,0.035)';
            cCtx.fillStyle = shade;
            cCtx.fillRect(x + 2, y + 2, 60, 60);

            hCtx.fillStyle = ((x + y) % 128 === 0) ? '#868686' : '#7a7a7a';
            hCtx.fillRect(x + 2, y + 2, 60, 60);

            // Recessed panel seam lines
            cCtx.strokeStyle = `rgba(30, 41, 59, ${seamAlpha})`;
            cCtx.lineWidth = 1.5;
            cCtx.strokeRect(x, y, 64, 64);

            hCtx.strokeStyle = '#525252';
            hCtx.lineWidth = 2.0;
            hCtx.strokeRect(x, y, 64, 64);

            // Rivet dots along panel perimeter
            cCtx.fillStyle = `rgba(30, 41, 59, ${seamAlpha * 0.75})`;
            hCtx.fillStyle = '#606060';
            for (let r = 8; r < 60; r += 12) {
                cCtx.fillRect(x + r, y + 4, 1.5, 1.5);
                cCtx.fillRect(x + 4, y + r, 1.5, 1.5);
                hCtx.fillRect(x + r, y + 4, 2, 2);
                hCtx.fillRect(x + 4, y + r, 2, 2);
            }
        }
    }

    // Subtle aerodynamic airflow streaks
    for (let i = 0; i < 65; i++) {
        const sx = Math.random() * size;
        const sy = Math.random() * size;
        cCtx.fillStyle = (i % 2 === 0) ? 'rgba(255,255,255,0.03)' : 'rgba(30,41,59,0.035)';
        cCtx.fillRect(sx, sy, 3 + Math.random() * 6, 40 + Math.random() * 85);
    }

    const colorTex = new THREE.CanvasTexture(cCanvas);
    colorTex.wrapS = THREE.RepeatWrapping;
    colorTex.wrapT = THREE.RepeatWrapping;
    colorTex.repeat.set(2, 2);
    colorTex.anisotropy = maxAniso;
    colorTex.colorSpace = THREE.SRGBColorSpace;

    const normalTex = heightCanvasToNormalTex(hCanvas, 1.9, 2, 2, maxAniso);
    return { colorTex, normalTex };
}

// Low-visibility tactical national insignia
export function createUSNavyInsigniaTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 256, 128);

    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(128, 64, 46, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(20, 48, 216, 32);

    ctx.fillStyle = '#475569';
    ctx.fillRect(20, 58, 216, 12);

    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(128, 64, 44, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const aOuter = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const aInner = aOuter + Math.PI / 5;
        const rOuter = 38;
        const rInner = 15;
        const ox = 128 + Math.cos(aOuter) * rOuter;
        const oy = 64 + Math.sin(aOuter) * rOuter;
        const ix = 128 + Math.cos(aInner) * rInner;
        const iy = 64 + Math.sin(aInner) * rInner;
        if (i === 0) ctx.moveTo(ox, oy);
        else ctx.lineTo(ox, oy);
        ctx.lineTo(ix, iy);
    }
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// Procedural Flight Deck High-Resolution Maps
export function createFlightDeckMaps(maxAniso = 4) {
    const width = 2048;
    const height = 4096;

    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = width;
    colorCanvas.height = height;
    const ctx = colorCanvas.getContext('2d');

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = width;
    bumpCanvas.height = height;
    const bCtx = bumpCanvas.getContext('2d');

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = width;
    roughCanvas.height = height;
    const rCtx = roughCanvas.getContext('2d');

    const toPx = (x) => ((x - DECK_MIN_X) / (DECK_MAX_X - DECK_MIN_X)) * width;
    const toPy = (z) => (1.0 - (z - DECK_MIN_Z) / (DECK_MAX_Z - DECK_MIN_Z)) * height;

    // 1. Authentic US Navy Battleship Charcoal Slate Non-Skid Base Coat (#545d67) matching photo
    ctx.fillStyle = '#545d67';
    ctx.fillRect(0, 0, width, height);

    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, width, height);

    rCtx.fillStyle = '#e2e2e2'; // High base roughness for matte non-skid
    rCtx.fillRect(0, 0, width, height);

    // Subtle directional daylight tonal zones across the deck matching aerial photograph
    const wearZones = [
        { x: -1, z: 75,   r: 1150, c1: 'rgba(120, 130, 142, 0.22)', c2: 'rgba(84, 93, 103, 0.0)' },
        { x:  8, z: -25,  r: 1050, c1: 'rgba(122, 132, 144, 0.20)', c2: 'rgba(84, 93, 103, 0.0)' },
        { x: -18, z: 25,  r: 760,  c1: 'rgba(72, 80, 90, 0.20)',   c2: 'rgba(84, 93, 103, 0.0)' },
        { x:  2, z: -115, r: 880,  c1: 'rgba(118, 128, 138, 0.18)', c2: 'rgba(84, 93, 103, 0.0)' }
    ];
    wearZones.forEach(wz => {
        const g = ctx.createRadialGradient(toPx(wz.x), toPy(wz.z), 40, toPx(wz.x), toPy(wz.z), wz.r);
        g.addColorStop(0.0, wz.c1);
        g.addColorStop(1.0, wz.c2);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
    });

    // Longitudinal non-skid application strips
    for (let x = 0; x < width; x += 12) {
        const stripTone = (x % 24 === 0) ? 'rgba(240, 245, 250, 0.055)' : 'rgba(55, 62, 70, 0.038)';
        ctx.fillStyle = stripTone;
        ctx.fillRect(x, 0, 6, height);
        bCtx.fillStyle = (x % 24 === 0) ? '#888888' : '#747474';
        bCtx.fillRect(x, 0, 4, height);
    }

    // Longitudinal wear streaks along the bow catapult tracks & central taxi corridor
    for (let s = 0; s < 160; s++) {
        const sx = toPx(-28 + Math.random() * 60);
        const sy = Math.random() * height;
        const sLen = 140 + Math.random() * 520;
        const sW = 3 + Math.random() * 14;
        const isLight = Math.random() > 0.42;
        ctx.fillStyle = isLight ? 'rgba(235, 240, 246, 0.075)' : 'rgba(65, 72, 80, 0.048)';
        ctx.fillRect(sx, sy, sW, sLen);
    }

    // Welded steel deck plating seam grid
    for (let gx = -38; gx <= 42; gx += 3.2) {
        const px = toPx(gx);
        ctx.strokeStyle = 'rgba(58, 65, 74, 0.20)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, height); ctx.stroke();
        bCtx.strokeStyle = '#626262';
        bCtx.beginPath(); bCtx.moveTo(px, 0); bCtx.lineTo(px, height); bCtx.stroke();
    }
    for (let gz = -150; gz <= 150; gz += 8.0) {
        const py = toPy(gz);
        const isExpJoint = Math.abs(gz % 32) < 1.0;
        ctx.strokeStyle = isExpJoint ? 'rgba(48, 54, 62, 0.36)' : 'rgba(62, 68, 78, 0.16)';
        ctx.lineWidth = isExpJoint ? 2.6 : 1.1;
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(width, py); ctx.stroke();

        bCtx.strokeStyle = isExpJoint ? '#424242' : '#686868';
        bCtx.lineWidth = isExpJoint ? 2.8 : 1.1;
        bCtx.beginPath(); bCtx.moveTo(0, py); bCtx.lineTo(width, py); bCtx.stroke();
    }

    // Fine aggregate non-skid grit stipple
    for (let i = 0; i < 115000; i++) {
        const rx = Math.random() * width;
        const ry = Math.random() * height;
        const isLight = Math.random() > 0.45;
        ctx.fillStyle = isLight ? 'rgba(241, 245, 249, 0.068)' : 'rgba(50, 56, 64, 0.048)';
        ctx.fillRect(rx, ry, 2 + Math.random() * 2, 2 + Math.random() * 4);
        bCtx.fillStyle = isLight ? '#989898' : '#646464';
        bCtx.fillRect(rx, ry, 2, 2);
    }

    // 2. Authentic Rusty-Tan / Burnt-Umber JBD & Blast-Resistant Deck Patches
    function drawWeatheredBlastPatch(xM, zM, wM, lM, rotRad = 0) {
        const px = toPx(xM);
        const py = toPy(zM);
        const pw = (wM / (DECK_MAX_X - DECK_MIN_X)) * width;
        const pl = (lM / (DECK_MAX_Z - DECK_MIN_Z)) * height;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-rotRad);

        ctx.fillStyle = 'rgba(126, 88, 58, 0.88)';
        ctx.fillRect(-pw * 0.5, -pl * 0.5, pw, pl);

        ctx.fillStyle = 'rgba(96, 64, 40, 0.76)';
        ctx.fillRect(-pw * 0.42, -pl * 0.42, pw * 0.84, pl * 0.84);

        ctx.strokeStyle = 'rgba(224, 185, 112, 0.88)';
        ctx.lineWidth = 3.6;
        ctx.strokeRect(-pw * 0.5, -pl * 0.5, pw, pl);

        ctx.strokeStyle = 'rgba(52, 38, 26, 0.48)';
        ctx.lineWidth = 1.8;
        for (let r = -pw * 0.35; r <= pw * 0.35; r += pw * 0.23) {
            ctx.beginPath();
            ctx.moveTo(r, -pl * 0.5);
            ctx.lineTo(r,  pl * 0.5);
            ctx.stroke();
        }
        ctx.restore();

        rCtx.save();
        rCtx.translate(px, py);
        rCtx.rotate(-rotRad);
        rCtx.fillStyle = '#909090';
        rCtx.fillRect(-pw * 0.5, -pl * 0.5, pw, pl);
        rCtx.restore();
    }

    drawWeatheredBlastPatch(-12.5,  32.0, 7.6, 10.5, 0.02);
    drawWeatheredBlastPatch( -3.5,  26.0, 7.2,  9.8, 0.02);
    drawWeatheredBlastPatch(-11.8,  14.0, 7.4,  9.5, 0.02);
    drawWeatheredBlastPatch( 22.0, -48.0, 6.8,  9.2, -0.16);
    drawWeatheredBlastPatch( 31.5, -56.0, 6.5,  8.8, -0.16);

    // Subtle dark oil/exhaust stains under parked aircraft positions
    function drawOilStain(xM, zM, radPx = 38) {
        const px = toPx(xM);
        const py = toPy(zM);
        const g = ctx.createRadialGradient(px, py, 4, px, py, radPx);
        g.addColorStop(0.0, 'rgba(38, 42, 48, 0.28)');
        g.addColorStop(0.6, 'rgba(52, 58, 66, 0.13)');
        g.addColorStop(1.0, 'rgba(70, 76, 84, 0.0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, radPx, 0, Math.PI * 2);
        ctx.fill();
    }
    for (let z = -135; z <= 135; z += 11) {
        drawOilStain(-26 + (Math.random() - 0.5) * 6, z, 30 + Math.random() * 18);
    }

    // 3. Cruciform Tie-Down Pad-Eyes
    for (let gz = -148; gz <= 148; gz += 4.5) {
        const rowOffset = (Math.abs(Math.round(gz / 4.5)) % 2) * 2.25;
        for (let gx = -35 + rowOffset; gx <= 39; gx += 4.5) {
            const px = toPx(gx);
            const py = toPy(gz);
            if (px > 70 && px < width - 70 && py > 65 && py < height - 65) {
                ctx.fillStyle = 'rgba(54, 60, 68, 0.45)';
                ctx.fillRect(px - 2.2, py - 2.2, 4.4, 4.4);
                ctx.fillStyle = 'rgba(220, 228, 236, 0.52)';
                ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
                bCtx.fillStyle = '#484848';
                bCtx.fillRect(px - 2.0, py - 2.0, 4.0, 4.0);
            }
        }
    }

    // 4. Angled Landing Runway with Authentic Dark Tire Rubber Accumulation
    const rStartX = toPx(-4.5), rStartY = toPy(-152);
    const rEndX   = toPx(36.5),  rEndY   = toPy(42);
    const rAngle  = Math.atan2(rEndY - rStartY, rEndX - rStartX);
    const rLen    = Math.hypot(rEndX - rStartX, rEndY - rStartY);

    ctx.save();
    ctx.translate(rStartX, rStartY);
    ctx.rotate(rAngle);

    const trapGrad = ctx.createLinearGradient(0, 0, rLen, 0);
    trapGrad.addColorStop(0.0,  'rgba(140, 148, 158, 0.12)');
    trapGrad.addColorStop(0.12, 'rgba(18, 22, 26, 0.62)');    // Dense tire rubber touchdown zone
    trapGrad.addColorStop(0.32, 'rgba(26, 31, 38, 0.52)');
    trapGrad.addColorStop(0.60, 'rgba(38, 44, 52, 0.28)');
    trapGrad.addColorStop(1.0,  'rgba(130, 138, 148, 0.10)');
    ctx.fillStyle = trapGrad;
    ctx.fillRect(0, -210, rLen, 420);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, -216, rLen * 0.97, 16);
    ctx.fillRect(0,  200, rLen * 0.97, 16);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillRect(40, -190, rLen * 0.92, 8);
    ctx.fillRect(40,  182, rLen * 0.92, 8);

    for (let d = 70; d < rLen - 45; d += 125) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(d, -9, 72, 18);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(d + 72, -5, 24, 10);
    }

    for (let s = 0; s < 420; s++) {
        const sProgress = 0.06 + Math.random() * 0.76;
        const sx = sProgress * rLen;
        const spread = (sProgress < 0.45) ? 235 : 170;
        const sy = (Math.random() - 0.5) * spread;
        const sLen = 65 + Math.random() * 260;
        const sThick = 1.6 + Math.random() * 4.2;

        ctx.fillStyle = (s % 5 === 0) ? 'rgba(235, 240, 246, 0.10)' : 'rgba(24, 28, 34, 0.22)';
        ctx.fillRect(sx, sy, sLen, sThick);

        bCtx.save();
        bCtx.translate(rStartX, rStartY);
        bCtx.rotate(rAngle);
        bCtx.fillStyle = '#5e5e5e';
        bCtx.fillRect(sx, sy, sLen, sThick);
        bCtx.restore();
    }
    ctx.restore();

    // Red-and-White safety foul line
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(toPx(-15.5), toPy(-150));
    ctx.lineTo(toPx(-1.0),  toPy(-32));
    ctx.lineTo(toPx(15.5),  toPy(46));
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#dc2626';
    ctx.stroke();
    ctx.setLineDash([32, 32]);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // White inner foul-line border strip
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(toPx(-14.2), toPy(-150));
    ctx.lineTo(toPx( 0.2),  toPy(-32));
    ctx.lineTo(toPx(16.7),  toPy(46));
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();

    // 5. Four EMALS Catapult Tracks
    function drawCatapultTrack(x1, z1, x2, z2) {
        const p1x = toPx(x1), p1y = toPy(z1);
        const p2x = toPx(x2), p2y = toPy(z2);
        ctx.save();

        ctx.beginPath();
        ctx.moveTo(p1x, p1y); ctx.lineTo(p2x, p2y);
        ctx.lineWidth = 44;
        ctx.strokeStyle = 'rgba(175, 182, 192, 0.22)';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p1x - 14, p1y); ctx.lineTo(p2x - 14, p2y);
        ctx.moveTo(p1x + 14, p1y); ctx.lineTo(p2x + 14, p2y);
        ctx.lineWidth = 4.2;
        ctx.strokeStyle = 'rgba(248, 250, 252, 0.78)';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p1x, p1y); ctx.lineTo(p2x, p2y);
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#1e2228';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p1x, p1y); ctx.lineTo(p2x, p2y);
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = '#cbd5e1';
        ctx.stroke();
        ctx.restore();

        bCtx.save();
        bCtx.beginPath();
        bCtx.moveTo(p1x, p1y); bCtx.lineTo(p2x, p2y);
        bCtx.lineWidth = 12;
        bCtx.strokeStyle = '#303030';
        bCtx.stroke();
        bCtx.restore();

        rCtx.save();
        rCtx.beginPath();
        rCtx.moveTo(p1x, p1y); rCtx.lineTo(p2x, p2y);
        rCtx.lineWidth = 14;
        rCtx.strokeStyle = '#555555';
        rCtx.stroke();
        rCtx.restore();
    }

    drawCatapultTrack(-7.5, 48, -6.5, 148);
    drawCatapultTrack( 8.5, 42,  7.5, 148);
    drawCatapultTrack(16.0, -55, 25.5, 42);
    drawCatapultTrack(26.5, -65, 36.5, 28);

    // 6. Bow "78" Hull Number Stencil
    function drawBowHullNumber(x, z) {
        const px = toPx(x);
        const py = toPy(z);
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(0.92, -1.65);
        ctx.font = '800 220px "JetBrains Mono", "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.lineWidth = 7;
        ctx.strokeStyle = 'rgba(30, 35, 42, 0.78)';
        ctx.strokeText('78', 0, 0);

        ctx.fillStyle = 'rgba(248, 250, 252, 0.92)';
        ctx.fillText('78', 0, 0);
        ctx.restore();

        for (let i = 0; i < 32; i++) {
            const sx = px + (Math.random() - 0.5) * 240;
            const sy = py - 140 + Math.random() * 280;
            ctx.fillStyle = 'rgba(72, 78, 86, 0.32)';
            ctx.fillRect(sx, sy, 3 + Math.random() * 6, 40 + Math.random() * 90);
        }
    }
    drawBowHullNumber(0.5, 136.5);

    // Deck-Edge Elevator safety perimeter
    function drawElevatorOutline(x, z, wM, lM) {
        const px = toPx(x);
        const py = toPy(z);
        const pw = (wM / (DECK_MAX_X - DECK_MIN_X)) * width;
        const pl = (lM / (DECK_MAX_Z - DECK_MIN_Z)) * height;
        ctx.save();
        ctx.translate(px, py);
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.82)';
        ctx.lineWidth = 5;
        ctx.setLineDash([14, 14]);
        ctx.strokeRect(-pw * 0.5, -pl * 0.5, pw, pl);
        ctx.restore();
    }
    drawElevatorOutline(-36.2, 22, 5.2, 15.5);
    drawElevatorOutline(-36.2, -18, 5.2, 15.5);
    drawElevatorOutline(-33.2, -92, 5.2, 15.5);
    drawElevatorOutline(33.2, -65, 5.2, 15.5);

    // Yellow marshaling line
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(toPx(-5.5), toPy(-78));
    ctx.lineTo(toPx(-4.5), toPy(48));
    ctx.lineWidth = 5.0;
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.72)';
    ctx.stroke();
    ctx.restore();

    // Bow & Stern rim lines
    ctx.save();
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.90)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(toPx(-17.5), toPy(152.8));
    ctx.lineTo(toPx( 17.5), toPy(152.8));
    ctx.moveTo(toPx(-22.5), toPy(-151.2));
    ctx.lineTo(toPx( 26.5), toPy(-151.2));
    ctx.stroke();
    ctx.restore();

    const colorTex = new THREE.CanvasTexture(colorCanvas);
    colorTex.anisotropy = maxAniso;
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.needsUpdate = true;

    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    bumpTex.anisotropy = maxAniso;
    bumpTex.needsUpdate = true;

    const roughTex = new THREE.CanvasTexture(roughCanvas);
    roughTex.anisotropy = maxAniso;
    roughTex.needsUpdate = true;

    const normalTex = heightCanvasToNormalTex(bumpCanvas, 2.8, 1, 1, maxAniso);
    return { colorTex, bumpTex, roughTex, normalTex };
}

// Procedural Naval Steel Hull Texture
export function createNavalSteelHullTexture(maxAniso = 4) {
    const cCanvas = document.createElement('canvas');
    cCanvas.width = 1024;
    cCanvas.height = 512;
    const ctx = cCanvas.getContext('2d');

    const bCanvas = document.createElement('canvas');
    bCanvas.width = 1024;
    bCanvas.height = 512;
    const bCtx = bCanvas.getContext('2d');

    ctx.fillStyle = '#b8c2ce';
    ctx.fillRect(0, 0, 1024, 512);

    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, 1024, 512);

    for (let y = 0; y < 512; y += 32) {
        ctx.fillStyle = (y % 64 === 0) ? 'rgba(255,255,255,0.08)' : 'rgba(30,41,59,0.038)';
        ctx.fillRect(0, y, 1024, 16);

        ctx.strokeStyle = 'rgba(45, 55, 72, 0.26)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();

        bCtx.strokeStyle = '#525252';
        bCtx.lineWidth = 2.2;
        bCtx.beginPath(); bCtx.moveTo(0, y); bCtx.lineTo(1024, y); bCtx.stroke();

        const offset = (y / 32) % 2 === 0 ? 0 : 32;
        for (let x = offset; x < 1024; x += 64) {
            ctx.strokeStyle = 'rgba(45, 55, 72, 0.22)';
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 32); ctx.stroke();

            bCtx.strokeStyle = '#5a5a5a';
            bCtx.beginPath(); bCtx.moveTo(x, y); bCtx.lineTo(x, y + 32); bCtx.stroke();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.065)';
            ctx.fillRect(x + 6, y + 4, 52, 24);
            bCtx.fillStyle = '#8e8e8e';
            bCtx.fillRect(x + 6, y + 4, 52, 24);
        }
    }

    for (let i = 0; i < 180; i++) {
        const sx = Math.random() * 1024;
        const sy = Math.random() * 380;
        const sh = 40 + Math.random() * 130;
        const grad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
        const isSalt = Math.random() > 0.42;
        grad.addColorStop(0, isSalt ? 'rgba(248,250,252,0.16)' : 'rgba(51,65,85,0.12)');
        grad.addColorStop(1, 'rgba(184,194,206,0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx, sy, 2 + Math.random() * 4, sh);
    }

    for (let x = 24; x < 1024; x += 48) {
        ctx.fillStyle = '#475569';
        ctx.fillRect(x, 82, 8, 5);
        ctx.fillRect(x + 20, 146, 6, 6);
        bCtx.fillStyle = '#383838';
        bCtx.fillRect(x, 82, 8, 5);
    }

    const colorTex = new THREE.CanvasTexture(cCanvas);
    colorTex.wrapS = THREE.RepeatWrapping;
    colorTex.wrapT = THREE.RepeatWrapping;
    colorTex.repeat.set(4, 2);
    colorTex.anisotropy = maxAniso;
    colorTex.colorSpace = THREE.SRGBColorSpace;

    const bumpTex = new THREE.CanvasTexture(bCanvas);
    bumpTex.wrapS = THREE.RepeatWrapping;
    bumpTex.wrapT = THREE.RepeatWrapping;
    bumpTex.repeat.set(4, 2);
    bumpTex.anisotropy = maxAniso;

    const normalTex = heightCanvasToNormalTex(bCanvas, 2.4, 4, 2, maxAniso);
    return { colorTex, bumpTex, normalTex };
}

// Island Starboard Face Stencil "78"
export function createIslandNumberTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#bcc6d2';
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = 'rgba(45, 55, 72, 0.22)';
    ctx.lineWidth = 2.0;
    for (let y = 24; y < 512; y += 36) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
    }
    for (let x = 32; x < 512; x += 64) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
    }

    ctx.font = '900 245px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#1e293b';
    ctx.fillText('78', 266, 292);

    ctx.fillStyle = '#ffffff';
    ctx.fillText('78', 256, 282);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// American Flag Texture
export function createUSFlagTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 144;
    const ctx = canvas.getContext('2d');
    const sh = canvas.height / 13;
    for (let i = 0; i < 13; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#dc2626' : '#ffffff';
        ctx.fillRect(0, i * sh, canvas.width, sh);
    }
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, 0, canvas.width * 0.42, sh * 7);
    ctx.fillStyle = '#ffffff';
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 6; c++) {
            ctx.fillRect(8 + c * 16, 6 + r * 13, 4, 4);
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// E-2D Hawkeye Saucer Rotodome Texture
export function createRotodomeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(256, 256, 240, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(256, 16); ctx.lineTo(256, 496);
    ctx.moveTo(16, 256); ctx.lineTo(496, 256);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
