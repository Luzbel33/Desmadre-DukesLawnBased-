// Control de interacción física. La animación y las actividades permanecen en player-core.js.
// Estar de pie sigue usando el controlador cinemático; esto no es aún un active-ragdoll completo.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { GR, groups, RAPIER } from '../core/physics.js';
import { LocalPlayer as PlayerCore, RemotePlayer as RemoteCore, PROXY_FILTER as BASE_PROXY_FILTER } from './player-core.js';
export * from './player-core.js';

const BODY_Y = 0.80;
export const PROXY_FILTER = BASE_PROXY_FILTER | GR.ME;
const WALK_GROUPS = groups(GR.ME, GR.WORLD | GR.VEHICLE | GR.REMOTE);
const round = n => Math.round(n * 1000) / 1000;

export class LocalPlayer extends PlayerCore {
  constructor(look, opts = {}) {
    super(look, opts);
    this.collider.setCollisionGroups(WALK_GROUPS);
    this.controller.setApplyImpulsesToDynamicBodies(false);
  }

  _dropGrip(key) {
    const joint = this.grabbedBy.get(key);
    if (!joint) return;
    if (joint.isValid()) G.phys.world.removeImpulseJoint(joint, true);
    this.grabbedBy.delete(key);
    this.held = this.grabbedBy.size;
    if (!this.held && this.state === 'ko') this.koT = Math.max(this.koT, .5);
  }

  _clearIncomingGrips() {
    if (!this.grabbedBy) return;
    for (const key of this.grabbedBy.keys()) this._dropGrip(key);
  }

  _pruneGrips() {
    for (const [key, joint] of this.grabbedBy) {
      const id = Number(key.split(':')[0]);
      const remote = G.players.get(id);
      if (!remote?.proxy?.alive || !joint.isValid()) this._dropGrip(key);
    }
    for (const side of ['l', 'r']) {
      const h = this.hands[side];
      if (h.player && !G.players.get(h.player)?.proxy?.alive) this.release(side, false);
    }
    this.held = this.grabbedBy.size;
  }

  // El dueño del cuerpo arrastrado simula el resorte. Repetir un paquete no crea otro agarre.
  grabbedByRemote(id, side, part, anchor, on) {
    if (!Number.isInteger(id) || id === G.myId || !['l', 'r'].includes(side)) return false;
    const key = `${id}:${side}`;
    if (!on) { this._dropGrip(key); return true; }
    if (this.grabbedBy.get(key)?.isValid()) return true;
    if (!Number.isInteger(part) || part < 0 || part >= this.rag.bodies.length ||
        !Array.isArray(anchor) || anchor.length !== 3 || !anchor.every(Number.isFinite) ||
        Math.hypot(...anchor) > 1.5 || this.state === 'driving') return false;
    const rp = G.players.get(id);
    const fore = rp?.proxy?.bodies[side === 'l' ? 4 : 6];
    const grip = rp?.char?.meta?.gripLocal?.[side];
    const mine = this.rag.bodies[part];
    if (!rp?.proxy?.alive || !fore || !grip || !mine || (this.gore & (1 << part))) return false;
    const handWorld = new THREE.Vector3().copy(grip).applyQuaternion(fore.rotation()).add(fore.translation());
    const anchorWorld = new THREE.Vector3(...anchor).applyQuaternion(mine.rotation()).add(mine.translation());
    if (handWorld.distanceTo(anchorWorld) > 1.4) return false;
    if (this.seat) this.standUp();
    for (const hand of ['l', 'r']) if (this.hands[hand].joint) this.release(hand, false);
    if (!this.dead) { this.state = 'ko'; this.koT = Math.max(this.koT, .6); }
    this.strength = 0;
    this._toRag();
    const data = RAPIER.JointData.spring(.02, 1800, 120, {x:grip.x,y:grip.y,z:grip.z}, {x:anchor[0],y:anchor[1],z:anchor[2]});
    const joint = G.phys.world.createImpulseJoint(data, fore, mine, true);
    joint.setContactsEnabled(false);
    this.grabbedBy.set(key, joint);
    this.held = this.grabbedBy.size;
    return true;
  }

  // Soltar MIS manos no debe borrar las manos ajenas que todavía sostienen mi cuerpo.
  releaseAll(keepItems = false) {
    for (const side of ['l', 'r']) {
      const h = this.hands[side];
      if (h.joint) this.release(side, false);
      else if (!keepItems) h.item = null;
    }
    this.held = this.grabbedBy.size;
  }

  teleport(pos, yaw = this.yaw) {
    this._clearIncomingGrips();
    super.teleport(pos, yaw);
  }

  respawn() {
    this._clearIncomingGrips();
    super.respawn();
  }

  physicsStep(dt, viewYaw) {
    this._pruneGrips();
    // Un cuerpo KO cae libre: no hay un servo de pelvis peleándose con quien lo arrastra.
    if (this.physMode === 'rag') this.strength = 0;
    this.collider.setEnabled(this.physMode !== 'rag');
    super.physicsStep(dt, viewYaw);
    if (!G.inGame) return;
    if (this.physMode === 'rag') {
      const pt = this.rag.pelvis().translation();
      this.body.setNextKinematicTranslation({x:pt.x,y:pt.y-this.meta.jointRest[0].y+BODY_Y,z:pt.z});
      return;
    }
    if (!['active', 'stun', 'getup'].includes(this.state) || !G.players.size) return;
    // Segunda consulta con los proxies remotos. La primera conserva el movimiento y las rampas
    // existentes; esta también incluye el mundo para que deslizarse no cruce una pared.
    const from = this.body.translation(), next = this.body.nextTranslation();
    const desired = {x:next.x-from.x,y:next.y-from.y,z:next.z-from.z};
    this.controller.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, WALK_GROUPS);
    const movement = this.controller.computedMovement();
    this.body.setNextKinematicTranslation({x:from.x+movement.x,y:from.y+movement.y,z:from.z+movement.z});
    this.speed = Math.hypot(movement.x, movement.z) / dt;
    this.fwdSpeed = (movement.x*Math.sin(viewYaw)+movement.z*Math.cos(viewYaw))/dt;
  }

  afterPhysics() {
    super.afterPhysics();
    if (this.physMode !== 'rag') return;
    const pt = this.rag.pelvis().translation();
    this.pos.set(pt.x, pt.y-this.meta.jointRest[0].y, pt.z);
  }

  // Esperar apoyo y velocidad baja antes de recuperar la pose. Nunca bajar mágicamente al y=0.
  _startGetup() {
    if (this.held || this.dead) return;
    const pelvis = this.rag.pelvis(), pt = pelvis.translation(), velocity = pelvis.linvel();
    const support = G.phys.raycast(pt.x, pt.y+.12, pt.z, 0, -1, 0, 1.15, groups(GR.ME, GR.WORLD | GR.VEHICLE));
    if (!support || support.ny < .55 || Math.abs(velocity.y) > 1.3 || Math.hypot(velocity.x,velocity.z) > 2.8) {
      this.koT = Math.max(this.koT, .2);
      return;
    }
    super._startGetup();
    this.pos.y = support.y+.02;
    this.previousPos.copy(this.pos);
    const center = {x:this.pos.x,y:this.pos.y+BODY_Y,z:this.pos.z};
    this.body.setTranslation(center, true);
    this.body.setNextKinematicTranslation(center);
    this.collider.setEnabled(true);
  }

  update(dt) {
    this._pruneGrips();
    super.update(dt);
    if (this.physMode === 'rag') this.strength = 0;
  }

  netState() {
    const state = super.netState();
    if (this.physMode === 'rag') {
      // El render se interpola y puede ir un cuadro atrás. La autoridad manda la física actual.
      const pose = this.rag.read();
      state.rb = pose.flat().map(round);
      state.p = [round(pose[0][0]), round(pose[0][1]-this.meta.jointRest[0].y), round(pose[0][2])];
    }
    return state;
  }

  dispose() {
    this._clearIncomingGrips();
    super.dispose();
  }
}

export class RemotePlayer extends RemoteCore {
  constructor(data) {
    super(data);
    this.proxy.setGroups(GR.REMOTE, PROXY_FILTER);
  }

  dispose() {
    if (G.me?.grabbedBy) for (const key of G.me.grabbedBy.keys()) if (key.startsWith(`${this.id}:`)) G.me._dropGrip?.(key);
    super.dispose();
  }
}
