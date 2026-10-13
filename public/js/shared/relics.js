// Las reliquias del cofre del laberinto del terror (game/maze.js): objetos únicos que se llevan en la mano. Cada una
// hace algo distinto con el click (main.js useRelic) y los que están cerca lo ven y lo oyen (evento 'relic').
//   slot: el modelo en la mano (game/equipment.js)
export const RELICS = {
  calavera_oro: { slot: 24, icon: '💀', label: 'Calavera de oro', desc: 'Se ríe sola. Mejor no preguntar de qué.', use: 'La calavera se caga de risa' },
  bola_cristal: { slot: 25, icon: '🔮', label: 'Bola de cristal', desc: 'Mirá adentro: te dice dónde anda cada uno.', use: 'Mirar en la bola' },
  silbato: { slot: 26, icon: '☠️', label: 'Silbato de la muerte', desc: 'Azteca. Suena como un alma en pena.', use: 'Soplar el silbato' },
  patito: { slot: 27, icon: '🦆', label: 'Patito dorado', desc: 'De oro macizo. Hace cuac.', use: 'Apretar el patito' },
};
export const relic = (item) => (Object.hasOwn(RELICS, item) ? RELICS[item] : null);
export const RELIC_SLOTS = Object.values(RELICS).map((r) => r.slot);

// las profecías de la bola cuando estás solo (o cuando la bola se pone mística)
export const PROPHECIES = [
  'Veo... una birra en tu futuro cercano.', 'Alguien te va a revolear un gnomo. Cuidate la nuca.',
  'Hoy no es tu día para el póker. Ni mañana.', 'El Diablo sabe lo que hiciste.',
  'Veo un pasto muy alto... y una cortadora sin dueño.', 'Vas a perder una pelea contra una bolsa de boxeo.',
  'Alguien que querés te va a dejar tirado en el laberinto.', 'Tu próximo mate va a estar lavado.',
  'Las bailarinas te miran. Bueno, no.', 'Un fantasma del castillo pregunta por vos.',
];
