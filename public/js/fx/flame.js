// Fuego por shader: llamas (velas, antorchas, braseros, el fogón), brasas que suben y humo.
// Todo instanciado: cientos de velas cuestan una sola llamada de dibujo por capa.
// Cada llama es un plano que mira a la cámara girando sobre Y, con la forma y el color hechos con ruido animado.
import * as THREE from 'three';

const NOISE = /* glsl */ `
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm3(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.1 + 3.7) * 0.3 + vnoise(p * 4.3 + 7.1) * 0.15; }
`;
// niebla exponencial (la misma que la escena): lo aditivo se apaga con la distancia en vez de teñirse
const FOG_VS = /* glsl */ `varying float vFogD;`;
const FOG_FS = /* glsl */ `
  uniform float fogDensity;
  varying float vFogD;
  float fogKeep() { float d = fogDensity * vFogD; return exp(-d * d); }
`;

function quad(y0 = 0) {
  const g = new THREE.InstancedBufferGeometry();
  const p = new THREE.PlaneGeometry(1, 1);
  p.translate(0, 0.5 + y0, 0);
  g.index = p.index;
  g.setAttribute('position', p.getAttribute('position'));
  return g;
}

export class Flames {
  constructor(scene, max = 600) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 4); // xyz + semilla
    this.siz = new Float32Array(max * 4); // ancho, alto, intensidad, viento (0 adentro, 1 afuera)
    const g = quad();
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 4);
    this.aSiz = new THREE.InstancedBufferAttribute(this.siz, 4);
    this.aSiz.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos);
    g.setAttribute('aSiz', this.aSiz);
    g.instanceCount = 0;
    this.uniforms = {
      uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.6, 0.2) },
      fogDensity: { value: 0.0036 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aPos; attribute vec4 aSiz;
        uniform float uTime; uniform vec2 uWind;
        varying vec2 vUv; varying float vSeed; varying float vI;
        ${FOG_VS}
        void main() {
          vec3 base = aPos.xyz;
          vec3 toCam = cameraPosition - base; toCam.y = 0.0;
          float l = length(toCam); toCam = l > 1e-4 ? toCam / l : vec3(0.0, 0.0, 1.0);
          vec3 right = vec3(toCam.z, 0.0, -toCam.x);
          float t = uTime + aPos.w * 17.0;
          float flick = 0.86 + 0.08 * sin(t * 11.0) + 0.06 * sin(t * 23.0 + 1.3);
          float h = aSiz.y * flick;
          vec3 p = base + right * position.x * aSiz.x + vec3(0.0, position.y * h, 0.0);
          // viento: la punta se inclina y ondula (solo las de afuera)
          float bend = position.y * position.y * aSiz.w * h;
          p.xz += uWind * bend * (0.55 + 0.45 * sin(t * 3.1));
          vUv = position.xy; vSeed = aPos.w; vI = aSiz.z;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vFogD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv; varying float vSeed; varying float vI;
        ${NOISE}
        ${FOG_FS}
        void main() {
          float y = vUv.y;
          float t = uTime * 1.7 + vSeed * 31.0;
          float n = fbm3(vec2(vUv.x * 2.6 + vSeed * 7.0, y * 2.0 - t * 1.9));
          float x = vUv.x + (n - 0.5) * 0.38 * y;
          // gota: ancha abajo, fina arriba; la punta se rompe con el ruido
          float w = 0.46 * pow(1.0 - y, 0.75) * (0.75 + 0.25 * sqrt(max(0.0, 1.0 - y)));
          float body = smoothstep(w, w * 0.15, abs(x));
          body *= smoothstep(0.0, 0.1, y) * smoothstep(1.0, 0.45 + 0.35 * n, y);
          float core = smoothstep(w * 0.6, 0.0, abs(x)) * smoothstep(0.72, 0.08, y) * smoothstep(0.0, 0.12, y);
          vec3 col = mix(vec3(0.9, 0.16, 0.02), vec3(1.0, 0.55, 0.12), smoothstep(0.1, 0.8, body));
          col = mix(col, vec3(1.0, 0.9, 0.62), core * 0.85);
          float a = body * vI * fogKeep();
          if (a < 0.003) discard;
          gl_FragColor = vec4(col * a * 2.6, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  // Llama nueva: devuelve su índice (para prenderla/apagarla/moverla). wind: 1 = a la intemperie
  add(x, y, z, w, h, { intensity = 1, wind = 0 } = {}) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    this.pos.set([x, y, z, Math.random()], i * 4);
    this.siz.set([w, h, intensity, wind], i * 4);
    this.aPos.needsUpdate = true;
    this.aSiz.needsUpdate = true;
    this.mesh.geometry.instanceCount = this.n;
    return i;
  }
  set(i, intensity) {
    if (i < 0) return;
    if (this.siz[i * 4 + 2] === intensity) return;
    this.siz[i * 4 + 2] = intensity;
    this.aSiz.needsUpdate = true;
  }
  get(i) { return i < 0 ? 0 : this.siz[i * 4 + 2]; }
  scale(i, w, h) {
    if (i < 0) return;
    this.siz[i * 4] = w;
    this.siz[i * 4 + 1] = h;
    this.aSiz.needsUpdate = true;
  }
  move(i, x, y, z) {
    if (i < 0) return;
    this.pos[i * 4] = x; this.pos[i * 4 + 1] = y; this.pos[i * 4 + 2] = z;
    this.aPos.needsUpdate = true;
  }
  update(t, fogDensity) {
    this.uniforms.uTime.value = t;
    this.uniforms.fogDensity.value = fogDensity;
  }
}

// Brasas: chispas que suben girando desde un emisor (el fogón, los braseros). El movimiento es todo del shader.
export class Embers {
  constructor(scene, max = 400) {
    this.max = max;
    this.n = 0;
    this.em = new Float32Array(max * 4); // emisor xyz + semilla
    this.pr = new Float32Array(max * 4); // radio, alto, fuerza (0 = apagado), velocidad
    const g = quad(-0.5);
    this.aEm = new THREE.InstancedBufferAttribute(this.em, 4);
    this.aPr = new THREE.InstancedBufferAttribute(this.pr, 4);
    this.aPr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aEm', this.aEm);
    g.setAttribute('aPr', this.aPr);
    g.instanceCount = 0;
    this.uniforms = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.6, 0.2) }, fogDensity: { value: 0.0036 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aEm; attribute vec4 aPr;
        uniform float uTime; uniform vec2 uWind;
        varying vec2 vUv; varying float vA; varying float vHot;
        ${FOG_VS}
        float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
        void main() {
          float s = aEm.w;
          float life = fract(uTime * aPr.w * (0.8 + 0.4 * h11(s * 3.1)) + h11(s * 7.7));
          float ang = h11(s * 11.3) * 6.2832 + life * (2.0 + 3.0 * h11(s * 5.1));
          float r = aPr.x * (0.25 + 0.75 * h11(s * 2.3)) * (0.4 + life);
          vec3 c = aEm.xyz + vec3(cos(ang) * r, life * aPr.y, sin(ang) * r);
          c.xz += uWind * life * life * aPr.y * 0.35;
          vec3 toCam = normalize(cameraPosition - c);
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
          vec3 up = cross(toCam, right);
          float size = 0.035 * (1.0 - life * 0.6) * (0.6 + 0.8 * h11(s * 9.9));
          vec3 p = c + (right * position.x + up * position.y) * size;
          vUv = position.xy;
          vA = aPr.z * smoothstep(0.0, 0.08, life) * (1.0 - life);
          vHot = 1.0 - life;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vFogD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying float vA; varying float vHot;
        ${FOG_FS}
        void main() {
          float d = length(vUv) * 2.0;
          float a = smoothstep(1.0, 0.0, d) * vA * fogKeep();
          if (a < 0.004) discard;
          vec3 col = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.75, 0.35), vHot);
          gl_FragColor = vec4(col * a * 4.0, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
  }
  // un emisor = `count` brasas; devuelve [desde, hasta) para cambiarles la fuerza
  add(x, y, z, count, { radius = 0.35, height = 3, strength = 1, speed = 0.45 } = {}) {
    const from = this.n;
    for (let k = 0; k < count && this.n < this.max; k++) {
      const i = this.n++;
      this.em.set([x, y, z, Math.random() * 1000], i * 4);
      this.pr.set([radius, height, strength, speed], i * 4);
    }
    this.aEm.needsUpdate = true;
    this.aPr.needsUpdate = true;
    this.mesh.geometry.instanceCount = this.n;
    return [from, this.n];
  }
  set([a, b], strength, height = null) {
    for (let i = a; i < b; i++) {
      this.pr[i * 4 + 2] = strength;
      if (height !== null) this.pr[i * 4 + 1] = height;
    }
    this.aPr.needsUpdate = true;
  }
  update(t, fogDensity) {
    this.uniforms.uTime.value = t;
    this.uniforms.fogDensity.value = fogDensity;
  }
}

// Humo: manchas oscuras y blandas que suben, se abren y se van (mezcla normal, no aditiva)
export class Smoke {
  constructor(scene, max = 160) {
    this.max = max;
    this.n = 0;
    this.em = new Float32Array(max * 4);
    this.pr = new Float32Array(max * 4); // radio, alto, opacidad, velocidad
    const g = quad(-0.5);
    this.aEm = new THREE.InstancedBufferAttribute(this.em, 4);
    this.aPr = new THREE.InstancedBufferAttribute(this.pr, 4);
    this.aPr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aEm', this.aEm);
    g.setAttribute('aPr', this.aPr);
    g.instanceCount = 0;
    this.uniforms = {
      uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.6, 0.2) }, fogDensity: { value: 0.0036 },
      uLight: { value: new THREE.Color(0.08, 0.075, 0.07) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 aEm; attribute vec4 aPr;
        uniform float uTime; uniform vec2 uWind;
        varying vec2 vUv; varying float vA; varying float vS;
        ${FOG_VS}
        float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
        void main() {
          float s = aEm.w;
          float life = fract(uTime * aPr.w * (0.85 + 0.3 * h11(s)) + h11(s * 3.3));
          vec3 c = aEm.xyz + vec3((h11(s * 5.7) - 0.5) * aPr.x, life * aPr.y, (h11(s * 8.1) - 0.5) * aPr.x);
          c.xz += uWind * life * life * aPr.y * 0.5;
          vec3 toCam = normalize(cameraPosition - c);
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
          vec3 up = cross(toCam, right);
          float size = (0.5 + life * 2.4) * (0.7 + 0.6 * h11(s * 2.9));
          float rot = h11(s * 4.4) * 6.28 + life * 1.5;
          vec2 q = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * position.xy;
          vec3 p = c + (right * q.x + up * q.y) * size;
          vUv = position.xy; vS = s;
          vA = aPr.z * smoothstep(0.0, 0.15, life) * (1.0 - life);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vFogD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight;
        varying vec2 vUv; varying float vA; varying float vS;
        ${NOISE}
        ${FOG_FS}
        void main() {
          float d = length(vUv) * 2.0;
          float n = fbm3(vUv * 3.0 + vS);
          float a = smoothstep(1.0, 0.2, d + (n - 0.5) * 0.5) * vA * fogKeep();
          if (a < 0.003) discard;
          gl_FragColor = vec4(uLight, a);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }
  add(x, y, z, count, { radius = 0.5, height = 6, opacity = 0.18, speed = 0.08 } = {}) {
    const from = this.n;
    for (let k = 0; k < count && this.n < this.max; k++) {
      const i = this.n++;
      this.em.set([x, y, z, Math.random() * 1000], i * 4);
      this.pr.set([radius, height, opacity, speed], i * 4);
    }
    this.aEm.needsUpdate = true;
    this.aPr.needsUpdate = true;
    this.mesh.geometry.instanceCount = this.n;
    return [from, this.n];
  }
  set([a, b], opacity) {
    for (let i = a; i < b; i++) this.pr[i * 4 + 2] = opacity;
    this.aPr.needsUpdate = true;
  }
  update(t, fogDensity) {
    this.uniforms.uTime.value = t;
    this.uniforms.fogDensity.value = fogDensity;
  }
}

// Parpadeo de una luz de fuego (0.6..1.1), estable por semilla
export function fireFlicker(t, seed) {
  const s = t + seed * 13.7;
  return 0.82 + Math.sin(s * 9.3) * 0.07 + Math.sin(s * 23.1 + 1.7) * 0.05 + Math.sin(s * 3.1) * 0.06 + (Math.random() - 0.5) * 0.06;
}
