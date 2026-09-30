// Menú circular (gestos): se abre con el click de la rueda o con Z, sin soltar el mouse del juego.
// Sostenido: mové el mouse hacia un gesto y soltá. Un toque rápido lo deja abierto: elegís con el mouse y click.
// Esc, click derecho o volver a tocar la rueda / Z lo cierran sin elegir.
const R = 150; // radio de los botones (px)
const DEAD = 22; // hay que mover al menos esto para elegir (en el centro no hay nada elegido)

export class RadialMenu {
  constructor(el) {
    this.el = el;
    this.open = false;
    this.items = [];
    this.sel = -1;
    this.ax = 0; this.ay = 0;
    this.by = null; // 'mid' | 'z'
    this.t0 = 0;
    this.sticky = false;
    this.label = el.querySelector('.radial-label');
    this.ring = el.querySelector('.radial-items');
    this.cursor = el.querySelector('.radial-cursor');
  }

  show(items, by) {
    this.items = items;
    this.open = true; this.by = by; this.t0 = performance.now(); this.sticky = false;
    this.sel = -1; this.ax = 0; this.ay = 0;
    this.ring.innerHTML = '';
    const n = items.length;
    items.forEach((it, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2; // el primero arriba, en sentido horario
      const b = document.createElement('div');
      b.className = 'radial-item' + (it.special ? ' special' : '');
      b.style.transform = `translate(${Math.cos(a) * R}px, ${Math.sin(a) * R}px)`;
      b.innerHTML = `<span class="ic">${it.icon}</span><span class="tx">${it.label}</span>`;
      this.ring.appendChild(b);
    });
    this._paint();
    this.el.classList.remove('hidden');
  }

  hide() {
    this.open = false;
    this.el.classList.add('hidden');
  }

  // mouse (dx, dy en px del cuadro): mueve el cursor del menú y elige el sector
  move(dx, dy) {
    this.ax += dx; this.ay += dy;
    const d = Math.hypot(this.ax, this.ay);
    if (d > R) { this.ax *= R / d; this.ay *= R / d; }
    const n = this.items.length;
    if (d < DEAD || !n) this.sel = -1;
    else {
      const a = Math.atan2(this.ay, this.ax) + Math.PI / 2; // 0 = arriba
      this.sel = ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;
    }
    this._paint();
  }

  // soltó el botón/tecla con que lo abrió: elige, o queda abierto si fue un toque sin mover
  release() {
    if (this.sel >= 0) return this.items[this.sel];
    if (performance.now() - this.t0 < 350) { this.sticky = true; return null; }
    return undefined; // lo sostuvo sin elegir nada: se cierra
  }

  _paint() {
    const kids = this.ring.children;
    for (let i = 0; i < kids.length; i++) kids[i].classList.toggle('sel', i === this.sel);
    const it = this.items[this.sel];
    this.label.innerHTML = it ? `<b>${it.icon} ${it.label}</b>` : '<small>Mové el mouse y soltá</small>';
    this.cursor.style.transform = `translate(${this.ax * 0.35}px, ${this.ay * 0.35}px)`;
  }
}
