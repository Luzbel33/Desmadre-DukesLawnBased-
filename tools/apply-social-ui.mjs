import fs from 'node:fs';
function edit(file,before,after){const raw=fs.readFileSync(file,'utf8'),eol=raw.includes('\r\n')?'\r\n':'\n',src=raw.replace(/\r\n/g,'\n');if(src.includes(after))return;if(src.split(before).length!==2)throw new Error('Missing/ambiguous UI patch '+file+': '+before.slice(0,100));fs.writeFileSync(file,src.replace(before,()=>after).replace(/\n/g,eol));}
function region(file,start,end,replacement,marker){const src=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');if(src.includes(marker))return;const a=src.indexOf(start),b=src.indexOf(end,a+start.length);if(a<0||b<0||src.indexOf(start,a+1)>=0)throw new Error('Missing UI region '+file);edit(file,src.slice(a,b),replacement);}
const main='public/js/main.js',human='public/js/char/human.js';
edit(main, "function addChat(text, opts = {}) {", "let socialUI = null;\nfunction getSocialUI() {\n  return socialUI || (socialUI = new SocialPanel({ getPlayers: () => G.players, getMyId: () => G.myId, getVoice: () => G.voice, onClose: () => closeChat(true) }));\n}\nfunction addChat(text, opts = {}) {");
region(main, 'function addChat(text, opts = {}) {', '\nfunction killfeed(text)', `function addChat(text, opts = {}) {
  getSocialUI().system(text, opts);
}
`, '  getSocialUI().system(text, opts);');
edit(main, "import * as THREE from 'three';", "import * as THREE from 'three';\nimport { SocialPanel, setupMaskPicker, enhanceMedia } from './ui/social.js';");
edit(main, "    if (saved && MODELS[saved.model] && !MODELS[saved.model].npc) selectedLook.model = saved.model;", "    if (saved && MODELS[saved.model] && !MODELS[saved.model].npc) selectedLook.model = saved.model;\n    if (saved && ['none', 'bull', 'horse', 'lion', 'cat', 'rabbit'].includes(saved.mask)) selectedLook.mask = saved.mask;");
edit(main, '      selectedLook.model = b.dataset.model;', '      selectedLook.model = b.dataset.model;\n      setupMaskPicker(selectedLook);');
edit(main, "  });\n}\n\n// ---------------------------------------------------------------- el dueño", "  });\n  setupMaskPicker(selectedLook);\n}\n\n// ---------------------------------------------------------------- el dueño");
edit(main, '  selectedLook.model = model;', '  selectedLook.model = model;\n  setupMaskPicker(selectedLook);');
edit(main, "    ...selectedLook,\n    hat: 'none',", "    ...selectedLook,\n    mask: selectedLook.model === 'diablo' ? 'none' : (selectedLook.mask || 'none'),\n    hat: 'none',");
edit(main, "  $('chat').classList.add('open');\n  $('chat-input').value = '';", "  getSocialUI().renderRoster();\n  G.voice?.setPTT(false);\n  $('chat').classList.add('open');\n  getSocialUI().bottom();");
region(main, 'function sendChat() {', '\n// Ir a otro lado de una', `function sendChat() {
  const input = $('chat-input'), text = input.value.trim(), to = getSocialUI().recipients();
  if (text && to !== null && !to.length) {
    addChat('Elegí al menos un jugador conectado para susurrar.', { sys: true }); return;
  }
  // Private messages must not trigger public bubbles or the doorman password shortcut.
  if (text && to === null && state.local && G.club?.nearDoorman(state.local.pos) && text.length < 30 && !text.startsWith('/')) {
    ownBubble(text); G.club.tryPassword(text); input.value = ''; closeChat(true); return;
  }
  if (text) {
    state.net.send({ t: 'chat', m: text, ...(to === null ? {} : { to }) });
    input.value = '';
  }
  closeChat(true);
}
`, '  // Private messages must not trigger public bubbles');
edit(main, "  const el = $('players-list'); el.innerHTML = '';", "  socialUI?.renderRoster();\n  const el = $('players-list'); el.innerHTML = '';");
edit(main, "    G.voice?.connectAll((m.players || []).map((p) => p.id));", "    if (G.voice) for (const id of [...G.voice.peers.keys()]) G.voice.remove(id);\n    getSocialUI().begin(m.room, $('m-name').value.trim(), m.chatHistory || []);\n    G.voice?.connectAll((m.players || []).map((p) => p.id));");
region(main, "  net.on('chat', (m) =>", "  net.on('sys',", `  net.on('chat', (m) => {
    if (!getSocialUI().receive(m) || m.to) return;
    if (m.id === G.myId) ownBubble(m.m); else chatBubble(m.id, m.m);
  });
`, "    if (!getSocialUI().receive(m) || m.to) return;");
edit(main, 'function updateMicUI() {', 'function updateMicUI() {\n  socialUI?.renderVoice();');
edit(main, "    G.inGame = false; G.input.enabled = false; G.sfx?.stop(); G.media?.stop();", "    G.inGame = false; G.input.enabled = false; G.sfx?.stop(); G.media?.stop();\n    G.voice?.disableMic();");
edit(main, "function openMedia(screen) {", "function openMedia(screen) {\n  enhanceMedia({ getState: () => mediaState(state.mediaScreen), getNow: () => state.net.now(), send: m => state.net.send(m), getScreen: () => state.mediaScreen });");
edit(main, "    const b = document.createElement('button'); b.textContent = '×';", "    const b = document.createElement('button'); b.textContent = '×';\n    b.title = 'Quitar de la cola'; b.setAttribute('aria-label', 'Quitar ' + (it.title || it.v) + ' de la cola');");
edit(main, "  $('media-retry').classList.toggle('hidden', !info.error);", "  $('media-retry').classList.toggle('hidden', !info.error);\n  $('media-unlock').classList.toggle('hidden', !!info.ready && !info.blocked && !info.error);");
edit(human, '    this.wearMask(MODELS[this.modelKey].mask);', "    this.wearMask(MODELS[this.modelKey].devil ? null : (MODELS[this.modelKey].mask || this.look.mask));");
edit(human, "    if (!type || !MASK_CACHE.has(type) || !this.headAnchor) return false;\n    this.mask?.removeFromParent();", `    if (!this.headAnchor) return false;
    const request = this._maskRequest = (this._maskRequest || 0) + 1;
    const anchor = this.headAnchor;
    this.mask?.removeFromParent(); this.mask = null;
    this.material.userData.u.uMask.value = 0;
    if (!type || type === 'none' || MODELS[this.modelKey]?.devil || !Object.prototype.hasOwnProperty.call(MASK_FILES, type)) return false;
    if (!MASK_CACHE.has(type)) {
      loadMask(type).then(() => {
        if (this._maskRequest === request && this.headAnchor === anchor) this.wearMask(type);
      }).catch(error => console.warn('No se pudo cargar la máscara', type, error));
      return false;
    }`);
edit('package.json', './tests/characters.test.mjs"', './tests/characters.test.mjs ./tests/social-regressions.test.mjs"');
