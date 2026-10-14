// Las armas de fuego (estilo GTA): cada una con su ritmo, cargador, dispersión (de la cadera / apuntando), perdigones,
// fuerza del tiro (s: lo que valida el que recibe, como un golpe 'g'; npc: lo que le llega a un NPC), retroceso
// (recoil: cuánto sube la mira; kick: sacudón de cámara) y si se sostiene con las dos manos.
//   click izquierdo = disparar (al apretar; el subfusil sigue mientras se sostiene)
//   click derecho sostenido = apuntar (zoom, las dos manos al arma, más precisión)
//   R con un arma en la mano = recargar (sin arma sigue siendo el cabezazo)
export const GUNS = {
  pistol: { label: 'pistola', slot: 6, rate: 0.2, auto: false, mag: 12, reload: 1.35, pellets: 1, s: 16, npc: 15, spread: [0.035, 0.005], recoil: 0.045, kick: 0.06, two: false, pitch: 1, range: 90 },
  revolver: { label: 'revólver', slot: 29, rate: 0.5, auto: false, mag: 6, reload: 2.1, pellets: 1, s: 24, npc: 21, spread: [0.045, 0.003], recoil: 0.11, kick: 0.12, two: false, pitch: 0.72, range: 90 },
  shotgun: { label: 'escopeta', slot: 30, rate: 0.85, auto: false, mag: 6, reload: 2.6, pellets: 9, s: 7.5, npc: 8.5, spread: [0.1, 0.06], recoil: 0.16, kick: 0.17, two: true, pitch: 0.58, range: 38 },
  smg: { label: 'subfusil', slot: 31, rate: 0.085, auto: true, mag: 30, reload: 1.9, pellets: 1, s: 11, npc: 10, spread: [0.065, 0.02], recoil: 0.022, kick: 0.028, two: true, pitch: 1.3, range: 70 },
};
export const isGun = (item) => !!item && Object.hasOwn(GUNS, item);
export const GUN_SLOTS = new Set(Object.values(GUNS).map((g) => g.slot));
