// Physical versions of equipped items reuse the exact presentation mesh.
export const HELD_ITEMS = {
  beer: { slot: 1, shape: 'cyl', r: .034, h: .31, oy: .045, mass: .45, breakDv: 6.5, glass: 0x2f5a2c, label: 'birra' },
  smoke: { slot: 2, shape: 'box', hx: .007, hy: .007, hz: .085, oy: 0, mass: .006, label: 'pucho' },
  spray: { slot: 3, shape: 'cyl', r: .034, h: .225, oy: .045, mass: .4, label: 'aerosol' },
  cash: { slot: 5, shape: 'box', hx: .08, hy: .02, hz: .055, oy: 0, mass: .12, label: 'fajo de billetes' },
  pistol: { slot: 6, shape: 'box', hx: .025, hy: .075, hz: .19, oy: .015, mass: .8, label: 'pistola' },
  grenade: { slot: 7, shape: 'ball', r: .055, oy: .025, mass: .4, label: 'granada con seguro' },
  potion: { slot: 8, shape: 'ball', r: .07, oy: 0, mass: .28, breakDv: 7, glass: 0x2aff70, label: 'poción' },
  chori: { slot: 9, shape: 'box', hx: .105, hy: .04, hz: .045, oy: 0, mass: .25, label: 'choripán' },
  apple: { slot: 10, shape: 'box', hx: .04, hy: .08, hz: .04, oy: .02, mass: .2, label: 'manzana acaramelada' },
};
export const heldType = item => Object.hasOwn(HELD_ITEMS, item) ? 'held_' + item : null;
export const HELD_PROP_DEFS = Object.fromEntries(Object.entries(HELD_ITEMS).map(([item, d]) => [heldType(item), { ...d, item, kind: 'blunt', grip: [0, 0, 0] }]));
export function heldState(value) { return { bites: Math.max(0, Math.min(2, Number.isFinite(value?.bites) ? value.bites | 0 : 0)) }; }
