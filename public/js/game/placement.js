import * as THREE from 'three';

// Apoya una pieza rotada por sus límites reales, no por dimensiones estimadas.
// Centra su huella XZ en el punto elegido y deja el extremo inferior en supportY.
export function supportedMatrix(bounds, x, supportY, z, yaw = 0, scale = 1, opts = {}) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rx || 0, yaw, opts.rz || 0, 'YXZ'));
  const s = new THREE.Vector3(opts.sx ?? scale, opts.sy ?? scale, opts.sz ?? scale);
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(), q, s);
  const footprint = bounds.clone().applyMatrix4(matrix);
  const center = footprint.getCenter(new THREE.Vector3());
  return matrix.setPosition(x - center.x, supportY - footprint.min.y, z - center.z);
}

// Tight local bounds rotated with the prop avoid the empty corners of a world AABB.
export function yawCollider(bounds, position, yaw, scale = 1, shrink = 1) {
  const center = bounds.getCenter(new THREE.Vector3()).multiplyScalar(scale)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(position);
  const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(Math.abs(scale) * 0.5);
  half.x *= shrink; half.z *= shrink;
  return { center, half };
}
