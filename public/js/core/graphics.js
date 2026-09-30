export const GRAPHICS = {
  rendimiento: { label: 'Rendimiento', grass: 'baja', shadows: 'baja', maxDpr: 1, minDpr: 0.65, aoSamples: 0, msaa: 0, bloom: false },
  equilibrado: { label: 'Equilibrado', grass: 'media', shadows: 'media', maxDpr: 1, minDpr: 0.75, aoSamples: 8, msaa: 2, bloom: true },
  calidad: { label: 'Calidad', grass: 'alta', shadows: 'alta', maxDpr: 1.5, minDpr: 0.85, aoSamples: 12, msaa: 4, bloom: true },
  ultra: { label: 'Ultra', grass: 'ultra', shadows: 'ultra', maxDpr: 1.75, minDpr: 1, aoSamples: 16, msaa: 4, bloom: true },
};

export function readGraphics(storage) {
  try {
    const key = storage.getItem('dukes.graphics');
    if (GRAPHICS[key]) return key;
  } catch {}
  return 'equilibrado';
}

export function applyGraphics(G, key, storage) {
  const preset = GRAPHICS[key];
  if (!preset) return;
  Object.assign(G.opts, { graphics: key, grass: preset.grass, shadows: preset.shadows });
  if (G.grass && G.grass.quality !== preset.grass) G.grass.build(preset.grass);
  G.post?.setQuality(preset);
  if (G.post?.vol) G.post.vol.enabled = key !== 'rendimiento';
  for (const light of [G.world?.pool?.hero?.light, G.world?.storm?.flashLight]) if (light) {
    const shadows = key !== 'rendimiento';
    if (light.castShadow !== shadows) { light.castShadow = shadows; light.shadow.needsUpdate = shadows; }
  }
  for (const flame of G.world?.fireFallback || []) G.world.flames.set(flame.index, key === 'rendimiento' ? flame.intensity : 0);
  const sun = G.world?.sun;
  if (sun) {
    const size = key === 'ultra' ? 4096 : key === 'rendimiento' ? 1024 : 2048;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose(); sun.shadow.map = null;
      sun.shadow.needsUpdate = true;
    }
  }
  if (G.renderer) {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, preset.maxDpr);
    G.renderer.setPixelRatio(dpr);
    G.post?.setPixelRatio(dpr);
    G.post?.setSize(globalThis.innerWidth, globalThis.innerHeight);
  }
  try { storage?.setItem('dukes.graphics', key); } catch {}
}
