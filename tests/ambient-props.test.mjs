import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rng } from '../public/js/core/G.js';
import { trashBags } from '../public/js/world/ambient-props.js';

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
