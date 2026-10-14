// Equilibrio físico de un cuerpo parado (jugadores y NPCs), al estilo del Euphoria de GTA: nada de reglas fijas tipo
// "si choco a un NPC sale volando". Todo lo que empuja (una piña, una patada, un tiro, chocarse con alguien corriendo,
// llevarse puesta una pared, tropezar con algo bajo) es un IMPULSO: un cambio de velocidad del centro de masa (m/s),
// que sale de las velocidades y las masas de lo que choca. El cuerpo responde según cuánto le llegó:
//   - poco: se inclina y se rehace con los tobillos y la cadera (sin mover los pies)
//   - más: trastabilla, dando pasos para el lado del empujón hasta frenar (los pies van atrás del centro de masa)
//   - más de lo que puede frenar: se cae para ese lado (ragdoll con esa velocidad)
// Lo que puede frenar depende de él: en pedo, rengo o cansado de trastabillar aguanta menos; agachado, más; corriendo,
// lo que viene de frente lo absorbe mejor (va inclinado contra eso). Los golpes que se encadenan se suman.
// Choque entre dos cuerpos: impulso inelástico J = Δv·m1·m2/(m1+m2) por la normal; a cada uno le toca J/m. Así un
// corredor que embiste a uno parado lo voltea y él solo trastabilla; dos corriendo de frente se caen los dos;
// caminando se rozan y se corren un poco.
import { clamp } from '../core/G.js';

export const BODY_MASS = 75;

export class Balance {
  constructor() {
    this.vx = 0; this.vz = 0; // velocidad del centro de masa respecto de los pies (m/s, mundo)
    this.fatigue = 0; // trastabillar cansa: lo que sigue tumba más fácil
    this.mode = 'stand';
    this.leanX = 0; this.leanZ = 0; // inclinación para el dibujo (rad, mundo)
    this.trip = 0; // el último impulso fue en los pies (tropezón): cae de cara
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  // dv: impulso (m/s) en mundo. braceX/Z: dirección en la que el cuerpo ya venía inclinado (corriendo): lo que llega
  // en contra de eso se absorbe mejor. feet: fue en los pies (tropezón)
  hit(dvx, dvz, { braceX = 0, braceZ = 0, feet = false } = {}) {
    if (braceX || braceZ) {
      const bl = Math.hypot(braceX, braceZ) || 1, bx = braceX / bl, bz = braceZ / bl;
      const along = dvx * bx + dvz * bz; // negativo: contra la marcha
      if (along < 0) { dvx -= bx * along * 0.4; dvz -= bz * along * 0.4; }
    }
    this.vx += dvx; this.vz += dvz;
    this.trip = feet ? 1 : this.trip * 0.5;
  }
  // capacidad: cuánta velocidad de desequilibrio puede frenar dando pasos (m/s)
  capacity(o = {}) {
    let c = 3.6;
    c *= 1 - clamp(o.drunk || 0, 0, 1.4) * 0.3;
    if (o.limp) c *= 0.5;
    if (o.crouch) c *= 1.3;
    if (o.guard) c *= 1.15;
    c *= 1 - clamp(this.fatigue, 0, 1) * 0.35;
    if (this.trip > 0.5) c *= 0.7;
    return c;
  }
  // devuelve { mode: 'stand' | 'stagger' | 'fall', mx, mz (cuánto se desplaza el cuerpo, m/s), fall: {x, z} }
  update(dt, o = {}) {
    const sp = this.speed, cap = this.capacity(o);
    const out = this._out || (this._out = { mode: 'stand', mx: 0, mz: 0, fx: 0, fz: 0 });
    out.mx = 0; out.mz = 0;
    if (sp > cap) {
      // no lo puede frenar: al piso, para donde iba
      out.mode = 'fall'; out.fx = this.vx; out.fz = this.vz;
      this.vx = 0; this.vz = 0; this.fatigue = 0; this.mode = 'stand'; this.leanX = 0; this.leanZ = 0;
      return out;
    }
    if (sp > 1.1) {
      // trastabilla: el cuerpo viaja con el empujón y los pasos lo van frenando (más rápido cuanto más fresco está)
      this.mode = 'stagger';
      out.mode = 'stagger'; out.mx = this.vx; out.mz = this.vz;
      const brake = (5.5 - this.fatigue * 2) * dt, k = Math.max(0, sp - brake) / sp;
      this.vx *= k; this.vz *= k;
      this.fatigue = Math.min(1, this.fatigue + dt * 0.9);
    } else {
      // tobillos y cadera: se rehace sin mover los pies
      this.mode = sp > 0.15 ? 'lean' : 'stand';
      out.mode = 'stand';
      const k = Math.exp(-6 * dt);
      this.vx *= k; this.vz *= k;
      this.fatigue = Math.max(0, this.fatigue - dt * 0.35);
    }
    // la inclinación (lo que se ve): el torso se va con el empujón y vuelve
    const lk = 1 - Math.exp(-14 * dt);
    this.leanX += (clamp(this.vx * 0.13, -0.5, 0.5) - this.leanX) * lk;
    this.leanZ += (clamp(this.vz * 0.13, -0.5, 0.5) - this.leanZ) * lk;
    return out;
  }
  reset() { this.vx = this.vz = 0; this.fatigue = 0; this.leanX = this.leanZ = 0; this.mode = 'stand'; this.trip = 0; }
}

// Choque de dos cuerpos parados (cápsulas). a, b: { x, z, vx, vz, m }; n: normal de a hacia b. Devuelve el impulso
// (m/s) que le toca a cada uno, o null si no se acercan
export function bodyImpulse(a, b, nx, nz, e = 0) {
  const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz; // a se acerca a b
  if (vn < 0.4) return null;
  const J = vn * (1 + e) * (a.m * b.m) / (a.m + b.m);
  return { a: -J / a.m, b: J / b.m, vn };
}
