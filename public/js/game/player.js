// Jugadores estilo GTA V / Half Sword: de pie se mueven con animación (firmes, controlables, con peso:
// se inclinan al acelerar, dan respingos y trastabillan con los golpes); al recibir un golpe fuerte,
// un choque o una caída pasan a ragdoll real y después se levantan mezclando la pose física con la animada.
// - Controlador (cápsula cinemática): movimiento, choca con el mundo.
// - PoseRig: animación procedural (caminar, sentarse, manejar...) + brazos con IK.
// - Brazos (arms.js): cada mano es una masa con resorte que persigue al mouse / a la piña / al volante;
//   lo que sostiene le da inercia; se frena contra paredes y cuerpos.
// - Ragdoll: de pie son cajas de golpe cinemáticas que siguen la animación (empujan objetos, detectan
//   golpes); tirado es un cuerpo dinámico con músculos débiles.
// - HumanCharacter: lo que se ve (animación de pie, física tirado).
// Golpes: SOLO lastima lo que está atacando (puño/pie/cabeza en una piña o swing, un arma blandida, algo
// revoleado, un vehículo que viene hacia vos). Chocarse caminando con gente u objetos quietos no lastima.
import * as THREE from 'three';
import { G, clamp, dampAngle, angleDiff } from '../core/G.js';
import { RAPIER, GR, groups } from '../core/physics.js';
import { HumanCharacter } from '../char/human.js';
import { PoseRig } from '../char/rig.js';
import { PoseContact } from './pose-contact.js';
import { Ragdoll, PART } from './ragdoll.js';
import { HitReact, ROLL } from './react.js';
import { EquipmentView } from './equipment.js';
import { goreFor, branchOf, GORE_HEAD_POP, GORE_GUTS } from './gore.js';
import { defOf, holdOf, heldQuat, heldPos, gripPoints, bladePoints, handleAxis, curlOf } from './props.js';
import {
  Arm, stepArm, startControl, moveControl, reachControl, startScript, torsoTwist, torsoLean,
} from './arms.js';
import { MAP_BOUNDS, SPAWN, isPvpAt } from '../shared/mapdata.js';

const BODY_Y = 0.91;
const CAPSULE_HALF = 0.61;
const CAPSULE_RADIUS = 0.28;
function movementSize(meta) {
  const scale=(meta.height||1.8)/1.8;
  return {bodyY:BODY_Y*scale,capsuleHalf:CAPSULE_HALF*scale,capsuleRadius:CAPSULE_RADIUS*scale};
}
export const RAG_FILTER = GR.WORLD | GR.PROP | GR.VEHICLE | GR.REMOTE | GR.DEBRIS;
export const PROXY_FILTER = GR.RAGDOLL | GR.PROP | GR.DEBRIS | GR.VEHICLE;
// umbral de impacto por parte (cambio de velocidad en m/s) para que duela (tirado en el piso)
const HIT_DV = [5.2, 5.2, 3.4, 6.5, 6.5, 6.5, 6.5, 7.5, 9, 7.5, 9];
const PART_DMG = [0.9, 1, 1.7, 0.45, 0.35, 0.45, 0.35, 0.55, 0.4, 0.55, 0.4];
const STATE_CODE = { active: 0, stun: 1, ko: 2, dead: 3, getup: 4, seated: 5, driving: 6 };
const CODE_STATE = Object.fromEntries(Object.entries(STATE_CODE).map(([k, v]) => [v, k]));
const CUT_PROPS = new Set(['sword', 'machete', 'knife', 'axe', 'broken_bottle', 'hatchet', 'katana']);
// qué bandera de ataque "arma" cada parte (1 brazo izq, 2 brazo der, 4 patada, 8 cabezazo)
export const ARMED_PART = [0, 0, 8, 1, 1, 2, 2, 0, 0, 4, 4];
// velocidad (m/s) a partir de la cual un golpe cuenta, por tipo de cosa que pega
const THR = { fist: 2.8, prop: 3.4, thrown: 4, vehicle: 3 };
// Golpes con el cuerpo, según con qué pegan: desde qué velocidad lastiman (thr), en cuánto llega al máximo
// (span, cap), daño base, cuánto tumba (bal) y cuánto empuja (push). La patada tiene la masa de la pierna:
// pega más, tumba y empuja; la piña es rápida pero sola no noquea; el cabezazo aturde.
export const BODY_HITS = {
  p: { thr: 2.8, span: 4.5, cap: 1.3, base: 10, bal: 1, push: 1 },
  k: { thr: 2.2, span: 3.4, cap: 1.8, base: 14, bal: 1.7, push: 1.45 },
  h: { thr: 1.4, span: 2.4, cap: 1.5, base: 13, bal: 1.5, push: 1.3 },
};

// Radio del mango de cada cosa que se empuña (los dedos se cierran hasta él): fino = puño, grueso = mano abierta
export const GRIP_R = {
  bat: 0.017, katana: 0.014, sword: 0.014, machete: 0.014, knife: 0.012, axe: 0.016, sledge: 0.018, crowbar: 0.012,
  pan: 0.013, cue: 0.014, guitar: 0.02, bottle: 0.017, can: 0.033, spraycan: 0.031, popcorn: 0.05,
};
const GS_M = new THREE.Matrix4();
// Qué tiene en la mano un personaje, para que cierre los dedos contra eso (mango o forma del objeto)
export function setHandGrip(ch, side, p, two) {
  if (!ch?.gripRadius || !p) return;
  const r = handleAxis(p.type, p.group.quaternion, V6) ? (GRIP_R[p.type] ?? 0.016) : 0;
  const sides = two ? ['l', 'r'] : [side];
  for (const s of sides) {
    ch.gripRadius[s] = r;
    ch.gripShape[s] = r ? null : { def: p.def, inv: GS_M.compose(p.group.position, p.group.quaternion, p.group.scale).clone().invert() };
  }
}

// Fuerza que va a calcular el golpeado para un aviso de golpe (a: tipo, speed: m/s, w: arma u objeto revoleado).
// El que pega la usa para ver la reacción al instante, sin esperar la ida y vuelta de la red.
export function predictHit(a, speed, w = null) {
  const weapon = w ? defOf(w) : null;
  if (weapon) {
    const thr = a === 't' ? THR.thrown : THR.prop;
    if (speed < thr) return 0;
    return clamp(((speed - thr) / thr) * clamp(Math.sqrt(weapon.mass || 1) / 1.1, 0.4, 2.4), 0, 3);
  }
  const b = BODY_HITS[a] || BODY_HITS.p;
  return speed < b.thr ? 0 : clamp((speed - b.thr) / b.span, 0, b.cap);
}

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const V3 = new THREE.Vector3();
const V4 = new THREE.Vector3();
const V5 = new THREE.Vector3();
const V6 = new THREE.Vector3();
const Q1 = new THREE.Quaternion();
const Q2 = new THREE.Quaternion();
const M1 = new THREE.Matrix4();
const E1 = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const FORE_DIR = new THREE.Vector3(0, -1, 0.06).normalize();
const MOUTH = { l: new THREE.Vector3(), r: new THREE.Vector3() };
const WHEEL = { l: new THREE.Vector3(), r: new THREE.Vector3() };
const READY = { l: new THREE.Vector3(), r: new THREE.Vector3() };

function spawnPoint() {
  const a = Math.random() * Math.PI * 2;
  const r = 2 + Math.random() * SPAWN.r;
  return new THREE.Vector3(SPAWN.x + Math.sin(a) * r, 0.02, SPAWN.z + 6 + Math.cos(a) * r * 0.6);
}
// Keep world rotations and the pelvis position while adapting joint spacing.
function resizedPose(pose, jointRest) {
  const rig = new PoseRig(jointRest);
  rig.joints[0].position.set(...pose[0].slice(0,3));
  const parent = [-1,0,1,1,3,1,5,0,7,0,9];
  for (let i=0;i<11;i++) {
    const q = new THREE.Quaternion(...pose[i].slice(3));
    if (parent[i]>=0) q.premultiply(new THREE.Quaternion(...pose[parent[i]].slice(3)).invert());
    rig.joints[i].quaternion.copy(q);
  }
  return rig.transforms();
}
const r3 = (v) => Math.round(v * 1000) / 1000;

// posición de la palma de una mano a partir del cuerpo físico del antebrazo
function handWorld(rag, meta, side, out) {
  const b = rag.bodies[side === 'l' ? PART.FARM_L : PART.FARM_R];
  if (!b) return out.set(0, -100, 0);
  const t = b.translation(), r = b.rotation();
  const g = meta.gripLocal[side];
  return out.copy(g).applyQuaternion(Q1.set(r.x, r.y, r.z, r.w)).add(V3.set(t.x, t.y, t.z));
}

const KCC_GROUPS = groups(GR.ME, GR.WORLD | GR.VEHICLE | GR.PAWN);
// encimado con otro jugador: el controlador de Rapier no deja salir de una cápsula en la que ya está metido
// (se traba para todos lados), así que mientras estamos encimados ese paso ignora a los jugadores
const KCC_NO_PAWN = groups(GR.ME, GR.WORLD | GR.VEHICLE);
// contra qué se frena la mano (no contra los objetos livianos: esos los empuja)
const HAND_BLOCK = groups(0xffff, GR.WORLD | GR.REMOTE | GR.VEHICLE | GR.PROP);
// Piernas: mientras está de pie no rozan el piso (como en Gang Beasts el cuerpo lo sostiene el equilibrio);
// así dan pasos de verdad en vez de arrastrarse. Tiradas en el piso vuelven a chocar con todo.
const LEGS = [PART.THIGH_L, PART.SHIN_L, PART.THIGH_R, PART.SHIN_R];
const LEG_FILTER_UP = RAG_FILTER & ~GR.WORLD;
// Altura del asiento de cada vehículo (arriba del almohadón) y posición en el vehículo [x, z] por asiento
const VSEAT = {
  mower: { top: 0.955, at: [[0, -0.34], [-0.62, -0.45]] },
  tractor: { top: 1.355, at: [[0, -0.53], [-0.68, -0.45]] },
  cart: { top: 1.06, at: [[0.28, -0.2], [-0.28, -0.2]] },
};
const ITEM_MASS = { beer: 0.45, smoke: 0.02, spray: 0.4 };
// "articulación" de un objeto tomado firme (no hay resorte: la mano lleva el objeto, ver props.heldQuat)
const HOLD_JOINT = { hold: true };
// Agarrar a otro jugador (estilo Half Sword): nadie queda "apagado". El agarrado sigue de pie y en control;
// la mano que lo tiene tira de él (lo arrastra, lo empuja, lo desequilibra: si pierde el equilibrio, cae).
// Se zafa si el agarre se estira demasiado (corriendo para el otro lado). Tirado, lo arrastra la física.
const PLAYER_GRIP = { player: true };
const GRIP = {
  slack: 0.1, // m de juego antes de tirar
  k: 7, cap: 4.5, // tirón (1/s y m/s) donde se pelea
  kSafe: 3.5, capSafe: 2.4, // afuera de las zonas de pelea: se puede tironear, no derribar
  brk: 1.35, brkSafe: 0.95, // m: más estirado que esto, se zafa
  tug: 3, // lo que el agarrado tira del que agarra cuando se aleja más que el brazo
};
// Agarrado de: qué articulaciones se giran para llevar esa parte hacia la mano que tira [art., fracción, tope rad]
// (los brazos van aparte: la mano agarrada sigue a la del otro con el IK)
const GRIP_CHAIN = {
  0: [],
  1: [[1, 0.55, 0.45]],
  2: [[1, 0.35, 0.3], [2, 0.8, 0.7]],
  7: [[7, 0.8, 1.2]], 8: [[7, 0.7, 1.1], [8, 0.6, 1.0]],
  9: [[9, 0.8, 1.2]], 10: [[9, 0.7, 1.1], [10, 0.6, 1.0]],
};
// Lo mismo en MI pantalla cuando el agarrado es otro (la parte pegada a mi mano ya, sin esperar la red)
const VIEW_CHAIN = {
  0: [],
  1: [[1, 0.8, 0.6]],
  2: [[1, 0.45, 0.35], [2, 1, 0.8]],
  3: [[3, 1, 1.8]], 4: [[3, 0.8, 1.6], [4, 1, 1.4]],
  5: [[5, 1, 1.8]], 6: [[5, 0.8, 1.6], [6, 1, 1.4]],
  7: [[7, 1, 1.3]], 8: [[7, 0.8, 1.2], [8, 1, 1.1]],
  9: [[9, 1, 1.3]], 10: [[9, 0.8, 1.2], [10, 1, 1.1]],
};
// hasta dónde la parte se estira hacia la mano antes de que se corra el cuerpo entero (m, horizontal)
const VIEW_REACH = [0.08, 0.12, 0.22, 0.35, 0.45, 0.35, 0.45, 0.3, 0.4, 0.3, 0.4];
// subárbol de cada articulación (ella y lo que cuelga)
const SUBTREE = Array.from({ length: 11 }, (_, j) => {
  const out = [];
  for (let k = 0; k < 11; k++) { let q = k; while (q >= 0 && q !== j) q = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9][q]; if (q === j) out.push(k); }
  return out;
});
const PV1 = new THREE.Vector3();
const PV2 = new THREE.Vector3();
const PV3 = new THREE.Vector3();
const PQ1 = new THREE.Quaternion();
const PQ2 = new THREE.Quaternion();
const PQ3 = new THREE.Quaternion();
// Sobre una pose de 11 partes (mundo): gira la articulación j (y lo que cuelga) para acercar el punto `local`
// de la parte `part` a `target`, una fracción del giro necesario y con tope
function posePull(pose, j, part, local, target, frac, maxAng) {
  const t = pose[part], pj = pose[j];
  const A = PV1.copy(local).applyQuaternion(PQ1.set(t[3], t[4], t[5], t[6])).add(PV2.set(t[0], t[1], t[2]));
  const P = PV2.set(pj[0], pj[1], pj[2]);
  const v1 = A.sub(P), v2 = PV3.copy(target).sub(P);
  if (v1.lengthSq() < 1e-6 || v2.lengthSq() < 1e-6) return;
  const q = PQ2.setFromUnitVectors(v1.normalize(), v2.normalize());
  const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  if (ang < 1e-4) return;
  const d = PQ3.identity().slerp(q, Math.min(ang * frac, maxAng) / ang);
  for (const k of SUBTREE[j]) {
    const o = pose[k];
    if (k !== j) { PV1.set(o[0], o[1], o[2]).sub(P).applyQuaternion(d).add(P); o[0] = PV1.x; o[1] = PV1.y; o[2] = PV1.z; }
    PQ1.set(o[3], o[4], o[5], o[6]).premultiply(d);
    o[3] = PQ1.x; o[4] = PQ1.y; o[5] = PQ1.z; o[6] = PQ1.w;
  }
}

const GH = new THREE.Vector3();
const GA = new THREE.Vector3();
const GD = new THREE.Vector3();
const GT = new THREE.Vector3();
const GS = new THREE.Vector3();
const GT2 = new THREE.Vector3();
const GQ = new THREE.Quaternion();
// armas de metal (chispas y "clang" contra paredes); el resto suena a madera
const METAL = new Set(['sword', 'machete', 'knife', 'axe', 'sledge', 'crowbar', 'pan', 'trashcan', 'barrel']);
const BLADES = new Map(); // tipo -> puntos del filo (cache de bladePoints)
const HQ = new THREE.Quaternion();
const HP = new THREE.Vector3();
const HG1 = new THREE.Vector3();
const HG2 = new THREE.Vector3();
const HR = new THREE.Vector3();
const HE = new THREE.Vector3();
const HH = new THREE.Vector3();
const SW1 = new THREE.Vector3();
const SW2 = new THREE.Vector3();
const SW3 = new THREE.Vector3();
// contra qué barre el filo: cuerpos de otros, mundo, bolsa/vehículos y objetos sueltos
const SWEEP_GROUPS = groups(0xffff, GR.WORLD | GR.REMOTE | GR.VEHICLE | GR.PROP);
// cuerpos de otros jugadores (para que la mano no quede adentro)
const BODY_Q = groups(0xffff, GR.REMOTE);
const HAND_R = 0.05;

// ====================================================================== LOCAL
export class LocalPlayer {
  // opts.character: permite inyectar un personaje (tests en Node sin cargar el GLB)
  constructor(look, opts = {}) {
    this.look = { ...look };
    this.char = opts.character || new HumanCharacter(this.look, { local: true });
    this.char.root.name = 'local-player';
    G.scene.add(this.char.root);
    this.meta = this.char.meta;
    this.rig = new PoseRig(this.meta.jointRest, this.meta.clavPivot, this.meta.gripLocal);
    Object.assign(this,movementSize(this.meta));
    this.equipment = new EquipmentView(G.scene);

    this.pos = spawnPoint();
    this.previousPos = this.pos.clone();
    this.renderPos = this.pos.clone();
    this.velocity = new THREE.Vector2();
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.fwdSpeed = 0;
    this.yaw = SPAWN.yaw;
    this.viewYaw = this.yaw;
    this.grounded = true;
    this.vy = 0;
    this.speed = 0;
    this.action = null;
    this.actionT = 0;
    this.actionDur = 0;
    this.emote = null;
    this.emoteT = 0;
    this.hp = 100;
    this.blood = 100;
    this.balance = 100; // equilibrio: los golpes lo bajan; en 0 cae KO. Se recupera solo
    this.drunk = 0;
    this.high = 0;
    this.dead = false;
    this.deadT = 0;
    this.heldProp = null; // compat: objeto en la mano derecha
    this.vehicle = null;
    this.seat = null;
    this.aimPitch = 0;
    this.headYaw = 0;
    this.name = '';
    this.state = 'active';
    this.strength = 1;
    this.stunT = 0;
    this.koT = 0;
    this.getupT = 0;
    this.fallPeak = 0;
    this.lastHitBy = 0;
    this.lastHurtT = -99; // G.time del último daño (regeneración)
    this.hitCd = new Map();
    this.hitBy = new Map(); // atacante -> último golpe contado (el contacto local y el aviso del atacante no suman dos veces)
    this.claimCd = new Map(); // a quién le avisé un golpe mío hace poco
    this.talk = 0;
    this.hands = {
      l: { prop: 0, player: 0, part: -1, joint: null, fixed: false, item: null },
      r: { prop: 0, player: 0, part: -1, joint: null, fixed: false, item: null },
    };
    this.arm = { l: new Arm('l'), r: new Arm('r') };
    this.guard = false; // las dos manos arriba (click izq + der)
    this.grabbedBy = new Map(); // "id:mano" -> { id, side, part, anchor, hand, joint } (otro jugador me agarra)
    this._gripV = new THREE.Vector2(); // tirón de los que me agarran (m/s)
    this._gripBend = new THREE.Vector3(); // hacia dónde me llevan (inclina el cuerpo)
    this._gripHead = false;
    this._footVel = new THREE.Vector3(); // velocidad del pie derecho (la patada pega con el pie)
    this._footPrev = null;
    this.gore = 0; // máscara de gore (partes cortadas, cabeza reventada, tripas)
    this.bleedRate = 0; // hp por segundo que se pierden desangrándose
    this.onEvent = null; // callback para FX/red: (type, data)

    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y + this.bodyY, this.pos.z);
    this.body = G.phys.world.createRigidBody(desc);
    const cd = RAPIER.ColliderDesc.capsule(this.capsuleHalf, this.capsuleRadius)
      .setFriction(0)
      .setCollisionGroups(groups(GR.ME, GR.WORLD | GR.VEHICLE));
    this.collider = G.phys.world.createCollider(cd, this.body);
    G.phys.tag(this.collider, { kind: 'player', ref: this });
    this.controller = G.phys.world.createCharacterController(0.02);
    this.controller.setMaxSlopeClimbAngle?.(50 * Math.PI / 180);
    this.controller.setMinSlopeSlideAngle?.(55 * Math.PI / 180);
    this.controller.enableAutostep?.(0.35, 0.18, true);
    this.controller.enableSnapToGround?.(0.22);

    this.rig.place(this.pos, this.yaw);
    this.rig.animate({ speed: 0, grounded: true }, 1 / 60);
    this.rag = new Ragdoll(G.phys, this.meta, { member: GR.RAGDOLL, filter: RAG_FILTER, tag: { kind: 'me', ref: this } });
    this.rag.build(this.rig.transforms());
    this.rag.setKinematic(true);
    this.physMode = 'anim'; // 'anim' de pie (animación + cajas de golpe) | 'rag' tirado (física)
    this.react = new HitReact(); // reacción visible a los golpes (resortes; solo se dibuja, no viaja por la red)
    this._rpose = []; // pose dibujada = pose de red + reacción
    this.hitStop = 0; // s de "frenada" del brazo/pierna que acaba de pegar (el golpe se siente)
    this._vocalT = -9;
    this._vocalKind = null;
    this.lean = new THREE.Vector2(); // inclinación por aceleración (x) y giro (y): da peso
    this.leanV = new THREE.Vector2(); // (resortes con un poco de rebote: el cuerpo se pasa y vuelve)
    this.land = 0; // flexión al caer de un salto (rodillas que ceden)
    this.landV = 0;
    this.push = new THREE.Vector2(); // empujón horizontal que decae (trastabillar)
    this.held = 0; // manos ajenas que me tienen agarrado
    this.blendT = 1;
    this._blendFrom = null;
    this._base = null;
    this.targets = this.rig.compute();
    this._pose = [];
    this._syncVisual();
  }

  get equippedItem() { return this.hands.r.item; }

  setLook(look) {
    this.look = { ...look };
    this.char.setLook(this.look);
    if (this.meta !== this.char.meta) {
      // A model change also changes limb lengths and hit volumes (especially
      // the 2.2 m Diablo). Keeping the old rig pulls the new skin out of shape.
      const oldRig = this.rig;
      const dynamic = this.physMode === 'rag';
      const pose = dynamic ? this.rag.read() : null;
      const velocities = dynamic ? this.rag.bodies.map(b => ({lin:b.linvel(),ang:b.angvel()})) : null;
      this.releaseAll(true);
      this._clearGrips(true);
      G.gore?.detachFrom(this.rag.bodies[PART.TORSO]);
      this.meta = this.char.meta;
      this.rig = new PoseRig(this.meta.jointRest, this.meta.clavPivot, this.meta.gripLocal);
      Object.assign(this,movementSize(this.meta));
      this.crouched = false; this.slideT = 0; this._poseContacts = null;
      this.collider.setShape(new RAPIER.Capsule(this.capsuleHalf,this.capsuleRadius));
      const center={x:this.pos.x,y:this.pos.y+this.bodyY,z:this.pos.z};
      this.body.setTranslation(center,true);this.body.setNextKinematicTranslation(center);
      this.rig.anim = oldRig.anim;
      for (let i = 0; i < 11; i++) this.rig.joints[i].quaternion.copy(oldRig.joints[i].quaternion);
      this.rig.place(this.pos, this.yaw);
      this.rag.meta = this.meta;
      this.rag.totalMass = this.meta.mass.reduce((a,b) => a+b, 0);
      this.rag.build(dynamic ? resizedPose(pose, this.meta.jointRest) : this.rig.transforms());
      if (velocities) this.rag.bodies.forEach((b,i) => { b.setLinvel(velocities[i].lin,true); b.setAngvel(velocities[i].ang,true); });
      this._base = null; this._blendFrom = null; this.blendT = 1;
      this._pose = []; this._rpose = []; this._legsGround = undefined;
      this.targets = this.rig.compute();
      this._resetArms();
      for (let i = 0; i < 11; i++) if ((this.gore & (1 << i)) || (i === PART.HEAD && (this.gore & GORE_HEAD_POP))) {
        G.gore?.sever(this.char, i, {gib:false});
        this.rag.detachBranch(i, branchOf(i));
      }
    }
    this.char.devil?.setGhost(this.invisible ? 1 : 0);
    this._syncVisual();
  }

  setAction(name, duration = 0.8) {
    this.action = name;
    this.actionT = 0;
    this.actionDur = duration;
    if (name === 'eat') { this.guard = false; startScript(this.arm.r, 'eat', duration); }
  }
  setEmote(name) { this.emote = name || null; this.emoteT = 0; }
  queueJump() { if (this.state === 'active' && !this.crouched) this.jumpBuffer = 0.12; }

  _crouch(want) {
    if (!!this.crouched === want) return;
    const size = movementSize(this.meta), lower = .38 * ((this.meta.height || 1.8) / 1.8);
    if (!want) {
      const tr = this.body.translation(), standing = { x: tr.x, y: tr.y + lower / 2, z: tr.z };
      let blocked = false;
      G.phys.world.intersectionsWithShape(standing, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Capsule(size.capsuleHalf, size.capsuleRadius), col => {
        const hit = col.contactShape(new RAPIER.Capsule(size.capsuleHalf, size.capsuleRadius), standing, { x: 0, y: 0, z: 0, w: 1 }, 0);
        if (hit && hit.distance < -.003 && hit.normal1.y < .65) blocked = true;
        return !blocked;
      }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, KCC_GROUPS, this.collider, this.body);
      if (blocked) return;
    }
    const oldY = this.bodyY;
    this.crouched = want;
    this.bodyY = size.bodyY - (want ? lower / 2 : 0);
    this.collider.setShape(new RAPIER.Capsule(size.capsuleHalf - (want ? lower / 2 : 0), size.capsuleRadius));
    const tr = this.body.translation();
    const center = { x: tr.x, y: tr.y + this.bodyY - oldY, z: tr.z };
    this.body.setTranslation(center, true); this.body.setNextKinematicTranslation(center);
    this._poseContacts = null;
  }

  dive(viewYaw = this.viewYaw) {
    if (this.state !== 'active' || !this.grounded || G.time < (this._diveUntil || 0)) return false;
    const f = (G.input.key('KeyW') ? 1 : 0) - (G.input.key('KeyS') ? 1 : 0);
    const side = (G.input.key('KeyD') ? 1 : 0) - (G.input.key('KeyA') ? 1 : 0);
    const dir = new THREE.Vector3(Math.sin(viewYaw) * f - Math.cos(viewYaw) * side, 0, Math.cos(viewYaw) * f + Math.sin(viewYaw) * side);
    if (dir.lengthSq() < .01) dir.set(Math.sin(viewYaw), 0, Math.cos(viewYaw));
    dir.normalize();
    this._diveUntil = G.time + 2;
    this.releaseAll(true); this.guard = false; this._crouch(false);
    this.state = 'ko'; this.koT = .9; this.strength = .02; this.jumpBuffer = 0;
    this._toRag();
    for (const b of this.rag.bodies) {
      b.setLinvel({ x: dir.x * 8, y: 2.1, z: dir.z * 8 }, true);
      b.setAngvel({ x: dir.z * 2.8, y: 0, z: -dir.x * 2.8 }, true);
    }
    for (const i of LEGS) this.rag.setPartFilter(i, RAG_FILTER);
    this.onEvent?.('dive', {});
    return true;
  }

  // ---------------------------------------------------------------- teletransporte / respawn
  teleport(pos, yaw = this.yaw) {
    this._poseContacts = null;
    this.slideT = 0;
    this.pos.copy(pos);
    this.previousPos.copy(pos);
    this.renderPos.copy(pos);
    this.velocity.set(0, 0);
    this.jumpBuffer = 0;
    this.yaw = yaw;
    this.vy = 0;
    const center = { x: pos.x, y: pos.y + this.bodyY, z: pos.z };
    this.body.setTranslation(center, true);
    this.body.setNextKinematicTranslation(center);
    this.rig.place(pos, yaw);
    this.rig.animate({ speed: 0, grounded: true }, 1 / 60);
    this.rag.teleport(this.rig.transforms());
    this._resetArms();
    this._syncVisual();
  }

  _resetArms() {
    for (const a of [this.arm.l, this.arm.r]) {
      a.ready = false;
      a.on = false;
      a.script = null;
      a.w = 0;
      a.armed = 0;
    }
    this.guard = false;
  }

  respawn() {
    this.releaseAll();
    this._clearGrips(true);
    this.dead = false;
    this.deadT = 0;
    this.hp = 100;
    this.blood = 100;
    this.balance = 100;
    this.drunk *= 0.4;
    this.high *= 0.4;
    this.action = null;
    this.emote = null;
    this.state = 'active';
    this.strength = 1;
    // cuerpo limpio: sin heridas, sangre, partes cortadas ni tripas (y los demás también lo ven limpio)
    G.gore?.detachFrom(this.rag.bodies[PART.TORSO]);
    G.gore?.restore(this.char);
    // cuerpo físico entero otra vez (lo cortado se había desenganchado)
    if (this.gore) {
      this.rag.build(this.rig.transforms());
      this.rag.setKinematic(true);
      this._legsGround = undefined;
    }
    this.char.resetBody();
    this.char.expr.dead = false;
    this.gore = 0;
    this.bleedRate = 0;
    this.held = 0;
    this.push.set(0, 0);
    this.react.reset();
    this.hitStop = 0;
    this.seat = null;
    this._toAnim(false);
    try { this.collider.setEnabled(true); } catch { /* */ }
    this.teleport(spawnPoint(), SPAWN.yaw);
    this.onEvent?.('respawn', {});
  }

  // ---------------------------------------------------------------- vehículos / asientos
  setVehicle(vehicle) {
    this.vehicle = vehicle || null;
    try { this.collider.setEnabled(!this.vehicle && !this.seat); } catch { /* */ }
    if (this.vehicle) {
      this.releaseAll(true); // los objetos se sueltan; la birra y el faso siguen en la mano
      this._clearGrips(true);
      this.state = 'driving';
      this.rag.setKinematic(true);
      this.rag.setGroups(GR.RAGDOLL, GR.PROP | GR.DEBRIS);
    } else if (this.state === 'driving') {
      this.state = 'active';
      this.physMode = 'anim';
      this.rag.setKinematic(true);
      this.rag.setGroups(GR.RAGDOLL, RAG_FILTER);
      this.body.setTranslation({ x: this.pos.x, y: this.pos.y + this.bodyY, z: this.pos.z }, true);
    }
  }

  setSeatPose(vehicle) {
    const seat = VSEAT[vehicle.type] || VSEAT.mower;
    const [lx, lz] = seat.at[vehicle.seats?.indexOf(G.myId) === 1 ? 1 : 0];
    const s = Math.sin(vehicle.yaw), c = Math.cos(vehicle.yaw);
    // misma relación que las sillas: la base del cuerpo queda 0.46 m debajo del almohadón
    this.pos.set(vehicle.pos.x + lx * c + lz * s, vehicle.pos.y + seat.top - 0.46 + (vehicle.bob || 0), vehicle.pos.z - lx * s + lz * c);
    this.yaw = vehicle.yaw;
    this.speed = Math.abs(vehicle.speed || 0);
    this.grounded = true;
  }

  exitVehicleAt(vehicle) {
    const s = Math.sin(vehicle.yaw), c = Math.cos(vehicle.yaw);
    this.pos.set(vehicle.pos.x + c * 1.6, 0.03, vehicle.pos.z - s * 1.6);
    this.yaw = vehicle.yaw;
    this.setVehicle(null);
    this.teleport(this.pos, this.yaw);
    this._applyEject();
  }

  // Sentarse (poker, sillones, butacas): el cuerpo queda en pose de sentado, pero los brazos, las manos y
  // lo que tenés en ellas siguen andando (tomar, fumar, comer y revolear pochoclos, pegar).
  sitAt(seat) {
    this.seat = seat;
    this.state = 'seated';
    this.emote = null;
    this.rag.setKinematic(true);
    try { this.collider.setEnabled(false); } catch { /* */ }
    this.pos.set(seat.x, seat.y - 0.46, seat.z);
    this.yaw = seat.yaw;
    this.velocity.set(0, 0);
  }
  standUp() {
    if (!this.seat) return;
    const s = this.seat;
    this.seat = null;
    this.state = 'active';
    this.physMode = 'anim';
    this.rag.setKinematic(true);
    try { this.collider.setEnabled(true); } catch { /* */ }
    const p = new THREE.Vector3(s.x + Math.sin(s.yaw) * 0.7, 0.02, s.z + Math.cos(s.yaw) * 0.7);
    this.teleport(p, s.yaw);
  }

  // ---------------------------------------------------------------- vida
  damage(amount = 10, byId = 0) {
    if (this.dead || this.immortal) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.lastHurtT = G.time;
    if (byId) this.lastHitBy = byId;
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  // Curarse (choripán, botiquín, birra): opts.blood, opts.stopBleed
  heal(amount, opts = {}) {
    if (this.dead) return;
    this.hp = Math.min(100, this.hp + amount);
    if (opts.blood) this.blood = Math.min(100, this.blood + opts.blood);
    if (opts.stopBleed) {
      // una venda para lo que sangra (un miembro cortado sigue sangrando, pero menos)
      const severed = this.gore & 0x7ff;
      this.bleedRate = severed ? Math.min(this.bleedRate, 1.2) : 0;
    }
    this.char.healDamage?.(opts.stopBleed ? 0.5 : 0.15);
  }

  // Quejido / grito / estertor (lo oyen todos: el evento lleva la toma elegida). Cada golpe tiene su voz:
  // la nueva corta a la anterior (en el audio van por el mismo "canal" de ese jugador)
  _vocal(kind) {
    const rank = (k) => ({ hurt: 0, scream: 1, death: 2 }[k] ?? -1);
    // solo se evita el tartamudeo (dos en el mismo instante) y que un quejido corte un grito que recién empieza.
    // Reloj real: los golpes llegan por la red aunque mi pestaña esté en segundo plano (ahí G.time no avanza)
    const now = performance.now() / 1000;
    if (now - this._vocalT < (rank(kind) < rank(this._vocalKind) ? 0.35 : 0.12) && rank(kind) <= rank(this._vocalKind)) return;
    this._vocalT = now;
    this._vocalKind = kind;
    this.onEvent?.('vocal', { kind, vi: (Math.random() * 16) | 0 });
  }

  die() {
    if (this.dead || this.immortal) return;
    // sin cabeza no hay grito
    if (!(this.gore & (GORE_HEAD_POP | (1 << PART.HEAD)))) this._vocal('death');
    if (this.seat) this.standUp();
    this.dead = true;
    this.deadT = 0;
    this.state = 'dead';
    this.strength = 0;
    this.releaseAll();
    this._toRag();
    this.char.expr.dead = true;
    this.onEvent?.('death', { by: this.lastHitBy });
  }

  knockout(seconds, byId = 0, vel = null) {
    if (this.dead || this.state === 'driving') return;
    if (this.seat) this.standUp();
    if (byId) this.lastHitBy = byId;
    if (this.state !== 'ko') this.onEvent?.('ko', { by: this.lastHitBy, t: seconds });
    this.state = 'ko';
    this.koT = Math.max(this.koT, seconds);
    this.strength = 0;
    this.guard = false;
    this.releaseAll(true);
    this._toRag(vel);
  }

  // trastabillar: pierde el control un momento y lo empuja (vel: empujón horizontal)
  stun(seconds, vel = null) {
    if (this.state !== 'active' && this.state !== 'stun') return;
    this.state = 'stun';
    this.stunT = Math.max(this.stunT, seconds);
    if (vel) { this.push.x += vel.x; this.push.y += vel.z; }
  }

  // respingo: el torso acusa un empujón sin perder el control
  _flinch(dir, s) {
    this.react.hit(PART.TORSO, dir.x, dir.z, s, 0, 0, this.yaw);
  }

  // a ragdoll (física): conserva la velocidad de la animación y suma el empujón
  _toRag(vel = null) {
    if (this.physMode === 'rag') {
      if (vel) for (const b of this.rag.bodies) { const v = b.linvel(); b.setLinvel({ x: v.x + vel.x, y: v.y + vel.y, z: v.z + vel.z }, true); }
      return;
    }
    this.physMode = 'rag';
    this.rag.setKinematic(false, vel);
    // sin empujón (desmayo, desangrado, parado quieto) el cuerpo quedaba en equilibrio como una estatua:
    // las rodillas ceden y el torso se va para algún lado
    const sp = vel ? Math.hypot(vel.x, vel.z) : 0;
    if (sp < 0.8) {
      const a = Math.random() * Math.PI * 2, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const dx = Math.cos(a) * 0.5 + fx * 0.6, dz = Math.sin(a) * 0.5 + fz * 0.6;
      const t = this.rag.bodies[PART.TORSO], h = this.rag.bodies[PART.HEAD];
      for (const b of [t, h]) { const v = b.linvel(); b.setLinvel({ x: v.x + dx * 1.4, y: v.y, z: v.z + dz * 1.4 }, true); }
      for (const k of [PART.SHIN_L, PART.SHIN_R]) { const b = this.rag.bodies[k], v = b.linvel(); b.setLinvel({ x: v.x - fx * 0.9, y: v.y, z: v.z - fz * 0.9 }, true); }
    }
  }

  // a animación: el cuerpo vuelve a ser cinemático; lo visible pasa de la pose tirada a la animada
  _toAnim(blend = true) {
    if (this.physMode === 'anim') return;
    this._blendFrom = blend ? this.rag.cur.map((a) => a.slice()) : null;
    this.blendT = blend ? 0 : 1;
    this.physMode = 'anim';
    this.rag.setKinematic(true);
  }

  _startGetup() {
    const pt = this.rag.pelvis().translation();
    const p = new THREE.Vector3(pt.x, 0.02, pt.z);
    // mirar hacia donde quedó el torso
    const r = this.rag.bodies[1].rotation();
    const fwd = V1.set(0, 0, 1).applyQuaternion(Q1.set(r.x, r.y, r.z, r.w));
    if (Math.hypot(fwd.x, fwd.z) > 0.2) this.yaw = Math.atan2(fwd.x, fwd.z);
    this.pos.copy(p);
    this.previousPos.copy(p);
    const center = { x: p.x, y: p.y + this.bodyY, z: p.z };
    this.body.setTranslation(center, true);
    this.body.setNextKinematicTranslation(center);
    this.state = 'getup';
    this.getupT = 0;
    this.setAction('getup', 0.9);
    this._resetArms();
    this._toAnim(true);
  }

  // ¿Esta cosa que me toca viene a pegarme? Devuelve { src, by, kind, thr, massK } o null
  _threat(info, i) {
    // piñas, patadas, armas y cosas revoleadas por OTRO jugador: las avisa él (mide su golpe sin el retraso
    // de la red) y acá se validan en hitClaim. Detectarlas también acá duplicaba o debilitaba el golpe.
    if (info.kind === 'remote') return null;
    if (info.kind === 'prop' && info.ref) {
      const p = info.ref;
      if (p.heldBy === G.myId) return null; // mis objetos en mano
      const d = G.props?.dangerOf?.(p);
      if (!d || d.by) return null;
      return {
        src: 'prop', by: d.by, kind: CUT_PROPS.has(p.type) ? 'cut' : 'blunt', weapon: p.type,
        thr: d.thrown ? THR.thrown : THR.prop, massK: clamp(Math.sqrt(p.mass || 1) / 1.1, 0.4, 2.4),
      };
    }
    if (info.kind === 'vehicle' && info.ref) {
      const v = info.ref;
      return { src: 'vehicle', by: v.seats?.[0] || 0, kind: v.blades ? 'mulch' : 'blunt', thr: THR.vehicle, massK: 3 };
    }
    void i;
    return null;
  }

  // Tirado (física): el daño sale del impulso de contacto que recibe cada parte
  _scanContacts() {
    const W = G.phys.world;
    const now = performance.now();
    for (let i = 0; i < 11; i++) {
      const c = this.rag.colliders[i];
      if (!c) continue;
      W.contactPairsWith(c, (other) => {
        const info = G.phys.info(other);
        if (!info || info.kind === 'me' || info.kind === 'player' || info.kind === 'gib') return;
        let imp = 0, n = 0;
        let px = 0, py = 0, pz = 0, nx = 0, ny = 1, nz = 0;
        W.contactPair(c, other, (m, flipped) => {
          const k = m.numContacts();
          for (let j = 0; j < k; j++) imp += m.contactImpulse(j);
          if (m.numSolverContacts() > 0) {
            const sp = m.solverContactPoint(0);
            if (sp) { px += sp.x; py += sp.y; pz += sp.z; n++; }
          }
          const nn = m.normal();
          const f = flipped ? -1 : 1;
          nx = nn.x * f; ny = nn.y * f; nz = nn.z * f;
        });
        if (imp <= 0.01) return;
        const dv = imp / this.meta.mass[i];
        let hit;
        if (info.kind === 'world') hit = { src: 'world', by: 0, kind: 'blunt' };
        else {
          if (info.kind === 'prop' && info.ref && !info.ref.dynamic && !info.ref.heldBy) G.props?.touch(info.ref);
          hit = this._threat(info, i);
          if (!hit) return; // me arrastran, me pisan, ruedo contra algo: no es un golpe
        }
        // rodar/asentarse contra el piso no es un golpe (solo un azote violento)
        const thr = HIT_DV[i] * (info.kind === 'world' ? 2.6 : 1);
        if (dv < thr) return;
        const key = other.handle * 16 + i;
        if (now - (this.hitCd.get(key) || 0) < 260) return;
        this.hitCd.set(key, now);
        if (hit.by) this.hitBy.set(hit.by, now);
        const point = n ? new THREE.Vector3(px / n, py / n, pz / n) : this._partCenter(i, new THREE.Vector3());
        this._impact(i, dv / thr - 1, hit, point, new THREE.Vector3(nx, ny, nz));
      });
    }
    if (this.hitCd.size > 200) this.hitCd.clear();
  }

  // De pie las partes del cuerpo son cinemáticas: un golpe se mide por la velocidad con la que lo que me
  // toca viene HACIA mí (no por la mía: caminar o mover los brazos contra algo quieto no lastima).
  _scanHitsKinematic() {
    const W = G.phys.world;
    const now = performance.now();
    for (let i = 0; i < 11; i++) {
      const c = this.rag.colliders[i];
      if (!c || !c.isEnabled()) continue;
      W.contactPairsWith(c, (other) => {
        const info = G.phys.info(other);
        if (!info || info.kind === 'me' || info.kind === 'player' || info.kind === 'world' || info.kind === 'gib') return;
        let touching = false;
        W.contactPair(c, other, (m) => {
          for (let j = 0; j < m.numContacts(); j++) if (m.contactDist(j) < 0.02) { touching = true; break; }
        });
        if (!touching) return;
        const cp = c.translation(), op = other.translation();
        // normal: desde lo que me toca hacia mi parte
        const n = V4.set(cp.x - op.x, cp.y - op.y, cp.z - op.z);
        if (info.kind === 'vehicle' && info.ref) n.set(cp.x - info.ref.pos.x, 0, cp.z - info.ref.pos.z);
        if (n.lengthSq() < 1e-8) n.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        n.normalize();
        // mis puños/pies/cabeza pegándole a otro: aviso al otro (él decide el daño) y suena
        if (info.kind === 'remote' && this._attacking(i)) {
          const leg = i >= PART.THIGH_L, head = i === PART.HEAD;
          // la patada pega con el pie (la pantorrilla se mueve desde la rodilla: medía la mitad)
          const mv = leg ? this._footVel : this.rag.partVel(i, V2);
          const sp = -mv.dot(n); // mi parte yendo hacia él
          const a = leg ? 'k' : head ? 'h' : null;
          const w = a ? null : this._weaponOf(i);
          if (sp > (a === 'h' ? 1.2 : 2)) this._claimHit(info.id, info.part ?? 0, sp, c.translation(), w, a || (w ? 'w' : 'p'));
          if (!head) return;
        }
        if (info.kind === 'prop' && info.ref && !info.ref.dynamic && !info.ref.heldBy) { G.props?.touch(info.ref); return; }
        const hit = this._threat(info, i);
        if (!hit) {
          // cuerpo contra cuerpo (alguien que viene corriendo): empuja, no lastima
          if (info.kind === 'remote' && info.ref?.proxy) this._bump(info.ref.proxy.partVel(info.part ?? 0, V2), n);
          return;
        }
        const ov = V2.set(0, 0, 0);
        if (hit.src === 'remote') info.ref.proxy.partVel(info.part ?? 0, ov);
        else if (hit.src === 'prop') ov.copy(info.ref.vel);
        else if (hit.src === 'vehicle') { const v = info.ref; ov.set(Math.sin(v.yaw) * (v.speed || 0), 0, Math.cos(v.yaw) * (v.speed || 0)); }
        const approach = ov.dot(n);
        const thr = hit.thr * (i === PART.HEAD ? 0.9 : 1);
        if (approach < thr) return;
        const key = other.handle * 16 + i;
        if (now - (this.hitCd.get(key) || 0) < 300) return;
        if (hit.by && now - (this.hitBy.get(hit.by) || 0) < 200) return; // ya contado (aviso del atacante)
        this.hitCd.set(key, now);
        if (hit.by) this.hitBy.set(hit.by, now);
        const sev = this._severity(hit, approach);
        const point = new THREE.Vector3(cp.x - n.x * 0.06, cp.y - n.y * 0.06, cp.z - n.z * 0.06);
        this._impact(i, sev, hit, point, n.clone());
      });
    }
    if (this.hitCd.size > 200) this.hitCd.clear();
  }

  // gravedad de un golpe según qué pega y a qué velocidad
  _severity(hit, speed) {
    if (hit.src === 'remote') {
      const b = BODY_HITS[hit.body] || BODY_HITS.p; // piña / patada / cabezazo
      return clamp((speed - hit.thr) / b.span, 0, b.cap);
    }
    return clamp(((speed - hit.thr) / hit.thr) * hit.massK, 0, 3);
  }

  // Alguien me lleva puesto sin estar pegando: me empuja un poco
  _bump(ov, n) {
    const sp = ov.dot(n);
    if (sp < 3.2 || this.state !== 'active') return;
    // presupuesto de empujón: se recarga de a poco, así varios contactos a la vez no se suman
    const amt = Math.min(this._bumpBudget ?? 1.2, Math.min(1.2, sp * 0.2));
    if (amt <= 0.05) return;
    this._bumpBudget = (this._bumpBudget ?? 1.2) - amt;
    this.push.x += n.x * amt;
    this.push.y += n.z * amt;
    this._flinch(n, 0.12);
  }

  // Otros cuerpos de pie: nadie atraviesa a nadie (las cápsulas chocan) y si alguien te lleva por delante
  // te corre un poco, suave (antes la repulsión era exagerada y salían volando los dos)
  _crowd(dt) {
    this._bumpBudget = Math.min(1.2, (this._bumpBudget ?? 1.2) + dt * 1.5);
    const sep = this._sepV || (this._sepV = new THREE.Vector2());
    sep.set(0, 0);
    const ns = this._sepN || (this._sepN = []);
    ns.length = 0;
    for (const rp of G.players.values()) {
      if (!rp.standing) continue;
      // donde está SU CUERPO dibujado (ahí está su cápsula), no la última posición que llegó por la red
      const bp = rp.bodyPos || rp.pos;
      let dx = this.pos.x - bp.x, dz = this.pos.z - bp.z;
      let d = Math.hypot(dx, dz);
      const R = this.capsuleRadius + (rp.capsuleRadius||CAPSULE_RADIUS) + 0.04;
      if (d > R + 0.08 || Math.abs(this.pos.y - rp.pos.y) > 1.2) continue;
      if (d < 1e-3) { dx = -Math.sin(this.yaw); dz = -Math.cos(this.yaw); d = 1; } // justo encima: para atrás
      const nx = dx / d, nz = dz / d;
      // se acerca hacia mí: me empuja con lo que trae (en equilibrio, más o menos a su velocidad; con tope)
      const vIn = Math.min(4, -(rp.vel.x * nx + rp.vel.z * nz));
      const along = this.push.x * nx + this.push.y * nz;
      if (vIn > 0.3 && along < 3) { this.push.x += nx * vIn * 4 * dt; this.push.y += nz * vIn * 4 * dt; }
      // encimados (la red llegó tarde, alguien apareció encima): separar YA, no de a poco
      if (d < R) {
        const v = Math.min(3.5, (R - d) * 12);
        sep.x += nx * v; sep.y += nz * v;
        ns.push(nx, nz);
      }
    }
  }

  // Aviso al otro jugador de que mi mano/pie/arma le pegó (él valida y decide el daño)
  // a: 'p' piña, 'k' patada, 'h' cabezazo, 't' revoleado (con weapon = tipo de objeto), 'w' arma en la mano
  _claimHit(id, part, speed, pt, weapon = null, a = weapon ? 'w' : 'p') {
    const now = performance.now();
    const key = id * 16 + part;
    if (now - (this.claimCd.get(key) || 0) < 280) return;
    this.claimCd.set(key, now);
    if (this.claimCd.size > 64) this.claimCd.clear();
    this.onEvent?.('hitdealt', { id, part, dv: speed, x: pt.x, y: pt.y, z: pt.z, w: weapon || 0, a });
  }

  // Aviso de otro jugador: "te pegué". Se valida acá (distancia, que esté atacando, zona PvP en _impact)
  hitClaim(m) {
    const rp = G.players.get(m.id);
    if (!rp || this.dead || this.state === 'driving') return;
    if (rp.pos.distanceTo(this.pos) > 22) return;
    const now = performance.now();
    if (now - (this.hitBy.get(m.id) || 0) < 250) return; // ya lo conté por contacto
    const part = clamp(m.p | 0, 0, 10);
    const speed = clamp(+m.s || 0, 0, 16);
    const weapon = m.w ? defOf(m.w) : null;
    const a = BODY_HITS[m.a] ? m.a : 'p';
    // revoleado de lejos: el que lo tiró puede estar más lejos (hasta ~20 m)
    if (m.a !== 't' && rp.pos.distanceTo(this.pos) > 3.4) return;
    const hit = weapon
      ? { src: 'prop', by: m.id, kind: weapon.kind === 'cut' && m.a !== 't' ? 'cut' : 'blunt', weapon: m.w, thr: m.a === 't' ? THR.thrown : THR.prop, massK: clamp(Math.sqrt(weapon.mass || 1) / 1.1, 0.4, 2.4), thrown: m.a === 't' }
      : { src: 'remote', by: m.id, kind: 'blunt', thr: BODY_HITS[a].thr, massK: 1, body: a };
    if (speed < hit.thr) return;
    this.hitBy.set(m.id, now);
    const center = this._partCenter(part, new THREE.Vector3());
    const point = new THREE.Vector3(+m.x || 0, +m.y || 0, +m.z || 0);
    if (!Number.isFinite(point.x + point.y + point.z) || point.distanceTo(center) > 0.6) point.copy(center);
    const n = V4.set(this.pos.x - rp.pos.x, 0, this.pos.z - rp.pos.z);
    if (n.lengthSq() < 1e-6) n.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    n.normalize();
    this._impact(part, this._severity(hit, speed), hit, point, n.clone());
  }

  // ¿Mi parte i está pegando?
  _attacking(i) {
    if ((i === PART.FARM_R || i === PART.UARM_R) && this.arm.r.armed > 0) return true;
    if ((i === PART.FARM_L || i === PART.UARM_L) && this.arm.l.armed > 0) return true;
    if ((i === PART.SHIN_R || i === PART.THIGH_R) && this.action === 'kick' && this.actionT >= .13 && this.actionT <= .26) return true;
    if (i === PART.HEAD && this.action === 'headbutt' && this.actionT >= .035 && this.actionT <= .18) return true;
    return false;
  }
  // arma en la mano de la parte i (para que el otro calcule un golpe con arma)
  _weaponOf(i) {
    const side = i === PART.FARM_L || i === PART.UARM_L ? 'l' : i === PART.FARM_R || i === PART.UARM_R ? 'r' : null;
    if (!side || !this.hands[side].prop) return null;
    return G.props?.get(this.hands[side].prop)?.type || null;
  }

  _partCenter(i, out) {
    const b = this.rag.bodies[i];
    const t = b.translation();
    return out.set(t.x, t.y, t.z);
  }

  // hit = { src: remote|prop|vehicle|world, by, kind: blunt|cut|mulch, weapon }
  _impact(part, sev, hit, point, normal) {
    if (this.dead || this.state === 'driving') return;
    let by = hit.by || 0;
    if (by === G.myId) by = 0;
    const self = hit.src === 'remote' && part === PART.HEAD && this.action === 'headbutt';
    let s = clamp(sev, 0, 3) * (self ? 0.45 : 1);
    const pvp = G.settings.desmadre || isPvpAt(this.pos.x, this.pos.z);
    // afuera de las zonas PvP los golpes de otros jugadores empujan pero no lastiman (autos y caídas sí)
    // el dueño en modo inmortal: lo empujan, pero no lo lastiman
    const harmless = this.immortal || (!pvp && (hit.src === 'remote' || (hit.src === 'prop' && by)));
    // guardia: los golpes de frente a la cabeza, el torso y los brazos pierden casi toda la fuerza
    let blocked = false;
    if (this.guard && hit.src !== 'vehicle' && hit.src !== 'world' && part <= PART.FARM_R) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      if (-(normal.x * fx + normal.z * fz) > 0.2) { blocked = true; s *= part >= PART.UARM_L ? 0.15 : 0.35; }
    }
    const kind = hit.kind || 'blunt';
    const prof = hit.src === 'remote' ? BODY_HITS[hit.body] || BODY_HITS.p : null;
    const base = prof ? prof.base : hit.src === 'vehicle' ? 36 : 22;
    const dmg = harmless ? 0 : s * base * PART_DMG[part] * (kind === 'cut' ? 1.25 : kind === 'mulch' ? 3.5 : 1);
    if (dmg > 0) {
      this.damage(dmg, by);
      if (kind === 'cut') this.blood = Math.max(0, this.blood - s * 6);
      // herida visible (se sincroniza con todos)
      const local = this._toPartLocal(part, point);
      const strength = clamp(0.3 + s * 0.8, 0, 2.2) * (blocked ? 0.5 : 1);
      this.char.wound(part, local, kind, strength, null, (Math.random() * 1e6) | 0);
      this.onEvent?.('wound', { p: part, l: [r3(local.x), r3(local.y), r3(local.z)], k: kind, s: r3(strength) });
      // gore: miembros cortados, cabeza reventada, tripas afuera
      const g = blocked ? { sever: -1, headPop: false, guts: false } : goreFor(part, s, kind, hit.src);
      if (g.headPop || g.sever >= 0 || g.guts) {
        const c = this._partCenter(part, V2);
        const away = V3.copy(c).sub(point).setY(0.35).normalize().multiplyScalar(1.5 + s * 2.2);
        if (g.headPop) this._gore(GORE_HEAD_POP, away, by);
        else if (g.sever >= 0) this._gore(1 << g.sever, away, by);
        else this._gore(GORE_GUTS, away, by, point);
      }
    }
    this.onEvent?.('impact', { part, s, kind, harmless: harmless || blocked, blocked, x: point.x, y: point.y, z: point.z, nx: normal.x, ny: normal.y, nz: normal.z, by, src: hit.src });
    if (this.dead) return;
    // ya en el piso: un golpe fuerte lo deja un poco más, pero no se encadena para siempre
    if (this.physMode === 'rag') {
      if (this.state === 'ko' && s > 1 && hit.src !== 'world') this.koT = Math.max(this.koT, 1.2);
      if (dmg > 0 && s > 0.5 && hit.src !== 'world') this._vocal('hurt');
      return;
    }
    // reacción visible (resortes): la parte golpeada se va con el golpe; los demás la ven por el evento
    const dir = V1.set(normal.x, 0, normal.z);
    if (dir.lengthSq() < 1e-4) dir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    dir.normalize();
    if (hit.src !== 'world') this.react.hit(part, dir.x, dir.z, s, point.x - this.pos.x, point.z - this.pos.z, this.yaw);
    // sentado: un buen golpe te saca de la silla
    if (this.state === 'seated') {
      if (harmless || s < 0.6) { if (dmg > 0 && s > 0.3) this._vocal('hurt'); return; }
      this.standUp();
    }
    const bal = prof?.bal ?? 1.2, push = prof?.push ?? 1.2;
    if (!harmless) this.balance -= (dmg * (part === PART.HEAD ? 2.2 : 1.2) + s * 12) * bal;
    const fall = (!blocked && !harmless && part === PART.HEAD && s > 1.35) || s > 2.1 || (hit.src === 'vehicle' && s > 0.5) || this.balance <= 0;
    if (fall) {
      this.balance = 55;
      if (!harmless) this._vocal('scream');
      // cae con el golpe, sin salir volando (antes una piña que noqueaba lo mandaba a 4 m)
      this.knockout(1.8 + s * 1.2, by, V2.copy(dir).multiplyScalar((1.2 + s * 1.8) * push).setY(0.6 + s * 0.5));
      return;
    }
    if (s > 0.5 && !blocked) this.stun(0.25 + s * 0.3, V2.copy(dir).multiplyScalar((1.8 + s * 2.6) * push));
    else if (blocked) { this.push.x += dir.x * 0.8; this.push.y += dir.z * 0.8; }
    // un golpe de verdad te hace soltar a quien tenías agarrado
    if (s > 0.7 && !blocked && !harmless) for (const sd of ['l', 'r']) if (this.hands[sd].joint === PLAYER_GRIP) this.release(sd, false);
    // cada golpe que entra tiene su quejido (fuerte: grito); un empujón fuera de la pelea, un quejido igual
    if (!blocked && (dmg > 0 || s > 0.15)) this._vocal(s > 1.25 && dmg > 0 ? 'scream' : 'hurt');
  }

  // Aplica un evento de gore al jugador local (visual + consecuencias). bit: máscara de gore
  _gore(bit, vel, by = 0, point = null) {
    if (this.gore & bit) return;
    this.gore |= bit;
    const gore = G.gore;
    if (bit === GORE_HEAD_POP) {
      gore?.explodeHead(this.char, { vel });
      this.rag.detachBranch(PART.HEAD, branchOf(PART.HEAD));
      if (by) this.lastHitBy = by;
      this.die();
      return;
    }
    if (bit === GORE_GUTS) {
      const pt = point || this._partCenter(PART.TORSO, V1);
      gore?.spillGuts(this.rag.bodies[PART.TORSO], pt.clone(), vel.clone().normalize());
      this.bleedRate += 3;
      this.knockout(3, by);
      return;
    }
    const part = Math.log2(bit) | 0;
    gore?.sever(this.char, part, { vel });
    this.rag.detachBranch(part, branchOf(part));
    if (part === PART.HEAD) { if (by) this.lastHitBy = by; this.die(); return; }
    // sin mano no se agarra nada
    if (part === PART.UARM_L || part === PART.FARM_L) this.release('l', false);
    if (part === PART.UARM_R || part === PART.FARM_R) this.release('r', false);
    // se desangra, pero el chorro se va cortando solo (bleedRate baja con el tiempo): se puede seguir jugando
    // sin un brazo o rengueando sin una pierna. Otra herida grave o poca vida sí te pueden terminar
    this.bleedRate += part >= PART.THIGH_L ? 2.4 : 1.7;
    this._vocal('scream');
    // sin pierna: al piso un rato; después se levanta y rengea
    if (part >= PART.THIGH_L) this.knockout(3.5, by);
    else this.stun(0.8);
  }

  hasHand(side) {
    const up = side === 'l' ? PART.UARM_L : PART.UARM_R, fa = side === 'l' ? PART.FARM_L : PART.FARM_R;
    return !(this.gore & ((1 << up) | (1 << fa)));
  }

  _toPartLocal(i, world) {
    const b = this.rag.bodies[i];
    const t = b.translation(), r = b.rotation();
    M1.compose(V1.set(t.x, t.y, t.z), Q1.set(r.x, r.y, r.z, r.w), V2.set(1, 1, 1)).invert();
    return world.clone().applyMatrix4(M1);
  }

  // Salir despedido del vehículo en un choque
  eject(vel) {
    this._ejectVel = vel.clone();
  }
  _applyEject() {
    if (!this._ejectVel) return;
    const v = this._ejectVel;
    this._ejectVel = null;
    this.knockout(2.5 + v.length() * 0.2, 0, new THREE.Vector3(v.x, v.y + 2.5, v.z));
  }

  // ---------------------------------------------------------------- manos: agarrar / soltar / revolear
  handPos(side, out = new THREE.Vector3()) { return handWorld(this.rag, this.meta, side, out); }

  // E (derecha) / Q (izquierda): agarrar o soltar. Solo eso.
  toggleGrab(side) {
    const h = this.hands[side];
    if (h.joint) return this.release(side);
    if (!['active', 'stun', 'seated'].includes(this.state)) return false;
    // la birra/faso/aerosol no se "sueltan": si hay algo para agarrar se guardan y la mano lo agarra;
    // si no hay nada, siguen en la mano
    if (h.item) {
      const item = h.item;
      h.item = null;
      const ok = this.grab(side);
      if (!ok) h.item = item;
      return ok;
    }
    return this.grab(side);
  }

  grab(side) {
    if (!this.hasHand(side)) return false;
    const hp = this.handPos(side, new THREE.Vector3());
    const cam = G.camera;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    // 1) partes de otros jugadores cerca de la mano o apuntadas
    let best = null;
    for (const rp of G.players.values()) {
      if (!rp.proxy?.alive) continue;
      for (let i = 0; i < 11; i++) {
        const t = rp.proxy.bodies[i].translation();
        V1.set(t.x, t.y, t.z);
        const dh = V1.distanceTo(hp);
        const rel = V2.copy(V1).sub(cam.position);
        const along = rel.dot(dir);
        const perp = rel.addScaledVector(dir, -along).length();
        const score = Math.min(dh, along > 0 && along < 2.1 ? perp + 0.15 : 9);
        if (score < 0.42 && (!best || score < best.score)) best = { kind: 'player', rp, part: i, score };
      }
    }
    // 2) objetos
    const pr = G.props?.findGrabbable(hp, cam.position, dir, side);
    if (pr && (!best || pr.score < best.score)) best = { kind: 'prop', prop: pr.prop, score: pr.score };
    if (!best) return false;
    const h = this.hands[side];
    if (best.kind === 'prop') {
      // firme en la mano (sin resorte: el arma no cuelga ni se bambolea). Si ya está en la otra mano,
      // ahora va con las dos (la que lo agarró primero manda y esta se pone en el mango).
      const p = best.prop;
      const other = this.hands[side === 'l' ? 'r' : 'l'];
      if (other.prop !== p.id) {
        if (!G.props.claimForHand(p, side)) return false;
        G.props.hold(p, side, this.yaw);
      }
      h.joint = HOLD_JOINT;
      h.prop = p.id;
      h.fixed = false;
      h.spring = false;
      if (side === 'r') this.heldProp = p.id;
      this.onEvent?.('grab', { side, prop: p.id });
      return true;
    }
    // agarrar a otro jugador: mi mano se queda en ese punto de su cuerpo y le aviso; él siente el tirón
    // (su cliente lo mueve hacia mi mano). Él sigue en control: puede resistir, pegarme o zafarse.
    const rp = best.rp;
    const pb = rp.proxy.bodies[best.part];
    const pt = pb.translation(), prr = pb.rotation();
    M1.compose(V1.set(pt.x, pt.y, pt.z), Q1.set(prr.x, prr.y, prr.z, prr.w), V2.set(1, 1, 1)).invert();
    // el punto: donde está la mano, pero pegado a la superficie de la parte (no adentro ni en el aire)
    const a2 = hp.clone().applyMatrix4(M1);
    const cap = rp.char.meta.caps?.[best.part];
    if (cap) {
      const ab = V3.copy(cap.b).sub(cap.a), t = clamp(V4.copy(a2).sub(cap.a).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1);
      const axis = V5.copy(cap.a).addScaledVector(ab, t), off = V4.copy(a2).sub(axis);
      a2.copy(axis).addScaledVector(off.lengthSq() > 1e-8 ? off.normalize() : off.set(0, 0, 1), cap.r * 0.9);
    }
    h.joint = PLAYER_GRIP;
    h.player = rp.id;
    h.part = best.part;
    h.anchor = a2;
    this.onEvent?.('grabplayer', { side, to: rp.id, part: best.part, a: [r3(a2.x), r3(a2.y), r3(a2.z)] });
    return true;
  }

  // Punto donde tengo agarrado a otro (mundo) o null si ya no está
  _gripAnchor(h, out) {
    const rp = G.players.get(h.player);
    const b = rp?.proxy?.alive ? rp.proxy.bodies[h.part] : null;
    if (!b || !h.anchor) return null;
    const t = b.translation(), r = b.rotation();
    return out.copy(h.anchor).applyQuaternion(GQ.set(r.x, r.y, r.z, r.w)).add(GS.set(t.x, t.y, t.z));
  }

  // El otro se zafó (me avisa su cliente)
  gripLost(id, side) {
    const h = this.hands[side];
    if (h?.joint === PLAYER_GRIP && h.player === id) this.release(side, false);
  }

  release(side, throwIt = true) {
    const h = this.hands[side];
    if (h.item) {
      // consumible "de la heladerita": se revolea como objeto físico
      const item = h.item;
      h.item = null;
      if (throwIt && (item === 'beer' || item === 'spray')) this.onEvent?.('throwitem', { side, item });
      return true;
    }
    if (!h.joint) return false;
    if (h.joint !== HOLD_JOINT && h.joint !== PLAYER_GRIP) { try { G.phys.world.removeImpulseJoint(h.joint, true); } catch { /* */ } }
    h.joint = null;
    h.anchor = null;
    if (h.prop) {
      const id = h.prop;
      h.prop = 0;
      if (side === 'r' && this.heldProp === id) this.heldProp = null;
      const otherSide = side === 'l' ? 'r' : 'l';
      const p = G.props?.get(id);
      if (this.hands[otherSide].prop === id) {
        // lo tenía con las dos: sigue en la otra mano, que ahora manda
        if (p?.hold) p.hold.side = otherSide;
      } else G.props?.releaseFromHand(id, throwIt, this.handVelocity(side));
      this.onEvent?.('release', { side, prop: id });
    }
    if (h.player) {
      const v = this.handVelocity(side);
      this.onEvent?.('releaseplayer', { side, to: h.player, v: [r3(v.x), r3(v.y), r3(v.z)] });
      h.player = 0;
      h.part = -1;
    }
    return true;
  }

  // G libera ambos agarres del mismo objeto; E/Q sigue soltando una sola mano.
  releaseForThrow(side) {
    const id = this.hands[side].prop, other = side === 'l' ? 'r' : 'l';
    if (id && this.hands[other].prop === id) this.release(other, false);
    return this.release(side, false);
  }

  // keepItems: la birra/el faso/el aerosol quedan en la mano (solo se sueltan los objetos físicos)
  releaseAll(keepItems = false) {
    for (const side of ['l', 'r']) {
      const h = this.hands[side];
      if (h.joint) this.release(side, false);
      else if (!keepItems) h.item = null;
    }
  }

  // Los que me agarran me sueltan (reaparecí, me subí a algo). notify: avisarles
  _clearGrips(notify = false) {
    for (const [key, g] of [...this.grabbedBy]) {
      this._dropGrip(key);
      if (notify) this.onEvent?.('gripbreak', { to: g.id, side: g.side });
    }
    this.held = 0;
  }
  _dropGrip(key) {
    const g = this.grabbedBy.get(key);
    if (g?.joint) { try { G.phys.world.removeImpulseJoint(g.joint, true); } catch { /* */ } }
    this.grabbedBy.delete(key);
    this.held = this.grabbedBy.size;
  }

  handVelocity(side) {
    return this.rag.partVel(side === 'l' ? PART.FARM_L : PART.FARM_R, new THREE.Vector3());
  }

  // Otro jugador me agarró: su mano tira de esa parte de mi cuerpo. De pie sigo en control (camino, pego,
  // resisto); si me saca el equilibrio me caigo, y tirado me arrastra la física (resorte a su mano).
  grabbedByRemote(id, side, part, anchor, on, vel = null) {
    const key = id + ':' + side;
    const had = this.grabbedBy.has(key);
    if (had) this._dropGrip(key);
    if (!on) {
      // me soltó tironeando: salgo revoleado (donde se pelea, al piso si fue fuerte; si no, trastabillo)
      const v = Array.isArray(vel) ? V5.set(+vel[0] || 0, +vel[1] || 0, +vel[2] || 0) : null;
      const sp = v ? v.length() : 0;
      if (had && sp > 3.2 && !this.dead && this.physMode === 'anim' && this.state !== 'seated' && this.state !== 'driving') {
        const pvp = G.settings.desmadre || isPvpAt(this.pos.x, this.pos.z);
        if (sp > 5 && pvp) { this._vocal('scream'); this.knockout(1.2 + sp * 0.08, id, v.multiplyScalar(0.85).setY(Math.max(1, v.y * 0.85 + 1))); }
        else this.stun(0.35, V2.set(v.x, 0, v.z).multiplyScalar(pvp ? 0.8 : 0.45));
      }
      return;
    }
    const rp = G.players.get(id);
    if (!rp?.proxy?.alive || this.state === 'driving' || !Array.isArray(anchor)) return;
    if (this.seat) this.standUp();
    this.grabbedBy.set(key, {
      id, side: side === 'l' ? 'l' : 'r', part: clamp(part | 0, 0, 10), joint: null, hand: new THREE.Vector3(),
      anchor: new THREE.Vector3(+anchor[0] || 0, +anchor[1] || 0, +anchor[2] || 0),
    });
    this.held = this.grabbedBy.size;
  }

  // Cada paso: lo que me hacen los que me agarran (de pie: tirón, desequilibrio, zafarse; tirado: resorte)
  _gripPull(dt) {
    this._gripV.set(0, 0);
    this._gripHead = false;
    if (!this.grabbedBy.size) { this._gripBend.multiplyScalar(Math.exp(-8 * dt)); return; }
    const pvp = G.settings.desmadre || isPvpAt(this.pos.x, this.pos.z);
    const k = pvp ? GRIP.k : GRIP.kSafe, cap = pvp ? GRIP.cap : GRIP.capSafe, brk = pvp ? GRIP.brk : GRIP.brkSafe;
    const up = this.physMode === 'anim' && (this.state === 'active' || this.state === 'stun' || this.state === 'getup');
    const bend = GT.set(0, 0, 0);
    let by = 0;
    for (const [key, g] of [...this.grabbedBy]) {
      const rp = G.players.get(g.id);
      if (!rp?.proxy?.alive) { this._dropGrip(key); continue; }
      handWorld(rp.proxy, rp.char.meta, g.side, g.hand);
      // tirado: me arrastra la física (resorte entre su mano y mi parte)
      this._gripJoint(g, rp, this.physMode === 'rag');
      if (!up) continue;
      const b = this.rag.bodies[g.part];
      const t = b.translation(), r = b.rotation();
      const anc = GA.copy(g.anchor).applyQuaternion(GQ.set(r.x, r.y, r.z, r.w)).add(GS.set(t.x, t.y, t.z));
      const d = GD.copy(g.hand).sub(anc);
      const dist = d.length();
      if (dist > brk) {
        // me zafé: se estiró demasiado
        this._dropGrip(key);
        this.onEvent?.('gripbreak', { to: g.id, side: g.side });
        continue;
      }
      // tirón horizontal hacia su mano (con tope): camina para el otro lado y resisto, corro y me zafo
      const dh = Math.hypot(d.x, d.z);
      if (dh > GRIP.slack) {
        const v = Math.min(cap, (dh - GRIP.slack) * k);
        this._gripV.x += (d.x / dh) * v;
        this._gripV.y += (d.z / dh) * v;
      }
      // donde se pelea: los tirones fuertes (o levantarme una pierna) me sacan el equilibrio
      if (pvp) {
        // tirón: la mano respecto de SU cuerpo (caminar arrastrándome no cuenta; sacudir el brazo sí)
        const fv = rp.proxy.partVel(g.side === 'l' ? PART.FARM_L : PART.FARM_R, GS).sub(rp.proxy.partVel(PART.PELVIS, GT2));
        const yank = dist > 0.05 ? fv.dot(d) / dist : 0;
        const leg = g.part >= PART.THIGH_L;
        const w = leg ? 2 : g.part === PART.HEAD ? 1.4 : 1;
        // cuánto subió la mano desde donde agarró (una pierna levantada te deja en una pata)
        if (g.baseY === undefined) g.baseY = g.hand.y - this.pos.y;
        const up = g.hand.y - this.pos.y - g.baseY;
        const jerk = Math.max(0, yank - 2.2) * 80; // tirón seco (arrastrar no tira)
        const lift = leg ? Math.max(0, up - 0.12) * 300 : 0; // levantarte una pierna: al piso enseguida
        const down = g.part === PART.HEAD ? Math.max(0, -up - 0.25) * 90 : 0; // bajarte la cabeza de un tirón
        void w;
        this.balance -= (jerk + lift + down) * dt;
        by = g.id;
      }
      // el cuerpo se va hacia la mano que tira (los brazos van por su lado: la mano va a la del otro)
      if (g.part <= PART.HEAD) { bend.add(d); if (g.part === PART.HEAD) this._gripHead = true; }
    }
    const len = Math.hypot(this._gripV.x, this._gripV.y);
    if (len > cap) this._gripV.multiplyScalar(cap / len);
    this._gripBend.lerp(bend, 1 - Math.exp(-10 * dt));
    if (up && by && this.balance <= 0) {
      // derribado
      this.balance = 55;
      this._vocal('scream');
      this.knockout(1.4 + Math.random() * 0.6, by, V5.set(this._gripV.x * 0.8, 1.2, this._gripV.y * 0.8));
    }
  }

  _gripJoint(g, rp, on) {
    if (on && !g.joint) {
      const fore = rp.proxy.bodies[g.side === 'l' ? PART.FARM_L : PART.FARM_R], mine = this.rag.bodies[g.part];
      if (!fore || !mine) return;
      const gl = rp.char.meta.gripLocal[g.side];
      // firme: tiene que poder arrastrar ~70 kg tirados contra el rozamiento del piso
      const data = RAPIER.JointData.spring(0.05, 1800, 90, { x: gl.x, y: gl.y, z: gl.z }, { x: g.anchor.x, y: g.anchor.y, z: g.anchor.z });
      g.joint = G.phys.world.createImpulseJoint(data, fore, mine, true);
    } else if (!on && g.joint) {
      try { G.phys.world.removeImpulseJoint(g.joint, true); } catch { /* */ }
      g.joint = null;
    }
  }

  // Tengo a alguien agarrado: si se aleja más que mi brazo, me tira a mí (arrastrar pesa); muy lejos, se escapa
  _gripTug(dt) {
    for (const side of ['l', 'r']) {
      const h = this.hands[side];
      if (h.joint !== PLAYER_GRIP) continue;
      const anc = this._gripAnchor(h, GA);
      if (!anc) { this.release(side, false); continue; }
      const sh = this.rig.shoulderWorld(side, GS);
      const L = this._armLen(side);
      const d = anc.distanceTo(sh);
      if (d > L + 1.2) { this.release(side, false); continue; }
      if (d > L && (this.state === 'active' || this.state === 'stun')) {
        const k = Math.min(2.2, (d - L) * GRIP.tug) * dt * 4.5;
        this.push.x += ((anc.x - sh.x) / d) * k;
        this.push.y += ((anc.z - sh.z) / d) * k;
      }
    }
  }

  // Mano que me tienen agarrada del brazo (la del otro, en mundo) o null
  _armHeld(side) {
    const a = side === 'l' ? PART.UARM_L : PART.UARM_R, b = side === 'l' ? PART.FARM_L : PART.FARM_R;
    for (const g of this.grabbedBy.values()) if (g.part === a || g.part === b) return g.hand;
    return null;
  }

  // Ítem consumible en la mano derecha (1 birra, 2 faso, 3 aerosol)
  giveItem(item, side = 'r') {
    const h = this.hands[side];
    if (h.joint) this.release(side, false);
    h.item = item;
  }

  // ---------------------------------------------------------------- brazos (mouse)
  _armLen(side) {
    const k = side === 'l' ? 0 : 1;
    return this.rig.upperLen[k] + this.rig.foreLen[k];
  }
  _canUseArms() {
    return ['active', 'stun', 'seated', 'driving'].includes(this.state) && !this.dead;
  }

  // click sostenido: control libre del brazo
  armControl(side, on) {
    const a = this.arm[side];
    if (on && !a.on) {
      if (!this._canUseArms() || !this.hasHand(side)) return;
      if (a.script === 'punch' || a.script === 'swing') a.script = null;
      startControl(a, this._armLen(side), this.aimPitch);
    } else if (!on && a.on) a.on = false;
  }
  // Mueve los brazos controlados. Devuelve el movimiento que sobró [dx, dy] (px) para girar la cámara
  moveArms(dx, dy) {
    let ox = 0, oy = 0, n = 0;
    for (const side of ['l', 'r']) {
      const a = this.arm[side];
      if (!a.on) continue;
      const [x, y] = moveControl(a, dx, dy, G.opts.sens, G.opts.invertY);
      ox += x; oy += y; n++;
    }
    return n ? [ox / n, oy / n] : [dx, dy];
  }
  armWheel(w) {
    for (const side of ['l', 'r']) if (this.arm[side].on) reachControl(this.arm[side], w);
  }
  armActive() { return this.arm.l.on || this.arm.r.on; }
  setGuard(on) {
    this.guard = !!on && this._canUseArms() && this.state !== 'driving';
    if (this.guard) { this.arm.l.on = false; this.arm.r.on = false; }
  }

  // punto al que apunta la cámara, en el marco local del hombro (a dónde va la piña)
  _aimLocal(side, out, dist = 0.72) {
    const cp = Math.cos(this.aimPitch);
    const dirW = V5.set(Math.sin(this.viewYaw) * cp, Math.sin(this.aimPitch), Math.cos(this.viewYaw) * cp);
    this.rig.root.updateMatrixWorld(true);
    // desde el mentón (no desde los ojos): la piña sale derecha del hombro, no hacia arriba
    const eye = this.rig.joints[2].getWorldPosition(V6);
    eye.y += 0.02;
    const sh = this.rig.shoulderWorld(side, V1);
    out.copy(eye).addScaledVector(dirW, dist).sub(sh).applyAxisAngle(UP, -this.yaw);
    out.x += this.arm[side].out * 0.03;
    const L = this._armLen(side) * 0.97;
    if (out.length() > L) out.setLength(L);
    return out;
  }

  // click corto: usar lo que hay en la mano o tirar una piña
  tap(side) {
    if (!this._canUseArms() || !this.hasHand(side)) return null;
    const h = this.hands[side];
    const a = this.arm[side];
    if (a.script && a.t < a.dur * 0.55) return null; // sin spamear: termina el movimiento anterior
    if (h.item === 'beer') { startScript(a, 'drink', 1.5); this.setAction('drink-arm', 1.5); return 'drink'; }
    if (h.item === 'smoke') { startScript(a, 'smoke', 1.3); return 'smoke'; }
    if (h.item === 'spray') return 'spray';
    const held = h.prop ? G.props?.get(h.prop) : null;
    if (held?.type === 'popcorn') { startScript(a, 'eat', 1.1); return 'eat'; }
    // mano libre y en la otra un balde de pochoclos: agarra un puñado y lo revolea
    const other = this.hands[side === 'l' ? 'r' : 'l'];
    const op = other.prop ? G.props?.get(other.prop) : null;
    if (!h.prop && !h.player && !h.item && op?.type === 'popcorn') {
      startScript(a, 'throw', 0.42, this._aimLocal(side, V3, 0.9));
      a.handful = true;
      return 'handful';
    }
    if (this.state === 'driving') return null; // manejando solo se toma y se fuma
    if (held) {
      // swing con el arma: de arriba/afuera cruzando hacia adelante
      const L = this._armLen(side);
      V3.set(-a.out * 0.22, -0.08 + this.aimPitch * 0.35, L * 0.85);
      startScript(a, 'swing', 0.62, V3);
      return 'swing';
    }
    startScript(a, 'punch', 0.34, this._aimLocal(side, V3));
    // la piña sale con el cuerpo: medio paso adelante
    this.push.x += Math.sin(this.yaw) * 0.9;
    this.push.y += Math.cos(this.yaw) * 0.9;
    return 'punch';
  }
  // compat: movimiento guionado de un brazo
  _script(side, kind, dur) { startScript(this.arm[side], kind, dur, kind === 'throw' ? this._aimLocal(side, V3, 0.9) : null); }

  // G: revolear lo que hay en la mano (sale al final del envión, ver 'throwrelease')
  startThrow(side) {
    if (!this._canUseArms() || !this.hasHand(side)) return false;
    const a = this.arm[side];
    a.on = false;
    startScript(a, 'throw', 0.46, this._aimLocal(side, V3, 0.95));
    a.handful = false;
    return true;
  }

  kick() {
    if (this.state !== 'active') return;
    this.setAction('kick', 0.5);
    this.push.x += Math.sin(this.yaw) * 0.8;
    this.push.y += Math.cos(this.yaw) * 0.8;
  }
  headbutt() {
    if (this.state !== 'active') return;
    this.setAction('headbutt', 0.42);
    this.push.x += Math.sin(this.yaw) * 1.1;
    this.push.y += Math.cos(this.yaw) * 1.1;
  }

  _heldMass(side) {
    const h = this.hands[side];
    if (h.prop) {
      const m = G.props?.get(h.prop)?.mass || 1;
      // con las dos manos cada brazo carga poco más de la mitad (el arma pesada se maneja mejor)
      return this.hands[side === 'l' ? 'r' : 'l'].prop === h.prop ? m * 0.55 : m;
    }
    if (h.player) return 9;
    if (h.item) return ITEM_MASS[h.item] || 0.3;
    return 0;
  }

  // mano según la animación (sin IK), en el marco local del hombro
  _animHandLocal(side, out) {
    const k = side === 'l' ? 0 : 1;
    const el = this.rig.joints[side === 'l' ? 4 : 6];
    const ew = el.getWorldPosition(V1);
    const hand = V2.copy(FORE_DIR).applyQuaternion(el.getWorldQuaternion(Q1)).multiplyScalar(this.rig.foreLen[k]).add(ew);
    const sh = this.rig.shoulderWorld(side, V3);
    return out.copy(hand).sub(sh).applyAxisAngle(UP, -this.yaw);
  }

  // boca (para tomar/fumar/comer), local al hombro
  _mouthLocal(side, out) {
    const head = this.rig.joints[2].getWorldPosition(V1);
    const m = V2.set(Math.sin(this.yaw) * 0.13, 0.09, Math.cos(this.yaw) * 0.13).add(head);
    const sh = this.rig.shoulderWorld(side, V3);
    out.copy(m).sub(sh).applyAxisAngle(UP, -this.yaw);
    out.x += this.arm[side].out * -0.02;
    return out;
  }

  // agarre del volante (manejando), local al hombro; null si no hay volante
  _wheelLocal(side, out) {
    const v = this.vehicle;
    if (!v || v.seats?.[0] !== G.myId) return null;
    const sw = v.group?.userData?.steer;
    if (!sw) return null;
    const R = sw.userData.R || 0.16;
    sw.updateWorldMatrix(true, false);
    out.set(side === 'l' ? R * 0.86 : -R * 0.86, R * 0.42, 0);
    sw.localToWorld(out);
    const sh = this.rig.shoulderWorld(side, V3);
    return out.sub(sh).applyAxisAngle(UP, -this.yaw);
  }

  // Póker: las manos descansan sobre el borde de la mesa, a los costados de las cartas propias (local al hombro)
  _tableLocal(side, out) {
    const s = this.seat;
    if (!s?.poker) return null;
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    const lx = Math.cos(s.yaw), lz = -Math.sin(s.yaw); // izquierda del asiento
    const lat = (side === 'l' ? 1 : -1) * 0.19;
    out.set(s.x + fx * 0.5 + lx * lat, 0.93, s.z + fz * 0.5 + lz * lat);
    const sh = this.rig.shoulderWorld(side, V3);
    return out.sub(sh).applyAxisAngle(UP, -this.yaw);
  }

  // Gesto en la mesa de póker: pasar (golpecito), pagar/subir (empujar fichas), tirarse (soltar las cartas)
  pokerGesture(act) {
    if (!this.seat?.poker) return;
    const side = 'r';
    const a = this.arm[side];
    const base = this._tableLocal(side, V3);
    if (!base) return;
    if (act === 'check') { startScript(a, 'tap', 0.5, V4.copy(base).add(V5.set(0, -0.02, 0.06))); return; }
    if (act === 'fold') { startScript(a, 'reach', 0.55, V4.copy(base).add(V5.set(0.1, 0.03, 0.2))); return; }
    // fichas al medio
    startScript(a, 'reach', 0.8, V4.copy(base).add(V5.set(0.14, -0.01, 0.3)));
  }

  // dirección en la que apunta el aerosol (local al hombro)
  _sprayLocal(side, out) {
    const L = this._armLen(side);
    const cp = Math.cos(this.aimPitch * 0.9);
    const y = 0.08 * this.arm[side].out;
    return out.set(this.arm[side].out * Math.sin(y) * cp, Math.sin(this.aimPitch * 0.9), Math.cos(y) * cp).multiplyScalar(L * 0.9);
  }

  // ---------------------------------------------------------------- objetos firmes en la mano
  // Mano y codo en mundo según el esqueleto (pose del paso de física o la dibujada)
  _handFrame(side, hand, elbow) {
    const fore = this.rig.joints[side === 'l' ? 4 : 6];
    fore.updateWorldMatrix(true, false);
    elbow.setFromMatrixPosition(fore.matrixWorld);
    return hand.copy(this.meta.gripLocal[side]).applyMatrix4(fore.matrixWorld);
  }

  // Lo que manda cada mano: [{ p, side (la que manda), two }]
  _heldList() {
    const out = [];
    if (!G.props) return out;
    for (const side of ['r', 'l']) {
      const hd = this.hands[side];
      if (hd.joint !== HOLD_JOINT || !hd.prop) continue;
      const p = G.props.get(hd.prop);
      if (!p?.kin || !p.hold || p.hold.side !== side) continue;
      out.push({ p, side, two: this.hands[side === 'l' ? 'r' : 'l'].prop === p.id });
    }
    return out;
  }

  // Pose del objeto desde la mano que manda. dt > 0: paso de física (avanza el retraso, barre el filo)
  _posHeld(p, side, two, dt) {
    if (dt > 0) {
      // muñeca en los golpes guionados: al cargar la hoja se va atrás, al pegar sale adelante y abajo
      const a = this.arm[side], st = p.hold.st;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      st.wrist = st.wrist || new THREE.Vector3();
      if (a.script === 'swing' || a.script === 'throw') {
        const windup = a.script === 'swing' ? 0.2 : 0.17, strike = a.script === 'swing' ? 0.42 : 0.34;
        if (a.t < windup) st.wrist.set(-fx * 0.9, 0.25, -fz * 0.9);
        else if (a.t < strike) st.wrist.set(fx * 1.7, -0.55, fz * 1.7);
        else st.wrist.set(fx * 0.5, -0.2, fz * 0.5);
      } else st.wrist.set(0, 0, 0);
    }
    this._handFrame(side, HH, HE);
    heldQuat(p.type, p.hold.st, HH, HE, this.yaw, dt, HQ);
    HR.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const g2 = gripPoints(p.type, two, side === 'r', HR, HQ, HG1, HG2);
    heldPos(HH, HQ, HG1, HP);
    return g2;
  }

  // Cada paso: la mano lleva el objeto; la otra mano (si va con las dos) se pone en el mango
  _driveHeld(dt) {
    this._second = null;
    for (const { p, side, two } of this._heldList()) {
      const g2 = this._posHeld(p, side, two, dt);
      G.props.driveHeld(p, HP, HQ, dt);
      if (two && g2) {
        this._secondPos = (this._secondPos || new THREE.Vector3()).copy(g2).applyQuaternion(HQ).add(HP);
        this._second = { side: side === 'l' ? 'r' : 'l', pos: this._secondPos };
      }
      this._sweep(p, side, dt);
    }
  }

  // Lo que se ve: el objeto a la pose dibujada de la mano (sin el tironeo del paso de física)
  _showHeld() {
    const ch = this.char;
    for (const { p, side, two } of this._heldList()) {
      this._posHeld(p, side, two, 0);
      G.props.showHeld(p, HP, HQ);
      // la muñeca acomoda la mano al mango (y la otra mano también, si va con las dos); los dedos, a su forma
      if (ch.gripAxis?.[side] && handleAxis(p.type, HQ, ch.gripAxis[side])) {
        ch.gripOn[side] = true;
        if (two) { const o = side === 'l' ? 'r' : 'l'; ch.gripAxis[o].copy(ch.gripAxis[side]); ch.gripOn[o] = true; }
      }
      setHandGrip(ch, side, p, two);
    }
  }

  // Posición de guardia con algo en la mano: el arma adelante y a la vista; lo que cuelga, frente al pecho
  _readyLocal(side, p, two, out) {
    const a = this.arm[side];
    if (holdOf(p.type).style === 'stick') return two ? out.set(-a.out * 0.12, -0.3, 0.32) : out.set(a.out * 0.02, -0.3, 0.3);
    return out.set(-a.out * (two ? 0.06 : 0.02), -0.22 - (p.mass > 5 ? 0.08 : 0), 0.36);
  }

  // El filo barre el espacio entre dos pasos: golpes a jugadores (con el arma y la velocidad de la punta),
  // a la bolsa y a objetos sueltos; contra paredes rebota con un "clang" (y el brazo acusa el rebote).
  _sweep(p, side, dt) {
    let bp = BLADES.get(p.type);
    if (bp === undefined) { bp = bladePoints(p.type); BLADES.set(p.type, bp); }
    const h = p.hold;
    if (!bp || !h || h.snap < 1 || dt <= 0) return;
    const a = this.arm[side];
    const now = G.time;
    // despacio el barrido no ve nada: si alguna parte del arma quedó adentro de otro cuerpo, la mano retrocede
    // hasta que el arma quede apoyada en la superficie (el arma tiene cuerpo: no se mete en la gente)
    let worst = 0, wx = 0, wy = 0, wz = 0;
    for (const lp of bp.pts) {
      const q = SW1.copy(lp).applyQuaternion(h.quat).add(h.pos);
      const pr = G.phys.nearest?.(q.x, q.y, q.z, BODY_Q);
      if (!pr?.inside) continue;
      const dd = Math.hypot(pr.x - q.x, pr.y - q.y, pr.z - q.z);
      if (dd > worst) { worst = dd; wx = (pr.x - q.x) / (dd || 1); wy = (pr.y - q.y) / (dd || 1); wz = (pr.z - q.z) / (dd || 1); }
    }
    if (worst > 0.005) {
      const nl = V5.set(wx, wy, wz).applyAxisAngle(UP, -this.yaw);
      const push = Math.min(0.12, worst + 0.012);
      // también la posición anterior: lo dibujado interpola entre las dos y si no, se veía adentro
      a.p.addScaledVector(nl, push);
      a.pp.addScaledVector(nl, push);
      const vIn = a.v.dot(nl);
      if (vIn < 0) a.v.addScaledVector(nl, -vIn);
    }
    for (const lp of bp.pts) {
      const cur = SW1.copy(lp).applyQuaternion(h.quat).add(h.pos);
      const prev = SW2.copy(lp).applyQuaternion(h.prevQuat).add(h.prevPos);
      const d = SW3.copy(cur).sub(prev);
      const len = d.length();
      const speed = len / dt;
      if (speed < 3 || len < 1e-4) continue;
      d.divideScalar(len);
      const hit = G.phys.raycast(prev.x, prev.y, prev.z, d.x, d.y, d.z, len + 0.02, SWEEP_GROUPS, null, (col) => {
        const info = G.phys.info(col);
        if (!info) return true;
        if (info.kind === 'me' || info.kind === 'player' || info.kind === 'gib') return false;
        if (info.kind === 'prop') return !!info.ref && info.ref !== p && !info.ref.kin && info.ref.heldBy !== G.myId;
        return info.kind === 'world' || info.kind === 'remote' || info.kind === 'bag' || info.kind === 'vehicle';
      });
      if (!hit) continue;
      const pt = new THREE.Vector3(hit.x, hit.y, hit.z);
      const kind = hit.info?.kind;
      if (kind === 'remote') {
        // un golpe por víctima en cada tajo; cuenta el 70% de la velocidad de la punta (parte de la energía se va
        // en mover al otro)
        const last = (this._swingHits || (this._swingHits = new Map())).get(hit.info.id) || -9;
        if (now - last > 0.45) {
          this._swingHits.set(hit.info.id, now);
          this._claimHit(hit.info.id, hit.info.part ?? 1, Math.min(13, speed) * 0.7, pt, p.type);
        }
        // el arma choca de verdad: no atraviesa el cuerpo. La mano retrocede lo que el filo se metió (queda
        // apoyado en la piel, apenas hundido) y pierde la velocidad que la llevaba adentro
        const deep = Math.max(0, len - hit.dist - 0.025);
        const dl = V5.copy(d).applyAxisAngle(UP, -this.yaw);
        if (deep > 0) a.p.addScaledVector(dl, -deep);
        const vIn = a.v.dot(dl);
        if (vIn > 0) a.v.addScaledVector(dl, -vIn * 0.9);
        a.v.multiplyScalar(0.7);
        this._breakHeld(p, speed);
        return;
      }
      if (kind === 'bag') {
        if (now - (this._swBag || 0) > 0.2) { this._swBag = now; hit.info.ref?.punch(Math.min(14, speed * 0.85), pt, d, p.mass); }
        a.v.multiplyScalar(0.55);
        return;
      }
      if (kind === 'prop') { this._whack(hit.info.ref, d, speed, pt, p); continue; }
      // pared, piso, vehículo: rebota si venía fuerte
      if (speed > 4.5 && now - (this._swWall || 0) > 0.18) {
        this._swWall = now;
        const dl = V5.copy(d).applyAxisAngle(UP, -this.yaw);
        const vIn = a.v.dot(dl);
        if (vIn > 0) a.v.addScaledVector(dl, -vIn * 1.5);
        this.onEvent?.('clang', { x: pt.x, y: pt.y, z: pt.z, s: speed, metal: METAL.has(p.type), nx: hit.nx, ny: hit.ny, nz: hit.nz });
        this._breakHeld(p, speed);
      }
      return;
    }
  }

  // Botella (o algo frágil) en la mano contra algo duro: se rompe en la mano
  _breakHeld(p, speed) {
    if (!p.def.breakDv || speed < p.def.breakDv * 1.25) return;
    for (const s of ['l', 'r']) if (this.hands[s].prop === p.id) this.release(s, false);
    G.props?._break(p);
  }

  // Un objeto suelto que se lleva puesto el arma: vuela (o se rompe si es frágil y el golpe es fuerte)
  _whack(q, d, speed, pt, w) {
    if (!q || (q._whackT || 0) > G.time) return;
    q._whackT = G.time + 0.15;
    G.props.touch(q);
    if (q.def.breakDv && speed > q.def.breakDv * 1.15 && q.dynamic) { G.props._break(q); return; }
    if (!q.dynamic) return;
    const k = clamp((speed * (1 + (w.mass || 1) * 0.2)) / Math.sqrt(Math.max(0.2, q.mass)), 0, 20) * q.mass;
    q.body.applyImpulse({ x: d.x * k, y: (d.y + 0.3) * k, z: d.z * k }, true);
    q.thrownAt = performance.now();
    q.thrownBy = G.myId;
    this.onEvent?.('whack', { x: pt.x, y: pt.y, z: pt.z, s: speed, metal: METAL.has(w.type) });
  }

  // Contacto del volumen del miembro antes de que el hueso atraviese la superficie.
  _limbContact(hit, desired, previous, dt) {
    const i = hit.part;
    if (!this._attacking(i)) return;
    const cap = this.meta.caps[i];
    const tip = cap.b.clone().applyQuaternion(desired.q).add(desired.p);
    const old = cap.b.clone().applyQuaternion(previous.q).add(previous.p);
    const velocity = tip.clone().sub(old).multiplyScalar(1 / dt);
    const n = new THREE.Vector3(hit.contact.normal1.x, hit.contact.normal1.y, hit.contact.normal1.z);
    const speed = -velocity.dot(n);
    const leg = i >= 7, head = i === PART.HEAD;
    if (speed < (head ? 1.2 : 2) || (leg && velocity.dot(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))) < 1.5)) return;
    const key = hit.collider.handle * 16 + i, now = performance.now();
    if (now - (this.hitCd.get(key) ?? -1000) < 220) return;
    this.hitCd.set(key, now);
    const point = hit.contact.point1 || tip, info = hit.info;
    const kind = leg ? 'k' : head ? 'h' : 'p';
    if (info?.kind === 'remote') this._claimHit(info.id, info.part ?? 1, speed, point, this._weaponOf(i), kind);
    else if (info?.kind === 'prop' && info.ref) {
      this._whack(info.ref, n.clone().negate(), Math.min(speed, 14), point, { mass: leg ? 6 : head ? 4 : 1 });
    } else if (info?.kind === 'bag') info.ref?.punch(speed, point, n.clone().negate(), leg ? 6 : 1);
    else this.onEvent?.('handwall', { x: point.x, y: point.y, z: point.z, s: speed });
    this.hitStop = Math.max(this.hitStop, .035);
  }

  // Un paso de física de las dos manos (el rig ya está ubicado en la pose de este paso)
  _stepArms(dt) {
    const canUse = this._canUseArms();
    for (const side of ['l', 'r']) {
      const a = this.arm[side];
      if (!canUse || !this.hasHand(side)) { a.on = false; if (a.script && !canUse) a.script = null; }
      const L = this._armLen(side);
      const spray = a.on && this.hands[side].item === 'spray';
      // apoyo de la mano: el volante manejando o la mesa sentado al póker
      const rest = this._wheelLocal(side, WHEEL[side]) || this._tableLocal(side, WHEEL[side]);
      const ctx = {
        L,
        mass: this._heldMass(side) + (this.hands[side].joint === PLAYER_GRIP ? 9 : 0), // tener a alguien pesa
        mouth: this._mouthLocal(side, MOUTH[side]),
        wheel: a.script ? null : rest,
        rest,
        guard: this.guard && !a.script,
      };
      // con algo firme en la mano: guardia con el arma a la vista; la segunda mano va al mango
      const hd = this.hands[side];
      if (hd.joint === HOLD_JOINT && hd.prop && canUse) {
        const p = G.props?.get(hd.prop);
        if (p?.hold) {
          if (this._second?.side === side) {
            a.on = false; a.script = null; ctx.guard = false;
            const sh = this.rig.shoulderWorld(side, V3);
            ctx.wheel = WHEEL[side].copy(this._second.pos).sub(sh).applyAxisAngle(UP, -this.yaw);
            ctx.grip = true;
          } else if (p.hold.side === side) ctx.ready = this._readyLocal(side, p, this.hands[side === 'l' ? 'r' : 'l'].prop === p.id, READY[side]);
        }
      }
      if (hd.joint === PLAYER_GRIP && canUse && !a.on && !a.script) {
        // no lo estoy moviendo con el mouse: la mano sigue en el punto que agarré
        const anc = this._gripAnchor(hd, GA);
        if (anc) { ctx.wheel = WHEEL[side].copy(anc).sub(this.rig.shoulderWorld(side, V3)).applyAxisAngle(UP, -this.yaw); ctx.grip = true; ctx.guard = false; }
      }
      const tugged = this._armHeld(side);
      if (tugged) {
        // me tienen del brazo: va hacia la mano del otro (con ese brazo no pego)
        a.on = false; a.script = null; ctx.guard = false; ctx.grip = true;
        ctx.wheel = WHEEL[side].copy(tugged).sub(this.rig.shoulderWorld(side, V3)).applyAxisAngle(UP, -this.yaw);
      }
      if (spray) { a.on = false; a.script = null; ctx.wheel = this._sprayLocal(side, WHEEL[side]); }
      stepArm(a, this.hitStop > 0 && G.time - a.hitT < 0.2 ? dt * 0.12 : dt, ctx);
      if (spray) a.on = true;
      this._blockHand(side, a);
      this._handOutOfBodies(side, a);
      // revoleo: la mano suelta al final del envión
      if (a.script === 'throw' && !a.released && a.t >= 0.2) {
        a.released = true;
        this.onEvent?.(a.handful ? 'handful' : 'throwrelease', { side });
      }
    }
  }

  // La mano no atraviesa paredes, vehículos, objetos pesados ni cuerpos: se frena donde choca.
  // Si choca un cuerpo con una piña/swing, se avisa el golpe.
  _blockHand(side, a) {
    if (a.w < 0.3) return;
    const sh = this.rig.shoulderWorld(side, V1);
    const from = V2.copy(a.pp).applyAxisAngle(UP, this.yaw).add(sh);
    const to = V3.copy(a.p).applyAxisAngle(UP, this.yaw).add(sh);
    const d = V4.copy(to).sub(from);
    const len = d.length();
    if (len < 1e-4) return;
    d.divideScalar(len);
    const R = 0.045;
    const hit = G.phys.raycast(from.x, from.y, from.z, d.x, d.y, d.z, len + R, HAND_BLOCK, null, (col) => {
      const info = G.phys.info(col);
      if (!info) return true;
      if (info.kind === 'prop') return !!info.ref && info.ref.heldBy !== G.myId && (info.ref.mass || 0) > 4;
      return info.kind === 'world' || info.kind === 'vehicle' || info.kind === 'remote' || info.kind === 'bag';
    });
    // sin choque, o la mano ya estaba adentro (pegado a alguien): que siga, no se traba
    if (!hit) return;
    const body = hit.info?.kind === 'remote';
    const bag = hit.info?.kind === 'bag';
    // contra un cuerpo la mano queda apoyada en la piel (antes entraba 3.5 cm y desde adentro ya no chocaba más)
    const stop = Math.max(0, Math.min(len, hit.dist - (body ? R * 0.6 : R)));
    to.copy(from).addScaledVector(d, stop);
    a.p.copy(to).sub(sh).applyAxisAngle(UP, -this.yaw);
    const dl = V5.copy(d).applyAxisAngle(UP, -this.yaw);
    const vIn = a.v.dot(dl);
    if (vIn > 0) a.v.addScaledVector(dl, -vIn * (body ? 1.15 : 1.25));
    // velocidad real del golpe (la mano + el cuerpo)
    const speed = vIn + (this.velocity.x * d.x + this.velocity.y * d.z) + (this.push.x * d.x + this.push.y * d.z) * 0.5;
    if (body && a.armed > 0 && speed > 2.2 && G.time - a.hitT > 0.25) {
      a.hitT = G.time;
      const part = hit.info.part ?? 1;
      const w = this.hands[side].prop ? G.props?.get(this.hands[side].prop)?.type : null;
      this._claimHit(hit.info.id, part, speed, to, w);
    } else if (bag && speed > 1.5 && G.time - a.hitT > 0.2) {
      a.hitT = G.time;
      hit.info.ref?.punch(speed, to, d, this._heldMass(side));
    } else if (!body && !bag && vIn > 3 && G.time - a.hitT > 0.2) {
      a.hitT = G.time;
      this.onEvent?.('handwall', { x: to.x, y: to.y, z: to.z, s: vIn });
    }
  }

  // La mano no queda adentro de otro cuerpo: moviéndola despacio el rayo no ve el choque (arranca apoyada o
  // adentro) y se podía meter la mano en la cara de otro. Se la saca a la superficie y se frena lo que empuja.
  _handOutOfBodies(side, a) {
    if (a.w < 0.3) return;
    const sh = this.rig.shoulderWorld(side, V1);
    const to = V3.copy(a.p).applyAxisAngle(UP, this.yaw).add(sh);
    const pr = G.phys.nearest?.(to.x, to.y, to.z, HAND_BLOCK, col => {
      const info = G.phys.info(col);
      return info?.kind !== 'prop' || info.ref?.heldBy !== G.myId;
    });
    if (!pr) return;
    const n = V4.set(to.x - pr.x, to.y - pr.y, to.z - pr.z);
    let d = n.length();
    if (pr.inside) {
      // adentro: hacia afuera es de la mano a la superficie
      n.negate();
      if (d < 1e-5) return;
      n.divideScalar(d);
    } else {
      if (d >= HAND_R || d < 1e-6) return;
      n.divideScalar(d);
    }
    to.set(pr.x, pr.y, pr.z).addScaledVector(n, HAND_R);
    a.p.copy(to).sub(sh).applyAxisAngle(UP, -this.yaw);
    const nl = n.applyAxisAngle(UP, -this.yaw);
    const vIn = a.v.dot(nl);
    if (vIn < 0) a.v.addScaledVector(nl, -vIn);
  }

  // Punto objetivo de la mano para el IK (mundo) o null si manda la animación
  _armWorld(side, out, alpha = 1) {
    const a = this.arm[side];
    if (!a.ready || a.w <= 0.001) return null;
    const sh = this.rig.shoulderWorld(side, V1);
    out.copy(a.pp).lerp(a.p, alpha);
    if (a.w < 1) out.lerp(a.idle, 1 - a.w);
    return out.applyAxisAngle(UP, this.yaw).add(sh);
  }

  // ---------------------------------------------------------------- física
  physicsStep(dt, viewYaw) {
    if (!G.inGame) return;
    this.viewYaw = viewYaw;
    const st = this.state;
    const input = G.input;
    const active = input.enabled && input.locked;
    if (st !== 'driving') { this._gripPull(dt); this._gripTug(dt); }
    if (st === 'active' || st === 'stun' || st === 'getup') {
      const f = active ? (input.key('KeyW') ? 1 : 0) - (input.key('KeyS') ? 1 : 0) : 0;
      const s = active ? (input.key('KeyD') ? 1 : 0) - (input.key('KeyA') ? 1 : 0) : 0;
      const fx = Math.sin(viewYaw), fz = Math.cos(viewYaw);
      const rx = -Math.cos(viewYaw), rz = Math.sin(viewYaw);
      let dx = fx * f + rx * s, dz = fz * f + rz * s;
      const length = Math.hypot(dx, dz);
      if (length > 0) { dx /= length; dz /= length; }
      // borracho: se va de costado
      if (this.drunk > 0.3 && length > 0) {
        const w = Math.sin(G.time * 1.3) * this.drunk * 0.45;
        const ndx = dx * Math.cos(w) - dz * Math.sin(w), ndz = dx * Math.sin(w) + dz * Math.cos(w);
        dx = ndx; dz = ndz;
      }
      const run = active && (input.key('ShiftLeft') || input.key('ShiftRight'));
      const wantCrouch = active && (input.key('ControlLeft') || input.key('ControlRight')) && st === 'active';
      if (wantCrouch && !this.crouched && run && this.grounded && this.velocity.length() > 4.5) this.slideT = .65;
      this.slideT = Math.max(0, (this.slideT || 0) - dt);
      this._crouch(wantCrouch || this.slideT > 0);
      const slow = st === 'stun' ? 0.3 : st === 'getup' ? 0.15 : 1;
      // cargar algo pesado o estar en guardia te hace más lento
      const load = clamp(1 - (this._heldMass('l') + this._heldMass('r')) / 30, 0.55, 1) * (this.guard ? 0.7 : 1);
      const legGone = this.gore & ((1 << PART.THIGH_L) | (1 << PART.SHIN_L) | (1 << PART.THIGH_R) | (1 << PART.SHIN_R));
      const limp = legGone ? 0.38 : 1;
      const targetSpeed = (this.crouched ? 1.8 : run && !this.guard && !legGone ? 6.8 : 3.9) * (1 - clamp(this.drunk, 0, 1) * 0.2) * slow * load * limp;
      const blend = 1 - Math.exp(-(length ? 14 : 20) * dt);
      if (this.slideT > 0) this.velocity.multiplyScalar(Math.exp(-1.8 * dt));
      else {
        this.velocity.x += (dx * targetSpeed - this.velocity.x) * blend;
        this.velocity.y += (dz * targetSpeed - this.velocity.y) * blend;
      }
      if (!active) this.velocity.set(0, 0);
      const diff = angleDiff(this.yaw, viewYaw);
      const busy = length > 0 || this.action || this.armActive() || this.guard || this.arm.l.script || this.arm.r.script
        || this.hands.r.item === 'spray' || this.hands.r.joint || this.hands.l.joint;
      if (active && busy) this.yaw = dampAngle(this.yaw, viewYaw, 12, dt);
      else if (active && Math.abs(diff) > 1.15) this.yaw = dampAngle(this.yaw, viewYaw - Math.sign(diff) * 1.0, 6, dt);
      this.coyote = this.grounded ? 0.09 : Math.max(0, this.coyote - dt);
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      if (active && this.coyote > 0 && this.jumpBuffer > 0 && st === 'active') {
        this.vy = 5.6; this.grounded = false; this.coyote = 0; this.jumpBuffer = 0;
      }
      this.vy = Math.max(-22, this.vy - 15.5 * dt);
      // peso: el cuerpo se inclina al acelerar/frenar y hacia adentro al girar
      const ax = (this.velocity.x - (this._pvx ?? this.velocity.x)) / dt, az = (this.velocity.y - (this._pvz ?? this.velocity.y)) / dt;
      this._pvx = this.velocity.x; this._pvz = this.velocity.y;
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      // el cuerpo se inclina hacia donde acelera (al arrancar adelante, al frenar atrás, al doblar corriendo hacia
      // adentro de la curva) con resortes subamortiguados: se pasa un poco y vuelve. Antes era un filtro plano
      const tx = clamp((ax * sy + az * cy) * 0.02, -0.22, 0.22), tz = clamp(-(ax * cy - az * sy) * 0.016, -0.2, 0.2);
      const w = 9, z = 0.42;
      this.leanV.x += ((tx - this.lean.x) * w * w - 2 * z * w * this.leanV.x) * dt;
      this.leanV.y += ((tz - this.lean.y) * w * w - 2 * z * w * this.leanV.y) * dt;
      this.lean.x = clamp(this.lean.x + this.leanV.x * dt, -0.3, 0.3);
      this.lean.y = clamp(this.lean.y + this.leanV.y * dt, -0.26, 0.26);
      // empujón de un golpe (trastabillar) o de una piña propia: se suma y se apaga solo
      const pk = Math.exp(-4.5 * dt);
      this.push.multiplyScalar(pk);
      this._crowd(dt);
      let mx = this.velocity.x + this.push.x + this._gripV.x, mz = this.velocity.y + this.push.y + this._gripV.y;
      // encimado con alguien: no puedo seguir metiéndome (se anula lo que va hacia él) y me separo
      const ns = this._sepN;
      for (let i = 0; i < ns.length; i += 2) {
        const into = mx * ns[i] + mz * ns[i + 1];
        if (into < 0) { mx -= ns[i] * into; mz -= ns[i + 1] * into; }
      }
      const desired = { x: (mx + this._sepV.x) * dt, y: this.vy * dt, z: (mz + this._sepV.y) * dt };
      // solo mundo y vehículos: sin filtro, el controlador chocaba con el propio ragdoll (piernas) y trababa el paso
      this.controller.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, ns.length ? KCC_NO_PAWN : KCC_GROUPS);
      const mv = this.controller.computedMovement();
      const tr = this.body.translation();
      const nx = clamp(tr.x + mv.x, MAP_BOUNDS.x0 + 1, MAP_BOUNDS.x1 - 1);
      const nz = clamp(tr.z + mv.z, MAP_BOUNDS.z0 + 1, MAP_BOUNDS.z1 - 1);
      this.body.setNextKinematicTranslation({ x: nx, y: tr.y + mv.y, z: nz });
      const wasGrounded = this.grounded;
      this.grounded = this.vy <= 0 && this.controller.computedGrounded() === true;
      if (!this.grounded) this.fallPeak = Math.min(this.fallPeak, this.vy);
      if (this.grounded) {
        // al caer de un salto las rodillas ceden (más cuanto más fuerte cae) y vuelven con un rebotito
        if (!wasGrounded && this.fallPeak < -2.5) this.landV += Math.min(6.5, -this.fallPeak * 0.9);
        // caída fuerte: aturde o desmaya
        if (!wasGrounded && this.fallPeak < -11) {
          const sev = (-this.fallPeak - 11) / 5;
          this.damage(sev * 25);
          if (!this.dead) this._vocal(sev > 0.6 ? 'scream' : 'hurt');
          if (sev > 0.6) this.knockout(2 + sev * 2); else this.stun(0.6);
          this.onEvent?.('impact', { part: 0, s: sev, kind: 'blunt', src: 'world', x: this.pos.x, y: this.pos.y, z: this.pos.z, nx: 0, ny: 1, nz: 0 });
        }
        this.fallPeak = 0;
        this.vy = 0;
      }
      if (desired.y > 0 && mv.y < desired.y - 0.002) this.vy = 0;
      this.speed = Math.hypot(nx - tr.x, nz - tr.z) / dt;
      this.fwdSpeed = ((nx - tr.x) * fx + (nz - tr.z) * fz) / dt;
    } else if (st === 'ko' || st === 'dead') {
      // el controlador sigue al cuerpo tirado (la cámara lo acompaña)
      const pt = this.rag.pelvis().translation();
      this.body.setNextKinematicTranslation({ x: pt.x, y: this.bodyY + 0.02, z: pt.z });
      this.velocity.set(0, 0);
      this.speed = 0;
      this.vy = 0;
    } else if (st === 'seated') {
      // sentado: el cuerpo gira un poco con la mirada (brazos y cabeza hacia donde mirás)
      const lim = this.seat?.poker ? 0.5 : 0.9;
      const want = (this.seat?.yaw ?? this.yaw) + clamp(angleDiff(this.seat?.yaw ?? this.yaw, viewYaw), -lim, lim);
      if (input.enabled && input.locked) this.yaw = dampAngle(this.yaw, want, 6, dt);
    }

    // pose objetivo (con los brazos avanzando un paso)
    const tr = this.body.translation();
    const base = V6.set(tr.x, tr.y - this.bodyY, tr.z);
    if (st === 'seated' || st === 'driving') base.copy(this.pos);
    this._poseRig(base, dt);
    this.targets = this.rig.compute();
    // lo que está firme en la mano va con la mano (y el filo barre los golpes)
    if (this.physMode === 'anim') this._driveHeld(dt);

    if (this.physMode === 'anim') {
      // de pie: el cuerpo físico sigue exacto a la animación (empuja cosas y recibe golpes)
      this.rag.follow(this.rig.transforms(), dt);
    } else {
      this.rag.balance = 1 - clamp(this.drunk - 0.3, 0, 1) * 0.55;
      const root = { pos: this.targets[0].p, vel: V2.set(this.velocity.x, this.vy, this.velocity.y), support: 1 };
      this.rag.drive(dt, this.targets, root, this.strength);
    }
  }

  // Pose del esqueleto objetivo en `base`: animación del frame + ajustes + brazos (IK)
  // dt > 0: paso de física (las manos avanzan); dt = 0: dibujo (se interpolan)
  _poseRig(base, dt = 0) {
    if (this._base) for (let i = 0; i < 11; i++) this.rig.joints[i].quaternion.copy(this._base[i]);
    this.rig.resetShoulders();
    if (this.land > 1e-3 && this.grounded && this.state !== 'seated' && this.state !== 'driving') base = V2.copy(base).setY(base.y - this.land * 0.11);
    if (this.crouched && ['active', 'stun', 'getup'].includes(this.state)) base = base.clone().setY(base.y - .38 * ((this.meta.height || 1.8) / 1.8));
    this.rig.place(base, this.yaw);
    this._overrides();
    // agarrado: la parte que me tienen va hacia la mano del otro (la cabeza se dobla, la pierna se levanta)
    if (this.grabbedBy.size && this.physMode === 'anim') {
      for (const g of this.grabbedBy.values()) {
        for (const [j, frac, max] of GRIP_CHAIN[g.part] || []) this.rig.pullToward(j, g.part, g.anchor, g.hand, frac, max);
      }
    }
    this.rig.root.updateMatrixWorld(true);
    for (const side of ['l', 'r']) this._animHandLocal(side, this.arm[side].idle);
    if (dt > 0 && this.physMode === 'anim') this._stepArms(dt);
    const alpha = dt > 0 ? 1 : G.phys?.alpha ?? 1;
    for (const side of ['l', 'r']) {
      const t = this._armWorld(side, V4, alpha);
      if (t) this.rig.reach(side, t);
    }
    if (!this._poseContacts || this._poseContactMeta !== this.meta) { this._poseContacts = new PoseContact(this); this._poseContactMeta = this.meta; }
    this._poseContacts.limit(dt);
  }

  // Ajustes de pose que no están en el animador (peso, respingos, trastabillar, cabezazo, brazos)
  _overrides() {
    const J = this.rig.joints;
    if (this.crouched && ['active', 'stun', 'getup'].includes(this.state)) {
      for (const [hip, knee] of [[7, 8], [9, 10]]) {
        J[hip].quaternion.setFromEuler(E1.set(-1, 0, 0));
        J[knee].quaternion.setFromEuler(E1.set(2, 0, 0));
      }
      J[1].quaternion.multiply(Q1.setFromEuler(E1.set(this.slideT > 0 ? -.12 : .22, 0, 0)));
    }
    if (this.state !== 'seated' && this.state !== 'driving') {
      // peso e inercia: inclinación del torso al acelerar/girar; la cabeza compensa la mitad (mira al frente)
      const px = this.lean.x, pz = this.lean.y;
      if (Math.abs(px) + Math.abs(pz) > 1e-3) {
        J[1].quaternion.multiply(Q1.setFromEuler(E1.set(px, 0, pz)));
        J[2].quaternion.multiply(Q1.setFromEuler(E1.set(-px * 0.5, 0, -pz * 0.5)));
      }
      // cayendo de un salto: caderas y rodillas ceden, el torso se inclina un poco adelante
      if (this.land > 1e-3 && this.grounded) {
        const k = this.land;
        for (const [hi, kn] of [[7, 8], [9, 10]]) {
          J[hi].quaternion.multiply(Q1.setFromEuler(E1.set(-0.55 * k, 0, 0)));
          J[kn].quaternion.multiply(Q1.setFromEuler(E1.set(1.1 * k, 0, 0)));
        }
        J[1].quaternion.multiply(Q1.setFromEuler(E1.set(0.3 * k, 0, 0)));
      }
      // trastabillando: los brazos se sueltan y se sacuden buscando equilibrio (adelante, un poco afuera y con los
      // codos doblados; antes quedaban horizontales y parecía una pose T) y el torso se va con el empujón
      if (this.state === 'stun') {
        const k = clamp(this.stunT / 0.45, 0, 1), t = G.time;
        const wl = Math.sin(t * 9.3) * 0.28 + Math.sin(t * 15.1) * 0.1, wr = Math.sin(t * 8.1 + 1.9) * 0.28 + Math.sin(t * 13.7 + 0.4) * 0.1;
        if (!this.arm.l.busy) {
          J[3].quaternion.multiply(Q1.setFromEuler(E1.set((-0.45 + wl) * k, 0, (0.38 + wl * 0.4) * k)));
          J[4].quaternion.multiply(Q1.setFromEuler(E1.set(-0.7 * k, 0, 0)));
        }
        if (!this.arm.r.busy) {
          J[5].quaternion.multiply(Q1.setFromEuler(E1.set((-0.45 + wr) * k, 0, -(0.38 + wr * 0.4) * k)));
          J[6].quaternion.multiply(Q1.setFromEuler(E1.set(-0.7 * k, 0, 0)));
        }
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const pa = this.push.x * fx + this.push.y * fz, pl = this.push.x * fz - this.push.y * fx;
        J[1].quaternion.multiply(Q1.setFromEuler(E1.set(clamp(pa * 0.07, -0.3, 0.3) * k, 0, clamp(ROLL * pl * 0.07, -0.25, 0.25) * k)));
      }
    }
    // los brazos arrastran el torso: la piña sale del hombro, el swing gira la cintura
    const tw = torsoTwist(this.arm), ln = torsoLean(this.arm) + (this.guard ? 0.1 : 0);
    if (Math.abs(tw) + ln > 1e-3) J[1].quaternion.multiply(Q1.setFromEuler(E1.set(ln, tw, 0)));
    if (this.action === 'headbutt') {
      const p = clamp(this.actionT / 0.42, 0, 1);
      const k = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
      this.rig.joints[1].quaternion.multiply(Q1.setFromAxisAngle(V1.set(1, 0, 0), 0.55 * k));
      this.rig.joints[2].quaternion.multiply(Q1.setFromAxisAngle(V1.set(1, 0, 0), 0.5 * k));
    }
  }

  afterPhysics() {
    this.rag.snapshot();
    // punta del pie derecho (la de la patada) y su velocidad
    const sb = this.rag.bodies[PART.SHIN_R], cap = this.meta.caps?.[PART.SHIN_R];
    if (sb && cap) {
      const t = sb.translation(), r = sb.rotation();
      const tip = V6.copy(cap.b).applyQuaternion(Q1.set(r.x, r.y, r.z, r.w)).add(V1.set(t.x, t.y, t.z));
      if (this._footPrev) this._footVel.copy(tip).sub(this._footPrev).multiplyScalar(60);
      (this._footPrev || (this._footPrev = new THREE.Vector3())).copy(tip);
    }
    const tr = this.body.translation();
    this.previousPos.copy(this.pos);
    if (this.state !== 'seated' && this.state !== 'driving') this.pos.set(tr.x, tr.y - this.bodyY, tr.z);
    if (this.pos.y < -15 || !Number.isFinite(this.pos.y)) { this.respawn(); return; }
    if (this.state === 'driving') return;
    if (this.physMode === 'rag') this._scanContacts();
    else this._scanHitsKinematic();
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    // máquina de estados
    switch (this.state) {
      case 'stun':
        this.stunT -= dt;
        this.strength = 1 - 0.7 * clamp(this.stunT / 0.7, 0, 1);
        if (this.stunT <= 0) { this.state = 'active'; this.strength = 1; }
        break;
      case 'ko':
        this.koT -= dt;
        this.strength = this.held > 0 ? 0.35 : 0.02;
        // sin las dos piernas no hay forma de pararse
        const noLegs = (this.gore & ((1 << PART.THIGH_L) | (1 << PART.SHIN_L))) && (this.gore & ((1 << PART.THIGH_R) | (1 << PART.SHIN_R)));
        if (!noLegs && this.koT <= (this.held > 0 ? -1.2 : 0)) this._startGetup();
        break;
      case 'getup':
        this.getupT += dt;
        this.strength = 1;
        if (this.getupT > 0.85) { this.state = 'active'; this.strength = 1; }
        break;
      case 'dead':
        this.deadT += dt;
        this.strength = 0;
        break;
      default:
        this.strength = 1;
    }
    // piernas: en el piso solo cuando está tirado
    const legsGround = this.state === 'ko' || this.state === 'dead';
    if (legsGround !== this._legsGround) {
      this._legsGround = legsGround;
      for (const k of LEGS) this.rag.setPartFilter(k, legsGround ? RAG_FILTER : LEG_FILTER_UP);
    }
    // desangrándose (miembros cortados, tripas afuera): el chorro se va cortando solo en ~15-20 s
    if (this.immortal) this.bleedRate = 0;
    if (this.bleedRate > 0 && !this.dead) {
      this.hp -= this.bleedRate * dt;
      this.bleedRate = Math.max(0, this.bleedRate - dt * 0.13);
      this.lastHurtT = G.time;
      if (this.hp <= 0) { this.hp = 0; this.die(); }
    }
    // se recupera solo: equilibrio siempre; vida y sangre si hace 5 s que nadie te pega (sentado, más rápido)
    if (!this.dead) {
      // agarrado se recupera más lento (el que te tiene no te deja acomodarte)
      this.balance = Math.min(100, this.balance + dt * (this.state === 'ko' ? 30 : this.held ? 8 : 16));
      const calm = G.time - this.lastHurtT > 5 && this.bleedRate <= 0 && this.state !== 'ko';
      if (calm) {
        const k = this.state === 'seated' ? 4 : 1.6;
        this.hp = Math.min(100, this.hp + dt * k);
        this.blood = Math.min(100, this.blood + dt * k * 0.7);
      }
    }
    // demasiado alcohol: se desmaya
    if (this.drunk > 1.32 && (this.state === 'active' || this.state === 'seated')) {
      this.knockout(9);
      this.drunk = 1.05;
      this.onEvent?.('passout', {});
    }
    // rodillas al caer: resorte hacia 0
    if (this.land || this.landV) {
      this.landV += (-this.land * 160 - this.landV * 13) * dt;
      this.land = clamp(this.land + this.landV * dt, 0, 0.9);
      if (this.land === 0 && this.landV < 0) this.landV = 0;
      if (Math.abs(this.land) + Math.abs(this.landV) < 1e-3) { this.land = 0; this.landV = 0; }
    }
    // hit-stop: lo que acaba de pegar se frena un instante (el golpe "entra")
    const hs = this.hitStop > 0 ? 0.12 : 1;
    this.hitStop = Math.max(0, this.hitStop - dt);
    if (this.action) {
      this.actionT += dt * hs;
      if (this.actionT >= this.actionDur) { this.action = null; this.actionT = 0; }
    }
    if (this.emote) {
      this.emoteT += dt;
      if (this.emoteT > 8 && !['dance1', 'dance2', 'dance3', 'sitfloor'].includes(this.emote)) this.emote = null;
      if (this.speed > 0.5 || this.state !== 'active') this.emote = null;
    }
    if (this.physMode === 'rag') this.react.reset(); else this.react.update(dt);
    this.drunk = Math.max(0, this.drunk - dt * 0.006);
    this.high = Math.max(0, this.high - dt * 0.004);
    this.headYaw = clamp(angleDiff(this.yaw, this.viewYaw), -1.35, 1.35);
    // animación objetivo
    const rigAction = ['drink-arm', 'headbutt', 'eat'].includes(this.action) ? null : this.action;
    this.rig.animate({
      speed: this.state === 'ko' || this.state === 'dead' ? 0 : this.speed,
      fwdSpeed: this.fwdSpeed,
      grounded: this.grounded || this.state === 'seated' || this.state === 'driving',
      vy: this.vy,
      action: rigAction,
      actionT: this.actionT,
      aimPitch: this.aimPitch,
      headYaw: this.headYaw,
      held: this.hands.r.item ? 'item' : this.hands.r.prop ? 'weapon' : null,
      drunk: this.drunk,
      high: this.high,
      drive: this.state === 'driving',
      sit: this.state === 'seated',
      table: !!this.seat?.poker, // sentado a la mesa: torso apenas hacia adelante (las manos van con IK a la mesa)
      steer: this.vehicle?.steer || 0,
      emote: this.emote,
      emoteT: this.emoteT,
    }, dt);
    // pose animada base de este frame (los pasos de física la reusan)
    if (!this._base) this._base = this.rig.joints.map((j) => j.quaternion.clone());
    else for (let i = 0; i < 11; i++) this._base[i].copy(this.rig.joints[i].quaternion);
    this.renderPos.copy(this.previousPos).lerp(this.pos, G.phys.alpha);
    if (this.char.gripOn) this.char.gripOn.l = this.char.gripOn.r = false;
    if (this.char.gripRadius) { this.char.gripRadius.l = this.char.gripRadius.r = 0; this.char.gripShape.l = this.char.gripShape.r = null; }
    this._visual(dt);
    this._shareGrips();
    this.char.setIntox(this.drunk, this.high);
    this.char.talk = this.talk;
    const fist = (a) => a.on || a.script === 'punch' || a.script === 'swing' || this.guard;
    // la mano se cierra según lo que tiene: puño en un mango, a medias en una lata o el borde de una silla
    const curl = (side) => { const h = this.hands[side]; return h.prop ? curlOf(G.props?.get(h.prop)?.type) : h.joint === PLAYER_GRIP ? 0.85 : null; };
    this.char.grip.r = curl('r') ?? (this.hands.r.item || this.hands.r.joint || fist(this.arm.r) || this.arm.r.script ? 1 : 0.3);
    this.char.grip.l = curl('l') ?? (this.hands.l.joint || fist(this.arm.l) || this.arm.l.script ? 1 : 0.3);
    this.char.update(dt);
    const eqSlot = { beer: 1, smoke: 2, spray: 3 }[this.hands.r.item] || 4;
    this.equipment?.update(this.char, eqSlot, this.yaw, this.action === 'drink-arm' ? 'drink' : this.action, this.actionT, this.dead);
  }

  _syncVisual() {
    this._visual(0);
    this.char.update(0);
    return true;
  }

  // Lo que se ve: de pie la animación (suave, a la posición interpolada); tirado, el cuerpo físico;
  // al levantarse se mezcla de la pose tirada a la animada.
  _visual(dt) {
    if (this.physMode === 'rag') {
      this.rag.interpolated(G.phys.alpha, this._pose);
    } else {
      const seatedOrDriving = this.state === 'seated' || this.state === 'driving';
      this._poseRig(seatedOrDriving ? this.pos : this.renderPos);
      this._showHeld();
      const tr = this.rig.transforms();
      const from = this.blendT < 1 ? this._blendFrom : null;
      const b = from ? this.blendT * this.blendT * (3 - 2 * this.blendT) : 1;
      for (let i = 0; i < 11; i++) {
        const o = this._pose[i] || (this._pose[i] = new Array(7));
        const t = tr[i];
        if (!from) { for (let k = 0; k < 7; k++) o[k] = t[k]; continue; }
        const f = from[i];
        o[0] = f[0] + (t[0] - f[0]) * b; o[1] = f[1] + (t[1] - f[1]) * b; o[2] = f[2] + (t[2] - f[2]) * b;
        Q1.set(f[3], f[4], f[5], f[6]).slerp(Q2.set(t[3], t[4], t[5], t[6]), b);
        o[3] = Q1.x; o[4] = Q1.y; o[5] = Q1.z; o[6] = Q1.w;
      }
      if (this.blendT < 1) this.blendT = Math.min(1, this.blendT + dt / 0.75);
      if (this.react.active) {
        const rp = this._rpose;
        for (let i = 0; i < 11; i++) { const o = rp[i] || (rp[i] = new Array(7)), t = this._pose[i]; for (let k = 0; k < 7; k++) o[k] = t[k]; }
        this.react.apply(rp);
        this._followHeld(this._pose, rp);
        this.char.applyWorldTransforms(rp);
        return;
      }
    }
    this.char.applyWorldTransforms(this._pose);
  }

  // Mis manos que tienen a alguien: su cuerpo dibujado (en MI pantalla) va pegado a mi mano en este cuadro
  _shareGrips() {
    for (const side of ['l', 'r']) {
      const h = this.hands[side];
      if (h.joint !== PLAYER_GRIP || !h.anchor) continue;
      const rp = G.players.get(h.player);
      if (!rp) continue;
      const hand = this._handDrawn(side, (h._drawn || (h._drawn = new THREE.Vector3())));
      (rp.gripViews || (rp.gripViews = [])).push({ part: h.part, anchor: h.anchor, hand });
    }
  }
  // palma de la mano tal como se dibuja (si el personaje no la sabe, la del cuerpo físico)
  _handDrawn(side, out) {
    const w = this.char.partToWorld?.(side === 'l' ? PART.FARM_L : PART.FARM_R, this.meta.gripLocal[side], out);
    return w && Number.isFinite(w.x) ? w : this.handPos(side, out);
  }

  // Lo que tengo firme en la mano acompaña a la mano cuando el cuerpo reacciona a un golpe
  _followHeld(from, to) {
    for (const { p, side } of this._heldList()) {
      const i = side === 'l' ? 4 : 6, a = from[i], b = to[i];
      Q1.set(b[3], b[4], b[5], b[6]).multiply(Q2.set(a[3], a[4], a[5], a[6]).invert());
      p.group.position.sub(V1.set(a[0], a[1], a[2])).applyQuaternion(Q1).add(V1.set(b[0], b[1], b[2]));
      p.group.quaternion.premultiply(Q1);
    }
  }

  // banderas de ataque para los demás (qué partes pegan ahora)
  attackFlags() {
    let af = 0;
    if (this.arm.l.armed > 0) af |= 1;
    if (this.arm.r.armed > 0) af |= 2;
    if (this.action === 'kick') af |= 4;
    if (this.action === 'headbutt') af |= 8;
    if (this.guard) af |= 16;
    return af;
  }

  // ---------------------------------------------------------------- red
  netState() {
    const rb = [];
    const pose = this._pose.length === 11 ? this._pose : this.rag.cur;
    for (const t of pose) rb.push(r3(t[0]), r3(t[1]), r3(t[2]), r3(t[3]), r3(t[4]), r3(t[5]), r3(t[6]));
    return {
      p: [r3(this.pos.x), r3(this.pos.y), r3(this.pos.z)],
      y: r3(this.yaw),
      sp: r3(this.speed),
      eq: { beer: 1, smoke: 2, spray: 3 }[this.hands.r.item] || 4,
      hd: this.hands.r.prop || 0,
      hl: this.hands.l.prop || 0,
      // con las dos manos: cuál manda (los demás calculan la pose del arma desde esa mano)
      tw: this.hands.r.prop && this.hands.r.prop === this.hands.l.prop ? (G.props?.get(this.hands.r.prop)?.hold?.side || 'r') : 0,
      ap: r3(this.aimPitch),
      hy: r3(this.headYaw),
      g: this.grounded ? 1 : 0,
      ac: this.action,
      at: r3(this.actionT),
      em: this.emote,
      et: r3(this.emoteT),
      dr: r3(this.drunk),
      hi: r3(this.high),
      hp: Math.round(this.hp),
      veh: this.vehicle?.id || 0,
      s: STATE_CODE[this.state] ?? 0,
      gr: (this.char.grip.l > 0.6 ? 1 : 0) | (this.char.grip.r > 0.6 ? 2 : 0),
      af: this.attackFlags(),
      tk: r3(this.talk),
      sv: this.gore,
      rb,
    };
  }

  dispose() {
    this.releaseAll();
    this._clearGrips(false);
    this.rag.destroy();
    G.phys.untag(this.collider);
    G.phys.world.removeCharacterController(this.controller);
    try { G.phys.world.removeCollider(this.collider, true); } catch { /* */ }
    try { G.phys.world.removeRigidBody(this.body); } catch { /* */ }
    this.equipment?.dispose();
    this.char.dispose();
  }
}

// ====================================================================== REMOTO
export class RemotePlayer {
  constructor(data) {
    this.id = data.id;
    this.name = data.name || 'Jugador';
    this.color = data.color || '#ffffff';
    this.look = data.look || {};
    this.char = new HumanCharacter(this.look);
    Object.assign(this,movementSize(this.char.meta));
    this.char.root.name = `remote-${this.id}`;
    G.scene.add(this.char.root);
    this.equipment = new EquipmentView(G.scene);
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.yaw = 0;
    this.targetYaw = 0;
    this.stateData = data.st || null;
    this.hp = 100;
    this.buf = []; // [{t, rb:Float32Array}]
    this.afHist = []; // [{t, af}] banderas de ataque recientes (el cuerpo se ve 110 ms atrasado)
    this.proxy = new Ragdoll(G.phys, this.char.meta, {
      kinematic: true, member: GR.REMOTE, filter: PROXY_FILTER, tag: { kind: 'remote', id: this.id, ref: this },
    });
    // cápsula de movimiento (como la mía): mi controlador choca contra ella, así no nos atravesamos
    this.body = G.phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
    this.pawn = G.phys.world.createCollider(RAPIER.ColliderDesc.capsule(this.capsuleHalf, this.capsuleRadius - 0.02)
      .setCollisionGroups(groups(GR.PAWN, GR.ME | GR.VEHICLE)), this.body);
    G.phys.tag(this.pawn, { kind: 'pawn', ref: this });
    this.vel = new THREE.Vector3(); // velocidad (de la cápsula) para el empujón entre cuerpos
    this.react = new HitReact(); // reacción a los golpes (la simulo yo: al instante si el golpe es mío)
    this._pose = [];
    this.talk = 0;
    if (data.st) this.applyState(data.st, true);
  }

  // de pie ocupa lugar; tirado, sentado o manejando, no (se puede pasar por arriba o al lado)
  get standing() { const s = this.stateData?.s ?? 0; return s === 0 || s === 1 || s === 4; }

  setLook(look) {
    const meta = this.char.meta;
    this.look = { ...look };
    this.char.setLook(this.look);
    if (meta !== this.char.meta) {
      Object.assign(this,movementSize(this.char.meta));
      this.pawn.setShape(new RAPIER.Capsule(this.capsuleHalf,this.capsuleRadius-.02));
      this.proxy.destroy();
      this.proxy.meta = this.char.meta;
      this.proxy.totalMass = this.char.meta.mass.reduce((a,b) => a+b, 0);
      // Old snapshots belong to the previous skeleton. Rebuild the proxy when
      // a fresh pose arrives, instead of interpolating between body sizes.
      this.buf.length = 0;
      this._pose.length = 0;
    }
  }

  get stateName() { return CODE_STATE[this.stateData?.s ?? 0] || 'active'; }

  // ¿Esa parte del otro está pegando en el instante en que la vemos?
  isArmedPart(part) {
    const bit = ARMED_PART[part] || 0;
    if (!bit) return false;
    const renderT = (G.net ? G.net.now() : performance.now()) - 110;
    for (const h of this.afHist) if (h.t >= renderT - 220 && h.t <= renderT + 260 && (h.af & bit)) return true;
    return false;
  }

  applyState(st, immediate = false, ts = 0) {
    if (!st) return;
    this.stateData = st;
    if (Array.isArray(st.p)) this.target.set(+st.p[0] || 0, +st.p[1] || 0, +st.p[2] || 0);
    this.targetYaw = Number.isFinite(+st.y) ? +st.y : this.targetYaw;
    this.hp = Number.isFinite(+st.hp) ? +st.hp : this.hp;
    const sv = (st.sv | 0) & 0x1fff;
    if (sv !== (this.sv | 0)) this._applyGore(this.sv | 0, sv, immediate);
    const t = ts || (G.net ? G.net.now() : performance.now());
    this.afHist.push({ t, af: st.af | 0 });
    if (this.afHist.length > 16) this.afHist.shift();
    if (Array.isArray(st.rb) && st.rb.length === 77) {
      if (this.buf.length && t <= this.buf[this.buf.length - 1].t) return;
      this.buf.push({ t, rb: st.rb });
      if (this.buf.length > 20) this.buf.shift();
      if (!this.proxy.alive) {
        const tr = [];
        for (let i = 0; i < 11; i++) tr.push(st.rb.slice(i * 7, i * 7 + 7));
        this.proxy.build(tr);
      }
    }
    if (immediate) {
      this.pos.copy(this.target);
      this.yaw = this.targetYaw;
    }
  }

  // Gore de otro jugador (lo decide su dueño; acá solo se ve y se simulan los pedazos)
  _applyGore(prev, sv, immediate) {
    this.sv = sv;
    const gore = G.gore;
    if (!gore) return;
    if (!sv || (prev & ~sv)) {
      // reapareció: cuerpo entero otra vez
      if (this.proxy.alive) gore.detachFrom(this.proxy.bodies[PART.TORSO]);
      gore.restore(this.char);
      if (this.proxy.alive) for (let k = 0; k < 11; k++) this.proxy.setPartCollide(k, true);
      prev = 0;
    }
    const added = sv & ~prev;
    if (!added) return;
    const vel = new THREE.Vector3(Math.random() - 0.5, 1.2, Math.random() - 0.5).multiplyScalar(2.5);
    if (added & GORE_HEAD_POP) {
      if (immediate) gore.sever(this.char, PART.HEAD, { gib: false });
      else gore.explodeHead(this.char, { vel });
    }
    for (let k = 0; k < 11; k++) {
      if (!(added & (1 << k))) continue;
      gore.sever(this.char, k, { vel, gib: !immediate });
      if (this.proxy.alive) for (const c of branchOf(k)) this.proxy.setPartCollide(c, false);
    }
    if ((added & GORE_GUTS) && !immediate && this.proxy.alive) {
      const pt = this.char.partToWorld(PART.TORSO, V1.set(0, -0.12, 0.13), new THREE.Vector3());
      const fwd = new THREE.Vector3(Math.sin(this.yaw), -0.2, Math.cos(this.yaw));
      gore.spillGuts(this.proxy.bodies[PART.TORSO], pt, fwd);
    }
  }

  _interp(renderT) {
    const b = this.buf;
    if (!b.length) return null;
    let a = b[0], c = b[b.length - 1];
    if (renderT <= a.t) c = a;
    else if (renderT >= c.t) a = c;
    else {
      for (let i = 0; i < b.length - 1; i++) {
        if (b[i].t <= renderT && b[i + 1].t >= renderT) { a = b[i]; c = b[i + 1]; break; }
      }
    }
    const k = c.t > a.t ? clamp((renderT - a.t) / (c.t - a.t), 0, 1) : 1;
    const out = this._pose;
    for (let i = 0; i < 11; i++) {
      const o = out[i] || (out[i] = new Array(7));
      const j = i * 7;
      o[0] = a.rb[j] + (c.rb[j] - a.rb[j]) * k;
      o[1] = a.rb[j + 1] + (c.rb[j + 1] - a.rb[j + 1]) * k;
      o[2] = a.rb[j + 2] + (c.rb[j + 2] - a.rb[j + 2]) * k;
      Q1.set(a.rb[j + 3], a.rb[j + 4], a.rb[j + 5], a.rb[j + 6]).normalize();
      Q2.set(c.rb[j + 3], c.rb[j + 4], c.rb[j + 5], c.rb[j + 6]).normalize();
      Q1.slerp(Q2, k);
      o[3] = Q1.x; o[4] = Q1.y; o[5] = Q1.z; o[6] = Q1.w;
    }
    return out;
  }

  update(dt) {
    const k = 1 - Math.exp(-14 * dt);
    this.pos.lerp(this.target, k);
    this.yaw = dampAngle(this.yaw, this.targetYaw, 14, dt);
    const s = this.stateData || {};
    this.char.setIntox(s.dr || 0, s.hi || 0);
    this.char.expr.dead = s.s === 3;
    this.char.talk = Math.max(this.talk, s.tk || 0);
    const renderT = (G.net ? G.net.now() : performance.now()) - 110;
    const pose = this.buf.length ? this._interp(renderT) : null;
    // cápsula de movimiento: donde está su cuerpo DIBUJADO (la pose va 110 ms atrás de la última posición
    // que llegó; con la cápsula adelantada, los empujones pasaban antes de que el cuerpo llegara)
    const bp = this.bodyPos || (this.bodyPos = this.pos.clone());
    const bx = bp.x, bz = bp.z;
    if (pose) bp.set(pose[0][0], this.pos.y, pose[0][2]); else bp.copy(this.pos);
    if (dt > 0) this.vel.set((bp.x - bx) / dt, 0, (bp.z - bz) / dt);
    const on = this.standing;
    if (this.pawn.isEnabled() !== on) this.pawn.setEnabled(on);
    if (on) this.body.setNextKinematicTranslation({ x: bp.x, y: this.pos.y + this.bodyY, z: bp.z });
    // la reacción a los golpes va sobre la pose que llega (de pie o sentado; tirado ya es física)
    this.react.update(dt);
    if (pose && (this.standing || s.s === 5)) this.react.apply(pose);
    // lo tengo agarrado: en mi pantalla la parte va pegada a mi mano ya; su cliente lo mueve de verdad y, cuando
    // llega esa pose, la diferencia se achica sola
    if (pose && this.gripViews?.length) this._gripView(pose);
    if (this.gripViews) this.gripViews.length = 0;
    if (pose) {
      this.char.applyWorldTransforms(pose);
      if (this.proxy.alive) {
        // teletransporte (respawn): mover sin arrastrar a nadie
        const p0 = this.proxy.bodies[0].translation();
        if (Math.hypot(p0.x - pose[0][0], p0.y - pose[0][1], p0.z - pose[0][2]) > 1.5) this.proxy.teleport(pose);
        else this.proxy.follow(pose, dt);
      }
      // la mano se cierra según lo que tiene (puño en un mango, a medias en lo que se carga de un borde)
      this.char.grip.l = s.hl ? curlOf(G.props?.get(s.hl)?.type) : s.gr & 1 ? 1 : 0.3;
      this.char.grip.r = s.hd ? curlOf(G.props?.get(s.hd)?.type) : s.gr & 2 ? 1 : 0.3;
      if (this.char.gripRadius) {
        this.char.gripRadius.l = this.char.gripRadius.r = 0;
        this.char.gripShape.l = this.char.gripShape.r = null;
        const two = s.hd && s.hd === s.hl;
        if (s.hd) setHandGrip(this.char, two ? (s.tw === 'l' ? 'l' : 'r') : 'r', G.props?.get(s.hd), two);
        if (s.hl && !two) setHandGrip(this.char, 'l', G.props?.get(s.hl), false);
      }
    } else {
      // sin datos de cuerpo todavía: animación simple en su posición
      this.char.root.position.copy(this.pos);
      this.char.root.rotation.y = this.yaw;
      this.char.animate({ speed: s.sp || 0, grounded: true, aimPitch: s.ap || 0, headYaw: s.hy || 0 }, dt);
    }
    this.char.update(dt);
    // las muñecas en el mango las vuelve a poner el objeto en su cuadro (props.update, después de esto)
    if (this.char.gripOn) this.char.gripOn.l = this.char.gripOn.r = false;
    this.equipment?.update(this.char, s.eq || 4, this.yaw, s.ac, s.at, s.s === 3);
  }

  headPosition(out = V1) {
    return this.char.headWorld(out);
  }

  // Reapareció: sin heridas, sangre ni partes cortadas
  resetBody() {
    if (this.proxy.alive) G.gore?.detachFrom(this.proxy.bodies[PART.TORSO]);
    G.gore?.restore(this.char);
    if (this.proxy.alive) for (let k = 0; k < 11; k++) this.proxy.setPartCollide(k, true);
    this.char.resetBody();
    this.react.reset();
    this.sv = 0;
  }

  // Lo tengo agarrado yo: la parte agarrada va a mi mano (si está lejos, el cuerpo entero se corre hacia ella
  // lo que la parte no alcanza a estirarse; después se doblan las articulaciones de esa cadena)
  _gripView(pose) {
    for (const gv of this.gripViews) {
      const i = gv.part, t = pose[i];
      if (!t) continue;
      const A = PV1.copy(gv.anchor).applyQuaternion(PQ1.set(t[3], t[4], t[5], t[6])).add(PV2.set(t[0], t[1], t[2]));
      const dx = gv.hand.x - A.x, dz = gv.hand.z - A.z, dh = Math.hypot(dx, dz), lim = VIEW_REACH[i] ?? 0.2;
      if (dh > lim) {
        const k = Math.min(1.5, dh - lim) / dh;
        for (const o of pose) { o[0] += dx * k; o[2] += dz * k; }
      }
      // tirado ya lo mueve la física (la cadena doblada sobre un ragdoll queda rara)
      if (!this.standing) continue;
      for (let it = 0; it < 2; it++) for (const [j, frac, max] of VIEW_CHAIN[i] || []) posePull(pose, j, i, gv.anchor, gv.hand, frac, max);
    }
  }

  // Reacción a un golpe (part, fuerza s, punto en mundo, (dx, dz) hacia dónde lo empuja). Devuelve la fuerza.
  hitReact(part, s, point, dx, dz, predicted = false) {
    const st = this.stateData?.s ?? 0;
    if (!(this.standing || st === 5) || !(s > 0)) return 0;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) { dx = -Math.sin(this.yaw); dz = -Math.cos(this.yaw); } else { dx /= d; dz /= d; }
    // en guardia y de frente casi no se mueve
    if (predicted && (this.stateData?.af & 16) && part <= PART.FARM_R && -(dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw)) > 0.2) s *= part >= PART.UARM_L ? 0.15 : 0.35;
    this.react.hit(part, dx, dz, s, point.x - this.pos.x, point.z - this.pos.z, this.yaw);
    if (predicted) {
      // el empujón real llega por la red en un rato: acá solo el sacudón del impacto
      this.react.shove(dx, dz, 0.6 + Math.min(2.5, s) * 1.1);
      this.react.predictT = G.time;
    }
    return s;
  }

  dispose() {
    this.proxy.destroy();
    G.phys.untag(this.pawn);
    try { G.phys.world.removeRigidBody(this.body); } catch { /* */ }
    this.equipment?.dispose();
    this.char.dispose();
  }
}
