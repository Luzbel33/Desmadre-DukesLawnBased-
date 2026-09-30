// Teclas configurables. El juego sigue preguntando por la tecla "de fábrica" (KeyX, KeyC...); acá se traduce la
// tecla física que apretás a esa tecla de fábrica. Así cambiar una tecla no obliga a tocar cada rincón del código.
// Si elegís una tecla que ya usa otra acción, se intercambian (nunca dos acciones en la misma tecla).
export const ACTIONS = [
  { g: 'Moverse', a: 'forward', label: 'Adelante', def: 'KeyW' },
  { g: 'Moverse', a: 'back', label: 'Atrás', def: 'KeyS' },
  { g: 'Moverse', a: 'left', label: 'Izquierda', def: 'KeyA' },
  { g: 'Moverse', a: 'right', label: 'Derecha', def: 'KeyD' },
  { g: 'Moverse', a: 'run', label: 'Correr', def: 'ShiftLeft' },
  { g: 'Moverse', a: 'walk', label: 'Caminar despacio (mantener; en pantalla completa Ctrl+W no cierra nada)', def: 'ControlLeft' },
  { g: 'Moverse', a: 'jump', label: 'Saltar', def: 'Space' },
  { g: 'Moverse', a: 'crouch', label: 'Agacharse · corriendo: barrida · en el aire: dive', def: 'KeyC' },
  { g: 'Acciones', a: 'use', label: 'Usar (sentarse, subir, heladerita...)', def: 'KeyX' },
  { g: 'Acciones', a: 'grabR', label: 'Agarrar / soltar mano derecha', def: 'KeyE' },
  { g: 'Acciones', a: 'grabL', label: 'Agarrar / soltar mano izquierda', def: 'KeyQ' },
  { g: 'Acciones', a: 'throw', label: 'Revolear', def: 'KeyG' },
  { g: 'Acciones', a: 'kick', label: 'Patada', def: 'KeyF' },
  { g: 'Acciones', a: 'headbutt', label: 'Cabezazo', def: 'KeyR' },
  { g: 'Acciones', a: 'item1', label: 'Birra', def: 'Digit1' },
  { g: 'Acciones', a: 'item2', label: 'Faso', def: 'Digit2' },
  { g: 'Acciones', a: 'item3', label: 'Aerosol', def: 'Digit3' },
  { g: 'Acciones', a: 'item4', label: 'Mano libre', def: 'Digit4' },
  { g: 'Acciones', a: 'palette', label: 'Colores del aerosol', def: 'KeyB' },
  { g: 'Acciones', a: 'horn', label: 'Bocina (manejando)', def: 'KeyH' },
  { g: 'Menús y cámara', a: 'camera', label: 'Cambiar cámara (tercera, cerca, primera persona, de frente)', def: 'KeyY' },
  { g: 'Menús y cámara', a: 'emotes', label: 'Gestos: tocar repite el último, mantener abre la rueda (también el click de la rueda)', def: 'KeyZ' },
  { g: 'Menús y cámara', a: 'activities', label: '¿Qué hacemos?', def: 'KeyJ' },
  { g: 'Menús y cámara', a: 'screens', label: 'Pantallas de YouTube', def: 'KeyP' },
  { g: 'Menús y cámara', a: 'chat', label: 'Chat', def: 'KeyT' },
  { g: 'Menús y cámara', a: 'players', label: 'Lista de jugadores (mantener)', def: 'Tab' },
  { g: 'Voz', a: 'talk', label: 'Hablar (mantener)', def: 'KeyV' },
  { g: 'Voz', a: 'mic', label: 'Prender / apagar micrófono', def: 'KeyM' },
  { g: 'El Diablo', a: 'fire', label: 'Fuego por la boca (mantener)', def: 'KeyK' },
  { g: 'El Diablo', a: 'fireball', label: 'Bola de fuego', def: 'KeyN' },
  { g: 'El Diablo', a: 'invisible', label: 'Invisible', def: 'KeyI' },
  { g: 'El Diablo', a: 'immortal', label: 'Inmortal', def: 'KeyO' },
  { g: 'El Diablo', a: 'laugh', label: 'Risa', def: 'KeyL' },
];
const BY = Object.fromEntries(ACTIONS.map((x) => [x.a, x]));
// teclas que no se pueden asignar (las usa el navegador o el juego para salir)
const RESERVED = new Set(['Escape', 'Enter', 'F11', 'F12', 'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight']);

export const keys = {
  bound: {}, // acción -> tecla física
  table: new Map(), // tecla física -> tecla de fábrica (null = no hace nada)
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('dukes.keys') || '{}') || {}; } catch { saved = {}; }
    this.bound = {};
    for (const x of ACTIONS) this.bound[x.a] = typeof saved[x.a] === 'string' && !RESERVED.has(saved[x.a]) ? saved[x.a] : x.def;
    this._build();
    return this;
  },
  save() {
    const out = {};
    for (const x of ACTIONS) if (this.bound[x.a] !== x.def) out[x.a] = this.bound[x.a];
    try { localStorage.setItem('dukes.keys', JSON.stringify(out)); } catch { /* */ }
  },
  _build() {
    const t = new Map();
    // las teclas de fábrica que quedaron libres (su acción se mudó) no hacen nada
    for (const x of ACTIONS) if (this.bound[x.a] !== x.def) t.set(x.def, null);
    for (const x of ACTIONS) t.set(this.bound[x.a], x.def);
    this.table = t;
  },
  // tecla física -> la tecla que entiende el juego (o null si no hace nada)
  map(code) {
    if (code === 'ShiftRight') return this.table.has('ShiftRight') ? this.table.get('ShiftRight') : (this.bound.run === 'ShiftLeft' ? 'ShiftLeft' : 'ShiftRight');
    if (code === 'ControlRight' && !this.table.has('ControlRight') && this.bound.walk === 'ControlLeft') return 'ControlLeft';
    return this.table.has(code) ? this.table.get(code) : code;
  },
  // asigna; si la tecla la usaba otra acción, se la pasa a esa la tecla vieja. Devuelve la acción desplazada
  set(action, code) {
    if (!BY[action] || RESERVED.has(code)) return null;
    const old = this.bound[action];
    let swapped = null;
    for (const x of ACTIONS) if (x.a !== action && this.bound[x.a] === code) { this.bound[x.a] = old; swapped = x.a; }
    this.bound[action] = code;
    this._build(); this.save();
    return swapped;
  },
  reset() { for (const x of ACTIONS) this.bound[x.a] = x.def; this._build(); this.save(); },
  of(action) { return this.bound[action] || BY[action]?.def; },
  label(action) { return keyName(this.of(action)); },
  reserved(code) { return RESERVED.has(code); },
};

export function keyName(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const names = { Space: 'Espacio', ShiftLeft: 'Shift', ShiftRight: 'Shift der.', ControlLeft: 'Ctrl', ControlRight: 'Ctrl der.', Tab: 'Tab', CapsLock: 'Bloq Mayús', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: 'Ñ', Quote: "'", Backslash: '\\', Comma: ',', Period: '.', Slash: '-', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: 'Borrar' };
  return names[code] || code;
}
export { ACTIONS as KEY_ACTIONS };
