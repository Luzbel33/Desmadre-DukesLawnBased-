// Panel de admin (F9). Lo usan el dueño y los admins que él nombra (el servidor decide quién es quién).
// Cómo se entra: con la clave del dueño (desde este mismo panel, con cualquier nombre; o como siempre, con el nombre
// SmokePyro). El dueño nombra admins desde la lista de jugadores: un admin puede todo menos echar o tocar al dueño
// y a otros admins, y no nombra admins.
//   Jugadores: ir hasta él, traerlo, espectarlo, congelarlo, mutearlo (voz y chat), curarlo, inmortal, matarlo, echarlo,
//   hacerlo admin; en ⚙️: darle cosas o plata y cambiarle la velocidad, el salto y la gravedad.
//   Mundo: la hora (día, atardecer, noche), inmortalidad para todos, modo desmadre, la física de todos, limpiar la sala.
//   Objetos: aparecer cualquier objeto delante tuyo, o darte cualquier cosa en la mano.
//   NPC: agregar gente (parada, bailando o paseando), sacar al más cercano, reponer todo.
//   Ir a: los lugares del mapa (y el Búnker).
import * as THREE from 'three';
import { G } from '../core/G.js';
import { PROP_DEFS } from '../game/props.js';
import { MODELS } from '../char/human.js';
import { ACTIVITIES } from './activities.js';
import { CONSUMABLES } from '../shared/consumables.js';
import { RELICS } from '../shared/relics.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const V1 = new THREE.Vector3();
// lo que se puede tener en la mano (además de los objetos físicos)
const HAND = [
  ['beer', '🍺 Birra'], ['smoke', '🌿 Faso'], ['spray', '🎨 Aerosol'], ['cash', '💵 Dólares'], ['pistol', '🔫 Pistola'], ['grenade', '💣 Granada'],
  ['potion', '🧪 Poción'], ['chori', '🌭 Choripán'], ['apple', '🍎 Manzana'],
  ...Object.entries(CONSUMABLES).map(([k, c]) => [k, `${c.icon} ${c.label}`]),
  ...Object.entries(RELICS).map(([k, r]) => [k, `${r.icon} ${r.label}`]),
  ['lighter', '🔥 Encendedor'],
];
const PLACES = [
  ...ACTIVITIES.map((a) => ({ name: `${a.icon} ${a.name}`, p: [a.p[0], 0, a.p[2]] })),
  { name: '🕳️ Búnker: el club', p: [0, 0, -458] }, { name: '😈 Búnker: El Infierno', p: [0, 0, -490] },
  { name: '🍃 Búnker: coffeeshop', p: [-24, 0, -486] }, { name: '💗 Búnker: la VIP', p: [24, 0, -484] },
  { name: '🌀 Búnker: La Mente', p: [-36, 0, -462] }, { name: '🪖 Búnker: el Arsenal', p: [35, 0, -470] },
];
// presets de física (1 = normal): [valor, etiqueta]
const TUNE = {
  speed: [[0.5, '🐢 Lento'], [1, 'Normal'], [1.6, '🐇 x1.6'], [2.5, '⚡ x2.5']],
  jump: [[1, 'Normal'], [1.6, '🦘 x1.6'], [2.5, '🦘 x2.5']],
  grav: [[0.25, '🌙 Luna'], [0.5, '🪶 Liviana'], [1, 'Normal'], [1.8, '🪨 Pesada']],
};
const TUNE_LABEL = { speed: 'Velocidad', jump: 'Salto', grav: 'Gravedad' };
const NPC_MODELS = Object.entries(MODELS).filter(([, m]) => m.npc).map(([k, m]) => [k, m.label]);

export class AdminPanel {
  constructor({ getLocal, getNet, teleport, notify, giveItem, spawnProp, setMode, closeToGame, roleOf, npcs, spectate, unspectate }) {
    Object.assign(this, { getLocal, getNet, teleport, notify, giveItem, spawnProp, setMode, closeToGame, roleOf, npcs, spectate, unspectate });
    this.more = 0; // el jugador con el ⚙️ abierto
    this.tab = 'players';
    this.npcMode = 'idle';
    this.el = document.getElementById('admin');
    this.el.addEventListener('click', (e) => this._click(e));
    this.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'adm-key') this._login(); if (e.key !== 'Escape' && e.key !== 'F9') e.stopPropagation(); });
  }
  get level() { return this.roleOf(G.myId); }
  send(m) { this.getNet()?.send({ t: 'adm', ...m }); }
  open() { this.unspectate?.(); this.render(); this.setMode('admin'); }
  close() { this.closeToGame(); }
  isOpen() { return !this.el.classList.contains('hidden'); }

  // ---------------------------------------------------------------- dibujo
  render() {
    const lvl = this.level;
    if (!lvl) {
      this.el.innerHTML = `<h2>👑 Panel de admin</h2>
        <p class="adm-sub">Para administrar la sala poné la clave del dueño (no hace falta llamarse SmokePyro). Los admins los nombra el dueño desde este panel.</p>
        <div class="adm-login"><input id="adm-key" type="password" maxlength="64" autocomplete="off" placeholder="Clave del dueño"><button data-act="login" class="big">ENTRAR</button></div>
        <p id="adm-err" class="err"></p><p class="adm-foot"><b>F9</b> o <b>Esc</b> para volver</p>`;
      setTimeout(() => document.getElementById('adm-key')?.focus(), 30);
      return;
    }
    const tabs = [['players', '👥 Jugadores'], ['world', '🌍 Mundo'], ['props', '📦 Objetos'], ['npc', '🧍 NPC'], ['go', '📍 Ir a']];
    let body = '';
    if (this.tab === 'players') body = this._players(lvl);
    else if (this.tab === 'world') body = this._world();
    else if (this.tab === 'props') body = this._props();
    else if (this.tab === 'npc') body = this._npc();
    else body = this._go();
    this.el.innerHTML = `<h2>${lvl === 2 ? '👑 Dueño' : '🛡️ Admin'} · panel de la sala</h2>
      <div class="adm-tabs">${tabs.map(([k, t]) => `<button data-tab="${k}" class="${this.tab === k ? 'sel' : ''}">${t}</button>`).join('')}</div>
      <div class="adm-body">${body}</div><p class="adm-foot"><b>F9</b> o <b>Esc</b> para volver al juego</p>`;
  }
  _players(lvl) {
    const L = this.getLocal();
    const rows = [];
    const me = { id: G.myId, name: (L?.name || 'yo') + ' (vos)', self: true };
    for (const p of [me, ...G.players.values()]) {
      const r = this.roleOf(p.id), tag = r === 2 ? '<span class="adm-tag own">dueño</span>' : r === 1 ? '<span class="adm-tag">admin</span>' : '';
      const touch = p.self || lvl === 2 || r === 0;
      const b = (act, label, extra = '') => `<button data-act="${act}" data-id="${p.id}" ${extra}>${label}</button>`;
      const btns = [];
      if (!p.self) btns.push(b('goto', '📍 Ir'));
      if (touch && !p.self) btns.push(b('bring', '🧲 Traer'));
      const F = G.adminFlags?.get(p.id) || {};
      if (!p.self) btns.push(b('spec', '👁️ Espectar'));
      if (touch && !p.self) btns.push(F.frozen ? b('freeze', '🔥 Descongelar', 'class="sel" data-on="0"') : b('freeze', '🧊 Congelar', 'data-on="1"'));
      if (touch && !p.self) btns.push(F.muted ? b('mute', '🔊 Desmutear', 'class="sel" data-on="0"') : b('mute', '🔇 Mutear', 'data-on="1"'));
      if (touch) btns.push(b('heal', '❤️ Curar'), b('god', '😇 Inmortal'), b('mortal', '💀 Mortal'));
      if (touch && !p.self) btns.push(b('kill', '☠️ Matar'));
      if (touch) btns.push(b('more', this.more === p.id ? '⚙️ Cerrar' : '⚙️ Más', this.more === p.id ? 'class="sel"' : ''));
      if (!p.self && r < 2 && (lvl === 2 || r === 0)) btns.push(b('kick', '🥾 Echar', 'class="bad"'));
      if (lvl === 2 && !p.self && r < 2) btns.push(r === 1 ? b('unadmin', 'Sacar admin') : b('mkadmin', '🛡️ Hacer admin'));
      const flags = (F.frozen ? ' 🧊' : '') + (F.muted ? ' 🔇' : '') + (F.tune ? ' ⚙️' : '');
      rows.push(`<div class="adm-row"><span class="adm-name">${esc(p.name)} ${tag}${flags}</span><span class="adm-btns">${btns.join('')}</span></div>`);
      if (touch && this.more === p.id) rows.push(this._more(p.id, F.tune));
    }
    return rows.join('') || '<p class="adm-sub">No hay nadie más.</p>';
  }
  // ⚙️ de un jugador: darle cosas y cambiarle la física
  _more(id, tune) {
    const t = tune || {};
    const rows = Object.entries(TUNE).map(([k, opts]) => `<div class="adm-tune"><span>${TUNE_LABEL[k]}</span>${opts.map(([v, l]) =>
      `<button data-act="tune" data-id="${id}" data-k="${k}" data-v="${v}" class="${(t[k] ?? 1) === v ? 'sel' : ''}">${l}</button>`).join('')}</div>`).join('');
    const give = HAND.map(([k, l]) => `<button data-act="giveto" data-id="${id}" data-k="${k}">${esc(l)}</button>`).join('');
    return `<div class="adm-more">${rows}<h3>Darle en la mano</h3><div class="adm-chips">${give}</div></div>`;
  }
  _world() {
    const S = G.settings || {};
    const on = (v) => (v ? 'sel' : '');
    return `<div class="adm-group"><h3>Hora del día</h3><div class="adm-grid3">
        <button data-act="tod" data-v="0" class="${on(!S.tod)}">☀️ Día</button><button data-act="tod" data-v="0.5" class="${on(S.tod === 0.5)}">🌇 Atardecer</button><button data-act="tod" data-v="1" class="${on(S.tod === 1)}">🌙 Noche</button></div></div>
      <div class="adm-group"><h3>Reglas</h3><div class="adm-grid3">
        <button data-act="godAll" class="${on(S.godAll)}">😇 Inmortales todos: ${S.godAll ? 'SÍ' : 'NO'}</button>
        <button data-act="desmadre" class="${on(S.desmadre)}">☠ Modo desmadre: ${S.desmadre ? 'SÍ' : 'NO'}</button></div></div>
      <div class="adm-group"><h3>Física de todos</h3>${Object.entries(TUNE).map(([k, opts]) => `<div class="adm-tune"><span>${TUNE_LABEL[k]}</span>${opts.map(([v, l]) =>
        `<button data-act="settune" data-k="${k}" data-v="${v}" class="${on((S[k] ?? 1) === v)}">${l}</button>`).join('')}</div>`).join('')}
        <p class="adm-sub">Se multiplica con lo que le pongas a cada uno en ⚙️.</p></div>
      <div class="adm-group"><h3>Limpiar</h3><div class="adm-grid3">
        <button data-act="clean">🧹 Limpiar objetos, sangre y fuego</button><button data-act="cleanveh">🚜 …y devolver los vehículos</button></div>
        <p class="adm-sub">Lo tirado y lo aparecido se va; lo del mapa vuelve a su lugar.</p></div>`;
  }
  _props() {
    const phys = Object.entries(PROP_DEFS).filter(([k]) => !k.startsWith('held_'));
    return `<div class="adm-group"><h3>Aparecer delante tuyo</h3><div class="adm-chips">${phys.map(([k, d]) => `<button data-act="spawn" data-k="${k}">${esc(d.label)}</button>`).join('')}</div></div>
      <div class="adm-group"><h3>A tu mano</h3><div class="adm-chips">${HAND.map(([k, t]) => `<button data-act="give" data-k="${k}">${esc(t)}</button>`).join('')}</div></div>`;
  }
  _npc() {
    const m = this.npcMode;
    const extra = this.npcs?.all().length || 0;
    return `<div class="adm-group"><h3>Qué hace</h3><div class="adm-grid3">
        <button data-act="npcmode" data-v="idle" class="${m === 'idle' ? 'sel' : ''}">🧍 Parado</button><button data-act="npcmode" data-v="dance" class="${m === 'dance' ? 'sel' : ''}">💃 Bailando</button><button data-act="npcmode" data-v="walk" class="${m === 'walk' ? 'sel' : ''}">🚶 Paseando</button></div></div>
      <div class="adm-group"><h3>Agregar delante tuyo</h3><div class="adm-chips">${NPC_MODELS.map(([k, l]) => `<button data-act="npcadd" data-k="${k}">${esc(l)}</button>`).join('')}</div></div>
      <div class="adm-group"><h3>Sacar</h3><div class="adm-grid3">
        <button data-act="npchide">🫥 Sacar al más cercano</button><button data-act="npcreset" class="bad">↩️ Sacar los agregados y reponer todo</button></div>
        <p class="adm-sub">Agregados: ${extra}/24.</p></div>`;
  }
  _go() {
    return `<div class="adm-chips big">${PLACES.map((p, i) => `<button data-act="place" data-i="${i}">${esc(p.name)}</button>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- acciones
  _front(d = 2.2) {
    const L = this.getLocal();
    if (!L) return null;
    const yaw = L.yaw ?? 0;
    return new THREE.Vector3(L.pos.x + Math.sin(yaw) * d, L.pos.y, L.pos.z + Math.cos(yaw) * d);
  }
  _login() {
    const key = document.getElementById('adm-key')?.value;
    if (!key) return;
    const err = document.getElementById('adm-err'); if (err) err.textContent = 'Verificando...';
    this.send({ a: 'login', key });
  }
  denied(m) { const err = document.getElementById('adm-err'); if (err) err.textContent = m || 'Clave incorrecta.'; G.sfx?.trigger('ui-err', null, 0.6); }
  _click(e) {
    const b = e.target.closest('button');
    if (!b) return;
    G.sfx?.trigger('ui-select', null, 0.4);
    if (b.dataset.tab) { this.tab = b.dataset.tab; this.render(); return; }
    const act = b.dataset.act, id = Number(b.dataset.id), L = this.getLocal();
    const rp = G.players.get(id);
    switch (act) {
      case 'login': this._login(); return;
      case 'goto': if (rp?.pos) { this.teleport(rp.pos.clone().add(V1.set(1.2, 0, 0)), rp.yaw || 0); this.close(); } return;
      case 'bring': if (L) this.send({ a: 'tp', to: id, p: this._front(1.6).toArray(), yaw: (L.yaw || 0) + Math.PI }); this.notify('🧲 Lo trajiste.'); return;
      case 'spec': this.close(); this.spectate?.(id); return;
      case 'freeze': this.send({ a: 'freeze', to: id, on: b.dataset.on === '1' }); return;
      case 'mute': this.send({ a: 'mute', to: id, on: b.dataset.on === '1' }); return;
      case 'more': this.more = this.more === id ? 0 : id; this.render(); return;
      case 'giveto': this.send({ a: 'give', to: id, k: b.dataset.k }); this.notify(`🎁 Le diste ${esc(b.textContent)}.`); return;
      case 'tune': {
        const cur = { speed: 1, jump: 1, grav: 1, ...(G.adminFlags?.get(id)?.tune || {}) };
        cur[b.dataset.k] = Number(b.dataset.v);
        this.send({ a: 'tune', to: id, ...cur });
        return;
      }
      case 'settune': this.send({ a: 'set', k: b.dataset.k, v: Number(b.dataset.v) }); return;
      case 'heal': this.send({ a: 'heal', to: id }); return;
      case 'god': this.send({ a: 'god', to: id, on: true }); return;
      case 'mortal': this.send({ a: 'god', to: id, on: false }); return;
      case 'kill': this.send({ a: 'kill', to: id }); return;
      case 'kick': if (confirm(`¿Echar a ${rp?.name || 'ese jugador'} de la sala?`)) this.send({ a: 'kick', to: id }); return;
      case 'mkadmin': this.send({ a: 'admin', to: id, on: true }); return;
      case 'unadmin': this.send({ a: 'admin', to: id, on: false }); return;
      case 'tod': this.send({ a: 'set', k: 'tod', v: Number(b.dataset.v) }); return;
      case 'godAll': this.send({ a: 'set', k: 'godAll', v: !G.settings?.godAll }); return;
      case 'desmadre': this.send({ a: 'set', k: 'desmadre', v: !G.settings?.desmadre }); return;
      case 'clean': this.send({ a: 'clean' }); return;
      case 'cleanveh': this.send({ a: 'clean', veh: 1 }); return;
      case 'spawn': { const at = this._front(1.8); if (at) { at.y += 1.2; this.spawnProp(b.dataset.k, at); } return; }
      case 'give': this.giveItem(b.dataset.k); return;
      case 'npcmode': this.npcMode = b.dataset.v; this.render(); return;
      case 'npcadd': {
        const at = this._front(2.4);
        if (!at) return;
        const label = MODELS[b.dataset.k]?.label || 'Extra';
        this.send({ a: 'npc', op: 'add', model: b.dataset.k, name: label, p: at.toArray(), yaw: (L.yaw || 0) + Math.PI, mode: this.npcMode });
        setTimeout(() => this.isOpen() && this.render(), 400);
        return;
      }
      case 'npchide': {
        // el más cercano: uno de los agregados (se borra) o uno del mapa (se esconde para todos)
        let best = null, bd = 100;
        for (const n of G.allNpcs?.() || []) { if (n.hidden || n.dead) continue; const d = n.pos.distanceToSquared(L.pos); if (d < bd) { bd = d; best = n; } }
        if (!best) { this.notify('No hay ningún NPC a menos de 10 m.'); return; }
        if (best.adminId) this.send({ a: 'npc', op: 'del', id: best.adminId });
        else this.send({ a: 'npc', op: 'hide', name: best.name });
        setTimeout(() => this.isOpen() && this.render(), 400);
        return;
      }
      case 'npcreset': this.send({ a: 'npc', op: 'reset' }); return;
      case 'place': { const P = PLACES[Number(b.dataset.i)]; if (P) { this.teleport(new THREE.Vector3(...P.p), 0); this.close(); } return; }
    }
  }
}

