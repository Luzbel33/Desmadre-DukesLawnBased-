// La música del Búnker: techno oscuro sintetizado en vivo (sin archivos). Suena igual para todos: el compás sale de
// la hora del servidor, y cada compás elige sus variaciones con una semilla (el mismo compás, la misma música).
// Se atenúa con un filtro según dónde estés (adentro del club, a pleno; en la antesala o el ascensor, ahogada) y se
// calla si alguien pone algo en la pantalla del Búnker (no se pisan). En el ascensor, en cambio, música de ascensor.
import { BPM } from '../world/club.js';

const SPB = 60 / BPM; // segundos por negra
const AHEAD = 0.25; // cuánto se agenda por adelantado (s)
// La menor con la sexta napolitana: La, Fa, Sol, Mi (bajo en semitonos desde La1 = 55 Hz)
const PROG = [0, -4, -2, -5];
const hz = (semi, base = 55) => base * Math.pow(2, semi / 12);
function hash(n) { let h = (n | 0) ^ 0x2c1b3c6d; h = Math.imul(h ^ (h >>> 15), 0x297a2d39); h = Math.imul(h ^ (h >>> 12), 0x5bd1e995); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; }

export class ClubMix {
  constructor(engine) {
    this.engine = engine;
    this.ready = false;
    this.next = -1; // próxima semicorchea (índice absoluto) a agendar
    this.level = 0; this.want = 0; this.muffle = 1;
    this.lift = 0; this.liftNext = -1;
  }
  _init() {
    const ctx = this.engine.ctx, bus = this.engine.musicBus;
    if (!ctx || !bus) return false;
    this.ctx = ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 18000; this.lp.Q.value = 0.7;
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.003; this.comp.release.value = 0.15;
    this.out.connect(this.lp); this.lp.connect(this.comp); this.comp.connect(bus);
    // eco para los stabs y el coro
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = SPB * 0.75;
    this.fb = ctx.createGain(); this.fb.gain.value = 0.32;
    this.dlp = ctx.createBiquadFilter(); this.dlp.type = 'lowpass'; this.dlp.frequency.value = 2400;
    this.delay.connect(this.dlp); this.dlp.connect(this.fb); this.fb.connect(this.delay); this.dlp.connect(this.out);
    this.send = ctx.createGain(); this.send.gain.value = 0.35; this.send.connect(this.delay);
    // ruido blanco (hats, clap, subida)
    const n = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    // música de ascensor: cadena propia (no pasa por el filtro del club)
    this.liftOut = ctx.createGain(); this.liftOut.gain.value = 0; this.liftOut.connect(bus);
    this.ready = true;
    return true;
  }

  // nowMs: hora del servidor; want: 0..1 cuánto se oye; muffle: 0..1 (1 = limpio, 0 = detrás de una pared)
  update(dt, nowMs, { want = 0, muffle = 1, lift = 0 } = {}) {
    const E = this.engine;
    if (!E.ctx || E.ctx.state !== 'running') return;
    if (!this.ready && !this._init()) return;
    const ctx = this.ctx;
    this.want = want;
    this.level += Math.max(-dt / 1.2, Math.min(dt / 1.5, want - this.level));
    this.out.gain.setTargetAtTime(this.level * 0.9, ctx.currentTime, 0.05);
    this.lp.frequency.setTargetAtTime(300 + Math.pow(muffle, 2) * 17500, ctx.currentTime, 0.12);
    this.lift += Math.max(-dt / 0.8, Math.min(dt / 0.8, lift - this.lift));
    this.liftOut.gain.setTargetAtTime(this.lift * 0.5, ctx.currentTime, 0.05);
    // reloj: la hora del servidor pasada al reloj del audio (la diferencia se suaviza: sin saltos)
    const off = ctx.currentTime - nowMs / 1000;
    this.off = this.off === undefined || Math.abs(off - this.off) > 0.5 ? off : this.off + (off - this.off) * 0.02;
    const serverNow = ctx.currentTime - this.off;
    const step = SPB / 4;
    if (this.level > 0.002) {
      let k = Math.max(this.next, Math.ceil(serverNow / step));
      if (k < Math.floor(serverNow / step) - 2) k = Math.ceil(serverNow / step);
      while (k * step < serverNow + AHEAD) { this._step(k, k * step + this.off); k++; }
      this.next = k;
    } else this.next = -1;
    if (this.lift > 0.002) {
      const ls = SPB * 0.5;
      let k = Math.max(this.liftNext, Math.ceil(serverNow / ls));
      while (k * ls < serverNow + AHEAD) { this._muzak(k, k * ls + this.off); k++; }
      this.liftNext = k;
    } else this.liftNext = -1;
  }

  // una semicorchea
  _step(k, t) {
    const s16 = ((k % 16) + 16) % 16, bar = Math.floor(k / 16), phrase = Math.floor(bar / 16), inPhrase = ((bar % 16) + 16) % 16;
    const breakdown = inPhrase >= 12; // los últimos 4 compases de cada frase: sin bombo, sube el coro y la tensión
    const root = PROG[((Math.floor(bar / 2) % 4) + 4) % 4];
    const r = (n) => hash(bar * 131 + n + phrase * 7);
    if (!breakdown && s16 % 4 === 0) this._kick(t);
    if (!breakdown && (s16 === 4 || s16 === 12)) this._clap(t, 0.5);
    if (s16 % 4 === 2) this._hat(t, 0.11, 0.18); // abierto en el contratiempo
    else if (!breakdown && s16 % 2 === 1 && r(s16) > 0.25) this._hat(t, 0.03, 0.07 + r(s16 + 50) * 0.05);
    // bajo rodando en semicorcheas (salteando los golpes del bombo)
    if (!breakdown && s16 % 4 !== 0) {
      const oct = s16 % 4 === 3 && r(3) > 0.5 ? 12 : 0;
      this._bass(t, hz(root + oct), 0.16, 0.4 + 0.5 * Math.sin((bar % 8) / 8 * Math.PI));
    }
    // stabs de acorde menor en algunos contratiempos
    if (s16 % 4 === 2 && r(s16 + 9) > (breakdown ? 0.9 : 0.55)) this._stab(t, root);
    // coro gótico (colchón) al empezar cada 2 compases en la ruptura y en la mitad de la frase
    if (s16 === 0 && bar % 2 === 0 && (breakdown || inPhrase >= 4 && inPhrase < 8)) this._choir(t, root, SPB * 8);
    // subida de ruido antes de volver
    if (inPhrase === 15 && s16 === 0) this._riser(t, SPB * 4);
    // campana de iglesia al comienzo de cada frase (un toque de terror)
    if (inPhrase === 0 && s16 === 0) this._bell(t);
  }

  _env(g, t, a, peak, dec) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  _kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
    this._env(g, t, 0.002, 1.0, 0.32);
    const click = c.createBufferSource(), cg = c.createGain(), hp = c.createBiquadFilter();
    click.buffer = this.noise; hp.type = 'highpass'; hp.frequency.value = 3000;
    this._env(cg, t, 0.001, 0.2, 0.012);
    click.connect(hp); hp.connect(cg); cg.connect(this.out);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + 0.45); click.start(t, Math.random() * 0.5, 0.03);
  }
  _clap(t, v) {
    const c = this.ctx, src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t);
    for (const d of [0, 0.011, 0.023]) { g.gain.setValueAtTime(v, t + d); g.gain.exponentialRampToValueAtTime(v * 0.2, t + d + 0.009); }
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(bp); bp.connect(g); g.connect(this.out); g.connect(this.send);
    src.start(t, Math.random() * 0.5, 0.3);
  }
  _hat(t, len, v) {
    const c = this.ctx, src = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; hp.type = 'highpass'; hp.frequency.value = 7500;
    this._env(g, t, 0.001, v, len);
    src.connect(hp); hp.connect(g); g.connect(this.out);
    src.start(t, Math.random() * 0.5, len + 0.05);
  }
  _bass(t, f, len, cut) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = f; o2.frequency.value = f * 0.5;
    lp.type = 'lowpass'; lp.Q.value = 7;
    lp.frequency.setValueAtTime(180 + cut * 1400, t); lp.frequency.exponentialRampToValueAtTime(120, t + len);
    this._env(g, t, 0.004, 0.32, len);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.out);
    o.start(t); o2.start(t); o.stop(t + len + 0.05); o2.stop(t + len + 0.05);
  }
  _stab(t, root) {
    const c = this.ctx, lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(400, t + 0.25);
    this._env(g, t, 0.003, 0.09, 0.26);
    for (const iv of [0, 3, 7, 10]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(root + iv + 24); o.detune.value = (Math.random() - 0.5) * 14;
      o.connect(lp); o.start(t); o.stop(t + 0.35);
    }
    lp.connect(g); g.connect(this.out); g.connect(this.send);
  }
  _choir(t, root, len) {
    const c = this.ctx, g = c.createGain(), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter();
    // "aaa": dos formantes sobre sierras desafinadas
    f1.type = 'bandpass'; f1.frequency.value = 700; f1.Q.value = 5;
    f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 6;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + len * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + len);
    for (const iv of [12, 15, 19, 24]) for (const dt of [-9, 7]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(root + iv); o.detune.value = dt;
      o.connect(f1); o.connect(f2); o.start(t); o.stop(t + len + 0.1);
    }
    f1.connect(g); f2.connect(g); g.connect(this.out); g.connect(this.send);
  }
  _riser(t, len) {
    const c = this.ctx, src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; src.loop = true;
    bp.type = 'bandpass'; bp.Q.value = 2; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(9000, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + len * 0.97); g.gain.linearRampToValueAtTime(0.0001, t + len);
    src.connect(bp); bp.connect(g); g.connect(this.out);
    src.start(t); src.stop(t + len + 0.05);
  }
  _bell(t) {
    const c = this.ctx, g = c.createGain();
    this._env(g, t, 0.003, 0.14, 3.5);
    for (const [m, a] of [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.93, 0.12]]) {
      const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = 196 * m; og.gain.value = a;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + 3.6);
    }
    g.connect(this.out); g.connect(this.send);
  }
  // música de ascensor: bossa nova de manual (Rhodes de juguete + bajo), en corcheas
  _muzak(k, t) {
    const c = this.ctx, s8 = ((k % 16) + 16) % 16, bar = Math.floor(k / 16);
    const chords = [[0, 4, 7, 11], [2, 5, 9, 12], [-1, 2, 5, 9], [0, 4, 7, 11]]; // Cmaj7 Dm7 G7 Cmaj7
    const ch = chords[((bar % 4) + 4) % 4];
    const out = this.liftOut;
    const note = (f, len, v, type = 'sine') => {
      const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.05);
    };
    if ([0, 3, 6, 10, 12].includes(s8)) for (const iv of ch) note(hz(iv, 261.6), 0.5, 0.05);
    if (s8 === 0 || s8 === 8) note(hz(ch[0] - 12, 130.8), 0.6, 0.18, 'triangle');
    if (s8 === 6 || s8 === 14) note(hz(ch[2] - 12, 130.8), 0.35, 0.14, 'triangle');
    // melodía boluda
    const mel = [7, null, 9, 7, 4, null, 2, null, 4, null, 7, 9, 11, null, 9, null];
    if (mel[s8] !== null) note(hz(mel[s8] + (bar % 2 ? 0 : 12), 523.3 / 2), 0.28, 0.07, 'triangle');
  }
  stop() { if (this.ready) { this.out.gain.value = 0; this.liftOut.gain.value = 0; this.level = 0; this.lift = 0; } }
}
