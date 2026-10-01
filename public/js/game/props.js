// Objetos físicos compartidos: cuerpos rígidos reales con dueño en red.
// El que toca/agarra un objeto lo simula y manda su estado; los demás lo ven cinemático e interpolado.
import * as THREE from 'three';
import { G, clamp } from '../core/G.js';
import { RAPIER, GR, groups } from '../core/physics.js';
import { assetModel } from './assets.js';
import { createEquippedModel } from './equipment.js';
import { HELD_PROP_DEFS, heldState } from '../shared/held-items.js';

// Definiciones físicas por tipo. shape: box(hx,hy,hz) | cyl(r,h) | ball(r) | capsule(r,h). oy: altura del centro.
export const PROP_DEFS = {
  ...HELD_PROP_DEFS,
  bottle: { shape: 'cyl', r: 0.037, h: 0.3, oy: 0.15, mass: 0.45, breakDv: 6.5, glass: 0x2f5a2c, kind: 'blunt', grip: [0, 0.22, 0], label: 'botella' },
  can: { shape: 'cyl', r: 0.033, h: 0.12, oy: 0.06, mass: 0.35, kind: 'blunt', grip: [0, 0.06, 0], label: 'lata' },
  chair: { shape: 'box', hx: 0.3, hy: 0.43, hz: 0.3, oy: 0.43, mass: 2.6, breakDv: 14, kind: 'blunt', grip: [0, 0.84, -0.27], label: 'silla' },
  stool: { shape: 'cyl', r: 0.23, h: 0.75, oy: 0.375, mass: 3.5, kind: 'blunt', grip: [0, 0.72, 0], label: 'banqueta' },
  cue: { shape: 'capsule', r: 0.018, h: 1.4, oy: 0.7, mass: 0.55, kind: 'blunt', grip: [0, 0.2, 0], label: 'taco' },
  bat: { shape: 'capsule', r: 0.035, h: 0.86, oy: 0.43, mass: 1, kind: 'blunt', grip: [0, 0.1, 0], label: 'bate' },
  sword: { shape: 'box', hx: 0.03, hy: 0.5, hz: 0.012, oy: 0.5, mass: 1.2, kind: 'cut', grip: [0, 0.12, 0], label: 'katana' },
  machete: { shape: 'box', hx: 0.035, hy: 0.36, hz: 0.01, oy: 0.36, mass: 0.8, kind: 'cut', grip: [0, 0.08, 0], label: 'machete' },
  knife: { shape: 'box', hx: 0.035, hy: 0.165, hz: 0.01, oy: 0.165, mass: 0.35, kind: 'cut', grip: [0, 0.04, 0], label: 'daga' },
  axe: { shape: 'box', hx: 0.1, hy: 0.35, hz: 0.025, oy: 0.35, mass: 1.6, kind: 'cut', grip: [0, 0.1, 0], label: 'hacha' },
  sledge: { shape: 'box', hx: 0.1, hy: 0.475, hz: 0.05, oy: 0.475, mass: 5, kind: 'blunt', grip: [0, 0.1, 0], label: 'maza' },
  pan: { shape: 'cyl', r: 0.13, h: 0.07, oy: 0.035, mass: 1.4, kind: 'blunt', grip: [0, 0.04, -0.4], label: 'sartén' },
  guitar: { shape: 'box', hx: 0.1, hy: 0.3, hz: 0.04, oy: 0.3, mass: 0.7, breakDv: 8, kind: 'blunt', grip: [0, 0.52, 0], label: 'ukelele' },
  trashcan: { shape: 'cyl', r: 0.3, h: 1.0, oy: 0.5, mass: 6, kind: 'blunt', grip: [0.33, 0.66, 0], label: 'tacho' },
  crate: { shape: 'box', hx: 0.15, hy: 0.132, hz: 0.206, oy: 0.132, mass: 2.2, kind: 'blunt', grip: [0, 0.26, 0], label: 'cajón de birra' },
  cone: { shape: 'cyl', r: 0.16, h: 0.55, oy: 0.275, mass: 1.2, kind: 'blunt', grip: [0, 0.52, 0], label: 'cono' },
  watermelon: { shape: 'ball', r: 0.2, oy: 0.2, mass: 5, breakDv: 7.5, splat: 0xc8283a, kind: 'blunt', grip: [0, 0.2, 0], label: 'sandía' },
  gnome: { shape: 'cyl', r: 0.13, h: 0.56, oy: 0.28, mass: 3, breakDv: 10, kind: 'blunt', grip: [0, 0.5, 0], label: 'enano de jardín' },
  frisbee: { shape: 'cyl', r: 0.13, h: 0.03, oy: 0.015, mass: 0.2, kind: 'blunt', grip: [0.12, 0, 0], label: 'frisbee' },
  popcorn: { shape: 'cyl', r: 0.07, h: 0.2, oy: 0.1, mass: 0.15, kind: 'blunt', grip: [0, 0.1, 0], label: 'pochoclos' },
  spraycan: { shape: 'cyl', r: 0.033, h: 0.21, oy: 0.105, mass: 0.4, kind: 'blunt', grip: [0, 0.1, 0], label: 'aerosol' },
  crowbar: { shape: 'box', hx: 0.03, hy: 0.3, hz: 0.015, oy: 0.3, mass: 1.5, kind: 'blunt', grip: [0, 0.1, 0], label: 'barreta' },
  wetsign: { shape: 'box', hx: 0.15, hy: 0.315, hz: 0.18, oy: 0.315, mass: 1.2, kind: 'blunt', grip: [0, 0.6, 0], label: 'cartel de piso mojado' },
  barrel: { shape: 'cyl', r: 0.28, h: 0.88, oy: 0.44, mass: 16, kind: 'blunt', grip: [0, 0.86, 0.25], label: 'tambor' },
  box: { shape: 'box', hx: 0.195, hy: 0.17, hz: 0.26, oy: 0.17, mass: 1.5, breakDv: 9, kind: 'blunt', grip: [0, 0.34, 0], label: 'caja' },
};
export const DEFAULT_DEF = { shape: 'box', hx: 0.18, hy: 0.18, hz: 0.18, oy: 0.18, mass: 2, kind: 'blunt', grip: [0, 0.3, 0], label: 'objeto' };
export const defOf = (type) => PROP_DEFS[type] || DEFAULT_DEF;
export const PROP_FILTER = GR.WORLD | GR.PROP | GR.RAGDOLL | GR.REMOTE | GR.VEHICLE | GR.DEBRIS;
// lo que las cuchillas de la cortadora hacen picadillo (lo grande o de metal las traba: solo lo empujan)
export const CHOPPABLE = new Set(['gnome', 'watermelon', 'bottle', 'can', 'popcorn', 'cone', 'box', 'frisbee', 'spraycan', 'guitar']);

// ---------------------------------------------------------------- cómo se sostiene cada cosa
// stick: firme en el puño. `tip` (eje local) sale para donde apunta el pulgar y `edge` (filo o cara) hacia
//   donde apunta el antebrazo: en guardia el arma queda arriba y adelante; con el brazo en alto cae hacia
//   atrás (golpe de arriba); al revolear se retrasa un poco (se siente el peso).
//   two: corrimiento a lo largo del eje donde va la segunda mano (armas a dos manos).
// carry: cuelga derecho de la mano (sillas, cajones, tachos) y se hamaca con los tirones.
//   two: los dos puntos donde van las manos cuando se lleva con las dos (en el marco del objeto).
export const HOLD = {
  bottle: { style: 'stick', tip: [0, -1, 0], edge: [1, 0, 0] },
  can: { style: 'stick', tip: [0, 1, 0], edge: [1, 0, 0] },
  popcorn: { style: 'stick', tip: [0, 1, 0], edge: [1, 0, 0] },
  spraycan: { style: 'stick', tip: [0, 1, 0], edge: [1, 0, 0] },
  bat: { style: 'stick', tip: [0, 1, 0], edge: [1, 0, 0], two: 0.12 },
  cue: { style: 'stick', tip: [0, 1, 0], edge: [1, 0, 0], two: 0.34 },
  sword: { style: 'stick', tip: [0, 1, 0], edge: [1, 0, 0], two: -0.1 },
  machete: { style: 'stick', tip: [0, 1, 0], edge: [1, 0, 0] },
  knife: { style: 'stick', tip: [0, 1, 0], edge: [1, 0, 0] },
  axe: { style: 'stick', tip: [0, 1, 0], edge: [1, 0, 0], two: 0.14 },
  sledge: { style: 'stick', tip: [0, 1, 0], edge: [1, 0, 0], two: 0.17 },
  crowbar: { style: 'stick', tip: [0, 1, 0], edge: [1, 0, 0], two: 0.13 },
  pan: { style: 'stick', tip: [0, 0, 1], edge: [0, 1, 0] },
  guitar: { style: 'stick', tip: [0, -1, 0], edge: [0, 0, 1], two: -0.17 },
  frisbee: { style: 'carry' },
  cone: { style: 'carry' },
  chair: { style: 'carry', two: [[-0.2, 0.84, -0.27], [0.2, 0.84, -0.27]] },
  stool: { style: 'carry', two: [[-0.21, 0.7, 0], [0.21, 0.7, 0]] },
  trashcan: { style: 'carry', two: [[0.31, 0.66, 0], [-0.31, 0.66, 0]] },
  crate: { style: 'carry', two: [[-0.14, 0.26, 0], [0.14, 0.26, 0]] },
  watermelon: { style: 'carry', two: [[0.19, 0.2, 0], [-0.19, 0.2, 0]] },
  gnome: { style: 'carry', two: [[-0.12, 0.4, 0], [0.12, 0.4, 0]] },
  wetsign: { style: 'carry', two: [[-0.12, 0.6, 0], [0.12, 0.6, 0]] },
  barrel: { style: 'carry', two: [[0, 0.86, 0.25], [0, 0.86, -0.25]] },
  box: { style: 'carry', two: [[-0.2, 0.2, 0], [0.2, 0.2, 0]] },
};
const HOLD_DEFAULT = { style: 'carry' };
export const holdOf = (type) => HOLD[type] || HOLD_DEFAULT;
// cuánto se cierra la mano: un mango fino, puño cerrado; una lata, menos; lo que se carga de un borde, a medias
const CURL = { can: 0.8, spraycan: 0.8, popcorn: 0.62, bottle: 0.95 };
export const curlOf = (type) => CURL[type] ?? (holdOf(type).style === 'stick' ? 1 : 0.55);
// dirección del mango en mundo (del lado del pulgar) de algo firme en la mano, o null si no tiene mango
export function handleAxis(type, quat, out) {
  const h = holdOf(type);
  if (h.style !== 'stick' || !h.tip) return null;
  return out.fromArray(h.tip).applyQuaternion(quat).normalize();
}
// se puede agarrar con las dos manos
export const twoHanded = (type) => !!holdOf(type).two;

const V1 = new THREE.Vector3();
const Q1 = new THREE.Quaternion();
const HV = { f: new THREE.Vector3(), R: new THREE.Vector3(), w: new THREE.Vector3(), e: new THREE.Vector3(), n: new THREE.Vector3(),
  t: new THREE.Vector3(), g: new THREE.Vector3(), a: new THREE.Vector3(), m1: new THREE.Matrix4(), m2: new THREE.Matrix4(), q: new THREE.Quaternion(), eu: new THREE.Euler() };
const UPV = new THREE.Vector3(0, 1, 0);

// Estado de un agarre (por objeto): retraso del arma al revolear, vaivén de lo que cuelga
export function holdState(yawOff = 0) {
  return { lag: new THREE.Vector3(), sw: new THREE.Vector2(), swv: new THREE.Vector2(), yawOff, hv: new THREE.Vector3(), prev: null };
}

// Rotación en mundo de un objeto sostenido (y avanza su retraso / vaivén si dt > 0).
// hand: palma, elbow: codo (dirección del antebrazo), yaw: giro del cuerpo, dt: paso (para velocidades).
// Después la posición es: mano - rotación * punto de agarre (ver heldPos).
export function heldQuat(type, st, hand, elbow, yaw, dt, outQuat) {
  const def = defOf(type), h = holdOf(type);
  const { f, R, w, e, n, t, g } = HV;
  // velocidad de la mano (suavizada) para el retraso y el vaivén
  if (st.prev && dt > 0) {
    const vx = (hand.x - st.prev.x) / dt, vy = (hand.y - st.prev.y) / dt, vz = (hand.z - st.prev.z) / dt;
    const k = 1 - Math.exp(-25 * dt);
    st.acc = st.acc || new THREE.Vector3();
    st.acc.set((vx - st.hv.x) / dt, (vy - st.hv.y) / dt, (vz - st.hv.z) / dt).multiplyScalar(k);
    st.hv.x += (vx - st.hv.x) * k; st.hv.y += (vy - st.hv.y) * k; st.hv.z += (vz - st.hv.z) * k;
  }
  if (dt > 0) (st.prev = st.prev || new THREE.Vector3()).copy(hand);
  if (h.style === 'stick') {
    f.copy(hand).sub(elbow);
    if (f.lengthSq() < 1e-8) f.set(Math.sin(yaw), 0, Math.cos(yaw));
    f.normalize();
    R.set(-Math.cos(yaw), 0, Math.sin(yaw)); // derecha del cuerpo
    // dirección del pulgar con la muñeca neutra, un poco hacia arriba y hacia donde apunta el antebrazo:
    // en guardia (brazo adelante) queda arriba y un poco adelante; colgando, adelante y abajo; en alto, atrás
    w.crossVectors(R, f).addScaledVector(t.copy(UPV).addScaledVector(f, -f.y), 0.3).addScaledVector(f, 0.55);
    if (w.lengthSq() < 1e-6) w.copy(UPV);
    w.normalize();
    // latigazo: la punta tiende a ir para donde va la mano (en la carga se va atrás, en el golpe sale adelante),
    // pero llega con un resorte amortiguado: arranca atrasada, se pasa un poco y vuelve (se siente el peso)
    if (dt > 0) {
      const lead = 0.075 / Math.sqrt(Math.max(0.5, def.mass || 1));
      t.copy(st.hv).addScaledVector(w, -st.hv.dot(w)).multiplyScalar(lead);
      if (t.length() > 1.8) t.setLength(1.8);
      st.lagV = st.lagV || new THREE.Vector3();
      const om = 16 / Math.sqrt(Math.max(0.5, def.mass || 1)), ze = 0.5;
      st.lagV.addScaledVector(HV.a.copy(t).sub(st.lag), om * om * dt).multiplyScalar(Math.max(0, 1 - 2 * ze * om * dt));
      st.lag.addScaledVector(st.lagV, dt);
      if (st.lag.length() > 2.2) st.lag.setLength(2.2);
      // muñeca de los golpes guionados (swing/revoleo): la pone el jugador en st.wrist (mundo)
      st.wristS = st.wristS || new THREE.Vector3();
      st.wristS.lerp(st.wrist || HV.n.set(0, 0, 0), 1 - Math.exp(-18 * dt));
    }
    w.add(st.lag);
    if (st.wristS) w.add(st.wristS);
    w.normalize();
    e.copy(f).addScaledVector(w, -f.dot(w));
    if (e.lengthSq() < 1e-6) e.crossVectors(w, R);
    e.normalize();
    n.crossVectors(w, e);
    const T = t.fromArray(h.tip), E = g.fromArray(h.edge);
    const N = HV.a.crossVectors(T, E);
    HV.m1.makeBasis(w, e, n);
    HV.m2.makeBasis(T, E, N).transpose();
    outQuat.setFromRotationMatrix(HV.m1.multiply(HV.m2));
  } else {
    // colgando derecho: sigue el giro del cuerpo y se hamaca con los tirones de la mano (péndulo amortiguado)
    if (dt > 0 && st.acc) {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const aF = st.acc.x * fx + st.acc.z * fz, aS = st.acc.x * fz - st.acc.z * fx;
      const tx = clamp(aF * 0.02, -0.55, 0.55), tz = clamp(-aS * 0.02, -0.55, 0.55);
      const kp = 60 / Math.sqrt(Math.max(0.3, def.mass || 1)), kd = 7;
      st.swv.x += ((tx - st.sw.x) * kp - st.swv.x * kd) * dt;
      st.swv.y += ((tz - st.sw.y) * kp - st.swv.y * kd) * dt;
      st.sw.x += st.swv.x * dt; st.sw.y += st.swv.y * dt;
    }
    HV.eu.set(st.sw.x, yaw + st.yawOff, st.sw.y, 'YXZ');
    outQuat.setFromEuler(HV.eu);
  }
  return outQuat;
}

// Posición del objeto para que su punto de agarre (local) quede en la mano
export function heldPos(hand, quat, grip, outPos) {
  return outPos.copy(hand).sub(HV.g.copy(grip).applyQuaternion(quat));
}

// Punto de agarre (local) de la mano principal y de la segunda, según con cuántas manos se sostiene
export function gripPoints(type, twoHand, primaryRight, R, quat, out1, out2) {
  const def = defOf(type), h = holdOf(type);
  out1.fromArray(def.grip || [0, 0, 0]);
  if (!twoHand || !h.two) return null;
  if (h.style === 'stick') {
    out2.copy(out1).addScaledVector(V1.fromArray(h.tip), h.two);
    return out2;
  }
  // colgando con dos manos: cada mano en un costado (la de la derecha va con la mano derecha)
  out1.fromArray(h.two[0]);
  out2.fromArray(h.two[1]);
  const a = V1.copy(out1).applyQuaternion(quat).dot(R), b = HV.a.copy(out2).applyQuaternion(quat).dot(R);
  const swap = primaryRight ? a < b : a > b;
  if (swap) { V1.copy(out1); out1.copy(out2); out2.copy(V1); }
  return out2;
}

// Puntos a lo largo del arma (local) para barrer los golpes: del mango a la punta
export function bladePoints(type) {
  const def = defOf(type), h = holdOf(type);
  if (h.style !== 'stick') return null;
  const T = new THREE.Vector3().fromArray(h.tip);
  const g = new THREE.Vector3().fromArray(def.grip || [0, 0, 0]);
  // punta: el extremo del colisionador en la dirección del eje
  const ext = def.shape === 'box' ? new THREE.Vector3(def.hx, def.hy, def.hz)
    : def.shape === 'cyl' ? new THREE.Vector3(def.r, def.h / 2, def.r)
      : def.shape === 'ball' ? new THREE.Vector3(def.r, def.r, def.r) : new THREE.Vector3(def.r, def.h / 2, def.r);
  const c = new THREE.Vector3(0, def.oy, 0);
  const far = c.clone().add(new THREE.Vector3(Math.sign(T.x) * ext.x, Math.sign(T.y) * ext.y, Math.sign(T.z) * ext.z).multiply(new THREE.Vector3(Math.abs(T.x), Math.abs(T.y), Math.abs(T.z))));
  const len = Math.max(0.05, far.clone().sub(g).dot(T));
  const pts = [];
  for (const k of [0.3, 0.55, 0.8, 1]) pts.push(g.clone().addScaledVector(T, len * k));
  return { pts, len };
}

function mat(color, roughness = 0.7, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function add(g, geo, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------- visuales procedurales (tipos sin modelo 3D)
// Materiales y geometrías compartidos: se crean una vez y se reusan en todas las copias.
const SHARED = new Map();
function shared(key, make) {
  if (!SHARED.has(key)) SHARED.set(key, make());
  return SHARED.get(key);
}
function canvasTex(w, h, draw) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function lathe(points, seg = 28) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

// Visual procedural de reserva (si no hay modelo 3D cargado para el tipo)
function fallbackMesh(type) {
  const g = new THREE.Group();
  const d = defOf(type);
  switch (type) {
    case 'bottle': {
      const glass = shared('glass', () => new THREE.MeshPhysicalMaterial({ color: 0x2f5a2c, roughness: 0.08, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.9 }));
      add(g, shared('bottleGeo', () => lathe([[0, 0], [0.033, 0], [0.035, 0.02], [0.035, 0.19], [0.03, 0.22], [0.014, 0.26], [0.013, 0.3], [0.0, 0.3]], 24)), glass);
      add(g, shared('bottleLabel', () => new THREE.CylinderGeometry(0.0355, 0.0355, 0.08, 24, 1, true)), mat(0xe8dcc0, 0.8), 0, 0.1, 0);
      break;
    }
    case 'can': {
      // lata de birra: cuerpo con etiqueta, tapa y fondo de aluminio
      const label = shared('canLabel', () => new THREE.MeshStandardMaterial({
        map: canvasTex(256, 128, (c, w, h) => {
          const gr = c.createLinearGradient(0, 0, 0, h);
          gr.addColorStop(0, '#9c1216'); gr.addColorStop(0.5, '#d8262b'); gr.addColorStop(1, '#8a0f12');
          c.fillStyle = gr; c.fillRect(0, 0, w, h);
          c.fillStyle = '#f3d27a'; c.fillRect(0, 22, w, 6); c.fillRect(0, h - 28, w, 6);
          c.fillStyle = '#fff4dc'; c.font = 'bold 34px Georgia'; c.textAlign = 'center';
          for (const x of [64, 192]) { c.fillText('DESMADRE', x, 74); c.font = '14px Arial'; c.fillText('CERVEZA RUBIA', x, 96); c.font = 'bold 34px Georgia'; }
        }),
        roughness: 0.3, metalness: 0.65,
      }));
      const alu = shared('alu', () => mat(0xc9ccd0, 0.28, 0.9));
      add(g, shared('canBody', () => new THREE.CylinderGeometry(0.033, 0.033, 0.1, 28, 1, true)), label, 0, 0.062, 0);
      add(g, shared('canTop', () => lathe([[0, 0.118], [0.026, 0.118], [0.028, 0.121], [0.03, 0.117], [0.033, 0.112], [0.033, 0.11]], 28)), alu);
      add(g, shared('canBot', () => lathe([[0.033, 0.014], [0.033, 0.012], [0.028, 0.002], [0.02, 0], [0, 0.004]], 28)), alu);
      break;
    }
    case 'popcorn': {
      const box = shared('popBox', () => new THREE.MeshStandardMaterial({
        map: canvasTex(256, 128, (c, w, h) => {
          for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#f6efe2' : '#d42a24'; c.fillRect(i * 16, 0, 16, h); }
          c.fillStyle = '#ffd23b'; c.font = 'bold 30px Arial'; c.textAlign = 'center'; c.fillText('POP', 64, 74); c.fillText('POP', 192, 74);
        }),
        roughness: 0.8, side: THREE.DoubleSide,
      }));
      add(g, shared('popGeo', () => new THREE.CylinderGeometry(0.075, 0.055, 0.2, 20, 1, true)), box, 0, 0.1, 0);
      // pochoclos asomando: bolitas irregulares
      const pop = shared('popcorn', () => new THREE.MeshStandardMaterial({ color: 0xfff2c8, roughness: 0.95 }));
      const kernel = shared('kernel', () => new THREE.IcosahedronGeometry(0.018, 0));
      for (let i = 0; i < 16; i++) {
        const a = i * 2.39, r = 0.012 + (i % 5) * 0.012;
        const k = add(g, kernel, pop, Math.cos(a) * r, 0.2 + (i % 3) * 0.012, Math.sin(a) * r);
        k.rotation.set(i, i * 0.7, 0);
      }
      break;
    }
    case 'cone': {
      // cono de tránsito naranja con bandas reflectivas y base cuadrada
      const orange = shared('coneMat', () => new THREE.MeshStandardMaterial({
        map: canvasTex(64, 256, (c, w, h) => {
          c.fillStyle = '#ff5a14'; c.fillRect(0, 0, w, h);
          c.fillStyle = '#f2f2f2'; c.fillRect(0, h * 0.2, w, h * 0.12); c.fillRect(0, h * 0.45, w, h * 0.09);
        }),
        roughness: 0.55,
      }));
      add(g, shared('coneGeo', () => new THREE.CylinderGeometry(0.02, 0.13, 0.5, 24, 1, true)), orange, 0, 0.3, 0);
      add(g, shared('coneBase', () => new THREE.BoxGeometry(0.34, 0.04, 0.34)), shared('coneBaseMat', () => mat(0xe0480e, 0.7)), 0, 0.02, 0);
      break;
    }
    case 'watermelon': {
      const rind = shared('melon', () => new THREE.MeshStandardMaterial({
        map: canvasTex(256, 128, (c, w, h) => {
          c.fillStyle = '#2f6b25'; c.fillRect(0, 0, w, h);
          for (let i = 0; i < 12; i++) {
            c.fillStyle = '#1a4515';
            c.beginPath();
            const x = i * (w / 12);
            c.moveTo(x, 0);
            for (let y = 0; y <= h; y += 8) c.lineTo(x + Math.sin(y * 0.15 + i) * 4 + 5, y);
            for (let y = h; y >= 0; y -= 8) c.lineTo(x + Math.sin(y * 0.15 + i) * 4 - 5, y);
            c.fill();
          }
        }),
        roughness: 0.45,
      }));
      const m = add(g, shared('melonGeo', () => new THREE.SphereGeometry(d.r, 28, 18)), rind, 0, d.oy, 0);
      m.scale.set(1, 0.9, 1.15);
      break;
    }
    case 'frisbee': {
      add(g, shared('frisbeeGeo', () => lathe([[0, 0.024], [0.1, 0.022], [0.125, 0.016], [0.13, 0.004], [0.126, 0], [0.12, 0.012], [0, 0.018]], 32)), shared('frisbeeMat', () => new THREE.MeshPhysicalMaterial({ color: 0xff3b8a, roughness: 0.35, clearcoat: 0.6 })));
      break;
    }
    case 'spraycan': add(g, new THREE.CylinderGeometry(0.033, 0.033, 0.2, 20), mat(0x303238, 0.4, 0.5), 0, 0.1, 0); break;
    default: {
      const m = mat(0x8b6a4a, 0.75);
      if (d.shape === 'box') add(g, new THREE.BoxGeometry(d.hx * 2, d.hy * 2, d.hz * 2), m, 0, d.oy, 0);
      else if (d.shape === 'cyl') add(g, new THREE.CylinderGeometry(d.r, d.r, d.h, 18), m, 0, d.oy, 0);
      else if (d.shape === 'ball') add(g, new THREE.SphereGeometry(d.r, 20, 14), mat(0x3f8f3c, 0.6), 0, d.oy, 0);
      else add(g, new THREE.CapsuleGeometry(d.r, d.h - d.r * 2, 6, 12), m, 0, d.oy, 0);
    }
  }
  return g;
}

function visualFor(type) {
  const equipped = HELD_PROP_DEFS[type];
  return equipped ? createEquippedModel(equipped.slot) : assetModel(type) || fallbackMesh(type);
}

function colliderDesc(d) {
  let cd;
  switch (d.shape) {
    case 'box': cd = RAPIER.ColliderDesc.cuboid(d.hx, d.hy, d.hz); break;
    case 'cyl': cd = RAPIER.ColliderDesc.cylinder(d.h / 2, d.r); break;
    case 'ball': cd = RAPIER.ColliderDesc.ball(d.r); break;
    default: cd = RAPIER.ColliderDesc.capsule(Math.max(0.01, d.h / 2 - d.r), d.r);
  }
  return cd.setTranslation(0, d.oy, 0).setMass(d.mass).setFriction(0.65).setRestitution(d.shape === 'ball' ? 0.35 : 0.15)
    .setActiveCollisionTypes(15 | 52224) // también contra cuerpos cinemáticos (golpes a jugadores de pie)
    .setCollisionGroups(groups(GR.PROP, PROP_FILTER));
}

function parseRow(row) {
  return {
    id: row[0], type: row[1],
    pos: new THREE.Vector3(row[2], row[3], row[4]),
    quat: new THREE.Quaternion(row[5], row[6], row[7], row[8]),
    owner: row[9] || 0, heldBy: row[10] || 0, extra: row[11] ? heldState(row[11]) : null,
  };
}

export class PropManager {
  constructor(net, local) {
    this.net = net;
    this.local = local;
    this.items = new Map();
    this._sendT = 0;
    this._spawnN = 1;
    this.onBreak = null; // (prop, pos, def)
  }

  // ---------------------------------------------------------------- alta / baja
  load(rows = []) { for (const r of rows) this.addRow(r); }

  addRow(row, vel = null) {
    if (!Array.isArray(row) || row.length < 11) return null;
    const d = parseRow(row);
    let p = this.items.get(d.id);
    if (!p) {
      const def = defOf(d.type);
      const group = visualFor(d.type);
      group.userData.propId = d.id;
      G.scene.add(group);
      const body = G.phys.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(d.pos.x, d.pos.y, d.pos.z)
          .setRotation({ x: d.quat.x, y: d.quat.y, z: d.quat.z, w: d.quat.w })
          .setCcdEnabled(def.mass < 2)
          .setLinearDamping(0.05).setAngularDamping(0.25),
      );
      const collider = G.phys.world.createCollider(colliderDesc(def), body);
      p = {
        id: d.id, type: d.type, def, mass: def.mass, group, body, collider, extra: d.extra,
        owner: d.owner, heldBy: d.heldBy, dynamic: false,
        target: d.pos.clone(), targetQ: d.quat.clone(), prevTarget: d.pos.clone(), vel: new THREE.Vector3(),
        lastV: new THREE.Vector3(), sleepT: 0, sentSleep: false, claimT: 0,
      };
      G.phys.tag(collider, { kind: 'prop', ref: p });
      this.items.set(p.id, p);
    } else {
      p.owner = d.owner; p.heldBy = d.heldBy;
      p.target.copy(d.pos); p.targetQ.copy(d.quat);
      p.body.setTranslation({ x: d.pos.x, y: d.pos.y, z: d.pos.z }, true);
      p.body.setRotation({ x: d.quat.x, y: d.quat.y, z: d.quat.z, w: d.quat.w }, true);
    }
    this._applyAuthority(p);
    if (vel && p.dynamic) this.setVelocity(p, vel);
    this._syncMesh(p);
    return p;
  }

  remove(id) {
    const p = this.items.get(id);
    if (!p) return;
    for (const side of ['l', 'r']) if (this.local?.hands[side].prop === id) this.local.release(side, false);
    G.phys.untag(p.collider);
    try { G.phys.world.removeRigidBody(p.body); } catch { /* */ }
    p.group.removeFromParent();
    this.items.delete(id);
  }

  get(id) { return this.items.get(id); }

  // ---------------------------------------------------------------- autoridad
  // dynamic = lo simulo yo (y mando su estado). En mi mano es cinemático (p.kin): lo lleva la mano.
  _applyAuthority(p) {
    const mine = p.owner === G.myId && (!p.heldBy || p.heldBy === G.myId);
    if (mine === p.dynamic) return;
    p.dynamic = mine;
    p.body.setBodyType(mine && !p.kin ? RAPIER.RigidBodyType.Dynamic : RAPIER.RigidBodyType.KinematicPositionBased, true);
    if (mine && !p.kin) {
      // pasa a simularlo yo: la velocidad que traía no es un golpe
      const v = p.body.linvel();
      p.lastV.set(v.x, v.y, v.z);
      p.noBreakSteps = 9;
      p.body.wakeUp();
    }
  }

  handleOwnership(m) {
    const p = this.items.get(m.id);
    if (!p) return;
    // lo soltó el que lo tenía en la mano: por un rato cuenta como revoleado por él
    if (p.heldBy && !m.h) { p.thrownAt = performance.now(); p.thrownBy = p.heldBy; }
    p.owner = m.o || 0;
    p.heldBy = m.h || 0;
    // me lo sacaron de la mano
    for (const side of ['l', 'r']) {
      if (this.local?.hands[side].prop === p.id && p.heldBy && p.heldBy !== G.myId) this.local.release(side, false);
    }
    this._applyAuthority(p);
  }

  handleSnap(rows = []) {
    for (const u of rows) {
      const p = this.items.get(u[0]);
      if (!p || u.length < 8 || p.dynamic) continue;
      p.prevTarget.copy(p.target);
      p.target.set(u[1], u[2], u[3]);
      p.targetQ.set(u[4], u[5], u[6], u[7]);
    }
  }

  // Tocar un objeto ajeno con el cuerpo: lo reclamo para simularlo yo
  touch(p) {
    if (!p || p.dynamic || p.heldBy) return;
    const now = performance.now();
    if (now - p.claimT < 400) return;
    p.claimT = now;
    this.net.send({ t: 'pc', id: p.id });
    p.owner = G.myId;
    this._applyAuthority(p);
  }

  // ---------------------------------------------------------------- manos
  // Qué agarra la mano: primero lo que mira la cámara (rayo), después lo que está cerca de la mano o del
  // rayo con un margen generoso. Lo que ya tengo en la otra mano se puede tomar con las dos si se presta.
  findGrabbable(handPos, camPos, camDir, side) {
    const other = this.local.hands[side === 'l' ? 'r' : 'l'];
    const ok = (p) => {
      if (!p || (p.heldBy && p.heldBy !== G.myId)) return false;
      if (other.prop === p.id) return twoHanded(p.type);
      return true;
    };
    // 1) lo que apunta la mira (hasta 2.6 m)
    const hit = G.phys?.raycast(camPos.x, camPos.y, camPos.z, camDir.x, camDir.y, camDir.z, 2.6, groups(0xffff, GR.PROP | GR.WORLD));
    if (hit?.info?.kind === 'prop' && ok(hit.info.ref)) return { prop: hit.info.ref, score: -1 };
    // 2) lo más cercano a la mano o al rayo de la mira
    let best = null;
    for (const p of this.items.values()) {
      if (!ok(p)) continue;
      const t = p.body.translation();
      const c = V1.set(t.x, t.y + p.def.oy * 0.6, t.z);
      const dh = c.distanceTo(handPos);
      const rel = c.clone().sub(camPos);
      const along = rel.dot(camDir);
      const perp = rel.addScaledVector(camDir, -along).length();
      const size = p.def.r || Math.max(p.def.hx || 0, p.def.hy || 0, p.def.hz || 0) || 0.2;
      const s1 = dh - size;
      const s2 = along > 0.2 && along < 2.4 ? perp - size + 0.02 : 9;
      const score = Math.min(s1, s2);
      if (score < 0.6 && (!best || score < best.score)) best = { prop: p, score };
    }
    return best;
  }

  // La mano lo toma firme: cinemático, lo lleva la mano (ver heldPose). No choca con mi propio cuerpo.
  hold(p, side, bodyYaw) {
    if (!p) return;
    const r = p.body.rotation();
    const objYaw = HV.eu.setFromQuaternion(Q1.set(r.x, r.y, r.z, r.w), 'YXZ').y;
    const t = p.body.translation();
    p.kin = true;
    p.hold = { side, st: holdState(objYaw - bodyYaw), snap: 0, from: new THREE.Vector3(t.x, t.y, t.z), fromQ: Q1.clone(), pos: new THREE.Vector3(t.x, t.y, t.z), quat: Q1.clone(), prevPos: new THREE.Vector3(t.x, t.y, t.z), prevQuat: Q1.clone() };
    p.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    p.collider.setCollisionGroups(groups(GR.PROP, PROP_FILTER & ~GR.RAGDOLL));
    p.noSelfUntil = 0;
  }

  // Cada paso de física: la mano manda la pose (con una transición cortita al agarrarlo: "se viene a la mano")
  driveHeld(p, pos, quat, dt) {
    const h = p.hold;
    if (!h) return;
    h.prevPos.copy(h.pos); h.prevQuat.copy(h.quat);
    h.snap = Math.min(1, h.snap + dt / 0.12);
    const k = h.snap * h.snap * (3 - 2 * h.snap);
    h.pos.copy(h.from).lerp(pos, k);
    h.quat.copy(h.fromQ).slerp(quat, k);
    if (k >= 1) { h.from.copy(pos); h.fromQ.copy(quat); }
    p.vel.copy(h.pos).sub(h.prevPos).divideScalar(Math.max(dt, 1e-4));
    p.body.setNextKinematicTranslation({ x: h.pos.x, y: h.pos.y, z: h.pos.z });
    p.body.setNextKinematicRotation({ x: h.quat.x, y: h.quat.y, z: h.quat.z, w: h.quat.w });
  }

  // Lo que se ve de lo que tengo en la mano (a la pose dibujada del cuerpo, no a la del paso de física)
  showHeld(p, pos, quat) {
    const k = p.hold ? (p.hold.snap < 1 ? p.hold.snap * p.hold.snap * (3 - 2 * p.hold.snap) : 1) : 1;
    if (k < 1) { p.group.position.copy(p.hold.from).lerp(pos, k); p.group.quaternion.copy(p.hold.fromQ).slerp(quat, k); }
    else { p.group.position.copy(pos); p.group.quaternion.copy(quat); }
  }

  // Deja de estar en la mano: vuelve a ser físico con la velocidad que traía (revolear moviendo el brazo)
  _unhold(p) {
    if (!p.kin) return;
    const h = p.hold;
    p.kin = false;
    p.hold = null;
    p.body.setBodyType(p.dynamic ? RAPIER.RigidBodyType.Dynamic : RAPIER.RigidBodyType.KinematicPositionBased, true);
    if (!p.dynamic || !h) return;
    p.body.setTranslation({ x: h.pos.x, y: h.pos.y, z: h.pos.z }, true);
    p.body.setRotation({ x: h.quat.x, y: h.quat.y, z: h.quat.z, w: h.quat.w }, true);
    this.setVelocity(p, p.vel);
    // giro que traía (de la diferencia entre las dos últimas poses, por el camino corto)
    const dq = Q1.copy(h.quat).multiply(HV.q.copy(h.prevQuat).invert());
    if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w);
    const ang = 2 * Math.acos(clamp(dq.w, -1, 1));
    if (ang > 1e-4) {
      const s = Math.sqrt(Math.max(1e-8, 1 - dq.w * dq.w));
      const w = Math.min(30, ang * 60);
      p.body.setAngvel({ x: (dq.x / s) * w, y: (dq.y / s) * w, z: (dq.z / s) * w }, true);
    }
    p.body.wakeUp();
  }

  claimForHand(p, side) {
    if (p.heldBy && p.heldBy !== G.myId) return false;
    this.net.send({ t: 'pc', id: p.id });
    this.net.send({ t: 'ph', id: p.id, h: 1 });
    p.owner = G.myId;
    p.heldBy = G.myId;
    this._applyAuthority(p);
    p.body.wakeUp();
    void side;
    return true;
  }

  gripAnchor(p) {
    const g = p.def.grip || [0, 0, 0];
    return { x: g[0], y: g[1], z: g[2] };
  }

  // ¿Este objeto viene a pegarle a alguien? (lo usa el cuerpo para decidir si un toque es un golpe)
  // Solo cuenta si alguien lo blande, si lo revolearon hace poco o si cae de arriba a toda velocidad;
  // un objeto que empujás caminando o que rueda por ahí no lastima.
  dangerOf(p) {
    if (!p) return null;
    const now = performance.now();
    if (p.heldBy && p.heldBy !== G.myId) {
      const rp = G.players.get(p.heldBy);
      return rp && (rp.stateData?.af & 3) ? { by: p.heldBy, thrown: false } : null;
    }
    if (p.thrownAt && now - p.thrownAt < 2500) {
      // lo mío recién soltado todavía está saliendo de mi mano
      if (p.thrownBy === G.myId && now - p.thrownAt < 700) return null;
      return { by: p.thrownBy === G.myId ? 0 : p.thrownBy || 0, thrown: true };
    }
    if (p.vel.y < -7) return { by: 0, thrown: true };
    return null;
  }

  // Lo revoleé yo: cuenta como revoleado y por un instante no choca con mi propio cuerpo
  // (antes el objeto le pegaba a la mano que lo soltaba y te lastimabas vos)
  markThrown(p) {
    if (!p) return;
    p.thrownAt = performance.now();
    p.thrownBy = G.myId;
    p._hitIds = null; // tiro nuevo: puede volver a pegarle a cualquiera
    this._noSelf(p, 0.35);
  }
  _noSelf(p, secs) {
    p.noSelfUntil = performance.now() + secs * 1000;
    p.collider.setCollisionGroups(groups(GR.PROP, PROP_FILTER & ~GR.RAGDOLL));
  }

  releaseFromHand(id, throwIt, handVel) {
    const p = this.items.get(id);
    if (!p) return;
    const stillHeld = ['l', 'r'].some((s) => this.local.hands[s].prop === id);
    if (stillHeld) return;
    this.net.send({ t: 'ph', id, h: 0 });
    p.heldBy = 0;
    p.thrownAt = performance.now();
    p.thrownBy = G.myId;
    p._hitIds = null;
    this._unhold(p);
    this._noSelf(p, 0.35);
    this._applyAuthority(p);
    if (throwIt && handVel && p.dynamic) {
      const v = p.body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > 2.2) {
        // un empujón extra en la dirección del movimiento (revolear se siente bien)
        const f = 1.35;
        const dir = (G.aimCam || G.camera).getWorldDirection(V1);
        this.setVelocity(p, { x: v.x * f + dir.x * 2.2, y: v.y * f + dir.y * 2.2 + 0.8, z: v.z * f + dir.z * 2.2 });
      }
    }
  }

  // Revolear un consumible (birra/aerosol) como objeto nuevo
  spawnThrow(type, pos, vel, extra = null) {
    const id = G.myId * 100000 + (this._spawnN++ % 99999);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), Math.random() * 6, 0));
    const row = [id, type, pos.x, pos.y, pos.z, q.x, q.y, q.z, q.w, G.myId, 0, extra];
    const p = this.addRow(row, { x: vel.x, y: vel.y, z: vel.z });
    if (p) {
      p.body.setAngvel({ x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 12 }, true);
      this.markThrown(p);
    }
    this.net.send({ t: 'pn', id, k: type, p: [pos.x, pos.y, pos.z], q: [q.x, q.y, q.z, q.w], v: [vel.x, vel.y, vel.z], ...(extra ? { x: heldState(extra) } : {}) });
    return p;
  }


  // Cuchillas de la cortadora: pican lo que agarran (si lo puedo simular yo). Devuelve el tipo picado o null
  chop(p) {
    if (!p || p.heldBy || (p.owner && p.owner !== G.myId)) return null;
    if (!CHOPPABLE.has(p.type)) return null;
    const t = p.body.translation();
    const pos = new THREE.Vector3(t.x, t.y + 0.2, t.z);
    this.onBreak?.(p, pos, p.def, 'chop');
    this.net.send({ t: 'pd', id: p.id });
    this.remove(p.id);
    return p.type;
  }

  heldType() {
    const id = this.local?.hands.r.prop || this.local?.hands.l.prop;
    return this.items.get(id)?.type || null;
  }

  // compat con el prompt viejo
  nearest(pos, max = 2.2) {
    let best = null, bd = max;
    for (const p of this.items.values()) {
      if (p.heldBy && p.heldBy !== G.myId) continue;
      const d = pos.distanceTo(p.group.position);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { item: best, dist: bd } : null;
  }

  _break(p) {
    const t = p.body.translation();
    this.onBreak?.(p, new THREE.Vector3(t.x, t.y, t.z), p.def);
    this.net.send({ t: 'pd', id: p.id });
    this.remove(p.id);
  }

  // Fijar la velocidad desde el código (revolear, soltar con envión): no es un impacto.
  // Se actualiza la referencia de la rotura y hay un instante de gracia.
  setVelocity(p, v, grace = 0.15) {
    if (!p?.body) return;
    p.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
    p.lastV.set(v.x, v.y, v.z);
    p.noBreakSteps = Math.ceil(grace * 60); // pasos de física (no reloj: igual en la prueba y en el juego)
  }

  // Un objeto que revoleé tocó el cuerpo de otro jugador: aviso el golpe (él lo valida y decide el daño).
  // Uno por víctima y por tiro; la velocidad es la de llegada (la del paso anterior al choque).
  _thrownHits(p) {
    const W = G.phys.world;
    W.contactPairsWith(p.collider, (other) => {
      const info = G.phys.info(other);
      const remote = info?.kind === 'remote';
      const npc = (info?.kind === 'bag' || info?.kind === 'npc') && info.ref?.punch ? info.ref : null;
      if ((!remote && !npc) || (p.mass ?? 1) < .04) return;
      const key = remote ? info.id : npc;
      if ((p._hitIds || (p._hitIds = new Set())).has(key)) return;
      let touching = false;
      W.contactPair(p.collider, other, (m) => { if (m.numContacts() > 0) touching = true; });
      if (!touching) return;
      const sp = p.lastV.length();
      if (sp < 4) return;
      p._hitIds.add(key);
      const t = other.translation(), point = new THREE.Vector3(t.x, t.y, t.z);
      if (remote) G.me?._claimHit(info.id, info.part ?? 1, Math.min(16, sp), point, p.type, 't');
      else {
        npc.punch(Math.min(16, sp), point, p.lastV.clone().normalize(), p.mass || 1, true, 'blunt');
        G.sfx?.trigger('hit', point, Math.min(1, sp / 12));
      }
    });
  }

  // Cambio de velocidad (m/s) que le dieron los contactos en el último paso: un choque de verdad
  _contactDv(p) {
    const W = G.phys.world;
    let imp = 0;
    W.contactPairsWith(p.collider, (other) => {
      W.contactPair(p.collider, other, (m) => {
        for (let j = 0; j < m.numContacts(); j++) imp += m.contactImpulse(j);
      });
    });
    return imp / Math.max(0.05, p.mass || 1);
  }

  // ---------------------------------------------------------------- por paso de física (solo los míos)
  physicsStep(dt) {
    const now = performance.now();
    for (const p of this.items.values()) {
      if (p.noSelfUntil && now > p.noSelfUntil) {
        p.noSelfUntil = 0;
        p.collider.setCollisionGroups(groups(GR.PROP, PROP_FILTER));
      }
      if (p.kin) continue; // en mi mano: la pose la pone el jugador (driveHeld)
      if (p.remoteHold?.ok) {
        // en la mano de otro: pegado a su mano (se calcula con su pose en update)
        const rh = p.remoteHold;
        p.body.setNextKinematicTranslation({ x: rh.pos.x, y: rh.pos.y, z: rh.pos.z });
        p.body.setNextKinematicRotation({ x: rh.quat.x, y: rh.quat.y, z: rh.quat.z, w: rh.quat.w });
        continue;
      }
      if (!p.dynamic) {
        // cinemático: seguir el estado de red suavemente
        const t = p.body.translation();
        const k = 1 - Math.exp(-16 * dt);
        const nx = t.x + (p.target.x - t.x) * k, ny = t.y + (p.target.y - t.y) * k, nz = t.z + (p.target.z - t.z) * k;
        p.vel.set((nx - t.x) / dt, (ny - t.y) / dt, (nz - t.z) / dt);
        p.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
        const r = p.body.rotation();
        Q1.set(r.x, r.y, r.z, r.w).slerp(p.targetQ, k);
        p.body.setNextKinematicRotation({ x: Q1.x, y: Q1.y, z: Q1.z, w: Q1.w });
        continue;
      }
      const v = p.body.linvel();
      p.vel.set(v.x, v.y, v.z);
      // lo que revoleé yo: si le pega a otro jugador, aviso el golpe con la velocidad que traía
      if (p.thrownBy === G.myId && p.thrownAt && now - p.thrownAt < 3000) this._thrownHits(p);
      // rotura por impacto: cambio brusco de velocidad que venga de un contacto real (no de revolearlo,
      // de soltarlo con envión ni de pasar a simularlo yo)
      if (p.noBreakSteps > 0) p.noBreakSteps--;
      else if (p.def.breakDv && !p.heldBy) {
        const dv = Math.hypot(v.x - p.lastV.x, v.y - p.lastV.y, v.z - p.lastV.z);
        if (dv > p.def.breakDv && this._contactDv(p) > p.def.breakDv * 0.8) { this._break(p); continue; }
      }
      p.lastV.set(v.x, v.y, v.z);
      const t = p.body.translation();
      if (t.y < -20) { p.body.setTranslation({ x: t.x, y: 2, z: t.z }, true); p.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
    }
  }

  _syncMesh(p) {
    const t = p.body.translation(), r = p.body.rotation();
    p.group.position.set(t.x, t.y, t.z);
    p.group.quaternion.set(r.x, r.y, r.z, r.w);
  }

  // Objeto en la mano de otro jugador: se calcula con SU pose dibujada (la misma cuenta que en su cliente),
  // así queda pegado a la mano en vez de ir atrás con la red. Devuelve false si no se puede (sin datos).
  _remoteHold(p, dt) {
    const rp = G.players.get(p.heldBy);
    const st = rp?.stateData, pose = rp?._pose;
    if (!st || !pose || pose.length < 11 || !rp.char?.meta?.gripLocal) { if (p.remoteHold) p.remoteHold.ok = false; return false; }
    let side = null, two = false;
    if (st.hd === p.id && st.hl === p.id) { two = true; side = st.tw === 'l' ? 'l' : 'r'; }
    else if (st.hd === p.id) side = 'r';
    else if (st.hl === p.id) side = 'l';
    if (!side) { if (p.remoteHold) p.remoteHold.ok = false; return false; }
    let rh = p.remoteHold;
    if (!rh || rh.side !== side) {
      const objYaw = HV.eu.setFromQuaternion(p.group.quaternion, 'YXZ').y;
      rh = p.remoteHold = {
        side, st: holdState(objYaw - (rp.yaw || 0)), pos: p.group.position.clone(), quat: p.group.quaternion.clone(),
        from: p.group.position.clone(), fromQ: p.group.quaternion.clone(), t: 0, hand: new THREE.Vector3(), elbow: new THREE.Vector3(),
        q: new THREE.Quaternion(), g1: new THREE.Vector3(), g2: new THREE.Vector3(), R: new THREE.Vector3(), prev: p.group.position.clone(),
      };
    }
    const tr = pose[side === 'l' ? 4 : 6];
    rh.elbow.set(tr[0], tr[1], tr[2]);
    rh.q.set(tr[3], tr[4], tr[5], tr[6]);
    rh.hand.copy(rp.char.meta.gripLocal[side]).applyQuaternion(rh.q).add(rh.elbow);
    const yaw = rp.yaw || 0;
    heldQuat(p.type, rh.st, rh.hand, rh.elbow, yaw, dt, rh.quat);
    rh.R.set(-Math.cos(yaw), 0, Math.sin(yaw));
    gripPoints(p.type, two, side === 'r', rh.R, rh.quat, rh.g1, rh.g2);
    heldPos(rh.hand, rh.quat, rh.g1, rh.pos);
    // la mano (o las dos) acomoda la muñeca al mango (lo usa su personaje en el cuadro siguiente)
    const ch = rp.char;
    if (ch?.gripAxis?.[side] && handleAxis(p.type, rh.quat, ch.gripAxis[side])) {
      ch.gripOn[side] = true;
      if (two) { const o = side === 'l' ? 'r' : 'l'; ch.gripAxis[o].copy(ch.gripAxis[side]); ch.gripOn[o] = true; }
    }
    // al agarrarlo "viene a la mano" en un instante
    rh.t = Math.min(1, rh.t + dt / 0.12);
    const k = rh.t * rh.t * (3 - 2 * rh.t);
    rh.prev.copy(p.group.position);
    p.group.position.copy(rh.from).lerp(rh.pos, k);
    p.group.quaternion.copy(rh.fromQ).slerp(rh.quat, k);
    if (k < 1) { rh.pos.copy(p.group.position); rh.quat.copy(p.group.quaternion); }
    p.vel.copy(p.group.position).sub(rh.prev).divideScalar(Math.max(dt, 1e-4));
    rh.ok = true;
    return true;
  }

  update(dt) {
    // objetos chicos lejos no se dibujan (con la bruma no se ven y eran cientos de llamadas de dibujo)
    const cam = G.camera?.position;
    for (const p of this.items.values()) {
      if (p.kin) { /* en mi mano: lo dibuja el jugador a su pose (showHeld) */ }
      else if (p.heldBy && p.heldBy !== G.myId && this._remoteHold(p, dt)) { /* pegado a la mano del otro */ }
      else { if (p.remoteHold) p.remoteHold = null; this._syncMesh(p); }
      if (cam) {
        const lim = p.mass > 5 ? 130 : 85;
        p.group.visible = !!p.heldBy || p.group.position.distanceToSquared(cam) < lim * lim;
        // lo que tiene en la mano el Diablo invisible tampoco se ve (si no, flota solo)
        if (p.heldBy && p.heldBy !== G.myId && G.players.get(p.heldBy)?.inv) p.group.visible = false;
      }
    }
    this._sendT += dt;
    if (this._sendT < 1 / 15) return;
    this._sendT = 0;
    const u = [];
    for (const p of this.items.values()) {
      if (!p.dynamic) continue;
      const sleeping = p.body.isSleeping() || (p.vel.lengthSq() < 0.0004 && !p.heldBy);
      if (sleeping) {
        if (p.sentSleep) continue;
        p.sentSleep = true;
      } else p.sentSleep = false;
      const t = p.body.translation(), r = p.body.rotation();
      u.push([p.id, +t.x.toFixed(3), +t.y.toFixed(3), +t.z.toFixed(3), +r.x.toFixed(4), +r.y.toFixed(4), +r.z.toFixed(4), +r.w.toFixed(4)]);
      if (u.length >= 100) break;
    }
    if (u.length) this.net.send({ t: 'ps', u });
  }
}
