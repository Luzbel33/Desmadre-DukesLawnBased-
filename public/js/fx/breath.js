// Fuego por la boca (poder del Diablo). Partículas en la GPU con un anillo de ranuras: cada emisor (un jugador que
// escupe fuego) larga unas 260 por segundo desde la boca hacia donde mira. Si el chorro pega contra una pared o el
// piso, el fuego se abre sobre la superficie en vez de atravesarla. Cada partícula nace casi blanca, pasa por el
// naranja y el rojo y se apaga subiendo (el aire caliente sube). Luz naranja que titila (del pool de luces) y el
// rugido del fuego.
import * as THREE from 'three';
import { surfaceHit } from './demon-fire.js';

const MAX = 1100;
const RATE = 260;
const REACH = 8.5;

const VS = /* glsl */ `
  attribute vec4 a0; // origen xyz + nacimiento
  attribute vec4 a1; // dirección xyz + velocidad
  attribute vec4 a2; // normal del choque xyz + distancia al choque
  attribute vec2 a3; // vida + semilla
  uniform float uTime;
  varying float vF;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    float age = uTime - a0.w, life = a3.x, f = age / life;
    if (age < 0.0 || f >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float travel = a1.w * age * (1.0 - 0.38 * f);
    vec3 p;
    if (travel < a2.w) p = a0.xyz + a1.xyz * travel;
    else {
      vec3 n = a2.xyz;
      vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
      vec3 t2 = cross(n, t1);
      float ang = a3.y * 6.2831853;
      p = a0.xyz + a1.xyz * a2.w + (t1 * cos(ang) + t2 * sin(ang)) * (travel - a2.w) * 0.75 + n * 0.12;
    }
    p.y += age * age * 1.7;
    p += vec3(sin(uTime * 9.0 + a3.y * 40.0), cos(uTime * 7.0 + a3.y * 23.0), sin(uTime * 8.0 + a3.y * 31.0)) * 0.07 * f;
    float size = mix(0.035, 1.0, pow(f, 0.85)) * (0.7 + 0.6 * fract(a3.y * 7.31));
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float rot = a3.y * 6.28 + age * 2.2;
    vec2 q = position.xy;
    q = vec2(q.x * cos(rot) - q.y * sin(rot), q.x * sin(rot) + q.y * cos(rot));
    mv.xy += q * size;
    gl_Position = projectionMatrix * mv;
    vF = f;
    vUv = position.xy + 0.5;
    vSeed = a3.y;
  }`;
const FS = /* glsl */ `
  uniform float uTime;
  varying float vF;
  varying vec2 vUv;
  varying float vSeed;
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec2 c = vUv - 0.5;
    float n = vn(vUv * 3.2 + vSeed * 17.0 + vec2(0.0, -uTime * 2.2)) * 0.6 + vn(vUv * 7.5 - uTime * 3.1 + vSeed * 5.0) * 0.4;
    float r = length(c) * 2.0 + (n - 0.5) * 0.7;
    float a = smoothstep(1.0, 0.15, r);
    // colores en lineal: el tone mapping desatura mucho, así que el naranja tiene que salir MUY rojizo (si no queda crema)
    vec3 col = mix(vec3(1.0, 0.34, 0.05), vec3(1.0, 0.10, 0.008), smoothstep(0.04, 0.28, vF));
    col = mix(col, vec3(0.26, 0.012, 0.002), smoothstep(0.30, 0.80, vF));
    float I = a * (1.0 - smoothstep(0.5, 1.0, vF)) * smoothstep(0.0, 0.05, vF) * (1.25 - vF);
    if (I < 0.004) discard;
    // mezcla "por encima" (no solo aditiva): las partículas apiladas convergen al color del fuego en vez de al blanco,
    // y de día no se lava como vapor
    gl_FragColor = vec4(col * I * 1.3, I * 0.55);
  }`;

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();

export class FireBreath {
  constructor(scene) {
    const g = new THREE.InstancedBufferGeometry();
    const pl = new THREE.PlaneGeometry(1, 1);
    g.index = pl.index;
    g.setAttribute('position', pl.getAttribute('position'));
    this.b0 = new Float32Array(MAX * 4).fill(0);
    for (let i = 0; i < MAX; i++) this.b0[i * 4 + 3] = -1e4;
    this.b1 = new Float32Array(MAX * 4);
    this.b2 = new Float32Array(MAX * 4);
    this.b3 = new Float32Array(MAX * 2);
    this.at = [0, 1, 2, 3].map((k) => new THREE.InstancedBufferAttribute([this.b0, this.b1, this.b2, this.b3][k], k === 3 ? 2 : 4));
    for (const a of this.at) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('a0', this.at[0]); g.setAttribute('a1', this.at[1]); g.setAttribute('a2', this.at[2]); g.setAttribute('a3', this.at[3]);
    g.instanceCount = MAX;
    this.u = { uTime: { value: 0 } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, // aditivo con un poco de hollín
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.head = 0;
    this.emitters = new Map(); // id -> { on, acc, light, origin, dir, hit, n, t }
    this.freeEmitters = [];
    this.lastAlive = -1e9;
    this.onBurn = null; // (emitter) => void: el dueño revisa a quién quema
  }

  // prende/apaga el chorro de un jugador
  set(id, on) {
    let e = this.emitters.get(id);
    if (!e) {
      if (!on) return;
      e = this.freeEmitters.pop() || { on: false, acc: 0, origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), hit: REACH, n: new THREE.Vector3(0, 1, 0), t: 0, light: null, flare: 0 };
      this.emitters.set(id, e);
    }
    if (on && !e.on) e.flare = 1;
    e.on = on;
    if (on) e.t = performance.now();
  }
  isOn(id) { return !!this.emitters.get(id)?.on; }
  remove(id) {
    const e=this.emitters.get(id);if(!e)return;
    e.on=false;e.acc=0;e.flare=0;
    if(e.light){e.light.visible=false;e.light.intensity=e.light.base=0;}
    this.emitters.delete(id);this.freeEmitters.push(e);
  }

  // cada cuadro: dónde está la boca y hacia dónde mira cada emisor (getPose(id, origin, dir) => bool)
  update(dt, time, getPose) {
    this.u.uTime.value = time;
    let any = false;
    for (const [id, e] of this.emitters) {
      // sin noticias en 8 s (se perdió el "apagar"): se apaga solo
      if (e.on && performance.now() - e.t > 8000 && id !== 'me') e.on = false;
      if (e.light) {
        const k = e.on ? 1 : 0;
        e.light.base = e.light.intensity = k * (10 + Math.sin(time * 31) * 2.5 + Math.sin(time * 17.3) * 1.5);
        e.light.visible = k > 0;
      }
      if (!e.on) continue;
      if (!getPose(id, e.origin, e.dir)) continue;
      any = true;
      // hasta dónde llega: la primera pared o el piso en la dirección del chorro
      const hit = surfaceHit(G_phys, e.origin, e.dir, REACH);
      e.surface = hit || null;
      if (hit) { e.hit = Math.max(0.03, hit.dist); e.n.set(hit.nx, hit.ny, hit.nz); } else { e.hit = REACH + 4; e.n.set(0, 1, 0); }
      if (e.light) e.light.position.copy(e.origin).addScaledVector(e.dir, Math.min(2.2, e.hit * 0.6));
      e.acc += dt * RATE;
      while (e.acc >= 1) {
        e.acc -= 1;
        this._spawn(e, time - e.acc / RATE);
      }
    }
    if (any) this.lastAlive = time;
    this.mesh.visible = time - this.lastAlive < 1.2;
    if (this.dirty) {
      for (const a of this.at) a.needsUpdate = true;
      this.dirty = false;
    }
  }

  _spawn(e, t) {
    const i = this.head;
    this.head = (this.head + 1) % MAX;
    const r = Math.random;
    // un cono angosto que se abre un poco
    V1.set(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.16);
    const d = V2.copy(e.dir).add(V1).normalize();
    const j = i * 4;
    this.b0[j] = e.origin.x + d.x * 0.06; this.b0[j + 1] = e.origin.y + d.y * 0.06; this.b0[j + 2] = e.origin.z + d.z * 0.06; this.b0[j + 3] = t;
    this.b1[j] = d.x; this.b1[j + 1] = d.y; this.b1[j + 2] = d.z; this.b1[j + 3] = e.speed ?? (10 + r() * 3.5);
    this.b2[j] = e.n.x; this.b2[j + 1] = e.n.y; this.b2[j + 2] = e.n.z; this.b2[j + 3] = e.hit;
    this.b3[i * 2] = e.life ?? (0.5 + r() * 0.35); this.b3[i * 2 + 1] = r();
    this.dirty = true;
  }

  burst(origin, dir, time, count=12) {
    const e={origin,dir,hit:100,n:new THREE.Vector3(0,1,0),speed:1.2,life:.38};
    for(let i=0;i<count;i++)this._spawn(e,time);
    this.lastAlive=time;this.mesh.visible=true;
  }

  // luces: una virtual del pool por emisor (sin agregar luces reales: eso recompilaría todos los materiales)
  attachLight(id, pool) {
    const e = this.emitters.get(id);
    if (!e || e.light || !pool) return;
    e.light = { position: new THREE.Vector3(), color: new THREE.Color(0xff7a28), intensity: 0, base: 0, distance: 11, decay: 1.6, visible: false, priority: 3 };
    pool.add(e.light);
  }
  // sonido: rugido mientras sale fuego (se llama desde el gancho de ambiente del audio)
  sound(sfx, myId) {
    for (const [id, e] of this.emitters) {
      if (e.flare) { sfx.trigger('fire-flare', id === 'me' || id === myId ? null : e.origin, 0.9); e.flare = 0; }
      if (e.on) sfx._loop('breath-' + id, 'fire', 0.95, id === 'me' ? null : e.origin, { rate: 1.45, full: 4, max: 45 });
    }
  }
}

// la física del mundo (para los choques): la pone main.js
let G_phys = null;
export function setBreathPhysics(p) { G_phys = p; }
