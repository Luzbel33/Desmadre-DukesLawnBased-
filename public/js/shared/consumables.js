// Lo que se toma, se fuma o se come en el Búnker (la barra del club y el coffeeshop). Un solo catálogo para todo:
// el número de modelo en la mano (slot, ver game/equipment.js), el gesto, cuántas veces se usa antes de terminarse y lo
// que te hace. La birra y el faso de siempre siguen siendo los del bolsillo (1 y 2); estos se piden.
//   fx: drunk / high / pill (se suman, con tope), cough (tos), shake (sacudón), fire (llamarada por la boca),
//       later: { high, s } (pega después: el brownie)
export const CONSUMABLES = {
  // ---------------------------------------------------------------- tragos (la barra del club)
  fernet: { slot: 11, kind: 'drink', uses: 3, label: 'Fernet con coca', icon: '🥤', fx: { drunk: 0.14 } },
  whisky: { slot: 12, kind: 'drink', uses: 2, label: 'Whisky', icon: '🥃', fx: { drunk: 0.22 } },
  sangre: { slot: 13, kind: 'drink', uses: 2, label: 'Sangre del Diablo', icon: '🍷', fx: { drunk: 0.24, fire: true, shake: 0.35 } },
  absenta: { slot: 14, kind: 'drink', uses: 2, label: 'Absenta', icon: '🧪', fx: { drunk: 0.16, pill: 0.45 } },
  // ---------------------------------------------------------------- el coffeeshop
  blunt: { slot: 15, kind: 'smoke', uses: 4, label: 'Blunt', icon: '🍃', fx: { high: 0.2 }, puff: 1.6 },
  cigar: { slot: 16, kind: 'smoke', uses: 5, label: 'Habano', icon: '🚬', fx: { cough: 0.25 }, puff: 2.2 },
  pipe: { slot: 17, kind: 'smoke', uses: 4, label: 'Pipa', icon: '💨', fx: { high: 0.06 }, puff: 1.2 },
  bong: { slot: 18, kind: 'smoke', uses: 2, label: 'Bong', icon: '🫧', fx: { high: 0.42, cough: 1, shake: 0.4 }, puff: 3 },
  brownie: { slot: 19, kind: 'eat', uses: 2, label: 'Brownie', icon: '🍫', fx: { later: { high: 0.32, s: 9 } } },
};
export const consumable = (item) => (Object.hasOwn(CONSUMABLES, item) ? CONSUMABLES[item] : null);
export const SLOT_KIND = Object.fromEntries(Object.values(CONSUMABLES).map((c) => [c.slot, c.kind]));
// los menús (ruedita) de la barra y del coffeeshop
export const BAR_MENU = [{ item: 'beer', icon: '🍺', label: 'Birra' }, ...['fernet', 'whisky', 'sangre', 'absenta'].map((item) => ({ item, icon: CONSUMABLES[item].icon, label: CONSUMABLES[item].label }))];
export const CAFE_MENU = [{ item: 'smoke', icon: '🌿', label: 'Faso' }, ...['blunt', 'cigar', 'pipe', 'bong', 'brownie'].map((item) => ({ item, icon: CONSUMABLES[item].icon, label: CONSUMABLES[item].label }))];
