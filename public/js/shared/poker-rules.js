// Reglas del Texas Hold'em compartidas por el servidor (reparte y decide) y el cliente (te dice qué tenés).
// Cartas como 'As', 'Td', '9c': rango (2-9, T, J, Q, K, A) + palo (s picas, h corazones, d diamantes, c tréboles).

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';
export const rankValue = (c) => RANKS.indexOf(c[0]) + 2;

// Puntaje de 5 cartas: [categoría, desempates...] (8 escalera de color ... 0 carta alta)
export function eval5(cards) {
  const v = cards.map(rankValue).sort((a, b) => b - a);
  const suits = cards.map((c) => c[1]);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(v)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (v[0] - v[4] === 4) straightHigh = v[0];
    else if (v[0] === 14 && v[1] === 5 && v[4] === 2) straightHigh = 5; // A-2-3-4-5
  }
  const counts = new Map();
  for (const x of v) counts.set(x, (counts.get(x) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const byGroup = groups.flatMap(([r, n]) => Array(n).fill(r));
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...v];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, ...byGroup];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...byGroup];
  if (groups[0][1] === 2) return [1, ...byGroup];
  return [0, ...v];
}

export function cmpScore(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

// La mejor mano de 5 entre 5, 6 o 7 cartas: { score, cards }
export function bestHand(cards) {
  if (cards.length <= 5) return { score: eval5(cards), cards: cards.slice() };
  let best = null, bestCards = null;
  const n = cards.length;
  const pick = (start, chosen) => {
    if (chosen.length === 5) {
      const five = chosen.map((i) => cards[i]);
      const s = eval5(five);
      if (!best || cmpScore(s, best) > 0) { best = s; bestCards = five; }
      return;
    }
    for (let i = start; i <= n - (5 - chosen.length); i++) pick(i + 1, [...chosen, i]);
  };
  pick(0, []);
  return { score: best, cards: bestCards };
}

export const HAND_NAMES = ['Carta alta', 'Par', 'Doble par', 'Trío', 'Escalera', 'Color', 'Full', 'Póker', 'Escalera de color'];
export function handName(score) {
  if (score[0] === 8 && score[1] === 14) return 'Escalera real';
  return HAND_NAMES[score[0]];
}

// Nombres de los rangos para decir la jugada en criollo (singular / plural)
const ONE = { 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco', 6: 'seis', 7: 'siete', 8: 'ocho', 9: 'nueve', 10: 'diez', 11: 'jota', 12: 'reina', 13: 'rey', 14: 'as' };
const MANY = { 2: 'doses', 3: 'treses', 4: 'cuatros', 5: 'cincos', 6: 'seises', 7: 'sietes', 8: 'ochos', 9: 'nueves', 10: 'dieces', 11: 'jotas', 12: 'reinas', 13: 'reyes', 14: 'ases' };
const TOP = { 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'la jota', 12: 'la reina', 13: 'el rey', 14: 'el as' };

// "Par de ases", "Doble par: reyes y sietes", "Full: reinas y cuatros", "Escalera al 9", "Color al as"...
export function describeHand(score) {
  const [k, a, b] = score;
  switch (k) {
    case 8: return a === 14 ? 'Escalera real' : `Escalera de color al ${TOP[a]}`;
    case 7: return `Póker de ${MANY[a]}`;
    case 6: return `Full: ${MANY[a]} y ${MANY[b]}`;
    case 5: return `Color al ${TOP[a]}`;
    case 4: return `Escalera al ${TOP[a]}`;
    case 3: return `Trío de ${MANY[a]}`;
    case 2: return `Doble par: ${MANY[a]} y ${MANY[score[3]]}`;
    case 1: return `Par de ${MANY[a]}`;
    default: return `Carta alta: ${ONE[a] === 'as' ? 'as' : ONE[a]}`;
  }
}

// Tabla de jugadas para el que no se las sabe (de la mejor a la peor), con un ejemplo de cada una
export const RANKING = [
  { name: 'Escalera real', desc: 'A, K, Q, J y 10 del mismo palo. La mejor de todas.', ex: ['Ah', 'Kh', 'Qh', 'Jh', 'Th'] },
  { name: 'Escalera de color', desc: 'Cinco seguidas del mismo palo.', ex: ['9s', '8s', '7s', '6s', '5s'] },
  { name: 'Póker', desc: 'Cuatro cartas iguales.', ex: ['Qc', 'Qd', 'Qh', 'Qs', '4d'] },
  { name: 'Full', desc: 'Un trío más un par.', ex: ['Kd', 'Kh', 'Ks', '7c', '7d'] },
  { name: 'Color', desc: 'Cinco del mismo palo, en cualquier orden.', ex: ['Ad', 'Jd', '8d', '5d', '2d'] },
  { name: 'Escalera', desc: 'Cinco seguidas de cualquier palo.', ex: ['Tc', '9d', '8h', '7s', '6c'] },
  { name: 'Trío', desc: 'Tres cartas iguales.', ex: ['7h', '7c', '7s', 'Kd', '2c'] },
  { name: 'Doble par', desc: 'Dos pares distintos.', ex: ['Jc', 'Jh', '4d', '4s', 'Ah'] },
  { name: 'Par', desc: 'Dos cartas iguales.', ex: ['Ac', 'Ad', '9h', '6s', '3c'] },
  { name: 'Carta alta', desc: 'Nada de lo anterior: gana la carta más alta.', ex: ['Ks', 'Td', '8c', '5h', '3d'] },
];
