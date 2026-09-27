// Bolsa de boxeo colgada al lado del ring: para practicar piñas, patadas y swings sin tener a nadie
// enfrente. Es física local (cada cliente la suya): se hamaca con los golpes y mide qué tan fuerte pegaste.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { RAPIER, GR, groups } from '../core/physics.js';
import { PART } from './ragdoll.js';

const HALF = 0.42; // media altura del cilindro de la bolsa
const R = 0.21;
const ROPE = 0.55; // de la argolla a la parte de arriba de la bolsa

export class PunchBag {
  constructor(scene, phys, x, z, top = 2.02, ceil = 4.7) {
    this.scene = scene;
    this.phys = phys;
    const W = phys.world;
    this.anchorPos = new THREE.Vector3(x, top, z);
    const anchor = W.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, top, z));
    const cy = top - ROPE - HALF;
    this.body = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, cy, z)
      .setLinearDamping(0.35).setAngularDamping(1.6));
    this.collider = W.createCollider(RAPIER.ColliderDesc.capsule(HALF - R * 0.4, R).setMass(28).setFriction(0.8).setRestitution(0.1)
      .setActiveCollisionTypes(15 | 52224)
      // como un obstáculo: frena al cuerpo que camina (cápsula) y a la mano (rayo), pero las partes
      // cinemáticas no la atraviesan empujándola como si fuera de papel: el golpe se la da punch()
      .setCollisionGroups(groups(GR.VEHICLE, GR.PROP | GR.DEBRIS | GR.ME)), this.body);
    phys.tag(this.collider, { kind: 'bag', ref: this });
    const jd = RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: HALF + ROPE, z: 0 });
    W.createImpulseJoint(jd, anchor, this.body, true);
    // lo que se ve: bolsa de cuero, tapas, correas y la cadena al techo
    const leather = new THREE.MeshPhysicalMaterial({ color: 0x8e1a17, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d1a18, roughness: 0.6 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, metalness: 1, roughness: 0.25 });
    const g = new THREE.Group();
    const bag = new THREE.Mesh(new THREE.CapsuleGeometry(R, HALF * 2 - R * 0.8, 8, 20), leather);
    bag.castShadow = true;
    g.add(bag);
    for (const y of [-HALF * 0.55, HALF * 0.55]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(R * 1.005, 0.012, 6, 28), dark);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      g.add(band);
    }
    const lbl = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.01, R * 1.01, 0.16, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0xe9c46a, roughness: 0.5 }));
    g.add(lbl);
    // correas hasta la argolla
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const from = new THREE.Vector3(Math.cos(a) * R * 0.8, HALF, Math.sin(a) * R * 0.8);
      const to = new THREE.Vector3(0, HALF + ROPE, 0);
      const len = from.distanceTo(to);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 5), metal);
      c.position.copy(from).add(to).multiplyScalar(0.5);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      g.add(c);
    }
    scene.add(g);
    this.mesh = g;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, ceil - top, 6), new THREE.MeshStandardMaterial({ color: 0x3a3a3c, metalness: 0.8, roughness: 0.45 }));
    chain.position.set(x, (top + ceil) / 2, z);
    scene.add(chain);
    this.hitCd = 0;
    this.onHit = null; // (speed m/s, punto)
  }

  // Una mano (o lo que tiene en la mano) le pegó: se hamaca según la fuerza del golpe
  punch(speed, point, dir, held = 0) {
    const k = 28 * (0.26 + Math.min(held, 6) * 0.03) * speed;
    this.body.applyImpulseAtPoint({ x: dir.x * k, y: dir.y * k * 0.3, z: dir.z * k }, { x: point.x, y: point.y, z: point.z }, true);
    this.hitCd = 0.2;
    this.onHit?.(speed, point.clone());
  }

  update(dt) {
    const t = this.body.translation(), r = this.body.rotation();
    this.mesh.position.set(t.x, t.y, t.z);
    this.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    this.hitCd = Math.max(0, this.hitCd - dt);
    const L = G.me;
    if (!L || this.hitCd > 0 || L.physMode !== 'anim' || L.action !== 'kick' || L.actionT < 0.1 || L.actionT > 0.32) return;
    // patada: el pie (punta de la pierna derecha) cerca del eje de la bolsa
    const sb = L.rag.bodies[PART.SHIN_R];
    if (!sb) return;
    const st = sb.translation(), sr = sb.rotation();
    // punta de la pierna (tobillo/pie) según la cápsula de la pantorrilla
    const tip = L.meta.caps[PART.SHIN_R]?.b || new THREE.Vector3(0, -0.46, 0.04);
    const foot = tip.clone().applyQuaternion(new THREE.Quaternion(sr.x, sr.y, sr.z, sr.w)).add(new THREE.Vector3(st.x, st.y, st.z));
    const dx = t.x - foot.x, dz = t.z - foot.z;
    const d = Math.hypot(dx, dz);
    if (d > R + 0.16 || Math.abs(foot.y - t.y) > HALF + 0.15) return;
    const v = L.rag.partVel(PART.SHIN_R, new THREE.Vector3());
    const dir = new THREE.Vector3(dx / (d || 1), 0, dz / (d || 1));
    const sp = Math.max(v.dot(dir), 3.5);
    this.punch(sp, foot, dir, 3);
  }
}
