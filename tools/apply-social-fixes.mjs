// Temporary exact-match patch runner; removed before integration.
import fs from 'node:fs';
export function edit(file, before, after) {
  const raw = fs.readFileSync(file, 'utf8'), eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const src = raw.replace(/\r\n/g, '\n');
  if (src.includes(after)) return;
  if (src.split(before).length !== 2) throw new Error(`Ambiguous/missing patch in ${file}: ${before.slice(0, 100)}`);
  fs.writeFileSync(file, src.replace(before, () => after).replace(/\n/g, eol));
}
export function region(file, start, end, replacement, marker) {
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (src.includes(marker)) return;
  const a = src.indexOf(start), b = src.indexOf(end, a + start.length);
  if (a < 0 || b < 0 || src.indexOf(start, a + 1) !== -1) throw new Error(`Missing region in ${file}: ${start}`);
  edit(file, src.slice(a, b), replacement);
}
const room = 'server/room.js', voice = 'public/js/audio/voice.js', player = 'public/js/game/player.js';
edit(room, '    this.nextId = 1;', '    this.nextId = 1;\n    this.chatHistory = [];\n    this.chatSequence = 0;\n    this.chatEpoch = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);');
edit(room, '      players, props, vehicles, media, settings: this.settings, gtick: this.grass.tick,', '      players, props, vehicles, media, settings: this.settings, gtick: this.grass.tick,\n      chatHistory: this.chatHistory,');
edit(room, "    if (m.startsWith('/dados')) {", `    // A private audience is explicit: invalid/empty lists never fall back to public.
    if (Object.prototype.hasOwnProperty.call(msg, 'to')) {
      const to = Array.isArray(msg.to) ? [...new Set(msg.to.filter(id => Number.isSafeInteger(id) && id !== p.id && this.players.get(id)?.ready))].slice(0, MAX_PLAYERS) : [];
      if (!to.length) { this.send(p, { t: 'sys', m: 'No se envió el susurro: elegí al menos un jugador conectado.' }); return; }
      const packet = this._chatPacket(p, m, now);
      packet.to = to;
      packet.recipients = to.map(id => ({ id, name: this.players.get(id).name }));
      this.send(p, packet);
      for (const id of to) this.send(this.players.get(id), packet);
      return;
    }
    if (m.startsWith('/dados')) {`);
edit(room, "    this.broadcast({ t: 'chat', id: p.id, m }, p);", `    const packet = this._chatPacket(p, m, now);
    this.chatHistory.push(packet);
    if (this.chatHistory.length > 200) this.chatHistory.splice(0, this.chatHistory.length - 200);
    this.broadcast(packet); // Sender acknowledgement avoids optimistic duplicates.
  }

  _chatPacket(p, m, ts) {
    this.chatSequence = (this.chatSequence || 0) + 1;
    return { t: 'chat', id: p.id, name: p.name, c: p.color, m, ts, mid: (this.chatEpoch || 'session') + ':' + this.chatSequence };`);
edit(room, "    body: ['normal', 'gordo', 'flaco'].includes(l.body) ? l.body : 'normal',", "    body: ['normal', 'gordo', 'flaco'].includes(l.body) ? l.body : 'normal',\n    mask: l.model !== 'diablo' && ['bull', 'horse', 'lion', 'cat', 'rabbit'].includes(l.mask) ? l.mask : 'none',");

edit(voice, '    this.bus = null;', '    this.bus = null;\n    this.recipients = null; // null = public; an empty Set is a silent private channel.\n    this.disposed = false;\n    this.micEpoch = 0;\n    this.micRequest = null;');
region(voice, '  async enableMic() {', '  // ---------------------------------------------------------------- pares', `  async enableMic() {
    if (this.disposed) return false;
    if (this.enabled && this.track?.readyState === 'live') return true;
    if (this.micRequest) return this.micRequest;
    const media = globalThis.navigator?.mediaDevices;
    if (!media?.getUserMedia) {
      this.error = globalThis.isSecureContext ? 'Tu navegador no permite micrófono' : 'El micrófono necesita HTTPS o localhost';
      this.onState(); return false;
    }
    const epoch = ++this.micEpoch;
    this.error = ''; this.onState();
    this.micRequest = (async () => {
      let stream;
      try {
        stream = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false });
        if (this.disposed || epoch !== this.micEpoch) { stream.getTracks().forEach(t => t.stop()); return false; }
        const track = stream.getAudioTracks()[0];
        if (!track || track.readyState === 'ended') throw new Error('missing audio track');
        this.stream?.getTracks().forEach(t => t.stop());
        this.mySource?.disconnect(); this.myAnalyser?.disconnect();
        this.mySource = null; this.myAnalyser = null;
        this.stream = stream; this.track = track; this.enabled = true; this.error = '';
        track.addEventListener?.('ended', () => {
          if (this.track !== track || this.disposed) return;
          this.disableMic(); this.error = 'Se desconectó el micrófono. Volvé a activarlo para reintentar.'; this.onState();
        }, { once: true });
        this._applyTrackEnabled(); this._ensureLocalMeter();
        await Promise.all([...this.peers.values()].map(peer => this._attachTrack(peer)));
        return true;
      } catch (e) {
        stream?.getTracks().forEach(t => t.stop());
        if (epoch === this.micEpoch && !this.disposed) {
          this.error = e?.name === 'NotAllowedError' ? 'Permiso de micrófono denegado: habilitalo en el navegador y reintentá.' : e?.name === 'NotReadableError' ? 'El micrófono está ocupado por otra aplicación.' : 'No se encontró un micrófono disponible.';
          this.enabled = false; this._applyTrackEnabled();
        }
        return false;
      } finally { this.micRequest = null; if (!this.disposed) this.onState(); }
    })();
    return this.micRequest;
  }

  _ensureLocalMeter() {
    const ctx = this._ensureBus();
    if (!ctx || !this.stream || this.mySource?.context === ctx) return;
    this.mySource?.disconnect(); this.myAnalyser?.disconnect();
    this.mySource = ctx.createMediaStreamSource(this.stream);
    this.myAnalyser = ctx.createAnalyser(); this.myAnalyser.fftSize = 512;
    this.mySource.connect(this.myAnalyser);
    this._buf = new Uint8Array(this.myAnalyser.fftSize);
  }

  disableMic() {
    ++this.micEpoch;
    this.enabled = false; this.level = 0;
    this._applyTrackEnabled(); this.onState();
  }

  toggleMic() {
    if (this.enabled || this.micRequest) this.disableMic();
    else if (this.track?.readyState === 'live') { this.enabled = true; this.error = ''; this._applyTrackEnabled(); this.onState(); }
    else void this.enableMic();
  }

  setPTT(down) {
    if (this.ptt === down) return;
    this.ptt = down;
    if (down && (!this.track || this.track.readyState === 'ended')) void this.enableMic();
    this._applyTrackEnabled(); this.onState();
  }

  setRecipients(ids) {
    this.recipients = ids === null ? null : new Set(Array.isArray(ids) ? ids.filter(id => Number.isSafeInteger(id) && id > 0) : []);
    // Gate actual outgoing tracks, not just the receivers' speaker volumes.
    this._applyTrackEnabled(); this.onState();
  }

  _applyTrackEnabled() {
    if (this.track) this.track.enabled = this.transmitting;
    for (const peer of this.peers.values()) if (peer.outboundTrack) peer.outboundTrack.enabled = this.transmitting && (this.recipients === null || this.recipients.has(peer.id));
  }

  async _attachTrack(peer) {
    if (!this.track || !peer.sender || this.disposed) return;
    if (peer.sourceTrack === this.track && peer.outboundTrack?.readyState !== 'ended') { this._applyTrackEnabled(); return; }
    peer.outboundTrack?.stop();
    const track = this.track.clone();
    track.enabled = this.transmitting && (this.recipients === null || this.recipients.has(peer.id));
    peer.outboundTrack = track; peer.sourceTrack = this.track;
    try { await peer.sender.replaceTrack(track); }
    catch (e) { track.enabled = false; track.stop(); this.error = 'No se pudo enviar el micrófono a un jugador. Reintentá activar el micrófono.'; this.onState(); }
  }

`, '  setRecipients(ids) {');
edit(voice, '    if (!d) return;\n    let peer = this.peers.get(from);', '    if (!d || this.disposed) return;\n    let peer = this.peers.get(from);');
edit(voice, '    } else if (d.c && peer) {\n      if (!peer.remoteSet) peer.pending.push(d.c);', '    } else if (d.c) {\n      if (!peer) peer = this._peer(from, false);\n      if (!peer.remoteSet) { if (peer.pending.length < 128) peer.pending.push(d.c); }');
edit(voice, "    if (peer.nodes) { try { peer.nodes.src.disconnect(); peer.nodes.panner.disconnect(); } catch { /* */ } }", "    peer.outboundTrack?.stop();\n    if (peer.nodes) for (const node of [peer.nodes.src, peer.nodes.analyser, peer.nodes.gain, peer.nodes.panner]) { try { node.disconnect(); } catch { /* */ } }");
edit(voice, '    this.peers.delete(id);', '    this.peers.delete(id);\n    this.recipients?.delete(id); // Keep a private channel private when its last recipient leaves.\n    this._applyTrackEnabled();');
edit(voice, '    this._ensureBus();\n    this.bus.gain.value', '    this._ensureBus();\n    this._ensureLocalMeter();\n    this.bus.gain.value');
edit(voice, '  dispose() {', '  dispose() {\n    this.disposed = true; ++this.micEpoch;\n    this.enabled = false; this._applyTrackEnabled();\n    this.mySource?.disconnect(); this.myAnalyser?.disconnect(); this.bus?.disconnect();');

edit(player, '  applyState(st, immediate = false, ts = 0) {\n    if (!st) return;', `  applyState(st, immediate = false, ts = 0) {
    if (!st) return;
    // Reject malformed poses before changing ANY visible, collision or gore state.
    if (st.p !== undefined && (!Array.isArray(st.p) || st.p.length !== 3 || !st.p.every(Number.isFinite))) return;
    if (st.rb !== undefined) {
      if (!Array.isArray(st.rb) || st.rb.length !== 77 || !st.rb.every(Number.isFinite)) return;
      for (let i = 0; i < 77; i += 7) if (Math.hypot(...st.rb.slice(i + 3, i + 7)) < 0.001) return;
      const receivedAt = ts || G.net?.now?.() || performance.now();
      if (this.buf.length && receivedAt <= this.buf[this.buf.length - 1].t) return;
    }`);
edit('scripts/test-network.mjs', '/AUDIO \\+ YOUTUBE/', '/id="media"/');

// Extra stages may be added independently while the branch remains isolated.
for (const name of ['apply-social-ui.mjs', 'apply-body-fixes.mjs', 'apply-final-fixes.mjs']) {
  if (fs.existsSync(new URL(name, import.meta.url))) await import(new URL(name, import.meta.url));
}
