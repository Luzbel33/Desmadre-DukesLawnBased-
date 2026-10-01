import * as THREE from 'three';
import { G, clamp } from '../core/G.js';
import { RAPIER, GR, groups } from '../core/physics.js';
import { VEHICLES, MAP_BOUNDS, LAWN } from '../shared/mapdata.js';
import { buildVehicleModel } from './vehicle-models.js';
import { CHOPPABLE } from './props.js';
import { mowerSweep } from '../shared/mower.js';

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
// Each solid matches a visible component. Driving and walking use these same
// parts, so a narrow hood no longer behaves like a roof-height opaque box.
// [half x, half y, half z, center x, center y, center z]
export const VEHICLE_SOLIDS = {
  mower: [[.65,.065,.39,0,.2,.3],[.32,.19,.45,0,.62,.67],[.43,.09,.31,0,.72,-.5],
    [.27,.22,.07,0,1.1,-.61],[.11,.30,.30,-.6,.32,-.45],[.11,.30,.30,.6,.32,-.45],
    [.065,.17,.17,-.46,.19,.8],[.065,.17,.17,.46,.19,.8]],
  tractor: [[.7,.06,.36,0,.2,.35],[.29,.4,.65,0,.84,.7],[.45,.04,.48,0,.98,-.45],
    [.25,.24,.08,0,1.5,-.76],[.04,.43,.04,.16,1.62,1],
    [.18,.60,.60,-.8,.62,-.45],[.18,.60,.60,.8,.62,-.45],
    [.09,.32,.32,-.46,.34,1.05],[.09,.32,.32,.46,.34,1.05]],
  cart: [[.65,.15,1.25,0,.52,0],[.61,.21,.31,0,.84,1],[.58,.19,.28,0,.9,-.24],
    [.56,.22,.05,0,1.28,-.52],[.68,.03,.9,0,2.02,.08],
    ...[-.6,.6].flatMap(x=>[-.68,.78].map(z=>[.025,.5,.025,x,1.5,z])),
    ...[-.66,.66].flatMap(x=>[-.85,.85].map(z=>[.09,.23,.23,x,.25,z]))],
};
const DRIVE_GROUPS = groups(GR.VEHICLE, GR.WORLD | GR.VEHICLE | GR.PAWN | GR.REMOTE);
// los NPC no son paredes para el auto (se los atropella: ver _runOver); ni su cápsula ni su cuerpo tirado lo frenan
const NPC_KINDS = new Set(['npc', 'bag']);
function driveFilter(v) {
  return (collider) => {
    const inf = G.phys.info(collider);
    if (inf && NPC_KINDS.has(inf.kind)) return false;
    return !v.seats.includes(inf?.ref?.id);
  };
}
// caja que ocupa cada tipo de vehículo (de sus sólidos): medio ancho y de dónde a dónde va a lo largo
const EXTENTS = {};
function extentsOf(type) {
  if (EXTENTS[type]) return EXTENTS[type];
  let hx = 0, z0 = 1e9, z1 = -1e9;
  for (const [sx, , sz, x, , z] of VEHICLE_SOLIDS[type] || VEHICLE_SOLIDS.mower) { hx = Math.max(hx, Math.abs(x) + sx); z0 = Math.min(z0, z - sz); z1 = Math.max(z1, z + sz); }
  return (EXTENTS[type] = { hx, z0, z1 });
}
const VEHICLE_GROUPS = groups(GR.VEHICLE, GR.WORLD | GR.VEHICLE | GR.PAWN | GR.REMOTE | GR.RAGDOLL | GR.PROP | GR.DEBRIS | GR.ME);
// rampas: un choque cuya normal mira para arriba es una pendiente (se sube), no una pared
const isSlope = (h) => Math.max(Math.abs(h.normal1?.y || 0), Math.abs(h.normal2?.y || 0)) > 0.4;
const GROUND_GROUPS = groups(0xffff, GR.WORLD);
const TMPE = new THREE.Euler();

export class VehicleManager {
  constructor(net, local) {
    this.net = net;
    this.local = local;
    this.items = new Map();
    this._sendT = 0;
    this._cutT = 0;
    this._pendingCuts = [];
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
        v.body = G.phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(r.p[0], r.p[1], r.p[2]));
        v.driveParts = (VEHICLE_SOLIDS[def.type] || VEHICLE_SOLIDS.mower).map(([hx,hy,hz,x,y,z])=> {
          const collider = G.phys.world.createCollider(RAPIER.ColliderDesc.cuboid(hx,hy,hz).setTranslation(x,y,z)
            .setFriction(.8).setActiveCollisionTypes(15 | 52224).setCollisionGroups(VEHICLE_GROUPS),v.body);
          G.phys.tag(collider,{kind:'vehicle',ref:v});
          return { shape:new RAPIER.Cuboid(hx,hy,hz), center:{x,y,z}, collider };
        });
        v.collider = v.driveParts[0].collider;
        this.items.set(v.id, v);
      }
      v.pos.set(...r.p);
      v.pos.y = def.p?.[1] ?? 0; // los modelos se apoyan en el piso (un server viejo mandaba 0.6-0.9)
      v.targetPos.copy(v.pos);
      v.quat.set(...r.q); v.targetQuat.copy(v.quat);
      v.yaw = new THREE.Euler().setFromQuaternion(v.quat, 'YXZ').y;
      v.owner = r.o || 0; v.seats = r.seats || [];
      v.group.position.copy(v.pos); v.group.quaternion.copy(v.quat);
      v.body.setTranslation(v.pos, true); v.body.setRotation(v.quat, true);
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
      // El conductor simula su vehículo; un eco atrasado no revierte su encendido.
      if (v.owner !== G.myId && u.length >= 11) v.blades = driven && !!u[10];
    }
  }

  handleReset(m) {
    const v = this.items.get(m.id); if (!v) return;
    v.pos.set(...m.p); v.targetPos.copy(v.pos);
    v.quat.set(...m.q); v.targetQuat.copy(v.quat);
    v.speed = 0; v.blades = false; v.owner = 0; v.seats = v.seats.map(() => 0);
    this._lastCut = null;
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
      const yawBefore = localV.yaw;
      localV.yaw += localV.steer * Math.sign(localV.speed) * rate * dt;
      if (Math.abs(localV.yaw-yawBefore)>1e-5 && this._blockedTurn(localV)) localV.yaw = yawBefore;
      if (localV.type !== 'cart' && input.consume('Space')) {
        localV.blades = !localV.blades;
        this._sendT = 1; // publicar el cambio en este mismo cuadro
        G.sfx?.trigger('pickup', null, .3);
      }

      const dist = localV.speed * dt;
      const dx = Math.sin(localV.yaw) * dist, dz = Math.cos(localV.yaw) * dist;
      const rotation = TMPQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, localV.yaw);
      let hit = null;
      if (Math.abs(dist)>1e-6) for (const part of localV.driveParts) {
        const candidate = G.phys.world.castShape(this._driveOrigin(localV,part.center), rotation, {x:dx,y:0,z:dz},
          part.shape,.008,1,false,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,DRIVE_GROUPS,null,localV.body,
          driveFilter(localV));
        if (candidate && !isSlope(candidate) && (!hit || candidate.time_of_impact<hit.time_of_impact)) hit=candidate;
      }
      const fraction = hit ? Math.max(0, hit.time_of_impact - 0.002 / Math.abs(dist)) : 1;
      localV.pos.x = clamp(localV.pos.x + dx * fraction, MAP_BOUNDS.x0 + 1, MAP_BOUNDS.x1 - 1);
      localV.pos.z = clamp(localV.pos.z + dz * fraction, MAP_BOUNDS.z0 + 1, MAP_BOUNDS.z1 - 1);
      if (hit) {
        const sp = Math.abs(localV.speed);
        if (sp > 2.5) G.sfx?.trigger('hit', null, Math.min(1, sp / 9));
        if (sp > 1.5 && (localV.crashT || 0) <= G.time) {
          localV.crashT = G.time + 0.35;
          this.onCrash?.(localV, sp, G.phys.info(hit.collider)?.ref || null);
        }
        localV.speed = 0; // contact stops motion; repeated throttle must not bounce the camera
      }
      this._runOver(localV);
      this._ground(localV, dt);
      localV.quat.setFromEuler(TMPE.set(localV._tilt || 0, localV.yaw, 0, 'YXZ'));
      localV.targetPos.copy(localV.pos); localV.targetQuat.copy(localV.quat);
      localV.group.position.copy(localV.pos); localV.group.quaternion.copy(localV.quat);
      this.local.setSeatPose(localV);

      const cutting = localV.blades && localV.type !== 'cart';
      if (cutting && this._cutT >= 1 / 30) {
        this._cutT = 0;
        this._stamp(localV);
      } else if (!cutting) this._lastCut = null;

      if (this._sendT > 0.07) {
        this._sendT = 0;
        const q = localV.quat, p = localV.pos;
        this.net.send({ t: 'vu', u: [[localV.id, p.x, p.y, p.z, q.x, q.y, q.z, q.w, localV.speed, localV.steer, localV.blades ? 1 : 0, 0]] });
      }
    }
    if (!localV || localV.seats?.[0] !== G.myId) this._lastCut = null;
    // Corte local inmediato, red agrupada: no depende del eco ni manda un paquete por brizna.
    if (this._pendingCuts.length && (this._sendT === 0 || !localV)) {
      this.net.send({ t: 'cut', s: this._pendingCuts.splice(0, 64) });
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

  // El piso debajo de las ruedas (adelante y atrás): sube por las rampas con el cabeceo de la pendiente; si el piso se
  // va (la punta de una rampa) sigue con su envión y cae con gravedad: saltos. Solo cuenta el piso hasta 0,7 m arriba
  // (un techo o una mesa encima no lo levantan).
  _ground(v, dt) {
    const E = extentsOf(v.type), half = Math.max(0.3, (E.z1 - E.z0) * 0.4), mid = (E.z1 + E.z0) / 2;
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    const own = (col) => { const inf = G.phys.info(col); return !(inf?.kind === 'vehicle' || (inf && NPC_KINDS.has(inf.kind))); };
    const at = (off) => {
      const h = G.phys.raycast(v.pos.x + s * (mid + off), v.pos.y + 0.7, v.pos.z + c * (mid + off), 0, -1, 0, 8, GROUND_GROUPS, v.body?.collider?.(0) || null, own);
      return h ? h.y : null;
    };
    let gf = at(half), gr = at(-half);
    if (gf === null && gr === null) gf = gr = v.pos.y; // sin piso abajo (no debería pasar): se queda donde está
    else if (gf === null) gf = gr; else if (gr === null) gr = gf;
    const target = (gf + gr) / 2;
    v.vy = v.vy || 0;
    if (target >= v.pos.y - 0.03) {
      if (v.air && v.vy < -4) { G.sfx?.trigger('hit', null, Math.min(1, -v.vy / 12)); G.sfx?.trigger('thud', null, 0.6); }
      v.vy = dt > 0 ? clamp((target - v.pos.y) / dt, -2, 9) : 0; // al subir la rampa: con esto sale volando de la punta
      v.pos.y = target; v.air = false;
      v._tilt = (v._tilt || 0) + (-Math.atan2(gf - gr, half * 2) - (v._tilt || 0)) * Math.min(1, dt * 14);
    } else {
      v.air = true;
      v.vy -= 9.8 * dt;
      v.pos.y = Math.max(target, v.pos.y + v.vy * dt);
      v._tilt = (v._tilt || 0) + (-Math.atan2(v.vy, Math.max(2, Math.abs(v.speed))) * 0.7 - (v._tilt || 0)) * Math.min(1, dt * 3);
    }
  }

  _driveOrigin(v, center) {
    const s=Math.sin(v.yaw),c=Math.cos(v.yaw);
    return {x:v.pos.x+c*center.x+s*center.z,y:v.pos.y+center.y,z:v.pos.z-s*center.x+c*center.z};
  }

  _blockedTurn(v) {
    const rotation = TMPQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, v.yaw);
    let blocked = false;
    for (const part of v.driveParts) {
    const origin=this._driveOrigin(v,part.center);
    G.phys.world.intersectionsWithShape(origin, rotation, part.shape, collider => {
      // No bloquea un roce con el suelo; sí una penetración de la esquina.
      const contact = collider.contactShape(part.shape, origin, rotation, 0);
      if (contact && contact.distance < -0.015 && !isSlope(contact)) blocked = true;
      return !blocked;
    }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, DRIVE_GROUPS, null, v.body,
    driveFilter(v));
    if (blocked) break;
    }
    return blocked;
  }

  // Atropellar: el NPC que queda adentro de la caja del vehículo sale revoleado según la velocidad (con daño, sangre
  // y el golpe), el vehículo pierde un poco de envión y sigue. Despacio solo lo corrés a un costado. Antes el NPC
  // era una pared: el auto frenaba en seco, el conductor salía volando y el NPC seguía caminando como si nada.
  _runOver(v) {
    const npcs = G.allNpcs?.();
    if (!npcs?.length) return;
    const sp = v.speed || 0, asp = Math.abs(sp);
    const s = Math.sin(v.yaw), c = Math.cos(v.yaw), E = extentsOf(v.type);
    const fx = s * Math.sign(sp || 1), fz = c * Math.sign(sp || 1);
    for (const n of npcs) {
      if (!n.char || n.dead || n.sit || n.down > 0) continue;
      const dx = n.pos.x - v.pos.x, dz = n.pos.z - v.pos.z;
      if (dx * dx + dz * dz > 16 || Math.abs(n.pos.y - v.pos.y) > 1.6) continue;
      const lx = c * dx - s * dz, lz = s * dx + c * dz; // en el marco del vehículo (x al costado, z adelante)
      const R = 0.3;
      if (Math.abs(lx) > E.hx + R || lz < E.z0 - R || lz > E.z1 + R) continue;
      if ((n._runT || 0) > G.time) continue;
      n._runT = G.time + 0.5;
      const pt = TMPV.set(n.pos.x, n.pos.y + 0.95, n.pos.z);
      if (asp < 2.2) {
        // despacio: lo corrés a un costado (y se queja)
        const side = lx >= 0 ? 1 : -1, push = E.hx + R - Math.abs(lx) + 0.05;
        n.pos.x += c * side * push; n.pos.z -= s * side * push;
        if ((n._honkT || 0) < G.time) { n._honkT = G.time + 3; n.say?.(['¡Eh! ¡Fijate!', '¡Casi me pisás!', '¡Tarado!'][Math.floor(Math.random() * 3)], 2); }
        continue;
      }
      // atropellado: el golpe (daño según la velocidad) y el revoleo en la dirección del vehículo
      n.punch(asp * 1.5, pt, TMPV2.set(fx, 0.25, fz).normalize(), 9, true, 'blunt');
      const vel = TMPV2.set(fx * asp * 1.05 + (Math.random() - 0.5) * 1.5, 1.4 + asp * 0.32, fz * asp * 1.05 + (Math.random() - 0.5) * 1.5);
      if (!n.dead && !(n.down > 0)) n.knockout(vel.clone(), 2.8 + asp * 0.35);
      // las piernas salen más rápido que la cabeza: el cuerpo gira y cae de espaldas sobre el capó (no vuela
      // parado como un maniquí)
      if (n.rag?.alive) {
        const base = n.pos.y, jx = (Math.random() - 0.5) * 1.2, jz = (Math.random() - 0.5) * 1.2;
        for (const b of n.rag.bodies) {
          const t = b.translation(), h = clamp((t.y - base) / 1.7, 0, 1), k = 1.3 - 0.65 * h;
          b.setLinvel({ x: fx * asp * k + jx, y: 0.9 + asp * (0.1 + 0.3 * h), z: fz * asp * k + jz }, true);
          b.setAngvel({ x: -fz * asp * 0.8, y: (Math.random() - 0.5) * 3, z: fx * asp * 0.8 }, true);
        }
      }
      G.sfx?.trigger('hit', pt, Math.min(1, 0.4 + asp / 10), { rate: 0.8 });
      G.fx?.blood?.(pt.clone(), TMPV2.set(fx, 0.8, fz).normalize(), Math.min(1.5, asp / 6));
      v.speed *= asp > 6 ? 0.82 : 0.7; // el golpe frena un poco (no en seco)
      this.onRunOver?.(v, asp, n);
    }
  }

  // Estampado de corte (30 Hz): cubre todo lo recorrido desde el anterior, así a mucha velocidad
  // no quedan huecos en la franja. Las cuchillas pican lo que agarran (enanos, sandías, botellas...).
  _stamp(v) {
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const hw = v.type === 'tractor' ? 1.15 : 0.78;
    const cx = v.pos.x + fx * 0.45, cz = v.pos.z + fz * 0.45; // las cuchillas van adelante del centro
    const next = { x: cx, z: cz, yaw: v.yaw, id: v.id };
    const stamps = mowerSweep(this._lastCut, next, hw);
    this._lastCut = next;
    const cut = G.grass.cut(stamps, false);
    this._pendingCuts.push(...stamps);
    if (cut > 2 && G.fx) {
      TMPV.set(fx, 0.2, fz);
      G.fx.clippings(new THREE.Vector3(v.pos.x, 0.2, v.pos.z), TMPV, Math.min(10, 3 + Math.floor(cut / 20)));
    }
    if (!G.props) return;
    for (const p of [...G.props.items.values()]) {
      if (!CHOPPABLE.has(p.type)) continue;
      const t = p.body.translation();
      if (t.y > 0.75) continue;
      const caught = stamps.some(([x, z, yaw, sw, sl]) => {
        const dx = t.x - x, dz = t.z - z, s = Math.sin(yaw), c = Math.cos(yaw);
        return Math.abs(dx * s + dz * c) <= sl + 0.2 && Math.abs(dx * c - dz * s) <= sw + 0.12;
      });
      if (!caught) continue;
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
    const vib = running && v.type !== 'cart' ? Math.sin(t * 19) * 0.0008 : 0;
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
