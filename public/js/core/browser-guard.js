// Que el navegador no te saque del juego: Ctrl+W, Ctrl+T, Ctrl+N y compañía.
// Chrome no deja frenar esos atajos desde una página común; solo en pantalla completa con Keyboard Lock
// (navigator.keyboard.lock) llegan al juego. Por eso: al entrar (o volver de la pausa) se pide pantalla completa
// y se bloquean las teclas que se usan jugando; los atajos que sí se pueden frenar se frenan siempre; y si igual
// se intenta cerrar la pestaña, el navegador pregunta antes ("¿Salir del sitio?").

// teclas que se bloquean en pantalla completa (Esc no: sigue abriendo la pausa y, sostenido, sale)
const LOCK_KEYS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyT', 'KeyN', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyP',
  'KeyL', 'KeyK', 'KeyI', 'KeyO', 'KeyB', 'KeyM', 'KeyX', 'KeyZ', 'KeyC', 'KeyV', 'KeyY', 'Tab', 'Space',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'F1', 'F3', 'F5', 'F6', 'F7', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
];
// con Ctrl/Cmd: lo que se puede frenar en una página común (guardar, imprimir, buscar, recargar, marcadores, etc.)
const CTRL_BLOCK = new Set(['KeyS', 'KeyP', 'KeyF', 'KeyR', 'KeyD', 'KeyH', 'KeyJ', 'KeyU', 'KeyG', 'KeyO', 'KeyE', 'KeyK', 'KeyL', 'KeyB', 'KeyA', 'KeyQ', 'KeyW', 'KeyT', 'KeyN', 'Tab', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Space']);
const FKEY_BLOCK = new Set(['F1', 'F3', 'F5', 'F6', 'F7', 'BrowserBack', 'BrowserForward', 'BrowserRefresh']);

export const guard = {
  enabled: true, // pantalla completa + teclas bloqueadas (opción de la pausa)
  isPlaying: () => false,

  init({ isPlaying }) {
    this.isPlaying = isPlaying;
    try { this.enabled = localStorage.getItem('dukes.fullscreen') !== '0'; } catch { /* sin storage */ }
    addEventListener('keydown', (e) => {
      if (!this.isPlaying()) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        // escribiendo: copiar/pegar/cortar/deshacer andan; cerrar o recargar, no
        if ((e.ctrlKey || e.metaKey) && ['KeyW', 'KeyR', 'KeyT', 'KeyN', 'KeyS', 'KeyP'].includes(e.code)) e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && CTRL_BLOCK.has(e.code)) e.preventDefault();
      else if (FKEY_BLOCK.has(e.code) || (e.altKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'Home'))) e.preventDefault();
      else if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault(); // Alt suelto enfoca la barra del navegador
    }, { capture: true });
    // si igual se intenta cerrar la pestaña (Ctrl+W fuera de pantalla completa, el botón X): el navegador pregunta
    addEventListener('beforeunload', (e) => {
      if (!this.isPlaying()) return;
      e.preventDefault();
      e.returnValue = '';
    });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) this._unlockKeys(); });
  },

  setEnabled(on) {
    this.enabled = !!on;
    try { localStorage.setItem('dukes.fullscreen', on ? '1' : '0'); } catch { /* */ }
    if (!on) this.exit();
  },

  // llamar SOLO desde un click o una tecla del jugador (el navegador lo exige)
  async enter() {
    if (!this.enabled) return;
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    } catch { return; }
    try { await navigator.keyboard?.lock?.(LOCK_KEYS); } catch { /* navegador sin Keyboard Lock (Firefox, Safari) */ }
  },

  exit() {
    this._unlockKeys();
    if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
  },

  _unlockKeys() { try { navigator.keyboard?.unlock?.(); } catch { /* */ } },

  // ¿están bloqueados de verdad los atajos que cierran la pestaña?
  get locked() { return !!document.fullscreenElement && !!navigator.keyboard?.lock; },
};
