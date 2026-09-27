// Banco: ragdoll desmayado (fuerza 0) recibiendo golpes fuertes. Mide los ángulos de cada articulación
// respecto del padre (en su marco local, como los límites) para ver si quedan poses imposibles.
// Uso: node --loader ./tests/loader.mjs tests/ragdoll-limits.mjs
import * as THREE from 'three';
import { pathToFileURL } from 'node:url';
import { Physics } from '../public/js/core/physics.js';
import { PoseRig } from '../public/js/char/rig.js';
import { Ragdoll, PARENT, JOINT_LIMITS } from '../public/js/game/ragdoll.js';
import { fakeMeta } from './ragdoll-bench.mjs';

const NAMES = ['pelvis', 'columna', 'cuello', 'hombroI', 'codoI', 'hombroD', 'codoD', 'caderaI', 'rodillaI', 'caderaD', 'rodillaD'];

export async function ragdollLimitsRun(seed = 7) {
  const ph = new Physics();
  await ph.init();
  ph.ground(0);
  const meta = fakeMeta();
  const rig = new PoseRig(meta.jointRest);
  const pos = new THREE.Vector3(0, 0, 0);
  rig.place(pos, 0);
  rig.animate({ speed: 0, grounded: true }, 1 / 60);
  const rag = new Ragdoll(ph, meta);
  rag.build(rig.transforms());
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  const worst = new Array(11).fill(0); // exceso máximo sobre el límite (rad)
  const maxAng = new Array(11).fill(0);
  let maxV = 0;
  const q = new THREE.Quaternion(), qp = new THREE.Quaternion();
  for (let k = 0; k < 60 * 6; k++) {
    rig.place(pos, 0);
    rig.animate({ speed: 0, grounded: true }, 1 / 60);
    const t = rig.compute();
    rag.drive(1 / 60, t, null, 0.02);
    // golpes al azar en distintas partes
    if (k % 20 === 0) {
      const i = Math.floor((rnd() + 0.5) * 11);
      rag.impulse(Math.min(10, Math.max(0, i)), { x: rnd() * 90, y: rnd() * 60 + 20, z: rnd() * 90 });
    }
    ph.world.step();
    for (let i = 1; i < 11; i++) {
      const b = rag.bodies[i], p = rag.bodies[PARENT[i]];
      const r = b.rotation(), pr = p.rotation();
      q.set(r.x, r.y, r.z, r.w);
      qp.set(pr.x, pr.y, pr.z, pr.w).invert().multiply(q); // local (hijo en el marco del padre)
      if (qp.w < 0) qp.set(-qp.x, -qp.y, -qp.z, -qp.w);
      const comp = [2 * Math.asin(Math.max(-1, Math.min(1, qp.x))), 2 * Math.asin(Math.max(-1, Math.min(1, qp.y))), 2 * Math.asin(Math.max(-1, Math.min(1, qp.z)))];
      maxAng[i] = Math.max(maxAng[i], 2 * Math.acos(Math.min(1, qp.w)));
      const L = JOINT_LIMITS?.[i];
      if (L) for (let a = 0; a < 3; a++) worst[i] = Math.max(worst[i], comp[a] - L[a][1], L[a][0] - comp[a]);
      const v = b.linvel();
      maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z));
    }
  }
  ph.world.free();
  return { worst, maxAng, maxV };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await ragdollLimitsRun();
  for (let i = 1; i < 11; i++) console.log(NAMES[i].padEnd(9), 'giro máx', (r.maxAng[i] * 57.3).toFixed(0).padStart(4) + '°', JOINT_LIMITS?.[i] ? `exceso ${(Math.max(0, r.worst[i]) * 57.3).toFixed(1)}°` : '');
  console.log('velocidad máx de partes', r.maxV.toFixed(2), 'm/s');
}
