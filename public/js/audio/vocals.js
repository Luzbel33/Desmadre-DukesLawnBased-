// Voces de dolor (grabaciones CC0, ver assets/sfx/vo/CREDITOS.txt). Cada jugador tiene SU voz (según el modelo
// y su número), así se reconoce quién grita. kind: 'hurt' (quejido) | 'scream' (golpe fuerte, KO) | 'death'.
const A = 'assets/sfx/vo/';
// voz -> cantidad de tomas [quejidos, gritos, muerte]
const N = { m1: [6, 4, 0], m2: [4, 4, 2], m3: [5, 5, 2], m4: [4, 3, 3], m5: [5, 4, 3], f1: [3, 0, 0], f2: [3, 0, 0], f3: [3, 0, 0], f: [0, 2, 2] };
const KINDS = ['hurt', 'scream', 'death'];
export const VOICES = { m: ['m1', 'm2', 'm3', 'm4', 'm5'], f: ['f1', 'f2', 'f3'] };

// entradas para el manifiesto de sonidos: 'vo-hurt-m1' -> [archivos]
export function vocalManifest() {
  const out = {};
  for (const [v, counts] of Object.entries(N)) {
    KINDS.forEach((k, i) => {
      if (counts[i]) out[`vo-${k}-${v}`] = Array.from({ length: counts[i] }, (_, j) => `${A}vo-${k}-${v}-${j + 1}.ogg`);
    });
  }
  return out;
}

export function voiceOf(gender, id) {
  const list = VOICES[gender === 'f' ? 'f' : 'm'];
  return list[Math.abs(id | 0) % list.length];
}

// tono propio de cada jugador (dos con la misma voz no suenan idénticos)
export function voiceRate(id) {
  return 0.95 + (Math.abs((id | 0) * 37) % 11) / 100;
}

// nombre del sonido: las mujeres comparten gritos; a una voz sin tomas de muerte le quedan los gritos
export function vocalName(kind, voice) {
  if (voice[0] === 'f') return kind === 'hurt' ? `vo-hurt-${voice}` : `vo-${kind === 'death' ? 'death' : 'scream'}-f`;
  if (kind === 'death' && !N[voice]?.[2]) return `vo-scream-${voice}`;
  return `vo-${KINDS.includes(kind) ? kind : 'hurt'}-${voice}`;
}
