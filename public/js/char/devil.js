// El Diablo: personaje exclusivo del dueño (SmokePyro). El modelo es "Demon" de VidovicArts (Sketchfab, CC-BY 4.0),
// riggeado y enderezado en Blender con el esqueleto del juego (camina, pelea y cae igual que todos) y con su piel
// original. Acá solo se le suma lo que el modelo no trae:
// - ojos de brasa que laten (el mapa de emisión del modelo son solo los ojos, un rojo plano: se les da un centro
//   más caliente que mira a la cámara y se suben para que los agarre el bloom),
// - piel apenas húmeda (el material de daño la deja mate),
// - el modo fantasma del invisible (el dueño se ve transparente a sí mismo; los demás directamente no lo ven).

export function makeDevil(ch) {
  const mat = ch.material;
  mat.roughness = 0.62;
  const U = { uEyeK: { value: 1 } };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uEyeK = U.uEyeK;
    sh.fragmentShader = 'uniform float uEyeK;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
      {
        // brasa: el centro del ojo (lo que mira a la cámara) blanco-amarillo, los bordes rojo oscuro
        float f = pow(clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 1.6);
        float e = totalEmissiveRadiance.r;
        totalEmissiveRadiance = e * uEyeK * mix(vec3(0.35, 0.02, 0.0), vec3(1.6, 0.62, 0.16), f);
      }`);
  };
  const key = mat.customProgramCacheKey?.() || '';
  mat.customProgramCacheKey = () => key + '-devil';
  mat.needsUpdate = true;
  let t = Math.random() * 10;
  let ghost = 0;
  const glow = () => 2.6 + 0.7 * Math.sin(t * 2.3) + 0.35 * Math.sin(t * 7.1 + 1.3);
  U.uEyeK.value = glow();
  return {
    update(dt) {
      t += dt;
      U.uEyeK.value = glow();
    },
    setGhost(k) {
      k = Math.max(0, Math.min(1, k));
      if (k === ghost) return;
      ghost = k;
      mat.transparent = k > 0;
      mat.opacity = 1 - k * 0.8;
      mat.depthWrite = k === 0;
      mat.needsUpdate = true;
    },
    dispose() {},
  };
}
