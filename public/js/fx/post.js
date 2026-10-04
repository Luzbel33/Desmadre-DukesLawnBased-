// Post-proceso: efectos de borrachera, estar fumado, daño y KO.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { N8AOPass } from '../../vendor/n8ao/N8AO.js';
import { VolumePass } from './volume.js';

// ---------------------------------------------------------------- pase final "de cine"
// Reemplaza al OutputPass: exposición, tone mapping ACES, gradación de color por zona (día / tormenta / adentro),
// contraste en curva, tinte de sombras y luces, viñeta, grano de película, aberración cromática suave en los bordes
// y dithering (en las escenas oscuras con niebla, sin esto se ven escalones de color).
export const GRADES = {
  day: { exposure: 0.9, white: [1.0, 0.99, 0.97], sat: 1.02, contrast: 0.16, lift: [0.0, 0.004, 0.012], gamma: 1.0, gain: [1.02, 1.0, 0.97], shadow: [-0.01, 0.02, 0.05], high: [0.05, 0.025, -0.01], vignette: 0.16, grain: 0.007, ca: 0.08 },
  storm: { exposure: 1.7, white: [0.9, 0.97, 1.08], sat: 0.74, contrast: 0.2, lift: [0.006, 0.012, 0.024], gamma: 1.04, gain: [0.95, 0.99, 1.06], shadow: [-0.02, 0.02, 0.07], high: [0.1, 0.045, -0.02], vignette: 0.25, grain: 0.012, ca: 0.12 },
  indoor: { exposure: 1.85, white: [1.06, 0.99, 0.9], sat: 0.84, contrast: 0.18, lift: [0.004, 0.004, 0.009], gamma: 1.0, gain: [1.05, 0.98, 0.9], shadow: [0.0, 0.0, 0.05], high: [0.12, 0.05, -0.03], vignette: 0.28, grain: 0.012, ca: 0.1 },
};
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uExposure: { value: 0.9 }, uWhite: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1 }, uContrast: { value: 0.2 },
    uLift: { value: new THREE.Vector3() }, uGamma: { value: 1 }, uGain: { value: new THREE.Vector3(1, 1, 1) },
    uShadow: { value: new THREE.Vector3() }, uHigh: { value: new THREE.Vector3() },
    uVignette: { value: 0.25 }, uGrain: { value: 0.02 }, uCA: { value: 0.5 }, uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uExposure, uSat, uContrast, uGamma, uVignette, uGrain, uCA, uFlash;
    uniform vec2 uRes;
    uniform vec3 uWhite, uLift, uGain, uShadow, uHigh;
    varying vec2 vUv;
    // ACES ajustado (Stephen Hill)
    const mat3 gACESIn = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
    const mat3 gACESOut = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
    vec3 gRRT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 gAces(vec3 c) { c = gACESIn * c; c = gRRT(c); return clamp(gACESOut * c, 0.0, 1.0); }
    vec3 gSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float gH12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 col = base.rgb;
      if (uCA > 0.0) {
        vec2 off = d * r2 * 0.012 * uCA;
        col.r = texture2D(tDiffuse, vUv - off).r;
        col.b = texture2D(tDiffuse, vUv + off).b;
      }
      col *= uExposure * uWhite;
      col = gSRGB(gAces(col));
      // lift / gamma / gain
      col = max(col * uGain + uLift * (1.0 - col), 0.0);
      col = pow(col, vec3(1.0 / uGamma));
      // contraste en curva S (no quema: mezcla con smoothstep)
      col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      // tinte de sombras (frío) y de luces (cálido)
      col += uShadow * (1.0 - smoothstep(0.0, 0.45, l)) + uHigh * smoothstep(0.45, 1.0, l);
      // relámpago: la pantalla se lava de blanco azulado un instante
      col = mix(col, vec3(0.82, 0.88, 1.0) * max(l, 0.35) * 1.4, clamp(uFlash, 0.0, 1.0) * 0.35);
      // viñeta
      col *= 1.0 - uVignette * smoothstep(0.08, 0.62, r2 * 1.9);
      // grano (más en las sombras, como en película) + dithering
      vec2 px = vUv * uRes;
      float g = gH12(px + fract(uTime * 13.7) * 1000.0) - 0.5;
      col += g * uGrain * (1.1 - l * 0.7);
      col += (gH12(px * 1.37 + 17.0) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), base.a);
    }`,
};
class GradePass extends Pass {
  constructor() {
    super();
    this.uniforms = THREE.UniformsUtils.clone(GradeShader.uniforms);
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: GradeShader.vertexShader, fragmentShader: GradeShader.fragmentShader, depthTest: false, depthWrite: false });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  setSize(w, h) { this.uniforms.uRes.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function mixGrade(a, b, t) {
  const o = {};
  for (const k of Object.keys(a)) o[k] = Array.isArray(a[k]) ? lerp3(a[k], b[k], t) : a[k] + (b[k] - a[k]) * t;
  return o;
}

const IntoxShader = {
  uniforms: {
    tDiffuse: { value: null },
    tPrev: { value: null },
    uTime: { value: 0 },
    uDrunk: { value: 0 },
    uHigh: { value: 0 },
    uHurt: { value: 0 },
    uLowBlood: { value: 0 },
    uBlack: { value: 0 },
    uSmoke: { value: 0 },
    uPill: { value: 0 },
    uSpeed: { value: 0 },
    uAcid: { value: 0 },
    uKeta: { value: 0 },
    uDmt: { value: 0 },
    uShroom: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tPrev;
    uniform float uTime, uDrunk, uHigh, uHurt, uLowBlood, uBlack, uSmoke, uPill, uSpeed, uAcid, uKeta, uDmt, uShroom;
    uniform vec2 uRes;
    varying vec2 vUv;
    vec3 hue(vec3 c, float a) {
      const vec3 k = vec3(0.57735);
      float ca = cos(a);
      return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
    }
    void main() {
      vec2 uv = vUv;
      float d = clamp(uDrunk, 0.0, 1.5);
      float h = clamp(uHigh, 0.0, 1.5);
      // ondulación de borracho
      uv += d * 0.011 * vec2(sin(uTime * 1.3 + uv.y * 5.0), cos(uTime * 1.05 + uv.x * 4.0));
      float ac = clamp(uAcid, 0.0, 1.5), kt = clamp(uKeta, 0.0, 1.5), dm = clamp(uDmt, 0.0, 1.5), sh = clamp(uShroom, 0.0, 1.5);
      // faso: apenas un vaivén lento (pesado, no psicodélico)
      uv += h * 0.0014 * vec2(sin(uTime * 0.55 + uv.y * 2.0), cos(uTime * 0.47 + uv.x * 2.0));
      // ácido: ondas y, si es mucho, caleidoscopio
      uv += ac * 0.007 * vec2(sin(uTime * 2.1 + uv.y * 24.0), sin(uTime * 1.8 + uv.x * 21.0));
      if (ac > 0.6) {
        vec2 c = uv - 0.5;
        float r = length(c);
        float a = atan(c.y, c.x);
        float seg = 3.14159 / 4.0;
        float a2 = abs(mod(a + uTime * 0.05, seg * 2.0) - seg);
        vec2 kal = vec2(cos(a2), sin(a2)) * r + 0.5;
        uv = mix(uv, kal, clamp((ac - 0.6) * 0.9, 0.0, 0.45));
      }
      // hongos: las paredes respiran y se derriten para abajo
      if (sh > 0.01) {
        vec2 c = uv - 0.5;
        uv = 0.5 + c * (1.0 - sh * 0.02 * sin(uTime * 1.3));
        uv += sh * vec2(0.006 * sin(uv.y * 6.0 + uTime * 0.9), 0.005 * sin(uv.x * 9.0 + uTime * 0.7) + 0.004 * sin(uv.x * 31.0 + uTime * 1.6));
      }
      // keta: el mundo se aleja (zoom out lento y deriva)
      if (kt > 0.01) {
        vec2 c = uv - 0.5;
        uv = 0.5 + c * (1.0 + kt * 0.12) + kt * 0.02 * vec2(sin(uTime * 0.21), cos(uTime * 0.17));
      }
      // DMT: caleidoscopio de seis que gira
      if (dm > 0.01) {
        vec2 c = uv - 0.5;
        float r = length(c), a = atan(c.y, c.x) + uTime * 0.25;
        float seg = 3.14159 / 6.0;
        float a2 = abs(mod(a, seg * 2.0) - seg);
        uv = mix(uv, vec2(cos(a2), sin(a2)) * r * (1.0 + 0.1 * sin(uTime * 2.0 + r * 12.0)) + 0.5, clamp(dm * 0.75, 0.0, 0.8));
      }
      // pastilla: el mundo respira (zoom que late) y se ondula en anillos
      float pl = clamp(uPill, 0.0, 1.5);
      if (pl > 0.01) {
        vec2 c = uv - 0.5;
        float br = 1.0 - pl * 0.035 * (0.5 + 0.5 * sin(uTime * 4.2));
        uv = 0.5 + c * br + pl * 0.004 * vec2(sin(length(c) * 40.0 - uTime * 6.0), cos(length(c) * 40.0 - uTime * 6.0));
      }
      // línea: temblor fino y todo más nítido y cerrado
      float sp = clamp(uSpeed, 0.0, 1.5);
      if (sp > 0.01) uv += sp * 0.0016 * vec2(sin(uTime * 97.0), cos(uTime * 83.0));
      vec4 base = texture2D(tDiffuse, uv);
      vec3 col = base.rgb;
      // visión doble
      float dv = d * 0.022 * (0.65 + 0.35 * sin(uTime * 0.8));
      if (d > 0.05) {
        vec3 c2 = texture2D(tDiffuse, uv + vec2(dv, dv * 0.35)).rgb;
        col = mix(col, (col + c2) * 0.5, clamp(d * 1.4, 0.0, 1.0));
        // desenfoque radial
        vec2 dir = (uv - 0.5) * 0.02 * d;
        vec3 acc = col;
        for (int i = 1; i < 5; i++) acc += texture2D(tDiffuse, uv - dir * float(i)).rgb;
        col = mix(col, acc / 5.0, clamp(d, 0.0, 1.0) * 0.6);
      }
      // faso: colores un poco más vivos y cálidos, todo suave y una estela mínima
      if (h > 0.05) {
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(lum), col, 1.0 + h * 0.3);
        col *= mix(vec3(1.0), vec3(1.05, 1.02, 0.94), clamp(h, 0.0, 1.0));
        vec3 soft = (texture2D(tDiffuse, uv + vec2(0.0015, 0.0)).rgb + texture2D(tDiffuse, uv - vec2(0.0015, 0.0)).rgb + texture2D(tDiffuse, uv + vec2(0.0, 0.0015)).rgb + texture2D(tDiffuse, uv - vec2(0.0, 0.0015)).rgb) * 0.25;
        col = mix(col, soft, clamp(h * 0.3, 0.0, 0.35));
        vec3 prev = texture2D(tPrev, vUv).rgb;
        col = mix(col, max(col, prev), clamp(h * 0.12, 0.0, 0.18));
      }
      // ácido: aberración cromática, saturación a full, colores que giran y estelas
      if (ac > 0.05) {
        float ca = 0.004 + ac * 0.006;
        col.r = mix(col.r, texture2D(tDiffuse, uv + vec2(ca, 0.0)).r, clamp(ac * 1.5, 0.0, 1.0));
        col.b = mix(col.b, texture2D(tDiffuse, uv - vec2(ca, 0.0)).b, clamp(ac * 1.5, 0.0, 1.0));
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(lum), col, 1.0 + ac * 1.1);
        col = hue(col, ac * 1.4 * sin(uTime * 0.35));
        vec3 prev = texture2D(tPrev, vUv).rgb;
        col = mix(col, max(col, prev), clamp(ac * 0.6, 0.0, 0.75));
      }
      // hongos: verdes y violetas más intensos, bordes que brillan un poco
      if (sh > 0.05) {
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(lum), col, 1.0 + sh * 0.6);
        col = hue(col, sh * 0.35 * sin(uTime * 0.2 + vUv.y * 3.0));
        vec3 e = abs(texture2D(tDiffuse, uv + vec2(0.002, 0.0)).rgb - texture2D(tDiffuse, uv - vec2(0.002, 0.0)).rgb);
        col += vec3(0.3, 1.0, 0.6) * dot(e, vec3(0.5)) * sh * 0.8;
      }
      // keta: fantasmas largos, sin color y un túnel oscuro
      if (kt > 0.05) {
        vec3 prev = texture2D(tPrev, vUv).rgb;
        col = mix(col, prev, clamp(kt * 0.7, 0.0, 0.82));
        vec3 ghost = texture2D(tDiffuse, uv + kt * 0.03 * vec2(sin(uTime * 0.3), cos(uTime * 0.23))).rgb;
        col = mix(col, (col + ghost) * 0.5, clamp(kt, 0.0, 1.0) * 0.6);
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, vec3(lum) * vec3(0.9, 0.95, 1.05), clamp(kt * 0.7, 0.0, 0.8));
        vec2 qq = vUv - 0.5;
        col *= 1.0 - smoothstep(0.08, 0.5, length(qq)) * clamp(kt, 0.0, 1.0) * 0.85;
      }
      // DMT: mandala de luz encima de todo y destellos blancos
      if (dm > 0.05) {
        vec2 c = vUv - 0.5; c.x *= uRes.x / max(uRes.y, 1.0);
        float r = length(c), a = atan(c.y, c.x);
        float pat = sin(a * 12.0 + uTime * 1.5) * sin(r * 40.0 - uTime * 4.0) + sin(a * 6.0 - uTime) * cos(r * 25.0 + uTime * 2.0);
        vec3 lines = hue(vec3(1.0, 0.3, 0.8), uTime * 1.2 + r * 6.0 + a) * smoothstep(0.6, 1.0, abs(pat));
        col = col * (1.0 + dm * 0.5) + lines * clamp(dm, 0.0, 1.0) * 0.9;
        col = hue(col, dm * uTime * 0.6);
        col += vec3(1.0) * clamp(dm - 0.9, 0.0, 0.6) * pow(0.5 + 0.5 * sin(uTime * 1.3), 8.0);
      }
      // pastilla: arcoíris que gira, estrobo suave y bordes de colores
      if (pl > 0.01) {
        col = mix(col, hue(col, uTime * 1.7), clamp(pl, 0.0, 1.0) * 0.8);
        float lum2 = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(lum2), col, 1.0 + pl * 0.8);
        col *= 1.0 + pl * 0.25 * step(0.8, fract(uTime * 2.1));
        vec3 e = abs(texture2D(tDiffuse, uv + vec2(0.003, 0.0)).rgb - texture2D(tDiffuse, uv - vec2(0.003, 0.0)).rgb);
        col += hue(vec3(1.0, 0.2, 0.6), uTime * 2.0 + uv.y * 6.0) * dot(e, vec3(0.6)) * pl * 1.6;
      }
      // línea: visión de túnel (los bordes se estiran hacia afuera) y más contraste
      if (sp > 0.01) {
        vec2 dirT = (uv - 0.5) * 0.035 * sp;
        vec3 acc2 = col;
        for (int i = 1; i < 5; i++) acc2 += texture2D(tDiffuse, uv - dirT * float(i)).rgb;
        float edgeK = smoothstep(0.1, 0.5, length(vUv - 0.5));
        col = mix(col, acc2 / 5.0, edgeK * clamp(sp, 0.0, 1.0));
        col = (col - 0.5) * (1.0 + sp * 0.35) + 0.5;
      }
      // humo alrededor (hotbox)
      col = mix(col, vec3(0.75, 0.78, 0.75) * (0.6 + 0.4 * dot(col, vec3(0.33))), clamp(uSmoke, 0.0, 0.75));
      // viñeta cálida del escabio
      vec2 q = vUv - 0.5;
      float vig = dot(q, q);
      col *= 1.0 - vig * (0.4 + d * 1.2 + uLowBlood * 1.8);
      col = mix(col, col * vec3(1.08, 0.96, 0.85), clamp(d, 0.0, 1.0) * 0.4);
      // sangre baja: desaturado
      float l2 = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l2) * vec3(1.0, 0.8, 0.8), clamp(uLowBlood, 0.0, 1.0) * 0.8);
      // golpe: bordes rojos
      col = mix(col, vec3(0.6, 0.0, 0.0), clamp(uHurt, 0.0, 1.0) * smoothstep(0.05, 0.35, vig) * 0.85);
      // desmayo / muerte
      col *= 1.0 - clamp(uBlack, 0.0, 1.0);
      gl_FragColor = vec4(col, texture2D(tDiffuse, vUv).a);
    }
  `,
};

class IntoxPass extends Pass {
  constructor() {
    super();
    this.uniforms = THREE.UniformsUtils.clone(IntoxShader.uniforms);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: IntoxShader.vertexShader,
      fragmentShader: IntoxShader.fragmentShader,
    });
    this.fsQuad = new FullScreenQuad(this.material);
    this.prev = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.copyMat = new THREE.MeshBasicMaterial({ transparent: false });
    this.copyQuad = new FullScreenQuad(this.copyMat);
  }
  setSize(w, h) {
    this.prev.setSize(w, h);
    this.uniforms.uRes.value.set(w, h);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tPrev.value = this.prev.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
    // guardar este frame para las estelas
    if (this.uniforms.uHigh.value > 0.05 || this.uniforms.uAcid.value > 0.05 || this.uniforms.uKeta.value > 0.05) {
      this.copyMat.map = this.renderToScreen ? readBuffer.texture : writeBuffer.texture;
      renderer.setRenderTarget(this.prev);
      this.copyQuad.render(renderer);
    }
  }
}

export class Post {
  constructor(renderer, scene, camera, opts = {}) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const useAO = opts.ao !== false;
    // con oclusión ambiental, la escena se dibuja (con MSAA) adentro del pase de AO: el compositor solo pasa filtros
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: useAO ? 0 : 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.renderPass.clearAlpha = 0;
    this.intox = new IntoxPass();
    this.grade = new GradePass();
    this.gradeState = { ...GRADES.day };
    if (useAO) {
      this.renderPass.enabled = false;
      this.composer.addPass(this.renderPass);
      // N8AO: sombra de contacto en rincones, pies de muebles y paredes (lo que más "asienta" la escena)
      const w = size.x * pr, h = size.y * pr;
      const ao = new N8AOPass(scene, camera, w, h);
      const bt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType, format: THREE.RGBAFormat, stencilBuffer: false, samples: 4 });
      bt.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
      bt.depthTexture.format = THREE.DepthFormat;
      ao.beautyRenderTarget.dispose();
      ao.beautyRenderTarget = bt;
      const c = ao.configuration;
      c.gammaCorrection = false;
      c.halfRes = true;
      c.depthAwareUpsampling = true;
      c.aoSamples = 8;
      c.denoiseSamples = 4;
      c.denoiseRadius = 8;
      c.aoRadius = 1.4;
      c.distanceFalloff = 1.0;
      c.intensity = 2.2;
      c.color = new THREE.Color(0, 0, 0);
      c.screenSpaceRadius = false;
      this.ao = ao;
      this.composer.addPass(ao);
      // haces de luna y polvo (se cortan con la profundidad de la escena que deja este pase)
      this.vol = new VolumePass(camera, () => this.ao.beautyRenderTarget.depthTexture);
      this.composer.addPass(this.vol);
    } else this.composer.addPass(this.renderPass);
    // brillo suave en lo que emite luz (neones, lamparitas, fuego, el sol): solo pasa lo que supera el umbral HDR
    if (opts.bloom !== false) {
      // umbral alto: brillan los neones, las lamparitas, el fuego y el sol, no una silla blanca bajo una lámpara
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.38, 0.35, 2.5);
      // umbral suave: solo suma lo que EXCEDE el umbral (neones, lamparitas, fuego, el disco del sol).
      // El cielo brillante alrededor del sol queda casi afuera; con el umbral duro lavaba la pantalla.
      const hp = this.bloom.materialHighPassFilter;
      hp.fragmentShader = hp.fragmentShader.replace(
        /vec4 texel = texture2D\( tDiffuse, vUv \);[\s\S]*gl_FragColor = mix\( outputColor, texel, alpha \);/,
        `vec4 texel = texture2D( tDiffuse, vUv );
        vec3 c = min( texel.rgb, vec3( 3.0 ) );
        float v = luminance( c );
        float k = max( v - luminosityThreshold, 0.0 ) / max( v, 1e-4 );
        gl_FragColor = vec4( c * k, 0.0 );`, // alfa 0: no tapa los huecos de las pantallas de YouTube
      );
      hp.needsUpdate = true;
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(this.intox);
    this.composer.addPass(this.grade);
    this.u = this.intox.uniforms;
    this.exposure = renderer.toneMappingExposure || 1;
  }
  setQuality(preset) {
    // 'Mínimo': el pase final sin aberración ni grano (dos lecturas de textura menos por píxel)
    this.lite = !!preset.lite;
    if (this.bloom) this.bloom.enabled = preset.bloom;
    if (this.ao) {
      this.ao.enabled = preset.aoSamples > 0;
      this.renderPass.enabled = !this.ao.enabled;
      this.ao.configuration.aoSamples = Math.max(4, preset.aoSamples);
      if (this.ao.beautyRenderTarget.samples !== preset.msaa) {
        this.ao.beautyRenderTarget.samples = preset.msaa;
        this.ao.beautyRenderTarget.dispose();
      }
    }
  }
  // gradación: se mezcla entre día, tormenta y adentro (0..1 cada factor)
  setZone(storm = 0, indoor = 0, flash = 0, time = 0) {
    let g = mixGrade(GRADES.day, GRADES.storm, storm);
    if (indoor > 0.001) g = mixGrade(g, GRADES.indoor, indoor * storm);
    const u = this.grade.uniforms;
    u.uExposure.value = g.exposure * (this.exposure / 0.86);
    u.uWhite.value.set(...g.white);
    u.uSat.value = g.sat * (this.atmosphere?.saturation || 1);
    u.uContrast.value = g.contrast * (this.atmosphere?.contrast || 1);
    u.uLift.value.set(...g.lift);
    u.uGamma.value = g.gamma;
    u.uGain.value.set(...g.gain);
    u.uShadow.value.set(...g.shadow);
    u.uHigh.value.set(...g.high);
    u.uVignette.value = g.vignette;
    u.uGrain.value = this.lite ? 0 : g.grain;
    u.uCA.value = this.lite ? 0 : g.ca;
    u.uFlash.value = flash;
    u.uTime.value = time;
    // la oclusión ambiental pesa más de noche y adentro (rincones oscuros)
    if (this.ao) this.ao.configuration.intensity = 1.35 + storm * 0.2;
    if (this.vol) this.vol.time = time;
  }
  setSize(w, h) {
    this.composer.setSize(w, h);
  }
  setPixelRatio(pr) {
    this.composer.setPixelRatio(pr);
  }
  render(dt) {
    // El contador cubre TODOS los pases, no sólo el triángulo del filtro final.
    this.composer.renderer.info.autoReset = false;
    this.composer.renderer.info.reset();
    const u = this.u;
    const active = u.uDrunk.value > 0.01 || u.uHigh.value > 0.01 || u.uAcid.value > 0.01 || u.uKeta.value > 0.01 || u.uDmt.value > 0.01 || u.uShroom.value > 0.01 || u.uPill.value > 0.01 || u.uSpeed.value > 0.01 || u.uHurt.value > 0.01 || u.uLowBlood.value > 0.01 || u.uBlack.value > 0.001 || u.uSmoke.value > 0.01;
    this.intox.enabled = active;
    this.composer.render(dt);
  }
}
