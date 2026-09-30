// Dirección de arte independiente del presupuesto gráfico. El castillo conserva
// su noche local; cambia la claridad del aire, no la hora ni la dirección de luz.
export const ATMOSPHERES = {
  natural: { label: 'Natural', turbidity: 2.6, rayleigh: 1.8, mie: 0.003, clouds: 0.42, fog: 0xc3d3df, fogD: 0.0028, sunColor: 0xffe4c5, sun: 2.4, hemi: 0.42, env: 0.3, nightFog: 0.0115, saturation: 1, contrast: 1 },
  calida: { label: 'Tarde cálida', turbidity: 3.8, rayleigh: 1.4, mie: 0.004, clouds: 0.36, fog: 0xd5d1c3, fogD: 0.0033, sunColor: 0xffd4a4, sun: 2.5, hemi: 0.4, env: 0.28, nightFog: 0.0125, saturation: 0.98, contrast: 1.1 },
  bruma: { label: 'Bruma suave', turbidity: 4.2, rayleigh: 1.65, mie: 0.0042, clouds: 0.58, fog: 0xbdcbd0, fogD: 0.0045, sunColor: 0xffe6ce, sun: 2.1, hemi: 0.46, env: 0.32, nightFog: 0.014, saturation: 0.94, contrast: 0.9 },
};

export function readAtmosphere(storage) {
  try { const key = storage.getItem('dukes.atmosphere'); if (ATMOSPHERES[key]) return key; } catch {}
  return 'natural';
}

export function configureSky(uniforms, preset) {
  uniforms.turbidity.value = preset.turbidity;
  uniforms.rayleigh.value = preset.rayleigh;
  uniforms.mieCoefficient.value = preset.mie;
  if (uniforms.cloudCoverage) uniforms.cloudCoverage.value = preset.clouds;
}

export function applyAtmosphere(G, key, storage) {
  const preset = ATMOSPHERES[key];
  if (!preset) return;
  G.opts.atmosphere = key;
  const world = G.world;
  if (world?.sky) {
    configureSky(world.sky.material.uniforms, preset);
    if (world.atmosphere !== key) world.refreshEnvironment?.();
    world.atmosphere = key;
    const base = world.storm?.base;
    if (base) {
      base.fog.setHex(preset.fog); base.fogD = preset.fogD;
      base.sunColor.setHex(preset.sunColor); base.sun = preset.sun;
      base.hemi = preset.hemi; base.env = preset.env;
      world.storm.night.fogD = preset.nightFog;
    }
  }
  if (G.post) G.post.atmosphere = preset;
  try { storage?.setItem('dukes.atmosphere', key); } catch {}
}
