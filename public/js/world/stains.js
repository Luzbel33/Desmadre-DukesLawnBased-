// Manchas: filtraciones, humedad que sube, hollín, moho, mugre, rajaduras y sangre (atlas decals_color/alpha/
// normal, hecho en assets/blender/decals.py). Dos mallas instanciadas:
// - la mugre MULTIPLICA el color de lo que tiene detrás: la pared conserva su luz, su relieve y sus sombras;
// - la sangre es un material iluminado y húmedo (brilla con las velas y la luna, el borde de cada gota tiene
//   relieve): en un cuarto oscuro una mancha que solo oscurece no se ve.
import * as THREE from 'three';

export const STAIN = { leak1: 0, leak2: 1, leak3: 2, damp: 3, soot: 4, mold: 5, grime: 6, crack: 7, splat: 8, spray: 9, smear: 10, hands: 11, drips: 12, pool: 13, scratch: 14, feet: 15 };
const BLOOD = new Set([STAIN.splat, STAIN.spray, STAIN.smear, STAIN.hands, STAIN.drips, STAIN.pool, STAIN.feet]);
const N = 4;
const INSET = 0.004; // margen dentro de cada celda (el mipmap no mezcla vecinas)

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const V3 = new THREE.Vector3();
const M = new THREE.Matrix4();
const MR = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const P = new THREE.Vector3();
const SC = new THREE.Vector3();

class Batch {
  constructor(max) {
    this.max = max;
    this.n = 0;
    this.rect = new Float32Array(max * 4);
    this.tint = new Float32Array(max * 4);
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.aRect = new THREE.InstancedBufferAttribute(this.rect, 4);
    this.aTint = new THREE.InstancedBufferAttribute(this.tint, 4);
    this.geo.setAttribute('aRect', this.aRect);
    this.geo.setAttribute('aTint', this.aTint);
  }
}

export class Stains {
  constructor(scene, max = 900) {
    this.scene = scene;
    const px = (r, g, b) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.needsUpdate = true; return t; };
    // ---- mugre (multiplicativa)
    this.mulB = new Batch(max);
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tColor: { value: px(255, 255, 255) }, tAlpha: { value: px(0, 0, 0) } }]);
    const mulMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      fog: true, transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.MultiplyBlending,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      vertexShader: /* glsl */ `
        attribute vec4 aRect;
        attribute vec4 aTint;
        varying vec2 vUv;
        varying vec4 vTint;
        #include <fog_pars_vertex>
        void main() {
          vUv = aRect.xy + uv * aRect.zw;
          vTint = aTint;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor, tAlpha;
        varying vec2 vUv;
        varying vec4 vTint;
        #include <fog_pars_fragment>
        void main() {
          float a = texture2D(tAlpha, vUv).g * vTint.a;
          vec3 c = texture2D(tColor, vUv).rgb * vTint.rgb;
          #ifdef FOG_EXP2
            a *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #endif
          gl_FragColor = vec4(mix(vec3(1.0), c, clamp(a, 0.0, 1.0)), 1.0);
        }`,
    });
    this.mul = this._mesh(this.mulB, mulMat, -10);
    // ---- sangre (iluminada, húmeda)
    this.litB = new Batch(Math.ceil(max / 3));
    this.litMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.42, 0.3, 0.3), roughness: 0.26, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      map: px(80, 4, 5), alphaMap: px(0, 0, 0), normalMap: px(128, 128, 255),
    });
    this.litMat.normalScale.set(1, 1);
    this.litMat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec4 aRect;\nattribute vec4 aTint;\nvarying vec4 vTintS;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        vTintS = aTint;
        vec2 stUv = aRect.xy + uv * aRect.zw;
        #ifdef USE_MAP
          vMapUv = stUv;
        #endif
        #ifdef USE_ALPHAMAP
          vAlphaMapUv = stUv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = stUv;
        #endif`);
      sh.fragmentShader = 'varying vec4 vTintS;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= vTintS.rgb;')
        .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n  diffuseColor.a *= vTintS.a;\n  if (diffuseColor.a < 0.01) discard;')
        // más espesa, más brillante; el borde fino ya está seco
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.75, roughnessFactor, smoothstep(0.2, 0.8, diffuseColor.a));');
    };
    this.litMat.customProgramCacheKey = () => 'stain-blood';
    this.lit = this._mesh(this.litB, this.litMat, -9);
    this.lit.receiveShadow = true;
    if (typeof document !== 'undefined') {
      const L = new THREE.TextureLoader();
      let left = 3;
      const done = () => { if (--left === 0) { this.mul.visible = this.lit.visible = true; } };
      const load = (file, cb) => L.load(`assets/tex/${file}.jpg`, (t) => { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; cb(t); done(); });
      load('decals_color', (t) => { this.uniforms.tColor.value = t; this.litMat.map = t; this.litMat.needsUpdate = true; });
      load('decals_alpha', (t) => { this.uniforms.tAlpha.value = t; this.litMat.alphaMap = t; this.litMat.needsUpdate = true; });
      load('decals_normal', (t) => { this.litMat.normalMap = t; this.litMat.needsUpdate = true; });
    }
  }

  _mesh(b, mat, order) {
    const m = new THREE.InstancedMesh(b.geo, mat, b.max);
    m.count = 0;
    m.renderOrder = order; // justo después de lo opaco, antes de niebla, llamas y vidrios
    m.castShadow = false;
    m.frustumCulled = false;
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  get n() { return this.mulB.n + this.litB.n; }

  // cell: STAIN.*; centro (x, y, z); normal (nx, ny, nz) hacia donde mira la cara; ancho w y alto h (m).
  // rot: giro en el plano; flip: espejado; tint: [r, g, b] que multiplica el color; opacity: 0..1
  add(cell, x, y, z, nx, ny, nz, w, h, { rot = 0, flip = false, tint = null, opacity = 1, off = 0.012 } = {}) {
    const blood = BLOOD.has(cell);
    const b = blood ? this.litB : this.mulB, mesh = blood ? this.lit : this.mul;
    if (b.n >= b.max) return -1;
    const i = b.n++;
    const col = cell % N, row = Math.floor(cell / N);
    b.rect.set([col / N + INSET, 1 - (row + 1) / N + INSET, 1 / N - INSET * 2, 1 / N - INSET * 2], i * 4);
    b.tint.set([tint ? tint[0] : 1, tint ? tint[1] : 1, tint ? tint[2] : 1, opacity], i * 4);
    // base: z = normal, y = "arriba" en el plano (para el piso, hacia -z del mundo), x = y × z
    const zA = V1.set(nx, ny, nz).normalize();
    const up = Math.abs(zA.y) > 0.9 ? V2.set(0, 0, -1) : V2.set(0, 1, 0);
    const xA = V3.crossVectors(up, zA).normalize();
    const yA = up.crossVectors(zA, xA).normalize();
    M.makeBasis(xA, yA, zA);
    if (rot) M.multiply(MR.makeRotationZ(rot));
    Q.setFromRotationMatrix(M);
    M.compose(P.set(x + zA.x * off, y + zA.y * off, z + zA.z * off), Q, SC.set(flip ? -w : w, h, 1));
    mesh.setMatrixAt(i, M);
    return i;
  }

  finish() {
    for (const [b, m] of [[this.mulB, this.mul], [this.litB, this.lit]]) {
      m.count = b.n;
      b.aRect.needsUpdate = true;
      b.aTint.needsUpdate = true;
      m.instanceMatrix.needsUpdate = true;
    }
    return this;
  }
}
