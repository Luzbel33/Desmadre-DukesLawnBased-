// Gore estilo Happy Wheels / Guts and Glory: miembros que se cortan (con física), chorros de sangre,
// cabeza que revienta (cerebro, ojos, pedazos de cráneo) y tripas que cuelgan de la panza.
// Todo es cosmético y local: cada cliente simula sus pedazos a partir del estado sincronizado (máscara sv).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { G, clamp } from '../core/G.js';
import { RAPIER, GR, groups } from '../core/physics.js';
import { PARENT, PART } from './ragdoll.js';

// Máscara de gore (se manda en el estado del jugador): bits 0..10 = parte cortada, 11 = cabeza reventada, 12 = tripas
export const GORE_HEAD_POP = 1 << 11;
export const GORE_GUTS = 1 << 12;
const PART_BONE = ['hip', 'spine_02', 'head', 'upperarm_l', 'lowerarm_l', 'upperarm_r', 'lowerarm_r', 'upperleg_l', 'lowerleg_l', 'upperleg_r', 'lowerleg_r'];
const MASS = [11, 24, 5, 2.2, 1.7, 2.2, 1.7, 8.5, 4.5, 8.5, 4.5];
const GIB_FILTER = GR.WORLD | GR.PROP | GR.VEHICLE | GR.DEBRIS | GR.RAGDOLL | GR.REMOTE;
const MAX_BODIES = 48;
const GIB_LIFE = 90; // s

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const Q1 = new THREE.Quaternion();
const M1 = new THREE.Matrix4();
const M2 = new THREE.Matrix4();
const S1 = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

// partes que cuelgan de i (incluida)
export function branchOf(i) {
  const out = [i];
  for (let k = 0; k < PARENT.length; k++) {
    let p = PARENT[k];
    while (p >= 0) { if (p === i) { out.push(k); break; } p = PARENT[p]; }
  }
  return out;
}

// ---------------------------------------------------------------- materiales y geometrías de órganos
let MATS = null;
function mats() {
  if (MATS) return MATS;
  const wet = (color, rough = 0.32) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 0.8, clearcoatRoughness: 0.25 });
  // cerebro: esfera con surcos (desplazamiento con ruido barato)
  const brain = new THREE.IcosahedronGeometry(0.07, 4);
  const p = brain.attributes.position;
  for (let i = 0; i < p.count; i++) {
    V1.fromBufferAttribute(p, i);
    const n = V1.clone().normalize();
    const w = Math.sin(n.x * 38 + Math.sin(n.y * 22) * 2) * Math.sin(n.z * 34 + n.y * 9) * 0.5 + 0.5;
    const fissure = Math.exp(-Math.pow(n.x * 9, 2)) * 0.25; // surco entre hemisferios
    V1.multiplyScalar(1 - w * 0.07 - fissure * (n.y > -0.2 ? 1 : 0));
    V1.y *= 0.8; V1.z *= 1.2;
    p.setXYZ(i, V1.x, V1.y, V1.z);
  }
  brain.computeVertexNormals();
  // ojo: textura de iris dibujada
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let eyeTex = null;
  if (cv) {
    cv.width = 128; cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = '#f2ece4'; c.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 14; i++) { // venitas
      c.strokeStyle = 'rgba(170,30,30,0.5)'; c.lineWidth = 0.6; c.beginPath();
      const y = Math.random() * 64; c.moveTo(64 + (Math.random() < 0.5 ? -60 : 60), y); c.quadraticCurveTo(64, 32 + (Math.random() - 0.5) * 30, 64 + (Math.random() - 0.5) * 20, 32); c.stroke();
    }
    const g = c.createRadialGradient(96, 32, 2, 96, 32, 13);
    g.addColorStop(0, '#111'); g.addColorStop(0.35, '#111'); g.addColorStop(0.4, '#5a3a1a'); g.addColorStop(0.9, '#8a6a3a'); g.addColorStop(1, '#2a1a0a');
    c.fillStyle = g; c.beginPath(); c.arc(96, 32, 13, 0, Math.PI * 2); c.fill();
    eyeTex = new THREE.CanvasTexture(cv);
    eyeTex.colorSpace = THREE.SRGBColorSpace;
  }
  // muñón: disco de carne irregular (radio 1, mira a +Y) con borde de piel y el hueso en el medio
  const stump = new THREE.CylinderGeometry(1, 0.92, 0.45, 18, 2);
  const sp = stump.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    V1.fromBufferAttribute(sp, i);
    if (V1.y > 0.1) { // tapa de arriba: carne abultada e irregular
      const r = Math.hypot(V1.x, V1.z);
      V1.y += 0.18 * (1 - r * r) + Math.sin(Math.atan2(V1.z, V1.x) * 5 + r * 7) * 0.06 * r;
    }
    sp.setXYZ(i, V1.x, V1.y, V1.z);
  }
  stump.computeVertexNormals();
  MATS = {
    brain, brainMat: wet(0xd8908e, 0.38),
    eye: new THREE.SphereGeometry(0.013, 16, 12), eyeMat: new THREE.MeshPhysicalMaterial({ map: eyeTex, roughness: 0.15, clearcoat: 1 }),
    nerve: new THREE.CylinderGeometry(0.003, 0.002, 0.03, 6).translate(0, -0.028, 0), nerveMat: wet(0x9a2a2a, 0.5),
    gut: new THREE.CapsuleGeometry(0.024, 0.075, 6, 10), gutMat: wet(0xc9737a, 0.3),
    stump, stumpMat: wet(0x8a0c12, 0.3),
    ring: new THREE.TorusGeometry(0.93, 0.13, 6, 18).rotateX(Math.PI / 2).translate(0, 0.2, 0), ringMat: wet(0x4a0306, 0.45),
    bone: new THREE.CylinderGeometry(0.28, 0.33, 1, 10).translate(0, 0.5, 0),
    boneMat: new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.55 }),
    marrow: new THREE.CircleGeometry(0.16, 10).rotateX(-Math.PI / 2).translate(0, 1.001, 0), marrowMat: wet(0x9a1a18, 0.4),
  };
  return MATS;
}

// Tapón de muñón (carne + borde + hueso) de radio r, mirando hacia `dir` (en el marco del padre)
function stumpMesh(r, dir, ws = 1) {
  const m = mats();
  const g = new THREE.Group();
  const flesh = new THREE.Mesh(m.stump, m.stumpMat);
  const ring = new THREE.Mesh(m.ring, m.ringMat);
  const bone = new THREE.Mesh(m.bone, m.boneMat);
  const marrow = new THREE.Mesh(m.marrow, m.marrowMat);
  bone.scale.set(1, 0.55, 1); // el hueso asoma un poco
  marrow.scale.set(1, 0.55, 1);
  g.add(flesh, ring, bone, marrow);
  g.scale.setScalar(r / (ws || 1));
  g.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.gore = true;
  return g;
}

export class Gore {
  constructor(scene, phys) {
    this.scene = scene;
    this.phys = phys;
    this.items = []; // { body(es), mesh, update(), t }
    this.fountains = []; // chorros activos
  }

  // ---------------------------------------------------------------- cuerpo físico cosmético
  _body(pos, quat, vel, ang, colliders, mass) {
    const W = this.phys.world;
    const b = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z).setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setLinvel(vel.x, vel.y, vel.z).setAngvel({ x: ang.x, y: ang.y, z: ang.z })
      .setLinearDamping(0.15).setAngularDamping(0.6).setCcdEnabled(true));
    const per = mass / Math.max(1, colliders.length);
    for (const cd of colliders) {
      cd.setMass(per).setFriction(0.9).setRestitution(0.12).setCollisionGroups(groups(GR.DEBRIS, GIB_FILTER));
      const c = W.createCollider(cd, b);
      this.phys.tag(c, { kind: 'gib', mat: 'flesh' });
    }
    return b;
  }

  _add(item) {
    this.items.push(item);
    let n = 0;
    for (const it of this.items) n += it.bodies.length;
    while (n > MAX_BODIES && this.items.length > 1) {
      const old = this.items.shift();
      n -= old.bodies.length;
      this._remove(old);
    }
  }

  _remove(it) {
    const W = this.phys.world;
    for (const j of it.joints || []) { try { W.removeImpulseJoint(j, true); } catch { /* ya borrado */ } }
    for (const b of it.bodies) { try { W.removeRigidBody(b); } catch { /* ya borrado */ } }
    it.mesh?.removeFromParent();
    it.dispose?.();
  }

  // ---------------------------------------------------------------- miembro cortado
  // char: HumanCharacter (local o remoto). part: índice de parte. opts: { vel: Vector3, gib: bool }
  sever(char, part, opts = {}) {
    if (!char?.model || char.detached[part]) return;
    const branch = branchOf(part);
    char.root.updateWorldMatrix(true, true);
    const J = char.joints;
    const boneName = PART_BONE[part];
    const bone = char.bones[boneName];
    if (!bone) return;
    const bodyWorld0 = J[part].matrixWorld.clone();
    if (opts.gib !== false) this._limbGib(char, part, branch, bodyWorld0, opts.vel || V1.set(0, 2, 0));
    // en el cuerpo: el tramo colapsa en la articulación (muñón)
    for (const k of branch) char.detached[k] = true;
    bone.scale.setScalar(0.0001);
    // tapón del muñón del grosor del miembro (tapa la manga/el pantalón): carne, borde y hueso
    const r = part === PART.HEAD ? 0.05 : (char.meta.caps[part]?.r || 0.05) * 1.12;
    const ws = bone.parent ? bone.parent.getWorldScale(V2).x : 1; // los huesos pueden venir escalados (cm)
    const dir = bone.position.lengthSq() > 1e-10 ? bone.position.clone() : new THREE.Vector3(0, 1, 0);
    const stump = stumpMesh(r, dir, ws);
    bone.parent?.add(stump);
    stump.position.copy(bone.position);
    char.goreBits = (char.goreBits || []);
    char.goreBits.push(stump);
    // la ropa y la piel alrededor del corte se empapan de sangre
    const pp = PARENT[part];
    if (pp >= 0 && char.wound && char.worldToPart) {
      const jw = bone.getWorldPosition(new THREE.Vector3());
      const local = char.worldToPart(pp, jw, new THREE.Vector3());
      char.wound(pp, local, 'cut', 1.8, null, (Math.random() * 1e6) | 0);
      char.wound(pp, local.clone().multiplyScalar(0.85), 'blood', 2.2, null, (Math.random() * 1e6) | 0);
    }
    // chorro de sangre desde el muñón
    this.fountains.push({ char, bone, part, t: 0, dur: 4 + Math.random() * 2.5, rate: part === PART.HEAD ? 140 : 100 });
    G.sfx?.trigger('cut', V1.setFromMatrixPosition(bodyWorld0), 1);
  }

  _limbGib(char, part, branch, bodyWorld0, vel) {
    // copia independiente del personaje: solo queda visible el tramo cortado
    const clone = SkeletonUtils.clone(char.model);
    clone.traverse((o) => {
      if (o.isMesh && !o.isSkinnedMesh) o.visible = false;
      o.frustumCulled = false;
    });
    char.model.updateWorldMatrix(true, true);
    char.model.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
    this.scene.add(clone);
    clone.updateMatrixWorld(true);
    const bones = {};
    clone.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    const cb = bones[PART_BONE[part]];
    const hip = bones.hip;
    if (!cb || !hip) { clone.removeFromParent(); return; }
    const cbWorld0 = cb.matrixWorld.clone();
    clone.attach(cb);
    clone.attach(hip);
    hip.scale.setScalar(0.0001);
    // el pedazo también tiene su corte (mirando hacia donde estaba el cuerpo)
    const child = cb.children.find((c) => c.isBone);
    const cutDir = child && child.position.lengthSq() > 1e-10 ? child.position.clone().negate() : new THREE.Vector3(0, -1, 0);
    const cap = stumpMesh((char.meta.caps[part]?.r || 0.05) * 1.1, cutDir, cb.getWorldScale(V2).x);
    cb.add(cap);
    // la cabeza cortada conserva los párpados/mandíbula en la pose del momento
    const offset = M1.copy(bodyWorld0).invert().multiply(cbWorld0).clone();
    const cloneInv = clone.matrixWorld.clone().invert();
    // colisionadores: cápsulas de las partes del tramo en el marco de la parte raíz
    const inv0 = M2.copy(bodyWorld0).invert().clone();
    const colliders = [];
    let mass = 0;
    for (const k of branch) {
      const c = char.meta.caps[k];
      if (!c) continue;
      const rel = inv0.clone().multiply(char.joints[k].matrixWorld);
      const a = c.a.clone().applyMatrix4(rel), b = c.b.clone().applyMatrix4(rel);
      const len = a.distanceTo(b);
      const cd = RAPIER.ColliderDesc.capsule(Math.max(0.01, len / 2 - c.r), c.r * 0.9);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize());
      cd.setTranslation(mid.x, mid.y, mid.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      colliders.push(cd);
      mass += MASS[k];
    }
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), sc = new THREE.Vector3();
    bodyWorld0.decompose(pos, quat, sc);
    const ang = new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
    const v = vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5));
    const body = this._body(pos, quat, v, ang, colliders, Math.max(0.5, mass));
    const item = {
      bodies: [body], mesh: clone, t: 0, bleed: 2.5,
      update: () => {
        const t = body.translation(), r = body.rotation();
        M2.compose(V1.set(t.x, t.y, t.z), Q1.set(r.x, r.y, r.z, r.w), S1).multiply(offset);
        M2.premultiply(cloneInv);
        M2.decompose(cb.position, cb.quaternion, cb.scale);
        hip.position.copy(cb.position);
        return { x: t.x, y: t.y, z: t.z };
      },
      dispose: () => { clone.traverse((o) => { if (o.isSkinnedMesh) o.skeleton?.dispose?.(); }); },
    };
    this._add(item);
  }

  // ---------------------------------------------------------------- cabeza reventada
  explodeHead(char, opts = {}) {
    if (!char?.model || char.detached[PART.HEAD]) return;
    const head = char.headWorld(new THREE.Vector3());
    const vel = opts.vel || new THREE.Vector3();
    this.sever(char, PART.HEAD, { gib: false });
    const m = mats();
    // cerebro
    const brain = new THREE.Mesh(m.brain, m.brainMat);
    brain.castShadow = true;
    this._organ(brain, head, vel.clone().multiplyScalar(0.6).add(V1.set(0, 2.5, 0)), RAPIER.ColliderDesc.ball(0.06), 1.3);
    // ojos con nervio
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      const ball = new THREE.Mesh(m.eye, m.eyeMat);
      ball.rotation.y = -Math.PI / 2;
      const nerve = new THREE.Mesh(m.nerve, m.nerveMat);
      nerve.rotation.x = Math.PI / 2;
      eye.add(ball, nerve);
      const p = head.clone().add(V1.set(s * 0.035, 0.02, 0.06));
      this._organ(eye, p, vel.clone().multiplyScalar(0.8).add(V1.set(s * (1 + Math.random() * 2), 2 + Math.random() * 2, (Math.random() - 0.5) * 2)), RAPIER.ColliderDesc.ball(0.014), 0.03);
    }
    // pedazos de cráneo y sangre
    if (G.fx) {
      for (let i = 0; i < 18; i++) {
        const r = Math.random();
        G.fx.bits.spawn({
          x: head.x, y: head.y, z: head.z,
          vx: vel.x * 0.4 + (Math.random() - 0.5) * 5, vy: 1.2 + Math.random() * 3.5, vz: vel.z * 0.4 + (Math.random() - 0.5) * 5,
          life: 8 + Math.random() * 6, s: 0.01 + Math.random() * 0.018, sy: 0.35,
          col: r < 0.45 ? 0xe9dfc9 : r < 0.78 ? 0x6e0810 : 0xc98a86, grav: -9.8, bounce: 0.2, drag: 0.5,
        });
      }
      G.fx.blood(head, V1.set(0, 1, 0), 2.2);
      G.fx.blood(head, V2.copy(vel).normalize().add(V1.set(0, 0.4, 0)), 1.6);
    }
    G.sfx?.trigger('splat', head, 1) || G.sfx?.trigger('hit', head, 1);
  }

  _organ(mesh, pos, vel, colliderDesc, mass) {
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const ang = new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    const body = this._body(pos, mesh.quaternion, vel, ang, [colliderDesc], mass);
    this._add({
      bodies: [body], mesh, t: 0, bleed: 0.6,
      update: () => {
        const t = body.translation(), r = body.rotation();
        mesh.position.set(t.x, t.y, t.z);
        mesh.quaternion.set(r.x, r.y, r.z, r.w);
        return t;
      },
    });
  }

  // ---------------------------------------------------------------- tripas colgando de la panza
  // anchorBody: cuerpo del torso (ragdoll local o proxy remoto) al que se enganchan; point: salida (mundo)
  spillGuts(anchorBody, point, dir) {
    const m = mats();
    const W = this.phys.world;
    const n = 6;
    const bodies = [], joints = [], meshes = [];
    const d = dir.clone().setY(Math.max(-0.2, dir.y)).normalize();
    const seg = 0.11;
    let prev = anchorBody;
    let prevAnchor = null;
    if (anchorBody) {
      const t = anchorBody.translation(), r = anchorBody.rotation();
      M1.compose(V1.set(t.x, t.y, t.z), Q1.set(r.x, r.y, r.z, r.w), S1).invert();
      prevAnchor = point.clone().applyMatrix4(M1);
    }
    const group = new THREE.Group();
    this.scene.add(group);
    for (let i = 0; i < n; i++) {
      const p = point.clone().addScaledVector(d, seg * (i + 0.5)).add(V1.set(0, -0.04 * i, 0));
      const q = new THREE.Quaternion().setFromUnitVectors(UP, d);
      const vel = d.clone().multiplyScalar(1.2);
      const b = this._body(p, q, vel, new THREE.Vector3(), [RAPIER.ColliderDesc.capsule(0.04, 0.024)], 0.12);
      b.setLinearDamping(0.8);
      b.setAngularDamping(2);
      const mesh = new THREE.Mesh(m.gut, m.gutMat);
      mesh.castShadow = true;
      group.add(mesh);
      if (prev) {
        const a1 = prevAnchor || new THREE.Vector3(0, 0.055, 0);
        const jd = RAPIER.JointData.spherical({ x: a1.x, y: a1.y, z: a1.z }, { x: 0, y: -0.055, z: 0 });
        joints.push(W.createImpulseJoint(jd, prev, b, true));
      }
      prev = b;
      prevAnchor = new THREE.Vector3(0, 0.055, 0);
      bodies.push(b);
      meshes.push(mesh);
    }
    this._add({
      bodies, joints, mesh: group, t: 0, bleed: 0.4,
      update: () => {
        for (let i = 0; i < n; i++) {
          const t = bodies[i].translation(), r = bodies[i].rotation();
          meshes[i].position.set(t.x, t.y, t.z);
          meshes[i].quaternion.set(r.x, r.y, r.z, r.w);
        }
        return bodies[n - 1].translation();
      },
    });
    if (G.fx) G.fx.blood(point, d, 1.4);
  }

  // Suelta las tripas del cuerpo (cuando el dueño reaparece o se va)
  detachFrom(anchorBody) {
    const W = this.phys.world;
    for (const it of this.items) {
      if (!it.joints?.length) continue;
      const j = it.joints[0];
      try {
        if (j.body1().handle === anchorBody.handle) { W.removeImpulseJoint(j, true); it.joints.shift(); }
      } catch { /* ya borrado */ }
    }
  }

  // Restaura el cuerpo de un personaje (reaparición)
  restore(char) {
    if (!char?.bones) return;
    for (let k = 0; k < 11; k++) {
      if (!char.detached[k]) continue;
      char.detached[k] = false;
      const b = char.bones[PART_BONE[k]];
      if (b) b.scale.setScalar(1);
    }
    for (const s of char.goreBits || []) s.removeFromParent();
    char.goreBits = [];
    char.setVisibleHead?.(char.headVisible);
    this.fountains = this.fountains.filter((f) => f.char !== char);
  }

  clear() {
    for (const it of this.items) this._remove(it);
    this.items = [];
    this.fountains = [];
  }

  update(dt) {
    // pedazos: seguir a su cuerpo físico y gotear un poco
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const p = it.update();
      if (it.bleed > 0 && G.fx && Math.random() < it.bleed * dt * 8) {
        G.fx.bloodStream(V1.set(p.x, p.y, p.z), V2.set(0, -1, 0), 1, 0.4);
      }
      it.bleed = Math.max(0, it.bleed - dt * 0.2);
      if (it.t > GIB_LIFE) { this._remove(it); this.items.splice(i, 1); }
    }
    // chorros desde los muñones
    for (let i = this.fountains.length - 1; i >= 0; i--) {
      const f = this.fountains[i];
      f.t += dt;
      if (f.t > f.dur || !f.char.model) { this.fountains.splice(i, 1); continue; }
      const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(f.t * 7.5)); // late con el corazón
      const k = (1 - f.t / f.dur) * pulse;
      f.acc = (f.acc || 0) + f.rate * k * dt;
      const n = Math.floor(f.acc);
      if (!G.fx || n < 1) continue;
      f.acc -= n;
      f.bone.getWorldPosition(V1);
      const par = f.bone.parent;
      if (par?.isBone) par.getWorldPosition(V2); else V2.copy(V1).sub(UP);
      const dir = V1.clone().sub(V2).normalize().multiplyScalar(0.85).add(UP.clone().multiplyScalar(0.3)).normalize();
      G.fx.bloodStream(V1, dir, Math.min(n, 6), 1.6 + k * 2.6);
    }
  }
}

// Decide el gore de un golpe. Devuelve { sever: parte | -1, headPop, guts }
export function goreFor(part, sev, kind, src) {
  const out = { sever: -1, headPop: false, guts: false };
  const limb = part >= 3;
  if (kind === 'mulch') {
    // cuchillas de la cortadora: pica todo
    if (part === PART.HEAD && sev > 0.6) out.headPop = true;
    else if (limb && sev > 0.5) out.sever = part;
    else if ((part === PART.TORSO || part === PART.PELVIS) && sev > 0.8) out.guts = true;
  } else if (kind === 'cut') {
    // filo: hace falta un buen hachazo/sablazo (no cualquier roce)
    if (part === PART.HEAD && sev > 1.85) out.sever = PART.HEAD;
    else if ((part === 4 || part === 6 || part === 8 || part === 10) && sev > 1.2) out.sever = part;
    else if ((part === 3 || part === 5 || part === 7 || part === 9) && sev > 1.6) out.sever = part;
    else if ((part === PART.TORSO || part === PART.PELVIS) && sev > 1.4) out.guts = true;
  } else {
    // contundente: la cabeza revienta con golpes brutales (maza, choque a toda velocidad)
    if (part === PART.HEAD && sev > (src === 'vehicle' ? 2.4 : 2.2)) out.headPop = true;
    else if (src === 'vehicle' && limb && sev > 2.6) out.sever = part;
  }
  return out;
}
