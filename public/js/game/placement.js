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
