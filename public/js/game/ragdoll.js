// Ragdoll activo (estilo Half Sword / TABG): cada parte del cuerpo es un cuerpo rígido real unido por
// articulaciones. "Músculos" = torques PD que empujan cada parte hacia la pose objetivo (animación),
// más una fuerza en la pelvis que la lleva hacia el controlador (caminar/saltar). Con fuerza 0 es un
// ragdoll muerto; con fuerza 1 camina normal pero con presencia física (empuja, recibe golpes, se cae).
import * as THREE from 'three';
import { RAPIER, GR, groups } from '../core/physics.js';

export const PARENT = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9];
export const PART = { PELVIS: 0, TORSO: 1, HEAD: 2, UARM_L: 3, FARM_L: 4, UARM_R: 5, FARM_R: 6, THIGH_L: 7, SHIN_L: 8, THIGH_R: 9, SHIN_R: 10 };
// Ganancias de los músculos por parte (kp en 1/s², kd en 1/s, torque máximo en N·m)
const KP = [340, 300, 230, 260, 220, 260, 220, 560, 480, 560, 480];
const KD = [38, 34, 26, 26, 22, 26, 22, 44, 38, 44, 38];
const TMAX = [650, 520, 90, 170, 110, 170, 110, 460, 320, 460, 320];
// cuánto del torque del músculo vuelve al padre (piernas y brazos no sacuden tanto la pelvis/torso)
const REACT = [1, 1, 1, 0.6, 0.6, 0.6, 0.6, 0, 0, 0, 0];
// Piernas: siguen su orientación ABSOLUTA del paso (no relativa a la pelvis física). Relativas a la
// pelvis, cualquier bamboleo de la cadera las dejaba apuntando adelante ("sentado en el aire").
const ABS = [false, false, false, false, false, false, false, true, true, true, true];
// codos y rodillas: bisagras con límites (en radianes, eje X local)
const HINGE = { 4: [-2.55, 0.08], 6: [-2.55, 0.08], 8: [-0.08, 2.5], 10: [-0.08, 2.5] };
// Equilibrio: torque absoluto (sin reacción) hacia la orientación objetivo en pelvis, torso y cabeza.
// Es la "trampa" de los ragdolls jugables: sin esto el cuerpo no puede sostenerse solo.
const BAL_KP = { 0: 900, 1: 900, 2: 700 }; // 1/s² (por inercia efectiva)
const BAL_KD = { 0: 60, 1: 60, 2: 50 }; // 1/s
const BAL_I = { 0: 2.2, 1: 1.6, 2: 0.06 }; // inercia efectiva (kg·m²): lo que cada parte "sostiene"
const BAL_MAX = { 0: 900, 1: 700, 2: 60 }; // N·m

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const tq = new THREE.Quaternion();
const tq2 = new THREE.Quaternion();
const tv = new THREE.Vector3();
const tv2 = new THREE.Vector3();
const tm = new THREE.Matrix4();
const tqp = new THREE.Quaternion();
const tqd = new THREE.Quaternion();
const tqe = new THREE.Quaternion();
const tq3 = new THREE.Quaternion();
// también detectar contactos cinemático-cinemático (golpes entre jugadores animados)
export const KIN_TYPES = 15 | 52224; // ActiveCollisionTypes.DEFAULT | KINEMATIC_KINEMATIC
// servo de velocidad de brazos y piernas
const LIMB_ORDER = [3, 4, 5, 6, 7, 8, 9, 10];
const VEL_T = 0.035; // s para corregir el error de pose
const VEL_MAX = 30; // rad/s
const VEL_MIN = 0.3; // con menos fuerza que esto (KO) el cuerpo queda a merced de la física

function q3(o) { return new THREE.Quaternion(o.x, o.y, o.z, o.w); }

export class Ragdoll {
  // meta: metadatos del humano (caps, mass). opts: { kinematic, member, filter, tag: {kind, ref} }
  constructor(phys, meta, opts = {}) {
    this.phys = phys;
    this.meta = meta;
    this.kinematic = !!opts.kinematic;
    this.member = opts.member ?? GR.RAGDOLL;
    this.filter = opts.filter ?? (GR.WORLD | GR.PROP | GR.VEHICLE | GR.REMOTE | GR.DEBRIS);
    this.tagInfo = opts.tag || { kind: 'ragdoll' };
    this.bodies = [];
    this.colliders = [];
    this.joints = [];
    this.inertia = [];
    this.comLocal = [];
    this.totalMass = meta.mass.reduce((a, b) => a + b, 0);
    this.strength = 1;
    this.alive = false;
    this.prev = [];
    this.cur = [];
  }

  // tr: 11 x [x,y,z,qx,qy,qz,qw] (mundo). vel: velocidad inicial (Vector3) opcional
  build(tr, vel = null) {
    this.destroy();
    const W = this.phys.world;
    const R = RAPIER;
    for (let i = 0; i < 11; i++) {
      const t = tr[i];
      const desc = this.kinematic ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic();
      desc.setTranslation(t[0], t[1], t[2]).setRotation({ x: t[3], y: t[4], z: t[5], w: t[6] });
      if (!this.kinematic) {
        desc.setLinearDamping(0.08).setAngularDamping(i >= 3 ? Ragdoll.cfg.limbDamp : 0.6).setCcdEnabled(i === 2 || i === 4 || i === 6 || i === 8 || i === 10);
        if (vel) desc.setLinvel(vel.x, vel.y, vel.z);
      }
      const body = W.createRigidBody(desc);
      const cap = this.meta.caps[i];
      const dir = tv.copy(cap.b).sub(cap.a);
      const len = dir.length();
      dir.normalize();
      const mid = tv2.copy(cap.a).add(cap.b).multiplyScalar(0.5);
      const rot = tq.setFromUnitVectors(Y_AXIS, dir);
      const hh = Math.max(0.01, len / 2 - cap.r * 0.35);
      const cd = R.ColliderDesc.capsule(hh, cap.r)
        .setTranslation(mid.x, mid.y, mid.z)
        .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
        .setMass(this.meta.mass[i])
        .setFriction(i === 8 || i === 10 ? 1.0 : 0.85)
        .setRestitution(0.02)
        .setActiveCollisionTypes(KIN_TYPES)
        .setCollisionGroups(groups(this.member, this.filter));
      const col = W.createCollider(cd, body);
      this.phys.tag(col, { ...this.tagInfo, part: i, ragdoll: this });
      this.bodies.push(body);
      this.colliders.push(col);
      const pi = body.principalInertia();
      // inercia respecto de la articulación (no del centro de masa): I_com + m d²
      const d2 = Ragdoll.cfg.pivotInertia ? mid.lengthSq() : 0;
      this.inertia.push(((pi.x + pi.y + pi.z) / 3 + this.meta.mass[i] * d2) * (i >= 3 ? Ragdoll.cfg.limbInertia : 1));
      this.comLocal.push(mid.clone());
    }
    // brazos y piernas: el músculo mueve TODO lo que cuelga de la articulación (muslo + pantorrilla,
    // brazo + antebrazo): inercia compuesta respecto del pivote. Con la inercia sola del muslo la pierna
    // no llegaba a dar el paso y se arrastraba.
    for (let i = 3; i < 11; i++) {
      const piv = this.bodies[i].translation();
      let I = 0;
      for (let k = i; k < 11; k++) {
        let p = k, inSub = false;
        while (p >= 0) { if (p === i) { inSub = true; break; } p = PARENT[p]; }
        if (!inSub) continue;
        const bk = this.bodies[k], tk = bk.translation(), rk = bk.rotation();
        const com = tv.copy(this.comLocal[k]).applyQuaternion(tq.set(rk.x, rk.y, rk.z, rk.w)).add(tv2.set(tk.x, tk.y, tk.z));
        const pk = bk.principalInertia();
        I += (pk.x + pk.y + pk.z) / 3 + this.meta.mass[k] * com.distanceToSquared(tv2.set(piv.x, piv.y, piv.z));
      }
      this.inertia[i] = Math.max(this.inertia[i], I);
    }
    // articulaciones
    for (let i = 1; i < 11; i++) {
      const p = PARENT[i];
      const pb = this.bodies[p], cb = this.bodies[i];
      // pivote del hijo expresado en el marco del padre (según la pose actual)
      const pt = pb.translation(), pr = pb.rotation();
      const ct = cb.translation();
      tm.compose(tv.set(pt.x, pt.y, pt.z), tq.set(pr.x, pr.y, pr.z, pr.w), tv2.set(1, 1, 1)).invert();
      const a1 = new THREE.Vector3(ct.x, ct.y, ct.z).applyMatrix4(tm);
      let data;
      if (HINGE[i] && Ragdoll.cfg.hinges) {
        data = R.JointData.revolute({ x: a1.x, y: a1.y, z: a1.z }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
      } else {
        data = R.JointData.spherical({ x: a1.x, y: a1.y, z: a1.z }, { x: 0, y: 0, z: 0 });
      }
      const j = W.createImpulseJoint(data, pb, cb, true);
      if (HINGE[i] && Ragdoll.cfg.hinges && j.setLimits) j.setLimits(HINGE[i][0], HINGE[i][1]);
      j.setContactsEnabled(false);
      this.joints.push(j);
    }
    this.alive = true;
    this.cur = this.read();
    this.prev = this.cur.map((a) => a.slice());
  }

  destroy() {
    if (!this.alive) return;
    const W = this.phys.world;
    for (const j of this.joints) { try { W.removeImpulseJoint(j, true); } catch { /* ya borrado */ } }
    for (const c of this.colliders) this.phys.untag(c);
    for (const b of this.bodies) { try { W.removeRigidBody(b); } catch { /* ya borrado */ } }
    this.bodies = [];
    this.colliders = [];
    this.joints = [];
    this.inertia = [];
    this.comLocal = [];
    this.alive = false;
  }

  read(out = []) {
    for (let i = 0; i < this.bodies.length; i++) {
      const t = this.bodies[i].translation(), r = this.bodies[i].rotation();
      out[i] = [t.x, t.y, t.z, r.x, r.y, r.z, r.w];
    }
    return out;
  }

  // Guarda la pose para interpolar entre pasos de física
  snapshot() {
    const tmp = this.prev;
    this.prev = this.cur;
    this.cur = this.read(tmp);
  }

  // Pose interpolada (alpha entre pasos)
  interpolated(alpha, out = []) {
    for (let i = 0; i < this.cur.length; i++) {
      const a = this.prev[i] || this.cur[i], b = this.cur[i];
      const o = out[i] || (out[i] = new Array(7));
      o[0] = a[0] + (b[0] - a[0]) * alpha;
      o[1] = a[1] + (b[1] - a[1]) * alpha;
      o[2] = a[2] + (b[2] - a[2]) * alpha;
      tq.set(a[3], a[4], a[5], a[6]).slerp(tq2.set(b[3], b[4], b[5], b[6]), alpha);
      o[3] = tq.x; o[4] = tq.y; o[5] = tq.z; o[6] = tq.w;
    }
    return out;
  }

  pelvis() { return this.bodies[0]; }
  headBody() { return this.bodies[2]; }

  // Músculos: targets = 11 x { q: Quaternion (mundo) }, root = { pos, vel, support } | null
  // PD "estable" (implícito): tau = I (kp e - kd w) / (1 + kd dt + kp dt^2)  -> no oscila con ganancias altas.
  drive(dt, targets, root, strength) {
    if (!this.alive || this.kinematic) return;
    const s = Math.max(0, strength);
    const bal = this.balance ?? 1;
    for (let i = 0; i < 11; i++) {
      const b = this.bodies[i];
      const r = b.rotation();
      const qc = tq.set(r.x, r.y, r.z, r.w);
      const qt = targets[i].q;
      const p0 = PARENT[i];
      // objetivo en espacio de articulación: mantener el ángulo local respecto del padre REAL
      if (p0 >= 0 && !ABS[i]) {
        const pr = this.bodies[p0].rotation();
        tqp.set(pr.x, pr.y, pr.z, pr.w);
        tqd.copy(targets[p0].q).invert().multiply(qt); // local objetivo
        tqd.premultiply(tqp); // mundo deseado = padre actual * local objetivo
      } else tqd.copy(qt);
      tq2.copy(qc).invert().premultiply(tqd);
      if (tq2.w < 0) { tq2.x = -tq2.x; tq2.y = -tq2.y; tq2.z = -tq2.z; tq2.w = -tq2.w; }
      const sinHalf = Math.sqrt(tq2.x * tq2.x + tq2.y * tq2.y + tq2.z * tq2.z);
      let ax = 0, ay = 0, az = 0;
      if (sinHalf > 1e-6) {
        const ang = 2 * Math.atan2(sinHalf, tq2.w);
        const k = ang / sinHalf;
        ax = tq2.x * k; ay = tq2.y * k; az = tq2.z * k;
      }
      // error absoluto (para el equilibrio de pelvis/torso/cabeza)
      let bx0 = ax, by0 = ay, bz0 = az;
      if (p0 >= 0 && BAL_KP[i]) {
        tqe.copy(qc).invert().premultiply(qt);
        if (tqe.w < 0) { tqe.x = -tqe.x; tqe.y = -tqe.y; tqe.z = -tqe.z; tqe.w = -tqe.w; }
        const sh = Math.sqrt(tqe.x * tqe.x + tqe.y * tqe.y + tqe.z * tqe.z);
        bx0 = by0 = bz0 = 0;
        if (sh > 1e-6) {
          const k2 = 2 * Math.atan2(sh, tqe.w) / sh;
          bx0 = tqe.x * k2; by0 = tqe.y * k2; bz0 = tqe.z * k2;
        }
      }
      const w = b.angvel();
      const p = PARENT[i];
      let wx = w.x, wy = w.y, wz = w.z;
      if (p >= 0) {
        const pw = this.bodies[p].angvel();
        wx -= pw.x; wy -= pw.y; wz -= pw.z;
      }
      const I = this.inertia[i];
      // compensación de gravedad (el músculo sostiene el peso del miembro)
      if (p >= 0 && s > 0.02 && Ragdoll.cfg.gravityComp) {
        const c = this.comLocal[i];
        const bt = b.translation();
        const rx = c.x, ry = c.y, rz = c.z;
        // r = rot(q) * c   (vector de la articulación al centro de masa, en mundo)
        const v = tv.set(rx, ry, rz).applyQuaternion(qc);
        const mg = this.meta.mass[i] * 12 * Math.min(1, s * 1.1);
        // torque de gravedad = r x (0,-mg,0) = (r.z*mg, 0, -r.x*mg) ; compensación = -eso
        const gx = -v.z * mg, gz = v.x * mg;
        b.applyTorqueImpulse({ x: gx * dt, y: 0, z: gz * dt }, true);
        this.bodies[p].applyTorqueImpulse({ x: -gx * dt, y: 0, z: -gz * dt }, true);
        void bt;
      }
      // músculo relativo al padre (brazos y piernas van por velocidad más abajo)
      if (!(i >= 3 && Ragdoll.cfg.velDrive && s > VEL_MIN)) {
        const kp = KP[i] * s, kd = KD[i] * Math.max(0.2, s);
        const den = 1 + kd * dt + kp * dt * dt;
        let tx = I * (kp * ax - kd * wx) / den, ty = I * (kp * ay - kd * wy) / den, tz = I * (kp * az - kd * wz) / den;
        const mag = Math.hypot(tx, ty, tz), lim = TMAX[i] * Math.max(0.12, s);
        if (mag > lim) { const f = lim / mag; tx *= f; ty *= f; tz *= f; }
        b.applyTorqueImpulse({ x: tx * dt, y: ty * dt, z: tz * dt }, true);
        const rf = Ragdoll.cfg.reaction * REACT[i];
        if (p >= 0 && rf > 0) this.bodies[p].applyTorqueImpulse({ x: -tx * dt * rf, y: -ty * dt * rf, z: -tz * dt * rf }, true);
      }
      // equilibrio absoluto (pelvis, torso, cabeza)
      const bk = BAL_KP[i];
      if (bk && s > 0.02) {
        const sb = s * bal;
        const Ie = this.inertia[i] * Ragdoll.cfg.balI;
        const kp = bk * sb * Ragdoll.cfg.balK, kd = BAL_KD[i] * Math.max(0.3, sb) * Ragdoll.cfg.balD;
        const den = 1 + kd * dt + kp * dt * dt;
        let bx = Ie * (kp * bx0 - kd * w.x) / den, by = Ie * (kp * by0 - kd * w.y) / den, bz = Ie * (kp * bz0 - kd * w.z) / den;
        const bm = Math.hypot(bx, by, bz), bl = BAL_MAX[i] * sb;
        if (bm > bl) { const f = bl / bm; bx *= f; by *= f; bz *= f; }
        b.applyTorqueImpulse({ x: bx * dt, y: by * dt, z: bz * dt }, true);
      }
    }
    // brazos y piernas: servo de velocidad en cadena (padre -> hijo). Cada parte recibe la velocidad
    // angular que la lleva a su pose en ~T segundos y la velocidad lineal coherente con girar sobre su
    // articulación. Sigue siendo un cuerpo dinámico: choca, empuja y recibe golpes (el solver manda).
    if (Ragdoll.cfg.velDrive && s > VEL_MIN) {
      const k = Math.min(1, (s - VEL_MIN) / (1 - VEL_MIN)) * 0.95;
      for (const i of LIMB_ORDER) {
        const b = this.bodies[i];
        const p = PARENT[i];
        const pb = this.bodies[p];
        const r = b.rotation();
        const qc = tq.set(r.x, r.y, r.z, r.w);
        if (ABS[i]) tqd.copy(targets[i].q);
        else {
          const pr = pb.rotation();
          tqd.copy(targets[p].q).invert().multiply(targets[i].q).premultiply(tqp.set(pr.x, pr.y, pr.z, pr.w));
        }
        tq2.copy(qc).invert().premultiply(tqd);
        if (tq2.w < 0) { tq2.x = -tq2.x; tq2.y = -tq2.y; tq2.z = -tq2.z; tq2.w = -tq2.w; }
        const sh = Math.sqrt(tq2.x * tq2.x + tq2.y * tq2.y + tq2.z * tq2.z);
        let ex = 0, ey = 0, ez = 0;
        if (sh > 1e-6) { const kk = 2 * Math.atan2(sh, tq2.w) / sh; ex = tq2.x * kk; ey = tq2.y * kk; ez = tq2.z * kk; }
        const pw = pb.angvel(), w = b.angvel();
        const inv = 1 / VEL_T;
        let dx = ex * inv, dy = ey * inv, dz = ez * inv;
        if (!ABS[i]) { dx += pw.x; dy += pw.y; dz += pw.z; }
        let nx = w.x + (dx - w.x) * k, ny = w.y + (dy - w.y) * k, nz = w.z + (dz - w.z) * k;
        const nm = Math.hypot(nx, ny, nz);
        if (nm > VEL_MAX) { nx *= VEL_MAX / nm; ny *= VEL_MAX / nm; nz *= VEL_MAX / nm; }
        b.setAngvel({ x: nx, y: ny, z: nz }, true);
        // velocidad lineal: la articulación se mueve con el padre, y la parte gira sobre ella
        const piv = b.translation(), pt = pb.translation(), pv = pb.linvel();
        const pcx = pt.x + this._comW(p, 0), pcy = pt.y + this._comW(p, 1), pcz = pt.z + this._comW(p, 2);
        const rx = piv.x - pcx, ry = piv.y - pcy, rz = piv.z - pcz;
        const vpx = pv.x + (pw.y * rz - pw.z * ry), vpy = pv.y + (pw.z * rx - pw.x * rz), vpz = pv.z + (pw.x * ry - pw.y * rx);
        const cx = this._comW(i, 0), cy = this._comW(i, 1), cz = this._comW(i, 2);
        const tvx = vpx + (ny * cz - nz * cy), tvy = vpy + (nz * cx - nx * cz), tvz = vpz + (nx * cy - ny * cx);
        const lv = b.linvel();
        b.setLinvel({ x: lv.x + (tvx - lv.x) * k, y: lv.y + (tvy - lv.y) * k, z: lv.z + (tvz - lv.z) * k }, true);
      }
    }
    // raíz: la pelvis sigue al controlador ("hilos de marioneta")
    if (root && s > 0.01) {
      const pb = this.bodies[0];
      const pt = pb.translation(), pv = pb.linvel();
      const M = this.totalMass;
      const kp = 170 * s, kd = 22 * Math.min(1, s * 1.2);
      const den = 1 + kd * dt + kp * dt * dt;
      let fx = M * (kp * (root.pos.x - pt.x) + kd * (root.vel.x - pv.x)) / den;
      let fz = M * (kp * (root.pos.z - pt.z) + kd * (root.vel.z - pv.z)) / den;
      let fy = M * (kp * 1.2 * (root.pos.y - pt.y) + kd * (root.vel.y - pv.y)) / den + M * 12 * (root.support ?? 1) * Math.min(1, s * 1.15);
      const hmax = M * 28 * s;
      const hm = Math.hypot(fx, fz);
      if (hm > hmax) { fx *= hmax / hm; fz *= hmax / hm; }
      fy = Math.max(-M * 20, Math.min(M * 34 * Math.max(s, 0.3), fy));
      pb.applyImpulse({ x: fx * dt, y: fy * dt, z: fz * dt }, true);
    }
  }

  // componente c (0 x, 1 y, 2 z) del vector articulación -> centro de masa de la parte i, en mundo
  _comW(i, c) {
    if (c === 0) {
      const r = this.bodies[i].rotation();
      this._cw = (this._cw || new THREE.Vector3()).copy(this.comLocal[i]).applyQuaternion(tq3.set(r.x, r.y, r.z, r.w));
    }
    return c === 0 ? this._cw.x : c === 1 ? this._cw.y : this._cw.z;
  }

  // Cuerpos cinemáticos (proxies de jugadores remotos, o sentado/manejando)
  follow(tr, dt = 0) {
    if (!this.alive) return;
    if (!this.kvel) { this.kvel = []; this.klast = []; for (let i = 0; i < 11; i++) { this.kvel.push(new THREE.Vector3()); this.klast.push(null); } }
    for (let i = 0; i < 11 && i < tr.length; i++) {
      const t = tr[i];
      const b = this.bodies[i];
      b.setNextKinematicTranslation({ x: t[0], y: t[1], z: t[2] });
      b.setNextKinematicRotation({ x: t[3], y: t[4], z: t[5], w: t[6] });
      const l = this.klast[i];
      if (l && dt > 0) {
        const v = this.kvel[i];
        const k = Math.min(1, dt * 30); // suavizado (las poses remotas llegan con saltos)
        v.x += ((t[0] - l[0]) / dt - v.x) * k; v.y += ((t[1] - l[1]) / dt - v.y) * k; v.z += ((t[2] - l[2]) / dt - v.z) * k;
      }
      this.klast[i] = [t[0], t[1], t[2]];
    }
  }

  // velocidad de una parte (cinemática: estimada de su movimiento; dinámica: la del motor)
  partVel(i, out = new THREE.Vector3()) {
    if (this.kinematic && this.kvel) return out.copy(this.kvel[i]);
    const v = this.bodies[i]?.linvel();
    return v ? out.set(v.x, v.y, v.z) : out.set(0, 0, 0);
  }

  // Cambia entre dinámico y cinemático sin reconstruir
  // extra: velocidad (Vector3) que se suma al pasar a dinámico (empujón del golpe)
  setKinematic(k, extra = null) {
    if (!this.alive || this.kinematic === k) return;
    const wasKin = this.kinematic;
    this.kinematic = k;
    const type = k ? RAPIER.RigidBodyType.KinematicPositionBased : RAPIER.RigidBodyType.Dynamic;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      b.setBodyType(type, true);
      // tirado se frena rápido contra el piso (no patina); de pie no importa (cinemático)
      b.setLinearDamping(k ? 0.08 : 0.45);
      if (!k) {
        // al caer conserva la inercia de la animación (+ el empujón)
        const v = wasKin && this.kvel ? this.kvel[i] : null;
        b.setLinvel({ x: (v?.x || 0) + (extra?.x || 0), y: (v?.y || 0) + (extra?.y || 0), z: (v?.z || 0) + (extra?.z || 0) }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
    if (k) this.klast = this.klast?.map(() => null);
  }

  teleport(tr) {
    for (let i = 0; i < 11; i++) {
      const t = tr[i];
      const b = this.bodies[i];
      b.setTranslation({ x: t[0], y: t[1], z: t[2] }, true);
      b.setRotation({ x: t[3], y: t[4], z: t[5], w: t[6] }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.cur = this.read();
    this.prev = this.cur.map((a) => a.slice());
  }

  impulse(i, imp, point = null) {
    const b = this.bodies[i];
    if (!b || this.kinematic) return;
    if (point) b.applyImpulseAtPoint(imp, point, true);
    else b.applyImpulse(imp, true);
  }

  setGroups(member, filter) {
    this.member = member;
    this.filter = filter;
    for (const c of this.colliders) c.setCollisionGroups(groups(member, filter));
  }

  setEnabled(v) {
    for (const b of this.bodies) b.setEnabled(v);
  }

  // filtro de colisión de una parte (p. ej. piernas sin piso mientras camina)
  setPartFilter(i, filter) {
    const c = this.colliders[i];
    if (c) c.setCollisionGroups(groups(this.member, filter));
  }

  // parte cortada (gore): deja de chocar aunque siga unida e invisible
  setPartCollide(i, on) {
    const c = this.colliders[i];
    if (c) c.setEnabled(on);
  }
}

Ragdoll.cfg = { pivotInertia: false, gravityComp: true, hinges: true, reaction: 1, limbInertia: 1, limbDamp: 0.6, balI: 1, balK: 1.5, balD: 0.7, velDrive: true };

export { q3 };
