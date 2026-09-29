// Esqueleto "objetivo": corre la animación procedural (caminar, tomar, piñas, bailes...) y
// entrega la pose en mundo que los músculos del ragdoll intentan seguir. No se dibuja.
// También resuelve el control directo de los brazos con el mouse (IK de 2 huesos).
import * as THREE from 'three';
import { Character, JOINT_NAMES, PARENT } from './character.js';

const tS = new THREE.Vector3();
const tA = new THREE.Vector3();
const tB = new THREE.Vector3();
const tC = new THREE.Vector3();
const tQ = new THREE.Quaternion();
const tQ2 = new THREE.Quaternion();
const tD = new THREE.Vector3();
const tE = new THREE.Vector3();
const tF = new THREE.Vector3();
const tM = new THREE.Matrix4();
const POLE = new THREE.Vector3();
const AX_Y = new THREE.Vector3(0, 1, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);
// clavícula: cuánto sube el hombro con la mano bien arriba y cuánto se adelanta estirando lejos adelante (rad)
export const CLAV = { up: 0.45, fwd: 0.2 };
const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const tQ3 = new THREE.Quaternion();
const tQ4 = new THREE.Quaternion();

export class PoseRig {
  // clavPivot: { l, r } base de cada clavícula en el marco del torso (del modelo); si no hay, al medio del pecho
  constructor(jointRest, clavPivot = null, gripLocal = null) {
    this.root = new THREE.Object3D();
    this.jointRest = jointRest.map((v) => v.clone());
    this.clavPivot = {
      l: clavPivot?.l?.clone() || new THREE.Vector3(0, jointRest[3].y, jointRest[3].z),
      r: clavPivot?.r?.clone() || new THREE.Vector3(0, jointRest[5].y, jointRest[5].z),
    };
    this.joints = [];
    for (let i = 0; i < 11; i++) {
      const j = new THREE.Object3D();
      j.position.copy(this.jointRest[i]);
      this.joints.push(j);
      (PARENT[i] < 0 ? this.root : this.joints[PARENT[i]]).add(j);
    }
    this.anim = { phase: 0, speed: 0, bob: 0, lean: 0, idleT: Math.random() * 10, cur: JOINT_NAMES.map(() => new THREE.Euler()) };
    this.mode = 'anim';
    this.detached = new Array(11).fill(false);
    this.targets = [];
    for (let i = 0; i < 11; i++) this.targets.push({ p: new THREE.Vector3(), q: new THREE.Quaternion() });
    // longitudes de brazo desde el reposo
    this.upperLen = [this.jointRest[4].length(), this.jointRest[6].length()];
    this.foreLen = ['l','r'].map((s,i)=>gripLocal?.[s]?.length() || this.upperLen[i]*.95);
  }

  animate(st, dt) { Character.prototype.animate.call(this, st, dt); }
  _emote(...a) { return Character.prototype._emote.apply(this, a); }

  place(pos, yaw) {
    this.root.position.copy(pos);
    this.root.rotation.set(0, yaw, 0);
    this.root.updateMatrixWorld(true);
  }

  // Hombros en su lugar (antes de los IK de este cuadro)
  resetShoulders() {
    this.joints[3].position.copy(this.jointRest[3]);
    this.joints[5].position.copy(this.jointRest[5]);
  }

  // Lleva la mano (side 'l'|'r') a un punto en mundo con IK de dos huesos, sobre la pose animada.
  // La clavícula acompaña: con la mano arriba el hombro sube y estirando lejos adelante se adelanta (sin esto
  // el brazo salía de un hombro clavado y en alto se retorcía). El codo apunta abajo/atrás/afuera con la mano
  // baja y hacia afuera y un poco adelante con la mano arriba (antes siempre abajo: en alto se cruzaban).
  // bend: fuerza hacia dónde se dobla el codo (vector en mundo)
  reach(side, target, bend = null) {
    const si = side === 'l' ? 3 : 5, ei = side === 'l' ? 4 : 6;
    const L1 = this.upperLen[side === 'l' ? 0 : 1], L2 = this.foreLen[side === 'l' ? 0 : 1];
    const sh = this.joints[si];
    const out = side === 'l' ? 1 : -1;
    this.root.updateMatrixWorld(true);
    // --- clavícula: el objetivo respecto del hombro en reposo, en el marco del torso
    const rest = this.jointRest[si], piv = this.clavPivot[side];
    const rel = tD.copy(target).applyMatrix4(tM.copy(this.joints[1].matrixWorld).invert()).sub(rest);
    const rl = rel.length();
    if (rl > 1e-4) {
      const lift = CLAV.up * smooth((rel.y / rl - 0.05) / 0.85); // guardia: apenas; mano sobre la cabeza: todo
      const pro = CLAV.fwd * smooth((rl / (L1 + L2) - 0.65) / 0.35) * Math.max(0, rel.z / rl);
      sh.position.copy(tE.copy(rest).sub(piv).applyAxisAngle(AX_Z, out * lift).applyAxisAngle(AX_Y, -out * pro).add(piv));
      sh.updateMatrixWorld(true);
    }
    const S = sh.getWorldPosition(tS);
    const toT = tA.copy(target).sub(S);
    let d = toT.length();
    const maxR = (L1 + L2) * 0.995;
    if (d > maxR) { toT.multiplyScalar(maxR / d); d = maxR; }
    if (d < 0.08) { toT.set(0, -0.08, 0); d = 0.08; }
    const dir = toT.clone().normalize();
    // plano del codo
    const pole = POLE;
    if (bend) pole.copy(bend);
    else {
      const yaw = this.root.rotation.y;
      const k = smooth((tF.copy(dir).applyAxisAngle(AX_Y, -yaw).y - 0.15) / 0.6); // en guardia los codos van abajo
      pole.set(out * (0.55 + 0.4 * k), -0.85 + 0.62 * k, -0.35 + 0.5 * k).applyAxisAngle(AX_Y, yaw);
    }
    const perp = pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (perp.lengthSq() < 1e-6) perp.set(out, 0, 0).applyAxisAngle(AX_Y, this.root.rotation.y);
    perp.normalize();
    const cosA = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    const E = tB.copy(S).addScaledVector(dir, L1 * cosA).addScaledVector(perp, L1 * sinA);
    // hombro: rotación mínima desde la dirección de reposo actual hacia S->E
    this._aim(si, E.clone().sub(S).normalize());
    // codo: desde la dirección de reposo hacia E->target
    const T = tC.copy(S).add(toT);
    this._aim(ei, T.clone().sub(E).normalize());
  }

  // Gira la articulación j para acercar un punto de la parte `part` (localPoint, en su marco) a `target` (mundo):
  // una fracción `frac` del giro que haría falta, con tope maxAng (rad). Cuerpos agarrados: la parte que te
  // tienen va hacia la mano que tira (la cabeza se dobla, la pierna se levanta).
  pullToward(j, part, localPoint, target, frac, maxAng) {
    this.root.updateMatrixWorld(true);
    const jw = this.joints[j];
    const P = jw.getWorldPosition(tS);
    const v1 = tA.copy(localPoint).applyMatrix4(this.joints[part].matrixWorld).sub(P);
    const v2 = tB.copy(target).sub(P);
    if (v1.lengthSq() < 1e-6 || v2.lengthSq() < 1e-6) return;
    const q = tQ2.setFromUnitVectors(v1.normalize(), v2.normalize());
    const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
    if (ang < 1e-4) return;
    tQ.identity().slerp(q, Math.min(ang * frac, maxAng) / ang);
    // giro en mundo -> local: L' = Pw^-1 · qW · Pw · L
    const pq = jw.parent.getWorldQuaternion(tQ3);
    jw.quaternion.premultiply(tQ4.copy(pq).invert().multiply(tQ).multiply(pq));
    jw.updateMatrixWorld(true);
  }

  // Apunta la articulación i para que su segmento de reposo (hacia el hijo) mire a `dirW` (mundo)
  _aim(i, dirW) {
    const j = this.joints[i];
    const parent = j.parent;
    parent.updateMatrixWorld(true);
    const pq = parent.getWorldQuaternion(tQ);
    // dirección de reposo del segmento en el marco local de la articulación
    const child = i === 3 ? 4 : i === 5 ? 6 : i === 4 || i === 6 ? null : null;
    const restLocal = child ? this.jointRest[child].clone().normalize() : new THREE.Vector3(0, -1, 0.06).normalize();
    // con rotación local identidad, el segmento en mundo es pq * restLocal
    const cur = restLocal.clone().applyQuaternion(pq);
    const rot = tQ2.setFromUnitVectors(cur, dirW);
    // Wj = rot * pq  =>  Lj = pq^-1 * rot * pq
    const lq = pq.clone().invert().multiply(rot).multiply(pq);
    j.quaternion.copy(lq);
    j.updateMatrixWorld(true);
  }

  // Calcula targets[i] = pose en mundo de cada articulación
  compute() {
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < 11; i++) {
      this.joints[i].matrixWorld.decompose(this.targets[i].p, this.targets[i].q, tS);
    }
    return this.targets;
  }

  // Pose como array de transformaciones (para crear/teletransportar el ragdoll)
  transforms() {
    this.compute();
    return this.targets.map((t) => [t.p.x, t.p.y, t.p.z, t.q.x, t.q.y, t.q.z, t.q.w]);
  }

  shoulderWorld(side, out = new THREE.Vector3()) {
    return this.joints[side === 'l' ? 3 : 5].getWorldPosition(out);
  }
}
