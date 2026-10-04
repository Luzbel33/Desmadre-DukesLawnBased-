// Contexto global del juego: referencias compartidas entre módulos.
export const G = {
  renderer: null,
  scene: null,
  camera: null,
  aimCam: null, // hacia dónde salen disparos, aliento y revoleos (de frente no es la cámara: ver syncAim en main.js)
  phys: null, // Physics
  net: null,
  ui: null,
  sfx: null,
  voice: null,
  world: null,
  grass: null,
  fx: null,
  blood: null,
  post: null,
  me: null, // LocalPlayer
  players: new Map(), // id -> RemotePlayer
  props: null,
  vehicles: null,
  graffiti: null,
  media: null,
  input: null,
  settings: { desmadre: false },
  perf: { shadowEvery: 1, npcLod: 1 }, // lo pone el preset gráfico (core/graphics.js)
  opts: {
    sens: 1,
    invertY: false,
    fov: 72,
    graphics: 'equilibrado', // el preset que se está usando
    graphicsMode: 'auto', // 'auto' o el preset elegido a mano
    atmosphere: 'natural',
    grass: 'media',
    shadows: 'media',
    vol: 0.8,
    volMusic: 0.7,
    volVoice: 1,
    volSfx: 0.8,
    volAmbient: 0.35,
    muted: false,
    voiceMode: 'ptt', // 'ptt' | 'open'
    voiceSpatial: true,
    goreLevel: 'full', // 'full' | 'soft'
  },
  time: 0,
  dt: 0,
  myId: 0,
  inGame: false,
  frame: 0,
};

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function dampAngle(a, b, lambda, dt) {
  return a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));
}
// PRNG determinístico (mulberry32)
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
