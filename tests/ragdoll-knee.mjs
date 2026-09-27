import * as THREE from 'three';
import { Physics, RAPIER } from '../public/js/core/physics.js';
import { PoseRig } from '../public/js/char/rig.js';
import { Ragdoll } from '../public/js/game/ragdoll.js';
import { fakeMeta } from './ragdoll-bench.mjs';
Ragdoll.cfg = { pivotInertia: false, gravityComp: true, hinges: process.argv[2] !== '0' };
const flex = +(process.argv[3] || 1.0);
const ph = new Physics(); await ph.init();
const meta = fakeMeta(); const rig = new PoseRig(meta.jointRest); const pos = new THREE.Vector3(0, 1, 0);
rig.place(pos, 0); rig.animate({ speed: 0, grounded: true }, 1/60);
const rag = new Ragdoll(ph, meta); rag.build(rig.transforms());
for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 9]) rag.bodies[i].setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
for (let k = 0; k < 240; k++) {
  rig.place(pos, 0); rig.animate({ speed: 0, grounded: true }, 1/60);
  rig.joints[8].rotation.set(flex, 0, 0); rig.joints[10].rotation.set(flex, 0, 0);
  const t = rig.compute();
  rag.drive(1/60, t, null, 1); ph.world.step();
}
const t = rig.compute();
const r = rag.bodies[8].rotation(); const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
const th = rag.bodies[7].rotation(); const qt = new THREE.Quaternion(th.x, th.y, th.z, th.w);
const rel = qt.clone().invert().multiply(q); const e = new THREE.Euler().setFromQuaternion(rel, 'XYZ');
console.log('hinges', Ragdoll.cfg.hinges, 'flex objetivo', flex, '-> ángulo real rodilla x=', e.x.toFixed(2), ' error°', (q.angleTo(t[8].q) * 180 / Math.PI).toFixed(1));
