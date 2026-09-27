// Banco del agarre: cuánto tarda en derribar según qué tan fuerte tiran (node --loader ./tests/loader.mjs tests/grab-bench.mjs)
import * as THREE from 'three';
import { Physics, GR } from '../public/js/core/physics.js';
import { G } from '../public/js/core/G.js';
import { LocalPlayer } from '../public/js/game/player.js';
import { World } from '../public/js/world/world.js';
import { TEX } from '../public/js/world/textures.js';
import { PART, Ragdoll } from '../public/js/game/ragdoll.js';
import { PoseRig } from '../public/js/char/rig.js';
import { fakeMeta } from './ragdoll-bench.mjs';
TEX.grass = () => new THREE.Texture();
function stub() {
  const target = { root: new THREE.Group(), meta: fakeMeta(), grip: { l: 0, r: 0 }, expr: {}, handR: new THREE.Object3D(), handL: new THREE.Object3D() };
  return new Proxy(target, { get: (o, k) => (k in o ? o[k] : () => null) });
}
async function run(speed, part = PART.TORSO, pvp = true, secs = 6) {
  const ph = new Physics(); await ph.init();
  G.phys = ph; G.scene = new THREE.Scene(); G.inGame = true; G.time = 0; G.myId = 1;
  G.players = new Map(); G.settings = { desmadre: pvp }; G.props = null;
  G.input = { enabled: true, locked: true, key: () => false, hit: () => false, btn: () => false };
  G.camera = new THREE.PerspectiveCamera();
  new World(G.scene, ph)._ground();
  const p = new LocalPlayer({}, { character: stub() });
  p.teleport(new THREE.Vector3(0, 0.02, 0), 0);
  const meta = fakeMeta(), rig = new PoseRig(meta.jointRest);
  const place = (z) => { rig.place(new THREE.Vector3(0, 0.02, z), Math.PI); rig.animate({ speed: 0, grounded: true }, 1 / 60); return rig.transforms(); };
  const proxy = new Ragdoll(ph, meta, { kinematic: true, member: GR.REMOTE, filter: GR.RAGDOLL });
  proxy.build(place(0.75));
  const rp = { id: 5, pos: new THREE.Vector3(0, 0.02, 0.75), yaw: Math.PI, proxy, char: { meta }, standing: true, vel: new THREE.Vector3() };
  G.players = new Map([[5, rp]]);
  const b = p.rag.bodies[part], t = b.translation(), r = b.rotation();
  const inv = new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion(r.x, r.y, r.z, r.w), new THREE.Vector3(1, 1, 1)).invert();
  const a = new THREE.Vector3(0, t.y, 0.2).applyMatrix4(inv);
  p.grabbedByRemote(5, 'r', part, [a.x, a.y, a.z], true);
  let z = 0.75, koAt = -1, maxStretch = 0, minBal = 100;
  for (let n = 0; n < secs * 60; n++) {
    z += speed / 60; proxy.teleport(place(z)); rp.pos.z = z;
    ph.step(1 / 60, (d) => p.physicsStep(d, 0), () => p.afterPhysics()); G.time += 1 / 60; p.update(1 / 60);
    minBal = Math.min(minBal, p.balance);
    maxStretch = Math.max(maxStretch, z - p.pos.z);
    if (p.state === 'ko' && koAt < 0) koAt = n / 60;
  }
  ph.world.free();
  return { speed, part, pvp, koAt: koAt < 0 ? '-' : koAt.toFixed(2) + ' s', held: p.grabbedBy.size, minBal: minBal.toFixed(0), followed: (p.pos.z).toFixed(2) + ' m', lead: (z - 0.75).toFixed(2) + ' m' };
}
for (const [s, part, pvp] of [[1.5, PART.TORSO, true], [3, PART.TORSO, true], [4, PART.TORSO, true], [3, PART.HEAD, true], [3, PART.SHIN_L, true], [3, PART.TORSO, false], [5, PART.TORSO, false]]) console.log(JSON.stringify(await run(s, part, pvp)));
