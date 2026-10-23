// ============================================================================
// HAUNTED HOUSE — CORE ENGINE, PBR ENVIRONMENT, SHADOWS & HDR POST PIPELINE
// ============================================================================
(() => {
  'use strict';

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const rad = d => (d * Math.PI) / 180;

  function mulberry32(a) {
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rand = mulberry32(20261031);
  const rr = (a, b) => a + (b - a) * rand();
  const rint = (a, b) => Math.floor(rr(a, b + 1));
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  // ---------- Procedural Value Noise & FBM ----------
  function hash(x, y, s = 0) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function vnoise(x, y, s = 0, px = 0, py = 0) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    let ix = x0, iy = y0, jx = x0 + 1, jy = y0 + 1;
    if (px) { ix = ((ix % px) + px) % px; jx = ((jx % px) + px) % px; }
    if (py) { iy = ((iy % py) + py) % py; jy = ((jy % py) + py) % py; }
    const a = hash(ix, iy, s), b = hash(jx, iy, s), c = hash(ix, jy, s), d = hash(jx, jy, s);
    const u = fade(fx), v = fade(fy);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 4, s = 0, px = 0, py = 0) {
    let a = 0.5, f = 1, sum = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      sum += a * vnoise(x * f, y * f, s + i * 17, px * f, py * f);
      n += a;
      a *= 0.5;
      f *= 2;
    }
    return sum / n;
  }

  // ---------- WebGL Renderer & Scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const DPR = Math.min(window.devicePixelRatio || 1, 1.35);
  renderer.setPixelRatio(DPR);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.physicallyCorrectLights = false;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;
  document.body.appendChild(renderer.domElement);

  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const scene = new THREE.Scene();
  const FOG_COLOR = new THREE.Color(0x050203);
  scene.background = FOG_COLOR.clone();
  scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), 0.0165);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.15, 130);
  scene.add(camera);

  // Subtle cold-sky / warm-ground hemisphere fill for warm-vs-cold shadow contrast
  const hemiLight = new THREE.HemisphereLight(0x2a2036, 0x3a1a0c, 0.10);
  scene.add(hemiLight);

  // HollowMoorManor-inspired PMREM Environment Map: cold moonlit indigo sky + silver moon disc + warm candle glow cards
  // Gives brass, gold, iron, marble, and carved wood authentic warm-and-cold grazing specular reflections
  {
    const envScene = new THREE.Scene();
    const eg = new THREE.SphereGeometry(50, 24, 12);
    const ep = eg.attributes.position;
    const ec = [];
    for (let i = 0; i < ep.count; i++) {
      const k = clamp(ep.getY(i) / 50 * 0.5 + 0.5, 0, 1);
      ec.push(lerp(0.016, 0.022, k), lerp(0.008, 0.026, k), lerp(0.008, 0.070, k));
    }
    eg.setAttribute('color', new THREE.Float32BufferAttribute(ec, 3));
    envScene.add(new THREE.Mesh(eg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

    // Cold silver-blue moon disc high on one side
    const moonCard = new THREE.Mesh(
      new THREE.CircleGeometry(5.2, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 1.3, 2.1) })
    );
    moonCard.position.set(-28, 32, -24);
    moonCard.lookAt(0, 0, 0);
    envScene.add(moonCard);

    // Alternating warm candle/hearth cards and cool moonlit window cards around the horizon
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const isColdWindow = (i % 3 === 0);
      const col = isColdWindow
        ? new THREE.Color(0.22, 0.45, 0.95)
        : new THREE.Color(1.10, 0.46, 0.12);
      const wCard = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.8), new THREE.MeshBasicMaterial({ color: col }));
      wCard.position.set(Math.cos(a) * 40, -3 + (i % 3) * 3.5, Math.sin(a) * 40);
      wCard.lookAt(0, 0, 0);
      envScene.add(wCard);
    }
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.04).texture;
    pm.dispose();
  }

  // Patch Three.js materials for:
  // 1) Believable inverse-square warm & cold point-light falloff
  // 2) World-space macro anti-tiling, patina, moss/damp & roughness variation (eliminates texture repetition!)
  // 3) SSR reflectivity alpha output
  (function patchMaterialsForSSR() {
    if (THREE.ShaderChunk && THREE.ShaderChunk.lights_pars_begin) {
      THREE.ShaderChunk.lights_pars_begin = THREE.ShaderChunk.lights_pars_begin.replace(
        'directLight.color *= punctualLightIntensityToIrradianceFactor( lightDistance, pointLight.distance, pointLight.decay );',
        `float _dNorm = saturate( lightDistance / max( pointLight.distance, 0.01 ) );
        float _win = 1.0 - _dNorm * _dNorm;
        _win = _win * _win;
        float _invSq = 1.0 / ( 1.0 + 0.45 * lightDistance + 0.32 * lightDistance * lightDistance );
        float _atten = ( pointLight.distance > 0.0 ) ? ( _invSq * _win * 2.7 ) : 1.0;
        vec3 _tempShift = ( pointLight.color.r > pointLight.color.b )
          ? mix( vec3( 1.28, 1.08, 0.84 ), vec3( 1.04, 0.58, 0.26 ), smoothstep( 0.35, 5.8, lightDistance ) )
          : mix( vec3( 1.16, 1.24, 1.32 ), vec3( 0.62, 0.80, 1.18 ), smoothstep( 0.45, 7.5, lightDistance ) );
        directLight.color *= _atten * _tempShift;`
      );
    }

    function patch(shader) {
      if (this.transparent) return;
      const ssrVal = (this.userData && typeof this.userData.ssr === 'number')
        ? this.userData.ssr.toFixed(3)
        : '0.0';
      const isPBR = this.isMeshStandardMaterial || this.isMeshPhysicalMaterial;

      if (isPBR) {
        shader.vertexShader = 'varying vec3 vWorldPosM;\n' + shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>\n  vWorldPosM = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );
        shader.fragmentShader = `
varying vec3 vWorldPosM;
float _mHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float _mNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(_mHash(i), _mHash(i + vec3(1,0,0)), f.x), mix(_mHash(i + vec3(0,1,0)), _mHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(_mHash(i + vec3(0,0,1)), _mHash(i + vec3(1,0,1)), f.x), mix(_mHash(i + vec3(0,1,1)), _mHash(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}
` + shader.fragmentShader
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
  {
    // Multi-scale 3D world-space macro variation breaks up UV tiling across walls, floors & vaults
    float nMacro = _mNoise(vWorldPosM * 0.13) * 0.65 + _mNoise(vWorldPosM * 0.41 + 7.3) * 0.35;
    float nDetail = _mNoise(vWorldPosM * 1.35 + 19.1);
    float nStreak = _mNoise(vec3(vWorldPosM.x * 0.9, vWorldPosM.y * 0.18, vWorldPosM.z * 0.9));

    // Subtle warm patina vs cool damp/moss shift across 5m-10m architectural zones
    vec3 warmPatina = vec3(1.12, 1.01, 0.88);
    vec3 coolDamp   = vec3(0.84, 0.95, 1.08);
    vec3 zoneTint   = mix(coolDamp, warmPatina, smoothstep(0.28, 0.72, nMacro));
    float valMod    = 0.80 + 0.38 * nMacro + (nDetail - 0.5) * 0.16 - max(0.0, nStreak - 0.58) * 0.32;
    diffuseColor.rgb *= zoneTint * valMod;

    // Subtle mossy/damp weathering near floor level (HollowMoorManor style)
    float mossPatch = smoothstep(0.56, 0.82, _mNoise(vWorldPosM * 0.34 + 3.7)) * smoothstep(1.35, 0.05, fract(vWorldPosM.y / 5.6) * 5.6);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.88, 0.64), mossPatch * 0.38);
  }`
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
  {
    float rNoise = _mNoise(vWorldPosM * 0.28 + 11.4);
    roughnessFactor = clamp(roughnessFactor * (0.78 + 0.44 * rNoise), 0.06, 0.98);
  }`
          );
      }

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>\n  gl_FragColor.a = ${ssrVal};`
      );
    }
    function cacheKey() {
      if (this.transparent) return 'ssr_transp';
      const ssrVal = (this.userData && typeof this.userData.ssr === 'number')
        ? this.userData.ssr.toFixed(3)
        : '0.0';
      const pbrTag = (this.isMeshStandardMaterial || this.isMeshPhysicalMaterial) ? '_pbrM' : '_basic';
      return 'ssr_' + ssrVal + pbrTag;
    }
    THREE.MeshStandardMaterial.prototype.onBeforeCompile = patch;
    THREE.MeshStandardMaterial.prototype.customProgramCacheKey = cacheKey;
    THREE.MeshPhysicalMaterial.prototype.onBeforeCompile = patch;
    THREE.MeshPhysicalMaterial.prototype.customProgramCacheKey = cacheKey;
    THREE.MeshBasicMaterial.prototype.onBeforeCompile = patch;
    THREE.MeshBasicMaterial.prototype.customProgramCacheKey = cacheKey;
  })();

  // ---------- HDR Post-Processing Pipeline (Dual-Kawase Bloom + Realistic ACES Grade, NO Vignette) ----------
  const isGL2 = renderer.capabilities.isWebGL2;
  const rtOpts = {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true
  };
  const mkRT = (w, h, ms) => {
    const t = (ms && isGL2)
      ? new THREE.WebGLMultisampleRenderTarget(w, h, rtOpts)
      : new THREE.WebGLRenderTarget(w, h, { ...rtOpts, depthBuffer: false });
    if (ms && isGL2) t.samples = 4;
    return t;
  };

  const BLOOM_LEVELS = 5;
  let sceneRT = null;
  let ssrRT = null;
  let volumetricRT = null;
  let bloomRTs = [];

  function buildTargets() {
    const w = Math.max(2, Math.floor(window.innerWidth * DPR));
    const h = Math.max(2, Math.floor(window.innerHeight * DPR));
    if (sceneRT) {
      sceneRT.dispose();
      ssrRT.dispose();
      if (volumetricRT) volumetricRT.dispose();
      bloomRTs.forEach(r => r.dispose());
    }
    sceneRT = new THREE.WebGLRenderTarget(w, h, { ...rtOpts, depthBuffer: true });
    sceneRT.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    sceneRT.depthTexture.minFilter = sceneRT.depthTexture.magFilter = THREE.NearestFilter;
    volumetricRT = mkRT(w, h, false);
    ssrRT = mkRT(w, h, false);
    bloomRTs = [];
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bloomRTs.push(mkRT(Math.max(2, w >> (i + 1)), Math.max(2, h >> (i + 1)), false));
    }
  }
  buildTargets();

  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  quadScene.add(quad);

  const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  function fsPass(mat, target) {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCam);
  }

  const downMat = new THREE.ShaderMaterial({
    uniforms: {
      tex: { value: null },
      texel: { value: new THREE.Vector2() },
      first: { value: 0 },
      thr: { value: 2.3 },
      knee: { value: 0.38 }
    },
    vertexShader: FS_VERT,
    depthTest: false,
    depthWrite: false,
    fragmentShader: `
      uniform sampler2D tex;
      uniform vec2 texel;
      uniform float first, thr, knee;
      varying vec2 vUv;
      vec3 pf(vec3 c) {
        if (first < 0.5) return c;
        c = min(c, vec3(14.0));
        float br = max(c.r, max(c.g, c.b));
        float s = clamp(br - thr + knee, 0.0, 2.0 * knee);
        s = s * s / (4.0 * knee + 1e-4);
        return c * (max(br - thr, s) / max(br, 1e-4));
      }
      vec3 S(vec2 o) { return pf(texture2D(tex, vUv + o * texel).rgb); }
      void main() {
        vec3 a = S(vec2(-2,2)), b = S(vec2(0,2)), c = S(vec2(2,2));
        vec3 d = S(vec2(-2,0)), e = S(vec2(0,0)), f = S(vec2(2,0));
        vec3 g = S(vec2(-2,-2)), h = S(vec2(0,-2)), i = S(vec2(2,-2));
        vec3 j = S(vec2(-1,1)), k = S(vec2(1,1)), l = S(vec2(-1,-1)), m = S(vec2(1,-1));
        gl_FragColor = vec4(e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125, 1.0);
      }
    `
  });

  const upMat = new THREE.ShaderMaterial({
    uniforms: {
      tex: { value: null },
      texel: { value: new THREE.Vector2() },
      w: { value: 1.0 }
    },
    vertexShader: FS_VERT,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fragmentShader: `
      uniform sampler2D tex;
      uniform vec2 texel;
      uniform float w;
      varying vec2 vUv;
      vec3 S(vec2 o) { return texture2D(tex, vUv + o * texel).rgb; }
      void main() {
        vec3 c = S(vec2(-1,1)) + S(vec2(1,1)) + S(vec2(-1,-1)) + S(vec2(1,-1))
               + 2.0 * (S(vec2(0,1)) + S(vec2(0,-1)) + S(vec2(-1,0)) + S(vec2(1,0)))
               + 4.0 * S(vec2(0,0));
        gl_FragColor = vec4((c / 16.0) * w, 1.0);
      }
    `
  });

  // ---------- Screen-Space Ambient Occlusion (SSAO) + Screen-Space Reflections (SSR) ----------
  const ssrMat = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null },
      tDepth: { value: null },
      tVolumetric: { value: null },
      uProj: { value: new THREE.Matrix4() },
      uInvProj: { value: new THREE.Matrix4() },
      uRes: { value: new THREE.Vector2() },
      uTime: { value: 0 }
    },
    vertexShader: FS_VERT,
    depthTest: false,
    depthWrite: false,
    fragmentShader: `
      uniform sampler2D tColor, tDepth, tVolumetric;
      uniform mat4 uProj, uInvProj;
      uniform vec2 uRes;
      uniform float uTime;
      varying vec2 vUv;

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      vec3 viewPos(vec2 uv) {
        float d = texture2D(tDepth, uv).x;
        vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
        return p.xyz / p.w;
      }

      void main() {
        vec4 sc = texture2D(tColor, vUv);
        vec3 outC = sc.rgb;
        vec4 vol = texture2D(tVolumetric, vUv);
        outC += vol.rgb;
        float refl = clamp(sc.a, 0.0, 1.0);
        float d0 = texture2D(tDepth, vUv).x;

        if (d0 > 0.99999) {
          gl_FragColor = vec4(outC, 1.0);
          return;
        }

        vec2 t = 1.0 / uRes;
        vec3 P = viewPos(vUv);
        if (P.z > -0.16 || P.z < -48.0) {
          gl_FragColor = vec4(outC, 1.0);
          return;
        }

        // Reconstruct view-space normal from depth buffer derivatives
        vec3 Pr = viewPos(vUv + vec2(t.x, 0.0)), Pl = viewPos(vUv - vec2(t.x, 0.0));
        vec3 Pu = viewPos(vUv + vec2(0.0, t.y)), Pd = viewPos(vUv - vec2(0.0, t.y));
        vec3 dx = abs(Pr.z - P.z) < abs(Pl.z - P.z) ? Pr - P : P - Pl;
        vec3 dy = abs(Pu.z - P.z) < abs(Pd.z - P.z) ? Pu - P : P - Pd;
        vec3 crossN = cross(dx, dy);
        if (dot(crossN, crossN) < 1e-7) {
          gl_FragColor = vec4(outC, 1.0);
          return;
        }
        vec3 N = normalize(crossN);
        if (dot(N, P) > 0.0) N = -N;

        // --- 1. Multi-Scale 12-Tap Spiral Screen-Space Ambient Occlusion (SSAO) ---
        float ao = 1.0;
        {
          vec2 pix = floor(vUv * uRes);
          float ign = fract(52.9829189 * fract(dot(pix, vec2(0.06711056, 0.00583715))));
          float rotAng = ign * 6.2831853;
          float aspect = uRes.x / max(1.0, uRes.y);
          // Perspective-scaled UV radius covering both fine moldings/steps and deep architectural corners
          float baseRad = clamp(0.62 / max(1.2, -P.z), 0.004, 0.075);
          vec2 radScale = vec2(baseRad / aspect, baseRad);

          float occ = 0.0;
          for (int k = 0; k < 12; k++) {
            float fk = (float(k) + 0.5) / 12.0;
            float r = fk * fk * 0.82 + fk * 0.18;
            float theta = rotAng + float(k) * 2.3999632; // golden angle
            vec2 dir = vec2(cos(theta), sin(theta));
            vec2 suv = vUv + dir * radScale * r;
            if (suv.x < 0.001 || suv.x > 0.999 || suv.y < 0.001 || suv.y > 0.999) continue;

            vec3 Ps = viewPos(suv);
            vec3 v = Ps - P;
            float dist2 = dot(v, v);
            float dist = sqrt(dist2);
            float vn = dot(v, N) - 0.024 - 0.002 * (-P.z);
            // Range & thickness check prevents false dark halos around foreground silhouettes
            float rangeCheck = smoothstep(1.35, 0.22, dist) * step(0.015, dist);
            occ += max(0.0, vn / (dist2 + 0.038)) * rangeCheck;
          }
          float aoDistFade = 1.0 - smoothstep(28.0, 46.0, -P.z);
          ao = clamp(1.0 - (occ / 12.0) * 2.45 * aoDistFade, 0.16, 1.0);
          ao = pow(ao, 1.35);
        }

        // --- 2. Screen-Space Reflections (SSR) on Glossy Surfaces (Marble, Gold, Brass, Glass) ---
        if (refl >= 0.32 && P.z > -34.0) {
          vec3 V = normalize(P);
          float nv = clamp(dot(-V, N), 0.0, 1.0);
          if (nv > 0.001) {
            vec3 R = reflect(V, N);
            float jitter = hash12(floor(vUv * uRes));
            float stepLen = 0.14 * (0.85 + 0.30 * jitter);
            vec3 pos = P + N * 0.05 + R * (stepLen * 0.6);
            vec3 prev = pos;
            vec2 hitUv = vec2(-1.0);
            float travelled = 0.0;

            for (int i = 0; i < 22; i++) {
              prev = pos;
              pos += R * stepLen;
              travelled += stepLen;
              stepLen *= 1.12;

              if (pos.z > -0.15) break;

              vec4 cp = uProj * vec4(pos, 1.0);
              if (cp.w <= 0.0) break;
              vec2 uvp = cp.xy / cp.w * 0.5 + 0.5;
              if (uvp.x < 0.0 || uvp.x > 1.0 || uvp.y < 0.0 || uvp.y > 1.0) break;

              float sd = texture2D(tDepth, uvp).x;
              if (sd > 0.99999) continue;

              vec3 sp = viewPos(uvp);
              float diff = sp.z - pos.z;

              if (diff > 0.0 && diff < (0.34 + stepLen * 0.45) && travelled > 0.12) {
                vec3 a = prev, b = pos;
                for (int j = 0; j < 4; j++) {
                  vec3 m = (a + b) * 0.5;
                  vec4 mc = uProj * vec4(m, 1.0);
                  vec2 mu = mc.xy / mc.w * 0.5 + 0.5;
                  float md = viewPos(mu).z - m.z;
                  if (md > 0.0) b = m; else a = m;
                }
                vec4 hc = uProj * vec4(b, 1.0);
                hitUv = hc.xy / hc.w * 0.5 + 0.5;
                break;
              }
            }

            if (hitUv.x >= 0.0) {
              vec2 r = t * (1.2 + travelled * 0.9) * max(0.08, 1.15 - refl);
              vec3 rc = texture2D(tColor, hitUv).rgb * 0.36
                      + (texture2D(tColor, hitUv + vec2(r.x, 0.0)).rgb +
                         texture2D(tColor, hitUv - vec2(r.x, 0.0)).rgb +
                         texture2D(tColor, hitUv + vec2(0.0, r.y)).rgb +
                         texture2D(tColor, hitUv - vec2(0.0, r.y)).rgb) * 0.16;

              rc = min(rc, vec3(12.0));
              vec2 e = min(hitUv, 1.0 - hitUv);
              float edgeFade = smoothstep(0.0, 0.10, min(e.x, e.y));
              float distFade = 1.0 - smoothstep(12.0, 36.0, travelled);
              float F = mix(0.08, 1.0, pow(1.0 - nv, 4.0));

              float specFactor = clamp(refl * F * edgeFade * distFade, 0.0, 0.92);
              outC = mix(outC, outC + rc, specFactor * 0.45);
              outC += rc * specFactor * 0.65;
            }
          }
        }

        // Store raw SSAO in alpha channel for cross-bilateral spatial filtering in finalMat
        gl_FragColor = vec4(outC, ao);
      }
    `
  });

  // Realistic ACES Filmic Tone Mapping + Cross-Bilateral SSAO Composite
  const finalMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      tBloom: { value: null },
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2() },
      uExposure: { value: 0.88 },
      uBloom: { value: 0.17 },
      uGrain: { value: 0.022 },
      uScarePulse: { value: 0.0 },
      uSpiritFlash: { value: 0.0 },
      uUvSight: { value: 0.0 }
    },
    vertexShader: FS_VERT,
    depthTest: false,
    depthWrite: false,
    fragmentShader: `
      uniform sampler2D tScene, tBloom;
      uniform vec2 uRes;
      uniform float uTime, uExposure, uBloom, uGrain, uScarePulse, uSpiritFlash, uUvSight;
      varying vec2 vUv;

      float h21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      vec3 aces(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }

      void main() {
        vec2 uv = vUv;
        vec2 cc = uv - 0.5;
        float dist2 = dot(cc, cc);
        vec2 px = 1.0 / uRes;

        // Subtle chromatic aberration only during jump-scare spikes
        float ab = (0.0004 + uScarePulse * 0.007) * dist2 * 2.2;
        vec4 centerSample = texture2D(tScene, uv);
        vec3 col;
        col.r = texture2D(tScene, uv + cc * ab).r;
        col.g = centerSample.g;
        col.b = texture2D(tScene, uv - cc * ab).b;

        // Cross-bilateral 9-tap SSAO filter + luma-edge-aware anti-aliasing
        float filteredAO = centerSample.a;
        {
          vec4 s0 = texture2D(tScene, uv + vec2(px.x, 0.0));
          vec4 s1 = texture2D(tScene, uv - vec2(px.x, 0.0));
          vec4 s2 = texture2D(tScene, uv + vec2(0.0, px.y));
          vec4 s3 = texture2D(tScene, uv - vec2(0.0, px.y));
          vec4 s4 = texture2D(tScene, uv + vec2(px.x, px.y) * 1.5);
          vec4 s5 = texture2D(tScene, uv + vec2(-px.x, px.y) * 1.5);
          vec4 s6 = texture2D(tScene, uv + vec2(px.x, -px.y) * 1.5);
          vec4 s7 = texture2D(tScene, uv + vec2(-px.x, -px.y) * 1.5);

          vec3 cm = col / (1.0 + col);
          float lc = dot(cm, vec3(0.299, 0.587, 0.114));
          vec3 a0 = s0.rgb / (1.0 + s0.rgb), a1 = s1.rgb / (1.0 + s1.rgb);
          vec3 a2 = s2.rgb / (1.0 + s2.rgb), a3 = s3.rgb / (1.0 + s3.rgb);
          float l0 = dot(a0, vec3(0.299, 0.587, 0.114)), l1 = dot(a1, vec3(0.299, 0.587, 0.114));
          float l2 = dot(a2, vec3(0.299, 0.587, 0.114)), l3 = dot(a3, vec3(0.299, 0.587, 0.114));
          float lmax = max(max(l0, l1), max(l2, l3));
          float lmin = min(min(l0, l1), min(l2, l3));
          float edgeK = smoothstep(0.04, 0.22, max(lmax, lc) - min(lmin, lc));
          col = mix(col, (col * 2.0 + s0.rgb + s1.rgb + s2.rgb + s3.rgb) / 6.0, edgeK * 0.75);

          // Bilateral weights preserve sharp geometry silhouettes while smoothing SSAO spiral noise
          float w0 = exp(-abs(l0 - lc) * 10.0), w1 = exp(-abs(l1 - lc) * 10.0);
          float w2 = exp(-abs(l2 - lc) * 10.0), w3 = exp(-abs(l3 - lc) * 10.0);
          float aoSum = centerSample.a * 2.0
                      + s0.a * w0 + s1.a * w1 + s2.a * w2 + s3.a * w3
                      + (s4.a + s5.a + s6.a + s7.a) * 0.65;
          float wSum = 2.0 + w0 + w1 + w2 + w3 + 4.0 * 0.65;
          filteredAO = aoSum / wSum;
        }

        // Apply Screen-Space Ambient Occlusion (deepens crevices, corners, steps & moldings; slightly relaxes in blazing direct light)
        float directLum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float aoStrength = mix(filteredAO, 1.0, clamp(directLum * 0.22, 0.0, 0.38));
        col *= aoStrength;

        vec3 bloom = texture2D(tBloom, uv).rgb;
        col += bloom * (uBloom + uScarePulse * 0.22 + uSpiritFlash * 0.35);

        // Spirit flash pulse
        col += vec3(0.32, 0.72, 1.0) * uSpiritFlash * 0.45;

        col *= uExposure;
        vec3 t = aces(max(col, vec3(0.0)));

        // Concept-art grade: crushed warm-black shadows, deep crimson mids, amber highlights, teal-blue only in the cold light
        float lum = dot(t, vec3(0.2126, 0.7152, 0.0722));
        // Filmic contrast S-curve (deeper blacks, punchier candle pools)
        t = mix(t, t * t * (3.0 - 2.0 * t), 0.55);
        lum = dot(t, vec3(0.2126, 0.7152, 0.0722));
        t = mix(vec3(lum), t, 1.22);
        // Shadows pull toward warm oxblood-black instead of cold purple
        t = mix(t, t * vec3(1.14, 0.86, 0.80) + vec3(0.006, 0.001, 0.001), (1.0 - smoothstep(0.0, 0.30, lum)) * 0.55);
        // Cold moonlit blue survives in strongly blue areas (window, ghosts)
        float blueness = clamp((t.b - max(t.r, t.g) * 1.05) * 4.0, 0.0, 1.0);
        t = mix(t, t * vec3(0.92, 1.0, 1.18), blueness * 0.5);
        // Golden candlelight highlights
        t = mix(t, t * vec3(1.10, 1.00, 0.84), smoothstep(0.25, 0.85, lum) * 0.5);
        if (uUvSight > 0.01) {
          vec3 uvCol = mix(vec3(lum) * vec3(0.45, 0.75, 1.32), t * vec3(0.68, 1.04, 1.35), 0.65);
          t = mix(t, uvCol, uUvSight);
        }

        // Subtle optical falloff at the very corners
        t *= 1.0 - 0.62 * smoothstep(0.10, 0.62, dist2 * 2.0);
        t = toSRGB(clamp(t, 0.0, 1.0));
        t += (h21(uv * uRes + fract(uTime) * 91.7) - 0.5) * uGrain;
        gl_FragColor = vec4(t, 1.0);
      }
    `
  });

  // Dedicated Volumetric Light Scene & Pipeline Registry
  const volumetricScene = new THREE.Scene();
  const volumetricBeams = [];

  function registerVolumetricBeam(beam, tag = '') {
    beam.userData.tag = tag;
    volumetricScene.add(beam);
    volumetricBeams.push(beam);
    return beam;
  }

  function removeVolumetricBeamsByTag(tag) {
    for (let i = volumetricBeams.length - 1; i >= 0; i--) {
      if (volumetricBeams[i].userData.tag === tag) {
        volumetricScene.remove(volumetricBeams[i]);
        volumetricBeams.splice(i, 1);
      }
    }
  }

  function renderPipeline(time) {
    finalMat.uniforms.uTime.value = time;
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene, camera);

    // Modern Volumetric Lighting Pass: rendered into HDR volumetricRT using full scene depth texture
    renderer.setRenderTarget(volumetricRT);
    renderer.clear();
    if (volumetricScene.children.length > 0) {
      if (window.HH.volumetricBeamMat) {
        window.HH.volumetricBeamMat.uniforms.uTime.value = time;
        window.HH.volumetricBeamMat.uniforms.tDepth.value = sceneRT.depthTexture;
        window.HH.volumetricBeamMat.uniforms.uRes.value.set(sceneRT.width, sceneRT.height);
        window.HH.volumetricBeamMat.uniforms.uNear.value = camera.near;
        window.HH.volumetricBeamMat.uniforms.uFar.value = camera.far;
        window.HH.volumetricBeamMat.uniforms.uCamPos.value.copy(camera.position);
      }
      if (window.HH.volumetricLanternMat) {
        window.HH.volumetricLanternMat.uniforms.uTime.value = time;
        window.HH.volumetricLanternMat.uniforms.tDepth.value = sceneRT.depthTexture;
        window.HH.volumetricLanternMat.uniforms.uRes.value.set(sceneRT.width, sceneRT.height);
        window.HH.volumetricLanternMat.uniforms.uNear.value = camera.near;
        window.HH.volumetricLanternMat.uniforms.uFar.value = camera.far;
        window.HH.volumetricLanternMat.uniforms.uCamPos.value.copy(camera.position);
      }
      renderer.render(volumetricScene, camera);
    }

    ssrMat.uniforms.tColor.value = sceneRT.texture;
    ssrMat.uniforms.tDepth.value = sceneRT.depthTexture;
    ssrMat.uniforms.tVolumetric.value = volumetricRT.texture;
    ssrMat.uniforms.uProj.value.copy(camera.projectionMatrix);
    ssrMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    ssrMat.uniforms.uRes.value.set(sceneRT.width, sceneRT.height);
    ssrMat.uniforms.uTime.value = time;
    fsPass(ssrMat, ssrRT);

    let src = ssrRT;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      downMat.uniforms.tex.value = src.texture;
      downMat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
      downMat.uniforms.first.value = i === 0 ? 1 : 0;
      fsPass(downMat, bloomRTs[i]);
      src = bloomRTs[i];
    }
    for (let i = BLOOM_LEVELS - 1; i > 0; i--) {
      upMat.uniforms.tex.value = bloomRTs[i].texture;
      upMat.uniforms.texel.value.set(1 / bloomRTs[i].width, 1 / bloomRTs[i].height);
      upMat.uniforms.w.value = 1.0;
      fsPass(upMat, bloomRTs[i - 1]);
    }

    finalMat.uniforms.tScene.value = ssrRT.texture;
    finalMat.uniforms.tBloom.value = bloomRTs[0].texture;
    finalMat.uniforms.uRes.value.set(ssrRT.width, ssrRT.height);
    fsPass(finalMat, null);
  }

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = camera.aspect < 1.0 ? 68 : 58;
    camera.updateProjectionMatrix();
    buildTargets();
  }
  window.addEventListener('resize', onResize);
  onResize();

  // ---------- Dynamic Light Pool Manager with Multi-Light Real Shadows ----------
  const LIGHT_POOL_SIZE = 24;
  const SHADOW_CASTERS_COUNT = 3; // 3 key PointLights with 1024x1024 soft shadow cubemaps
  const lightPool = [];
  for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
    // Physical candlelight falloff across both tunnels and grand halls
    const pl = new THREE.PointLight(0xff8c2e, 0, 18.0, 1.55);
    if (i < SHADOW_CASTERS_COUNT) {
      pl.castShadow = true;
      pl.shadow.mapSize.set(1024, 1024);
      pl.shadow.bias = -0.0015;
      pl.shadow.normalBias = 0.025;
      pl.shadow.radius = 2.0;
      pl.shadow.camera.near = 0.25;
      pl.shadow.camera.far = 18.0;
    }
    scene.add(pl);
    lightPool.push(pl);
  }

  // Handheld player lantern (Warm Candlelight mode / Spectral UV Sight / Off)
  const playerLantern = new THREE.SpotLight(0xffaa44, 2.4, 14, Math.PI * 0.28, 0.85, 2.0);
  playerLantern.castShadow = true;
  playerLantern.shadow.mapSize.set(1024, 1024);
  playerLantern.shadow.bias = -0.0008;
  playerLantern.shadow.normalBias = 0.02;
  playerLantern.shadow.radius = 2.0;
  playerLantern.shadow.camera.near = 0.25;
  playerLantern.shadow.camera.far = 14;
  scene.add(playerLantern);
  scene.add(playerLantern.target);

  const playerFillLight = new THREE.PointLight(0xff7a1c, 0.45, 3.8, 2.4);
  scene.add(playerFillLight);

  const lightAnchors = [];

  function registerLightAnchor(opts) {
    const anchor = {
      pos: opts.pos.clone ? opts.pos.clone() : new THREE.Vector3(opts.pos.x, opts.pos.y, opts.pos.z),
      color: new THREE.Color(opts.color !== undefined ? opts.color : 0xff8a2b),
      intensity: opts.intensity !== undefined ? opts.intensity : 1.5,
      distance: opts.distance !== undefined ? opts.distance : 7.0,
      flickerSpeed: opts.flickerSpeed !== undefined ? opts.flickerSpeed : 6.5,
      flickerAmp: opts.flickerAmp !== undefined ? opts.flickerAmp : 0.18,
      phase: opts.phase !== undefined ? opts.phase : rand() * 100,
      priority: opts.priority || 1,
      active: true,
      tag: opts.tag || ''
    };
    lightAnchors.push(anchor);
    return anchor;
  }

  function removeLightAnchorsByTag(tag) {
    for (let i = lightAnchors.length - 1; i >= 0; i--) {
      if (lightAnchors[i].tag === tag) lightAnchors.splice(i, 1);
    }
  }

  function updateDynamicLights(time, camPos, camDir, lanternMode) {
    const right = new THREE.Vector3().crossVectors(camDir, camera.up).normalize();
    playerLantern.position.copy(camPos).addScaledVector(right, 0.26).add(new THREE.Vector3(0, -0.16, 0));
    playerLantern.target.position.copy(camPos).addScaledVector(camDir, 8.0).add(new THREE.Vector3(0, -0.25, 0));
    playerFillLight.position.copy(playerLantern.position);

    const flicker = 1.0 + 0.08 * Math.sin(time * 11.0) + 0.05 * Math.cos(time * 23.0);
    if (lanternMode === 'warm') {
      playerLantern.color.setHex(0xffaa44);
      playerLantern.intensity = 0.85 * flicker;
      playerLantern.castShadow = true;
      playerFillLight.color.setHex(0xff7a1c);
      playerFillLight.intensity = 0.14 * flicker;
      finalMat.uniforms.uUvSight.value = lerp(finalMat.uniforms.uUvSight.value, 0.0, 0.1);
      if (window.HH.volumetricLanternMat) {
        window.HH.volumetricLanternMat.uniforms.uColor.value.setHex(0xffaa44);
        window.HH.volumetricLanternMat.uniforms.uOpacity.value = 0.06 * flicker;
      }
      if (window.HH.playerLanternBeam) window.HH.playerLanternBeam.visible = true;
    } else if (lanternMode === 'uv') {
      playerLantern.color.setHex(0x38e8ff);
      playerLantern.intensity = 1.95 * flicker;
      playerLantern.castShadow = true;
      playerFillLight.color.setHex(0x28b4ff);
      playerFillLight.intensity = 0.35 * flicker;
      finalMat.uniforms.uUvSight.value = lerp(finalMat.uniforms.uUvSight.value, 0.75, 0.1);
      if (window.HH.volumetricLanternMat) {
        window.HH.volumetricLanternMat.uniforms.uColor.value.setHex(0x38e8ff);
        window.HH.volumetricLanternMat.uniforms.uOpacity.value = 0.38 * flicker;
      }
      if (window.HH.playerLanternBeam) window.HH.playerLanternBeam.visible = true;
    } else {
      playerLantern.intensity = 0.0;
      playerLantern.castShadow = false;
      playerFillLight.intensity = 0.0;
      finalMat.uniforms.uUvSight.value = lerp(finalMat.uniforms.uUvSight.value, 0.0, 0.1);
      if (window.HH.playerLanternBeam) window.HH.playerLanternBeam.visible = false;
    }

    // Update player lantern volumetric cone orientation in world
    if (window.HH.playerLanternBeam && window.HH.playerLanternBeam.visible) {
      window.HH.playerLanternBeam.position.copy(playerLantern.position);
      const lDir = new THREE.Vector3().copy(playerLantern.target.position).sub(playerLantern.position).normalize();
      window.HH.playerLanternBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), lDir);
    }

    for (let i = 0; i < lightAnchors.length; i++) {
      const a = lightAnchors[i];
      if (!a.active) {
        a._score = 999999;
        continue;
      }
      const dx = a.pos.x - camPos.x, dy = a.pos.y - camPos.y, dz = a.pos.z - camPos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const dot = (dx * camDir.x + dy * camDir.y + dz * camDir.z);
      const behindPenalty = dot < -2.5 ? 55.0 : 0.0;
      a._dist = Math.sqrt(d2);
      a._score = (d2 + behindPenalty) / Math.max(0.2, a.priority);
    }

    lightAnchors.sort((a, b) => a._score - b._score);

    for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
      const pl = lightPool[i];
      const a = lightAnchors[i];
      if (!a || !a.active || a._dist > 56) {
        pl.intensity = 0;
        if (i < SHADOW_CASTERS_COUNT) pl.castShadow = false;
        continue;
      }
      pl.position.copy(a.pos);
      pl.distance = a.distance * 1.25;
      const fadeOut = smooth(56, 32, a._dist);

      // Organic turbulent 1/f noise for candlelight: micro-draft jitters + gentle breathing
      const t = time * a.flickerSpeed + a.phase;
      const microJitter = Math.sin(t * 3.41) * 0.18 + Math.cos(t * 6.13) * 0.08 + Math.sin(t * 11.27) * 0.04;
      const draftDraft = Math.sin(t * 0.73) * 0.45 + Math.cos(t * 1.62) * 0.25;
      const dipCycle = Math.sin(t * 0.23 + a.phase);
      const suddenDip = dipCycle < -0.85 ? Math.pow((-0.85 - dipCycle) / 0.15, 2.0) * -0.32 : 0.0;
      const fl = Math.max(0.35, 1.0 + a.flickerAmp * (draftDraft + microJitter + suddenDip));

      // Physical blackbody color temperature shift with flicker intensity:
      // When guttering/low: cools to deep ruby-amber (1850K); when flaring/high: heats to incandescent white-gold (2900K)
      const baseCol = a.color;
      if (baseCol.r > baseCol.b) {
        const tempShift = clamp((fl - 0.78) / 0.46, 0.0, 1.0);
        const coldAmber = new THREE.Color(0xff5512);
        const nominalGold = baseCol;
        const hotWhite = new THREE.Color(0xfff0c8);
        if (tempShift < 0.5) {
          pl.color.copy(coldAmber).lerp(nominalGold, tempShift * 2.0);
        } else {
          pl.color.copy(nominalGold).lerp(hotWhite, (tempShift - 0.5) * 2.0);
        }
      } else {
        pl.color.copy(baseCol);
      }

      pl.intensity = Math.max(0, a.intensity * 1.45 * fl * fadeOut);
      if (i < SHADOW_CASTERS_COUNT) pl.castShadow = pl.intensity > 0.05;
    }
  }

  // Helper to enable shadows on all child meshes of a 3D group
  function enableShadows(obj, cast = true, receive = true) {
    obj.traverse(c => {
      if (c.isMesh && !c.material.transparent) {
        c.castShadow = cast;
        c.receiveShadow = receive;
      }
    });
    return obj;
  }

  // Fast static mesh combiner: merges child Meshes sharing the same Material into a single BufferGeometry
  function mergeStaticGroup(root, isSharedPrefab = true) {
    root.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map();
    const toRemove = [];

    root.traverse(obj => {
      if (!obj.isMesh || !obj.geometry || obj.userData.noMerge) return;
      const mat = obj.material;
      if (!mat || Array.isArray(mat)) return;
      const key = mat.uuid + '_' + (obj.castShadow ? '1' : '0') + '_' + (obj.receiveShadow ? '1' : '0');
      let b = buckets.get(key);
      if (!b) {
        b = { mat, castShadow: obj.castShadow, receiveShadow: obj.receiveShadow, items: [] };
        buckets.set(key, b);
      }
      const relMat = new THREE.Matrix4().multiplyMatrices(rootInv, obj.matrixWorld);
      b.items.push({ geo: obj.geometry, matrix: relMat });
      toRemove.push(obj);
    });

    for (let i = 0; i < toRemove.length; i++) {
      const obj = toRemove[i];
      if (obj.parent) obj.parent.remove(obj);
    }

    const normalMat = new THREE.Matrix3();
    const tmpV = new THREE.Vector3();

    buckets.forEach(b => {
      if (b.items.length === 0) return;
      let totalVerts = 0;
      let totalIndices = 0;
      let hasUV = false;
      let hasPhase = false;

      for (let i = 0; i < b.items.length; i++) {
        const g = b.items[i].geo;
        const pos = g.attributes.position;
        if (!pos) continue;
        totalVerts += pos.count;
        totalIndices += g.index ? g.index.count : pos.count;
        if (g.attributes.uv) hasUV = true;
        if (g.attributes.aPhase) hasPhase = true;
      }

      if (totalVerts === 0) return;

      const positions = new Float32Array(totalVerts * 3);
      const normals = new Float32Array(totalVerts * 3);
      const uvs = hasUV ? new Float32Array(totalVerts * 2) : null;
      const phases = hasPhase ? new Float32Array(totalVerts) : null;
      const indices = totalVerts > 65535 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);

      let vOffset = 0;
      let iOffset = 0;

      for (let i = 0; i < b.items.length; i++) {
        const { geo, matrix } = b.items[i];
        const posAttr = geo.attributes.position;
        if (!posAttr) continue;
        const normAttr = geo.attributes.normal;
        const uvAttr = geo.attributes.uv;
        const phaseAttr = geo.attributes.aPhase;
        const count = posAttr.count;

        normalMat.getNormalMatrix(matrix);

        for (let v = 0; v < count; v++) {
          const out3 = (vOffset + v) * 3;
          tmpV.fromBufferAttribute(posAttr, v).applyMatrix4(matrix);
          positions[out3] = tmpV.x;
          positions[out3 + 1] = tmpV.y;
          positions[out3 + 2] = tmpV.z;

          if (normAttr) {
            tmpV.fromBufferAttribute(normAttr, v).applyMatrix3(normalMat).normalize();
            normals[out3] = tmpV.x;
            normals[out3 + 1] = tmpV.y;
            normals[out3 + 2] = tmpV.z;
          } else {
            normals[out3 + 1] = 1;
          }

          if (uvs && uvAttr) {
            const out2 = (vOffset + v) * 2;
            uvs[out2] = uvAttr.getX(v);
            uvs[out2 + 1] = uvAttr.getY(v);
          }

          if (phases && phaseAttr) {
            phases[vOffset + v] = phaseAttr.getX(v);
          }
        }

        if (geo.index) {
          const idxArr = geo.index.array;
          const ic = geo.index.count;
          for (let k = 0; k < ic; k++) {
            indices[iOffset + k] = idxArr[k] + vOffset;
          }
          iOffset += ic;
        } else {
          for (let k = 0; k < count; k++) {
            indices[iOffset + k] = vOffset + k;
          }
          iOffset += count;
        }

        vOffset += count;
      }

      const mergedGeo = new THREE.BufferGeometry();
      mergedGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      mergedGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      if (uvs) mergedGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      if (phases) mergedGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
      mergedGeo.setIndex(new THREE.BufferAttribute(indices, 1));
      if (isSharedPrefab) mergedGeo._shared = true;

      const mergedMesh = new THREE.Mesh(mergedGeo, b.mat);
      mergedMesh.castShadow = b.castShadow;
      mergedMesh.receiveShadow = b.receiveShadow;
      root.add(mergedMesh);
    });

    for (let i = root.children.length - 1; i >= 0; i--) {
      const c = root.children[i];
      if (!c.isMesh && c.children.length === 0) {
        root.remove(c);
      }
    }

    return root;
  }

  // Catmull-Rom resampled lathe: turns a coarse profile into a smooth, round turning (no faceted silhouettes)
  function smoothLathe(pts, segments = 24, perSpan = 6) {
    const curve = new THREE.SplineCurve(pts.map(p => new THREE.Vector2(p.x, p.y)));
    const n = Math.max(8, (pts.length - 1) * perSpan);
    const out = curve.getPoints(n).map(p => new THREE.Vector2(Math.max(0, p.x), p.y));
    return new THREE.LatheGeometry(out, segments);
  }

  window.HH = {
    smoothLathe,
    mergeStaticGroup,
    clamp, lerp, smooth, rad, rand, rr, rint, pick, V3,
    hash, vnoise, fbm,
    renderer, scene, camera, maxAniso,
    finalMat, renderPipeline,
    lightPool, lightAnchors, registerLightAnchor, removeLightAnchorsByTag, updateDynamicLights,
    volumetricScene, volumetricBeams, registerVolumetricBeam, removeVolumetricBeamsByTag,
    playerLantern, playerFillLight, enableShadows
  };
})();
