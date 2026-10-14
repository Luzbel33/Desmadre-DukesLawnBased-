// La gente reacciona a lo que pasa alrededor (como los peatones de GTA): antes cada NPC seguía su guion pase lo que pase
// (un tiro al lado y el vendedor seguía saludando). Ahora:
//  - un tiro o una explosión cerca: huyen corriendo con los brazos sobre la cabeza, gritando y mirando para atrás; los que
//    estaban muy cerca se tiran al piso y se cubren la cabeza temblando. Los guardias (y algún guapo) van al humo.
//  - una pelea cerca: se paran a mirar (alguno se acerca, otros se alejan) y la comentan; los miedosos se van.
//  - sangre o un muerto cerca: gritan y huyen.
//  - si les apuntás con un arma: manos arriba, ruegan y retroceden; si seguís, salen corriendo.
//  - cuando se calma (lejos y sin nada nuevo), vuelven caminando a su lugar y retoman lo que hacían.
// Cada uno tiene su carácter (bravura, sacada del nombre): no todos hacen lo mismo. Sentados se paran; las bailarinas
// (noCollide: coreografía armada a mano) no se tocan.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { startNpcDefense } from './npc-defense.js';

const V1 = new THREE.Vector3();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const LINES = {
  flee: ['¡AAAH! ¡CORRAN!', '¡Está loco!', '¡Llamen a alguien!', '¡No me mates!', '¡Socorro!', '¡Rajemos!'],
  cower: ['¡No, no, no!', 'Por favor...', '¡Mamá!', 'No vi nada, no vi nada...'],
  watch: ['¡Pelea! ¡Pelea!', 'Uh, le dio con todo.', '¡Dale, matalo!', 'Esto se pudre.', 'Andá a saber quién empezó.', '¡Sepárenlos!'],
  hands: ['¡Tranquilo! ¡Tranquilo!', 'No tengo nada, ¡te lo juro!', 'Bajá eso, loco...', '¡No dispares!'],
  gore: ['¡¿QUÉ ES ESO?!', '¡Lo mataron!', '¡Hay sangre por todos lados!', '¡Dios mío!'],
};
const bravery = (n) => { if (n._brave !== undefined) return n._brave; let h = 7; for (const c of n.name || '') h = (h * 31 + c.charCodeAt(0)) | 0; return (n._brave = (Math.abs(h) % 1000) / 1000); };
const isGuard = (n) => /guardia|guard|patovica|portero|sargento|toro/i.test(n.name + ' ' + (n.data?.key || '') + ' ' + (n.look?.model || ''));

// algo pasó en `pos`: kind = 'shot' | 'blast' | 'fight' | 'gore' ; by = id del jugador que lo causó (0 si nadie)
export function alarmPeds(pos, kind, by = 0) {
  const R = { shot: 32, blast: 40, fight: 11, gore: 14 }[kind] || 12;
  for (const n of G.allNpcs?.() || []) {
    if (!n.char || n.dead || n.noCollide || n.down > 0) continue;
    const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z);
    if (d > R || Math.abs(n.pos.y - pos.y) > 6) continue;
    reactTo(n, pos, kind, d, by);
  }
}
// alguien le apunta con un arma a este NPC (lo llama main.js mientras apuntás)
export function aimedAt(n, from) {
  if (!n?.char || n.dead || n.noCollide || n.down > 0 || n.defense) return;
  const r = n.react;
  if (r && (r.mode === 'flee' || r.mode === 'cower')) { r.t = Math.max(r.t, 3); return; }
  if (isGuard(n) && G.me) { startNpcDefense(n, G.me); return; }
  if (!r || r.mode !== 'hands') { n.react = { mode: 'hands', t: 2.5, src: from.clone(), sayT: 0 }; standUp(n); n.say?.(pick(LINES.hands), 2); }
  else { n.react.t = 2.5; n.react.src.copy(from); }
  n.react.aimed = (n.react.aimed || 0) + 1;
}

function standUp(n) { if (n.sit) { n.sit = false; n.table = false; } n.emote = null; }

function reactTo(n, pos, kind, d, by) {
  const b = bravery(n), r = n.react;
  // los guardias no huyen: van al lío si lo causó el jugador local y si no, se quedan mirando. Algún guapo se mete en
  // una pelea a piñas (con tiros, no: nadie es tan guapo)
  if (isGuard(n)) {
    if (by && by === G.myId && kind !== 'gore') { if (!n.defense && G.me) startNpcDefense(n, G.me, 14); }
    else if (!n.react) start(n, 'watch', pos, 6);
    return;
  }
  if (kind === 'fight' && by && by === G.myId && b > 0.93 && d < 8) {
    if (!n.defense && G.me) startNpcDefense(n, G.me, 10);
    return;
  }
  if (n.defense) return;
  const now = G.time || 0;
  if (kind === 'fight') {
    if (r && r.mode !== 'watch') return; // ya huyendo/cubierto: más fuerte que una pelea
    if (b < 0.2) { start(n, 'flee', pos, 6 + b * 6); return; }
    if (!r) { start(n, 'watch', pos, 6 + Math.random() * 4); if (Math.random() < 0.5) n.say?.(pick(LINES.watch), 2.2); }
    else { r.t = Math.max(r.t, 5); r.src.copy(pos); }
    return;
  }
  // tiro, explosión, sangre
  const close = d < (kind === 'blast' ? 9 : 6);
  if (close && Math.random() < 0.6 - b * 0.3 && kind !== 'gore') start(n, 'cower', pos, 4 + Math.random() * 3);
  else start(n, 'flee', pos, 8 + Math.random() * 6 - b * 3);
  if ((n._scrT || 0) < now) { n._scrT = now + 2 + Math.random() * 2; n.vocal?.('scream'); n.say?.(pick(kind === 'gore' ? LINES.gore : n.react.mode === 'cower' ? LINES.cower : LINES.flee), 2); }
}

function start(n, mode, pos, t) {
  standUp(n);
  const prev = n.react;
  if (prev && prev.mode === mode) { prev.t = Math.max(prev.t, t); prev.src.copy(pos); return; }
  n.react = { mode, t, src: pos.clone(), dir: null, turnT: 0, sayT: 1 + Math.random() * 2 };
  n.stag = null;
}

// un paso de la reacción (lo llama Npc.update en vez del rol). Devuelve false si no hay reacción en curso
export function stepReaction(n, dt) {
  const r = n.react;
  if (!r) return false;
  if (n.dead || n.down > 0) { n.react = null; return false; }
  r.t -= dt;
  const away = V1.set(n.pos.x - r.src.x, 0, n.pos.z - r.src.z);
  const dist = away.length() || 1;
  away.multiplyScalar(1 / dist);
  n.action = null; n.crouch = false;
  if (r.mode === 'flee') {
    // corre para el lado contrario; si se traba contra algo, dobla; cada tanto mira para atrás y grita
    r.turnT -= dt;
    if (!r.dir || r.turnT <= 0 || n.blocked) {
      const a = Math.atan2(away.x, away.z) + (n.blocked ? (Math.random() < 0.5 ? 1 : -1) * (0.8 + Math.random() * 0.7) : (Math.random() - 0.5) * 0.7);
      r.dir = { x: Math.sin(a), z: Math.cos(a) }; r.turnT = 0.8 + Math.random() * 0.8;
    }
    const sp = 5.4;
    n.pos.x += r.dir.x * sp * dt; n.pos.z += r.dir.z * sp * dt;
    n.baseYaw = Math.atan2(r.dir.x, r.dir.z);
    n.lookAt = Math.sin((G.time || 0) * 0.9 + n.pos.x) > 0.7 ? r.src : null; // mira para atrás de a ratos
    n.action = 'panic'; n.actionT = (n.actionT || 0) + dt; n.actionEnd = 99;
    r.sayT -= dt;
    if (r.sayT <= 0) { r.sayT = 2.5 + Math.random() * 3; if (Math.random() < 0.6) n.vocal?.('scream'); else n.say?.(pick(LINES.flee), 1.8); }
    if (r.t <= 0 && dist > 18) r.mode = 'home';
    else if (r.t <= -6) r.mode = 'home';
  } else if (r.mode === 'cower') {
    // al piso, cubriéndose la cabeza, temblando; mira de reojo
    n.crouch = true; n.action = 'cower'; n.actionT = (n.actionT || 0) + dt; n.actionEnd = 99;
    n.lookAt = r.src;
    if (r.t <= 0) { r.mode = 'flee'; r.t = 5; }
  } else if (r.mode === 'watch') {
    // mira la pelea; si está muy cerca da un paso atrás, si está lejos se arrima un poco
    n.lookAt = r.src;
    n.baseYaw = Math.atan2(-away.x, -away.z);
    const want = 4.5;
    const step = dist < want - 1 ? -1 : dist > want + 3 ? 1 : 0;
    if (step) { n.pos.x -= away.x * step * 1.2 * dt; n.pos.z -= away.z * step * 1.2 * dt; }
    r.sayT -= dt;
    if (r.sayT <= 0) { r.sayT = 3 + Math.random() * 4; if (Math.random() < 0.5) n.say?.(pick(LINES.watch), 2); }
    if (r.t <= 0) r.mode = 'home';
  } else if (r.mode === 'hands') {
    // manos arriba, retrocede despacio sin dejar de mirarte; si le seguís apuntando un rato, sale corriendo
    n.lookAt = r.src; n.baseYaw = Math.atan2(-away.x, -away.z);
    n.action = 'handsup'; n.actionT = (n.actionT || 0) + dt; n.actionEnd = 99;
    n.pos.x += away.x * 0.7 * dt; n.pos.z += away.z * 0.7 * dt;
    r.sayT -= dt;
    if (r.sayT <= 0) { r.sayT = 2.5 + Math.random() * 2; n.say?.(pick(LINES.hands), 1.8); }
    if ((r.aimed || 0) > 60 * 4 && Math.random() < 0.02) { r.mode = 'flee'; r.t = 8; }
    if (r.t <= 0) r.mode = 'home';
  }
  if (r.mode === 'home') {
    // vuelve caminando a su lugar (y ahí retoma su rol)
    n.action = null; n.lookAt = null;
    const h = n.home?.pos;
    if (!h) { n.react = null; return false; }
    const dx = h.x - n.pos.x, dz = h.z - n.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.25) { n.react = null; n.baseYaw = n.home.yaw ?? n.baseYaw; return false; }
    const sp = Math.min(1.5, d / Math.max(dt, 1e-3));
    n.pos.x += (dx / d) * sp * dt; n.pos.z += (dz / d) * sp * dt;
    n.baseYaw = Math.atan2(dx, dz);
  }
  return true;
}
