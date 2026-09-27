import * as THREE from 'three';
import { Physics, RAPIER } from '../public/js/core/physics.js';
import { PoseRig } from '../public/js/char/rig.js';
import { Ragdoll } from '../public/js/game/ragdoll.js';
import { fakeMeta } from './ragdoll-bench.mjs';
Ragdoll.cfg = { pivotInertia: process.argv[2] === '1', gravityComp: process.argv[3] !== '0', hinges: true };
const ph = new Physics(); await ph.init(); ph.ground(0);
const meta = fakeMeta(); const rig = new PoseRig(meta.jointRest); const pos = new THREE.Vector3();
rig.place(pos, 0); rig.animate({ speed: 0, grounded: true }, 1/60);
const rag = new Ragdoll(ph, meta); rag.build(rig.transforms());
for (const i of [0, 1, 2, 7, 8, 9, 10]) rag.bodies[i].setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
const acc = new Array(11).fill(0); let n = 0;
for (let k = 0; k < 300; k++) {
  rig.place(pos, 0); rig.animate({ speed: 0, grounded: true }, 1/60); const t = rig.compute();
  rag.drive(1/60, t, null, 1); ph.world.step();
  if (k > 120) { rag.bodies.forEach((b, i) => { const v = b.angvel(); acc[i] += Math.hypot(v.x, v.y, v.z); }); n++; }
}
const t = rig.compute();
console.log('angvel media brazos:', [3,4,5,6].map((i) => (acc[i] / n).toFixed(2)).join(' '), ' error°:', [3,4,5,6].map((i) => { const r = rag.bodies[i].rotation(); return (new THREE.Quaternion(r.x, r.y, r.z, r.w).angleTo(t[i].q) * 180 / Math.PI).toFixed(1); }).join(' '));
