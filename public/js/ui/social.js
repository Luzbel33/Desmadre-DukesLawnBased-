// Chat history and audience controls. No private payload is rendered as a world bubble.
const MAX_MESSAGES = 500;
const MASKS = { none: 'Sin máscara', bull: 'Toro', horse: 'Caballo', lion: 'León', cat: 'Gato', rabbit: 'Conejo' };
const color = value => /^#[\da-f]{6}$/i.test(value || '') ? value : '#ffffff';
function node(tag, text, className) { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; }
function installStyles() {
  if (document.getElementById('social-styles')) return;
  const style = node('style'); style.id = 'social-styles';
  style.textContent = `
#chat{width:min(520px,calc(100vw - 32px));max-width:none}
#chat-log{max-height:170px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
#chat.open{background:rgba(13,15,20,.96);border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:12px;max-height:calc(100dvh - 125px);overflow-y:auto;pointer-events:auto}
#chat.open #chat-log{height:clamp(120px,32vh,330px);max-height:330px;padding:5px 2px}
#chat .msg{overflow-wrap:anywhere;margin:5px 0;white-space:pre-wrap}
#chat .msg.old{opacity:1}
#chat:not(.open) #chat-log .msg:not(:nth-last-child(-n+5)){display:none}
#chat .msg time{font-size:10px;opacity:.6;margin-right:7px;font-variant-numeric:tabular-nums}
#chat .msg b{margin-right:8px}#chat .msg.whisper{border-left:2px solid #cdaeff;padding-left:8px}
.chat-top{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px}
.chat-top button{font:inherit;padding:5px 8px;cursor:pointer}
.chat-controls{display:none;gap:9px;padding-bottom:9px;border-bottom:1px solid rgba(255,255,255,.15)}
#chat.open .chat-controls{display:grid}.chat-modes{display:flex;gap:10px;flex-wrap:wrap}
.chat-modes label{display:grid;gap:4px;font-size:11px;flex:1;min-width:120px}
.chat-modes select{min-height:32px;max-width:100%;font:inherit;color:inherit;background:#252832;border:1px solid #666;border-radius:5px;padding:5px}
.chat-roster{display:flex;gap:6px;flex-wrap:wrap;max-height:110px;overflow-y:auto}
.chat-roster label{display:flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid #626775;border-radius:5px;font-size:12px;cursor:pointer}
.chat-roster input{width:auto!important;display:inline-block!important}.chat-roster label:has(input:checked){border-color:#e4bd62;background:#483c26}
.chat-status{font-size:11px;line-height:1.4;margin:0;white-space:normal}.chat-status.error{color:#ffb6ad}
#chat-input{width:100%;box-sizing:border-box;min-height:38px;margin-top:8px!important}
#chat-new{display:none;width:100%;padding:6px;font-size:12px;cursor:pointer}#chat.open #chat-new.has-new{display:block}
#chat-summary{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
#chat:not(.open) .chat-top{opacity:.8;pointer-events:none}#chat:not(.open) #chat-close{display:none}
.mask-picker{display:grid;gap:6px;margin-top:10px;font-size:12px}.mask-picker select{min-height:38px;padding:7px;color:inherit;background:#242830;border:1px solid #777;border-radius:6px}.mask-picker small{opacity:.75}
#media{width:min(1000px,calc(100vw - 28px));max-height:calc(100dvh - 28px);overflow:auto;overscroll-behavior:contain}
#media-view{aspect-ratio:16/9!important;width:100%!important;height:auto!important;min-height:0!important;position:relative}
#media button,#media select{min-height:36px}#media-now{overflow-wrap:anywhere;line-height:1.5}
#media-status{line-height:1.5;font-size:12px;min-height:1.5em}#media-queue{max-height:160px;overflow-y:auto;padding-right:4px}
#media-queue li{display:flex;align-items:center;justify-content:space-between;gap:10px;overflow-wrap:anywhere;padding:8px 5px}
#media-queue button{flex:0 0 36px}.media-progress{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;margin:10px 0;font-variant-numeric:tabular-nums;font-size:12px}.media-progress input{width:100%;min-width:60px;cursor:pointer}
@media(max-width:600px){#chat.open{max-height:calc(100dvh - 100px)}#chat.open #chat-log{height:25vh}#media{padding:12px!important}.chat-modes{gap:6px}}
`;
  document.head.append(style);
}

export class SocialPanel {
  constructor({ getPlayers, getMyId, getVoice, onClose }) {
    installStyles();
    Object.assign(this, { getPlayers, getMyId, getVoice });
    this.log = document.getElementById('chat-log'); this.root = document.getElementById('chat');
    this.messages = []; this.ids = new Set(); this.selected = new Set(); this.key = null; this.unread = 0;
    const top = node('div', '', 'chat-top'); this.summary = node('span', 'Chat · T / Enter para abrir'); this.summary.id = 'chat-summary';
    const close = node('button', 'Cerrar · Esc'); close.id = 'chat-close'; close.type = 'button'; close.onclick = onClose;
    top.append(this.summary, close); this.root.prepend(top);
    const controls = node('div', '', 'chat-controls'), modes = node('div', '', 'chat-modes');
    const mode = (title, values, id) => {
      const label = node('label', title), select = node('select'); select.id = id;
      for (const [value, text] of values) { const option = node('option', text); option.value = value; select.append(option); }
      label.append(select); modes.append(label); return select;
    };
    this.textMode = mode('Texto', [['public', 'Toda la sala'], ['private', 'Susurro a seleccionados']], 'chat-text-mode');
    this.voiceMode = mode('Quién escucha tu micrófono', [['public', 'Proximidad'], ['private', 'Sólo seleccionados']], 'chat-voice-mode');
    this.roster = node('div', '', 'chat-roster'); this.roster.setAttribute('aria-label', 'Destinatarios del susurro');
    this.status = node('p', '', 'chat-status'); this.status.setAttribute('aria-live', 'polite');
    this.mic = node('button', 'Activar micrófono'); this.mic.type = 'button'; this.mic.onclick = () => { this.getVoice()?.getCtx()?.resume?.(); this.getVoice()?.toggleMic(); this.renderVoice(); };
    controls.append(modes, this.roster, this.mic, this.status); top.after(controls);
    this.newButton = node('button', 'Ir a mensajes nuevos'); this.newButton.type = 'button'; this.newButton.id = 'chat-new'; this.log.after(this.newButton);
    this.newButton.onclick = () => this.bottom();
    this.log.setAttribute('role', 'log'); this.log.setAttribute('aria-label', 'Historial de chat'); this.log.setAttribute('aria-live', 'polite');
    this.log.addEventListener('scroll', () => { if (this.atBottom()) { this.unread = 0; this.newButton.classList.remove('has-new'); } });
    this.textMode.onchange = this.voiceMode.onchange = () => { this.applyAudience(); this.renderRoster(); };
    this.renderRoster();
  }
  atBottom() { return this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 35; }
  bottom() { this.log.scrollTop = this.log.scrollHeight; this.unread = 0; this.newButton.classList.remove('has-new'); }
  begin(room, name, history = []) {
    const key = 'dukes.chat.v1:' + room + ':' + name;
    if (this.key !== key) {
      this.key = key; this.messages = []; this.ids.clear(); this.log.replaceChildren();
      try { const saved = JSON.parse(sessionStorage.getItem(key) || '[]'); if (Array.isArray(saved)) for (const msg of saved.slice(-MAX_MESSAGES)) this.receive(msg, false); } catch {}
    }
    this.selected.clear(); // IDs belong to this connection; do not accidentally address a reused ID.
    this.applyAudience();
    for (const msg of history) if (!msg.to) this.receive(msg, false);
    this.renderRoster(); this.bottom(); this.persist();
  }
  persist() { if (this.key) try { sessionStorage.setItem(this.key, JSON.stringify(this.messages.slice(-MAX_MESSAGES))); } catch {} }
  append(el, message, save = true) {
    const follow = this.atBottom() || !this.root.classList.contains('open');
    const oldHeight = this.log.scrollHeight;
    this.log.append(el); this.messages.push(message);
    while (this.messages.length > MAX_MESSAGES) { const removed = this.messages.shift(); if (removed.mid) this.ids.delete(removed.mid); this.log.firstElementChild?.remove(); }
    if (follow) this.bottom();
    else { this.unread++; this.newButton.textContent = this.unread + ' mensajes nuevos · bajar'; this.newButton.classList.add('has-new'); if (this.messages.length === MAX_MESSAGES && this.log.scrollHeight < oldHeight) this.log.scrollTop += this.log.scrollHeight - oldHeight; }
    if (save) this.persist();
  }
  receive(message, save = true) {
    if (!message || typeof message.m !== 'string') return false;
    if (message.mid && this.ids.has(message.mid)) return false;
    if (message.mid) this.ids.add(message.mid);
    const el = node('div', '', 'msg' + (message.to ? ' whisper' : '') + (message.sys ? ' sys' : ''));
    if (Number.isFinite(message.ts)) { const time = node('time', new Date(message.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); time.dateTime = new Date(message.ts).toISOString(); el.append(time); }
    if (message.name) { const name = node('b', message.name); name.style.color = color(message.c); el.append(name); }
    if (message.to) {
      const destinations = (message.recipients || []).map(p => p.name).join(', ');
      el.append(node('small', '[Susurro' + (destinations ? ' → ' + destinations : '') + '] '));
    }
    el.append(document.createTextNode(message.m));
    this.append(el, message, save); return true;
  }
  system(text, opts = {}) {
    const el = node('div', '', 'msg' + (opts.sys ? ' sys' : ''));
    if (opts.html) el.innerHTML = opts.html; else el.textContent = text;
    if (opts.color) el.style.color = color(opts.color);
    this.append(el, { m: el.textContent, sys: true, ts: Date.now() });
  }
  recipients() { return this.textMode.value === 'private' ? [...this.selected].filter(id => this.getPlayers().has(id)) : null; }
  applyAudience() {
    this.getVoice()?.setRecipients(this.voiceMode.value === 'private' ? [...this.selected] : null);
    this.renderVoice();
  }
  renderRoster() {
    const players = this.getPlayers();
    for (const id of this.selected) if (!players.has(id)) this.selected.delete(id);
    this.roster.replaceChildren();
    const privateMode = this.textMode.value === 'private' || this.voiceMode.value === 'private';
    this.roster.hidden = !privateMode;
    if (privateMode) {
      if (!players.size) this.roster.append(node('span', 'Todavía no hay otros jugadores. El susurro queda sin destinatarios.'));
      for (const player of players.values()) {
        const label = node('label'), check = node('input'); check.type = 'checkbox'; check.value = String(player.id); check.checked = this.selected.has(player.id);
        check.onchange = () => { if (check.checked) this.selected.add(player.id); else this.selected.delete(player.id); this.applyAudience(); };
        label.append(check, document.createTextNode(player.name)); this.roster.append(label);
      }
    }
    this.applyAudience();
  }
  renderVoice() {
    const voice = this.getVoice(), n = this.selected.size;
    this.summary.textContent = (this.textMode.value === 'private' ? 'Susurro: ' + n + ' destinatarios' : 'Chat: toda la sala') + ' · Voz: ' + (this.voiceMode.value === 'private' ? n + ' seleccionados' : 'proximidad');
    this.mic.textContent = voice?.micRequest ? 'Cancelar permiso de micrófono' : voice?.enabled ? 'Silenciar micrófono' : 'Activar micrófono';
    this.status.textContent = voice?.error || (voice?.enabled ? (voice.opts.voiceMode === 'open' ? 'Micrófono abierto.' : 'Mantené V para hablar.') : 'Micrófono apagado.') + (this.voiceMode.value === 'private' ? (n ? ' Sólo reciben audio los jugadores seleccionados.' : ' Nadie recibe tu voz hasta que elijas destinatarios.') : ' La voz se escucha por cercanía.');
    this.status.classList.toggle('error', !!voice?.error);
  }
}

export function setupMaskPicker(look) {
  installStyles();
  let select = document.getElementById('m-mask');
  if (!select) {
    const label = node('label', 'Máscara', 'mask-picker'); select = node('select'); select.id = 'm-mask';
    for (const [key, text] of Object.entries(MASKS)) { const option = node('option', text); option.value = key; select.append(option); }
    const hint = node('small', 'Las máscaras de las bailarinas · no disponibles para el demonio'); label.append(select, hint); document.getElementById('m-models').after(label);
    select.onchange = () => { look.mask = select.value; };
  }
  select.disabled = look.model === 'diablo';
  select.value = look.model === 'diablo' ? 'none' : (MASKS[look.mask] ? look.mask : 'none');
}

export function enhanceMedia({ getState, getNow, send, getScreen }) {
  installStyles();
  if (document.getElementById('media-seek')) return;
  const row = node('div', '', 'media-progress'), elapsed = node('span', '0:00'), slider = node('input'), duration = node('span', '0:00');
  slider.type = 'range'; slider.id = 'media-seek'; slider.min = '0'; slider.max = '1'; slider.step = '1'; slider.setAttribute('aria-label', 'Posición del video para la sala');
  row.append(elapsed, slider, duration); document.getElementById('media-view').after(row);
  const time = value => { const n = Math.max(0, Math.floor(value || 0)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); };
  let dragging = false, dragScreen = '', dragPlayId = '';
  const start = () => { dragging = true; dragScreen = getScreen(); dragPlayId = getState()?.cur?.playId; };
  slider.addEventListener('pointerdown', start); slider.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) start(); });
  slider.addEventListener('input', () => { elapsed.textContent = time(+slider.value); });
  slider.addEventListener('change', () => {
    if (dragging && getScreen() === dragScreen && getState()?.cur?.playId === dragPlayId) send({ t: 'media', s: dragScreen, a: 'seek', pos: +slider.value });
    dragging = false;
  });
  slider.addEventListener('pointercancel', () => { dragging = false; });
  window.addEventListener('pointerup', () => { setTimeout(() => { dragging = false; }, 0); });
  setInterval(() => {
    if (document.getElementById('media').classList.contains('hidden') || dragging) return;
    const cur = getState()?.cur, d = Math.max(0, cur?.d || 0);
    const pos = cur ? (cur.paused ? cur.pos || 0 : Math.max(0, (getNow() - cur.start) / 1000)) : 0;
    slider.disabled = !cur || !d; slider.max = String(d || 1); slider.value = String(Math.min(d, pos)); elapsed.textContent = time(pos); duration.textContent = d ? time(d) : '--:--';
  }, 300);
}
