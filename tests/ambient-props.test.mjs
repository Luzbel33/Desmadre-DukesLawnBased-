import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import fs from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { rng } from '../public/js/core/G.js';
import { trashBags } from '../public/js/world/ambient-props.js';
import { skeletonForearm } from '../public/js/world/skeleton-hand.js';

test('trash bags rest on the floor and each knot stays attached to its own bag', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const geometries = [], floor = 2.5;
    trashBags({ geo(_material, geometry) { geometries.push(geometry); } }, 10, floor, -4, rng(seed));
    for (let i = 0; i < geometries.length; i += 2) {
      const bag = new THREE.Box3().setFromBufferAttribute(geometries[i].attributes.position);
      const knot = new THREE.Box3().setFromBufferAttribute(geometries[i + 1].attributes.position);
      assert.ok(Math.abs(bag.min.y - floor) < 1e-5, `bag ${i / 2} floats or sinks`);
      assert.ok(knot.min.y <= bag.max.y && bag.max.y - knot.min.y < 0.021, 'knot is detached from its bag');
      assert.ok(knot.min.x >= bag.min.x && knot.max.x <= bag.max.x && knot.min.z >= bag.min.z && knot.max.z <= bag.max.z, 'knot is off the bag');
    }
  }
});

test('cemetery forearm comes from the shipped skeleton with its real geometry and UVs', async () => {
  globalThis.self = globalThis;
  const input = fs.readFileSync(new URL('../public/assets/props/art/skeleton_hang.glb', import.meta.url));
  const size = input.readUInt32LE(12), doc = JSON.parse(input.subarray(20, 20 + size));
  doc.materials = [{ name: 'bone', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }];
  delete doc.images; delete doc.textures; delete doc.samplers;
  for (const m of doc.meshes) for (const primitive of m.primitives) primitive.material = 0;
  const json = Buffer.from(JSON.stringify(doc)), pad = (4 - json.length % 4) % 4, bin = input.subarray(20 + size);
  const glb = Buffer.alloc(20 + json.length + pad + bin.length, 32);
  input.copy(glb, 0, 0, 20); glb.writeUInt32LE(glb.length, 8); glb.writeUInt32LE(json.length + pad, 12);
  json.copy(glb, 20); bin.copy(glb, 20 + json.length + pad);
  const model = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length), '');
  let original; model.scene.traverse(o => { if (o.isMesh) original = o; });
  const hand = skeletonForearm(model.scene);
  assert.ok(hand && hand.geometry.index.count > 1000 && hand.geometry.index.count < original.geometry.index.count / 4);
  assert.equal(hand.material, original.material);
  assert.equal(hand.geometry.attributes.uv.count, hand.geometry.attributes.position.count);
  const bounds = hand.geometry.boundingBox;
  assert.ok(Math.abs(bounds.min.y) < 1e-6 && bounds.max.y > 0.35 && bounds.max.y < 0.6, 'forearm must start at its buried end');
});
