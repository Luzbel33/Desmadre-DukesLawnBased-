// Sonidos reales CC0 (Kenney: Impact Sounds, RPG Audio, Casino Audio, Interface Sounds — kenney.nl, dominio público).
// Nombre lógico -> variantes. Si falta un archivo, el motor usa el sonido procedural del mismo nombre.
// Voces de dolor: grabaciones CC0 de OpenGameArt/Freesound (assets/sfx/vo/CREDITOS.txt).
import { vocalManifest } from './vocals.js';
const A = 'assets/sfx/';
const seq = (base, from, to, pad = 3) => Array.from({ length: to - from + 1 }, (_, i) => `${A}${base}${String(from + i).padStart(pad, '0')}.ogg`);
const list = (...names) => names.map((n) => `${A}${n}.ogg`);

export const SFX_MANIFEST = {
  hit: [...seq('impactPunch_heavy_', 0, 4), ...seq('impactPunch_medium_', 0, 4)],
  'hit-soft': [...seq('impactSoft_heavy_', 0, 3), ...seq('impactSoft_medium_', 0, 3)],
  glass: [...seq('impactGlass_heavy_', 0, 4), ...seq('impactGlass_medium_', 0, 4)],
  wood: [...seq('impactWood_heavy_', 0, 4), ...seq('impactWood_medium_', 0, 4)],
  metal: [...seq('impactMetal_heavy_', 0, 3), ...seq('impactMetal_medium_', 0, 3)],
  plate: seq('impactPlate_medium_', 0, 2),
  land: seq('impactSoft_heavy_', 0, 3),
  'step-grass': seq('footstep_grass_', 0, 4),
  'step-hard': seq('footstep_concrete_', 0, 4),
  'step-wood': seq('footstep_wood_', 0, 4),
  'step-carpet': seq('footstep_carpet_', 0, 4),
  cut: list('knifeSlice', 'knifeSlice2', 'chop'),
  pickup: list('handleSmallLeather', 'handleSmallLeather2', 'cloth3'),
  cloth: list('cloth1', 'cloth2', 'cloth3', 'cloth4'),
  draw: list('drawKnife1', 'drawKnife2', 'drawKnife3'),
  pot: list('metalPot1', 'metalPot2', 'metalPot3'),
  'card-deal': list('card-slide-1', 'card-slide-2', 'card-slide-3', 'card-slide-4'),
  'card-flip': list('card-place-1', 'card-place-2', 'card-place-3', 'card-place-4'),
  'card-shove': list('card-shove-1', 'card-shove-2', 'card-shove-3', 'card-shove-4'),
  shuffle: list('card-shuffle', 'card-fan-1', 'card-fan-2'),
  chips: list('chips-stack-1', 'chips-stack-2', 'chips-stack-3', 'chips-stack-4', 'chips-handle-1', 'chips-handle-2'),
  'chips-win': list('chips-collide-1', 'chips-collide-2', 'chips-collide-3', 'chips-collide-4'),
  'chip-lay': list('chip-lay-1', 'chip-lay-2', 'chip-lay-3'),
  ui: list('click_001', 'click_002', 'click_003'),
  'ui-ok': list('confirmation_001', 'confirmation_002'),
  'ui-err': list('error_001', 'error_002'),
  'ui-select': list('select_001', 'select_002', 'select_003'),
  door: list('doorOpen_1', 'doorOpen_2'),
  ...vocalManifest(),
};
