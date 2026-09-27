import * as THREE from 'three';
import { G, clamp } from '../core/G.js';
import { RAPIER, GR, groups } from '../core/physics.js';
import { VEHICLES, MAP_BOUNDS, LAWN } from '../shared/mapdata.js';
import { buildVehicleModel } from './vehicle-models.js';
import { CHOPPABLE } from './props.js';

const VDEF = new Map(VEHICLES.map((v) => [v.id, v]));
const TMPV = new THREE.Vector3();
const TMPV2 = new THREE.Vector3();
const TMPQ = new THREE.Quaternion();

function vehicleMesh(def) {
  const g = buildVehicleModel(def.type || 'mower', def.color ?? 0xc8312b);
  g.name = `vehicle-${def.id}`;
  return g;
}

// medio ancho, medio alto, medio largo, centro y, centro z (espacio del vehículo)
const VDIMS = { mower: [0.72, 0.42, 0.95, 0.42, 0.2], tractor: [0.8, 0.7, 1.2, 0.6, 0.1], cart: [0.75, 0.62, 1.35, 0.65, 0] };

export class VehicleManager {
  constructor(net, local) {
    this.net = net;
    this.local = local;
    this.items = new Map();
    this._sendT = 0;
    this._cutT = 0;
  }

  load(rows = []) {
    for (const r of rows) {
      const def = VDEF.get(r.id) || { id: r.id, type: 'mower', color: 0xc8312b };
      let v = this.items.get(r.id);
      if (!v) {
        const group = vehicleMesh(def); G.scene.add(group);
        v = {
          id: r.id, type: def.type, color: def.color, group,
          pos: new THREE.Vector3(), targetPos: new THREE.Vector3(),
          quat: new THREE.Quaternion(), targetQuat: new THREE.Quaternion(),
          yaw: def.yaw || 0, speed: 0, steer: 0, blades: false,
          owner: r.o || 0, seats: r.seats || [],
        };
        // cuerpo cinemático: atropella, empuja objetos y cuerpos, bloquea el paso
        const dims = VDIMS[def.type] || VDIMS.mower;
        v.body = G.phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(r.p[0], r.p[1], r.p[2]));
        v.collider = G.phys.world.createCollider(
          RAPIER.ColliderDesc.cuboid(dims[0], dims[1], dims[2]).setTranslation(0, dims[3], dims[4])
            .setFriction(0.8).setActiveCollisionTypes(15 | 52224).setCollisionGroups(groups(GR.VEHICLE, GR.RAGDOLL | GR.PROP | GR.DEBRIS | GR.ME)),
          v.body,
        );
        G.phys.tag(v.collider, { kind: 'vehicle', ref: v });
        this.items.set(v.id, v);
      }
      v.pos.set(...r.p);
      v.pos.y = def.p?.[1] ?? 0; // los modelos se apoyan en el piso (un server viejo mandaba 0.6-0.9)
      v.targetPos.copy(v.pos);
      v.quat.set(...r.q); v.targetQuat.copy(v.quat);
      v.yaw = new THREE.Euler().setFromQuaternion(v.quat, 'YXZ').y;
      v.owner = r.o || 0; v.seats = r.seats || [];
      v.group.position.copy(v.pos); v.group.quaternion.copy(v.quat);
    }
    this._syncLocalSeat();
  }

  nearest(pos, max = 3) {
    let best = null, bd = max;
    for (const v of this.items.values()) {
      const d = pos.distanceTo(v.group.position);
      if (d < bd) { best = v; bd = d; }
    }
    return best ? { item: best, dist: bd } : null;
  }

  enter(v) {
    if (!v) return;
    const seat = v.seats?.[0] ? (v.seats?.[1] ? -1 : 1) : 0;
    if (seat < 0) return;
    this.net.send({ t: 've', id: v.id, seat });
  }

  exitCurrent() {
    const v = this.local.vehicle;
    if (!v) return;
    // al bajarse se apagan las cuchillas y el motor (último estado, así nadie la sigue escuchando)
    if (v.seats?.[0] === G.myId) {
      v.blades = false;
      v.speed = 0;
      v.steer = 0;
      const q = v.quat, p = v.pos;
      this.net.send({ t: 'vu', u: [[v.id, p.x, p.y, p.z, q.x, q.y, q.z, q.w, 0, 0, 0, 0]] });
    }
    this.net.send({ t: 'vx', id: v.id });
  }

  handleSeats(m) {
    const v = this.items.get(m.id); if (!v) return;
    v.seats = Array.isArray(m.seats) ? m.seats : v.seats;
    v.owner = m.o || 0;
    // sin conductor: quieta y en silencio
    if (!v.seats?.[0]) { v.blades = false; v.speed = 0; v.steer = 0; }
    if (m.deny && !v.seats.includes(G.myId)) return;
    this._syncLocalSeat();
  }

  _syncLocalSeat() {
    let seated = null;
    for (const v of this.items.values()) if (v.seats?.includes(G.myId)) { seated = v; break; }
    if (seated && this.local.vehicle !== seated) {
      this.local.setVehicle(seated);
    } else if (!seated && this.local.vehicle) {
      const old = this.local.vehicle;
      this.local.exitVehicleAt(old);
    }
  }

  handleSnap(rows = []) {
    for (const u of rows) {
      const v = this.items.get(u[0]); if (!v || u.length < 8) continue;
      v.targetPos.set(u[1], VDEF.get(v.id)?.p?.[1] ?? 0, u[3]);
      v.targetQuat.set(u[4], u[5], u[6], u[7]);
      const driven = !!v.seats?.[0];
      if (v.owner !== G.myId && u.length >= 9) v.speed = driven ? +u[8] || 0 : 0;
      if (v.owner !== G.myId && u.length >= 10) v.steer = driven ? +u[9] || 0 : 0;
      if (u.length >= 11) v.blades = driven && !!u[10];
    }
  }

  handleReset(m) {
    const v = this.items.get(m.id); if (!v) return;
    v.pos.set(...m.p); v.targetPos.copy(v.pos);
    v.quat.set(...m.q); v.targetQuat.copy(v.quat);
    v.speed = 0; v.owner = 0; v.seats = v.seats.map(() => 0);
    v.group.position.copy(v.pos); v.group.quaternion.copy(v.quat);
    this._syncLocalSeat();
  }

  update(dt) {
    this._sendT += dt; this._cutT += dt;
    const localV = this.local.vehicle;
    if (localV && localV.seats?.[0] === G.myId) {
      const input = G.input;
      const gas = (input.key('KeyW') ? 1 : 0) - (input.key('KeyS') ? 1 : 0);
      const turn = (input.key('KeyA') ? 1 : 0) - (input.key('KeyD') ? 1 : 0);
      const turbo = input.key('ShiftLeft') || input.key('ShiftRight');
      const max = localV.type === 'tractor' ? 10 : localV.type === 'cart' ? 9 : 8;
      const target = gas * max * (turbo ? 1.35 : 1);
      // acelerar hacia el otro lado frena fuerte (X ya no frena: X es bajarse)
      const braking = gas !== 0 && Math.sign(gas) !== Math.sign(localV.speed) && Math.abs(localV.speed) > 0.3;
      localV.speed += (target - localV.speed) * Math.min(1, dt * (braking ? 6 : gas ? 2.7 : 4.2));
      localV.steer += (turn - localV.steer) * Math.min(1, dt * 7);
      // giro cerrado como una cortadora de verdad (radio de 2 a 4 m): se puede volver al lado de la pasada
      const sp = Math.abs(localV.speed);
      const rate = Math.min(localV.type === 'cart' ? 1.5 : 2.1, sp * (localV.type === 'tractor' ? 0.42 : 0.55));
      localV.yaw += localV.steer * Math.sign(localV.speed) * rate * dt;
      if (input.hit('Space') && localV.type !== 'cart') { localV.blades = !localV.blades; G.sfx?.trigger('pickup', null, .3); }

      const dist = localV.speed * dt;
      const dx = Math.sin(localV.yaw) * dist, dz = Math.cos(localV.yaw) * dist;
      const sign = dist >= 0 ? 1 : -1;
      const hit = G.phys.raycast(localV.pos.x, 0.62, localV.pos.z, Math.sin(localV.yaw) * sign, 0, Math.cos(localV.yaw) * sign,
        Math.abs(dist) + 0.9, groups(0xffff, GR.WORLD));
      if (!hit || hit.dist > 0.7) {
        localV.pos.x = clamp(localV.pos.x + dx, MAP_BOUNDS.x0 + 1, MAP_BOUNDS.x1 - 1);
        localV.pos.z = clamp(localV.pos.z + dz, MAP_BOUNDS.z0 + 1, MAP_BOUNDS.z1 - 1);
      } else {
        const sp = Math.abs(localV.speed);
        if (sp > 2.5) G.sfx?.trigger('hit', null, Math.min(1, sp / 9));
        this.onCrash?.(localV, sp, null);
        localV.speed *= -0.18;
      }
      localV.pos.y = VDEF.get(localV.id)?.p?.[1] ?? localV.pos.y;
      // choque con otros vehículos
      for (const o of this.items.values()) {
        if (o === localV) continue;
        const dx = localV.pos.x - o.pos.x, dz = localV.pos.z - o.pos.z;
        const d = Math.hypot(dx, dz);
        const minD = 1.9;
        if (d < minD && d > 0.01) {
          localV.pos.x += (dx / d) * (minD - d);
          localV.pos.z += (dz / d) * (minD - d);
          const sp = Math.abs(localV.speed);
          if (sp > 1.5) {
            this.onCrash?.(localV, sp, o);
            localV.speed *= -0.3;
          }
        }
      }
      localV.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), localV.yaw);
      localV.targetPos.copy(localV.pos); localV.targetQuat.copy(localV.quat);
      localV.group.position.copy(localV.pos); localV.group.quaternion.copy(localV.quat);
      this.local.setSeatPose(localV);

      const cutting = localV.blades && localV.type !== 'cart' && Math.abs(localV.speed) > 0.8;
      if (cutting && this._cutT > 0.1) {
        this._cutT = 0;
        this._stamp(localV);
      } else if (!cutting) this._lastCut = null;

      if (this._sendT > 0.07) {
        this._sendT = 0;
        const q = localV.quat, p = localV.pos;
        this.net.send({ t: 'vu', u: [[localV.id, p.x, p.y, p.z, q.x, q.y, q.z, q.w, localV.speed, localV.steer, localV.blades ? 1 : 0, 0]] });
      }
    }

    for (const v of this.items.values()) {
      if (localV === v && v.seats?.[0] === G.myId) continue;
      v.pos.lerp(v.targetPos, 1 - Math.exp(-11 * dt));
      v.quat.slerp(v.targetQuat, 1 - Math.exp(-11 * dt));
      v.yaw = new THREE.Euler().setFromQuaternion(v.quat, 'YXZ').y;
      v.group.position.copy(v.pos); v.group.quaternion.copy(v.quat);
    }

    for (const v of this.items.values()) {
      if (v.body) {
        v.body.setNextKinematicTranslation({ x: v.pos.x, y: v.pos.y, z: v.pos.z });
        v.body.setNextKinematicRotation({ x: v.quat.x, y: v.quat.y, z: v.quat.z, w: v.quat.w });
      }
    }
    for (const v of this.items.values()) this._animate(v, dt);
  }

  // Estampado de corte (cada ~0.1 s): cubre todo lo recorrido desde el anterior, así a mucha velocidad
  // no quedan huecos en la franja. Las cuchillas pican lo que agarran (enanos, sandías, botellas...).
  _stamp(v) {
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const hw = v.type === 'tractor' ? 1.15 : 0.78;
    const cx = v.pos.x + fx * 0.45, cz = v.pos.z + fz * 0.45; // las cuchillas van adelante del centro
    const last = this._lastCut;
    let mx = cx, mz = cz, hl = 0.7;
    if (last) {
      const seg = Math.hypot(cx - last.x, cz - last.z);
      if (seg < 5) { mx = (cx + last.x) / 2; mz = (cz + last.z) / 2; hl = Math.max(0.7, seg / 2 + 0.45); }
    }
    this._lastCut = { x: cx, z: cz };
    const stamp = [+mx.toFixed(3), +mz.toFixed(3), +v.yaw.toFixed(4), +hw.toFixed(3), +hl.toFixed(3)];
    const cut = G.grass.cut([stamp], false);
    this.net.send({ t: 'cut', s: [stamp] });
    if (cut > 2 && G.fx) {
      TMPV.set(fx, 0.2, fz);
      G.fx.clippings(new THREE.Vector3(v.pos.x, 0.2, v.pos.z), TMPV, Math.min(10, 3 + Math.floor(cut / 20)));
    }
    if (!G.props) return;
    for (const p of [...G.props.items.values()]) {
      if (!CHOPPABLE.has(p.type)) continue;
      const t = p.body.translation();
      if (t.y > 0.75) continue;
      const dx = t.x - mx, dz = t.z - mz;
      const along = dx * fx + dz * fz, side = dx * fz - dz * fx;
      if (Math.abs(along) > hl + 0.2 || Math.abs(side) > hw + 0.12) continue;
      G.props.chop(p);
    }
  }

  // Lo que se ve: ruedas que giran según su radio, delanteras que doblan, volante que acompaña,
  // carrocería que se inclina en las curvas, cabecea al acelerar, vibra con el motor y rebota en el pasto.
  _animate(v, dt) {
    const ud = v.group.userData;
    if (!v.wheels) { v.wheels = []; v.group.traverse((o) => { if (o.userData.wheel) v.wheels.push(o); }); v._pitch = 0; v._roll = 0; v._dist = 0; v._smoke = 0; }
    const sp = v.speed || 0;
    for (const w of v.wheels) w.rotation.x += (sp * dt) / (w.userData.r || 0.3);
    const steer = clamp(v.steer || 0, -1, 1);
    for (const pv of ud.pivots || []) pv.rotation.y = steer * 0.5;
    if (ud.steer) ud.steer.rotation.set(ud.steer.userData.tilt || 0, 0, steer * 1.7);
    const blade = v.blade ?? (v.blade = v.group.getObjectByName('blade') || null);
    if (blade && v.blades) blade.rotation.y += dt * 35;
    const b = ud.body;
    if (!b) return;
    v._dist += Math.abs(sp) * dt;
    const acc = (sp - (v._ps ?? sp)) / Math.max(dt, 1e-3);
    v._ps = sp;
    const k1 = Math.min(1, dt * 6), k2 = Math.min(1, dt * 5);
    v._pitch += (clamp(-acc * 0.0045, -0.05, 0.05) - v._pitch) * k1;
    v._roll += (clamp(-steer * sp * 0.007, -0.07, 0.07) - v._roll) * k2;
    const running = !!v.seats?.some(Boolean) || Math.abs(sp) > 0.3;
    const t = G.time + v.id * 1.7;
    const vib = running ? Math.sin(t * 57) * 0.0028 + Math.sin(t * 33) * 0.0018 : 0;
    const rough = Math.min(1, Math.abs(sp) / 4);
    const bump = (Math.sin(v._dist * 2.3) * 0.006 + Math.sin(v._dist * 5.3 + 1) * 0.004) * rough;
    b.rotation.set(v._pitch + bump * 1.2, 0, v._roll + Math.sin(v._dist * 1.7) * 0.006 * rough);
    b.position.y = vib + bump;
    v.bob = b.position.y;
    // humo del escape (más cuando acelera)
    if (running && ud.exhaust && G.fx) {
      v._smoke -= dt * (0.35 + Math.min(2.5, Math.abs(acc) * 0.25 + Math.abs(sp) * 0.08));
      if (v._smoke <= 0) {
        v._smoke = 0.12;
        const at = b.localToWorld(TMPV.copy(ud.exhaust));
        G.fx.puff(at, TMPV2.set(-Math.sin(v.yaw) * 0.2, 1, -Math.cos(v.yaw) * 0.2), 0.12, 0x6a6a66);
      }
    }
  }
}
