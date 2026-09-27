// HUD: avisos cortos, carteles grandes y ayudas de controles.
// Las ayudas son chiquitas, van a un costado y se desvanecen; en pausa se eligen: siempre, las primeras
// veces o nunca. Nada fijo en el medio de la pantalla (solo la mira, que se marca si hay algo para usar).

const $ = (id) => document.getElementById(id);
const esc = (s) => { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; };

export const HINT_MODES = { siempre: 'Siempre', primeras: 'Las primeras veces', nunca: 'Nunca' };
const SEEN_KEY = 'dukes.hints.seen';
const MODE_KEY = 'dukes.hints';
const FIRST_TIMES = 3; // "las primeras veces": cada ayuda se muestra hasta 3 veces
const SHOW_S = 6; // segundos que se ve una ayuda antes de desvanecerse (en "primeras veces")

export class Hud {
  constructor() {
    this.el = { toasts: $('toasts'), hints: $('hints'), big: $('bigmsg'), cross: $('crosshair') };
    this.hintsNow = new Map(); // id -> { key, text } pedidas este cuadro
    this.chips = new Map(); // id -> { el, t, key, text, counted, gone }
    try { this.seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch { this.seen = {}; }
    let m = null;
    try { m = localStorage.getItem(MODE_KEY); } catch { /* */ }
    this.mode = HINT_MODES[m] ? m : 'primeras';
  }

  setHintMode(m) {
    if (!HINT_MODES[m]) return;
    this.mode = m;
    try { localStorage.setItem(MODE_KEY, m); } catch { /* */ }
    if (m === 'siempre') this.seen = {};
  }

  // Aviso corto arriba a la derecha (se va solo)
  notify(html, ms = 5000) {
    const box = this.el.toasts;
    if (!box) return;
    const d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = html;
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.classList.add('out'), ms);
    setTimeout(() => d.remove(), ms + 500);
  }

  // Cartel grande (KO, gol...). Corto y arriba del centro.
  big(title, sub = '', ms = 1800) {
    const el = this.el.big;
    if (!el) return;
    el.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    el.classList.remove('hidden', 'show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this._bigT);
    this._bigT = setTimeout(() => el.classList.add('hidden'), ms);
  }

  // ------------------------------------------------------------ ayudas
  // Pedir una ayuda este cuadro: id estable, tecla y texto corto
  hint(id, key, text) { this.hintsNow.set(id, { key, text }); }

  flushHints() {
    const now = performance.now();
    const want = this.mode === 'nunca' ? new Map() : this.hintsNow;
    for (const [id, h] of want) {
      let c = this.chips.get(id);
      if (c?.gone) { c.el.remove(); this.chips.delete(id); c = null; }
      if (!c) {
        // "primeras veces": cada ayuda aparece hasta 3 veces
        if (this.mode === 'primeras' && (this.seen[id] || 0) >= FIRST_TIMES) continue;
        const el = document.createElement('div');
        el.className = 'chip';
        this.el.hints?.appendChild(el);
        c = { el, t: now, key: '', text: '', counted: false, gone: 0 };
        this.chips.set(id, c);
      }
      if (c.key !== h.key || c.text !== h.text) {
        c.key = h.key; c.text = h.text;
        c.el.innerHTML = `${h.key ? `<kbd>${esc(h.key)}</kbd>` : ''}<span>${esc(h.text)}</span>`;
      }
      // se cuenta como vista a los 1.5 s
      if (!c.counted && now - c.t > 1500) {
        c.counted = true;
        this.seen[id] = (this.seen[id] || 0) + 1;
        try { localStorage.setItem(SEEN_KEY, JSON.stringify(this.seen)); } catch { /* */ }
      }
      const age = (now - c.t) / 1000;
      // "primeras veces": se desvanece sola; "siempre": queda, pero más tenue
      c.el.classList.toggle('dim', this.mode === 'siempre' && age > SHOW_S);
      if (this.mode === 'primeras' && age > SHOW_S) c.el.classList.add('out');
    }
    for (const [id, c] of this.chips) {
      if (want.has(id)) continue;
      if (!c.gone) { c.gone = now; c.el.classList.add('out'); }
      if (now - c.gone > 350) { c.el.remove(); this.chips.delete(id); }
    }
    this.hintsNow = new Map();
  }

  // Mira: se marca cuando hay algo para usar o agarrar
  crosshair(canUse) { this.el.cross?.classList.toggle('use', !!canUse); }
}
