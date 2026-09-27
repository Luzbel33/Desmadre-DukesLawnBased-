// Reacciones a los golpes (la idea de los "hit reactions" de GTA/Euphoria, hecha procedural): resortes
// amortiguados por articulación que el golpe patea según la parte, la dirección y la fuerza. La cabeza se va
// para atrás con un latigazo, el torso gira si le pegan en un hombro, la rodilla se dobla con una patada baja.
// Se aplican sobre la pose DIBUJADA (no viajan por la red): cada cliente las simula para cada cuerpo a partir
// del evento del golpe, y el que pega las ve en el instante (sin esperar la ida y vuelta de la red).
import * as THREE from 'three';
import { PARENT, PART } from './ragdoll.js';

// canales: [articulación, eje local (0 x, 1 y, 2 z), ω (rad/s), ζ]
// columna/cuello: x + = hacia adelante, y + = girar a la izquierda, z = rolido; hombros: x - = brazo adelante,
// z = abrir (izquierdo +, derecho -); caderas: x - = pierna adelante; rodillas: x + = doblar
const CH = [
  [1, 0, 10, 0.42], [1, 1, 9, 0.45], [1, 2, 10, 0.42],
  [2, 0, 15, 0.36], [2, 1, 13, 0.4], [2, 2, 15, 0.36],
  [3, 0, 12, 0.34], [3, 2, 12, 0.34],
  [5, 0, 12, 0.34], [5, 2, 12, 0.34],
  [7, 0, 11, 0.5], [8, 0, 12, 0.5],
  [9, 0, 11, 0.5], [10, 0, 12, 0.5],
];
const C = { SPX: 0, SPY: 1, SPZ: 2, NKX: 3, NKY: 4, NKZ: 5, SLX: 6, SLZ: 7, SRX: 8, SRZ: 9, HL: 10, KL: 11, HR: 12, KR: 13 };
// rolido (eje z): signo que inclina la parte de arriba HACIA donde lo empujan (x local = izquierda)
export const ROLL = -1;
const MAXA = 1.15;
// pico de un resorte subamortiguado que arranca en 0 con velocidad v0: v0/ω · PEAK(ζ)
const PEAK = CH.map(([, , , z]) => { const r = Math.sqrt(1 - z * z); return Math.exp(-z / r * Math.atan(r / z)); });
// articulaciones con canales (padres antes que hijos) y sus subárboles
const JOINTS = [1, 2, 3, 5, 7, 8, 9, 10];
const JCH = new Map(JOINTS.map((j) => [j, [-1, -1, -1]]));
CH.forEach(([j, ax], c) => { JCH.get(j)[ax] = c; });
const SUB = JOINTS.map((j) => {
  const out = [];
  for (let k = 0; k < 11; k++) { let p = k; while (p >= 0 && p !== j) p = PARENT[p]; if (p === j) out.push(k); }
  return out;
});

const E = new THREE.Euler();
const R = new THREE.Quaternion();
const QJ = new THREE.Quaternion();
const D = new THREE.Quaternion();
const QK = new THREE.Quaternion();
const V = new THREE.Vector3();
const P = new THREE.Vector3();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export class HitReact {
  constructor() {
    this.a = new Float32Array(CH.length); // ángulos
    this.w = new Float32Array(CH.length); // velocidades angulares
    this.off = new THREE.Vector3(); // corrimiento visual del cuerpo entero (empujón previsto)
    this.offV = new THREE.Vector3();
    this.active = false;
    this.predictT = -99; // último golpe que previó el que pega (para no reaccionar dos veces)
  }

  kick(c, peak) {
    this.w[c] += peak * CH[c][2] / PEAK[c];
    this.active = true;
  }

  // part: parte golpeada; (dx, dz): hacia dónde lo empuja (unitario, horizontal); s: fuerza (0..3);
  // (rx, rz): punto del golpe menos el centro del cuerpo (mundo); yaw: hacia dónde mira el golpeado
  hit(part, dx, dz, s, rx, rz, yaw) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const f = dx * fx + dz * fz; // + lo empujan hacia adelante (le pegaron de atrás)
    const l = dx * fz - dz * fx; // + lo empujan hacia su izquierda
    const ox = rx * fz - rz * fx, oz = rx * fx + rz * fz; // dónde pegó, en su marco (x izquierda, z adelante)
    const tw = clamp(oz * l - ox * f, -0.3, 0.3) / 0.3; // giro que produce un golpe descentrado (+ izquierda)
    const K = 0.35 + 0.65 * clamp(s, 0, 2.5);
    if (part === PART.HEAD) {
      this.kick(C.NKX, f * 0.5 * K); this.kick(C.NKZ, ROLL * l * 0.42 * K); this.kick(C.NKY, tw * 0.42 * K);
      this.kick(C.SPX, f * 0.15 * K); this.kick(C.SPZ, ROLL * l * 0.12 * K);
      this.kick(C.SLZ, 0.1 * K); this.kick(C.SRZ, -0.1 * K);
    } else if (part === PART.TORSO) {
      this.kick(C.SPX, f * 0.3 * K); this.kick(C.SPZ, ROLL * l * 0.26 * K); this.kick(C.SPY, tw * 0.3 * K);
      // la cabeza se queda atrás y después latiguea
      this.kick(C.NKX, -f * 0.16 * K); this.kick(C.NKZ, -ROLL * l * 0.12 * K);
      // los brazos, por inercia, para el otro lado
      this.kick(C.SLX, f * 0.32 * K); this.kick(C.SRX, f * 0.32 * K);
      this.kick(C.SLZ, -l * 0.28 * K); this.kick(C.SRZ, -l * 0.28 * K);
    } else if (part === PART.PELVIS) {
      // a la panza de frente: se dobla; de atrás, se arquea
      this.kick(C.SPX, (Math.max(0, -f) * 0.42 - Math.max(0, f) * 0.16) * K);
      this.kick(C.NKX, Math.max(0, -f) * 0.22 * K);
      this.kick(C.SPZ, -ROLL * l * 0.16 * K);
      this.kick(C.SLX, -0.18 * K); this.kick(C.SRX, -0.18 * K);
    } else if (part === PART.UARM_L || part === PART.FARM_L || part === PART.UARM_R || part === PART.FARM_R) {
      const left = part === PART.UARM_L || part === PART.FARM_L;
      const k = part === PART.FARM_L || part === PART.FARM_R ? 0.6 : 0.5;
      this.kick(left ? C.SLX : C.SRX, -f * k * K);
      this.kick(left ? C.SLZ : C.SRZ, l * k * K);
      this.kick(C.SPY, tw * 0.22 * K); this.kick(C.SPZ, ROLL * l * 0.08 * K);
    } else {
      // pierna: la rodilla se dobla y el cuerpo se va para ese lado
      const left = part === PART.THIGH_L || part === PART.SHIN_L;
      this.kick(left ? C.HL : C.HR, -f * 0.32 * K);
      this.kick(left ? C.KL : C.KR, 0.55 * K);
      this.kick(C.SPX, 0.12 * K); this.kick(C.SPZ, ROLL * (left ? 1 : -1) * 0.14 * K);
      this.kick(C.SLZ, 0.14 * K); this.kick(C.SRZ, -0.14 * K);
    }
  }

  // empujón visual previsto (el real llega por la red un rato después)
  shove(dx, dz, v) {
    this.offV.x += dx * v;
    this.offV.z += dz * v;
    this.active = true;
  }

  reset() {
    this.a.fill(0); this.w.fill(0);
    this.off.set(0, 0, 0); this.offV.set(0, 0, 0);
    this.active = false;
  }

  update(dt) {
    if (!this.active || dt <= 0) return;
    const n = Math.min(8, Math.ceil(dt * 120));
    const h = dt / n;
    let e = 0;
    for (let s = 0; s < n; s++) {
      for (let c = 0; c < CH.length; c++) {
        const w = CH[c][2], z = CH[c][3];
        this.w[c] += (-w * w * this.a[c] - 2 * z * w * this.w[c]) * h;
        this.a[c] = clamp(this.a[c] + this.w[c] * h, -MAXA, MAXA);
      }
      // corrimiento: amortiguamiento crítico (sale y vuelve sin rebotar)
      const wo = 9;
      this.offV.addScaledVector(this.off, -wo * wo * h).multiplyScalar(Math.max(0, 1 - 2 * wo * h));
      this.off.addScaledVector(this.offV, h);
    }
    for (let c = 0; c < CH.length; c++) e += Math.abs(this.a[c]) + Math.abs(this.w[c]) * 0.05;
    e += this.off.lengthSq() * 10 + this.offV.lengthSq();
    if (e < 2e-4) this.reset();
  }

  // Aplica la reacción a una pose de 11 partes [x,y,z,qx,qy,qz,qw] (mundo), en el lugar
  apply(pose) {
    if (!this.active || !pose || pose.length < 11) return pose;
    for (let ji = 0; ji < JOINTS.length; ji++) {
      const j = JOINTS[ji], ch = JCH.get(j);
      const ex = ch[0] >= 0 ? this.a[ch[0]] : 0, ey = ch[1] >= 0 ? this.a[ch[1]] : 0, ez = ch[2] >= 0 ? this.a[ch[2]] : 0;
      if (Math.abs(ex) + Math.abs(ey) + Math.abs(ez) < 1e-4) continue;
      const t = pose[j];
      QJ.set(t[3], t[4], t[5], t[6]);
      R.setFromEuler(E.set(ex, ey, ez));
      // rotación local de la articulación -> giro en mundo alrededor de su pivote
      D.copy(QJ).multiply(R).multiply(QJ.invert());
      P.set(t[0], t[1], t[2]);
      for (const k of SUB[ji]) {
        const o = pose[k];
        if (k !== j) {
          V.set(o[0], o[1], o[2]).sub(P).applyQuaternion(D).add(P);
          o[0] = V.x; o[1] = V.y; o[2] = V.z;
        }
        QK.set(o[3], o[4], o[5], o[6]).premultiply(D);
        o[3] = QK.x; o[4] = QK.y; o[5] = QK.z; o[6] = QK.w;
      }
    }
    if (this.off.lengthSq() > 1e-8) for (const o of pose) { o[0] += this.off.x; o[2] += this.off.z; }
    return pose;
  }
}
