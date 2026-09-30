// El Gran Pasto: millones de briznas instanciadas en GPU, corte con franjas y rebrote sincronizado.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { LAWN, GRASS, MAP_BOUNDS, FIELD, GRASSMAP, grassAllowed } from '../shared/mapdata.js';
import { cutRect, growAll, fieldMask } from '../shared/raster.js';

// near/far: briznas; vf: matas lejanas (un triángulo ancho cada ~60 cm) hasta donde llega la bruma
const QUALITY = {
  baja: { nearR: 10, nearS: 0.13, farR: 30, farS: 0.36, vfR: 0, vfS: 1 },
  media: { nearR: 11, nearS: 0.12, farR: 34, farS: 0.34, vfR: 78, vfS: 0.82 },
  alta: { nearR: 14, nearS: 0.1, farR: 44, farS: 0.3, vfR: 96, vfS: 0.75 },
  ultra: { nearR: 18, nearS: 0.068, farR: 62, farS: 0.21, vfR: 125, vfS: 0.55 },
};

const MAX_BENDERS = 10;

function bladeGeometry(segments) {
  const pos = [];
  const idx = [];
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const w = Math.pow(1 - t, 0.75) * 0.5;
    pos.push(-w, t, 0, w, t, 0);
  }
  pos.push(0, 1, 0);
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const a = (segments - 1) * 2;
  idx.push(a, a + 1, segments * 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

// Código GLSL común a las briznas (se inyecta en MeshLambertMaterial)
const GLSL_COMMON = /* glsl */ `
uniform float uTime;
uniform vec2 uCenter;      // centro de la grilla (celda entera * spacing)
uniform float uSpacing;
uniform int uGridW;
uniform vec4 uInner;       // previous grid: center xz, outer edge, transition start
uniform float uHasInner;
uniform float uFade;       // distancia de desvanecido
uniform sampler2D uHeightTex;
uniform sampler2D uDirTex;
uniform vec4 uLawn;        // x0, z0, ancho, alto
uniform sampler2D uMask;
uniform vec4 uMaskRect;
uniform float uBladeH;
uniform float uBladeW;
uniform float uWildH;
uniform vec2 uWind;
uniform vec4 uBenders[${MAX_BENDERS}];
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uClump;
varying float vT;
varying float vSun;
varying float vHv;
varying float vRnd;
varying float vShade;
varying float vInLawn;
vec2 ghash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float ghash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

const GLSL_BLADE = /* glsl */ `
  int gid = gl_InstanceID;
  float gi = float(gid % uGridW);
  float gj = float(gid / uGridW);
  vec2 cell = floor(uCenter / uSpacing) + vec2(gi, gj) - float(uGridW / 2);
  vec2 h2 = ghash22(cell);
  vec2 wpos = (cell + h2) * uSpacing;
  float rnd = ghash12(cell * 1.37 + 11.0);
  vec2 rel = wpos - uCamPos.xz;
  float dist = length(rel);
  vec2 inr = abs(wpos - uInner.xy);
  float keep = 1.0;
  if (uHasInner > 0.5) keep = smoothstep(uInner.w, uInner.z, max(inr.x, inr.y));
  vec2 edge = abs(wpos - uCenter);
  float coverage = (1.0 - smoothstep(uFade * 0.74, uFade, max(edge.x, edge.y))) * keep;
  vec2 luv = (wpos - uLawn.xy) / uLawn.zw;
  float inLawn = step(0.0, luv.x) * step(luv.x, 1.0) * step(0.0, luv.y) * step(luv.y, 1.0);
  float hv = texture2D(uHeightTex, luv).r;
  float dirv = texture2D(uDirTex, luv).r * 6.2831853;
  float wild = texture2D(uMask, (wpos - uMaskRect.xy) / uMaskRect.zw).r;
  float bh = (inLawn > 0.5 && hv > 0.015) ? mix(0.035, uBladeH, hv * hv * (0.85 + 0.15 * hv)) : 0.0;
  bh *= 0.999 + wild * 0.0;
  bh *= (0.62 + 0.76 * rnd) * (1.0 + uClump * 0.18);
  // Thin out full-height blades across the same square boundary that the
  // next grid fills. Shrinking them around the camera made a bare circular band.
  bh *= step(ghash12(wpos * 7.13 + 24.0), coverage);
  float ang = h2.x * 6.2831853 + h2.y * 3.0;
  vec2 sideDir = vec2(cos(ang), -sin(ang));
  vec2 mowDir = vec2(sin(dirv), cos(dirv));
  float mowInf = inLawn * (1.0 - smoothstep(0.15, 0.75, hv));
  vec2 lean = vec2(cos(ang * 1.7 + 1.0), sin(ang * 1.7 + 1.0)) * (0.18 + 0.2 * rnd);
  lean = mix(lean, mowDir * 0.75, mowInf * 0.8);
  float gust = sin(uTime * 1.6 + wpos.x * 0.21 + wpos.y * 0.13) * 0.55 + sin(uTime * 2.7 + wpos.x * 0.8 + wpos.y * 0.5) * 0.22;
  lean += uWind * (0.35 + gust * 0.6) * (0.5 + 0.5 * hv);
  for (int i = 0; i < ${MAX_BENDERS}; i++) {
    vec4 b = uBenders[i];
    vec2 d = wpos - b.xy;
    float dl = length(d);
    float f = (1.0 - smoothstep(b.z * 0.35, b.z, dl)) * b.w;
    lean += (d / max(dl, 0.001)) * f * 1.6;
  }
  float ll = length(lean);
  if (ll > 1.6) lean *= 1.6 / ll;
  float t = position.y;
  float bw = uBladeW * (0.75 + 0.5 * rnd) * (0.8 + 0.4 * clamp(bh * 2.0, 0.0, 1.0));
  // a contraluz las puntas se iluminan (el sol pasa a través de la hoja)
  vSun = pow(max(dot(normalize(vec3(rel.x, 0.35 - uCamPos.y * 0.02, rel.y)), uSunDir), 0.0), 3.0);
  vec3 bladeP;
  bladeP.xz = wpos + sideDir * position.x * bw + lean * (t * t) * bh;
  bladeP.y = t * bh * (1.0 - 0.28 * min(ll, 1.4) * t);
  if (bh < 0.006) bladeP = vec3(uCamPos.x, -50.0, uCamPos.z);
  vec3 faceN = normalize(vec3(sideDir.y, 0.0, -sideDir.x));
  vec3 bladeN = normalize(mix(faceN, vec3(0.0, 1.0, 0.0), 0.7) + vec3(lean.x, 0.0, lean.y) * 0.25);
  vT = t;
  vHv = inLawn > 0.5 ? hv : 0.55;
  vRnd = rnd;
  vInLawn = inLawn;
  vec2 vd = normalize(rel + 0.0001);
  vShade = 1.0 + dot(mowDir, vd) * 0.22 * mowInf;
`;

function makeBladeMaterial(uniforms, segments) {
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = GLSL_COMMON + sh.vertexShader
      .replace('#include <beginnormal_vertex>', GLSL_BLADE + '\nvec3 objectNormal = bladeN;')
      .replace('#include <begin_vertex>', 'vec3 transformed = bladeP;');
    sh.fragmentShader = /* glsl */ `
varying float vT;
varying float vHv;
varying float vRnd;
varying float vShade;
varying float vInLawn;
varying float vSun;
` + sh.fragmentShader
      .replace('#include <color_fragment>', /* glsl */ `
  vec3 cBase = mix(vec3(0.018, 0.046, 0.01), vec3(0.03, 0.062, 0.014), vRnd);
  vec3 cTipCut = mix(vec3(0.058, 0.16, 0.024), vec3(0.09, 0.21, 0.032), vRnd);
  // pasto alto: verde amarillento claro, con alguna hoja seca
  vec3 cTipTall = mix(vec3(0.15, 0.235, 0.045), vec3(0.27, 0.3, 0.075), vRnd * vRnd);
  cTipTall = mix(cTipTall, vec3(0.34, 0.3, 0.13), step(0.93, vRnd) * 0.8);
  vec3 cTip = mix(cTipCut, cTipTall, smoothstep(0.35, 1.0, vHv));
  diffuseColor.rgb = mix(cBase, cTip, smoothstep(0.0, 1.0, vT)) * vShade;
`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vSun * vT * vT * 0.55;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
  };
  mat.customProgramCacheKey = () => 'grass' + segments;
  return mat;
}

export class Grass {
  constructor(scene) {
    this.scene = scene;
    this.W = GRASSMAP.w;
    this.H = GRASSMAP.h;
    this.hgt = grassAllowed().map((a) => (a ? 255 : 0));
    this.dir = new Uint8Array(this.W * this.H);
    this.tick = 0;
    this.texDirty = true;
    this.lastUpload = 0;
    this.heightTex = new THREE.DataTexture(this.hgt, this.W, this.H, THREE.RedFormat, THREE.UnsignedByteType);
    this.dirTex = new THREE.DataTexture(this.dir, this.W, this.H, THREE.RedFormat, THREE.UnsignedByteType);
    for (const t of [this.heightTex, this.dirTex]) {
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.generateMipmaps = false;
      t.needsUpdate = true;
    }
    this.dirTex.magFilter = THREE.NearestFilter;
    this.dirTex.minFilter = THREE.NearestFilter;
    this.benders = [];
    for (let i = 0; i < MAX_BENDERS; i++) this.benders.push(new THREE.Vector4(0, 0, 0, 0));
    this.percent = 0;
    this._pctTimer = 0;
    this.maskTex = null;
    this.meshes = [];
    this.pendingCuts = [];
    this._forward = new THREE.Vector3();
  }

  // máscara de pasto silvestre fuera del Gran Pasto (blanco = pasto, negro = piso duro)
  setMask(canvas) {
    this.maskTex = new THREE.CanvasTexture(canvas);
    this.maskTex.colorSpace = THREE.NoColorSpace;
    this.maskTex.flipY = false;
    this.maskTex.wrapS = this.maskTex.wrapT = THREE.ClampToEdgeWrapping;
    this.maskTex.magFilter = THREE.LinearFilter;
    this.maskTex.minFilter = THREE.LinearFilter;
  }

  build(quality = 'alta') {
    this.quality = quality;
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    this.meshes = [];
    const q = QUALITY[quality] || QUALITY.alta;
    this.q = q;
    const shared = {
      uTime: { value: 0 },
      uHeightTex: { value: this.heightTex },
      uDirTex: { value: this.dirTex },
      uLawn: { value: new THREE.Vector4(GRASSMAP.x0, GRASSMAP.z0, GRASSMAP.x1 - GRASSMAP.x0, GRASSMAP.z1 - GRASSMAP.z0) },
      uMask: { value: this.maskTex },
      uMaskRect: { value: new THREE.Vector4(MAP_BOUNDS.x0, MAP_BOUNDS.z0, MAP_BOUNDS.x1 - MAP_BOUNDS.x0, MAP_BOUNDS.z1 - MAP_BOUNDS.z0) },
      uBladeH: { value: 0.56 },
      uWildH: { value: 0.3 },
      uWind: { value: new THREE.Vector2(0.28, 0.12) },
      uBenders: { value: this.benders },
      uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: (G.world?.sunDir || new THREE.Vector3(-0.82, 0.3, 0.42)).clone().normalize() },
    };
    this.shared = shared;
    const mk = (R, S, segs, width, inner, fade, clump = 0) => {
      const gw = Math.ceil((R * 2) / S);
      const geo = bladeGeometry(segs);
      geo.instanceCount = gw * gw;
      const u = {
        ...shared,
        uCenter: { value: new THREE.Vector2() },
        uSpacing: { value: S },
        uGridW: { value: gw },
        uInner: { value: new THREE.Vector4() },
        uHasInner: { value: inner ? 1 : 0 },
        uFade: { value: fade },
        uBladeW: { value: width },
        uClump: { value: clump },
      };
      const mat = makeBladeMaterial(u, segs);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.userData.u = u;
      mesh.userData.R = R;
      this.scene.add(mesh);
      this.meshes.push(mesh);
      return mesh;
    };
    this.near = mk(q.nearR, q.nearS, 4, 0.044, false, q.nearR - q.nearS * 2);
    this.far = mk(q.farR, q.farS, 3, 0.11, true, q.farR - q.farS * 2);
    // matas lejanas: tapan el piso hasta la bruma (antes a partir de ~55 m el pasto era un piso chato)
    this.vfar = q.vfR > 0 ? mk(q.vfR, q.vfS, 2, 0.26, true, q.vfR - q.vfS * 2, 1) : null;
  }

  // Suelo del Gran Pasto: color según altura y dirección de corte (se ve a la distancia)
  makeLawnGround() {
    // cubre todo el mapa: donde hay pasto (cortado o no) pinta el césped; en piso duro no dibuja
    const geo = new THREE.PlaneGeometry(GRASSMAP.x1 - GRASSMAP.x0, GRASSMAP.z1 - GRASSMAP.z0, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate((GRASSMAP.x0 + GRASSMAP.x1) / 2, 0.012, (GRASSMAP.z0 + GRASSMAP.z1) / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const u = {
      uHeightTex: { value: this.heightTex },
      uDirTex: { value: this.dirTex },
      uLawn: { value: new THREE.Vector4(GRASSMAP.x0, GRASSMAP.z0, GRASSMAP.x1 - GRASSMAP.x0, GRASSMAP.z1 - GRASSMAP.z0) },
      uCamPos: { value: new THREE.Vector3() },
    };
    this.groundU = u;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
      sh.fragmentShader = /* glsl */ `
uniform sampler2D uHeightTex;
uniform sampler2D uDirTex;
uniform vec4 uLawn;
uniform vec3 uCamPos;
varying vec3 vWPos;
float lhash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float lnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lhash(i), lhash(i + vec2(1, 0)), f.x), mix(lhash(i + vec2(0, 1)), lhash(i + vec2(1, 1)), f.x), f.y);
}
` + sh.fragmentShader.replace('#include <color_fragment>', /* glsl */ `
  vec2 luv = (vWPos.xz - uLawn.xy) / uLawn.zw;
  float hv = texture2D(uHeightTex, luv).r;
  if (hv < 0.012) discard; // piso duro: se ve el piso del mundo
  float dirv = texture2D(uDirTex, luv).r * 6.2831853;
  vec2 mowDir = vec2(sin(dirv), cos(dirv));
  vec2 vd = normalize(vWPos.xz - uCamPos.xz + 0.001);
  float n = lnoise(vWPos.xz * 0.35) * 0.6 + lnoise(vWPos.xz * 2.3) * 0.4;
  float shortness = 1.0 - smoothstep(0.12, 0.8, hv);
  vec3 cut = mix(vec3(0.045, 0.12, 0.018), vec3(0.07, 0.165, 0.025), n) * (1.0 + dot(mowDir, vd) * 0.3 * shortness);
  vec3 tall = mix(vec3(0.1, 0.165, 0.032), vec3(0.18, 0.215, 0.05), n);
  diffuseColor.rgb = mix(cut, tall, smoothstep(0.2, 0.95, hv));
`);
    };
    mat.customProgramCacheKey = () => 'lawnground';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.ground = mesh;
    return mesh;
  }

  // ---------------------------------------------------------------- estado
  applyFull(u8) {
    // [1][u32 tick][u16 w][u16 h][deflate(hgt ++ dir)]
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const tick = dv.getUint32(1, true);
    const w = dv.getUint16(5, true);
    const h = dv.getUint16(7, true);
    if (w !== this.W || h !== this.H) {
      console.warn('grilla de pasto distinta', w, h);
      return Promise.resolve();
    }
    const ds = new DecompressionStream('deflate');
    const blob = new Blob([u8.subarray(9)]);
    return new Response(blob.stream().pipeThrough(ds)).arrayBuffer().then((buf) => {
      const raw = new Uint8Array(buf);
      const n = this.W * this.H;
      this.hgt.set(raw.subarray(0, n));
      this.dir.set(raw.subarray(n, n * 2));
      this.tick = tick;
      // aplicar cortes que llegaron mientras se descomprimía
      for (const s of this.pendingCuts) this.cut(s, false);
      this.pendingCuts.length = 0;
      this.loaded = true;
      this.texDirty = true;
      this._computePercent();
    });
  }

  growTo(n) {
    if (!this.loaded) return;
    while (this.tick < n) {
      if (!this.noGrow) { const a = grassAllowed(); this.noGrow = fieldMask(FIELD).map((f, k) => (f || !a[k] ? 1 : 0)); }
      growAll(this.hgt, GRASS.growPerTick, this.noGrow);
      this.tick++;
    }
    this.texDirty = true;
  }

  // stamps: [[x, z, ang, hw, hl], ...]. Devuelve celdas altas cortadas.
  cut(stamps, fromRemote = true) {
    if (!this.loaded && fromRemote) {
      this.pendingCuts.push(stamps);
      return 0;
    }
    let tall = 0;
    for (const s of stamps) tall += cutRect(this.hgt, this.dir, s[0], s[1], s[2], s[3], s[4], GRASS.cutHeight);
    this.texDirty = true;
    return tall;
  }

  heightAt(x, z) {
    const i = Math.floor((x - GRASSMAP.x0) / GRASSMAP.cell);
    const j = Math.floor((z - GRASSMAP.z0) / GRASSMAP.cell);
    if (i < 0 || j < 0 || i >= this.W || j >= this.H) return -1;
    return this.hgt[j * this.W + i];
  }

  _computePercent() {
    // % del Gran Pasto cortado (la cancha cuenta como cortada)
    let cut = 0, tot = 0;
    const th = GRASS.shortThreshold, a = this.hgt, Gm = GRASSMAP;
    const i0 = Math.floor((LAWN.x0 - Gm.x0) / Gm.cell), i1 = Math.floor((LAWN.x1 - Gm.x0) / Gm.cell);
    const j0 = Math.floor((LAWN.z0 - Gm.z0) / Gm.cell), j1 = Math.floor((LAWN.z1 - Gm.z0) / Gm.cell);
    for (let j = j0; j < j1; j += 2) for (let i = i0; i < i1; i += 2) { tot++; if (a[j * this.W + i] < th) cut++; }
    this.percent = tot ? (cut / tot) * 100 : 0;
  }

  // benders: [{x, z, r, s}]
  update(dt, camera, benders) {
    const now = performance.now();
    if (this.texDirty && now - this.lastUpload >= 33) {
      this.heightTex.needsUpdate = true;
      this.dirTex.needsUpdate = true;
      this.texDirty = false;
      this.lastUpload = now;
    }
    this._pctTimer += dt;
    if (this._pctTimer > 1.5) {
      this._pctTimer = 0;
      if (this.loaded) this._computePercent();
    }
    if (!this.near) return;
    const cp = camera.position;
    const fwd = this._forward;
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
    fwd.normalize();
    this.shared.uTime.value = G.time;
    this.shared.uCamPos.value.copy(cp);
    if (this.groundU) this.groundU.uCamPos.value.copy(cp);
    // centros adelantados hacia donde mira la cámara (más pasto en pantalla)
    const nu = this.near.userData.u, fu = this.far.userData.u;
    const nR = this.near.userData.R, fR = this.far.userData.R;
    const nS = nu.uSpacing.value;
    const ncx = Math.floor((cp.x + fwd.x * nR * 0.55) / nS) * nS;
    const ncz = Math.floor((cp.z + fwd.z * nR * 0.55) / nS) * nS;
    nu.uCenter.value.set(ncx, ncz);
    const fS = fu.uSpacing.value;
    const fcx = Math.floor((cp.x + fwd.x * fR * 0.5) / fS) * fS;
    const fcz = Math.floor((cp.z + fwd.z * fR * 0.5) / fS) * fS;
    fu.uCenter.value.set(fcx, fcz);
    fu.uInner.value.set(ncx, ncz, nu.uFade.value, nu.uFade.value * 0.74);
    if (this.vfar) {
      const vu = this.vfar.userData.u, vR = this.vfar.userData.R, vS = vu.uSpacing.value;
      vu.uCenter.value.set(Math.floor((cp.x + fwd.x * vR * 0.5) / vS) * vS, Math.floor((cp.z + fwd.z * vR * 0.5) / vS) * vS);
      vu.uInner.value.set(fcx, fcz, fu.uFade.value, fu.uFade.value * 0.74);
    }
    // quienes aplastan el pasto
    for (let i = 0; i < MAX_BENDERS; i++) {
      const b = benders[i];
      if (b) this.benders[i].set(b.x, b.z, b.r, b.s);
      else this.benders[i].set(0, 0, 0, 0);
    }
  }
}
