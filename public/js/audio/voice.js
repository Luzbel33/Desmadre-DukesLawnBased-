// Chat de voz por proximidad: WebRTC (audio P2P entre jugadores) + audio 3D (PannerNode HRTF).
// La señalización viaja por el WebSocket del juego (mensajes 'rtc'). El que entra último inicia la llamada.
import { zoneAt } from '../shared/mapdata.js';

const ICE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // TURN público de respaldo (para redes muy cerradas; si no responde, se ignora)
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'], username: 'openrelayproject', credential: 'openrelayproject' },
];
const INTERIOR = new Set(['bar', 'cine', 'mansion', 'galpon']);

export class VoiceChat {
  constructor({ net, opts, getCtx, onState }) {
    this.net = net;
    this.opts = opts;
    this.getCtx = getCtx; // () => AudioContext (el del motor de sonido)
    this.onState = onState || (() => {});
    this.peers = new Map();
    this.stream = null;
    this.track = null;
    this.enabled = false; // micrófono permitido y activo
    this.ptt = false; // tecla V apretada
    this.level = 0; // nivel propio (0..1)
    this.error = '';
    this.bus = null;
  }

  get transmitting() {
    return this.enabled && (this.opts.voiceMode === 'open' || this.ptt);
  }

  _ensureBus() {
    const ctx = this.getCtx();
    if (!ctx) return null;
    if (!this.bus || this.bus.context !== ctx) {
      this.bus = ctx.createGain();
      this.bus.gain.value = this.opts.volVoice ?? 1;
      this.bus.connect(ctx.destination);
    }
    return ctx;
  }

  // ---------------------------------------------------------------- micrófono
  async enableMic() {
    if (this.enabled) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error = window.isSecureContext ? 'Tu navegador no permite micrófono' : 'El micrófono necesita https (usá el link de ngrok o localhost)';
      this.onState();
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        video: false,
      });
    } catch (e) {
      this.error = e?.name === 'NotAllowedError' ? 'Permiso de micrófono denegado' : 'No se encontró micrófono';
      this.onState();
      return false;
    }
    this.track = this.stream.getAudioTracks()[0];
    this.enabled = true;
    this.error = '';
    this._applyTrackEnabled();
    // medidor propio
    const ctx = this._ensureBus();
    if (ctx) {
      const src = ctx.createMediaStreamSource(this.stream);
      this.myAnalyser = ctx.createAnalyser();
      this.myAnalyser.fftSize = 512;
      src.connect(this.myAnalyser);
      this._buf = new Uint8Array(this.myAnalyser.fftSize);
    }
    for (const peer of this.peers.values()) this._attachTrack(peer);
    this.onState();
    return true;
  }

  disableMic() {
    this.enabled = false;
    if (this.track) this.track.enabled = false;
    this.onState();
  }

  toggleMic() {
    if (this.enabled) this.disableMic();
    else if (this.track) { this.enabled = true; this._applyTrackEnabled(); this.onState(); }
    else this.enableMic();
  }

  setPTT(down) {
    if (this.ptt === down) return;
    this.ptt = down;
    if (down && !this.track) this.enableMic();
    this._applyTrackEnabled();
    this.onState();
  }

  _applyTrackEnabled() {
    if (this.track) this.track.enabled = this.transmitting;
  }

  _attachTrack(peer) {
    if (!this.track || !peer.sender) return;
    try { peer.sender.replaceTrack(this.track); } catch { /* */ }
  }

  // ---------------------------------------------------------------- pares
  // Al entrar: llamo a todos los que ya estaban.
  connectAll(ids) {
    for (const id of ids) this._peer(id, true);
  }

  _peer(id, initiator) {
    let peer = this.peers.get(id);
    if (peer) return peer;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    peer = { id, pc, sender: null, pending: [], remoteSet: false, level: 0, muted: false, audio: null, nodes: null, restarts: 0 };
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    peer.sender = tr.sender;
    this._attachTrack(peer);
    pc.onicecandidate = (e) => { if (e.candidate) this.net.send({ t: 'rtc', to: id, d: { c: e.candidate.toJSON() } }); };
    pc.ontrack = (e) => this._attachRemote(peer, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'failed' && initiator && peer.restarts < 2) {
        peer.restarts++;
        pc.restartIce?.();
        this._offer(peer);
      }
      this.onState();
    };
    this.peers.set(id, peer);
    if (initiator) this._offer(peer);
    return peer;
  }

  async _offer(peer) {
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.net.send({ t: 'rtc', to: peer.id, d: { sdp: peer.pc.localDescription.toJSON() } });
    } catch (e) { console.warn('voz: oferta', e); }
  }

  async onSignal(from, d) {
    if (!d) return;
    let peer = this.peers.get(from);
    if (d.sdp) {
      if (!peer) peer = this._peer(from, false);
      try {
        await peer.pc.setRemoteDescription(d.sdp);
        peer.remoteSet = true;
        for (const c of peer.pending) { try { await peer.pc.addIceCandidate(c); } catch { /* */ } }
        peer.pending.length = 0;
        if (d.sdp.type === 'offer') {
          const ans = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(ans);
          this.net.send({ t: 'rtc', to: from, d: { sdp: peer.pc.localDescription.toJSON() } });
        }
      } catch (e) { console.warn('voz: sdp', e); }
    } else if (d.c && peer) {
      if (!peer.remoteSet) peer.pending.push(d.c);
      else { try { await peer.pc.addIceCandidate(d.c); } catch { /* */ } }
    }
  }

  _attachRemote(peer, stream) {
    peer.stream = stream;
    const ctx = this._ensureBus();
    // Chrome solo entrega audio remoto a WebAudio si el stream también está en un <audio> (silenciado)
    if (!peer.audio) {
      peer.audio = new Audio();
      peer.audio.muted = true;
      peer.audio.autoplay = true;
    }
    peer.audio.srcObject = stream;
    peer.audio.play?.().catch(() => {});
    if (!ctx) return;
    if (peer.nodes) {
      for (const node of [peer.nodes.src, peer.nodes.analyser, peer.nodes.gain, peer.nodes.panner]) {
        try { node.disconnect(); } catch { /* */ }
      }
    }
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const gain = ctx.createGain();
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'linear';
    panner.refDistance = 2.5;
    panner.maxDistance = 38;
    panner.rolloffFactor = 1;
    src.connect(analyser);
    analyser.connect(gain);
    gain.connect(panner);
    panner.connect(this.bus);
    peer.nodes = { src, analyser, gain, panner, buf: new Uint8Array(analyser.fftSize) };
  }

  remove(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    try { peer.pc.close(); } catch { /* */ }
    if (peer.nodes) { try { peer.nodes.src.disconnect(); peer.nodes.panner.disconnect(); } catch { /* */ } }
    if (peer.audio) peer.audio.srcObject = null;
    this.peers.delete(id);
  }

  setMuted(id, muted) {
    const p = this.peers.get(id);
    if (p) p.muted = muted;
  }

  // ---------------------------------------------------------------- por frame
  _rms(analyser, buf) {
    analyser.getByteTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
    return Math.sqrt(s / buf.length);
  }

  update(camera, localPos, players) {
    const ctx = this.getCtx();
    if (!ctx) return;
    this._ensureBus();
    this.bus.gain.value = this.opts.muted ? 0 : (this.opts.volVoice ?? 1) * 1.4;
    // oyente = cámara
    const L = ctx.listener;
    const e = camera.matrixWorld.elements;
    const p = camera.position;
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = -e[8]; L.forwardY.value = -e[9]; L.forwardZ.value = -e[10];
      L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6];
    } else {
      L.setPosition?.(p.x, p.y, p.z);
      L.setOrientation?.(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
    }
    const myZone = localPos ? zoneAt(localPos.x, localPos.z) : null;
    for (const peer of this.peers.values()) {
      // La voz puede llegar antes del primer clic que crea el AudioContext.
      if (peer.stream && (!peer.nodes || peer.nodes.src.context !== ctx)) this._attachRemote(peer, peer.stream);
      const n = peer.nodes;
      if (!n) continue;
      const rp = players.get(peer.id);
      const lvl = this._rms(n.analyser, n.buf);
      peer.level = Math.max(lvl * 6, peer.level * 0.85);
      if (rp) {
        rp.talk = Math.min(1, peer.level);
        const hp = rp.headPosition();
        const spatial = this.opts.voiceSpatial !== false;
        if (spatial) {
          if (n.panner.positionX) { n.panner.positionX.value = hp.x; n.panner.positionY.value = hp.y; n.panner.positionZ.value = hp.z; }
          else n.panner.setPosition(hp.x, hp.y, hp.z);
          n.panner.maxDistance = 38;
        } else {
          if (n.panner.positionX) { n.panner.positionX.value = p.x; n.panner.positionY.value = p.y; n.panner.positionZ.value = p.z; }
          else n.panner.setPosition(p.x, p.y, p.z);
        }
        // paredes: si uno está adentro y el otro afuera (o en otro edificio), se escucha amortiguado
        const theirZone = zoneAt(rp.pos.x, rp.pos.z);
        const wall = spatial && myZone !== theirZone && (INTERIOR.has(myZone) || INTERIOR.has(theirZone));
        n.gain.gain.value = peer.muted ? 0 : wall ? 0.3 : 1;
      }
    }
    if (this.myAnalyser && this.transmitting) {
      const l = this._rms(this.myAnalyser, this._buf) * 6;
      this.level = Math.max(Math.min(1, l), this.level * 0.85);
    } else this.level *= 0.8;
  }

  isTalking(id) {
    return (this.peers.get(id)?.level || 0) > 0.12;
  }

  status() {
    if (this.error) return { cls: 'mic-off', text: '🎙 ' + this.error };
    if (!this.enabled) return { cls: 'mic-off', text: '🎙 Mic apagado · [M] prender · [V] hablar' };
    if (this.transmitting) return { cls: this.level > 0.1 ? 'mic-talk' : 'mic-on', text: this.opts.voiceMode === 'open' ? '🎙 Mic abierto' : '🎙 Hablando...' };
    return { cls: 'mic-on', text: '🎙 Mantené [V] para hablar' };
  }

  dispose() {
    for (const id of [...this.peers.keys()]) this.remove(id);
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
  }
}
