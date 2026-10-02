// Personaje por partes con gore en capas (piel/ropa -> carne -> hueso/órganos), cara y animación procedural.
import * as THREE from 'three';
import { G, clamp, lerp, rng } from '../core/G.js';
import { polePose, gogoPose, djPose } from './pole-dance.js';

export const P = {
  PELVIS: 0, TORSO: 1, HEAD: 2, UARM_L: 3, FARM_L: 4, UARM_R: 5, FARM_R: 6, THIGH_L: 7, SHIN_L: 8, THIGH_R: 9, SHIN_R: 10,
};
export const PART_NAMES = ['la pelvis', 'el torso', 'la cabeza', 'el brazo izquierdo', 'el antebrazo izquierdo', 'el brazo derecho', 'el antebrazo derecho', 'el muslo izquierdo', 'la pierna izquierda', 'el muslo derecho', 'la pierna derecha'];
export const PARENT = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9];
export const CHILDREN = PARENT.map((_, i) => PARENT.map((p, j) => (p === i ? j : -1)).filter((j) => j >= 0));
export const JOINT_NAMES = ['hips', 'spine', 'neck', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR'];
export const DMG_RES = 64;

function specs(body) {
  const fat = body === 'gordo', thin = body === 'flaco';
  const lr = thin ? 0.86 : fat ? 1.12 : 1;
  const tw = fat ? 1.6 : thin ? 1.12 : 1.3;
  const td = fat ? 1.2 : thin ? 0.72 : 0.84;
  const sh = fat ? 0.27 : thin ? 0.2 : 0.225;
  const L = (y0, y1, r, mass, extra = {}) => ({ y0, y1, r, mass, sx: 1, sz: 1, ...extra });
  const parts = [
    L(-0.11, 0.1, 0.135, 11, { sx: fat ? 1.45 : 1.22, sz: fat ? 1.12 : 0.86 }),
    L(-0.03, 0.48, 0.15, 24, { sx: tw, sz: td }),
    L(-0.03, 0.28, 0.128, 5, { sx: 0.92, sz: 1.0, head: true }),
    L(-0.31, 0.04, 0.05 * lr, 2.2),
    L(-0.29, 0.0, 0.043 * lr, 1.7),
    L(-0.31, 0.04, 0.05 * lr, 2.2),
    L(-0.29, 0.0, 0.043 * lr, 1.7),
    L(-0.44, 0.05, 0.072 * lr, 8),
    L(-0.46, 0.0, 0.055 * lr, 4.5),
    L(-0.44, 0.05, 0.072 * lr, 8),
    L(-0.46, 0.0, 0.055 * lr, 4.5),
  ];
  const joints = [
    [0, 0.95, 0], [0, 0.1, 0], [0, 0.47, 0],
    [sh, 0.41, 0], [0, -0.31, 0], [-sh, 0.41, 0], [0, -0.31, 0],
    [0.1, -0.06, 0], [0, -0.44, 0], [-0.1, -0.06, 0], [0, -0.44, 0],
  ];
  return { parts, joints };
}

// ---------------------------------------------------------------- shader de capas
const GORE_PARS = /* glsl */ `
uniform sampler2D uDmg;
uniform float uY0;
uniform float uY1;
uniform float uLayer;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uSplit;
uniform sampler2D uFace;
uniform float uHasFace;
uniform float uFlush;
uniform float uWet;
varying vec3 vLocal;
float ghash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ghash(i), ghash(i + vec3(1,0,0)), f.x), mix(ghash(i + vec3(0,1,0)), ghash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ghash(i + vec3(0,0,1)), ghash(i + vec3(1,0,1)), f.x), mix(ghash(i + vec3(0,1,1)), ghash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;
const GORE_FRAG = /* glsl */ `
  vec2 duv = vec2(atan(vLocal.x, vLocal.z) / 6.2831853 + 0.5, (vLocal.y - uY0) / (uY1 - uY0));
  vec4 dm = texture2D(uDmg, duv);
  float gn = gnoise(vLocal * 55.0);
  float thr = uLayer < 0.5 ? 0.34 : (uLayer < 1.5 ? 0.72 : 0.95);
  float dd = dm.r + (gn - 0.5) * 0.09;
  if (dd > thr) discard;
  vec3 col;
  if (uLayer < 0.5) {
    col = duv.y > uSplit ? uColA : uColB;
    if (uHasFace > 0.5) {
      vec4 fc = texture2D(uFace, duv);
      col = mix(col, fc.rgb, fc.a);
      col = mix(col, vec3(0.85, 0.2, 0.2), uFlush * 0.35 * smoothstep(0.3, 0.6, duv.y) * (1.0 - smoothstep(0.6, 0.75, duv.y)));
    }
    col = mix(col, vec3(0.22, 0.06, 0.16), clamp(dm.b, 0.0, 1.0) * 0.75);
    float edge = smoothstep(thr - 0.14, thr, dd);
    col = mix(col, vec3(0.42, 0.015, 0.02), edge);
    col = mix(col, vec3(0.3, 0.0, 0.01), clamp(dm.g * 1.2, 0.0, 0.92));
  } else if (uLayer < 1.5) {
    float fib = gnoise(vec3(vLocal.x * 90.0, vLocal.y * 12.0, vLocal.z * 90.0));
    col = mix(vec3(0.42, 0.03, 0.04), vec3(0.72, 0.12, 0.1), fib);
    col = mix(col, vec3(0.25, 0.0, 0.01), smoothstep(thr - 0.12, thr, dd));
    col = mix(col, vec3(0.9, 0.82, 0.7), smoothstep(0.55, 0.62, gn) * 0.35);
  } else {
    col = uColA;
    col = mix(col, vec3(0.5, 0.05, 0.04), clamp(dm.g, 0.0, 1.0) * 0.6);
    col = mix(col, vec3(0.3, 0.02, 0.02), smoothstep(thr - 0.1, thr, dd));
  }
  diffuseColor.rgb = col;
`;

function goreMaterial(dmgTex, spec, layer, colA, colB, split, face) {
  const mat = new THREE.MeshStandardMaterial({
    roughness: layer === 0 ? 0.8 : layer === 1 ? 0.32 : 0.55,
    metalness: 0,
    side: layer === 1 ? THREE.DoubleSide : THREE.FrontSide,
  });
  const u = {
    uDmg: { value: dmgTex },
    uY0: { value: spec.y0 },
    uY1: { value: spec.y1 },
    uLayer: { value: layer },
    uColA: { value: new THREE.Color(colA) },
    uColB: { value: new THREE.Color(colB) },
    uSplit: { value: split },
    uFace: { value: face || dmgTex },
    uHasFace: { value: face ? 1 : 0 },
    uFlush: { value: 0 },
    uWet: { value: 0 },
  };
  mat.userData.u = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vLocal;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLocal = position;');
    sh.fragmentShader = GORE_PARS + sh.fragmentShader.replace('#include <color_fragment>', GORE_FRAG);
  };
  mat.customProgramCacheKey = () => 'gore';
  return mat;
}

// ---------------------------------------------------------------- cara
function drawFace(canvas, look, expr, t = 0) {
  const x = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  x.clearRect(0, 0, W, H);
  // la cara ocupa u 0.5 +- 0.12 (frente = +Z)
  const cx = W / 2;
  const eyeY = H * (1 - 0.6);
  const eyeDX = W * 0.055;
  const eyeR = W * 0.018;
  const skin = look.skin || '#e0ac69';
  if (look.beard) {
    x.fillStyle = look.hair || '#3a2a1a';
    x.globalAlpha = 0.92;
    x.beginPath();
    x.ellipse(cx, H * (1 - 0.27), W * 0.1, H * 0.2, 0, 0, Math.PI);
    x.fill();
    x.fillRect(cx - W * 0.1, H * (1 - 0.34), W * 0.2, H * 0.07);
    x.globalAlpha = 1;
  }
  const drunk = expr.drunk || 0, high = expr.high || 0;
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDX;
    if (expr.dead) {
      x.strokeStyle = '#111';
      x.lineWidth = W * 0.008;
      x.beginPath();
      x.moveTo(ex - eyeR, eyeY - eyeR); x.lineTo(ex + eyeR, eyeY + eyeR);
      x.moveTo(ex + eyeR, eyeY - eyeR); x.lineTo(ex - eyeR, eyeY + eyeR);
      x.stroke();
      continue;
    }
    // blanco del ojo (rojo si está fumado)
    x.fillStyle = high > 0.35 ? `rgb(255,${Math.round(200 - high * 90)},${Math.round(200 - high * 110)})` : '#fbfbf6';
    x.beginPath();
    x.ellipse(ex, eyeY, eyeR * 1.25, eyeR, 0, 0, Math.PI * 2);
    x.fill();
    // pupila (bizca si está en pedo)
    const px = ex - s * drunk * eyeR * 0.5 + Math.sin(t * 1.3) * drunk * eyeR * 0.3;
    x.fillStyle = '#3b2a1a';
    x.beginPath();
    x.arc(px, eyeY, eyeR * 0.62, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#000';
    x.beginPath();
    x.arc(px, eyeY, eyeR * (0.3 + high * 0.25), 0, Math.PI * 2);
    x.fill();
    // párpado caído (borracho/fumado)
    const lid = clamp(Math.max(drunk * 0.6, high * 0.7), 0, 0.75);
    if (lid > 0.05) {
      x.fillStyle = skin;
      x.fillRect(ex - eyeR * 1.4, eyeY - eyeR * 1.2, eyeR * 2.8, eyeR * 2.1 * lid + eyeR * 0.2);
    }
    // cejas
    x.strokeStyle = look.hair || '#3a2a1a';
    x.lineWidth = W * 0.007;
    x.beginPath();
    const by = eyeY - eyeR * 1.9 - (expr.angry ? -eyeR * 0.4 : 0);
    x.moveTo(ex - eyeR * 1.3, by + (expr.angry ? -s * 0 : 0));
    x.lineTo(ex + eyeR * 1.3, by + (expr.angry ? (s > 0 ? -eyeR * 0.8 : eyeR * 0.8) * -1 : 0));
    x.stroke();
  }
  // nariz
  x.fillStyle = 'rgba(120,60,30,0.35)';
  x.beginPath();
  x.ellipse(cx, H * (1 - 0.47), W * 0.012, H * 0.03, 0, 0, Math.PI * 2);
  x.fill();
}

// ---------------------------------------------------------------- personaje
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpM2 = new THREE.Matrix4();

export class Character {
  constructor(look = {}, opts = {}) {
    this.look = { ...look };
    this.local = !!opts.local;
    this.root = new THREE.Group();
    this.root.name = 'character';
    this.joints = [];
    this.parts = [];
    this.anim = {
      phase: 0, speed: 0, bob: 0, lean: 0, idleT: Math.random() * 10,
      cur: JOINT_NAMES.map(() => new THREE.Euler()),
    };
    this.mode = 'anim'; // 'anim' | 'ragdoll'
    this.expr = { drunk: 0, high: 0, dead: false };
    this._exprKey = '';
    this.talk = 0;
    this.drips = [];
    this.detached = new Array(11).fill(false);
    this.bleedAmount = 0;
    this.build();
  }

  build() {
    // limpiar lo anterior
    for (const p of this.parts) this._disposePart(p);
    this.root.clear();
    const { parts, joints } = specs(this.look.body);
    this.specs = parts;
    this.jointRest = joints.map((j) => new THREE.Vector3(...j));
    this.joints = [];
    for (let i = 0; i < 11; i++) {
      const j = new THREE.Object3D();
      j.name = JOINT_NAMES[i];
      j.position.copy(this.jointRest[i]);
      this.joints.push(j);
      if (PARENT[i] < 0) this.root.add(j);
      else this.joints[PARENT[i]].add(j);
    }
    // cara
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 512;
    this.faceCanvas.height = 256;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.wrapS = THREE.RepeatWrapping;
    this._exprKey = '';
    this.updateFace(true);

    const L = this.look;
    const skin = L.skin || '#e0ac69', shirt = L.shirt || '#3b6fd8', pants = L.pants || '#2b2f3a';
    const clothes = [
      [pants, pants, 0], [shirt, shirt, 0], [skin, skin, 0],
      [shirt, skin, 0.45], [skin, skin, 0], [shirt, skin, 0.45], [skin, skin, 0],
      [pants, pants, 0], [pants, pants, 0], [pants, pants, 0], [pants, pants, 0],
    ];
    this.parts = [];
    for (let i = 0; i < 11; i++) {
      const spec = parts[i];
      const data = new Uint8Array(DMG_RES * DMG_RES * 4);
      const tex = new THREE.DataTexture(data, DMG_RES, DMG_RES, THREE.RGBAFormat);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      const group = new THREE.Group();
      this.joints[i].add(group);
      const [ca, cb, split] = clothes[i];
      const skinMat = goreMaterial(tex, spec, 0, ca, cb, split, i === P.HEAD ? this.faceTex : null);
      const skinMesh = new THREE.Mesh(partGeometry(spec, 1), skinMat);
      skinMesh.castShadow = true;
      skinMesh.receiveShadow = true;
      group.add(skinMesh);
      const fleshMat = goreMaterial(tex, spec, 1, '#aa1111', '#aa1111', 0, null);
      const fleshMesh = new THREE.Mesh(partGeometry(spec, 0.84), fleshMat);
      fleshMesh.visible = false;
      group.add(fleshMesh);
      const boneMat = goreMaterial(tex, spec, 2, '#e9e1cc', '#e9e1cc', 0, null);
      const inner = boneGeometry(i, spec);
      const boneMesh = new THREE.Mesh(inner.bone, boneMat);
      boneMesh.visible = false;
      group.add(boneMesh);
      let organs = null;
      if (inner.organs) {
        organs = inner.organs;
        organs.visible = false;
        group.add(organs);
      }
      this.parts.push({
        i, spec, group, skin: skinMesh, flesh: fleshMesh, bone: boneMesh, organs, tex, data,
        maxDmg: 0, boneHp: 1, cutDmg: 0, dirty: false,
      });
    }
    // manos y pies
    const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
    const shoeM = new THREE.MeshStandardMaterial({ color: L.shoes || '#1b1b1b', roughness: 0.7 });
    this.hands = [];
    for (const i of [P.FARM_L, P.FARM_R]) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), skinM);
      h.scale.set(0.9, 1.15, 0.7);
      h.position.set(0, -0.31, 0.01);
      h.castShadow = true;
      this.parts[i].group.add(h);
      const attach = new THREE.Object3D();
      attach.position.set(0, -0.33, 0.02);
      this.parts[i].group.add(attach);
      this.hands.push(attach);
    }
    this.handL = this.hands[0];
    this.handR = this.hands[1];
    for (const i of [P.SHIN_L, P.SHIN_R]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.26), shoeM);
      f.position.set(0, -0.47, 0.06);
      f.castShadow = true;
      this.parts[i].group.add(f);
    }
    // boca (se anima al hablar)
    const mouth = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a0d0d, roughness: 0.6 }),
    );
    mouth.scale.set(1.1, 0.25, 0.4);
    const sp = parts[P.HEAD];
    mouth.position.set(0, sp.y0 + (sp.y1 - sp.y0) * 0.3, sp.r * 0.97);
    this.parts[P.HEAD].group.add(mouth);
    this.mouth = mouth;
    this._accessories(parts[P.HEAD]);
    this.root.traverse((o) => { o.frustumCulled = false; });
  }

  _accessories(sp) {
    const L = this.look;
    const head = this.parts[P.HEAD].group;
    const top = sp.y1;
    const cy = (sp.y0 + sp.y1) / 2;
    const R = sp.r;
    this.hat = null;
    // pelo
    const hairM = new THREE.MeshStandardMaterial({ color: L.hair || '#3a2a1a', roughness: 0.9 });
    const hair = new THREE.Mesh(new THREE.SphereGeometry(R * 1.05, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
    hair.scale.set(0.95, (sp.y1 - sp.y0) / (2 * R), 1.05);
    hair.position.set(0, cy, -0.012);
    hair.rotation.x = -0.25;
    hair.castShadow = true;
    head.add(hair);
    this.hair = hair;
    const hc = new THREE.MeshStandardMaterial({ color: L.hatColor || '#c8312b', roughness: 0.7 });
    let hat = null;
    switch (L.hat) {
      case 'cap': {
        hat = new THREE.Group();
        const d = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hc);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.9, R * 0.9, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), hc);
        brim.position.set(0, 0.0, R * 0.55);
        brim.scale.set(1, 1, 1.1);
        hat.add(d, brim);
        hat.position.set(0, cy + R * 0.35, 0);
        break;
      }
      case 'cowboy': {
        hat = new THREE.Group();
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.8, R * 0.95, R * 1.1, 16), hc);
        crown.position.y = R * 0.5;
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 2.1, R * 2.1, 0.015, 24), hc);
        hat.add(crown, brim);
        hat.position.set(0, cy + R * 0.7, 0);
        break;
      }
      case 'beanie': {
        hat = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hc);
        hat.position.set(0, cy + R * 0.12, 0);
        const pom = new THREE.Mesh(new THREE.SphereGeometry(R * 0.28, 10, 8), hc);
        pom.position.y = R * 1.1;
        hat.add(pom);
        break;
      }
      case 'tophat': {
        hat = new THREE.Group();
        const c = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.85, R * 0.85, R * 2.2, 18), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 }));
        c.position.y = R * 1.1;
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.45, R * 1.45, 0.015, 20), c.material);
        const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.87, R * 0.87, R * 0.3, 18), hc);
        band.position.y = R * 0.2;
        hat.add(c, brim, band);
        hat.position.set(0, cy + R * 0.72, 0);
        break;
      }
      case 'crown': {
        hat = new THREE.Group();
        const gold = new THREE.MeshStandardMaterial({ color: 0xe0b33a, metalness: 0.9, roughness: 0.25 });
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.85, R * 0.85, R * 0.45, 16, 1, true), gold);
        ring.material.side = THREE.DoubleSide;
        hat.add(ring);
        for (let k = 0; k < 6; k++) {
          const sp2 = new THREE.Mesh(new THREE.ConeGeometry(R * 0.16, R * 0.45, 6), gold);
          const a = (k / 6) * Math.PI * 2;
          sp2.position.set(Math.sin(a) * R * 0.85, R * 0.42, Math.cos(a) * R * 0.85);
          hat.add(sp2);
        }
        hat.position.set(0, cy + R * 0.85, 0);
        break;
      }
      case 'chef': {
        hat = new THREE.Group();
        const w = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.9 });
        const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R * 0.95, R * 0.8, 16), w);
        const puff = new THREE.Mesh(new THREE.SphereGeometry(R * 1.25, 16, 12), w);
        puff.position.y = R * 1.0;
        puff.scale.y = 0.75;
        hat.add(band, puff);
        hat.position.set(0, cy + R * 0.75, 0);
        break;
      }
      case 'boina': {
        hat = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.2, R * 1.05, R * 0.3, 20), hc);
        hat.position.set(0, cy + R * 0.85, -0.01);
        hat.rotation.x = -0.15;
        hat.rotation.z = 0.12;
        const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 4), hc);
        nub.position.y = R * 0.2;
        hat.add(nub);
        break;
      }
      default:
        break;
    }
    if (hat) {
      hat.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      head.add(hat);
      this.hat = hat;
    }
    if (L.glasses === 'sun' || L.glasses === 'nerd') {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: L.glasses === 'sun' ? 0x0a0a0a : 0x222222, roughness: 0.2, metalness: 0.4 });
      for (const s of [-1, 1]) {
        const lens = L.glasses === 'sun'
          ? new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 14), m)
          : new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 16), m);
        if (L.glasses === 'sun') lens.rotation.x = Math.PI / 2;
        lens.position.set(s * 0.045, 0, 0);
        g.add(lens);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.005, 0.005), m);
      g.add(bar);
      g.position.set(0, sp.y0 + (sp.y1 - sp.y0) * 0.6, R * 0.98);
      head.add(g);
      this.glasses = g;
    }
    // tope del cráneo para calcular altura
    this.headTop = top;
  }

  setLook(look) {
    this.look = { ...look };
    this.build();
  }

  // ---------------------------------------------------------------- cara/expresión
  updateFace(force = false) {
    const e = this.expr;
    const key = `${Math.round(e.drunk * 4)}_${Math.round(e.high * 4)}_${e.dead ? 1 : 0}_${e.angry ? 1 : 0}`;
    if (!force && key === this._exprKey) return;
    this._exprKey = key;
    drawFace(this.faceCanvas, this.look, e, G.time);
    this.faceTex.needsUpdate = true;
  }

  setIntox(drunk, high) {
    this.expr.drunk = drunk;
    this.expr.high = high;
    const u = this.parts[P.HEAD].skin.material.userData.u;
    u.uFlush.value = clamp(drunk, 0, 1);
    this.updateFace();
  }

  // ---------------------------------------------------------------- daño y gore
  // Aplica una herida. local = punto en el espacio de la articulación (Vector3), kind: 'blunt'|'cut'|'stab'|'mulch'|'bullet'
  wound(i, local, kind, strength, dirLocal = null, seed = 1) {
    const part = this.parts[i];
    if (!part || this.detached[i]) return 0;
    const sp = part.spec;
    const r = rng(seed);
    const u0 = Math.atan2(local.x, local.z) / (Math.PI * 2) + 0.5;
    const v0 = (local.y - sp.y0) / (sp.y1 - sp.y0);
    const circ = Math.PI * 2 * sp.r * ((sp.sx + sp.sz) / 2);
    const len = sp.y1 - sp.y0;
    let rad, depth, blood, bruise, elong = 1, ang = 0;
    const s = clamp(strength, 0, 2.5);
    switch (kind) {
      case 'blunt': rad = 0.045 + s * 0.035; depth = 0.1 + s * 0.22; blood = 0.2 * s; bruise = 0.5 + s * 0.5; break;
      case 'cut': rad = 0.022 + s * 0.02; depth = 0.35 + s * 0.4; blood = 0.9; bruise = 0.1; elong = 3.2 + s * 1.5; break;
      case 'stab': rad = 0.016 + s * 0.012; depth = 0.6 + s * 0.45; blood = 0.8; bruise = 0.05; break;
      case 'mulch': rad = 0.05 + s * 0.05; depth = 0.7 + s * 0.4; blood = 1.2; bruise = 0.2; elong = 1.6; break;
      case 'bullet': rad = 0.012; depth = 1.0; blood = 0.7; bruise = 0.1; break;
      default: rad = 0.04; depth = 0.2; blood = 0.3; bruise = 0.3;
    }
    if (dirLocal && elong > 1) {
      // orientación del tajo en el plano (u, v): proyectamos la dirección sobre la tangente
      const tu = new THREE.Vector3(local.z, 0, -local.x).normalize();
      const du = dirLocal.dot(tu), dv = dirLocal.y;
      ang = Math.atan2(dv, du);
    } else ang = r() * Math.PI;
    const ru = rad / circ, rv = rad / len;
    const D = part.data;
    const N = DMG_RES;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const extU = Math.ceil(Math.max(ru * elong, rv * elong) * N * 2.2) + 2;
    const extV = Math.ceil(Math.max(rv * elong, ru * elong) * N * 2.2) + 2;
    const cu = u0 * N, cv = v0 * N;
    let maxd = 0;
    for (let y = Math.floor(cv - extV); y <= Math.ceil(cv + extV); y++) {
      if (y < 0 || y >= N) continue;
      for (let xx = Math.floor(cu - extU); xx <= Math.ceil(cu + extU); xx++) {
        const px = ((xx % N) + N) % N;
        // distancia elíptica en unidades de "radio"
        const du = (xx + 0.5 - cu) / N / ru, dv = (y + 0.5 - cv) / N / rv;
        const a = (du * ca + dv * sa) / elong, b = -du * sa + dv * ca;
        const d2 = a * a + b * b;
        const k = (y * N + px) * 4;
        if (d2 < 1) {
          const f = (1 - d2) * (0.75 + r() * 0.5);
          D[k] = Math.min(255, D[k] + depth * f * 255);
          D[k + 2] = Math.min(255, D[k + 2] + bruise * f * 255);
          if (D[k] > maxd) maxd = D[k];
        }
        if (d2 < 4.5 && blood > 0) {
          const f2 = Math.max(0, 1 - d2 / 4.5);
          D[k + 1] = Math.min(255, D[k + 1] + blood * f2 * 200);
        }
      }
    }
    part.tex.needsUpdate = true;
    part.maxDmg = Math.max(part.maxDmg, maxd / 255);
    if (part.maxDmg > 0.22) part.flesh.visible = true;
    if (part.maxDmg > 0.55) {
      part.bone.visible = true;
      if (part.organs) part.organs.visible = true;
    }
    if (kind !== 'blunt' && depth * s > 0.2 && this.drips.length < 24) {
      this.drips.push({ i, u: u0, v: v0 - rv * 0.5, t: 0, life: 4 + r() * 6, w: 0.5 + r() * 0.5 });
    }
    return maxd / 255;
  }

  _dripStep(dt) {
    for (let n = this.drips.length - 1; n >= 0; n--) {
      const d = this.drips[n];
      d.t += dt;
      if (d.t > d.life || d.v < 0 || this.detached[d.i]) { this.drips.splice(n, 1); continue; }
      d.v -= dt * 0.06;
      const part = this.parts[d.i];
      const N = DMG_RES;
      const x = Math.floor(((d.u % 1) + 1) % 1 * N), y = Math.floor(d.v * N);
      if (y >= 0 && y < N) {
        for (const ox of [0, 1]) {
          const k = (y * N + ((x + ox) % N)) * 4;
          part.data[k + 1] = Math.min(255, part.data[k + 1] + 90 * d.w);
        }
        part.tex.needsUpdate = true;
      }
    }
  }

  // Separa una parte (y sus hijas) del cuerpo. Devuelve un Group con la parte en posición mundial.
  detach(i) {
    if (this.detached[i] || i === P.PELVIS || i === P.TORSO) return null;
    const stack = [i];
    while (stack.length) {
      const k = stack.pop();
      this.detached[k] = true;
      for (const c of CHILDREN[k]) stack.push(c);
    }
    const joint = this.joints[i];
    joint.updateWorldMatrix(true, true);
    const gib = new THREE.Group();
    joint.matrixWorld.decompose(gib.position, gib.quaternion, gib.scale);
    // mover la articulación (con todo lo que cuelga) al gib
    joint.parent.remove(joint);
    joint.position.set(0, 0, 0);
    joint.quaternion.identity();
    joint.scale.set(1, 1, 1);
    gib.add(joint);
    // muñones: tapa de carne/hueso en el cuerpo y en el gib
    const sp = this.parts[i].spec;
    const capR = sp.r * Math.max(sp.sx, sp.sz) * 0.95;
    const bodyCap = stumpCap(capR);
    bodyCap.position.copy(this.jointRest[i]);
    bodyCap.rotation.x = i === P.HEAD ? -Math.PI / 2 : Math.PI / 2;
    if (PARENT[i] >= 0) this.joints[PARENT[i]].add(bodyCap);
    const gibCap = stumpCap(capR);
    gibCap.rotation.x = i === P.HEAD ? Math.PI / 2 : -Math.PI / 2;
    joint.add(gibCap);
    this.parts[i].flesh.visible = true;
    this.parts[i].bone.visible = true;
    this.stumps = this.stumps || [];
    this.stumps.push({ i, parent: PARENT[i], t: 0 });
    return gib;
  }

  // ---------------------------------------------------------------- consultas
  // Cápsulas en espacio mundial para detectar golpes: [{a, b, r, i}]
  capsules(out = []) {
    this.root.updateWorldMatrix(true, true);
    out.length = 0;
    for (let i = 0; i < 11; i++) {
      if (this.detached[i]) continue;
      const sp = this.specs[i];
      const m = this.joints[i].matrixWorld;
      const r = sp.r * Math.max(sp.sx, sp.sz);
      const a = new THREE.Vector3(0, sp.y0 + (sp.head ? r * 0.8 : r * 0.6), 0).applyMatrix4(m);
      const b = new THREE.Vector3(0, sp.y1 - (sp.head ? r * 0.8 : r * 0.6), 0).applyMatrix4(m);
      out.push({ a, b, r: r * 1.05, i });
    }
    return out;
  }

  worldToPart(i, world, out = new THREE.Vector3()) {
    tmpM.copy(this.joints[i].matrixWorld).invert();
    return out.copy(world).applyMatrix4(tmpM);
  }
  partToWorld(i, local, out = new THREE.Vector3()) {
    return out.copy(local).applyMatrix4(this.joints[i].matrixWorld);
  }
  headWorld(out = new THREE.Vector3()) {
    const sp = this.specs[P.HEAD];
    return out.set(0, (sp.y0 + sp.y1) / 2, 0).applyMatrix4(this.joints[P.HEAD].matrixWorld);
  }
  mouthWorld(out = new THREE.Vector3()) {
    return this.mouth.getWorldPosition(out);
  }

  // ---------------------------------------------------------------- ragdoll
  // transforms: array de 11 [x,y,z,qx,qy,qz,qw] (mundo) de cada articulación
  applyWorldTransforms(tr) {
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4();
    for (let i = 0; i < 11; i++) {
      const t = tr[i];
      if (!t || this.detached[i]) continue;
      tmpM.compose(tmpV.set(t[0], t[1], t[2]), tmpQ.set(t[3], t[4], t[5], t[6]), tmpV2.set(1, 1, 1));
      const j = this.joints[i];
      if (PARENT[i] < 0) inv.copy(this.root.matrixWorld).invert();
      else inv.copy(this.joints[PARENT[i]].matrixWorld).invert();
      tmpM2.multiplyMatrices(inv, tmpM);
      tmpM2.decompose(j.position, j.quaternion, tmpV2);
      j.updateMatrixWorld(true);
    }
  }
  readWorldTransforms() {
    this.root.updateWorldMatrix(true, true);
    const out = [];
    for (let i = 0; i < 11; i++) {
      this.joints[i].matrixWorld.decompose(tmpV, tmpQ, tmpV2);
      out.push([tmpV.x, tmpV.y, tmpV.z, tmpQ.x, tmpQ.y, tmpQ.z, tmpQ.w]);
    }
    return out;
  }
  resetJointPositions() {
    for (let i = 0; i < 11; i++) {
      if (this.detached[i] && PARENT[i] >= 0 && this.joints[i].parent !== this.joints[PARENT[i]]) continue;
      this.joints[i].position.copy(this.jointRest[i]);
    }
  }

  // ---------------------------------------------------------------- animación procedural
  // st: { speed, fwdSpeed, grounded, vy, action, actionT, aimPitch, held, drunk, high, sit, drive, emote, emoteT, crouch }
  animate(st, dt) {
    if (this.mode !== 'anim') return;
    const A = this.anim;
    const t = (A.idleT += dt);
    const J = {};
    for (const n of JOINT_NAMES) J[n] = [0, 0, 0];
    const drunk = clamp(st.drunk || 0, 0, 1.5), high = clamp(st.high || 0, 0, 1.5);
    let hipsY = 0;
    const spd = st.speed || 0;
    // largo de ciclo (2 pasos) = 4 * pierna * sin(amplitud): cada pisada cubre lo que avanza el cuerpo
    if (st.grounded !== false) A.phase += spd * dt * (Math.PI * 2 / (1.95 + clamp((spd - 4) / 3, 0, 1) * 0.85));
    const ph = A.phase;
    const run = clamp((spd - 4) / 3, 0, 1);
    const walkAmt = clamp(spd / 3.5, 0, 1);

    if (st.sit || st.drive) {
      J.hipL[0] = J.hipR[0] = -1.5;
      J.kneeL[0] = J.kneeR[0] = 1.45;
      J.hipL[2] = 0.08; J.hipR[2] = -0.08;
      hipsY = -0.45;
      J.spine[0] = st.drive ? 0.12 : st.table ? 0.17 : -0.08;
      if (st.drive) {
        J.shoulderL[0] = J.shoulderR[0] = -1.0;
        J.elbowL[0] = J.elbowR[0] = -0.6;
        J.shoulderL[2] = -0.25; J.shoulderR[2] = 0.25;
        const steer = st.steer || 0;
        J.shoulderL[0] += steer * 0.3; J.shoulderR[0] -= steer * 0.3;
      } else if (st.tableArms) {
        // sentado a la mesa sin IK (parroquianos del póker): antebrazos apoyados en el borde
        J.shoulderL[0] = J.shoulderR[0] = -0.62;
        J.elbowL[0] = J.elbowR[0] = -1.25;
        J.shoulderL[2] = -0.12; J.shoulderR[2] = 0.12;
        J.shoulderL[1] = 0.25; J.shoulderR[1] = -0.25;
      } else {
        J.shoulderL[0] = J.shoulderR[0] = -0.35;
        J.elbowL[0] = J.elbowR[0] = -0.9;
        J.shoulderL[2] = 0.15; J.shoulderR[2] = -0.15;
      }
    } else if (st.grounded === false) {
      // en el aire: corriendo, zancada larga (una pierna adelante, la otra atrás, brazos cruzados como al correr);
      // parado, piernas recogidas y brazos apenas abiertos. Antes los brazos se abrían en cruz y parecía un tropezón
      const leap = clamp((spd - 3.5) / 2.5, 0, 1), up = clamp((st.vy || 0) / 5, -1, 1);
      J.hipL[0] = lerp(-0.55, -0.95, leap); J.hipR[0] = lerp(-0.25, 0.4, leap);
      J.kneeL[0] = lerp(0.9, 0.75, leap) + Math.max(0, -up) * 0.2; J.kneeR[0] = lerp(0.6, 0.85, leap);
      J.shoulderL[0] = lerp(-0.35, 0.55, leap); J.shoulderR[0] = lerp(-0.35, -0.85, leap);
      J.shoulderL[2] = lerp(0.35, 0.12, leap); J.shoulderR[2] = -lerp(0.35, 0.12, leap);
      J.elbowL[0] = J.elbowR[0] = lerp(-0.5, -1.05, leap);
      J.spine[0] = leap * 0.18;
    } else {
      // caminar/correr
      const amp = lerp(0.55, 0.85, run) * walkAmt;
      const sw = Math.sin(ph);
      J.hipL[0] = -sw * amp;
      J.hipR[0] = sw * amp;
      J.kneeL[0] = Math.max(0, Math.sin(ph + 1.3)) * amp * 1.6 + 0.05;
      J.kneeR[0] = Math.max(0, Math.sin(ph + 1.3 + Math.PI)) * amp * 1.6 + 0.05;
      J.shoulderL[0] = sw * amp * 0.9;
      J.shoulderR[0] = -sw * amp * 0.9;
      J.elbowL[0] = J.elbowR[0] = -0.25 - run * 1.0;
      J.shoulderL[2] = 0.08; J.shoulderR[2] = -0.08;
      J.spine[0] = run * 0.28 + walkAmt * 0.05;
      J.spine[1] = sw * amp * 0.25;
      hipsY = -Math.abs(Math.cos(ph)) * 0.04 * walkAmt;
      // respiración en idle
      J.spine[0] += Math.sin(t * 1.6) * 0.015 * (1 - walkAmt);
      J.shoulderL[2] += Math.sin(t * 1.6) * 0.02 * (1 - walkAmt);
      J.shoulderR[2] -= Math.sin(t * 1.6) * 0.02 * (1 - walkAmt);
    }
    // en pedo: bamboleo
    if (drunk > 0.15 && !st.drive) {
      const dw = drunk * 0.22;
      J.spine[2] += Math.sin(t * 1.1) * dw;
      J.spine[0] += Math.sin(t * 0.7 + 1) * dw * 0.6;
      J.hips = J.hips || [0, 0, 0];
      J.hips[2] += Math.sin(t * 0.9) * dw * 0.5;
      J.neck[2] += Math.sin(t * 1.3 + 2) * dw * 0.8;
      J.shoulderL[2] += drunk * 0.25; J.shoulderR[2] -= drunk * 0.25;
    }
    if (high > 0.2) {
      J.neck[0] += high * 0.12;
      J.shoulderL[2] -= high * 0.05; J.shoulderR[2] += high * 0.05;
    }
    // mirar hacia donde apunta
    const pitch = clamp(st.aimPitch || 0, -1.2, 1.2);
    J.neck[0] += -pitch * 0.55;
    J.spine[0] += -pitch * 0.12;
    if (st.headYaw) {
      // la cabeza sigue la mirada; el torso acompaña un poco
      const hy = clamp(st.headYaw, -1.35, 1.35);
      J.neck[1] += hy * 0.72;
      J.spine[1] += hy * 0.28;
    }

    // objeto en mano (pose de base del brazo derecho)
    const held = st.held;
    if (held === 'two') {
      J.shoulderL[0] = J.shoulderR[0] = -1.1;
      J.elbowL[0] = J.elbowR[0] = -0.7;
      J.shoulderL[2] = -0.3; J.shoulderR[2] = 0.3;
    } else if (held === 'weapon') {
      J.shoulderR[0] = -0.5; J.elbowR[0] = -1.2; J.shoulderR[2] = -0.1;
    } else if (held === 'bottle' || held === 'spray') {
      // Carry at chest height: the actual right hand and prop remain visible from the eyes.
      J.shoulderR[0] = -1.00; J.elbowR[0] = -1.00; J.shoulderR[2] = -0.05;
    } else if (held === 'smoke') {
      J.shoulderR[0] = -0.90; J.elbowR[0] = -1.00; J.shoulderR[2] = -0.05;
    } else if (held === 'item') {
      J.shoulderR[0] = -0.35; J.elbowR[0] = -1.1; J.shoulderR[2] = -0.05;
    }

    // acciones (sobrescriben el torso/brazos)
    const at = st.actionT || 0;
    switch (st.action) {
      case 'drink': {
        const k = at < 0.3 ? at / 0.3 : at > 1.3 ? clamp(1 - (at - 1.3) / 0.35, 0, 1) : 1;
        J.shoulderR[0] = lerp(J.shoulderR[0], -0.75, k);
        J.shoulderR[2] = lerp(J.shoulderR[2], 0.45, k);
        J.elbowR[0] = lerp(J.elbowR[0], -2.1, k);
        J.neck[0] = lerp(J.neck[0], -0.20, k);
        J.spine[0] -= 0.12 * k;
        break;
      }
      case 'chug': {
        const k = clamp(at / 0.3, 0, 1);
        J.shoulderR[0] = lerp(J.shoulderR[0], -2.7, k);
        J.shoulderR[2] = lerp(J.shoulderR[2], 0.4, k);
        J.elbowR[0] = lerp(J.elbowR[0], -1.7, k);
        J.neck[0] = lerp(J.neck[0], -0.9, k);
        J.spine[0] -= 0.25 * k;
        J.shoulderL[2] = 1.2 * k;
        break;
      }
      case 'smoke': {
        const k = at < 0.25 ? at / 0.25 : at > 1.1 ? clamp(1 - (at - 1.1) / 0.3, 0, 1) : 1;
        J.shoulderR[0] = lerp(J.shoulderR[0], -1.00, k);
        J.shoulderR[2] = lerp(J.shoulderR[2], 0.55, k);
        J.elbowR[0] = lerp(J.elbowR[0], -2.20, k);
        J.neck[0] = lerp(J.neck[0], 0.05, k);
        break;
      }
      case 'bong': {
        const k = clamp(at / 0.4, 0, 1) * (at > 2.6 ? clamp(1 - (at - 2.6) / 0.4, 0, 1) : 1);
        J.spine[0] += 0.7 * k;
        J.neck[0] += 0.4 * k;
        J.shoulderL[0] = lerp(J.shoulderL[0], -1.2, k);
        J.shoulderR[0] = lerp(J.shoulderR[0], -1.0, k);
        J.elbowL[0] = lerp(J.elbowL[0], -0.8, k);
        J.elbowR[0] = lerp(J.elbowR[0], -1.2, k);
        J.hipL[0] -= 0.4 * k; J.hipR[0] -= 0.4 * k;
        J.kneeL[0] += 0.7 * k; J.kneeR[0] += 0.7 * k;
        hipsY -= 0.12 * k;
        break;
      }
      case 'spray': {
        J.shoulderR[0] = -1.5 + pitch * 0.9;
        J.shoulderR[2] = 0.12;
        J.elbowR[0] = -0.15;
        J.spine[1] -= 0.2;
        break;
      }
      case 'punchL':
      case 'punchR': {
        const L = st.action === 'punchL';
        const d = st.actionDur || 0.38;
        const f = at < d * 0.35 ? at / (d * 0.35) : clamp(1 - (at - d * 0.35) / (d * 0.65), 0, 1);
        const sh = L ? 'shoulderL' : 'shoulderR', el = L ? 'elbowL' : 'elbowR';
        J[sh][0] = lerp(-0.9, -1.55 + pitch * 0.5, f);
        J[sh][2] = L ? lerp(-0.1, -0.15, f) : lerp(0.1, 0.15, f);
        J[el][0] = lerp(-1.9, -0.08, f);
        J.spine[1] += (L ? -1 : 1) * 0.45 * f;
        // guardia con el otro brazo
        const osh = L ? 'shoulderR' : 'shoulderL', oel = L ? 'elbowR' : 'elbowL';
        J[osh][0] = -0.9; J[oel][0] = -1.9;
        J[osh][2] = L ? 0.1 : -0.1;
        break;
      }
      case 'guard': {
        J.shoulderL[0] = J.shoulderR[0] = -0.9;
        J.elbowL[0] = J.elbowR[0] = -1.95;
        J.shoulderL[2] = -0.12; J.shoulderR[2] = 0.12;
        J.spine[0] += 0.1;
        break;
      }
      case 'kick': {
        // patada frontal: recoge la rodilla (0-0.13 s), estira de golpe (0.13-0.22 s: ahí pega) y vuelve.
        // El cuerpo se tira un poco atrás para compensar y los brazos se abren (equilibrio).
        const chamber = clamp(at / 0.13, 0, 1);
        const snap = clamp((at - 0.13) / 0.09, 0, 1);
        const back = clamp((at - 0.26) / 0.24, 0, 1);
        const up = chamber * (1 - back);
        J.hipR[0] = lerp(0, -1.35 - 0.2 * snap, up);
        J.kneeR[0] = lerp(lerp(0.1, 1.9, chamber), 0.08, snap) * (1 - back) + 0.1 * back;
        J.hipL[0] = 0.12 * up; J.kneeL[0] = 0.25 * up; // la pierna de apoyo se flexiona
        J.spine[0] -= 0.32 * up;
        J.shoulderL[2] = 0.55 * up; J.shoulderR[2] = -0.4 * up;
        J.shoulderL[0] = -0.4 * up;
        break;
      }
      case 'dig': {
        // cavar con pala, las dos manos en el mango (la izquierda arriba, en la empuñadura): clavar con el pie (0-0.6),
        // palanca (0.6-1.0), levantar y tirar la tierra al costado (1.0-1.6) y volver. La pala la ubica el NPC entre
        // las dos manos (npc.js), así nunca queda al revés ni en una sola mano.
        const ph = at % 2.2, sm = (x) => x * x * (3 - 2 * x), s = (a, b) => clamp((ph - a) / (b - a), 0, 1);
        const push = sm(s(0, 0.4)) * (1 - sm(s(0.5, 0.75)));
        const lever = sm(s(0.6, 1.0)) * (1 - sm(s(1.6, 2.1)));
        const toss = sm(s(1.0, 1.3)) * (1 - sm(s(1.45, 1.9)));
        // la izquierda en la empuñadura (cerca de la panza); la derecha más abajo y adelante, sobre el mango
        J.spine[0] = 0.42 + push * 0.1 - lever * 0.12 - toss * 0.2; J.spine[1] = toss * 0.55; J.neck[0] = 0.2 - lever * 0.1;
        J.shoulderL[0] = -0.25 + lever * 0.15 - toss * 0.45; J.shoulderL[2] = -0.38; J.elbowL[0] = -1.25 - lever * 0.2 + toss * 0.25;
        J.shoulderR[0] = -0.75 - lever * 0.3 - toss * 0.35; J.shoulderR[2] = 0.22; J.elbowR[0] = -0.25 - lever * 0.35 - toss * 0.2;
        J.hipR[0] = -0.75 * push; J.kneeR[0] = 1.0 * push; // el pie sobre la hoja
        J.hipL[0] = -0.2; J.kneeL[0] = 0.3 + lever * 0.15;
        hipsY -= 0.05 + lever * 0.05;
        break;
      }
      case 'swing':
      case 'swing2': {
        // levantar (0-0.35), golpe (0.35-0.55), volver
        const two = held === 'two' || st.action === 'swing2';
        const wind = clamp(at / 0.35, 0, 1);
        const strike = clamp((at - 0.35) / 0.18, 0, 1);
        const rec = clamp((at - 0.6) / 0.35, 0, 1);
        const up = wind * (1 - strike);
        const shX = lerp(lerp(-0.5, -2.7, up), -0.9 + pitch * 0.4, strike * (1 - rec)) * (1 - rec) + J.shoulderR[0] * rec;
        J.shoulderR[0] = shX;
        J.shoulderR[2] = lerp(0.2, -0.1, strike);
        J.elbowR[0] = lerp(-1.5, -0.25, strike) * (1 - rec) + J.elbowR[0] * rec;
        J.spine[1] = lerp(0.5 * wind, -0.6, strike) * (1 - rec);
        J.spine[0] += strike * 0.35 * (1 - rec);
        if (two) {
          J.shoulderL[0] = J.shoulderR[0];
          J.elbowL[0] = J.elbowR[0];
          J.shoulderL[2] = -0.35;
        }
        break;
      }
      case 'throw': {
        const back = clamp(at / 0.2, 0, 1);
        const fw = clamp((at - 0.2) / 0.15, 0, 1);
        J.shoulderR[0] = lerp(-2.8 * back, -1.2, fw);
        J.elbowR[0] = lerp(-1.2, -0.1, fw);
        J.spine[1] = lerp(0.5 * back, -0.5, fw);
        break;
      }
      case 'charge': {
        J.shoulderR[0] = -2.7; J.elbowR[0] = -1.4; J.spine[1] = 0.5;
        break;
      }
      case 'vomit': {
        const k = clamp(at / 0.3, 0, 1) * (at > 2.2 ? clamp(1 - (at - 2.2) / 0.4, 0, 1) : 1);
        J.spine[0] += 0.9 * k;
        J.neck[0] += 0.3 * k;
        J.hipL[0] -= 0.25 * k; J.hipR[0] -= 0.25 * k;
        J.kneeL[0] += 0.4 * k; J.kneeR[0] += 0.4 * k;
        J.shoulderL[0] = lerp(J.shoulderL[0], -0.6, k); J.shoulderR[0] = lerp(J.shoulderR[0], -0.6, k);
        J.elbowL[0] = lerp(J.elbowL[0], -0.3, k); J.elbowR[0] = lerp(J.elbowR[0], -0.3, k);
        hipsY -= 0.08 * k;
        break;
      }
      case 'eat': {
        const k = at < 0.25 ? at / 0.25 : at > 1.6 ? clamp(1 - (at - 1.6) / 0.3, 0, 1) : 1;
        J.shoulderR[0] = lerp(J.shoulderR[0], -2.0, k);
        J.shoulderR[2] = lerp(J.shoulderR[2], 0.5, k);
        J.elbowR[0] = lerp(J.elbowR[0], -2.2, k);
        J.shoulderL[0] = lerp(J.shoulderL[0], -1.9, k);
        J.shoulderL[2] = lerp(J.shoulderL[2], -0.5, k);
        J.elbowL[0] = lerp(J.elbowL[0], -2.2, k);
        break;
      }
      case 'cheers': {
        const k = clamp(at / 0.3, 0, 1) * clamp(1 - (at - 1.2) / 0.3, 0, 1);
        J.shoulderR[0] = lerp(J.shoulderR[0], -2.6, k);
        J.elbowR[0] = lerp(J.elbowR[0], -0.3, k);
        break;
      }
      case 'getup': {
        const k = clamp(1 - at / 0.8, 0, 1);
        J.spine[0] += 1.1 * k;
        J.hipL[0] -= 1.2 * k; J.hipR[0] -= 1.2 * k;
        J.kneeL[0] += 1.8 * k; J.kneeR[0] += 1.8 * k;
        hipsY -= 0.5 * k;
        break;
      }
      default:
        break;
    }
    // emotes
    if (st.emote && !st.drive) this._emote(J, st.emote, st.emoteT || 0, t, (y) => { hipsY += y; });

    // agachado, barrida y dive (se aplican sobre todo lo anterior; ver LocalPlayer.physicsStep)
    if (!st.sit && !st.drive) {
      const J0 = J.hips || (J.hips = [0, 0, 0]);
      if (st.dive === 1) {
        // volando (Max Payne): cuerpo horizontal, brazos estirados adelante, piernas juntas atrás, la cabeza al frente
        const k = clamp((st.diveT || 0) / 0.12, 0, 1);
        J0[0] = lerp(J0[0], 1.3, k); J0[1] = 0; J0[2] = 0;
        J.spine[0] = lerp(J.spine[0], -0.2, k); J.spine[1] = 0;
        J.neck[0] = lerp(J.neck[0], -0.95, k);
        J.shoulderL[0] = J.shoulderR[0] = lerp(J.shoulderL[0], -2.75, k);
        J.shoulderL[2] = 0.18; J.shoulderR[2] = -0.18;
        J.elbowL[0] = J.elbowR[0] = -0.15;
        J.hipL[0] = 0.12; J.hipR[0] = 0.02; J.kneeL[0] = 0.28; J.kneeR[0] = 0.12;
        J.hipL[2] = 0.06; J.hipR[2] = -0.06;
        hipsY -= 0.15 * k;
      } else if (st.dive === 2 || st.dive === 3) {
        // de panza en el piso (resbalando) y después levantándose con las manos
        const k = st.dive === 2 ? 1 : clamp(1 - (st.diveT || 0) / 0.45, 0, 1);
        J0[0] = 1.45 * k; J0[1] = 0; J0[2] = 0;
        J.spine[0] = -0.45 * k + (1 - k) * J.spine[0];
        J.neck[0] = -0.8 * k;
        J.shoulderL[0] = J.shoulderR[0] = lerp(J.shoulderL[0], st.dive === 2 ? -2.4 : -1.4, k);
        J.elbowL[0] = J.elbowR[0] = lerp(J.elbowL[0], st.dive === 2 ? -0.35 : -1.2, k);
        J.shoulderL[2] = 0.35 * k; J.shoulderR[2] = -0.35 * k;
        J.hipL[0] = lerp(J.hipL[0], st.dive === 2 ? 0.1 : -1.2, k); J.hipR[0] = lerp(J.hipR[0], st.dive === 2 ? 0.05 : -0.3, k);
        J.kneeL[0] = lerp(J.kneeL[0], st.dive === 2 ? 0.4 : 1.6, k); J.kneeR[0] = lerp(J.kneeR[0], st.dive === 2 ? 0.2 : 0.6, k);
        hipsY -= 0.78 * k;
      } else if (st.slide) {
        // barrida: tirado para atrás, la pierna de adelante estirada, la otra doblada abajo, una mano al piso
        J0[0] = -0.55; J0[1] = 0.12; J0[2] = 0;
        J.spine[0] = 0.25; J.spine[1] = -0.1; J.neck[0] = 0.35;
        J.hipR[0] = -0.95; J.kneeR[0] = 0.12;
        J.hipL[0] = -0.1; J.kneeL[0] = 1.85; J.hipL[2] = 0.18;
        J.shoulderL[0] = 0.55; J.shoulderL[2] = 0.45; J.elbowL[0] = -0.2;
        J.shoulderR[0] = -0.9; J.elbowR[0] = -0.7;
        hipsY -= 0.62;
      } else if (st.crouch) {
        // agachado: rodillas dobladas, torso adelante; caminando, pasos cortos
        J.hipL[0] = J.hipL[0] * 0.55 - 1.0; J.hipR[0] = J.hipR[0] * 0.55 - 1.0;
        J.kneeL[0] = J.kneeL[0] * 0.5 + 1.65; J.kneeR[0] = J.kneeR[0] * 0.5 + 1.65;
        J.spine[0] += 0.38; J.neck[0] -= 0.3;
        hipsY += -0.33 - hipsY * 0.5;
      }
    }

    // caminar en pedo: piernas más abiertas
    if (drunk > 0.4 && walkAmt > 0.1) {
      J.hipL[2] += 0.12 * drunk; J.hipR[2] -= 0.12 * drunk;
    }

    // aplicar suavizado (la pierna que patea y el cuello del cabezazo siguen más rápido: el golpe es seco)
    const k = 1 - Math.exp(-dt * 18);
    const kFast = 1 - Math.exp(-dt * 46);
    for (let i = 0; i < JOINT_NAMES.length; i++) {
      const n = JOINT_NAMES[i];
      const tgt = J[n];
      const c = A.cur[i];
      const kk = (st.action === 'kick' && (i === 9 || i === 10)) || (st.action === 'headbutt' && (i === 1 || i === 2)) ? kFast : k;
      c.x += (tgt[0] - c.x) * kk;
      c.y += (tgt[1] - c.y) * kk;
      c.z += (tgt[2] - c.z) * kk;
      const j = this.joints[i];
      if (this.detached[i]) continue;
      j.rotation.set(c.x, c.y, c.z, 'YXZ');
    }
    A.bob += (hipsY - A.bob) * k;
    this.joints[0].position.set(this.jointRest[0].x, this.jointRest[0].y + A.bob, this.jointRest[0].z);
  }

  _emote(J, id, et, t, addY) {
    switch (id) {
      case 'wave': {
        J.shoulderR[0] = -0.3; J.shoulderR[2] = -2.6; J.elbowR[0] = -0.4;
        J.elbowR[1] = Math.sin(et * 10) * 0.6;
        J.shoulderR[1] = Math.sin(et * 10) * 0.3;
        break;
      }
      case 'dance1': { // cumbia
        const b = Math.sin(et * 6.5);
        J.hips = [0, b * 0.35, Math.sin(et * 3.25) * 0.12];
        J.spine[1] = -b * 0.3;
        J.shoulderL[0] = -0.7 + b * 0.3; J.shoulderR[0] = -0.7 - b * 0.3;
        J.elbowL[0] = J.elbowR[0] = -1.5;
        J.shoulderL[2] = 0.3; J.shoulderR[2] = -0.3;
        J.kneeL[0] = 0.3 + Math.max(0, b) * 0.4; J.kneeR[0] = 0.3 + Math.max(0, -b) * 0.4;
        J.hipL[0] = -0.2 - Math.max(0, b) * 0.2; J.hipR[0] = -0.2 - Math.max(0, -b) * 0.2;
        addY(-0.06 - Math.abs(b) * 0.03);
        break;
      }
      // caño y jaula: rutinas enteras al compás (char/pole-dance.js); et = tiempos del club, no segundos
      case 'pole': polePose(J, et, addY); break;
      case 'gogo': gogoPose(J, et, addY); break;
      case 'dj': djPose(J, et, addY); break;
      case 'dance2': { // brazos arriba, saltito
        const b = Math.sin(et * 8);
        J.shoulderL[2] = 2.6 + b * 0.2; J.shoulderR[2] = -2.6 - b * 0.2;
        J.elbowL[0] = J.elbowR[0] = -0.3;
        J.spine[2] = Math.sin(et * 4) * 0.2;
        J.neck[0] = Math.abs(b) * 0.3 - 0.1;
        addY(Math.abs(b) * 0.08);
        break;
      }
      case 'dance3': { // el robot
        const s = Math.floor(et * 3) % 4;
        const poses = [[-1.5, 0, -1.5, 0], [-1.5, -1.5, 0, -1.5], [0, -1.5, -1.5, 0], [-1.5, 0, 0, -1.5]];
        const p = poses[s];
        J.shoulderL[0] = p[0]; J.elbowL[0] = p[1]; J.shoulderR[0] = p[2]; J.elbowR[0] = p[3];
        J.neck[1] = [0.5, -0.5, 0, 0.3][s];
        J.spine[1] = [0.3, -0.3, 0, 0.2][s];
        break;
      }
      case 'clap': {
        const c = Math.abs(Math.sin(et * 9));
        J.shoulderL[0] = J.shoulderR[0] = -1.3;
        J.shoulderL[2] = -0.3 - c * 0.4; J.shoulderR[2] = 0.3 + c * 0.4;
        J.elbowL[0] = J.elbowR[0] = -0.9;
        break;
      }
      case 'point': {
        J.shoulderR[0] = -1.55; J.elbowR[0] = -0.05; J.shoulderR[2] = 0.05;
        break;
      }
      case 'facepalm': {
        J.shoulderR[0] = -1.9; J.shoulderR[2] = 0.6; J.elbowR[0] = -2.3; J.neck[0] = 0.35;
        break;
      }
      case 'sitfloor': {
        J.hipL[0] = J.hipR[0] = -1.55;
        J.hipL[2] = 0.4; J.hipR[2] = -0.4;
        J.kneeL[0] = J.kneeR[0] = 2.2;
        J.shoulderL[0] = J.shoulderR[0] = -0.5; J.elbowL[0] = J.elbowR[0] = -0.8;
        addY(-0.72);
        break;
      }
      case 'pushups': {
        const c = (Math.sin(et * 4) + 1) / 2;
        J.shoulderL[0] = J.shoulderR[0] = -1.4;
        J.elbowL[0] = J.elbowR[0] = -c * 1.2;
        break;
      }
      case 'flex': {
        J.shoulderL[2] = 1.5; J.shoulderR[2] = -1.5;
        J.elbowL[0] = J.elbowR[0] = -1.9;
        J.shoulderL[0] = J.shoulderR[0] = -0.1;
        J.elbowL[1] = 0.5; J.elbowR[1] = -0.5;
        J.spine[0] = -0.1;
        break;
      }
      default:
        break;
    }
    J.hips = J.hips || [0, 0, 0];
  }

  // ---------------------------------------------------------------- update general
  update(dt) {
    this._dripStep(dt);
    // boca al hablar
    const tk = this.talk;
    this.mouth.scale.y = 0.25 + tk * 1.6;
    this.mouth.scale.x = 1.1 - tk * 0.2;
    if (this.stumps) for (const s of this.stumps) s.t += dt;
  }

  setVisibleHead(v) {
    const h = this.parts[P.HEAD].group;
    h.visible = v;
    if (this.hat) this.hat.visible = v;
  }

  _disposePart(p) {
    p.tex.dispose();
    p.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  dispose() {
    for (const p of this.parts) this._disposePart(p);
    this.faceTex.dispose();
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}

// ---------------------------------------------------------------- geometrías
function partGeometry(spec, layer) {
  const len = spec.y1 - spec.y0;
  const r = spec.r * layer;
  let g;
  if (spec.head) {
    g = new THREE.SphereGeometry(r, 26, 18);
    g.scale(1, len / (2 * spec.r), 1);
  } else {
    const cyl = Math.max(0.002, len - 2 * spec.r);
    g = new THREE.CapsuleGeometry(r, cyl, 6, 18);
  }
  g.scale(spec.sx || 1, 1, spec.sz || 1);
  g.translate(0, (spec.y0 + spec.y1) / 2, 0);
  return g;
}

const ORGAN_MATS = {};
function organMat(key, color) {
  if (!ORGAN_MATS[key]) ORGAN_MATS[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.05 });
  return ORGAN_MATS[key];
}

function boneGeometry(i, spec) {
  const len = spec.y1 - spec.y0;
  const cy = (spec.y0 + spec.y1) / 2;
  const geos = [];
  let organs = null;
  if (i === P.HEAD) {
    const skull = new THREE.SphereGeometry(spec.r * 0.84, 20, 14);
    skull.scale(0.92, len / (2 * spec.r), 1.0);
    skull.translate(0, cy + 0.005, 0);
    geos.push(skull);
    organs = new THREE.Group();
    const brain = new THREE.Mesh(new THREE.SphereGeometry(spec.r * 0.7, 16, 12), organMat('brain', 0xd98a9a));
    brain.scale.set(0.9, 0.85, 1.05);
    brain.position.y = cy + 0.02;
    const eyeM = organMat('eye', 0xf2f0e6);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), eyeM);
      e.position.set(s * 0.042, cy + 0.03, spec.r * 0.72);
      organs.add(e);
    }
    organs.add(brain);
  } else if (i === P.TORSO) {
    const spine = new THREE.CylinderGeometry(0.022, 0.026, len * 0.95, 8);
    spine.translate(0, cy, -spec.r * spec.sz * 0.55);
    geos.push(spine);
    for (let k = 0; k < 7; k++) {
      const y = spec.y0 + 0.14 + k * 0.042;
      const w = 1 - Math.abs(k - 3) * 0.06;
      const rib = new THREE.TorusGeometry(spec.r * 0.76, 0.011, 5, 22, Math.PI * 1.72);
      rib.rotateX(Math.PI / 2);
      rib.rotateY(Math.PI / 2 + 0.28 * Math.PI);
      rib.scale(spec.sx * w, 1, spec.sz * 0.95);
      rib.translate(0, y, 0);
      geos.push(rib);
    }
    const sternum = new THREE.BoxGeometry(0.03, 0.2, 0.015);
    sternum.translate(0, spec.y0 + 0.28, spec.r * spec.sz * 0.72);
    geos.push(sternum);
    for (const s of [-1, 1]) {
      const clav = new THREE.CylinderGeometry(0.012, 0.012, 0.18, 6);
      clav.rotateZ(Math.PI / 2 + s * 0.2);
      clav.translate(s * 0.1, spec.y1 - 0.06, spec.r * spec.sz * 0.35);
      geos.push(clav);
    }
    organs = new THREE.Group();
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), organMat('heart', 0x8a0f14));
    heart.position.set(0.03, spec.y0 + 0.3, spec.r * spec.sz * 0.25);
    heart.scale.set(1, 1.2, 0.9);
    const lungM = organMat('lung', 0xd98080);
    for (const s of [-1, 1]) {
      const lung = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), lungM);
      lung.scale.set(0.9 * spec.sx, 1.5, 0.85 * spec.sz);
      lung.position.set(s * 0.085 * spec.sx, spec.y0 + 0.31, 0);
      organs.add(lung);
    }
    const liver = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), organMat('liver', 0x5a1414));
    liver.scale.set(1.5, 0.7, 0.9);
    liver.position.set(-0.05, spec.y0 + 0.13, 0.03);
    const stomach = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), organMat('stomach', 0xc97a7a));
    stomach.position.set(0.06, spec.y0 + 0.12, 0.04);
    organs.add(heart, liver, stomach);
  } else if (i === P.PELVIS) {
    const ring = new THREE.TorusGeometry(spec.r * 0.7, 0.025, 6, 18);
    ring.rotateX(Math.PI / 2 - 0.3);
    ring.scale(spec.sx, 1, spec.sz);
    ring.translate(0, cy, 0);
    geos.push(ring);
    organs = new THREE.Group();
    const intM = organMat('guts', 0xd9899a);
    const pts = [];
    for (let k = 0; k < 40; k++) {
      const a = k * 0.9;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.07 * spec.sx, cy - 0.02 + Math.sin(k * 0.37) * 0.05, Math.sin(a) * 0.05 + 0.02));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.017, 6), intM);
    organs.add(tube);
  } else {
    // huesos largos
    const br = spec.r * 0.3;
    const L = len - spec.r * 0.9;
    const shaft = new THREE.CylinderGeometry(br, br, L, 8);
    shaft.translate(0, cy, 0);
    geos.push(shaft);
    for (const e of [-1, 1]) {
      const knob = new THREE.SphereGeometry(br * 1.5, 8, 6);
      knob.translate(0, cy + e * L / 2, 0);
      geos.push(knob);
    }
  }
  // fusionar
  let bone;
  if (geos.length === 1) bone = geos[0];
  else {
    const nonIdx = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    for (const g of nonIdx) for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    let count = 0;
    for (const g of nonIdx) count += g.attributes.position.count;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
    let o = 0;
    for (const g of nonIdx) {
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      o += g.attributes.position.count;
    }
    bone = new THREE.BufferGeometry();
    bone.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    bone.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  }
  return { bone, organs };
}

let STUMP_TEX = null;
function stumpCap(r) {
  if (!STUMP_TEX) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, '#f3ead6');
    g.addColorStop(0.22, '#e8dcc0');
    g.addColorStop(0.27, '#7a0a0a');
    g.addColorStop(0.75, '#b0181a');
    g.addColorStop(0.86, '#e8c9a0');
    g.addColorStop(1, '#6a0808');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 60; k++) {
      x.fillStyle = `rgba(${90 + Math.random() * 80},0,0,0.5)`;
      x.beginPath();
      x.arc(64 + (Math.random() - 0.5) * 80, 64 + (Math.random() - 0.5) * 80, 2 + Math.random() * 4, 0, Math.PI * 2);
      x.fill();
    }
    STUMP_TEX = new THREE.CanvasTexture(c);
    STUMP_TEX.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 16),
    new THREE.MeshStandardMaterial({ map: STUMP_TEX, roughness: 0.3, side: THREE.DoubleSide }),
  );
  return m;
}
