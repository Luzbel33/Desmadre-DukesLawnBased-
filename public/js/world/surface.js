// Superficies "de verdad" para los materiales del castillo (y los que se quieran sumar):
// - Parallax con oclusión (POM): la textura de relieve hunde las juntas de las piedras y los adoquines según el
//   ángulo de la cámara, sin agregar geometría. Se desvanece con la distancia (lejos no hace falta).
// - Desgaste según la posición en el mundo: base húmeda y sucia, chorreaduras de lluvia en las paredes, musgo en lo
//   que mira para arriba, variación grande de tono (se deja de notar la repetición) y brillo de mojado bajo la tormenta.
// Se inyecta en MeshStandardMaterial con onBeforeCompile: los mapas que ya usa three (color, normal, rugosidad,
// oclusión) leen con la coordenada corrida.
import * as THREE from 'three';
import { STORM } from '../shared/mapdata.js';

const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
WHITE.needsUpdate = true;

const POM = /* glsl */ `
uniform sampler2D uDispMap;
uniform float uPomScale;
uniform float uPomFade;
uniform vec4 uWeather; // x: suciedad de base, y: chorreaduras, z: musgo, w: variación grande
uniform vec4 uStormRect;
uniform float uWetMax;
varying vec3 vSurfW;
float sfH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sfN(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sfH(i), sfH(i + vec2(1.0, 0.0)), f.x), mix(sfH(i + vec2(0.0, 1.0)), sfH(i + vec2(1.0, 1.0)), f.x), f.y);
}
float sfF(vec2 p) { return sfN(p) * 0.55 + sfN(p * 2.07 + 5.3) * 0.3 + sfN(p * 4.3 + 1.7) * 0.15; }
vec2 sfPom(vec2 uv, vec3 eyePos, vec3 surfN) {
  float dist = length(eyePos);
  float fade = 1.0 - smoothstep(uPomFade * 0.55, uPomFade, dist);
  if (fade <= 0.001 || uPomScale <= 0.0) return uv;
  // marco tangente a partir de derivadas (sin tangentes en la malla)
  vec3 q0 = dFdx(eyePos), q1 = dFdy(eyePos);
  vec2 st0 = dFdx(uv), st1 = dFdy(uv);
  vec3 q1p = cross(q1, surfN), q0p = cross(surfN, q0);
  vec3 T = q1p * st0.x + q0p * st1.x;
  vec3 B = q1p * st0.y + q0p * st1.y;
  float det = max(dot(T, T), dot(B, B));
  if (det <= 0.0) return uv;
  float sc = inversesqrt(det);
  T *= sc; B *= sc;
  vec3 V = normalize(-eyePos);
  vec3 vts = normalize(vec3(dot(V, T), dot(V, B), dot(V, surfN)));
  float nL = mix(18.0, 7.0, clamp(vts.z, 0.0, 1.0));
  float layer = 1.0 / nL;
  vec2 P = vts.xy / max(vts.z, 0.2) * uPomScale * fade;
  vec2 dUV = P * layer;
  vec2 gx = dFdx(uv), gy = dFdy(uv);
  vec2 cuv = uv;
  float cur = 0.0;
  float h = 1.0 - textureGrad(uDispMap, cuv, gx, gy).r;
  for (int i = 0; i < 18; i++) {
    if (float(i) >= nL || cur >= h) break;
    cuv -= dUV;
    h = 1.0 - textureGrad(uDispMap, cuv, gx, gy).r;
    cur += layer;
  }
  vec2 prev = cuv + dUV;
  float after = h - cur;
  float before = (1.0 - textureGrad(uDispMap, prev, gx, gy).r) - cur + layer;
  float w = after / (after - before + 1e-5);
  return mix(cuv, prev, clamp(w, 0.0, 1.0));
}
`;

// opts: { pom: profundidad en unidades de UV (0 = sin POM), fade: m, weather: [base, chorreado, musgo, variación], wet: 0..1 }
export function patchSurface(mat, opts = {}) {
  const U = {
    uDispMap: { value: WHITE },
    uPomScale: { value: opts.pom || 0 },
    uPomFade: { value: opts.fade || 22 },
    uWeather: { value: new THREE.Vector4(...(opts.weather || [0, 0, 0, 0])) },
    uStormRect: { value: new THREE.Vector4(STORM.x0, STORM.z0, STORM.x1, STORM.z1) },
    uWetMax: { value: opts.wet ?? 0.5 },
  };
  mat.userData.surface = U;
  const key = 'surface-' + (opts.pom ? 'p' : '') + (opts.weather ? 'w' : '');
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vSurfW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 sw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          sw = instanceMatrix * sw;
        #endif
        vSurfW = (modelMatrix * sw).xyz;
      }`);
    const C = THREE.ShaderChunk;
    const swap = (chunk) => C[chunk]
      .replaceAll('vMapUv', 'sfUv').replaceAll('vNormalMapUv', 'sfUv').replaceAll('vRoughnessMapUv', 'sfUv')
      .replaceAll('vAoMapUv', 'sfUv').replaceAll('vMetalnessMapUv', 'sfUv');
    let fs = POM + sh.fragmentShader;
    fs = fs.replace('#include <map_fragment>', `
      #if defined( USE_MAP )
        vec2 sfUv = sfPom(vMapUv, -vViewPosition, normalize(vNormal));
      #else
        vec2 sfUv = vec2(0.0);
      #endif
      ${swap('map_fragment')}
      // ---- desgaste por posición en el mundo
      vec3 sfWN = normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz);
      float sfUp = sfWN.y;
      float sfWall = 1.0 - abs(sfUp);
      float sfMacro = sfF(vSurfW.xz * 0.06 + vSurfW.y * 0.03);
      diffuseColor.rgb *= mix(1.0, mix(0.82, 1.14, sfMacro), uWeather.w);
      // base húmeda y sucia (el barro salpica hasta ~1.5 m)
      float sfBaseN = sfF(vec2(vSurfW.x + vSurfW.z, vSurfW.y) * vec2(0.9, 2.2));
      float sfBase = (1.0 - smoothstep(0.05, 1.3 + sfBaseN * 0.9, vSurfW.y)) * sfWall;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.46, 0.44, 0.4), sfBase * uWeather.x);
      // chorreaduras de lluvia: bandas verticales largas, más marcadas bajo cornisas
      float sfStreak = sfN(vec2((vSurfW.x + vSurfW.z) * 1.7, vSurfW.y * 0.06)) * sfN(vec2((vSurfW.x - vSurfW.z) * 0.6, vSurfW.y * 0.25 + 3.0));
      sfStreak = smoothstep(0.28, 0.62, sfStreak) * sfWall;
      diffuseColor.rgb *= 1.0 - sfStreak * 0.38 * uWeather.y;
      // musgo en lo que mira para arriba y en las juntas de la base
      float sfMossN = sfF(vSurfW.xz * 0.45 + vSurfW.y * 0.2);
      float sfMoss = smoothstep(0.35, 0.85, sfUp) * smoothstep(0.45, 0.75, sfMossN) + sfBase * smoothstep(0.55, 0.8, sfMossN) * 0.6;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.085, 0.11, 0.045), clamp(sfMoss, 0.0, 1.0) * uWeather.z);
      // mojado bajo la tormenta (oscurece un poco; la rugosidad baja más abajo)
      vec2 sfSd = max(max(uStormRect.xy - vSurfW.xz, 0.0), vSurfW.xz - uStormRect.zw);
      float sfWet = (1.0 - smoothstep(0.0, 18.0, length(sfSd))) * uWetMax;
      float sfPuddle = smoothstep(0.55, 0.8, sfF(vSurfW.xz * 0.35)) * smoothstep(0.7, 0.95, sfUp);
      diffuseColor.rgb *= 1.0 - sfWet * (0.18 + sfPuddle * 0.25);
    `);
    fs = fs.replace('#include <roughnessmap_fragment>', `${swap('roughnessmap_fragment')}
      roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, sfWet * (0.5 + 0.5 * max(sfUp, 0.0)));
      roughnessFactor = mix(roughnessFactor, 0.06, sfWet * sfPuddle);`);
    fs = fs.replace('#include <metalnessmap_fragment>', swap('metalnessmap_fragment'));
    fs = fs.replace('#include <normal_fragment_maps>', swap('normal_fragment_maps'));
    fs = fs.replace('#include <aomap_fragment>', swap('aomap_fragment'));
    sh.fragmentShader = fs;
  };
  mat.needsUpdate = true;
  return U;
}

export function setSurfaceDisp(mat, tex) {
  const U = mat.userData.surface;
  if (U && tex) U.uDispMap.value = tex;
}
