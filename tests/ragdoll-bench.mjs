// Banco de pruebas numérico del ragdoll activo (sin navegador).
// node --no-warnings --loader ./tests/loader.mjs tests/ragdoll-bench.mjs
import * as THREE from 'three';
import { pathToFileURL } from 'node:url';
import { Physics } from '../public/js/core/physics.js';
import { PoseRig } from '../public/js/char/rig.js';
import { Ragdoll } from '../public/js/game/ragdoll.js';

export function fakeMeta() {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const hips = V(0, 0.97, 0), spine = V(0, 1.12, 0), neck = V(0, 1.56, 0);
  const shL = V(0.17, 1.5, 0), elL = V(0.2, 1.2, 0), haL = V(0.21, 0.95, 0.02);
  const shR = V(-0.17, 1.5, 0), elR = V(-0.2, 1.2, 0), haR = V(-0.21, 0.95, 0.02);
  const hiL = V(0.09, 0.97, 0), knL = V(0.09, 0.55, 0), anL = V(0.09, 0.13, -0.02);
  const hiR = V(-0.09, 0.97, 0), knR = V(-0.09, 0.55, 0), anR = V(-0.09, 0.13, -0.02);
  const top = V(0, 1.85, 0);
  const jointRest = [hips.clone(), spine.clone().sub(hips), neck.clone().sub(spine), shL.clone().sub(spine), elL.clone().sub(shL), shR.clone().sub(spine), elR.clone().sub(shR), hiL.clone().sub(hips), knL.clone().sub(hiL), hiR.clone().sub(hips), knR.clone().sub(hiR)];
  const caps = [
    { a: V(0, -0.08, 0), b: spine.clone().sub(hips), r: 0.15 },
    { a: V(0, 0.02, 0), b: neck.clone().sub(spine).multiplyScalar(0.92), r: 0.165 },
    { a: V(0, 0.05, 0.01), b: top.clone().sub(neck).add(V(0, -0.07, 0.015)), r: 0.105 },
    { a: V(), b: elL.clone().sub(shL), r: 0.055 },
    { a: V(), b: haL.clone().sub(elL).multiplyScalar(1.28), r: 0.047 },
    { a: V(), b: elR.clone().sub(shR), r: 0.055 },
    { a: V(), b: haR.clone().sub(elR).multiplyScalar(1.28), r: 0.047 },
    { a: V(), b: knL.clone().sub(hiL), r: 0.08 },
    { a: V(), b: anL.clone().sub(knL).add(V(0, -0.06, 0.04)), r: 0.06 },
    { a: V(), b: knR.clone().sub(hiR), r: 0.08 },
    { a: V(), b: anR.clone().sub(knR).add(V(0, -0.06, 0.04)), r: 0.06 },
  ];
  return { jointRest, caps, mass: [11, 24, 5, 2.2, 1.7, 2.2, 1.7, 8.5, 4.5, 8.5, 4.5], gripLocal: { l: haL.clone().sub(elL).multiplyScalar(1.13), r: haR.clone().sub(elR).multiplyScalar(1.13) } };
}

async function main() {
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
  const tilt = () => {
    const r = rag.bodies[1].rotation();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
    return Math.acos(Math.min(1, up.y)) * 180 / Math.PI;
  };
  const run = (secs, opts = {}) => {
    const n = Math.round(secs * 60);
    let minY = 9, maxY = -9;
    for (let k = 0; k < n; k++) {
      const spd = opts.speed || 0;
      if (spd) pos.z += spd / 60;
      rig.place(pos, 0);
      rig.animate({ speed: spd, grounded: true }, 1 / 60);
      const t = rig.compute();
      const s = typeof opts.strength === 'function' ? opts.strength(k / 60) : (opts.strength ?? 1);
      rag.drive(1 / 60, t, { pos: t[0].p, vel: new THREE.Vector3(0, 0, spd), support: 1 }, s);
      ph.world.step();
      const y = rag.bodies[0].translation().y;
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const pt = rag.bodies[0].translation();
    return { pelvisY: +pt.y.toFixed(3), minY: +minY.toFixed(3), maxY: +maxY.toFixed(3), torsoTilt: +tilt().toFixed(1), dz: +(pt.z - pos.z).toFixed(3), headY: +rag.bodies[2].translation().y.toFixed(3) };
  };
  console.log('parado 3s        ', run(3));
  console.log('caminando 3s     ', run(3, { speed: 1.6 }));
  console.log('corriendo 2s     ', run(2, { speed: 6 }));
  console.log('parado 1s        ', run(1));
  rag.impulse(2, { x: 0, y: 0, z: -40 });
  console.log('piña en la cara   ', run(0.3), '-> recupera', run(1.5));
  rag.impulse(1, { x: 150, y: 20, z: 0 });
  console.log('empujón fuerte    ', run(0.4), '-> recupera', run(2));
  console.log('KO (fuerza 0) 3s  ', run(3, { strength: 0 }));
  // levantarse: ubicar el controlador donde quedó la pelvis
  const pt = rag.bodies[0].translation();
  pos.set(pt.x, 0, pt.z);
  console.log('levantándose 2.5s ', run(2.5, { strength: (t) => Math.min(1, t / 1.2) }));
  console.log('parado 1s        ', run(1));
  const v = rag.bodies.map((b) => b.linvel()).reduce((m, l) => Math.max(m, Math.hypot(l.x, l.y, l.z)), 0);
  console.log('vel máx de partes', v.toFixed(3));
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
