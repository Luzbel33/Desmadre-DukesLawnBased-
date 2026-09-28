// Haces de luna que entran por las ventanas y polvo que flota adentro.
// Es un pase aparte, después de la escena (y antes del bloom): cada haz es un prisma (la abertura de la ventana
// estirada en la dirección de la luna) que se recorre con unos pocos pasos. La profundidad de la escena (la del
// pase de oclusión ambiental) corta el haz contra el piso, las paredes y los muebles, y una caja por cuarto evita
// que atraviese tabiques. El polvo es una nube de puntos alrededor de la cámara que solo brilla adentro de los haces.
import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';

const MAXS = 12; // haces que ve el polvo
const DUST = 3200;
const BOX = 12; // lado del cubo de polvo alrededor de la cámara (m)

const COMMON = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2 uRes;
  uniform mat4 uInvProj, uCamWorld;
  // distancia de la cámara a lo que hay en este píxel (según la profundidad de la escena)
  float sceneDist(vec2 fc, vec3 ro) {
    vec2 suv = fc / uRes;
    float d = texture2D(tDepth, suv).r;
    vec4 v = uInvProj * vec4(suv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    v /= v.w;
    return length((uCamWorld * v).xyz - ro);
  }
  vec2 slab(float o, float d, float lo, float hi) {
    float inv = 1.0 / (abs(d) < 1e-5 ? (d < 0.0 ? -1e-5 : 1e-5) : d);
    float t0 = (lo - o) * inv, t1 = (hi - o) * inv;
    return vec2(min(t0, t1), max(t0, t1));
  }
  float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vn(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h13(i), h13(i + vec3(1, 0, 0)), f.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), f.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
`;

// ---------------------------------------------------------------- haz (prisma oblicuo)
const shaftVS = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const shaftFS = /* glsl */ `
  ${COMMON}
  uniform vec3 uC, uSize, uBMin, uBMax, uColor;
  uniform mat3 uInv;
  uniform vec2 uGlass;
  uniform float uTime, uBars;
  varying vec3 vW;
  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vW - ro);
    float ts = sceneDist(gl_FragCoord.xy, ro);
    vec3 o = uInv * (ro - uC), dd = uInv * rd;
    vec2 a = slab(o.x, dd.x, -uSize.x, uSize.x), b = slab(o.y, dd.y, -uSize.y, uSize.y), c = slab(o.z, dd.z, 0.0, uSize.z);
    vec2 bx = slab(ro.x, rd.x, uBMin.x, uBMax.x), by = slab(ro.y, rd.y, uBMin.y, uBMax.y), bz = slab(ro.z, rd.z, uBMin.z, uBMax.z);
    float t0 = max(max(max(a.x, b.x), max(c.x, bx.x)), max(max(by.x, bz.x), 0.0));
    float t1 = min(min(min(a.y, b.y), min(c.y, bx.y)), min(min(by.y, bz.y), ts));
    if (t1 <= t0) discard;
    // pasos con desfase por píxel (el ruido fino lo tapa el grano)
    float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float dt = (t1 - t0) / 10.0;
    float acc = 0.0;
    for (int i = 0; i < 10; i++) {
      float t = t0 + (float(i) + j) * dt;
      vec3 q = o + dd * t;
      // bordes blandos: la luna no es un láser
      float e = smoothstep(uSize.x, uSize.x * 0.6, abs(q.x)) * smoothstep(uSize.y, max(uSize.y - 0.35, uSize.y * 0.6), abs(q.y));
      // sombra de la cruz de hierro y del emplomado del vidrio (medidos en el plano del vidrio)
      vec2 g = q.xy - uGlass;
      float bars = 1.0;
      if (uBars > 0.5) {
        bars = smoothstep(0.025, 0.06, abs(g.x)) * smoothstep(0.025, 0.06, abs(g.y));
        float l1 = fract((g.x + g.y * 0.833) / 0.375), l2 = fract((g.x - g.y * 0.833) / 0.375);
        bars *= 0.62 + 0.38 * smoothstep(0.02, 0.07, min(min(l1, 1.0 - l1), min(l2, 1.0 - l2)));
      }
      vec3 p = ro + rd * t;
      float n = vn(p * 1.4 + vec3(0.0, -uTime * 0.07, uTime * 0.05)) * 0.65 + vn(p * 3.7 + vec3(uTime * 0.04)) * 0.35;
      float fall = exp(-q.z * 0.07);
      acc += e * bars * fall * (0.25 + 1.1 * n * n);
    }
    float T = acc * dt;
    gl_FragColor = vec4(uColor * (1.0 - exp(-T * 0.8)) / 0.8, 1.0);
  }`;

// ---------------------------------------------------------------- polvo
const dustVS = /* glsl */ `
  #define MAXS ${MAXS}
  attribute vec4 aSeed;
  uniform float uTime, uBox, uPx;
  uniform int uN;
  uniform mat3 uSInv[MAXS];
  uniform vec3 uSC[MAXS], uSSize[MAXS], uSBMin[MAXS], uSBMax[MAXS];
  varying float vB;
  varying vec3 vW;
  void main() {
    // deriva lenta con remolinos; la nube acompaña a la cámara (se envuelve en un cubo)
    float s = aSeed.w * 6.2831;
    vec3 p = aSeed.xyz * uBox + vec3(0.021, -0.009, 0.014) * uTime
      + vec3(sin(uTime * 0.23 + s), sin(uTime * 0.17 + s * 1.7) * 0.6, cos(uTime * 0.19 + s * 2.3)) * 0.18;
    p = cameraPosition + mod(p - cameraPosition + uBox * 0.5, uBox) - uBox * 0.5;
    float b = 0.0;
    for (int i = 0; i < MAXS; i++) {
      if (i >= uN) break;
      vec3 q = uSInv[i] * (p - uSC[i]);
      vec3 sz = uSSize[i];
      if (abs(q.x) < sz.x && abs(q.y) < sz.y && q.z > 0.0 && q.z < sz.z && all(greaterThan(p, uSBMin[i])) && all(lessThan(p, uSBMax[i]))) {
        float e = smoothstep(sz.x, sz.x * 0.6, abs(q.x)) * smoothstep(sz.y, sz.y * 0.7, abs(q.y));
        b = max(b, e * exp(-q.z * 0.07));
      }
    }
    vB = 0.03 + b;
    vW = p;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float d = -mv.z;
    // se ven de cerca: lejos se apagan (y no tapan nada)
    vB *= smoothstep(0.15, 0.5, d) * (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, d));
    gl_PointSize = clamp(uPx * (0.7 + aSeed.w * 0.8) / max(d, 0.1), 1.0, 7.0);
    gl_Position = projectionMatrix * mv;
  }`;
const dustFS = /* glsl */ `
  ${COMMON}
  uniform vec3 uColor;
  uniform float uAmount;
  varying float vB;
  varying vec3 vW;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.1, length(c));
    if (a < 0.01 || vB < 0.002) discard;
    // escondido detrás de algo: no se dibuja
    if (sceneDist(gl_FragCoord.xy, cameraPosition) < length(vW - cameraPosition) - 0.05) discard;
    gl_FragColor = vec4(uColor * vB * a * uAmount, 1.0);
  }`;

export class VolumePass extends Pass {
  constructor(camera, getDepth) {
    super();
    this.needsSwap = false;
    this.camera = camera;
    this.getDepth = getDepth;
    this.vscene = new THREE.Scene();
    this.vscene.matrixWorldAutoUpdate = true;
    this.shafts = [];
    this.storm = null;
    this.zone = null; // { x0, z0, x1, z1 }: se prende con la cámara cerca (los haces se ven también por la puerta)
    this.time = 0;
    this.gain = 1.6;
    this.common = {
      tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uTime: { value: 0 }, uColor: { value: new THREE.Color() },
    };
    this.shaftMats = [];
    this._dust();
  }

  // haces: [{ c: Vector3, u, v, d (dirección de la luz), hw, hh, len, glass: [ga, gb], bars, bmin, bmax }]
  setShafts(list, storm, zone) {
    this.storm = storm;
    this.zone = zone;
    for (const m of this.shaftMats) m.dispose();
    this.shaftMats = [];
    this.vscene.children.filter((o) => o.userData.shaft).forEach((o) => { o.geometry.dispose(); this.vscene.remove(o); });
    this.shafts = list;
    const du = this.dust.material.uniforms;
    du.uN.value = Math.min(MAXS, list.length);
    list.forEach((s, i) => {
      // matriz mundo -> prisma: columnas u, v, d
      const M3 = new THREE.Matrix3().set(s.u.x, s.v.x, s.d.x, s.u.y, s.v.y, s.d.y, s.u.z, s.v.z, s.d.z);
      const inv = M3.clone().invert();
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          ...this.common,
          uC: { value: s.c.clone() }, uInv: { value: inv }, uSize: { value: new THREE.Vector3(s.hw, s.hh, s.len) },
          uBMin: { value: s.bmin.clone() }, uBMax: { value: s.bmax.clone() },
          uGlass: { value: new THREE.Vector2(...s.glass) }, uBars: { value: s.bars ? 1 : 0 },
        },
        vertexShader: shaftVS, fragmentShader: shaftFS,
        transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
      });
      this.shaftMats.push(mat);
      // prisma: las 8 esquinas (abertura y su proyección a lo largo de la luz)
      const P = [];
      for (const t of [0, s.len]) for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        P.push(s.c.clone().addScaledVector(s.u, a * s.hw).addScaledVector(s.v, b * s.hh).addScaledVector(s.d, t));
      }
      const idx = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0];
      const g = new THREE.BufferGeometry().setFromPoints(P);
      g.setIndex(idx);
      // que las caras miren hacia afuera (el orden depende de la base u, v, d)
      if (new THREE.Vector3().crossVectors(s.u, s.v).dot(s.d) > 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } }
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.userData.shaft = true;
      mesh.userData.on = s.on || null;
      mesh.frustumCulled = true;
      this.vscene.add(mesh);
      if (i < MAXS) {
        du.uSInv.value[i].copy(inv);
        du.uSC.value[i].copy(s.c);
        du.uSSize.value[i].set(s.hw, s.hh, s.len);
        du.uSBMin.value[i].copy(s.bmin);
        du.uSBMax.value[i].copy(s.bmax);
      }
    });
  }

  _dust() {
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(DUST * 4);
    let s = 1234567;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 4294967296; };
    for (let i = 0; i < DUST * 4; i++) seed[i] = rnd();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const arr = (n, f) => Array.from({ length: n }, f);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.common,
        uBox: { value: BOX }, uPx: { value: 3 }, uAmount: { value: 0 }, uN: { value: 0 },
        uSInv: { value: arr(MAXS, () => new THREE.Matrix3()) }, uSC: { value: arr(MAXS, () => new THREE.Vector3()) },
        uSSize: { value: arr(MAXS, () => new THREE.Vector3()) }, uSBMin: { value: arr(MAXS, () => new THREE.Vector3()) },
        uSBMax: { value: arr(MAXS, () => new THREE.Vector3()) },
      },
      vertexShader: dustVS, fragmentShader: dustFS,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.dust = new THREE.Points(g, mat);
    this.dust.frustumCulled = false;
    this.vscene.add(this.dust);
  }

  render(renderer, writeBuffer, readBuffer) {
    const st = this.storm, cam = this.camera, z = this.zone;
    if (!st || !this.shafts.length || st.s < 0.02) return;
    const p = cam.position;
    if (z && (p.x < z.x0 || p.x > z.x1 || p.z < z.z0 || p.z > z.z1)) return;
    const depth = this.getDepth();
    if (!depth) return;
    const c = this.common;
    c.tDepth.value = depth;
    c.uRes.value.set(readBuffer.width, readBuffer.height);
    c.uInvProj.value.copy(cam.projectionMatrixInverse);
    c.uCamWorld.value.copy(cam.matrixWorld);
    c.uTime.value = this.time;
    // color de la luna (el relámpago la dispara; adentro llega colado)
    const ml = st.flashLight;
    const k = Math.min(2.4, 0.12 + ml.intensity * 0.3) * st.s;
    c.uColor.value.setRGB(0.55, 0.66, 0.92).multiplyScalar(k * 0.16 * this.gain);
    const du = this.dust.material.uniforms;
    du.uAmount.value = st.indoor * 3.2;
    du.uPx.value = readBuffer.height * 0.012;
    this.dust.visible = st.indoor > 0.02;
    for (const o of this.vscene.children) if (o.userData.on) o.visible = o.userData.on();
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer);
    renderer.render(this.vscene, cam);
    renderer.autoClear = ac;
  }
}
