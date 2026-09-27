// Post-proceso: efectos de borrachera, estar fumado, daño y KO.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

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
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tPrev;
    uniform float uTime, uDrunk, uHigh, uHurt, uLowBlood, uBlack, uSmoke;
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
      // ondas psicodélicas
      uv += h * 0.006 * vec2(sin(uTime * 2.1 + uv.y * 24.0), sin(uTime * 1.8 + uv.x * 21.0));
      // caleidoscopio suave cuando está muy fumado
      if (h > 0.85) {
        vec2 c = uv - 0.5;
        float r = length(c);
        float a = atan(c.y, c.x);
        float seg = 3.14159 / 4.0;
        float a2 = abs(mod(a + uTime * 0.05, seg * 2.0) - seg);
        vec2 kal = vec2(cos(a2), sin(a2)) * r + 0.5;
        uv = mix(uv, kal, clamp((h - 0.85) * 1.2, 0.0, 0.45));
      }
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
      // aberración cromática (fumado)
      if (h > 0.05) {
        float ca = 0.004 + h * 0.006;
        col.r = mix(col.r, texture2D(tDiffuse, uv + vec2(ca, 0.0)).r, clamp(h * 1.5, 0.0, 1.0));
        col.b = mix(col.b, texture2D(tDiffuse, uv - vec2(ca, 0.0)).b, clamp(h * 1.5, 0.0, 1.0));
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(lum), col, 1.0 + h * 0.9);
        col = hue(col, h * 0.9 * sin(uTime * 0.35));
        // estelas (se mezcla con el frame anterior)
        vec3 prev = texture2D(tPrev, vUv).rgb;
        col = mix(col, max(col, prev), clamp(h * 0.55, 0.0, 0.7));
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
    if (this.uniforms.uHigh.value > 0.05) {
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
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.renderPass.clearAlpha = 0;
    this.intox = new IntoxPass();
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    // brillo suave en lo que emite luz (neones, lamparitas, fuego, el sol): solo pasa lo que supera el umbral HDR
    if (opts.bloom !== false) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.5, 0.35, 1.8);
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
    this.composer.addPass(this.output);
    this.u = this.intox.uniforms;
  }
  setSize(w, h) {
    this.composer.setSize(w, h);
  }
  setPixelRatio(pr) {
    this.composer.setPixelRatio(pr);
  }
  render(dt) {
    const u = this.u;
    const active = u.uDrunk.value > 0.01 || u.uHigh.value > 0.01 || u.uHurt.value > 0.01 || u.uLowBlood.value > 0.01 || u.uBlack.value > 0.001 || u.uSmoke.value > 0.01;
    this.intox.enabled = active;
    this.composer.render(dt);
  }
}
