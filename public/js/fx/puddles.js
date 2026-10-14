// Charcos de agua de verdad. Antes eran óvalos casi negros sobre piso oscuro: de lejos brillaban con el reflejo rasante
// y de cerca desaparecían. Ahora es agua: refleja el cielo y las luces (más de costado, como el agua; de arriba igual se
// ve el espejo), el borde se funde con un halo de piso mojado y, bajo la lluvia, las gotas abren anillos que se mueven.
// Todos los de un mismo sistema van en una sola malla (una llamada de dibujo) con un solo material compartido.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { STORM } from '../shared/mapdata.js';

const U = { uTime: { value: 0 }, uRain: { value: 1 }, uSR: { value: new THREE.Vector4(STORM.x0, STORM.z0, STORM.x1, STORM.z1) } };
let MAT = null;
function material() {
  if (MAT) return MAT;
  MAT = new THREE.MeshPhysicalMaterial({
    color: 0x111418, roughness: 0.035, metalness: 0, ior: 1.9, envMapIntensity: 1.35,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide,
  });
  MAT.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uRain = U.uRain; sh.uniforms.uSR = U.uSR;
    sh.vertexShader = 'attribute float aEdge;\nvarying float vEdge;\nvarying vec3 vPW;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge;\nvPW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uTime;\nuniform float uRain;\nuniform vec4 uSR;\nvarying float vEdge;\nvarying vec3 vPW;\n' +
      'float pH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' + sh.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // gotas: en cada celda de 0.45 m cae una cada tanto y abre un anillo que se agranda y se apaga
        // llueve en la zona de la tormenta (el castillo); afuera el agua está quieta
        float rainK = uRain * (1.0 - smoothstep(0.0, 18.0, length(max(max(uSR.xy - vPW.xz, 0.0), vPW.xz - uSR.zw))));
        if (rainK > 0.01) {
          vec2 rip = vec2(0.0);
          for (int k = 0; k < 2; k++) {
            vec2 q = vPW.xz / (0.45 + float(k) * 0.2) + float(k) * 7.3;
            vec2 cell = floor(q), f = fract(q) - 0.5;
            float h = pH(cell + float(k) * 13.0);
            vec2 c = vec2(pH(cell + 1.7), pH(cell + 4.1)) - 0.5;
            float t = fract(uTime * (0.55 + h * 0.5) + h);
            vec2 d = f - c * 0.6;
            float r = length(d), ring = r - t * 0.45;
            float w = exp(-ring * ring * 900.0) * (1.0 - t) * rainK;
            rip += normalize(d + 1e-4) * w;
          }
          normal = normalize(normal + (viewMatrix * vec4(rip.x, 0.0, rip.y, 0.0)).xyz * 0.9);
        }`)
      .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
        // el borde se funde (el centro es agua; afuera, piso mojado que se va secando)
        diffuseColor.a *= 1.0 - smoothstep(0.62, 1.0, vEdge);`);
  };
  MAT.customProgramCacheKey = () => 'puddles-v1';
  return MAT;
}

// un charco de forma irregular: centro (x, y, z), radios rx, rz, giro, semilla. aEdge: 0 en el centro, 1 en el borde
function puddleGeo(x, y, z, rx, rz, rot, seed) {
  const n = 28, pos = [x, y, z], edge = [0], idx = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.2 * Math.sin(a * 3 + seed) + 0.1 * Math.sin(a * 5 + seed * 2.3) + 0.06 * Math.sin(a * 9 + seed);
    for (const [ring, e] of [[0.72, 0.62], [1.0, 1.0]]) {
      const lx = Math.cos(a) * rx * k * ring, lz = Math.sin(a) * rz * k * ring;
      pos.push(x + lx * Math.cos(rot) - lz * Math.sin(rot), y, z + lx * Math.sin(rot) + lz * Math.cos(rot));
      edge.push(e);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = 1 + i * 2, b = 1 + (i + 1) * 2; // anillo de adentro: a, b ; de afuera: a+1, b+1
    idx.push(0, b, a, a, b, b + 1, a, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  g.setIndex(idx);
  return g;
}

// list: [{ x, y, z, rx, rz, rot }] -> una malla con todos (y su halo de piso mojado)
export function buildPuddles(scene, list, { rain = 1 } = {}) {
  if (!list.length || typeof document === 'undefined') return null;
  const geos = list.map((p, i) => puddleGeo(p.x, p.y, p.z, p.rx, p.rz, p.rot || 0, i * 1.37 + p.x));
  const halo = list.map((p, i) => puddleGeo(p.x, p.y - 0.001, p.z, p.rx * 1.45, p.rz * 1.45, (p.rot || 0) + 0.4, i * 2.1 + p.z));
  const water = new THREE.Mesh(mergeGeometries(geos), material());
  geos.forEach((g) => g.dispose());
  water.renderOrder = 2; water.receiveShadow = true; water.userData.static = true;
  // el halo: piso mojado (más oscuro y algo brillante), sin agua
  const wet = new THREE.Mesh(mergeGeometries(halo), new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.35, roughness: 0.25, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  halo.forEach((g) => g.dispose());
  wet.material.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aEdge;\nvarying float vEdge;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge;');
    sh.fragmentShader = 'varying float vEdge;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(0.3, 1.0, vEdge);');
  };
  wet.renderOrder = 1; wet.userData.static = true;
  scene.add(wet, water);
  U.uRain.value = Math.max(U.uRain.value, rain);
  return { water, wet };
}
// la hora de las gotas (lo llama el mundo cada cuadro) y cuánto llueve donde está la cámara (0..1)
export function updatePuddles(t, rain = 1) { U.uTime.value = t; U.uRain.value = rain; }
