// La plata del cliente (reglas y precios en shared/economy.js, la billetera la lleva el servidor):
//  - pay(id): cobra algo de un puesto; devuelve una promesa (true si el servidor cobró y se puede entregar).
//  - Un cartelito arriba a la derecha muestra la plata un momento cada vez que cambia.
//  - Las apuestas a las peleas: un panel (X al lado del ring o la jaula) con los peleadores, el pozo de cada uno y
//    los botones para apostar mientras estén abiertas.
import { G } from '../core/G.js';
import { START_MONEY, priceOf, RINGS, BET_AMOUNTS } from '../shared/economy.js';

const HAS_DOM = typeof document !== 'undefined';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmt = (n) => '$' + Math.round(n).toLocaleString('es-AR');

export class Money {
  constructor({ getNet, notify, setMode, closeToGame }) {
    Object.assign(this, { getNet, notify, setMode, closeToGame });
    this.money = START_MONEY;
    this.pending = new Map();
    this.seq = 1;
    this.fights = new Map(); // ring -> último estado que mandó el servidor
    this.open = null; // el ring que se está mirando
    this.tagT = 0;
  }
  welcome(m) { this.money = m ?? START_MONEY; this.fights.clear(); }

  // ---------------------------------------------------------------- comprar
  afford(id) { return this.money >= priceOf(id); }
  // cobra el ítem (si tiene precio) y avisa si se pudo; sin precio entrega directo
  pay(id) {
    const price = priceOf(id);
    if (!price) return Promise.resolve(true);
    return new Promise((resolve) => {
      if (this.money < price) { this._broke(price); resolve(false); return; }
      const n = this.seq++;
      this.pending.set(n, resolve);
      this.getNet()?.send({ t: 'buy', id, n });
      setTimeout(() => { if (this.pending.delete(n)) resolve(false); }, 4000);
    });
  }
  bought(m) {
    const done = this.pending.get(m.n);
    this.pending.delete(m.n);
    if (m.m != null) this.money = m.m;
    if (!m.ok) this._broke(m.price);
    done?.(!!m.ok);
  }
  _broke(price) {
    G.sfx?.trigger('ui-err', null, 0.6);
    this.notify(`💸 No te alcanza: cuesta ${fmt(price)} y tenés ${fmt(this.money)}.`);
  }

  // ---------------------------------------------------------------- el cartelito
  changed(m) {
    this.money = m.m;
    if (!m.d) return;
    G.sfx?.trigger(m.d > 0 ? 'coins' : 'pickup', null, 0.4);
    this._tag(m.d, m.why);
    if (this.open) this._render();
  }
  _tag(d, why) {
    if (!HAS_DOM) return;
    let el = document.getElementById('money-tag');
    if (!el) {
      el = document.createElement('div'); el.id = 'money-tag'; document.body.appendChild(el);
    }
    el.innerHTML = `<b class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</b> <span>${fmt(this.money)}</span>${why ? `<i>${esc(why)}</i>` : ''}`;
    el.classList.add('on');
    clearTimeout(this.tagT);
    this.tagT = setTimeout(() => el.classList.remove('on'), 3200);
  }
  show() { this._tag(0, ''); } // (sin cambio: solo mostrar cuánto tenés)

  // ---------------------------------------------------------------- apuestas
  fight(m) {
    if (!RINGS.some((r) => r.id === m.ring)) return;
    this.fights.set(m.ring, m);
    if (this.open === m.ring) this._render();
  }
  openBets(ring) {
    const R = RINGS.find((r) => r.id === ring);
    if (!R || !HAS_DOM) return;
    this.open = ring;
    this.getNet()?.send({ t: 'bet', ring, a: 'info' });
    this._render();
    this.setMode('bets');
  }
  close() { this.open = null; this.closeToGame(); }
  _render() {
    const el = document.getElementById('bets');
    if (!el || !this.open) return;
    const R = RINGS.find((r) => r.id === this.open), f = this.fights.get(this.open);
    const me = G.myId, mine = f?.bets?.find((b) => b[0] === me);
    const name = (id) => (id === me ? 'Vos' : f?.fighters.find((x) => x.id === id)?.name || '?');
    const total = f ? Object.values(f.pools || {}).reduce((s, v) => s + v, 0) : 0;
    let body;
    if (!f || f.phase === 'idle') body = `<p class="sub">No hay pelea en ${esc(R.name)}. Cuando dos se suban a pelear se abren las apuestas unos segundos. El que gana la pelea se lleva un premio.</p>`;
    else {
      const open = f.phase === 'open';
      const rows = f.fighters.map((x) => {
        const pool = f.pools?.[x.id] || 0;
        const odds = pool > 0 ? (total / pool).toFixed(2) : '—';
        const btns = open ? BET_AMOUNTS.map((a) => `<button type="button" data-bet="${a}" data-on="${x.id}" ${a > this.money || (mine && mine[1] !== x.id) ? 'disabled' : ''}>${fmt(a)}</button>`).join('') : '';
        const my = mine && mine[1] === x.id ? `<em>tu apuesta: ${fmt(mine[2])}</em>` : '';
        return `<div class="row${x.in ? '' : ' out'}"><span class="nm">🥊 ${esc(x.name)}</span><span class="od">pozo ${fmt(pool)} · paga x${odds}</span>${my}<span class="bt">${btns}</span></div>`;
      }).join('');
      body = `<p class="sub">${open ? `Apuestas abiertas · ${f.left || 0} s` : '¡Pelea en marcha! Apuestas cerradas.'} · Pozo total ${fmt(total)}</p>${rows}`;
    }
    el.innerHTML = `<h2>🎰 Apuestas · ${esc(R.name)}</h2><div class="wallet">Tenés <b>${fmt(this.money)}</b></div>${body}<p class="foot"><b>X</b> o <b>Esc</b> para volver</p>`;
  }
  clickBets(e) {
    const b = e.target.closest('button[data-bet]');
    if (!b || !this.open) return;
    this.getNet()?.send({ t: 'bet', ring: this.open, a: 'place', on: Number(b.dataset.on), amt: Number(b.dataset.bet) });
    G.sfx?.trigger('ui-select', null, 0.5);
  }
  tick(dt) { // refresca la cuenta regresiva del panel abierto
    if (!this.open) return;
    this._t = (this._t || 0) + dt;
    if (this._t < 1) return;
    this._t = 0;
    const f = this.fights.get(this.open);
    if (f?.phase === 'open' && f.left > 0) { f.left--; this._render(); }
  }
}
