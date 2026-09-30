// Suelos mezclados (explanada del castillo y otros pisos grandes): la textura del material y dos capas más de Poly Haven
// (barro y pasto) repartidas por ruido en coordenadas del mundo y por una máscara del lugar (bordes del camino gastados,
// barro al pie de la muralla, pasto hacia afuera). Las transiciones se "muerden" con el relieve de la base (no son
// fundidos lisos). Donde hay barro bajo la tormenta se juntan charcos: oscuros, lisos y planos, que brillan con las luces.
// Todas las capas usan UV del mundo (x, z) / tamaño: un solo marco tangente para las tres normales.
import * as THREE from 'three';
import { pbrMaps } from './builder.js';
import { STORM } from '../shared/mapdata.js';

const px = (r, g, b) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1); t.needsUpdate = true; return t; };

const GLSL = /* glsl */ `
uniform sampler2D uBMap, uBNor, uBRough, uCMap, uCNor, uCRough;
uniform float uASize, uBSize, uCSize, uWetMax;
uniform vec3 uBTint, uCTint;
uniform vec4 uStormRect;
varying vec3 vGW;
float gbH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gbN(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gbH(i), gbH(i + vec2(1.0, 0.0)), f.x), mix(gbH(i + vec2(0.0, 1.0)), gbH(i + vec2(1.0, 1.0)), f.x), f.y);
}
float gbF(vec2 p) { return gbN(p) * 0.5 + gbN(p * 2.03 + 7.1) * 0.3 + gbN(p * 4.1 + 3.3) * 0.2; }
// transición mordida: el borde avanza donde el relieve de la base es bajo
float gbEdge(float w, float h) { return smoothstep(0.0, 1.0, clamp((w - 0.5) * 2.2 + (0.5 - h) * 0.9 + 0.5, 0.0, 1.0)); }
`;

// mask: GLSL que, con vec2 gp (x, z del mundo), deja float wB (barro) y float wC (pasto) entre 0 y 1
export function blendGround(mat, { aSize = 2.5, b, c, mask, wet = 0.6 }) {
  if (typeof document === 'undefined') return null;
  const gray = px(128, 128, 128), flat = px(128, 128, 255), white = px(255, 255, 255);
  const U = {
    uBMap: { value: gray }, uBNor: { value: flat }, uBRough: { value: white },
    uCMap: { value: gray }, uCNor: { value: flat }, uCRough: { value: white },
    uASize: { value: aSize }, uBSize: { value: b.size }, uCSize: { value: c.size },
    uBTint: { value: new THREE.Color(b.tint ?? 0xffffff) }, uCTint: { value: new THREE.Color(c.tint ?? 0xffffff) },
    uStormRect: { value: new THREE.Vector4(STORM.x0, STORM.z0, STORM.x1, STORM.z1) },
    uWetMax: { value: wet },
  };
  const hook = (key, maps) => {
    if (maps.map) U['u' + key + 'Map'].value = maps.map;
    if (maps.normalMap) U['u' + key + 'Nor'].value = maps.normalMap;
    if (maps.roughnessMap) U['u' + key + 'Rough'].value = maps.roughnessMap;
  };
  pbrMaps(b.id, null, (m) => hook('B', m));
  pbrMaps(c.id, null, (m) => hook('C', m));
  mat.userData.ground = U;
  mat.customProgramCacheKey = () => 'ground-blend-' + (mask.length % 997);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vGW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vGW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    let fs = GLSL + sh.fragmentShader;
    fs = fs.replace('#include <map_fragment>', `
      vec2 gp = vGW.xz;
      vec2 uvA = gp / uASize, uvB = gp / uBSize, uvC = gp / uCSize;
      #ifdef USE_MAP
        vec4 gA = texture2D(map, uvA);
      #else
        vec4 gA = vec4(1.0);
      #endif
      float gH = dot(gA.rgb, vec3(0.3333));
      float wB = 0.0, wC = 0.0;
      ${mask}
      wB = gbEdge(clamp(wB, 0.0, 1.0), gH);
      wC = gbEdge(clamp(wC, 0.0, 1.0), 1.0 - gH) * (1.0 - wB * 0.7);
      vec3 gcol = gA.rgb;
      gcol = mix(gcol, texture2D(uBMap, uvB).rgb * uBTint, wB);
      gcol = mix(gcol, texture2D(uCMap, uvC).rgb * uCTint, wC);
      // mojado y charcos (solo cerca de la tormenta, más en el barro)
      vec2 gSd = max(max(uStormRect.xy - gp, 0.0), gp - uStormRect.zw);
      float gWet = (1.0 - smoothstep(0.0, 18.0, length(gSd))) * uWetMax;
      float gPud = smoothstep(0.6, 0.72, gbF(gp * 0.23 + 3.0)) * smoothstep(0.35, 0.8, wB) * gWet;
      gcol *= 1.0 - gWet * 0.22 - gPud * 0.5;
      diffuseColor.rgb *= gcol;
    `);
    fs = fs.replace('#include <roughnessmap_fragment>', `
      float roughnessFactor = roughness;
      #ifdef USE_ROUGHNESSMAP
        roughnessFactor *= texture2D(roughnessMap, uvA).g;
      #endif
      roughnessFactor = mix(roughnessFactor, texture2D(uBRough, uvB).g, wB);
      roughnessFactor = mix(roughnessFactor, texture2D(uCRough, uvC).g, wC);
      roughnessFactor *= 1.0 - gWet * 0.35;
      roughnessFactor = mix(roughnessFactor, 0.06, gPud);
    `);
    fs = fs.replace('#include <normal_fragment_maps>', `
      {
        vec3 gT = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        vec3 gB = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
        #ifdef USE_NORMALMAP
          vec3 nA = texture2D(normalMap, uvA).xyz * 2.0 - 1.0;
        #else
          vec3 nA = vec3(0.0, 0.0, 1.0);
        #endif
        vec3 nB = texture2D(uBNor, uvB).xyz * 2.0 - 1.0;
        vec3 nC = texture2D(uCNor, uvC).xyz * 2.0 - 1.0;
        vec3 gN = mix(mix(nA, nB, wB), nC, wC);
        // (u, v) = (x, z) del mundo: el rojo del mapa inclina hacia +x y el verde (convención GL) hacia +z
        gN = normalize(mix(gN, vec3(0.0, 0.0, 1.0), gPud * 0.9));
        normal = normalize(mat3(gT, gB, normal) * gN);
      }
    `);
    sh.fragmentShader = fs;
  };
  mat.needsUpdate = true;
  return U;
}
