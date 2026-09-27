import * as THREE from 'three';
import { Physics, RAPIER } from '../public/js/core/physics.js';
import { PoseRig } from '../public/js/char/rig.js';
import { Ragdoll } from '../public/js/game/ragdoll.js';
import { fakeMeta } from './ragdoll-bench.mjs';
const mode = process.argv[2] || 'full';
Ragdoll.cfg = { pivotInertia: false, gravityComp: process.argv[3] !== '0', hinges: true, reaction: 1, limbInertia: 1, limbDamp: 0.6 };
const ph = new Physics(); await ph.init(); ph.ground(0);
const meta = fakeMeta(); const rig = new PoseRig(meta.jointRest); const pos = new THREE.Vector3();
rig.place(pos, 0); rig.animate({ speed: 0, grounded: true }, 1/60);
const rag = new Ragdoll(ph, meta); rag.build(rig.transforms());
const fixed = mode === 'trunk' ? [0, 1, 2] : mode === 'pelvis' ? [0] : mode === 'legs' ? [0, 7, 8, 9, 10] : [];
for (const i of fixed) rag.bodies[i].setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
let line = [];
for (let k = 0; k < 240; k++) {
  rig.place(pos, 0); rig.animate({ speed: 0, grounded: true }, 1/60); const t = rig.compute();
  rag.drive(1/60, t, fixed.includes(0) ? null : { pos: t[0].p, vel: new THREE.Vector3(), support: 1 }, 1); ph.world.step();
  if (k % 12 === 0) { const w = rag.bodies[3].angvel(); const w1 = rag.bodies[1].angvel(); line.push(Math.hypot(w.x, w.y, w.z).toFixed(1) + '/' + Math.hypot(w1.x, w1.y, w1.z).toFixed(1)); }
}
console.log(mode, 'grav', Ragdoll.cfg.gravityComp, 'brazoL/torso angvel:', line.join(' '));
