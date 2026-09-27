// Teclado + mouse + pointer lock.
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
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'F1', 'Quote', 'Slash'].includes(e.code) || (e.ctrlKey && e.code === 'KeyW')) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => {
      if (this.down.has(e.code)) this.released.add(e.code);
      this.down.delete(e.code);
    });
    addEventListener('blur', () => this.releaseAll());
    canvas.addEventListener('mousedown', (e) => {
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
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.releaseAll();
      this.onLockChange && this.onLockChange(this.locked);
    });
  }

  _typing(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }

  lock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => {});
    } catch { /* ignore */ }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
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
