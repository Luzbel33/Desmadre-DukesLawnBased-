// Physical versions of equipped items reuse the exact presentation mesh.
export const HELD_ITEMS = {
  beer: { slot: 1, shape: 'cyl', r: .034, h: .31, oy: .045, mass: .45, breakDv: 6.5, glass: 0x2f5a2c, label: 'birra' },
  smoke: { slot: 2, shape: 'box', hx: .007, hy: .007, hz: .085, oy: 0, mass: .006, harmless: true, label: 'pucho' },
  spray: { slot: 3, shape: 'cyl', r: .034, h: .225, oy: .045, mass: .4, label: 'aerosol' },
  cash: { slot: 5, shape: 'box', hx: .08, hy: .02, hz: .055, oy: 0, mass: .12, harmless: true, label: 'fajo de dólares' },
  pistol: { slot: 6, shape: 'box', hx: .025, hy: .075, hz: .19, oy: .015, mass: .8, label: 'pistola' },
  grenade: { slot: 7, shape: 'ball', r: .055, oy: .025, mass: .4, label: 'granada con seguro' },
  potion: { slot: 8, shape: 'ball', r: .07, oy: 0, mass: .28, breakDv: 7, glass: 0x2aff70, label: 'poción' },
  chori: { slot: 9, shape: 'box', hx: .105, hy: .04, hz: .045, oy: 0, mass: .25, label: 'choripán' },
  apple: { slot: 10, shape: 'box', hx: .04, hy: .08, hz: .04, oy: .02, mass: .2, label: 'manzana acaramelada' },
  // lo que se pide en el Búnker (shared/consumables.js)
  fernet: { slot: 11, shape: 'cyl', r: .034, h: .15, oy: .02, mass: .35, breakDv: 6.5, label: 'fernet con coca' },
  whisky: { slot: 12, shape: 'cyl', r: .038, h: .085, oy: 0, mass: .3, breakDv: 6.5, label: 'whisky' },
  sangre: { slot: 13, shape: 'cyl', r: .046, h: .14, oy: .03, mass: .2, breakDv: 5, label: 'copa' },
  absenta: { slot: 14, shape: 'cyl', r: .03, h: .075, oy: 0, mass: .15, breakDv: 6, label: 'absenta' },
  blunt: { slot: 15, shape: 'box', hx: .009, hy: .009, hz: .056, oy: 0, mass: .01, harmless: true, label: 'blunt' },
  cigar: { slot: 16, shape: 'box', hx: .012, hy: .012, hz: .072, oy: 0, mass: .02, harmless: true, label: 'habano' },
  pipe: { slot: 17, shape: 'box', hx: .02, hy: .028, hz: .06, oy: .01, mass: .08, label: 'pipa' },
  bong: { slot: 18, shape: 'cyl', r: .056, h: .32, oy: .05, mass: .9, breakDv: 6, label: 'bong' },
  brownie: { slot: 19, shape: 'box', hx: .035, hy: .019, hz: .033, oy: 0, mass: .06, harmless: true, label: 'brownie' },
  pocion_vida: { slot: 20, shape: 'ball', r: .07, oy: 0, mass: .28, breakDv: 7, glass: 0xff2a3a, label: 'poción de vida' },
  pocion_liebre: { slot: 21, shape: 'ball', r: .07, oy: 0, mass: .28, breakDv: 7, glass: 0x2affb0, label: 'poción de liebre' },
  pocion_salto: { slot: 22, shape: 'ball', r: .07, oy: 0, mass: .28, breakDv: 7, glass: 0x3a8cff, label: 'poción de salto' },
  pocion_colores: { slot: 23, shape: 'ball', r: .07, oy: 0, mass: .28, breakDv: 7, glass: 0xff3ad8, label: 'poción de colores' },
};
export const heldType = item => Object.hasOwn(HELD_ITEMS, item) ? 'held_' + item : null;
export const HELD_PROP_DEFS = Object.fromEntries(Object.entries(HELD_ITEMS).map(([item, d]) => [heldType(item), { ...d, item, kind: 'blunt', grip: [0, 0, 0] }]));
export function heldState(value) { return { bites: Math.max(0, Math.min(7, Number.isFinite(value?.bites) ? value.bites | 0 : 0)) }; }
