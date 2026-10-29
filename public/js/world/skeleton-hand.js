import * as THREE from 'three';

// The shipped hanging skeleton is a single baked mesh. Isolate its right forearm
// and hand in model coordinates, retaining the original UVs and bone material.
export function skeletonForearm(source) {
  source.updateMatrixWorld(true);
  let mesh = null;
  source.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
  const original = mesh?.geometry, position = original?.attributes.position, index = original?.index;
  if (!position || !index) return null;
  const selected = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const y = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;
    if (x >= 0.15 && x <= 0.30 && y >= 0.62 && y <= 1.16) selected.push(a, b, c);
  }
  if (!selected.length) return null;
  const mapping = new Map(), vertices = [], indices = [];
  for (const i of selected) {
    if (!mapping.has(i)) { mapping.set(i, vertices.length); vertices.push(i); }
    indices.push(mapping.get(i));
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(original.attributes)) {
    const values = new attribute.array.constructor(vertices.length * attribute.itemSize);
    for (let i = 0; i < vertices.length; i++) for (let k = 0; k < attribute.itemSize; k++) {
      values[i * attribute.itemSize + k] = attribute.array[vertices[i] * attribute.itemSize + k];
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized));
  }
  geometry.setIndex(indices);
  geometry.applyMatrix4(mesh.matrixWorld);
  geometry.rotateZ(Math.PI);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, material: mesh.material };
}
