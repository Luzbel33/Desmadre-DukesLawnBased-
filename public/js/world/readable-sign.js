import * as THREE from 'three';
export function readableSign(texture, width, height) {
  const group = new THREE.Group(); group.name = 'two-sided-readable-sign';
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.FrontSide });
  for (const facing of [1,-1]) {
    const face = new THREE.Mesh(geometry, material); face.position.z = facing * .003;
    face.rotation.y = facing < 0 ? Math.PI : 0; group.add(face);
  }
  return group;
}
