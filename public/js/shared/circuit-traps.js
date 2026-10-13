// Las trampas del tramo "Guts and Glory" del Circuito del Desmadre: dónde está cada una en cada momento. Se mueven
// con la hora del servidor (segundos), así todos los jugadores las ven igual sin mandarse nada. Lo usan
// world/circuit.js (lo que se ve) y game/race.js (a quién agarran).
import { CIRCUIT, circuitSamples } from './mapdata.js';

const GG = CIRCUIT.gg;
// x de la línea del medio en una de las dos rectas del norte (east: la que sube; si no, la que baja)
export function laneX(z, east) {
  let best = null, bd = Infinity;
  for (const p of circuitSamples()) {
    if ((east ? p[0] < -115 : p[0] > -115) || p[1] < 14 || p[1] > 80) continue;
    const d = Math.abs(p[1] - z);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? best[0] : east ? GG.east : GG.west;
}
const HALF = CIRCUIT.width / 2;
export const TRAPS = {
  // hacha péndulo que barre la pista de lado a lado (sube hacia el norte)
  axe: { x: laneX(GG.axe, true), z: GG.axe, pivotY: 7.9, len: 6.2, amp: 1.0, period: 3.1 },
  // cama de pinchos después de la rampa (hay que saltarla)
  spikes: { x: laneX((GG.spikes[0] + GG.spikes[1]) / 2, true), z0: GG.spikes[1], z1: GG.spikes[0], half: HALF },
  // dos sierras que salen de una ranura y van y vienen de lado a lado
  saws: { x: laneX(GG.saws, true), z: GG.saws, r: 1.05, y: 0.12, amp: HALF - 1.2, period: 2.6 },
  // la prensa (baja de golpe y sube despacio) en la recta que baja
  crusher: { x: laneX(GG.crusher, false), z: GG.crusher, top: 5.2, low: 0.75, depth: 3.0, period: 3.6 },
  // la bola de demolición que va y viene a lo largo de la pista
  ball: { x: laneX(GG.ball, false), z: GG.ball, pivotY: 8.6, len: 6.8, amp: 0.85, period: 3.9, r: 0.95 },
};
// minas (se pisan: explotan); se rearman solas
export const MINES = [];
{
  const [z0, z1] = GG.mines;
  const cols = [-2.6, 1.4, -0.6, 2.8, -3.2, 0.9];
  cols.forEach((dx, i) => { const z = z0 + (i / (cols.length - 1)) * (z1 - z0); MINES.push({ x: laneX(z, false) + dx, z }); });
}

const TAU = Math.PI * 2;
export function axeAngle(t) { const A = TRAPS.axe; return A.amp * Math.sin((t / A.period) * TAU); }
export function axeBlade(t, out = {}) {
  const A = TRAPS.axe, a = axeAngle(t), r = A.len;
  out.x = A.x + Math.sin(a) * r; out.y = A.pivotY - Math.cos(a) * r; out.z = A.z; out.a = a;
  out.vx = Math.cos(a) * r * A.amp * (TAU / A.period) * Math.cos((t / A.period) * TAU); // para dónde revolea
  return out;
}
export function sawX(t, k) { const S = TRAPS.saws; return S.x + Math.sin((t / S.period) * TAU + k * Math.PI) * S.amp; }
// la parte de abajo de la prensa: arriba esperando, baja de golpe (0,18 s), aplasta medio segundo y sube despacio
export function crusherY(t) {
  const C = TRAPS.crusher, u = ((t % C.period) + C.period) % C.period;
  if (u < 1.2) return C.top;
  if (u < 1.38) return C.top - (C.top - C.low) * ((u - 1.2) / 0.18) ** 2;
  if (u < 1.9) return C.low;
  return C.low + (C.top - C.low) * Math.min(1, (u - 1.9) / 1.5);
}
export function ballPos(t, out = {}) {
  const B = TRAPS.ball, a = B.amp * Math.sin((t / B.period) * TAU);
  out.x = B.x; out.y = B.pivotY - Math.cos(a) * B.len; out.z = B.z + Math.sin(a) * B.len; out.a = a;
  out.vz = Math.cos(a) * B.len * B.amp * (TAU / B.period) * Math.cos((t / B.period) * TAU);
  return out;
}
