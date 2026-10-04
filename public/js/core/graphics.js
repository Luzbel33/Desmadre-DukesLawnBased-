// Presets gráficos. Lo que más pesa en una placa floja, en orden: las sombras (dibujar el mapa otra vez desde el sol
// y muestrear dos mapas por píxel), la oclusión ambiental (otra pasada entera), las luces puntuales (cada píxel
// recorre todas las del pool) y la resolución. 'Mínimo' saca todo eso para que una integrada vieja llegue a 30+ FPS.
// lights: luces del pool además de la "heroica" (la del fogón/chimenea); shadowEvery: cada cuántos cuadros se
// redibuja la sombra del sol; npcLod: a la gente lejana se la anima uno de cada N cuadros; aniso: filtrado anisotrópico
// máximo de las texturas (se fija al arrancar).
export const GRAPHICS = {
  minimo: { label: 'Mínimo', grass: 'minima', shadows: 'off', maxDpr: 0.75, minDpr: 0.5, aoSamples: 0, msaa: 0, bloom: false, vol: false, lights: 2, heroShadow: false, shadowEvery: 1, npcLod: 3, lite: true, aniso: 2 },
  rendimiento: { label: 'Rendimiento', grass: 'baja', shadows: 'baja', maxDpr: 1, minDpr: 0.6, aoSamples: 0, msaa: 0, bloom: false, vol: false, lights: 4, heroShadow: false, shadowEvery: 2, npcLod: 2, aniso: 4 },
  equilibrado: { label: 'Equilibrado', grass: 'media', shadows: 'media', maxDpr: 1, minDpr: 0.75, aoSamples: 8, msaa: 2, bloom: true, vol: true, lights: 10, heroShadow: true, shadowEvery: 1, npcLod: 1 },
  calidad: { label: 'Calidad', grass: 'alta', shadows: 'alta', maxDpr: 1.5, minDpr: 0.85, aoSamples: 12, msaa: 4, bloom: true, vol: true, lights: 10, heroShadow: true, shadowEvery: 1, npcLod: 1 },
  ultra: { label: 'Ultra', grass: 'ultra', shadows: 'ultra', maxDpr: 1.75, minDpr: 1, aoSamples: 16, msaa: 4, bloom: true, vol: true, lights: 10, heroShadow: true, shadowEvery: 1, npcLod: 1 },
};
// de menor a mayor: el modo automático se mueve por esta escalera
export const TIERS = ['minimo', 'rendimiento', 'equilibrado', 'calidad', 'ultra'];
export const SHADOW_SIZE = { baja: 1024, media: 2048, alta: 2048, ultra: 4096 };

// 'auto' (por defecto) o un preset elegido a mano
export function readGraphics(storage) {
  try {
    const key = storage.getItem('dukes.graphics');
    if (key === 'auto' || GRAPHICS[key]) return key;
  } catch {}
  return 'auto';
}

// el escalón al que llegó el automático la última vez (así no arranca de nuevo trabado en una PC lenta)
export function readAutoTier(storage) {
  try { const key = storage.getItem('dukes.graphics.auto'); if (GRAPHICS[key]) return key; } catch {}
  return null;
}

// Qué placa dibuja: el nombre que da el navegador alcanza para separar dibujo por software (sin aceleración: 1-3 FPS
// seguro), integradas (Intel HD/UHD, Radeon de APU, celulares) y placas de verdad.
export function classifyGpu(name = '', { software = false, cores = 8 } = {}) {
  const s = String(name).toLowerCase();
  const soft = software || /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|microsoft basic|gdi generic/.test(s);
  let tier = 'equilibrado', integrated = false;
  if (soft) tier = 'minimo';
  else if (/mali|adreno|powervr|videocore|apple gpu|sgx/.test(s)) { tier = 'minimo'; integrated = true; }
  else if (/intel/.test(s) && !/\barc\b/.test(s)) { integrated = true; tier = /iris|xe/.test(s) ? 'rendimiento' : 'minimo'; }
  else if (/radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|radeon r\d|radeon\(tm\) r\d|radeon hd \d{4}|radeon \d{3}m?\b/.test(s)) { integrated = true; tier = 'rendimiento'; }
  else if (/geforce (gt|mx)\s?\d|geforce \d{3}(m|mx)?\b|quadro (k|p)?\d{3,4}m?\b|nvs/.test(s)) tier = 'rendimiento';
  if (cores && cores <= 2) tier = 'minimo';
  else if (cores && cores <= 4 && tier === 'equilibrado' && integrated) tier = 'rendimiento';
  return { tier, software: soft, integrated, name: String(name) };
}

export function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch { return ''; }
}

// Sin aceleración por hardware el navegador igual da WebGL (por software): este contexto de prueba falla en ese caso
export function softwareOnly(doc = globalThis.document) {
  try {
    const c = doc.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) || c.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (!gl) return true;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return false;
  } catch { return false; }
}

// Modo automático: mira la mediana del tiempo de cuadro cada 4 s. Si no llega a ~25 FPS y la resolución dinámica ya no
// puede bajar más, pide un escalón menos; si sobra mucho tres ventanas seguidas (y la resolución ya está al máximo), uno
// más. Después de cada cambio espera unos segundos (se compilan shaders y eso no cuenta).
export class AutoTuner {
  constructor() { this.reset(); }
  reset(grace = 6) { this.buf = []; this.t = -grace; this.fast = 0; }
  sample(frameMs, dt, { canShrink = false, canGrow = false } = {}) {
    this.t += dt;
    if (this.t < 0) return 0;
    this.buf.push(frameMs);
    if (this.t < 4) return 0;
    const a = this.buf.sort((x, y) => x - y), med = a[a.length >> 1];
    this.buf = []; this.t = 0;
    if (med > 40 && (!canShrink || med > 80)) { this.fast = 0; return -1; }
    if (med < 12 && !canGrow) { if (++this.fast >= 3) { this.fast = 0; return 1; } } else this.fast = 0;
    return 0;
  }
}

// el estado de G.perf que leen el mundo y los NPC cada cuadro
function perf(G, preset) {
  G.perf = Object.assign(G.perf || {}, { shadowEvery: preset.shadowEvery || 1, npcLod: preset.npcLod || 1 });
}

// Sombras: 'off' apaga el mapa de sombras del todo (three.js no recompila solo al cambiar shadowMap.enabled: se marcan
// los materiales). Al volver a prenderlas se rehornea la sombra lejana y cada luz con sombra pide su mapa.
export function applyShadows(G, level) {
  G.opts.shadows = level;
  const r = G.renderer, w = G.world, on = level !== 'off';
  if (r && r.shadowMap.enabled !== on) {
    r.shadowMap.enabled = on;
    G.scene?.traverse((o) => { for (const m of [].concat(o.material || [])) m.needsUpdate = true; });
    if (on && w) {
      w._baked = false;
      G.scene?.traverse((o) => { if (o.isLight && o.castShadow) o.shadow.needsUpdate = true; });
    }
  }
  if (w?.farSun) {
    w.farSun.visible = on; // solo presta su mapa de sombras; sin sombras es una luz de más por píxel
    // la sombra lejana horneada: 4096² son 64 MB de memoria de video; con sombras bajas alcanza la mitad de lado
    const far = level === 'baja' ? 2048 : 4096, fs = w.farSun.shadow;
    if (on && fs.mapSize.x !== far) { fs.mapSize.set(far, far); fs.map?.dispose(); fs.map = null; fs.needsUpdate = true; w._baked = false; }
  }
  const sun = w?.sun;
  if (sun && on) {
    const size = SHADOW_SIZE[level] || 2048;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose(); sun.shadow.map = null;
      sun.shadow.needsUpdate = true;
    }
  }
}

export function applyGraphics(G, key, storage) {
  const preset = GRAPHICS[key];
  if (!preset) return;
  Object.assign(G.opts, { graphics: key, grass: preset.grass, shadows: preset.shadows });
  perf(G, preset);
  if (G.grass && G.grass.quality !== preset.grass) G.grass.build(preset.grass);
  G.post?.setQuality(preset);
  if (G.post?.vol) G.post.vol.enabled = preset.vol;
  const w = G.world;
  // el fuego nuevo (el del Diablo, la nafta) mira esto para elegir entre volumétrico y llamas planas
  if (w) w.quality = preset.vol ? 'media' : 'baja';
  w?.pool?.setActive(preset.lights);
  for (const light of [w?.pool?.hero?.light, w?.storm?.flashLight]) if (light) {
    const shadows = preset.heroShadow;
    if (light.castShadow !== shadows) { light.castShadow = shadows; light.shadow.needsUpdate = shadows; }
  }
  for (const flame of w?.fireFallback || []) w.flames.set(flame.index, preset.vol ? 0 : flame.intensity);
  if (G.renderer) applyShadows(G, preset.shadows);
  if (G.renderer) {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, preset.maxDpr);
    G.renderer.setPixelRatio(dpr);
    G.post?.setPixelRatio(dpr);
    G.post?.setSize(globalThis.innerWidth, globalThis.innerHeight);
  }
  if (storage) try { storage.setItem('dukes.graphics', key); } catch {}
}
