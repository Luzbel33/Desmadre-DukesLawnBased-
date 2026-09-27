// Mide si las piernas físicas siguen el paso objetivo al caminar (correlación y error medio).
// node --no-warnings --loader ./tests/loader.mjs tests/ragdoll-walk.mjs [KeyW,ShiftLeft]
import * as THREE from 'three';
import { Physics } from '../public/js/core/physics.js';
import { G } from '../public/js/core/G.js';
import { LocalPlayer } from '../public/js/game/player.js';
import { World } from '../public/js/world/world.js';
import { TEX } from '../public/js/world/textures.js';
import { fakeMeta } from './ragdoll-bench.mjs';
TEX.grass = () => new THREE.Texture();
const keys = new Set((process.argv[2] || 'KeyW').split(','));
const ph = new Physics(); await ph.init(); G.phys = ph; G.scene = new THREE.Scene(); G.inGame = true; G.time = 0;
G.input = { enabled: true, locked: true, key: (k) => keys.has(k), hit: () => false, btn: () => false };
new World(G.scene, ph)._ground();
const t = { root: new THREE.Group(), meta: fakeMeta() };
const p = new LocalPlayer({}, { character: new Proxy(t, { get: (o, k) => (k in o ? o[k] : () => null) }) });
p.teleport(new THREE.Vector3(0, 0.02, 0), 0);
let n = 0, sxy = 0, sxx = 0, syy = 0, err = 0, tilt = 0, minY = 9;
const fwd = new THREE.Vector3(0, 0, 1);
for (let i = 0; i < 360; i++) {
  ph.step(1 / 60, (d) => p.physicsStep(d, 0), () => p.afterPhysics()); G.time += 1 / 60; p.update(1 / 60);
  if (i < 90) continue;
  const c = p.rag.cur, g = p.targets;
  for (const k of [8, 10]) {
    const a = c[k][2] - c[0][2], b = g[k].p.z - g[0].p.z;
    sxy += a * b; sxx += a * a; syy += b * b; err += Math.abs(a - b); n++;
  }
  const q = new THREE.Quaternion(c[1][3], c[1][4], c[1][5], c[1][6]);
  tilt = Math.max(tilt, new THREE.Vector3(0, 1, 0).applyQuaternion(q).angleTo(new THREE.Vector3(0, 1, 0)));
  minY = Math.min(minY, c[0][1]);
}
console.log(JSON.stringify({ state: p.state, speed: +p.speed.toFixed(2), corr: +(sxy / Math.sqrt(sxx * syy)).toFixed(3), meanErr: +(err / n).toFixed(3), ampPhys: +Math.sqrt(sxx / n).toFixed(3), ampTarget: +Math.sqrt(syy / n).toFixed(3), maxTorsoTiltDeg: +(tilt * 57.3).toFixed(1), minPelvisY: +minY.toFixed(3) }));
