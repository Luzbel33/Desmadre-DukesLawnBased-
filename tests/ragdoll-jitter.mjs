import * as THREE from 'three';
import { Physics } from '../public/js/core/physics.js';
import { PoseRig } from '../public/js/char/rig.js';
import { Ragdoll } from '../public/js/game/ragdoll.js';
import { fakeMeta } from './ragdoll-bench.mjs';
const [bi, bk, bd] = (process.argv[2] || '1,1,1').split(',').map(Number);
Ragdoll.cfg = { pivotInertia: false, gravityComp: true, hinges: true, reaction: 1, limbInertia: 1, limbDamp: 0.6, balI: bi, balK: bk, balD: bd };
const ph = new Physics(); await ph.init(); ph.ground(0);
const meta = fakeMeta(); const rig = new PoseRig(meta.jointRest); const pos = new THREE.Vector3();
rig.place(pos, 0); rig.animate({ speed: 0, grounded: true }, 1/60);
const rag = new Ragdoll(ph, meta); rag.build(rig.transforms());
const acc = new Array(11).fill(0); let n = 0;
for (let k = 0; k < 300; k++) {
  rig.place(pos, 0); rig.animate({ speed: 0, grounded: true }, 1/60); const t = rig.compute();
  rag.drive(1/60, t, { pos: t[0].p, vel: new THREE.Vector3(), support: 1 }, 1); ph.world.step();
  if (k > 120) { rag.bodies.forEach((b, i) => { const v = b.linvel(); acc[i] += Math.hypot(v.x, v.y, v.z); }); n++; }
}
console.log(process.argv[2] || '111', 'vel media (m/s):', acc.map((a) => (a / n).toFixed(3)).join(' '));
// error angular medio por parte vs objetivo
const t = rig.compute();
console.log('error angular (grados):', rag.bodies.map((b, i) => { const r = b.rotation(); const q = new THREE.Quaternion(r.x, r.y, r.z, r.w); return (q.angleTo(t[i].q) * 180 / Math.PI).toFixed(1); }).join(' '));
