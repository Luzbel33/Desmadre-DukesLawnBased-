// Tormenta local sobre el castillo del terror.
// - Adentro del rectángulo STORM (mapdata) es de noche: cielo de nubes negras, niebla cerrada, luz fría, lluvia
//   y relámpagos. Al acercarse todo se funde según la posición de la cámara (sin cortes).
// - Desde afuera se ve: una nube negra encima del castillo con relámpagos adentro, cortinas de lluvia y la
//   sombra de la nube (una placa invisible que solo proyecta sombra, con borde irregular).
// - Los relámpagos salen de la hora del servidor: todos los jugadores ven el mismo, al mismo tiempo, y el trueno
//   llega con la demora de la distancia.
// - La lluvia es de la GPU (miles de gotas alrededor de la cámara) y no atraviesa techos: se corta con un mapa de
//   alturas de lo construido (setRainMask).
import * as THREE from 'three';
import { G, clamp, lerp } from '../core/G.js';
import { STORM, stormAt, MOON } from '../shared/mapdata.js';

const C1 = new THREE.Color();
const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();

// hash entero -> [0,1): igual en todos los clientes
function hash(n) {
  let h = (n | 0) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// Parámetros del relámpago del segundo `k` (o null si ese segundo no hay)
export function strikeAt(k) {
  // la tormenta respira: a ratos casi no truena, a ratos seguido (ciclo de ~4 min)
  const p = lerp(0.035, 0.13, 0.5 + 0.5 * Math.sin((k / 240) * Math.PI * 2));
  if (hash(k * 7 + 1) >= p) return null;
  const near = hash(k * 7 + 2) < 0.3;
  const tower = near && hash(k * 7 + 6) < 0.16; // a veces le pega al pararrayos de la torre
  const pulses = 2 + Math.floor(hash(k * 7 + 3) * 3);
  return {
    k, t: k + hash(k * 7 + 4) * 0.8, near, tower, pulses,
    ang: hash(k * 7 + 5) * Math.PI * 2,
    dist: near ? 90 + hash(k * 13 + 1) * 160 : 380 + hash(k * 13 + 2) * 700,
    power: 0.55 + hash(k * 13 + 3) * 0.45,
    delay: near ? 0.25 + hash(k * 13 + 4) * 1.1 : 2.2 + hash(k * 13 + 5) * 5,
    seed: Math.floor(hash(k * 13 + 6) * 1e6),
  };
}
// intensidad del destello (0..1) a `dt` segundos del comienzo: varios pulsos que se apagan
function flashCurve(s, dt) {
  if (dt < 0 || dt > 0.9) return 0;
  let f = 0;
  for (let i = 0; i < s.pulses; i++) {
    const t0 = i * (0.08 + hash(s.seed + i) * 0.1);
    const x = dt - t0;
    if (x < 0) continue;
    f = Math.max(f, (i === 0 ? 1 : 0.55 + hash(s.seed + i * 3) * 0.4) * Math.exp(-x * 22));
  }
  return f * s.power;
}

const NOISE = /* glsl */ `
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += vnoise(p) * a; p = p * 2.03 + 11.7; a *= 0.5; }
    return s;
  }
`;

export class Storm {
  constructor(world, { quality = 'alta' } = {}) {
    this.world = world;
    this.scene = world.scene;
    this.s = 0; // factor de tormenta en la cámara (suavizado)
    this.indoor = 0; // 0 = a la intemperie, 1 = adentro de un cuarto cerrado
    this.roofed = 0; // bajo techo abierto (galpón): la lluvia suena en el techo
    this.flash = 0; // destello actual (0..1), ya multiplicado por lo cerca que está la tormenta
    this.flashRaw = 0;
    this.lastStrike = null;
    this.indoorAt = null; // (x, y, z) => { indoor, roofed }: lo pone el castillo
    this.onStrike = null; // (strike) => void: el castillo ilumina ventanas, los sustos aprovechan
    this.base = {
      fog: world.scene.fog.color.clone(), fogD: world.scene.fog.density,
      hemi: world.hemi ? world.hemi.intensity : 0.42, hemiSky: world.hemi ? world.hemi.color.clone() : new THREE.Color(),
      hemiGround: world.hemi ? world.hemi.groundColor.clone() : new THREE.Color(),
      sun: world.sun.intensity, sunColor: world.sun.color.clone(), env: world.scene.environmentIntensity,
    };
    this.night = {
      fog: new THREE.Color(0x151b24), fogD: 0.0125, hemi: 0.34, hemiSky: new THREE.Color(0x6a80a8),
      hemiGround: new THREE.Color(0x221f1a), sun: 0.12, sunColor: new THREE.Color(0x8ea4d6), env: 0.12,
    };
    this.wind = new THREE.Vector2(2.2, 0.9); // m/s: la lluvia cae inclinada
    this._played = new Set();
    this._build(quality);
  }

  _build(quality) {
    const scene = this.scene;
    // ------------------------------------------------ cielo de tormenta (cúpula alrededor de la cámara)
    // la luna: la misma dirección de la que llega su luz (MOON), con su textura (NASA, dominio público)
    let moonTex = null;
    if (typeof document !== 'undefined') {
      moonTex = new THREE.TextureLoader().load('assets/tex/moon.jpg');
      moonTex.colorSpace = THREE.SRGBColorSpace;
      moonTex.anisotropy = 4;
    }
    this.skyU = {
      uT: { value: 0 }, uAlpha: { value: 0 }, uFlash: { value: 0 }, uFlashDir: { value: new THREE.Vector3(0, 0.3, -1) },
      uFog: { value: new THREE.Color() },
      uMoonDir: { value: new THREE.Vector3(...MOON).normalize() }, tMoon: { value: moonTex }, uMoonOn: { value: moonTex ? 1 : 0 },
    };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 24), new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uT, uAlpha, uFlash, uMoonOn; uniform vec3 uFlashDir, uFog, uMoonDir;
        uniform sampler2D tMoon;
        varying vec3 vDir;
        ${NOISE}
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec2 uv = d.xz / max(0.06, h + 0.1) * 0.9;
          vec2 flow = vec2(uT * 0.018, uT * 0.03);
          float n = fbm(uv * 0.9 + flow);
          float m = fbm(uv * 2.4 - flow * 1.7 + 5.0);
          float c = smoothstep(0.32, 0.78, n * 0.75 + m * 0.35);
          vec3 col = mix(vec3(0.010, 0.012, 0.018), vec3(0.042, 0.048, 0.062), c);
          // luna: disco con relieve (textura), un poco gibosa y con el borde oscurecido; las nubes la tapan a ratos
          // y las que pasan cerca se iluminan de atrás (borde plateado)
          float ang = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
          float cover = smoothstep(0.46, 0.86, n * 0.8 + m * 0.42);
          const float MR = 0.042;
          if (ang < MR * 1.05 && uMoonOn > 0.5) {
            vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
            vec3 up = cross(uMoonDir, rt);
            vec2 q = vec2(dot(d, rt), dot(d, up)) / sin(MR);
            float r2 = dot(q, q);
            if (r2 < 1.0) {
              vec3 nn = vec3(q, sqrt(1.0 - r2));
              vec2 muv = vec2(0.5 + atan(nn.x, nn.z) / 6.2832, 0.5 + asin(clamp(nn.y, -1.0, 1.0)) / 3.1416);
              vec3 alb = texture2D(tMoon, muv).rgb;
              float lit = 0.18 + 0.82 * max(0.0, dot(nn, normalize(vec3(-0.5, 0.18, 0.85))));
              vec3 moon = alb * lit * pow(nn.z, 0.3) * vec3(1.0, 0.97, 0.9) * 3.4;
              col = mix(col, moon, smoothstep(1.0, 0.94, r2) * (1.0 - 0.9 * cover));
            }
          }
          float halo = exp(-ang / 0.045) * 0.5 + exp(-ang / 0.2) * 0.1 + exp(-ang / 0.7) * 0.025;
          col += vec3(0.5, 0.58, 0.76) * halo * uMoonOn * (0.35 + 1.1 * c) * (1.0 - 0.55 * cover);
          float fd = pow(max(0.0, dot(d, normalize(uFlashDir))), 5.0);
          col += uFlash * (0.18 + 2.2 * fd) * vec3(0.55, 0.62, 0.85) * (0.35 + 0.9 * c);
          col = mix(uFog, col, smoothstep(-0.03, 0.22, h));
          gl_FragColor = vec4(col, uAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    dome.renderOrder = -20;
    dome.frustumCulled = false;
    dome.name = 'storm-sky';
    scene.add(dome);
    this.dome = dome;

    // ------------------------------------------------ nubes sobre el castillo (lo que se ve desde afuera)
    const cx = (STORM.x0 + STORM.x1) / 2, cz = (STORM.z0 + STORM.z1) / 2;
    const hx = (STORM.x1 - STORM.x0) / 2 + 62, hz = (STORM.z1 - STORM.z0) / 2 + 62;
    this.deckU = {
      uT: { value: 0 }, uFlash: { value: 0 }, uFlashPos: { value: new THREE.Vector3() }, uVis: { value: 1 },
      uRect: { value: new THREE.Vector4(STORM.x0, STORM.z0, STORM.x1, STORM.z1) },
    };
    const deckMat = new THREE.ShaderMaterial({
      uniforms: this.deckU, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uT, uFlash, uVis; uniform vec3 uFlashPos; uniform vec4 uRect;
        varying vec3 vW;
        ${NOISE}
        void main() {
          vec2 p = vW.xz;
          vec2 dd = max(max(uRect.xy - p, 0.0), p - uRect.zw);
          float edge = 1.0 - smoothstep(0.0, 34.0, length(dd) + (fbm(p * 0.03 + uT * 0.01) - 0.5) * 30.0);
          float n = fbm(p * 0.02 + vec2(uT * 0.012, uT * 0.02) + vW.y * 0.013);
          float m = fbm(p * 0.06 - vec2(uT * 0.02, 0.0));
          float a = smoothstep(0.25, 0.7, n * 0.8 + m * 0.35) * edge;
          vec3 col = mix(vec3(0.012, 0.014, 0.02), vec3(0.05, 0.055, 0.07), m);
          float fl = uFlash * (0.25 + 3.0 / (1.0 + pow(length(vW - uFlashPos) / 70.0, 2.0)));
          col += fl * vec3(0.5, 0.58, 0.8) * (0.4 + m);
          gl_FragColor = vec4(col, a * uVis * 0.92);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.decks = [];
    for (const [y, s] of [[62, 1], [48, 0.86]]) {
      const deck = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2 * s, hz * 2 * s), deckMat);
      deck.rotation.x = Math.PI / 2;
      deck.position.set(cx, y, cz);
      deck.renderOrder = -5;
      deck.frustumCulled = false;
      scene.add(deck);
      this.decks.push(deck);
    }

    // ------------------------------------------------ cortinas de lluvia en el borde (se ven desde lejos)
    this.curtainU = { uT: { value: 0 }, uFlash: { value: 0 }, uCamS: { value: 0 } };
    const curtainMat = new THREE.ShaderMaterial({
      uniforms: this.curtainU, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vW;
        void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uT, uFlash, uCamS;
        varying vec2 vUv; varying vec3 vW;
        ${NOISE}
        void main() {
          vec2 q = vec2(vW.x + vW.z, vW.y);
          float cols = h21(vec2(floor(q.x * 6.0), 3.1));
          float streak = fract(q.y * 0.08 + uT * (1.4 + cols) + cols * 13.0);
          float s = smoothstep(0.0, 0.1, streak) * smoothstep(0.35, 0.12, streak) * step(0.45, cols);
          float veil = fbm(vec2(q.x * 0.05 + uT * 0.05, q.y * 0.04 + uT * 0.4));
          float fade = smoothstep(0.0, 0.15, vUv.y) * smoothstep(0.75, 0.3, vUv.y);
          float camD = length(vW.xz - cameraPosition.xz);
          float a = (s * 0.1 + smoothstep(0.55, 0.9, veil) * 0.05) * fade * smoothstep(6.0, 22.0, camD);
          vec3 col = mix(vec3(0.06, 0.07, 0.085), vec3(0.6, 0.66, 0.8), uFlash);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const H = 58;
    const walls = [
      [STORM.x0, STORM.z1, STORM.x1, STORM.z1], [STORM.x0, STORM.z0, STORM.x0, STORM.z1], [STORM.x1, STORM.z0, STORM.x1, STORM.z1],
    ];
    this.curtains = [];
    for (const [x0, z0, x1, z1] of walls) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len + 20, H), curtainMat);
      m.position.set((x0 + x1) / 2, H / 2 - 1, (z0 + z1) / 2);
      m.rotation.y = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      m.renderOrder = 2;
      scene.add(m);
      this.curtains.push(m);
    }

    // ------------------------------------------------ lluvia (GPU): gotas alrededor de la cámara
    const N = quality === 'baja' ? 5000 : quality === 'ultra' ? 16000 : 10000;
    const g = new THREE.InstancedBufferGeometry();
    const p = new THREE.PlaneGeometry(1, 1);
    p.translate(0, 0.5, 0);
    g.index = p.index;
    g.setAttribute('position', p.getAttribute('position'));
    const seeds = new Float32Array(N * 4);
    for (let i = 0; i < N * 4; i++) seeds[i] = Math.random();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = N;
    const mask = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    mask.needsUpdate = true;
    this.rainU = {
      uTime: { value: 0 }, uBox: { value: 44 }, uH: { value: 24 }, uWind: { value: this.wind },
      uAmount: { value: 0 }, uFlash: { value: 0 }, uMask: { value: mask },
      uMaskRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uStorm: { value: new THREE.Vector4(STORM.x0, STORM.z0, STORM.x1, STORM.z1) }, uFade: { value: STORM.fade },
      uLit: { value: new THREE.Color(0.1, 0.11, 0.13) },
    };
    const rainMat = new THREE.ShaderMaterial({
      uniforms: this.rainU, transparent: true, depthWrite: false, fog: false,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uBox, uH, uAmount, uFade;
        uniform vec2 uWind; uniform sampler2D uMask; uniform vec4 uMaskRect, uStorm;
        varying float vA; varying vec2 vUv;
        float stormAt(vec2 p) {
          vec2 d = max(max(uStorm.xy - p, 0.0), p - uStorm.zw);
          float t = min(1.0, length(d) / uFade);
          return 1.0 - t * t * (3.0 - 2.0 * t);
        }
        void main() {
          float speed = 14.0 + aSeed.w * 8.0;
          float y = mod(aSeed.y * uH - uTime * speed, uH);
          vec2 anchor = aSeed.xz * uBox;
          vec2 rel = mod(anchor - cameraPosition.xz + 0.5 * uBox, uBox) - 0.5 * uBox;
          vec2 drift = uWind * (uH - y) / speed;
          vec2 wxz = cameraPosition.xz + rel + drift;
          float wy = cameraPosition.y - uH * 0.38 + y;
          vec2 muv = (wxz - uMaskRect.xy) * uMaskRect.zw;
          float roof = 0.0;
          if (muv.x > 0.0 && muv.y > 0.0 && muv.x < 1.0 && muv.y < 1.0) roof = texture2D(uMask, muv).r * 63.75;
          float vis = step(roof + 0.02, wy) * stormAt(wxz) * uAmount;
          vec3 head = vec3(wxz.x, wy, wxz.y);
          vec3 dir = normalize(vec3(uWind.x, speed, uWind.y));
          float len = 0.4 + aSeed.w * 0.35;
          vec3 toCam = cameraPosition - head;
          float dist = length(toCam);
          vec3 side = normalize(cross(dir, toCam / max(dist, 1e-3)));
          float width = 0.008 + dist * 0.0011;
          vec3 p = head + dir * position.y * len + side * position.x * width;
          vA = vis * smoothstep(0.5, 2.2, dist) * (1.0 - smoothstep(uBox * 0.34, uBox * 0.5, length(rel)));
          vUv = position.xy;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFlash; uniform vec3 uLit;
        varying float vA; varying vec2 vUv;
        void main() {
          float a = vA * (1.0 - abs(vUv.x) * 2.0) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
          if (a < 0.004) discard;
          vec3 col = uLit + uFlash * vec3(0.7, 0.75, 0.9);
          gl_FragColor = vec4(col, a * 0.55);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.rain = new THREE.Mesh(g, rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 8;
    scene.add(this.rain);

    // ------------------------------------------------ relámpago: luz del destello, rayo visible
    // luna (y relámpago) con sombra propia: si no, atraviesa techos y aleros. El mapa se rehace poco (la luna
    // no se mueve): cuando la cámara se corre unos metros o cada 0,25 s por la gente que camina
    this.flashLight = new THREE.DirectionalLight(0xb8caff, 0);
    this.flashLight.castShadow = quality !== 'baja';
    const msh = this.flashLight.shadow;
    msh.mapSize.set(1024, 1024);
    const MS = 42;
    msh.camera.left = -MS; msh.camera.right = MS; msh.camera.top = MS; msh.camera.bottom = -MS;
    msh.camera.near = 1; msh.camera.far = 420;
    msh.bias = -0.0009; msh.normalBias = 0.06; msh.radius = 2.2;
    msh.autoUpdate = false;
    this.moonS = MS;
    this.moonT = 0;
    this.moonC = new THREE.Vector2(1e9, 1e9);
    scene.add(this.flashLight);
    scene.add(this.flashLight.target);
    this.boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.5, 4.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.42, 0.7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.5 });
    this.bolt = null;

    // ------------------------------------------------ sombra de la nube: placa invisible que solo proyecta sombra
    this._sunBlocker();
  }

  _sunBlocker() {
    const sd = this.world.sunDir;
    const Hh = 40; // altura de la placa: dentro del alcance de la sombra del sol (a ~130 m por el rayo)
    const k = Hh / Math.max(0.05, sd.y);
    const off = new THREE.Vector2(sd.x * k, sd.z * k);
    const w = STORM.x1 - STORM.x0 + 26, d = STORM.z1 - STORM.z0 + 26;
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    let alphaMap = null;
    if (cv) {
      // borde irregular y "roto" (como el de una nube): ruido umbralizado cerca del borde
      cv.width = 256; cv.height = 256;
      const c = cv.getContext('2d');
      const img = c.createImageData(256, 256);
      const rnd = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
      const vn = (x, y) => {
        const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        const a = rnd(xi, yi), b = rnd(xi + 1, yi), cc = rnd(xi, yi + 1), dd = rnd(xi + 1, yi + 1);
        return a + (b - a) * u + (cc - a) * v + (a - b - cc + dd) * u * v;
      };
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const ex = Math.min(x, 255 - x) / 256 * (w / 13), ey = Math.min(y, 255 - y) / 256 * (d / 13);
          const e = Math.min(ex, ey); // 0 en el borde, 1 a ~13 m adentro
          const n = vn(x / 18, y / 18) * 0.6 + vn(x / 7, y / 7) * 0.4;
          const v = e + (n - 0.5) * 0.9 > 0.45 ? 255 : 0;
          const i = (y * 256 + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
      alphaMap = new THREE.CanvasTexture(cv);
    }
    const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, alphaMap, alphaTest: 0.5, transparent: false });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    plate.rotation.x = -Math.PI / 2;
    plate.position.set((STORM.x0 + STORM.x1) / 2 + off.x, Hh, (STORM.z0 + STORM.z1) / 2 + off.y);
    plate.castShadow = true;
    plate.receiveShadow = false;
    // capa propia: la ven solo las sombras del sol (world.js); la luna y la cámara no
    plate.layers.set(3);
    plate.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap, alphaTest: 0.5, side: THREE.DoubleSide });
    plate.name = 'storm-cloud-shadow';
    this.scene.add(plate);
    this.blocker = plate;
  }

  // Mapa de alturas de techos (m) sobre una grilla: la lluvia no pasa por debajo
  setRainMask({ x0, z0, x1, z1, w, h, data }) {
    const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    this.rainU.uMask.value = tex;
    this.rainU.uMaskRect.value.set(x0, z0, 1 / (x1 - x0), 1 / (z1 - z0));
    this.mask = { x0, z0, x1, z1, w, h, data };
  }
  roofAt(x, z) {
    const m = this.mask;
    if (!m) return 0;
    const i = Math.floor((x - m.x0) / (m.x1 - m.x0) * m.w), j = Math.floor((z - m.z0) / (m.z1 - m.z0) * m.h);
    if (i < 0 || j < 0 || i >= m.w || j >= m.h) return 0;
    return m.data[j * m.w + i] / 4;
  }

  _makeBolt(s, from, to) {
    if (this.bolt) { this.scene.remove(this.bolt); this.bolt.children.forEach((c) => c.geometry.dispose()); this.bolt = null; }
    let seed = s.seed;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // punto medio desplazado: el canal principal y un par de ramas
    const paths = [];
    const split = (a, b, depth, disp, out) => {
      if (depth === 0) { out.push(b.clone()); return; }
      const m = a.clone().lerp(b, 0.5);
      m.x += (rnd() - 0.5) * disp; m.z += (rnd() - 0.5) * disp; m.y += (rnd() - 0.5) * disp * 0.3;
      split(a, m, depth - 1, disp * 0.55, out);
      split(m, b, depth - 1, disp * 0.55, out);
    };
    const main = [from.clone()];
    split(from, to, 7, from.distanceTo(to) * 0.22, main);
    paths.push({ pts: main, w: s.near ? 1.6 : 3 });
    for (let b = 0; b < 3; b++) {
      const i0 = 20 + Math.floor(rnd() * 70);
      if (i0 >= main.length - 2) continue;
      const a = main[i0];
      const end = a.clone().add(new THREE.Vector3((rnd() - 0.5) * 80, -40 - rnd() * 60, (rnd() - 0.5) * 80));
      const br = [a.clone()];
      split(a, end, 5, 30, br);
      paths.push({ pts: br, w: (s.near ? 1.6 : 3) * 0.45 });
    }
    const cam = G.camera ? G.camera.position : new THREE.Vector3();
    const group = new THREE.Group();
    const ribbon = (pts, width) => {
      const pos = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dir = V1.copy(b).sub(a).normalize();
        const side = V2.copy(cam).sub(a).cross(dir).normalize().multiplyScalar(width * 0.5);
        pos.push(a.x - side.x, a.y - side.y, a.z - side.z, a.x + side.x, a.y + side.y, a.z + side.z, b.x + side.x, b.y + side.y, b.z + side.z);
        pos.push(a.x - side.x, a.y - side.y, a.z - side.z, b.x + side.x, b.y + side.y, b.z + side.z, b.x - side.x, b.y - side.y, b.z - side.z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      return g;
    };
    for (const p of paths) {
      group.add(new THREE.Mesh(ribbon(p.pts, p.w), this.boltMat));
      group.add(new THREE.Mesh(ribbon(p.pts, p.w * 9), this.glowMat));
    }
    group.children.forEach((m) => { m.frustumCulled = false; m.renderOrder = 3; });
    this.scene.add(group);
    this.bolt = group;
  }

  _strike(s) {
    // dónde cae: alrededor del castillo (o en la aguja de la torre)
    const cx = (STORM.x0 + STORM.x1) / 2, cz = (STORM.z0 + STORM.z1) / 2 - 8;
    const to = s.tower && this.tower
      ? this.tower.clone()
      : new THREE.Vector3(cx + Math.sin(s.ang) * s.dist, 0, cz + Math.cos(s.ang) * s.dist);
    const from = to.clone().add(new THREE.Vector3((hash(s.seed + 1) - 0.5) * 120, s.near ? 230 : 320, (hash(s.seed + 2) - 0.5) * 120));
    s.to = to; s.from = from;
    if (s.near || hash(s.seed + 9) < 0.45) this._makeBolt(s, from, to);
    this.lastStrike = s;
    this.onStrike?.(s);
  }

  _thunder(s, level) {
    if (!G.sfx) return;
    const near = s.near;
    const lv = clamp((near ? 0.95 : 0.6) * s.power * level, 0, 1);
    const name = s.tower ? 'thunder-crack' : near ? 'thunder-near' : 'thunder-far';
    G.sfx.trigger(name, null, lv, { variant: s.seed, rate: near ? 1 : 0.85 + hash(s.seed + 5) * 0.2 });
  }

  // audio de ambiente (lo llama el motor de sonido dentro de su update: ahí los loops quedan "tocados")
  ambience(dt, sfx) {
    const s = this.s;
    if (s < 0.01) return;
    const inside = this.indoor, roof = this.roofed;
    // lluvia a cielo abierto, lluvia sobre el techo (galpón, bajo alero) y viento de tormenta
    sfx._loop('storm-rain', 'rain', s * (0.5 * (1 - inside * 0.75) * (1 - roof * 0.35)), null, { bus: 'ambient' });
    sfx._loop('storm-roof', 'rain-roof', s * Math.max(roof * 0.55, inside * 0.28), null, { bus: 'ambient' });
    sfx._loop('storm-wind', 'storm-wind', s * (0.34 * (1 - inside * 0.6)), null, { bus: 'ambient' });
  }

  update(dt, camera) {
    if (!camera) return;
    const now = (G.net?.now?.() ?? Date.now()) / 1000;
    const t = G.time;
    const cam = camera.position;
    // factor de tormenta en la cámara (suavizado: al teletransportarse no hay salto)
    const target = stormAt(cam.x, cam.z);
    this.s += (target - this.s) * Math.min(1, dt * 1.8);
    const s = this.s;
    const io = this.indoorAt ? this.indoorAt(cam.x, cam.y, cam.z) : null;
    const tin = io ? io.indoor : 0, troof = io ? io.roofed : 0;
    this.indoor += (tin - this.indoor) * Math.min(1, dt * 3);
    this.roofed += (troof - this.roofed) * Math.min(1, dt * 3);

    // -------------------------------------------- relámpagos (de la hora del servidor)
    let flash = 0;
    const k0 = Math.floor(now);
    for (let k = k0 - 10; k <= k0; k++) {
      const st = strikeAt(k);
      if (!st) continue;
      const dtS = now - st.t;
      if (dtS >= 0 && dtS < 0.95) {
        if (!this.lastStrike || this.lastStrike.k !== k) this._strike(st);
        flash = Math.max(flash, flashCurve(st, dtS) * (st.near ? 1 : 0.55));
      }
      // trueno: una sola vez por relámpago (si pasó hace poco; al entrar no suenan los viejos)
      if (dtS >= st.delay && dtS < st.delay + 1.5 && !this._played.has(k)) {
        this._played.add(k);
        this._thunder(st, 0.3 + 0.7 * s);
      }
    }
    if (this._played.size > 40) for (const k of this._played) if (k < k0 - 30) this._played.delete(k);
    if (this.bolt) this.bolt.visible = flash > 0.12;
    if (this.bolt && (!this.lastStrike || now - this.lastStrike.t > 1)) {
      this.scene.remove(this.bolt);
      this.bolt.children.forEach((c) => c.geometry.dispose());
      this.bolt = null;
    }
    this.flashRaw = flash;
    // el destello se ve fuerte bajo la tormenta y apenas desde afuera; adentro de un cuarto, casi nada (entra por las ventanas)
    const fx = flash * lerp(0.25, 1, s);
    this.flash = fx;
    const fin = fx * (1 - this.indoor * 0.85);

    // -------------------------------------------- mezcla de luz y niebla (día soleado -> noche de tormenta)
    const w = this.world, B = this.base, Nn = this.night;
    const sI = s * (1 - this.indoor * 0.0);
    const fog = this.scene.fog;
    fog.color.copy(B.fog).lerp(Nn.fog, s);
    fog.color.lerp(C1.setRGB(0.35, 0.4, 0.52), fin * 0.5);
    fog.density = lerp(B.fogD, Nn.fogD, s);
    if (w.hemi) {
      const inDark = this.indoor * 0.62; // adentro: velas, luna por las ventanas y un poco de rebote
      w.hemi.intensity = lerp(B.hemi, Nn.hemi, sI) * (1 - inDark * s) + fin * 1.4;
      w.hemi.color.copy(B.hemiSky).lerp(Nn.hemiSky, s);
      w.hemi.groundColor.copy(B.hemiGround).lerp(Nn.hemiGround, s);
    }
    w.sun.intensity = lerp(B.sun, Nn.sun, s);
    w.sun.shadow.autoUpdate = s < 0.9;
    w.sun.color.copy(B.sunColor).lerp(Nn.sunColor, s);
    this.scene.environmentIntensity = lerp(B.env, Nn.env, s) * (1 - this.indoor * 0.6 * s);
    // una sola luz direccional con sombra: la luna fría y quieta; el relámpago la enciende (el cielo marca de dónde viene)
    const ls = this.lastStrike;
    if (ls && ls.to) {
      V1.set(ls.to.x - cam.x, 0, ls.to.z - cam.z).normalize();
      this.skyU.uFlashDir.value.set(V1.x, 0.35, V1.z);
      this.deckU.uFlashPos.value.set(ls.to.x, 55, ls.to.z);
    }
    const ML = this.flashLight;
    // centro encajado a la grilla de texels (la sombra no tiembla al caminar)
    const tex = (this.moonS * 2) / 1024;
    const mcx = Math.round(cam.x / tex) * tex, mcz = Math.round(cam.z / tex) * tex;
    ML.position.set(mcx + MOON[0], MOON[1], mcz + MOON[2]);
    ML.target.position.set(mcx, 0, mcz);
    ML.target.updateMatrixWorld();
    ML.intensity = fin * 5.5 + s * (0.5 + this.indoor * 1.4);
    if (ML.castShadow && s > 0.02) {
      this.moonT += dt;
      if (this.moonT > 0.25 || Math.hypot(mcx - this.moonC.x, mcz - this.moonC.y) > 3) {
        this.moonT = 0;
        this.moonC.set(mcx, mcz);
        ML.shadow.needsUpdate = true;
      }
    }

    // -------------------------------------------- uniforms de cielo, nubes, cortinas y lluvia
    this.dome.position.copy(cam);
    this.dome.visible = s > 0.005;
    this.skyU.uT.value = t;
    this.skyU.uAlpha.value = clamp(s * 1.15, 0, 1);
    this.skyU.uFlash.value = fx;
    this.skyU.uFog.value.copy(fog.color);
    this.deckU.uT.value = t;
    this.deckU.uFlash.value = flash; // desde afuera también se ve el destello adentro de la nube
    this.deckU.uVis.value = 1 - s * 0.5;
    this.curtainU.uT.value = t;
    this.curtainU.uFlash.value = flash * 0.6;
    this.rainU.uTime.value = t;
    this.rainU.uAmount.value = s > 0.01 ? 1 : 0;
    this.rain.visible = s > 0.01;
    this.rainU.uFlash.value = fin;
    this.rainU.uLit.value.setRGB(0.07, 0.078, 0.095).multiplyScalar(0.6 + 0.4 * s);
    // ráfagas de viento: cambian la inclinación de la lluvia y de las llamas de afuera
    const gust = 0.75 + 0.25 * Math.sin(t * 0.37) + 0.2 * Math.sin(t * 1.3 + 1.1);
    this.wind.set(2.4 * gust, 1.0 * gust);
  }
}
