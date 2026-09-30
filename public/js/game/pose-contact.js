// Animated bodies are kinematic: Rapier reports contacts but cannot stop their
// animation. Limit the attempted joint motion before submitting the bone poses.
import * as THREE from 'three';
import { RAPIER, GR, groups } from '../core/physics.js';
import { G } from '../core/G.js';

const FILTER = groups(0xffff, GR.WORLD | GR.REMOTE | GR.PROP | GR.VEHICLE | GR.DEBRIS);
const CHAINS = [[1, 2], [2], [3, 4], [5, 6], [7, 8], [9, 10]];
const UP = new THREE.Vector3(0, 1, 0);

export class PoseContact {
  constructor(player) {
    this.player = player;
    this.previous = null;
    this.safe = null;
    this.shapes = player.meta.caps.map(c => {
      const dir = c.b.clone().sub(c.a);
      return {
        shape: new RAPIER.Capsule(Math.max(.01, dir.length() / 2 - c.r * .35), c.r + .004),
        mid: c.a.clone().add(c.b).multiplyScalar(.5),
        rotation: new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()),
      };
    });
  }

  accepts(col) {
    const p = this.player, info = p.rag.phys.info(col);
    if (info?.ref === p || info?.kind === 'me' || info?.kind === 'player') return false;
    if (info?.kind === 'prop' && info.ref?.heldBy === G.myId) return false;
    return true;
  }

  shapePose(i, target) {
    const s = this.shapes[i];
    return { p: s.mid.clone().applyQuaternion(target.q).add(target.p), q: target.q.clone().multiply(s.rotation), shape: s.shape };
  }

  overlap(i, target) {
    const ph = this.player.rag.phys, s = this.shapePose(i, target);
    let found = null;
    ph.world.intersectionsWithShape(s.p, s.q, s.shape, col => {
      const c = col.contactShape(s.shape, s.p, s.q, .006);
      // Ground support is handled by the movement capsule; constrain the legs
      // against sides of steps, walls and props without freezing the walk cycle.
      if (!c || c.distance > .002 || (i >= 7 && ph.info(col)?.kind === 'world' && c.normal1.y > .65)) return true;
      if (!found || c.distance < found.contact.distance) found = { part: i, collider: col, contact: c, info: ph.info(col) };
      return true;
    }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, FILTER, null, null, col => this.accepts(col));
    return found;
  }

  swept(i, target) {
    if (!this.previous) return null;
    const from = this.previous[i], s = this.shapePose(i, from), to = this.shapePose(i, target);
    const delta = to.p.clone().sub(s.p);
    if (delta.lengthSq() < .000001) return null;
    const ph = this.player.rag.phys;
    const hit = ph.world.castShape(s.p, s.q, delta, s.shape, .002, 1, false,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, FILTER, null, null, col => this.accepts(col));
    if (!hit || hit.time_of_impact >= .999 || (i >= 7 && ph.info(hit.collider)?.kind === 'world' && hit.normal1.y > .65)) return null;
    return { part: i, collider: hit.collider, fraction: hit.time_of_impact, info: ph.info(hit.collider), contact: { normal1: hit.normal1, point1: to.p, distance: 0 } };
  }

  limit(dt) {
    const p = this.player, rig = p.rig;
    if (p.physMode !== 'anim' || !['active', 'stun', 'getup'].includes(p.state)) { this.previous = this.safe = null; return; }
    const desired = rig.compute().map(t => ({ p: t.p.clone(), q: t.q.clone() }));
    const attempted = rig.joints.map(j => j.quaternion.clone());
    this.safe ||= attempted.map(() => new THREE.Quaternion());
    for (const chain of CHAINS) {
      const joint = chain[0];
      let targets = rig.compute();
      const hit = chain.map(i => this.overlap(i, targets[i]) || (dt > 0 && this.swept(i, targets[i]))).find(Boolean);
      if (!hit) continue;
      if (dt > 0 && this.previous) p._limbContact(hit, desired[hit.part], this.previous[hit.part], dt);
      const end = rig.joints[joint].quaternion.clone();
      const start = this.safe[joint].clone();
      const at = fraction => {
        rig.joints[joint].quaternion.copy(start).slerp(end, fraction);
        targets = rig.compute();
        return chain.some(i => this.overlap(i, targets[i]));
      };
      // A moving root may invalidate last frame's safe pose. Try the relaxed
      // joint first; never accept a penetrating pose merely because TOI is zero.
      if (at(0)) { start.identity(); at(0); }
      let lo = 0, hi = 1;
      // Find the first blocked interval, including thin obstacles which the
      // endpoint of a fast swing could otherwise have already passed through.
      for (let k = 1; k <= 8; k++) {
        const f = k / 8;
        if (at(f)) { hi = f; break; }
        lo = f;
      }
      if (lo === 1 && Number.isFinite(hit.fraction)) { hi = hit.fraction; lo = 0; }
      for (let k = 0; k < 7; k++) { const m = (lo + hi) / 2; if (at(m)) hi = m; else lo = m; }
      at(Math.max(0, lo - .015));
      // Keep the arm spring consistent with the constrained visible hand.
      if (joint === 3 || joint === 5) {
        const side = joint === 3 ? 'l' : 'r', arm = p.arm[side];
        const hand = p.meta.gripLocal?.[side];
        if (hand && arm.ready) {
          const point = hand.clone().applyMatrix4(rig.joints[joint + 1].matrixWorld);
          point.sub(rig.shoulderWorld(side)).applyAxisAngle(UP, -p.yaw);
          arm.p.copy(point); arm.v.multiplyScalar(.25);
        }
      }
    }
    if (dt > 0) {
      this.safe = rig.joints.map(j => j.quaternion.clone());
      this.previous = rig.compute().map(t => ({ p: t.p.clone(), q: t.q.clone() }));
    }
  }
}
