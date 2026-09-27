// Banco: cortar un miembro y morir no tiene que hacer volar el cuerpo (node --loader ./tests/loader.mjs tests/gore-bench.mjs)
import * as THREE from 'three';
import { Physics } from '../public/js/core/physics.js';
import { G } from '../public/js/core/G.js';
import { LocalPlayer } from '../public/js/game/player.js';
import { World } from '../public/js/world/world.js';
import { TEX } from '../public/js/world/textures.js';
import { PART } from '../public/js/game/ragdoll.js';
import { fakeMeta } from './ragdoll-bench.mjs';
TEX.grass = () => new THREE.Texture();
const stub = () => { const t = { root: new THREE.Group(), meta: fakeMeta(), grip: { l: 0, r: 0 }, expr: {}, handR: new THREE.Object3D(), handL: new THREE.Object3D() }; return new Proxy(t, { get: (o, k) => (k in o ? o[k] : () => null) }); };
export async function goreRun(part, how = 'die', pose = null) {
  const ph = new Physics(); await ph.init();
  G.phys = ph; G.scene = new THREE.Scene(); G.inGame = true; G.time = 0; G.myId = 1; G.players = new Map(); G.settings = { desmadre: true }; G.props = null; G.gore = null;
  G.input = { enabled: true, locked: true, key: () => false, hit: () => false, btn: () => false }; G.camera = new THREE.PerspectiveCamera();
  new World(G.scene, ph)._ground();
  const p = new LocalPlayer({}, { character: stub() });
  p.teleport(new THREE.Vector3(0, 0.02, 0), 0);
  const step = (n) => { for (let i = 0; i < n; i++) { ph.step(1 / 60, (d) => p.physicsStep(d, 0), () => p.afterPhysics()); G.time += 1 / 60; p.update(1 / 60); } };
  step(10);
  if (pose === 'armsUp') { p.armControl('r', true); p.arm.r.pitch = 1.4; p.armControl('l', true); p.arm.l.pitch = 1.4; step(40); }
  p._gore(1 << part, new THREE.Vector3(1.5, 1.2, 0));
  if (how === 'die') p.die();
  let maxY = 0, maxV = 0;
  for (let i = 0; i < 180; i++) {
    step(1);
    for (const b of p.rag.bodies) { const t = b.translation(), v = b.linvel(); maxY = Math.max(maxY, t.y); maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z)); }
  }
  const pel = p.rag.pelvis().translation();
  ph.world.free();
  return { part, how, pose, alive: !p.dead, state: p.state, maxY: +maxY.toFixed(2), maxV: +maxV.toFixed(1), pelvis: [+pel.x.toFixed(2), +pel.y.toFixed(2), +pel.z.toFixed(2)] };
}
if (process.argv[1]?.endsWith('gore-bench.mjs')) {
  for (const [part, how, pose] of [[PART.UARM_L, 'die'], [PART.FARM_R, 'die'], [PART.THIGH_L, 'die'], [PART.SHIN_R, 'die'], [PART.HEAD, 'none'], [PART.UARM_L, 'none'], [PART.UARM_L, 'die', 'armsUp']]) console.log(JSON.stringify(await goreRun(part, how, pose)));
}
