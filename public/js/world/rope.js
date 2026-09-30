import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Three laid strands follow the same centre line, including turns around a
// winch or a knot. The helix supplies real silhouette and self-shadow.
export function rope(scene, points, radius = .018, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'centripetal');
  const length = curve.getLength(), steps = Math.max(48, Math.ceil(length * 70));
  const strands = [], up = new THREE.Vector3(0, 0, 1);
  for (let strand = 0; strand < 3; strand++) {
    const path = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, tangent = curve.getTangentAt(t).normalize();
      const reference = Math.abs(tangent.z) > .9 ? new THREE.Vector3(1, 0, 0) : up;
      const right = new THREE.Vector3().crossVectors(tangent, reference).normalize();
      const side = new THREE.Vector3().crossVectors(tangent, right).normalize();
      const angle = t * length * 105 + strand * Math.PI * 2 / 3;
      path.push(curve.getPointAt(t).addScaledVector(right, Math.cos(angle) * radius * .48).addScaledVector(side, Math.sin(angle) * radius * .48));
    }
    strands.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), steps, radius * .52, 5, closed));
  }
  const geometry = mergeGeometries(strands); strands.forEach(g => g.dispose());
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color: 0x9c8058, roughness: .96}));
  mesh.name = 'laid-hemp-rope'; mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  return mesh;
}

export function wellWater(scene, x, z, y) {
  const uniforms = { uWaterTime: {value: 0}, uWaterImpact: {value: -10} };
  const material = new THREE.MeshPhysicalMaterial({color: 0x34443b, roughness: .19, metalness: .1, clearcoat: .55, clearcoatRoughness: .12, envMapIntensity: .9});
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 vWaterXZ;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWaterXZ = position.xz;');
    shader.fragmentShader = 'varying vec2 vWaterXZ; uniform mat3 normalMatrix; uniform float uWaterTime, uWaterImpact;\n' + shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      float radius = length(vWaterXZ);
      float age = uWaterTime - uWaterImpact;
      float ring = age >= 0.0 ? exp(-abs(radius - age * .45) * 16.0) * exp(-age * .8) : 0.0;
      vec2 gradient = vec2(cos(vWaterXZ.x * 13.0 + uWaterTime * .65), sin(vWaterXZ.y * 17.0 - uWaterTime * .8)) * .025;
      gradient += vWaterXZ / max(radius, .01) * ring * .25 * sin(radius * 48.0 - age * 18.0);
      normal = normalize(normal + normalMatrix * vec3(-gradient.x, 0.0, -gradient.y));`);
  };
  material.customProgramCacheKey = () => 'well-water-ripples-v1';
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(.947, 48), material);
  mesh.geometry.rotateX(-Math.PI / 2); mesh.position.set(x, y, z);
  mesh.name = 'well-water'; mesh.receiveShadow = true; scene.add(mesh);
  return { mesh, uniforms, pulseAt: -10 };
}
