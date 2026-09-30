// De qué es el piso que se pisa: primero lo que hay abajo del pie (tarimas, mesas, escaleras, el ring... cada
// colisionador lleva su material), y si es el suelo, según la zona (pasto, barro de la huerta y el cementerio,
// tierra de la explanada, empedrado del castillo, el piso de madera del bar...). Devuelve el sonido y su tono.
import { G } from '../core/G.js';
import { zoneAt } from '../shared/mapdata.js';
import { GR, groups } from '../core/physics.js';

const GROUND = {
  bar: 'wood', cine: 'carpet', pasto: 'grass', saltos: 'grass', autocine: 'grass', cancha: 'grass',
  huerta: 'mud', cementerio: 'mud', fogon: 'stone', castillo: 'stone', torreon: 'stone', callejon: 'stone',
  estacionamiento: 'stone', galpon: 'stone', bunker: 'stone',
};
// material -> [sonido, tono, volumen]
const SOUND = {
  wood: ['step-wood', 1, 1], carpet: ['step-carpet', 1, 1], grass: ['step-grass', 1, 1],
  mud: ['step-grass', 0.72, 1.05], dirt: ['step-grass', 0.86, 0.95], stone: ['step-hard', 1, 1],
  metal: ['plate', 1.6, 0.35], flesh: ['step-carpet', 0.8, 0.8],
};
const FILTER = groups(0xffff, GR.WORLD | GR.PROP);

export function surfaceAt(x, y, z) {
  const ph = G.phys;
  if (ph && y > 0.04) {
    try {
      const h = ph.raycast(x, y + 0.25, z, 0, -1, 0, 0.6, FILTER);
      if (h?.info) return h.info.mat || (h.info.kind === 'prop' ? 'wood' : 'stone');
    } catch { /* física no lista */ }
  }
  const zone = zoneAt(x, z);
  if (zone) return GROUND[zone] || 'grass';
  // la explanada del castillo es tierra; el resto de afuera, pasto
  return x > -46 && x < 46 && z > -78 && z < -50 ? 'dirt' : 'grass';
}
export function stepSound(x, y, z) {
  return SOUND[surfaceAt(x, y, z)] || SOUND.stone;
}
