// Personaje humano realista (Renderpeople, GLB riggeado) manejado por el mismo animador procedural del juego.
// Idea: un "esqueleto virtual" de 11 articulaciones (el mismo que usa Character) recibe las poses
// (animación procedural o ragdoll) y se re-mapea sobre los huesos reales del modelo.
// Así la física (ragdoll) y las animaciones comparten una sola representación.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { G, clamp, rng } from '../core/G.js';
import { Character, JOINT_NAMES, PARENT, P } from './character.js';
import { makeDevil } from './devil.js';

export const MODELS = {
  eric: { file: 'assets/chars/eric.glb', label: 'Eric', gender: 'm' },
  carla: { file: 'assets/chars/carla.glb', label: 'Carla', gender: 'f' },
  claudia: { file: 'assets/chars/claudia.glb', label: 'Claudia', gender: 'f' },
  galleta: { file: 'assets/chars/cookie.glb', label: 'Galleta', gender: 'm', voice: 'cookie' },
  // exclusivo del dueño (el servidor solo se lo deja a SmokePyro con su clave): "Demon" de VidovicArts (Sketchfab,
  // CC-BY 4.0), rig reparado en Blender (assets/blender/repair_demon.py + retarget_human.py)
  diablo: { file: 'assets/chars/diablo.glb', label: 'El Diablo', gender: 'm', devil: true, owner: true, voice: 'demon' },
  // la gente del Búnker (MakeHuman CC0 + ropa procedural: assets/blender/mh/build_npc.py). Se bajan recién cerca del club
  portero: { file: 'assets/chars/npc/portero.glb', label: 'El Portero', gender: 'm', npc: true },
  lilith: { file: 'assets/chars/npc/lilith.glb', label: 'Lilith', gender: 'f', npc: true },
  coneja: { file: 'assets/chars/npc/coneja.glb', label: 'La Coneja', gender: 'f', npc: true },
  dj: { file: 'assets/chars/npc/dj.glb', label: 'DJ Calavera', gender: 'm', npc: true },
  venus: { file: 'assets/chars/npc/venus.glb', label: 'Venus', gender: 'f', npc: true },
  raven: { file: 'assets/chars/npc/raven.glb', label: 'Raven', gender: 'f', npc: true },
  bartender: { file: 'assets/chars/npc/bartender.glb', label: 'El Bartender', gender: 'm', npc: true },
  toro: { file: 'assets/chars/npc/toro.glb', label: 'El Toro', gender: 'm', npc: true },
  chacal: { file: 'assets/chars/npc/chacal.glb', label: 'El Chacal', gender: 'm', npc: true },
  metalero: { file: 'assets/chars/npc/metalero.glb', label: 'El Metalero', gender: 'm', npc: true },
  emo: { file: 'assets/chars/npc/emo.glb', label: 'La Emo', gender: 'f', npc: true },
  raver: { file: 'assets/chars/npc/raver.glb', label: 'El Raver', gender: 'm', npc: true },
  gordo: { file: 'assets/chars/npc/gordo.glb', label: 'El Gordo', gender: 'm', npc: true },
  // la gente del castillo y del resto del mapa (assets/blender/mh/villagers_cast.py)
  v_bruja: { file: 'assets/chars/npc/v_bruja.glb', label: 'La Bruja Morgana', gender: 'f', npc: true },
  v_parrillero: { file: 'assets/chars/npc/v_parrillero.glb', label: 'El Parrillero', gender: 'm', npc: true },
  v_tabernero: { file: 'assets/chars/npc/v_tabernero.glb', label: 'El Tabernero', gender: 'm', npc: true },
  v_sepulturero: { file: 'assets/chars/npc/v_sepulturero.glb', label: 'El Sepulturero', gender: 'm', npc: true },
  v_guardia: { file: 'assets/chars/npc/v_guardia.glb', label: 'Guardia', gender: 'm', npc: true },
  v_granjero: { file: 'assets/chars/npc/v_granjero.glb', label: 'El Granjero', gender: 'm', npc: true },
  v_aldeana: { file: 'assets/chars/npc/v_aldeana.glb', label: 'Aldeana', gender: 'f', npc: true },
  v_vecino: { file: 'assets/chars/npc/v_vecino.glb', label: 'Vecino', gender: 'm', npc: true },
  v_punk: { file: 'assets/chars/npc/v_punk.glb', label: 'Punk', gender: 'f', npc: true },
  v_abuela: { file: 'assets/chars/npc/v_abuela.glb', label: 'La Abuela Nieves', gender: 'f', npc: true },
  v_hincha: { file: 'assets/chars/npc/v_hincha.glb', label: 'Hincha', gender: 'm', npc: true },
  v_corredora: { file: 'assets/chars/npc/v_corredora.glb', label: 'Corredora', gender: 'f', npc: true },
};
export const DEFAULT_MODEL = 'eric';
const CACHE = new Map(); // modelo -> { scene, meta }
const DMG_SIZE = 512;

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const V3 = new THREE.Vector3();
const Q1 = new THREE.Quaternion();
const Q2 = new THREE.Quaternion();
const QI = new THREE.Quaternion();
const QA = new THREE.Quaternion();
const QB = new THREE.Quaternion();
const QC = new THREE.Quaternion();
const QD = new THREE.Quaternion();
// cuánto puede girar la muñeca para acomodar la mano al mango (rad)
const WRIST_MAX = 1.25;
// dedos: grosor (m) y cierre máximo por falange (rad) [base, medio, punta]
const FINGER_R = 0.0085;
const CURL_MAX = [1.45, 1.65, 1.2];
const THUMB_MAX = [0.55, 0.95, 0.95];
const V4 = new THREE.Vector3();
const V5 = new THREE.Vector3();

// Distancia con signo de un punto (mundo) a lo que tiene la mano: un mango (recta por el puño con su radio) o la
// forma del objeto (caja, cilindro, bola, cápsula en su marco). Negativa = adentro.
function gripDistance(g, p) {
  if (g.line) {
    const d = V4.copy(p).sub(g.line.o);
    return d.addScaledVector(g.line.dir, -d.dot(g.line.dir)).length() - g.line.r;
  }
  const q = V5.copy(p).applyMatrix4(g.inv);
  const def = g.def;
  const y = q.y - (def.oy || 0);
  if (def.shape === 'ball') return Math.hypot(q.x, y, q.z) - def.r;
  if (def.shape === 'cyl') {
    const dr = Math.hypot(q.x, q.z) - def.r, dy = Math.abs(y) - def.h / 2;
    return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0));
  }
  if (def.shape === 'capsule') {
    const hh = Math.max(0, def.h / 2 - def.r);
    return Math.hypot(q.x, Math.max(0, Math.abs(y) - hh), q.z) - def.r;
  }
  const qx = Math.abs(q.x) - (def.hx || 0.1), qy = Math.abs(y) - (def.hy || 0.1), qz = Math.abs(q.z) - (def.hz || 0.1);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
}
const M1 = new THREE.Matrix4();
const M2 = new THREE.Matrix4();

// Hueso real <- articulación virtual (fracción para repartir columna/cuello)
const MAP = [
  ['hip', 0, 1],
  ['spine_01', 1, 1 / 3], ['spine_02', 1, 1 / 3], ['spine_03', 1, 1 / 3],
  ['neck', 2, 0.4], ['head', 2, 'rest0.4'],
  ['upperarm_l', 3, 1], ['lowerarm_l', 4, 1],
  ['upperarm_r', 5, 1], ['lowerarm_r', 6, 1],
  ['upperleg_l', 7, 1], ['lowerleg_l', 8, 1],
  ['upperleg_r', 9, 1], ['lowerleg_r', 10, 1],
];
// Hueso principal de cada parte (para hits y daño)
const PART_BONE = ['hip', 'spine_02', 'head', 'upperarm_l', 'lowerarm_l', 'upperarm_r', 'lowerarm_r', 'upperleg_l', 'lowerleg_l', 'upperleg_r', 'lowerleg_r'];
const PART_OF_BONE = {
  root: 0, hip: 0, spine_01: 1, spine_02: 1, spine_03: 1, neck: 2, head: 2, jaw: 2, shoulder_l: 1, shoulder_r: 1,
  upperarm_l: 3, upperarm_twist_l: 3, lowerarm_l: 4, lowerarm_twist_l: 4, hand_l: 4,
  upperarm_r: 5, upperarm_twist_r: 5, lowerarm_r: 6, lowerarm_twist_r: 6, hand_r: 6,
  upperleg_l: 7, upperleg_twist_l: 7, lowerleg_l: 8, lowerleg_twist_l: 8, foot_l: 8, ball_l: 8,
  upperleg_r: 9, upperleg_twist_r: 9, lowerleg_r: 10, lowerleg_twist_r: 10, foot_r: 10, ball_r: 10,
};
const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

// ---------------------------------------------------------------- carga + metadatos por modelo
export async function preloadHumans(onProgress) {
  const loader = new GLTFLoader();
  // Los alias, si los hay, comparten la descarga y los metadatos de su modelo base.
  const keys = Object.keys(MODELS).filter((k) => !MODELS[k].base && !MODELS[k].npc);
  let done = 0;
  await Promise.all(keys.map(async (key) => {
    if (CACHE.has(key)) return;
    const gltf = await loader.loadAsync(MODELS[key].file);
    CACHE.set(key, { scene: gltf.scene, meta: buildMeta(gltf.scene) });
    done++;
    onProgress && onProgress(done, keys.length);
  }));
  for (const [k, m] of Object.entries(MODELS)) if (m.base && CACHE.has(m.base)) CACHE.set(k, CACHE.get(m.base));
}
function shrinkTextures(root, max) {
  if (typeof document === 'undefined') return;
  const done = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const k of ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'emissiveMap']) {
        const t = m?.[k], img = t?.image;
        if (!t || done.has(t) || !img || !(img.width > max)) continue;
        done.add(t);
        const s = max / Math.max(img.width, img.height);
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        t.image = cv;
        t.needsUpdate = true;
      }
    }
  });
}
export function humansReady(key = null) { return key ? CACHE.has(key) : CACHE.size > 0; }
// modelos que se bajan cuando hacen falta (los del Búnker): devuelve una promesa; mientras tanto humansReady(key) = false
const LOADING = new Map();
export function loadHuman(key) {
  if (CACHE.has(key)) return Promise.resolve(true);
  if (!MODELS[key]) return Promise.resolve(false);
  if (!LOADING.has(key)) {
    LOADING.set(key, new GLTFLoader().loadAsync(MODELS[key].file).then((gltf) => {
      // los NPC se ven de lejos y son muchos: sus texturas van a 1024 (4 veces menos memoria de video)
      if (MODELS[key].npc) shrinkTextures(gltf.scene, 1024);
      CACHE.set(key, { scene: gltf.scene, meta: buildMeta(gltf.scene) });
      return true;
    }).catch((e) => { console.warn('modelo', key, e); return false; }));
  }
  return LOADING.get(key);
}

function findSkinned(root) {
  let sk = null;
  root.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o; });
  return sk;
}
function bonesByName(root) {
  const b = {};
  root.traverse((o) => { if (o.isBone) b[o.name] = o; });
  return b;
}
function worldPos(o, out = new THREE.Vector3()) { return o.getWorldPosition(out); }
function worldQuat(o, out = new THREE.Quaternion()) { return o.getWorldQuaternion(out); }

// Rota un hueso (en espacio mundo del modelo) para que su dirección hacia `child` sea `target`
function aimBone(bone, child, target) {
  bone.updateWorldMatrix(true, true);
  const from = worldPos(child, new THREE.Vector3()).sub(worldPos(bone, new THREE.Vector3())).normalize();
  const to = target.clone().normalize();
  const c = new THREE.Quaternion().setFromUnitVectors(from, to);
  const wq = worldQuat(bone).premultiply(c);
  const pq = bone.parent ? worldQuat(bone.parent) : new THREE.Quaternion();
  bone.quaternion.copy(pq.invert().multiply(wq));
  bone.updateWorldMatrix(false, true);
}

function buildMeta(scene) {
  scene.updateWorldMatrix(true, true);
  const B = bonesByName(scene);
  const sk = findSkinned(scene);
  // --- pose neutra: brazos colgando, piernas rectas (el modelo viene en pose A)
  aimBone(B.upperarm_l, B.lowerarm_l, new THREE.Vector3(0.1, -1, 0.0));
  aimBone(B.lowerarm_l, B.hand_l, new THREE.Vector3(0.04, -1, 0.07));
  aimBone(B.upperarm_r, B.lowerarm_r, new THREE.Vector3(-0.1, -1, 0.0));
  aimBone(B.lowerarm_r, B.hand_r, new THREE.Vector3(-0.04, -1, 0.07));
  aimBone(B.hand_l, B.middle_01_l, new THREE.Vector3(0.02, -1, 0.04));
  aimBone(B.hand_r, B.middle_01_r, new THREE.Vector3(-0.02, -1, 0.04));
  aimBone(B.upperleg_l, B.lowerleg_l, new THREE.Vector3(0.015, -1, 0));
  aimBone(B.upperleg_r, B.lowerleg_r, new THREE.Vector3(-0.015, -1, 0));
  aimBone(B.lowerleg_l, B.foot_l, new THREE.Vector3(0, -1, -0.03));
  aimBone(B.lowerleg_r, B.foot_r, new THREE.Vector3(0, -1, -0.03));
  scene.updateWorldMatrix(true, true);

  const nWorld = {};
  for (const [name, bone] of Object.entries(B)) nWorld[name] = worldQuat(bone);
  const map = MAP.map(([name, j, frac]) => {
    const bone = B[name];
    const parentName = bone.parent && bone.parent.isBone ? bone.parent.name : null;
    const pW = parentName ? nWorld[parentName].clone() : new THREE.Quaternion();
    return {
      name, j, frac,
      pre: pW.invert(),
      post: nWorld[name].clone(),
    };
  });

  // --- articulaciones virtuales en posiciones reales
  const p = (n) => worldPos(B[n]);
  const hips = p('hip'), spine = p('spine_01'), neck = p('neck');
  const shL = p('upperarm_l'), elL = p('lowerarm_l'), haL = p('hand_l');
  const shR = p('upperarm_r'), elR = p('lowerarm_r'), haR = p('hand_r');
  const hiL = p('upperleg_l'), knL = p('lowerleg_l'), anL = p('foot_l');
  const hiR = p('upperleg_r'), knR = p('lowerleg_r'), anR = p('foot_r');
  const headTop = p('head_end');
  const height = headTop.y;
  const k = height / 1.8;
  const jointRest = [
    hips.clone(), spine.clone().sub(hips), neck.clone().sub(spine),
    shL.clone().sub(spine), elL.clone().sub(shL), shR.clone().sub(spine), elR.clone().sub(shR),
    hiL.clone().sub(hips), knL.clone().sub(hiL), hiR.clone().sub(hips), knR.clone().sub(hiR),
  ];
  // cápsulas en el marco de cada articulación virtual (a, b, radio)
  const seg = (to) => to.clone();
  const handExt = (el, ha) => ha.clone().sub(el).multiplyScalar(1.28);
  const footExt = (kn, an) => an.clone().sub(kn).add(new THREE.Vector3(0, -0.06, 0.04));
  const caps = [
    { a: new THREE.Vector3(0, -0.08 * k, 0), b: spine.clone().sub(hips), r: 0.15 * k },
    { a: new THREE.Vector3(0, 0.02, 0), b: neck.clone().sub(spine).multiplyScalar(0.92), r: 0.165 * k },
    { a: new THREE.Vector3(0, 0.05 * k, 0.01), b: headTop.clone().sub(neck).add(new THREE.Vector3(0, -0.07 * k, 0.015)), r: 0.105 * k, head: true },
    { a: new THREE.Vector3(), b: seg(elL.clone().sub(shL)), r: 0.055 * k },
    { a: new THREE.Vector3(), b: handExt(elL, haL), r: 0.047 * k },
    { a: new THREE.Vector3(), b: seg(elR.clone().sub(shR)), r: 0.055 * k },
    { a: new THREE.Vector3(), b: handExt(elR, haR), r: 0.047 * k },
    { a: new THREE.Vector3(), b: seg(knL.clone().sub(hiL)), r: 0.08 * k },
    { a: new THREE.Vector3(), b: footExt(knL, anL), r: 0.06 * k },
    { a: new THREE.Vector3(), b: seg(knR.clone().sub(hiR)), r: 0.08 * k },
    { a: new THREE.Vector3(), b: footExt(knR, anR), r: 0.06 * k },
  ];
  // masas (kg) aproximadas
  const mass = [11, 24, 5, 2.2, 1.7, 2.2, 1.7, 8.5, 4.5, 8.5, 4.5];

  // --- dedos: eje de flexión en espacio local de cada falange
  const fingers = { l: [], r: [] };
  for (const side of ['l', 'r']) {
    const hand = B['hand_' + side];
    const hp = p('hand_' + side);
    const ip = p('index_01_' + side), pp = p('pinky_01_' + side);
    let palm = new THREE.Vector3().subVectors(ip, hp).cross(new THREE.Vector3().subVectors(pp, hp)).normalize();
    // la palma mira hacia el cuerpo (x = 0) con los brazos colgando
    const toMid = new THREE.Vector3(-Math.sign(hp.x) || 1, 0, 0);
    if (palm.dot(toMid) < 0) palm.negate();
    for (const f of FINGERS) {
      for (let n = 1; n <= 3; n++) {
        const bone = B[`${f}_0${n}_${side}`];
        const child = n < 3 ? B[`${f}_0${n + 1}_${side}`] : B[`${f}_end_${side}`];
        if (!bone || !child) continue;
        const d = p(child.name).sub(p(bone.name)).normalize();
        const axisW = new THREE.Vector3().crossVectors(d, f === 'thumb' ? palm.clone().lerp(new THREE.Vector3(0, 0, 1), 0.5).normalize() : palm).normalize();
        const inv = nWorld[bone.name].clone().invert();
        const axisL = axisW.applyQuaternion(inv).normalize();
        fingers[side].push({ name: bone.name, axis: axisL, rest: bone.quaternion.clone(), thumb: f === 'thumb', n, tip: child.position.clone() });
      }
    }
    void hand;
  }
  // mandíbula y párpados: girar sobre el eje X del personaje
  const localAxis = (name, w) => (B[name] ? w.clone().applyQuaternion(nWorld[name].clone().invert()).normalize() : null);
  const face = {
    jaw: { axis: localAxis('jaw', new THREE.Vector3(1, 0, 0)), rest: B.jaw?.quaternion.clone() },
    lidL: { axis: localAxis('eyelid_l', new THREE.Vector3(1, 0, 0)), rest: B.eyelid_l?.quaternion.clone() },
    lidR: { axis: localAxis('eyelid_r', new THREE.Vector3(1, 0, 0)), rest: B.eyelid_r?.quaternion.clone() },
  };
  // pies: compensación para que queden planos al caminar
  const feet = {
    l: { rest: B.foot_l.quaternion.clone(), axis: localAxis('foot_l', new THREE.Vector3(1, 0, 0)), bindW: nWorld.foot_l.clone() },
    r: { rest: B.foot_r.quaternion.clone(), axis: localAxis('foot_r', new THREE.Vector3(1, 0, 0)), bindW: nWorld.foot_r.clone() },
  };
  // palma (punto de agarre) en espacio local de la mano
  const grip = {};
  for (const side of ['l', 'r']) {
    const hp = p('hand_' + side);
    const mid = p('middle_01_' + side);
    const th = p('thumb_02_' + side);
    const c = hp.clone().lerp(mid, 0.72).lerp(th, 0.25);
    grip[side] = B['hand_' + side].worldToLocal(c.clone());
  }
  // centro de la cabeza, boca y ojos en espacio local del hueso head
  const headB = B.head;
  const eyeMid = p('eye_l').lerp(p('eye_r'), 0.5);
  const mouth = p('mouth_l').lerp(p('mouth_r'), 0.5);
  const headCenter = eyeMid.clone().lerp(headTop, 0.25);
  headCenter.z -= 0.03 * k;
  const headInfo = {
    center: headB.worldToLocal(headCenter.clone()),
    mouth: headB.worldToLocal(mouth.clone().add(new THREE.Vector3(0, 0, 0.01))),
    eyes: headB.worldToLocal(eyeMid.clone()),
    top: headB.worldToLocal(headTop.clone()),
    worldCenter: headCenter.clone(),
    worldTop: headTop.clone(),
    worldEyes: eyeMid.clone(),
    headQ: nWorld.head.clone(),
    radius: 0.105 * k,
  };
  // --- datos de piel para el daño: posiciones en pose bind + UV + parte dominante
  const geo = sk.geometry;
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const boneNames = sk.skeleton.bones.map((b) => b.name);
  const vparts = [];
  for (let i = 0; i < 11; i++) vparts.push([]);
  for (let v = 0; v < pos.count; v++) {
    let best = 0, bw = -1;
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(v, c);
      if (w > bw) { bw = w; best = si.getComponent(v, c); }
    }
    const part = PART_OF_BONE[boneNames[best]] ?? (boneNames[best].includes('_l') ? 4 : boneNames[best].includes('_r') ? 6 : 1);
    vparts[part].push(v);
  }
  // UV de puntos especiales de la cara (sangre de nariz/boca/orejas/ojos)
  const bindMatrix = sk.bindMatrix;
  const nearestUV = (worldPt, part) => {
    // el modelo está en pose neutra: pasar a espacio bind con el hueso principal de la parte
    const bi = boneNames.indexOf(PART_BONE[part]);
    const bone = sk.skeleton.bones[bi];
    M1.multiplyMatrices(bone.matrixWorld, sk.skeleton.boneInverses[bi]);
    M2.copy(M1).invert();
    const bp = worldPt.clone().applyMatrix4(M2);
    let bv = -1, bd = 1e9;
    for (const v of vparts[part]) {
      V1.fromBufferAttribute(pos, v).applyMatrix4(bindMatrix);
      const d = V1.distanceToSquared(bp);
      if (d < bd) { bd = d; bv = v; }
    }
    return bv >= 0 ? [uv.getX(bv), uv.getY(bv)] : [0.5, 0.5];
  };
  const eyeL = p('eye_l'), eyeR = p('eye_r');
  const faceUV = {
    nose: nearestUV(eyeMid.clone().lerp(mouth, 0.55).add(new THREE.Vector3(0, 0, 0.05 * k)), 2),
    mouth: nearestUV(mouth.clone().add(new THREE.Vector3(0, -0.005, 0.03 * k)), 2),
    eyeL: nearestUV(eyeL.clone().add(new THREE.Vector3(0.012, -0.012, 0.02 * k)), 2),
    eyeR: nearestUV(eyeR.clone().add(new THREE.Vector3(-0.012, -0.012, 0.02 * k)), 2),
    earL: nearestUV(new THREE.Vector3(headCenter.x + 0.085 * k, eyeMid.y - 0.02 * k, headCenter.z - 0.01), 2),
    earR: nearestUV(new THREE.Vector3(headCenter.x - 0.085 * k, eyeMid.y - 0.02 * k, headCenter.z - 0.01), 2),
    chin: nearestUV(mouth.clone().add(new THREE.Vector3(0, -0.06 * k, 0.015 * k)), 2),
  };
  // mano: eje de los nudillos (del meñique al índice, en el marco del hueso de la mano). Un mango en el puño
  // pasa a lo largo de ese eje; se usa para girar la muñeca y que la mano agarre de verdad lo que tiene
  const handGrip = {};
  for (const side of ['l', 'r']) {
    const hb = B['hand_' + side], ib = B['index_01_' + side], pb = B['pinky_01_' + side];
    if (!hb || !ib || !pb) continue;
    const kW = p(ib.name).sub(p(pb.name)).normalize();
    handGrip[side] = { knuckle: kW.applyQuaternion(nWorld[hb.name].clone().invert()).normalize(), rest: hb.quaternion.clone() };
  }
  // clavículas: la base (en el marco del torso virtual, relativa a spine_01) y las rotaciones de reposo para
  // subir el hombro como lo sube el esqueleto virtual (rig.reach)
  const clav = {}, clavPivot = {};
  for (const side of ['l', 'r']) {
    const cb = B['shoulder_' + side];
    if (!cb || !cb.parent?.isBone) continue;
    clavPivot[side] = p(cb.name).sub(spine);
    clav[side] = { pivot: clavPivot[side], s3inv: nWorld[cb.parent.name].clone().invert(), cw: nWorld[cb.name].clone() };
  }
  // punto de agarre (palma) en el marco del antebrazo virtual (codo): se usa para las manos físicas
  const gripLocal = {
    l: haL.clone().sub(elL).multiplyScalar(1.13),
    r: haR.clone().sub(elR).multiplyScalar(1.13),
  };
  return {
    map, jointRest, caps, mass, fingers, face, feet, grip, gripLocal, headInfo, vparts, faceUV, boneNames, height, clav, clavPivot, handGrip,
    hipLocal: B.hip.position.clone(),
  };
}

// ---------------------------------------------------------------- material con daño (moretones, sangre, heridas)
function damageMaterial(base, dmgTex) {
  const mat = base.clone();
  mat.roughness = 1;
  // Clean base-skin GLBs use vertex colors instead of a painted texture. Keep UVs
  // active for the per-character damage overlay without tinting those colors.
  if (!mat.map) {
    const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    white.magFilter = THREE.NearestFilter;
    white.minFilter = THREE.NearestFilter;
    white.generateMipmaps = false;
    white.needsUpdate = true;
    mat.map = white;
  }
  const u = {
    uDmg: { value: dmgTex },
    uFlush: { value: 0 },
    uPale: { value: 0 },
  };
  mat.userData.u = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform sampler2D uDmg;\nuniform float uFlush;\nuniform float uPale;\n' + sh.fragmentShader.replace(
      '#include <map_fragment>',
      /* glsl */ `#include <map_fragment>
      {
        vec4 dm = texture2D(uDmg, vMapUv);
        float bruise = clamp(dm.b, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.28, 0.42), bruise * 0.85);
        float wound = smoothstep(0.25, 0.7, dm.r);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.015, 0.02), wound);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.0, 0.005), smoothstep(0.75, 1.0, dm.r));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.26, 0.0, 0.01), clamp(dm.g * 1.15, 0.0, 0.93));
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(0.9, 0.95, 1.0), uPale * 0.6);
      }`,
    ).replace(
      '#include <roughnessmap_fragment>',
      /* glsl */ `#include <roughnessmap_fragment>
      {
        vec4 dm2 = texture2D(uDmg, vMapUv);
        roughnessFactor = mix(roughnessFactor, 0.18, clamp(dm2.g + dm2.r, 0.0, 1.0));
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'human-dmg-v1';
  return mat;
}

// ---------------------------------------------------------------- accesorios (sombreros, anteojos)
function buildHat(type, color, R) {
  const hc = new THREE.MeshStandardMaterial({ color: color || '#c8312b', roughness: 0.7 });
  let hat = null;
  switch (type) {
    case 'cap': {
      hat = new THREE.Group();
      const d = new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), hc);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R * 0.95, 0.012, 22, 1, false, -Math.PI / 2, Math.PI), hc);
      brim.position.set(0, 0.0, R * 0.6);
      brim.scale.set(1, 1, 1.15);
      hat.add(d, brim);
      hat.position.set(0, R * 0.25, 0);
      break;
    }
    case 'cowboy': {
      hat = new THREE.Group();
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.82, R * 0.98, R * 1.15, 18), hc);
      crown.position.y = R * 0.55;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 2.2, R * 2.2, 0.015, 26), hc);
      hat.add(crown, brim);
      hat.position.set(0, R * 0.6, 0);
      break;
    }
    case 'beanie': {
      hat = new THREE.Mesh(new THREE.SphereGeometry(R * 1.16, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hc);
      hat.position.set(0, R * 0.05, 0);
      const pom = new THREE.Mesh(new THREE.SphereGeometry(R * 0.28, 10, 8), hc);
      pom.position.y = R * 1.12;
      hat.add(pom);
      break;
    }
    case 'tophat': {
      hat = new THREE.Group();
      const blk = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5 });
      const c = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.88, R * 0.88, R * 2.2, 20), blk);
      c.position.y = R * 1.1;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.5, R * 1.5, 0.015, 22), blk);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.9, R * 0.9, R * 0.3, 20), hc);
      band.position.y = R * 0.2;
      hat.add(c, brim, band);
      hat.position.set(0, R * 0.62, 0);
      break;
    }
    case 'crown': {
      hat = new THREE.Group();
      const gold = new THREE.MeshStandardMaterial({ color: 0xe0b33a, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide });
      hat.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.88, R * 0.88, R * 0.45, 18, 1, true), gold));
      for (let k = 0; k < 6; k++) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(R * 0.16, R * 0.45, 6), gold);
        const a = (k / 6) * Math.PI * 2;
        s.position.set(Math.sin(a) * R * 0.88, R * 0.42, Math.cos(a) * R * 0.88);
        hat.add(s);
      }
      hat.position.set(0, R * 0.78, 0);
      break;
    }
    case 'chef': {
      hat = new THREE.Group();
      const w = new THREE.MeshStandardMaterial({ color: 0xf8f8f8, roughness: 0.9 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.98, R * 0.98, R * 0.8, 18), w);
      const puff = new THREE.Mesh(new THREE.SphereGeometry(R * 1.3, 16, 12), w);
      puff.position.y = R * 1.0;
      puff.scale.y = 0.75;
      hat.add(band, puff);
      hat.position.set(0, R * 0.68, 0);
      break;
    }
    case 'boina': {
      hat = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.22, R * 1.08, R * 0.3, 22), hc);
      hat.position.set(0, R * 0.78, -0.012);
      hat.rotation.x = -0.15;
      hat.rotation.z = 0.12;
      const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 4), hc);
      nub.position.y = R * 0.2;
      hat.add(nub);
      break;
    }
    default:
      return null;
  }
  hat.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return hat;
}

function buildGlasses(type, R) {
  if (type !== 'sun' && type !== 'nerd') return null;
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: type === 'sun' ? 0x0a0a0a : 0x222222, roughness: 0.2, metalness: 0.4 });
  for (const s of [-1, 1]) {
    const lens = type === 'sun'
      ? new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.005, 16), m)
      : new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0035, 6, 18), m);
    if (type === 'sun') lens.rotation.x = Math.PI / 2;
    lens.position.set(s * 0.033, 0, 0);
    g.add(lens);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.1), m);
    arm.position.set(s * 0.058, 0.004, -0.05);
    g.add(arm);
  }
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.004, 0.004), m));
  void R;
  return g;
}

// ---------------------------------------------------------------- personaje
export class HumanCharacter {
  constructor(look = {}, opts = {}) {
    this.look = { ...look };
    this.local = !!opts.local;
    this.root = new THREE.Group();
    this.root.name = 'human';
    this.mode = 'anim';
    this.anim = { phase: 0, speed: 0, bob: 0, lean: 0, idleT: Math.random() * 10, cur: JOINT_NAMES.map(() => new THREE.Euler()) };
    this.expr = { drunk: 0, high: 0, dead: false };
    this.talk = 0;
    this.detached = new Array(11).fill(false);
    this.drips = [];
    this.grip = { l: 0.25, r: 0.25 };
    // mango en la mano: dirección (mundo) hacia donde sale el mango del lado del pulgar. gripOn: hay mango
    this.gripAxis = { l: new THREE.Vector3(), r: new THREE.Vector3() };
    this.gripOn = { l: false, r: false };
    // lo que hay en cada mano para cerrar los dedos contra su forma: { def, inv } (objeto) o radio del mango
    this.gripShape = { l: null, r: null };
    this.gripRadius = { l: 0, r: 0 };
    this.headVisible = true;
    this.build();
  }

  get modelKey() { return MODELS[this.look.model] ? this.look.model : DEFAULT_MODEL; }
  get gender() { return MODELS[this.modelKey].gender; }

  build() {
    this._disposeModel();
    this.root.clear();
    const src = CACHE.get(this.modelKey) || CACHE.values().next().value;
    if (!src) throw new Error('Modelos humanos no cargados');
    this.meta = src.meta;
    this.model = SkeletonUtils.clone(src.scene);
    this.root.add(this.model);
    this.skinned = findSkinned(this.model);
    this.skinned.frustumCulled = false;
    this.skinned.castShadow = true;
    this.skinned.receiveShadow = true;
    this.skinned.layers.enable(1); // también en la sombra de las luces "heroicas" (fogón, candelabro)
    this.bones = bonesByName(this.model);
    // textura de daño (por instancia)
    this.dmgData = new Uint8Array(DMG_SIZE * DMG_SIZE * 4);
    this.dmgTex = new THREE.DataTexture(this.dmgData, DMG_SIZE, DMG_SIZE, THREE.RGBAFormat);
    this.dmgTex.flipY = false;
    this.dmgTex.magFilter = THREE.LinearFilter;
    this.dmgTex.minFilter = THREE.LinearFilter;
    this.dmgTex.needsUpdate = true;
    this.model.updateMatrixWorld(true);
    this.material = damageMaterial(this.skinned.material, this.dmgTex);
    this.skinned.material = this.material;
    // esqueleto virtual (no se dibuja): recibe animación o ragdoll
    this.jointRest = this.meta.jointRest.map((v) => v.clone());
    this.joints = [];
    for (let i = 0; i < 11; i++) {
      const j = new THREE.Object3D();
      j.name = 'v_' + JOINT_NAMES[i];
      j.position.copy(this.jointRest[i]);
      this.joints.push(j);
      if (PARENT[i] < 0) this.root.add(j);
      else this.joints[PARENT[i]].add(j);
    }
    // puntos de agarre en las palmas
    this.handL = new THREE.Object3D();
    this.handL.position.copy(this.meta.grip.l);
    this.bones.hand_l.add(this.handL);
    this.handR = new THREE.Object3D();
    this.handR.position.copy(this.meta.grip.r);
    this.bones.hand_r.add(this.handR);
    // ancla de accesorios alineada con el personaje
    const hi = this.meta.headInfo;
    this.headAnchor = new THREE.Object3D();
    this.headAnchor.position.copy(hi.center);
    this.headAnchor.quaternion.copy(hi.headQ).invert();
    this.bones.head.add(this.headAnchor);
    const R = hi.radius;
    this.hat = buildHat(this.look.hat, this.look.hatColor, R);
    if (this.hat) {
      this.hat.position.y += (hi.worldTop.y - hi.worldCenter.y) - R * 1.0;
      this.headAnchor.add(this.hat);
    }
    this.glasses = buildGlasses(this.look.glasses, R);
    if (this.glasses) {
      // el ancla está alineada con el personaje: la posición relativa es la de la pose neutra
      this.glasses.position.copy(hi.worldEyes).sub(hi.worldCenter).add(new THREE.Vector3(0, -0.004, 0.03));
      this.headAnchor.add(this.glasses);
    }
    this.root.traverse((o) => { o.frustumCulled = false; });
    this._jaw = 0;
    this._lid = 0;
    // el Diablo: ojos de brasa y el modo fantasma para el invisible (ver devil.js)
    this.devil = MODELS[this.modelKey].devil ? makeDevil(this) : null;
    this.setVisibleHead(this.headVisible);
  }

  setLook(look) {
    this.look = { ...look };
    const hv = this.headVisible;
    this.build();
    this.setVisibleHead(hv);
  }

  // ---------------------------------------------------------------- API compatible con Character
  animate(st, dt) {
    if (this.mode !== 'anim') return;
    Character.prototype.animate.call(this, st, dt);
    // agarre de manos según lo que hace
    const act = st.action || '';
    let gr = 0.28, gl = 0.28;
    if (st.held) gr = 0.95;
    if (st.held === 'two') gl = 0.95;
    if (act === 'punchR' || act === 'guard' || act === 'swing' || act === 'swing2') gr = 1;
    if (act === 'punchL' || act === 'guard') gl = 1;
    if (st.drive) { gr = 0.85; gl = 0.85; }
    this.grip.r += (gr - this.grip.r) * Math.min(1, dt * 14);
    this.grip.l += (gl - this.grip.l) * Math.min(1, dt * 14);
    this._walkLegs = true;
  }
  _emote(...args) { return Character.prototype._emote.apply(this, args); }
  applyWorldTransforms(tr) {
    this._walkLegs = false;
    return Character.prototype.applyWorldTransforms.call(this, tr);
  }
  readWorldTransforms() { return Character.prototype.readWorldTransforms.call(this); }

  setIntox(drunk, high) {
    this.expr.drunk = drunk;
    this.expr.high = high;
    this.material.userData.u.uFlush.value = clamp(drunk, 0, 1);
  }

  setVisibleHead(v) {
    this.headVisible = v;
    const h = this.bones?.head;
    if (h) h.scale.setScalar(v && !this.detached[2] ? 1 : 0.0001);
    if (this.hat) this.hat.visible = v;
    if (this.glasses) this.glasses.visible = v;
  }

  // Forma contra la que se cierran los dedos de esa mano, o null
  _gripTarget(side) {
    if (this.gripOn?.[side] && this.gripRadius[side] > 0) {
      // mango: recta por el centro del puño a lo largo del mango
      const t = this._gt || (this._gt = { l: { line: { o: new THREE.Vector3(), dir: new THREE.Vector3(), r: 0 } }, r: { line: { o: new THREE.Vector3(), dir: new THREE.Vector3(), r: 0 } } });
      const L = t[side].line;
      this.fistWorld(side, L.o);
      L.dir.copy(this.gripAxis[side]).normalize();
      L.r = this.gripRadius[side];
      return t[side];
    }
    return this.gripShape?.[side] || null;
  }

  // Cada dedo, de la base a la punta: la falange se cierra de a poco hasta que su medio o su punta tocan la forma
  _wrapFingers(side, target) {
    const B = this.bones;
    const hand = B['hand_' + side];
    hand?.updateWorldMatrix(true, false);
    for (const f of this.meta.fingers[side]) {
      const bone = B[f.name];
      if (!bone || !f.tip) continue;
      const max = (f.thumb ? THUMB_MAX : CURL_MAX)[f.n - 1];
      let amt = max;
      for (let s = 0; s <= 10; s++) {
        const a = (max * s) / 10;
        bone.quaternion.copy(f.rest).multiply(Q2.setFromAxisAngle(f.axis, a));
        bone.updateWorldMatrix(false, false);
        const tip = V1.copy(f.tip).applyMatrix4(bone.matrixWorld);
        const mid = V2.copy(f.tip).multiplyScalar(0.5).applyMatrix4(bone.matrixWorld);
        if (gripDistance(target, tip) < FINGER_R || gripDistance(target, mid) < FINGER_R) { amt = Math.max(0, a - max * 0.05); break; }
      }
      bone.quaternion.copy(f.rest).multiply(Q2.setFromAxisAngle(f.axis, amt));
      bone.updateWorldMatrix(false, false);
    }
  }

  // Centro del puño (donde queda el mango) en mundo, según el hueso de la mano ya acomodado
  fistWorld(side, out = new THREE.Vector3()) {
    const hb = this.bones?.['hand_' + side];
    if (!hb) return out.set(0, -100, 0);
    hb.updateWorldMatrix(true, false);
    return out.copy(this.meta.grip[side]).applyMatrix4(hb.matrixWorld);
  }

  headWorld(out = new THREE.Vector3()) {
    this.root.updateWorldMatrix(true, true);
    // Hiding the head collapses its skin, not the camera's anatomical anchor.
    // Otherwise first person drops to the neck and intersects the shoulders.
    const h=this.bones.head;
    return h.localToWorld(out.copy(this.meta.headInfo.center).divide(h.scale));
  }
  mouthWorld(out = new THREE.Vector3()) {
    this.root.updateWorldMatrix(true, true);
    const h=this.bones.head;
    return h.localToWorld(out.copy(this.meta.headInfo.mouth).divide(h.scale));
  }

  // cápsulas en mundo para detectar golpes [{a, b, r, i}]
  capsules(out = []) {
    this.root.updateWorldMatrix(true, true);
    out.length = 0;
    for (let i = 0; i < 11; i++) {
      if (this.detached[i]) continue;
      const c = this.meta.caps[i];
      const m = this.joints[i].matrixWorld;
      out.push({ a: c.a.clone().applyMatrix4(m), b: c.b.clone().applyMatrix4(m), r: c.r, i });
    }
    return out;
  }
  worldToPart(i, world, out = new THREE.Vector3()) {
    M1.copy(this.joints[i].matrixWorld).invert();
    return out.copy(world).applyMatrix4(M1);
  }
  partToWorld(i, local, out = new THREE.Vector3()) {
    return out.copy(local).applyMatrix4(this.joints[i].matrixWorld);
  }

  // ---------------------------------------------------------------- re-mapeo a los huesos reales
  _retarget(dt) {
    const B = this.bones;
    const J = this.joints;
    // clavículas: el hombro sube/se adelanta como en el esqueleto virtual (se deduce de dónde quedó la
    // articulación del hombro, así anda igual para mí y para los demás, sin datos extra por la red)
    const CQ = this._clavQ || (this._clavQ = { l: new THREE.Quaternion(), r: new THREE.Quaternion() });
    for (const [side, ji] of [['l', 3], ['r', 5]]) {
      const c = this.meta.clav?.[side], cq = CQ[side];
      cq.identity();
      const bone = c && B['shoulder_' + side];
      if (!bone) continue;
      V1.copy(this.meta.jointRest[ji]).sub(c.pivot);
      V2.copy(J[ji].position).sub(c.pivot);
      if (V1.distanceToSquared(V2) > 1e-7) cq.setFromUnitVectors(V1.normalize(), V2.normalize());
      bone.quaternion.copy(c.s3inv).multiply(cq).multiply(c.cw);
    }
    for (const m of this.meta.map) {
      const bone = B[m.name];
      const Qj = J[m.j].quaternion;
      let q;
      if (m.j === 3 || m.j === 5) q = Q1.copy(Qj).premultiply(Q2.copy(CQ[m.j === 3 ? 'l' : 'r']).invert()); // lo que ya giró la clavícula
      else if (m.frac === 1) q = Q1.copy(Qj);
      else if (typeof m.frac === 'number') q = Q1.copy(QI).slerp(Qj, m.frac);
      else {
        // resto después de la fracción del hueso anterior (cuello -> cabeza)
        const f = parseFloat(m.frac.slice(4));
        Q2.copy(QI).slerp(Qj, f).invert();
        q = Q1.copy(Q2).multiply(Qj);
      }
      bone.quaternion.copy(m.pre).multiply(q).multiply(m.post);
    }
    // manos: con un mango en el puño, la muñeca gira (con tope) para que los nudillos queden a lo largo del
    // mango y los dedos lo rodeen; sin nada, la mano sigue al antebrazo como siempre
    for (const side of ['l', 'r']) {
      const hg = this.meta.handGrip?.[side], hb = B['hand_' + side];
      if (!hg || !hb) continue;
      hb.quaternion.copy(hg.rest);
      if (!this.gripOn?.[side] || this.detached[side === 'l' ? 4 : 6]) continue;
      hb.parent.updateWorldMatrix(true, false);
      const pq = hb.parent.getWorldQuaternion(QA);
      const hw = QB.copy(pq).multiply(hg.rest);
      const want = V2.copy(this.gripAxis[side]);
      if (want.lengthSq() < 1e-8) continue;
      const d = QC.setFromUnitVectors(V1.copy(hg.knuckle).applyQuaternion(hw), want.normalize());
      const ang = 2 * Math.acos(Math.min(1, Math.abs(d.w)));
      const dd = ang > WRIST_MAX ? QD.identity().slerp(d, WRIST_MAX / ang) : d;
      hb.quaternion.copy(pq.invert().multiply(dd).multiply(hw));
    }
    // cadera: posición (rebote al caminar, sentado, ragdoll)
    B.hip.position.copy(J[0].position);
    // pies planos al caminar
    if (this._walkLegs) {
      for (const [side, hi, kn] of [['l', 7, 8], ['r', 9, 10]]) {
        const f = this.meta.feet[side];
        const pitch = -(this.anim.cur[hi].x + this.anim.cur[kn].x) * 0.85;
        Q2.setFromAxisAngle(f.axis, pitch);
        B['foot_' + side].quaternion.copy(f.rest).multiply(Q2);
      }
    }
    // agachado: los pies apoyados planos (como en la pose de reposo, girados con la cadera); si no, las puntas se
    // clavaban en el piso al doblar las rodillas
    if (this.flatFeet > 0 && !this._walkLegs) {
      const mq = this.model.getWorldQuaternion(QA).invert();
      const lx = V1.set(1, 0, 0).applyQuaternion(QB.copy(mq).multiply(J[0].getWorldQuaternion(QC)));
      const yawQ = QD.setFromAxisAngle(V2.set(0, 1, 0), Math.atan2(-lx.z, lx.x));
      for (const side of ['l', 'r']) {
        const f = this.meta.feet[side], fb = B['foot_' + side];
        if (!f.bindW || !fb || this.detached[side === 'l' ? 8 : 10]) continue;
        fb.parent.updateWorldMatrix(true, false);
        const pq = QB.copy(mq).multiply(fb.parent.getWorldQuaternion(QC)).invert();
        Q2.copy(yawQ).multiply(f.bindW).premultiply(pq);
        fb.quaternion.slerp(Q2, Math.min(1, this.flatFeet));
      }
    }
    // dedos: con algo en la mano cada falange se cierra hasta tocar su forma (un mango fino queda en puño, una
    // lata a medias, el borde de una silla agarrado); sin nada, el cierre de siempre (puño o mano floja)
    for (const side of ['l', 'r']) {
      const g = this.grip[side];
      const target = this._gripTarget(side);
      // una forma gruesa que ya envuelve la mano (la caja de una silla) no sirve para cerrar contra ella: gancho
      if (target && (target.line || gripDistance(target, this.fistWorld(side, V3)) > 0.005)) { this._wrapFingers(side, target); continue; }
      for (const f of this.meta.fingers[side]) {
        const amt = f.thumb ? g * (f.n === 1 ? 0.25 : 0.55) : g * (f.n === 1 ? 1.15 : f.n === 2 ? 1.35 : 0.95);
        Q2.setFromAxisAngle(f.axis, amt);
        B[f.name].quaternion.copy(f.rest).multiply(Q2);
      }
    }
    // cara: mandíbula al hablar, párpados caídos
    const face = this.meta.face;
    // (el Diablo la abre de par en par al tirar fuego o al reírse: owner.js le da `roar`)
    const jawT = clamp(this.talk * 0.32 + (this.expr.dead ? 0.18 : 0) + (this.roar || 0) * 0.42, 0, 0.6);
    this._jaw += (jawT - this._jaw) * Math.min(1, dt * 20);
    if (face.jaw.axis && B.jaw) {
      Q2.setFromAxisAngle(face.jaw.axis, this._jaw);
      B.jaw.quaternion.copy(face.jaw.rest).multiply(Q2);
    }
    const lidT = this.expr.dead ? 0.55 : clamp(Math.max(this.expr.drunk * 0.28, this.expr.high * 0.36), 0, 0.42);
    this._lid += (lidT - this._lid) * Math.min(1, dt * 6);
    for (const [k, name] of [['lidL', 'eyelid_l'], ['lidR', 'eyelid_r']]) {
      const lf = face[k];
      if (lf.axis && B[name]) {
        Q2.setFromAxisAngle(lf.axis, this._lid);
        B[name].quaternion.copy(lf.rest).multiply(Q2);
      }
    }
  }

  update(dt) {
    this._dripStep(dt);
    this._retarget(dt);
    this.devil?.update(dt);
    this._cullSphere();
  }
  // Recorte: la malla con huesos no tiene una caja que siga la pose, así que se dibujaba en TODAS las vistas y en cada
  // cara de cada sombra de las luces del mapa (lejos o cerca). Una esfera alrededor de la cadera, en el espacio de la
  // malla, alcanza para que three la descarte donde no está (la cámara y cada sombra por separado)
  _cullSphere() {
    const sk = this.skinned;
    if (!sk) return;
    sk.updateWorldMatrix(true, false);
    this.joints[0].updateWorldMatrix(true, false);
    V1.setFromMatrixPosition(this.joints[0].matrixWorld).applyMatrix4(M1.copy(sk.matrixWorld).invert());
    const bs = sk.boundingSphere || (sk.boundingSphere = new THREE.Sphere());
    bs.center.copy(V1);
    bs.radius = (1.45 * (this.meta.height || 1.8) / 1.8) / Math.max(1e-6, sk.matrixWorld.getMaxScaleOnAxis()) * Math.max(1e-6, this.root.matrixWorld.getMaxScaleOnAxis());
    sk.frustumCulled = true;
  }

  // ---------------------------------------------------------------- daño visual
  // Estampa en la textura de daño (u, v en [0,1] del UV del modelo)
  stampUV(u, v, kind, strength = 1, seed = 1) {
    const r = rng(seed);
    const s = clamp(strength, 0, 2.5);
    let rad, depth, blood, bruise;
    switch (kind) {
      case 'blunt': rad = 0.012 + s * 0.01; depth = 0.05 + s * 0.12; blood = 0.12 * s; bruise = 0.55 + s * 0.4; break;
      case 'cut': rad = 0.007 + s * 0.006; depth = 0.45 + s * 0.35; blood = 0.9; bruise = 0.1; break;
      case 'stab': rad = 0.005 + s * 0.004; depth = 0.8; blood = 0.9; bruise = 0.05; break;
      case 'mulch': rad = 0.02 + s * 0.015; depth = 0.9; blood = 1.2; bruise = 0.2; break;
      case 'blood': rad = 0.006 + s * 0.006; depth = 0; blood = 0.8 + s * 0.3; bruise = 0; break;
      default: rad = 0.01; depth = 0.2; blood = 0.3; bruise = 0.3;
    }
    const N = DMG_SIZE, D = this.dmgData;
    const cx = u * N, cy = v * N, R = rad * N * 2.2;
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(N - 1, Math.ceil(cy + R)); y++) {
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(N - 1, Math.ceil(cx + R)); x++) {
        const dx = (x + 0.5 - cx) / (rad * N), dy = (y + 0.5 - cy) / (rad * N);
        const d2 = dx * dx + dy * dy;
        const k = (y * N + x) * 4;
        if (d2 < 1) {
          const f = (1 - d2) * (0.75 + r() * 0.5);
          D[k] = Math.min(255, D[k] + depth * f * 255);
          D[k + 2] = Math.min(255, D[k + 2] + bruise * f * 255);
        }
        if (d2 < 4.8 && blood > 0) D[k + 1] = Math.min(255, D[k + 1] + blood * Math.max(0, 1 - d2 / 4.8) * 190);
      }
    }
    this.dmgTex.needsUpdate = true;
  }

  // UV del punto más cercano de una parte (punto en mundo)
  _uvAt(part, world) {
    const sk = this.skinned;
    const bi = this.meta.boneNames.indexOf(PART_BONE[part]);
    const bone = sk.skeleton.bones[bi];
    M1.multiplyMatrices(bone.matrixWorld, sk.skeleton.boneInverses[bi]);
    M2.copy(M1).invert();
    const bp = V2.copy(world).applyMatrix4(M2);
    const pos = sk.geometry.attributes.position, uv = sk.geometry.attributes.uv;
    let bv = -1, bd = 1e9;
    for (const v of this.meta.vparts[part]) {
      V1.fromBufferAttribute(pos, v).applyMatrix4(sk.bindMatrix);
      const d = V1.distanceToSquared(bp);
      if (d < bd) { bd = d; bv = v; }
    }
    return bv >= 0 ? [uv.getX(bv), uv.getY(bv)] : null;
  }

  // Herida en la parte i, punto local (espacio de la articulación virtual). Compatible con Character.wound
  wound(i, local, kind, strength, dirLocal = null, seed = 1) {
    this.root.updateWorldMatrix(true, true);
    const w = this.partToWorld(i, local, V3);
    const uv = this._uvAt(i, w);
    if (!uv) return 0;
    this.stampUV(uv[0], uv[1], kind, strength, seed);
    if (kind !== 'blunt' && this.drips.length < 30) this.drips.push({ u: uv[0], v: uv[1], t: 0, life: 3 + strength * 4, dv: -0.012 });
    // golpes fuertes en la cabeza: sangre de nariz/boca/orejas/ojos según gravedad
    if (i === P.HEAD && kind === 'blunt') this.bleedFace(strength);
    return 1;
  }

  bleedFace(strength) {
    const f = this.meta.faceUV;
    const r = Math.random;
    const drip = (uv, amt, life) => {
      this.stampUV(uv[0], uv[1], 'blood', amt, (r() * 1e6) | 0);
      if (this.drips.length < 30) this.drips.push({ u: uv[0], v: uv[1], t: 0, life, dv: this._faceDown() });
    };
    if (strength > 0.35) drip(f.nose, 0.6 * strength, 5);
    if (strength > 0.7) drip(f.mouth, 0.5 * strength, 4);
    if (strength > 1.1) { drip(f.eyeL, 0.4, 3); drip(f.eyeR, 0.4, 3); this.stampUV(f.eyeL[0], f.eyeL[1], 'blunt', 1.2, 7); }
    if (strength > 1.5) { drip(f.earL, 0.5, 4); drip(f.earR, 0.5, 4); }
  }

  _faceDown() {
    const f = this.meta.faceUV;
    return Math.sign(f.chin[1] - f.eyeL[1]) * 0.03 || -0.03;
  }

  _dripStep(dt) {
    if (!this.drips.length) return;
    for (let n = this.drips.length - 1; n >= 0; n--) {
      const d = this.drips[n];
      d.t += dt;
      if (d.t > d.life) { this.drips.splice(n, 1); continue; }
      d.v += d.dv * dt;
      const N = DMG_SIZE;
      const x = Math.floor(d.u * N), y = Math.floor(d.v * N);
      if (x < 0 || y < 0 || x >= N || y >= N) { this.drips.splice(n, 1); continue; }
      for (const ox of [0, 1]) {
        const k = (y * N + Math.min(N - 1, x + ox)) * 4;
        this.dmgData[k + 1] = Math.min(255, this.dmgData[k + 1] + 60);
      }
      this.dmgTex.needsUpdate = true;
    }
  }

  clearDamage() {
    this.dmgData.fill(0);
    this.dmgTex.needsUpdate = true;
    this.drips.length = 0;
  }

  // Reaparecer: cuerpo entero y limpio (sin heridas, sangre que chorrea, partes cortadas ni sombrero volado).
  // Se rearma el modelo desde cero: es barato y no deja nada del estado anterior.
  resetBody() {
    this.detached.fill(false);
    this.goreBits = [];
    this.drips = [];
    this.expr.dead = false;
    const hv = this.headVisible;
    this.build();
    this.setVisibleHead(hv);
  }

  // Curarse: moretones y sangre se aclaran (k = cuánto, 0..1); las heridas profundas quedan
  healDamage(k = 0.3) {
    const D = this.dmgData, f = 1 - k;
    for (let i = 0; i < D.length; i += 4) {
      D[i + 1] *= f; // sangre
      D[i + 2] *= f; // moretón
      if (D[i] < 110) D[i] *= f; // raspones (los cortes profundos no se borran)
    }
    this.dmgTex.needsUpdate = true;
    if (k > 0.4) this.drips.length = 0;
  }

  // Suelta el sombrero (sale volando). Devuelve el objeto en coordenadas de mundo o null.
  popHat() {
    if (!this.hat || !this.hat.parent) return null;
    const h = this.hat;
    h.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    h.matrixWorld.decompose(pos, q, s);
    h.removeFromParent();
    h.position.copy(pos);
    h.quaternion.copy(q);
    this.hat = null;
    return h;
  }

  _disposeModel() {
    if (!this.model) return;
    this.devil?.dispose();
    this.devil = null;
    this.dmgTex?.dispose();
    this.material?.dispose();
    this.hat?.traverse?.((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    this.glasses?.traverse?.((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    this.model.removeFromParent();
    this.model = null;
  }

  dispose() {
    this._disposeModel();
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
