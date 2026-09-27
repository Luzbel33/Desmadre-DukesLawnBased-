// Brazos con peso (estilo Half Sword): cada mano es una masa que persigue su objetivo con un resorte
// amortiguado y aceleración limitada; lo que sostiene le suma inercia y la hace caer. Las piñas, los
// swings con armas, tomar, fumar y revolear son trayectorias que la mano PERSIGUE (no poses que se
// teletransportan): tienen envión, se pasan un poco de largo y el jugador choca contra lo que encuentran.
// Coordenadas locales = marco del cuerpo (x = izquierda, y = arriba, z = adelante), relativas al hombro.
import * as THREE from 'three';
import { clamp } from '../core/G.js';

export const ARM = {
  omega: 21, // rad/s: qué tan rápido persigue la mano sin carga
  zeta: 0.56, // < 1: un poco de rebote (se siente el peso)
  aMax: 175, // m/s² máximos sin carga
  sag: 2.6, // m/s² hacia abajo por el peso de lo que sostiene
  punchOmega: 32,
  punchKick: 3.2, // m/s de impulso al disparar la piña
  stance: 1.8, // s que las manos quedan en guardia después de pegar (postura de pelea)
  armedSpeed: 2.7, // m/s: desde acá un brazo controlado pega
  linger: 0.2, // s que sigue "armado" después de frenar
  yawMin: -0.85,
  yawMax: 1.3,
  pitchMin: -1.2,
  pitchMax: 1.45,
  sens: 0.0062, // rad por pixel del mouse
};

const T1 = new THREE.Vector3();
const T2 = new THREE.Vector3();
const ACC = new THREE.Vector3();

export class Arm {
  constructor(side) {
    this.side = side;
    this.out = side === 'l' ? 1 : -1; // hacia afuera en x local
    this.on = false; // botón sostenido: control libre con el mouse
    this.yaw = 0.2;
    this.pitch = 0;
    this.reach = 0.92;
    this.reachWant = 0.94; // rueda del mouse: acercar / estirar el brazo controlado
    this.script = null; // punch | swing | throw | drink | smoke | eat
    this.t = 0;
    this.dur = 0;
    this.aim = new THREE.Vector3(); // destino de la piña / el swing / el revoleo (local)
    this.p = new THREE.Vector3(); // mano (local, relativa al hombro)
    this.pp = new THREE.Vector3(); // mano en el paso anterior (para interpolar el dibujo)
    this.v = new THREE.Vector3();
    this.idle = new THREE.Vector3(); // dónde estaría la mano según la animación
    this.ready = false;
    this.w = 0; // peso del IK (0 = manda la animación)
    this.armed = 0; // s que le quedan pudiendo pegar
    this.speed = 0;
    this.kicked = false;
    this.released = false; // revoleo: ya soltó
    this.hitT = 0; // última vez que chocó (evita repetir)
    this.stance = 0; // s que le quedan en postura de pelea (mano en guardia en vez de colgando)
  }
  get busy() { return this.on || !!this.script; }
}

// Dirección local a partir de yaw (+ = hacia afuera) y pitch
export function dirLocal(a, yaw, pitch, out) {
  const cp = Math.cos(pitch);
  return out.set(a.out * Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
}

// Guardia / "cámara" de la piña: puño adelante del pecho (guardia alta: a la altura del mentón).
// No muy cerca de la cara: en primera persona los puños asoman abajo sin tapar la vista.
export function chamberLocal(a, out, high = 0) {
  return out.set(-a.out * (0.1 - high * 0.01), -0.02 + high * 0.12, 0.3 + high * 0.02);
}

// Tomar el control: si el brazo ya está arriba (guardia, piña, swing) sigue desde donde está la mano;
// si cuelga, se levanta hacia donde mirás (con el brazo colgando, mover el mouse de costado casi no lo mueve)
export function startControl(a, L, aimPitch = 0) {
  a.on = true;
  if (!a.ready || a.w < 0.5 || a.p.z < 0.15) {
    a.yaw = 0.15;
    a.pitch = clamp(aimPitch * 0.75 + 0.05, -0.9, ARM.pitchMax);
    a.reachWant = 0.9;
    a.reach = 0.9;
    return;
  }
  const len = Math.max(0.05, a.p.length());
  a.reachWant = clamp(len / L, 0.6, 0.97);
  a.reach = a.reachWant;
  a.pitch = clamp(Math.asin(clamp(a.p.y / len, -1, 1)), ARM.pitchMin, ARM.pitchMax);
  a.yaw = clamp(Math.atan2(a.out * a.p.x, a.p.z), ARM.yawMin, ARM.yawMax);
}

// Rueda del mouse con el brazo controlado: acercar (+) o estirar (-) la mano
export function reachControl(a, wheel) {
  a.reachWant = clamp(a.reachWant - wheel * 0.06, 0.45, 0.97);
  moveControl(a, 0, 0);
}

// Mueve el objetivo con el mouse. Devuelve cuánto movimiento sobró (px) al llegar al límite:
// el que llama lo usa para girar el cuerpo/la cámara (el brazo "arrastra" al cuerpo).
export function moveControl(a, dx, dy, sens = 1, invertY = false) {
  const k = ARM.sens * sens;
  // mouse a la derecha: el brazo derecho se abre, el izquierdo cruza
  const wantYaw = a.yaw + dx * k * -a.out;
  const wantPitch = a.pitch - dy * k * (invertY ? -1 : 1);
  a.yaw = clamp(wantYaw, ARM.yawMin, ARM.yawMax);
  a.pitch = clamp(wantPitch, ARM.pitchMin, ARM.pitchMax);
  // cruzando el cuerpo el brazo se acorta un poco (no atraviesa el pecho)
  a.reach = a.yaw < 0 ? Math.min(a.reachWant, clamp(0.94 + a.yaw * 0.18, 0.74, 0.95)) : a.reachWant;
  return [(wantYaw - a.yaw) / (k * -a.out), (wantPitch - a.pitch) / (-k * (invertY ? -1 : 1))];
}

export function startScript(a, kind, dur, aim = null) {
  a.script = kind;
  a.t = 0;
  a.dur = dur;
  a.kicked = false;
  a.released = false;
  if (aim) a.aim.copy(aim);
  if (kind === 'punch' || kind === 'swing') a.stance = ARM.stance;
}

// Un paso fijo de la mano. c = { L, mass, mouth (local), wheel (local | null), rest, guard, ready (local | null), grip }
export function stepArm(a, dt, c) {
  if (!a.ready) {
    a.p.copy(a.idle);
    a.pp.copy(a.idle);
    a.v.set(0, 0, 0);
    a.ready = true;
  }
  a.pp.copy(a.p);
  let omega = ARM.omega;
  let ik = 1;
  const goal = T1;
  if (a.script) {
    a.t += dt;
    if (a.t >= a.dur) a.script = null;
  }
  const L = c.L;
  switch (a.script) {
    case 'punch': {
      const t = a.t;
      if (t < 0.055) { chamberLocal(a, goal); goal.z -= 0.06; omega = 26; }
      else if (t < 0.19) {
        goal.copy(a.aim);
        omega = ARM.punchOmega;
        if (!a.kicked) {
          a.kicked = true;
          a.v.addScaledVector(T2.copy(a.aim).sub(a.p).normalize(), ARM.punchKick);
        }
        // pega a la ida, no mientras vuelve
        if (a.v.dot(T2.copy(a.aim).sub(a.p)) > -0.05) a.armed = ARM.linger * 0.6;
      } else { chamberLocal(a, goal); omega = 18; }
      break;
    }
    case 'swing': {
      // levantar atrás/afuera y bajar cruzando hacia adelante (armas)
      const t = a.t;
      if (t < 0.2) { goal.set(a.out * 0.28, 0.42, -0.04); omega = 15; }
      else if (t < 0.42) {
        goal.copy(a.aim);
        omega = 30;
        if (!a.kicked) { a.kicked = true; a.v.addScaledVector(T2.copy(a.aim).sub(a.p).normalize(), 3.6); }
        a.armed = ARM.linger;
      } else { goal.copy(a.idle); omega = 12; }
      break;
    }
    case 'throw': {
      const t = a.t;
      if (t < 0.17) { goal.set(a.out * 0.16, 0.34, -0.2); omega = 18; }
      else if (t < 0.34) {
        goal.copy(a.aim);
        omega = 32;
        if (!a.kicked) { a.kicked = true; a.v.addScaledVector(T2.copy(a.aim).sub(a.p).normalize(), 3.2); }
      } else { goal.copy(a.idle); omega = 12; }
      break;
    }
    case 'reach': {
      // ir hasta el objetivo y volver al apoyo (empujar fichas al pozo, tirar las cartas)
      const k = a.t / a.dur;
      if (k < 0.45) { goal.copy(a.aim); omega = 13; } else { goal.copy(c.rest || a.idle); omega = 11; }
      break;
    }
    case 'tap': {
      // dos golpecitos con los dedos sobre la mesa ("paso")
      const k = a.t / a.dur;
      goal.copy(a.aim);
      goal.y += Math.abs(Math.sin(k * Math.PI * 2)) * 0.05;
      omega = 24;
      break;
    }
    case 'drink':
    case 'smoke':
    case 'eat': {
      const k = a.t / a.dur;
      if (k < 0.22 || k > 0.78) { goal.copy(a.idle).lerp(c.mouth, k < 0.22 ? k / 0.22 : (1 - k) / 0.22); }
      else goal.copy(c.mouth);
      omega = 14;
      break;
    }
    default:
      if (c.guard) {
        chamberLocal(a, goal, 1);
        omega = 20;
      } else if (a.on) {
        dirLocal(a, a.yaw, a.pitch, goal).multiplyScalar(L * a.reach);
      } else if (c.wheel) {
        goal.copy(c.wheel);
        omega = c.grip ? 30 : 22; // la segunda mano en el mango sigue firme al arma
      } else if (c.ready) {
        // guardia con algo en la mano (el arma adelante, a la vista)
        goal.copy(c.ready);
        omega = 14;
      } else if (a.stance > 0) {
        // postura de pelea: después de pegar la mano queda arriba un rato (la próxima sale de la guardia)
        chamberLocal(a, goal);
        omega = 13;
      } else {
        goal.copy(a.idle);
        ik = 0;
      }
  }
  a.stance = Math.max(0, a.stance - dt);
  a.w = ik ? Math.min(1, a.w + dt * 14) : Math.max(0, a.w - dt * 3.5);
  // dinámica: resorte amortiguado; con peso es más lenta, se pasa más y se cae
  const m = Math.max(0, c.mass || 0);
  const heavy = 1 + 0.42 * m;
  const w = omega / Math.sqrt(heavy);
  const kp = w * w, kd = 2 * ARM.zeta * w;
  ACC.copy(goal).sub(a.p).multiplyScalar(kp).addScaledVector(a.v, -kd);
  ACC.y -= ARM.sag * (m / (1 + m)) * (a.on || a.script ? 1 : 0.4);
  const amax = ARM.aMax / (1 + 0.3 * m) * (a.script === 'punch' ? 0.75 : 1);
  const al = ACC.length();
  if (al > amax) ACC.multiplyScalar(amax / al);
  a.v.addScaledVector(ACC, dt);
  a.p.addScaledVector(a.v, dt);
  constrain(a, L);
  a.speed = a.v.length();
  if ((a.on || a.script === 'swing') && a.speed > ARM.armedSpeed) a.armed = ARM.linger;
  else a.armed = Math.max(0, a.armed - dt);
  return a;
}

// Límites del brazo: largo máximo, no meterse en el hombro ni atravesar el pecho
export function constrain(a, L) {
  const max = L * 0.985;
  let len = a.p.length();
  if (len > max) {
    a.p.multiplyScalar(max / len);
    const n = T2.copy(a.p).divideScalar(max);
    const radial = a.v.dot(n);
    if (radial > 0) a.v.addScaledVector(n, -radial);
    len = max;
  }
  if (len < 0.14) a.p.setLength(0.14);
  // pecho: caja adelante del tronco (centro del tronco a 0.18 m del hombro hacia adentro)
  const cx = -a.out * 0.18;
  if (Math.abs(a.p.x - cx) < 0.17 && a.p.y > -0.58 && a.p.y < 0.12 && a.p.z < 0.13) {
    a.p.z = 0.13;
    if (a.v.z < 0) a.v.z *= -0.2;
  }
}

// Giro del torso que acompaña a los brazos (la piña sale del hombro, el swing arrastra la cintura)
export function torsoTwist(arms) {
  let t = 0;
  for (const a of [arms.l, arms.r]) {
    if (!a.ready || a.w < 0.01) continue;
    const ext = clamp((a.p.z - 0.2) / 0.42, -0.6, 1);
    t += -a.out * (ext * 0.34 + clamp(a.v.z * 0.014, -0.15, 0.15)) * a.w;
    // brazo cruzando el cuerpo: el torso gira hacia ese lado
    t += clamp(-a.out * -a.p.x * 0.25, -0.12, 0.12) * a.w * 0.5;
  }
  return clamp(t, -0.55, 0.55);
}

// Inclinación del torso hacia adelante cuando los brazos se estiran
export function torsoLean(arms) {
  let e = 0;
  for (const a of [arms.l, arms.r]) if (a.ready && a.w > 0.01) e = Math.max(e, clamp((a.p.z - 0.3) / 0.35, 0, 1) * a.w);
  return e * 0.12;
}
