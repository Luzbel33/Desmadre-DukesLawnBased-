import * as THREE from 'three';
import { G } from '../core/G.js';
import { heldType, heldState } from '../shared/held-items.js';

// G throws; Q/E and the empty-hand slot release gently. Clear the hand only
// after a real physical object has been created, including at zero hand speed.
export function releaseEquipped(player, side, { throwing = false, direction = null, velocity = null } = {}) {
  const hand = player.hands?.[side], type = heldType(hand?.item);
  if (!type || !G.props?.spawnThrow) return false;
  const dir = direction?.clone() || (G.aimCam || G.camera)?.getWorldDirection(new THREE.Vector3()) || new THREE.Vector3(0, 0, 1);
  const pos = player.handPos(side, new THREE.Vector3()).addScaledVector(dir, .18);
  const handVel = (velocity?.clone() || player.handVelocity(side)).clampLength(0, 12);
  const vel = throwing ? dir.clone().multiplyScalar(14.5).addScaledVector(handVel, .3).add(new THREE.Vector3(0, 1.8, 0)) : handVel.multiplyScalar(.12).add(new THREE.Vector3(0, -.2, 0));
  if (![pos.x,pos.y,pos.z,vel.x,vel.y,vel.z].every(Number.isFinite)) return false;
  const prop = G.props.spawnThrow(type, pos, vel, heldState(hand));
  if (!prop) return false;
  hand.item = null; hand.bites = 0; hand.itemGeneration = (hand.itemGeneration || 0) + 1;
  player.onEvent?.('release', { side, prop: prop.id, equipped: true });
  return true;
}

// An owned dropped consumable becomes usable again on click, not a generic
// melee prop. Removal follows the same ownership protocol as other props.
export function recoverEquipped(player, side) {
  const hand = player.hands?.[side], prop = hand?.prop ? G.props?.get(hand.prop) : null;
  if (!prop?.def?.item || prop.owner !== G.myId || prop.heldBy !== G.myId) return false;
  const item = prop.def.item, state = heldState(prop.extra), id = prop.id;
  player.release(side, false);
  G.props.net.send({ t: 'pd', id }); G.props.remove(id);
  player.giveItem(item, side); player.hands[side].bites = state.bites;
  return true;
}
