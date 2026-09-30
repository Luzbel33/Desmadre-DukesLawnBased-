// Fuego volumétrico: el fogón, las chimeneas, los braseros y las antorchas.
// Cada fuego es una caja que se recorre con el rayo de la cámara (en el pase de volumen, con la profundidad de la
// escena: los leños y las paredes lo tapan bien). Adentro, una "gota" de fuego hecha con ruido 3D que sube,
// se retuerce y se deshilacha arriba; el color sale de la temperatura (brasa roja, naranja, amarillo, casi blanco
// en el corazón). Las velas y llamitas chicas siguen siendo las de flame.js.
import * as THREE from 'three';

// ---------------------------------------------------------------- registro (lo arma el mundo; lo dibuja VolumePass)
export class FireSet {
  constructor() {
    this.list = [];
    this.dirty = true;
  }
  // (x, y, z): centro de la base; hx, hz: medio ancho; h: alto. wind: 1 afuera (se inclina con el viento)
  add(x, y, z, hx, hz, h, { intensity = 1, wind = 0, speed = 1, hazard = true } = {}) {
    this.list.push({ x, y, z, hx, hz, h, intensity, wind, speed, hazard, seed: Math.random() * 100, k: 1 });
    this.dirty = true;
    return this.list.length - 1;
  }
  // agrandar/achicar (la llamarada al tirar un leño) o apagar
  scale(i, k) { const f = this.list[i]; if (f && f.k !== k) { f.k = k; this.dirty = true; } }
  set(i, intensity) { const f = this.list[i]; if (f && f.intensity !== intensity) { f.intensity = intensity; this.dirty = true; } }
  move(i, x, y, z) { const f = this.list[i]; if (f) { f.x = x; f.y = y; f.z = z; this.dirty = true; } }

  // Candle flames and cosmetic flames on an already burning body don't ignite
  // the player. Test the actual fire volume, including its current scale.
  touching(p, r = 0) {
    return this.list.filter(f => f.hazard && f.k > .05 && f.intensity > 0 && f.hx + f.hz > .4
      && Math.abs(p.x - f.x) < f.hx * f.k + r && Math.abs(p.z - f.z) < f.hz * f.k + r
      && p.y + r > f.y && p.y - r < f.y + f.h * f.k);
  }
}

// ---------------------------------------------------------------- ruido 3D en textura (valor, suavizado por hardware)
function noiseTexture(n = 48) {
  const data = new Uint8Array(n * n * n);
  let s = 987654321;
  for (let i = 0; i < data.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) | 0; data[i] = (s >>> 24) & 255; }
  // un pasito de suavizado (el trilineal solo es "blocoso")
  const out = new Uint8Array(data.length);
  const at = (x, y, z) => data[((z + n) % n) * n * n + ((y + n) % n) * n + ((x + n) % n)];
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    out[z * n * n + y * n + x] = (at(x, y, z) * 2 + at(x + 1, y, z) + at(x - 1, y, z) + at(x, y + 1, z) + at(x, y - 1, z) + at(x, y, z + 1) + at(x, y, z - 1)) / 8;
  }
  const t = new THREE.Data3DTexture(out, n, n, n);
  t.format = THREE.RedFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

const MAX = 48;

export class FireMesh {
  constructor(common, fogUniform) {
    const g = new THREE.InstancedBufferGeometry();
    const b = new THREE.BoxGeometry(2, 1, 2);
    b.translate(0, 0.5, 0);
    g.index = b.index;
    g.setAttribute('position', b.getAttribute('position'));
    this.aBox = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); // base xyz + alto
    this.aPar = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); // hx, hz, intensidad, semilla
    this.aMov = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2); // viento, velocidad
    g.setAttribute('aBox', this.aBox);
    g.setAttribute('aPar', this.aPar);
    g.setAttribute('aMov', this.aMov);
    g.instanceCount = 0;
    this.uniforms = {
      ...common,
      tNoise: { value: noiseTexture() }, uWind: { value: new THREE.Vector2(2.2, 0.9) }, fogDensity: fogUniform,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      glslVersion: THREE.GLSL3,
      vertexShader: /* glsl */ `
        in vec4 aBox; in vec4 aPar; in vec2 aMov;
        out vec3 vW; flat out vec4 vBox; flat out vec4 vPar; flat out vec2 vMov;
        void main() {
          vBox = aBox; vPar = aPar; vMov = aMov;
          vec3 w = vec3(aBox.x + position.x * aPar.x, aBox.y + position.y * aBox.w, aBox.z + position.z * aPar.y);
          vW = w;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        precision highp sampler3D;
        uniform sampler2D tDepth;
        uniform sampler3D tNoise;
        uniform vec2 uRes;
        uniform mat4 uInvProj, uCamWorld;
        uniform float uTime, fogDensity;
        uniform vec2 uWind;
        in vec3 vW; flat in vec4 vBox; flat in vec4 vPar; flat in vec2 vMov;
        out vec4 fragColor;
        float sceneDist(vec2 fc, vec3 ro) {
          vec2 suv = fc / uRes;
          float d = texture(tDepth, suv).r;
          vec4 v = uInvProj * vec4(suv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          v /= v.w;
          return length((uCamWorld * v).xyz - ro);
        }
        float nz(vec3 p) { return texture(tNoise, p).r; }
        float fbm(vec3 p) { return nz(p) * 0.5 + nz(p * 2.07 + 0.31) * 0.3 + nz(p * 4.13 + 0.77) * 0.2; }
        vec3 ramp(float T) {
          vec3 c = mix(vec3(0.28, 0.02, 0.0), vec3(1.0, 0.22, 0.02), smoothstep(0.04, 0.3, T));
          c = mix(c, vec3(1.0, 0.55, 0.12), smoothstep(0.3, 0.55, T));
          c = mix(c, vec3(1.0, 0.82, 0.42), smoothstep(0.55, 0.8, T));
          return mix(c, vec3(1.0, 0.95, 0.82), smoothstep(0.82, 1.0, T));
        }
        void main() {
          vec3 ro = cameraPosition;
          vec3 rd = normalize(vW - ro);
          vec3 bmin = vec3(vBox.x - vPar.x, vBox.y, vBox.z - vPar.y), bmax = vec3(vBox.x + vPar.x, vBox.y + vBox.w, vBox.z + vPar.y);
          vec3 inv = 1.0 / rd;
          vec3 ta = (bmin - ro) * inv, tb = (bmax - ro) * inv;
          vec3 tn = min(ta, tb), tf = max(ta, tb);
          float t0 = max(max(max(tn.x, tn.y), tn.z), 0.0);
          float t1 = min(min(tf.x, tf.y), tf.z);
          t1 = min(t1, sceneDist(gl_FragCoord.xy, ro));
          if (t1 <= t0) discard;
          const int N = 22;
          float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          float dt = (t1 - t0) / float(N);
          float seed = vPar.w, t = uTime * (0.8 + 0.4 * vMov.y);
          vec3 acc = vec3(0.0);
          for (int i = 0; i < N; i++) {
            vec3 p = ro + rd * (t0 + (float(i) + j) * dt);
            // coordenadas de la llama: xz en [-1, 1], y de 0 (base) a 1 (punta)
            vec3 q = vec3((p.x - vBox.x) / vPar.x, (p.y - vBox.y) / vBox.w, (p.z - vBox.z) / vPar.y);
            float y = q.y;
            // afuera el viento la acuesta (más arriba, más)
            q.xz -= normalize(uWind + 1e-4) * vMov.x * y * y * 0.55;
            vec3 so = vec3(seed * 0.013, seed * 0.029, seed * 0.017);
            // retorcido: el ruido grande mueve las coordenadas (las lenguas se doblan al subir)
            float wx = fbm(vec3(q.x * 0.03, y * 0.07 - t * 0.09, q.z * 0.03) + so + 0.31) - 0.5;
            float wz = fbm(vec3(q.x * 0.03, y * 0.07 - t * 0.09, q.z * 0.03) + so + 0.67) - 0.5;
            q.x += wx * 1.3 * y;
            q.z += wz * 1.3 * y;
            vec3 np = vec3(q.x * 0.06, y * 0.13 - t * 0.22, q.z * 0.06) + so;
            // el ruido suavizado vive entre ~0,35 y ~0,65: se estira a 0..1 (si no, la llama es un cono liso)
            float n = smoothstep(0.34, 0.66, fbm(np));
            float r = length(q.xz);
            float width = mix(1.0, 0.3, pow(clamp(y, 0.0, 1.0), 0.9));
            float env = smoothstep(width, width * 0.3, r) * smoothstep(0.0, 0.05, y);
            // arriba se corta en lenguas sueltas; abajo es cuerpo lleno
            float d = clamp((env * (n * 1.7 - 0.28 - y * 0.55) - y * y * 0.35) * 2.0, 0.0, 1.0);
            if (d <= 0.0) continue;
            float T = clamp(d * (1.3 - y * 0.85), 0.0, 1.0);
            acc += ramp(T) * d * (0.3 + 1.5 * T);
          }
          float len = dt / max(0.2, vBox.w * 0.35);
          vec3 col = acc * len * vPar.z * 1.45;
          float fd = fogDensity * t0;
          col *= exp(-fd * fd);
          if (max(col.r, col.g) < 0.002) discard;
          fragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.set = null;
  }

  sync(set) {
    if (!set || !set.dirty) return;
    set.dirty = false;
    const n = Math.min(MAX, set.list.length);
    for (let i = 0; i < n; i++) {
      const f = set.list[i];
      this.aBox.setXYZW(i, f.x, f.y, f.z, f.h * f.k);
      this.aPar.setXYZW(i, f.hx * (0.8 + 0.2 * f.k), f.hz * (0.8 + 0.2 * f.k), f.intensity, f.seed);
      this.aMov.setXY(i, f.wind, f.speed);
    }
    this.aBox.needsUpdate = this.aPar.needsUpdate = this.aMov.needsUpdate = true;
    this.mesh.geometry.instanceCount = n;
  }
}
