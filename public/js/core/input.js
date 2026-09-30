// Teclado + mouse + pointer lock.
const CAPTURE_KEYS = ['KeyW','KeyT','KeyN','KeyR','KeyL','KeyS','KeyD','KeyF','KeyP','Tab','F4','F5'];
export function browserShortcut(e) {
  return ((e.ctrlKey || e.metaKey) && CAPTURE_KEYS.includes(e.code))
    || (e.altKey && ['ArrowLeft','ArrowRight','F4'].includes(e.code)) || e.code === 'F5';
}
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = [false, false, false];
    this.mPressed = [false, false, false];
    this.mReleased = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.enabled = true; // false cuando hay un input de texto o un menú abierto
    this.locked = false;
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (this._typing(e)) return;
      if (!this.enabled) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'F1', 'Quote', 'Slash'].includes(e.code) || (e.ctrlKey && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) || (this.locked && browserShortcut(e))) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => {
      if (this.down.has(e.code)) this.released.add(e.code);
      this.down.delete(e.code);
    });
    addEventListener('blur', () => this.releaseAll());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault(); // la rueda abre los gestos: sin autoscroll del navegador
      if (!this.enabled) return;
      if (!this.locked) return;
      this.mouse[e.button] = true;
      this.mPressed[e.button] = true;
    });
    addEventListener('mouseup', (e) => {
      if (this.mouse[e.button]) this.mReleased[e.button] = true;
      this.mouse[e.button] = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // algunos navegadores mandan saltos enormes al capturar el mouse
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    addEventListener('wheel', (e) => {
      if (!this.locked) return;
      e.preventDefault(); // incluye Ctrl + rueda (zoom del navegador)
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.releaseAll(); navigator.keyboard?.unlock?.(); }
      else this._keyboardCapture();
      this.onLockChange && this.onLockChange(this.locked);
    });
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) navigator.keyboard?.unlock?.();
      else if (this.locked && this.enabled) this._keyboardCapture();
    });
  }

  _typing(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  // onFail: el navegador no dejó capturar el mouse (p. ej. justo después de un Esc): hay que hacer click
  lock(onFail) {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => onFail?.());
    } catch { onFail?.(); }
  }
  unlock() {
    navigator.keyboard?.unlock?.();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  async _keyboardCapture() {
    if (!document.fullscreenElement || !navigator.keyboard?.lock) return false;
    try { await navigator.keyboard.lock(CAPTURE_KEYS); return true; }
    catch { return false; }
  }

  async immersive() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      return await this._keyboardCapture();
    } catch { return false; }
  }

  releaseAll() {
    for (const k of this.down) this.released.add(k);
    this.down.clear();
    this.pressed.clear();
    this.dx = this.dy = this.wheel = 0;
    this.mPressed.fill(false);
    for (let i = 0; i < 3; i++) {
      if (this.mouse[i]) this.mReleased[i] = true;
      this.mouse[i] = false;
    }
  }

  key(code) { return this.enabled && this.down.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  consume(code) {
    if (!this.hit(code)) return false;
    this.pressed.delete(code);
    return true;
  }
  up(code) { return this.released.has(code); }
  btn(i) { return this.enabled && this.mouse[i]; }
  btnHit(i) { return this.enabled && this.mPressed[i]; }
  btnUp(i) { return this.mReleased[i]; }

  // llamar al final de cada frame
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mPressed = [false, false, false];
    this.mReleased = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }
}
