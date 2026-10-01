import * as THREE from 'three';
import { G } from '../core/G.js';
const from = new THREE.Vector3(), delta = new THREE.Vector3();
export function startNpcDefense(npc, target, seconds = 10) {
  if (!target || target.dead || npc.dead) return false;
  npc.defense = { target, until: G.time + seconds, home: npc.home?.pos?.clone() || npc.pos.clone(), cooldown: .5, strike: 0, attacks: 0 };
  npc.sit = false; npc.table = false; npc.emote = null; npc.action = null;
  npc.say?.('¡Pará de pegar! ¡Defendete!', 2.3);
  return true;
}
export function stepNpcDefense(npc, dt) {
  const d = npc.defense;
  if (!d) return false;
  if (npc.dead || npc.down > 0 || npc.burnT > 0) return false;
  const step = Math.min(.1, Math.max(0, dt));
  const target = d.target;
  const returning = !target || target.dead || G.time > d.until || npc.pos.distanceTo(d.home) > 11 || Math.abs(target.pos.y - npc.pos.y) > 1.6;
  const goal = returning ? d.home : target.pos;
  const dx = goal.x - npc.pos.x, dz = goal.z - npc.pos.z, distance = Math.hypot(dx, dz);
  npc.sit = false; npc.table = false; npc.lookAt = goal;
  if (distance > .01) npc.baseYaw = Math.atan2(dx, dz);
  if (returning && distance < .12) { npc.defense = null; npc.speed = 0; return false; }
  const stop = returning ? .08 : 1.1, speed = returning ? 1.6 : distance > 4 ? 3 : 1.9;
  const travel = Math.min(Math.max(0, distance - stop), step * speed);
  if (distance > .001) { npc.pos.x += dx / distance * travel; npc.pos.z += dz / distance * travel; }
  npc.speed = step ? travel / step : 0;
  if (returning) { d.strike = 0; return true; }
  d.cooldown -= step;
  if (d.strike > 0) {
    d.strike -= step;
    if (d.strike <= 0 && distance < 1.55) {
      from.copy(npc.pos).y += 1.15;
      delta.copy(target.pos).y += 1.15; delta.sub(from);
      const len = delta.length(); if (len > .001) delta.divideScalar(len);
      const blocked = G.phys?.raycast?.(from.x, from.y, from.z, delta.x, delta.y, delta.z, Math.max(0, len - .1));
      if (!blocked) target.npcHit?.(npc.pos, d.kick ? 1 : 2, d.kick ? 7.5 : 6.5, d.kick ? 'k' : 'p');
    }
  }
  if (d.cooldown <= 0 && distance < 1.5 && !npc.action) {
    d.kick = ++d.attacks % 3 === 0; d.strike = d.kick ? .26 : .2; d.cooldown = 1.05;
    npc.action = d.kick ? 'kick' : 'punchR'; npc.actionT = 0; npc.actionEnd = d.kick ? .62 : .48;
  }
  return true;
}
