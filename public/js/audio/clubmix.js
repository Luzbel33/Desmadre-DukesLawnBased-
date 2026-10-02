// La música del Búnker: sintetizada en vivo (sin archivos). Suena igual para todos: el compás sale de la hora del
// servidor, y cada compás elige sus variaciones con una semilla (el mismo compás, la misma música).
// Cada sala tiene su música (un "estilo" con su propia cadena: filtro, eco): techno oscuro en el club, dub en el
// coffeeshop, deep house en el VIP, industrial en el Infierno, psytrance en la sala psicodélica y un ambiente que
// da miedo en el laberinto. Desde la sala de al lado se oye ahogada (filtro). Solo se agenda lo que se oye.
// El techno se calla si alguien pone algo en la pantalla del Búnker (no se pisan). En el ascensor, música de ascensor.
import { BPM } from '../world/club.js';

const SPB = 60 / BPM; // segundos por negra
const AHEAD = 0.25; // cuánto se agenda por adelantado (s)
// La menor con la sexta napolitana: La, Fa, Sol, Mi (bajo en semitonos desde La1 = 55 Hz)
const PROG = [0, -4, -2, -5];
const hz = (semi, base = 55) => base * Math.pow(2, semi / 12);
function hash(n) { let h = (n | 0) ^ 0x2c1b3c6d; h = Math.imul(h ^ (h >>> 15), 0x297a2d39); h = Math.imul(h ^ (h >>> 12), 0x5bd1e995); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; }

// eco de cada estilo: [tiempo en negras, realimentación, corte del filtro del eco, cuánto se manda]
const ECHO = { techno: [0.75, 0.32, 2400, 0.35], dub: [0.75, 0.55, 1800, 0.5], deep: [0.75, 0.22, 2600, 0.25], hell: [0.5, 0.25, 1600, 0.3], psy: [0.75, 0.35, 3200, 0.3], maze: [1.5, 0.6, 1400, 0.6] };
export const MUSIC_STYLES = Object.keys(ECHO);

export class ClubMix {
  constructor(engine) {
    this.engine = engine;
    this.ready = false;
    this.styles = {};
    this.lift = 0; this.liftNext = -1;
  }
  _init() {
    const ctx = this.engine.ctx, bus = this.engine.musicBus;
    if (!ctx || !bus) return false;
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.003; this.comp.release.value = 0.15;
    this.comp.connect(bus);
    // ruido blanco (hats, clap, subida, viento)
    const n = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    // música de ascensor: cadena propia (no pasa por el filtro del club)
    this.liftOut = ctx.createGain(); this.liftOut.gain.value = 0; this.liftOut.connect(bus);
    this.ready = true;
    return true;
  }
  // la cadena de un estilo (se arma la primera vez que hace falta): salida -> filtro (lo ahogado) -> compresor; eco
  _style(name) {
    let S = this.styles[name];
    if (S) return S;
    const ctx = this.ctx, [beats, fbk, cut, sendLv] = ECHO[name];
    S = this.styles[name] = { name, level: 0, next: -1 };
    S.out = ctx.createGain(); S.out.gain.value = 0;
    S.lp = ctx.createBiquadFilter(); S.lp.type = 'lowpass'; S.lp.frequency.value = 18000; S.lp.Q.value = 0.7;
    S.out.connect(S.lp); S.lp.connect(this.comp);
    S.delay = ctx.createDelay(2); S.delay.delayTime.value = SPB * beats;
    S.fb = ctx.createGain(); S.fb.gain.value = fbk;
    S.dlp = ctx.createBiquadFilter(); S.dlp.type = 'lowpass'; S.dlp.frequency.value = cut;
    S.delay.connect(S.dlp); S.dlp.connect(S.fb); S.fb.connect(S.delay); S.dlp.connect(S.out);
    S.send = ctx.createGain(); S.send.gain.value = sendLv; S.send.connect(S.delay);
    if (name === 'hell') { // distorsión para el bombo industrial
      S.dist = ctx.createWaveShaper(); const c = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(x * 6) * 0.8; }
      S.dist.curve = c; S.dist.connect(S.out);
    }
    return S;
  }

  // nowMs: hora del servidor. mix: { estilo: [cuánto se oye 0..1, qué tan limpio 0..1] }; lo que no está, se apaga.
  // (compatible con lo de antes: { want, muffle } = el techno)
  update(dt, nowMs, { mix = null, want = 0, muffle = 1, lift = 0 } = {}) {
    const E = this.engine;
    if (!E.ctx || E.ctx.state !== 'running') return;
    if (!this.ready && !this._init()) return;
    const ctx = this.ctx;
    mix = mix || { techno: [want, muffle] };
    // reloj: la hora del servidor pasada al reloj del audio (la diferencia se suaviza: sin saltos)
    const off = ctx.currentTime - nowMs / 1000;
    this.off = this.off === undefined || Math.abs(off - this.off) > 0.5 ? off : this.off + (off - this.off) * 0.02;
    const serverNow = ctx.currentTime - this.off;
    const step = SPB / 4;
    for (const name of MUSIC_STYLES) {
      const [w = 0, m = 1] = mix[name] || [];
      if (!this.styles[name] && w <= 0) continue;
      const S = this._style(name);
      S.level += Math.max(-dt / 1.2, Math.min(dt / 1.5, w - S.level));
      S.out.gain.setTargetAtTime(S.level * 0.9, ctx.currentTime, 0.05);
      S.lp.frequency.setTargetAtTime(300 + Math.pow(m, 2) * 17500, ctx.currentTime, 0.12);
      if (S.level > 0.002) {
        let k = Math.max(S.next, Math.ceil(serverNow / step));
        if (k < Math.floor(serverNow / step) - 2) k = Math.ceil(serverNow / step);
        this.out = S.out; this.send = S.send; this.S = S;
        while (k * step < serverNow + AHEAD) { STEP[name].call(this, k, k * step + this.off); k++; }
        S.next = k;
      } else S.next = -1;
    }
    this.lift += Math.max(-dt / 0.8, Math.min(dt / 0.8, lift - this.lift));
    this.liftOut.gain.setTargetAtTime(this.lift * 0.5, ctx.currentTime, 0.05);
    if (this.lift > 0.002) {
      const ls = SPB * 0.5;
      let k = Math.max(this.liftNext, Math.ceil(serverNow / ls));
      while (k * ls < serverNow + AHEAD) { this._muzak(k, k * ls + this.off); k++; }
      this.liftNext = k;
    } else this.liftNext = -1;
  }

  // ---------------------------------------------------------------- techno (el club)
  // una semicorchea
  _techno(k, t) {
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
  // ---------------------------------------------------------------- instrumentos de las otras salas
  // una nota cualquiera: oscilador (filtro opcional con barrido) y envolvente; send: también al eco
  _note(t, f, len, v, { type = 'sine', a = 0.005, cut = 0, cutEnd = 0, q = 0.7, detune = 0, send = false, to = null } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune;
    let head = o;
    if (cut) {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = q;
      lp.frequency.setValueAtTime(cut, t); if (cutEnd) lp.frequency.exponentialRampToValueAtTime(cutEnd, t + a + len);
      o.connect(lp); head = lp;
    }
    this._env(g, t, a, v, len);
    head.connect(g); g.connect(to || this.out); if (send) g.connect(this.send);
    o.start(t); o.stop(t + a + len + 0.05);
  }
  // un golpe de ruido filtrado (rim, snare, shaker)
  _hit(t, type, f, q, len, v, send = false) {
    const c = this.ctx, src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    this._env(g, t, 0.001, v, len);
    src.connect(fl); fl.connect(g); g.connect(this.out); if (send) g.connect(this.send);
    src.start(t, Math.random() * 0.5, len + 0.05);
  }
  _softKick(t, v = 0.85, f0 = 120, f1 = 46, len = 0.3, to = null) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.09);
    this._env(g, t, 0.002, v, len);
    o.connect(g); g.connect(to || this.out); o.start(t); o.stop(t + len + 0.05);
  }
  // acorde corto (skank del reggae, stab): varias notas por un filtro pasabanda
  _chop(t, freqs, len, v, { type = 'square', f = 1200, q = 1.2, send = false } = {}) {
    const c = this.ctx, bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    this._env(g, t, 0.003, v, len);
    for (const fr of freqs) { const o = c.createOscillator(); o.type = type; o.frequency.value = fr; o.detune.value = (Math.random() - 0.5) * 10; o.connect(bp); o.start(t); o.stop(t + len + 0.06); }
    bp.connect(g); g.connect(this.out); if (send) g.connect(this.send);
  }
  // piano eléctrico (Rhodes): fundamental + campanita suave arriba, que se apaga despacio
  _rhodes(t, freqs, len, v) {
    for (const f of freqs) {
      this._note(t, f, len, v, { a: 0.006, send: true });
      this._note(t, f * 2.005, len * 0.45, v * 0.35, { a: 0.003 });
    }
  }
  // colchón: sierras desafinadas por un filtro que respira
  _pad(t, freqs, len, v, cut = 900) {
    const c = this.ctx, lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.Q.value = 1.5; lp.frequency.setValueAtTime(cut * 0.5, t); lp.frequency.linearRampToValueAtTime(cut, t + len * 0.5); lp.frequency.linearRampToValueAtTime(cut * 0.4, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + len * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + len);
    for (const f of freqs) for (const dt of [-8, 8]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + len + 0.1); }
    lp.connect(g); g.connect(this.out); g.connect(this.send);
  }
  // golpe metálico inarmónico (industrial)
  _metal(t, v, base = 310) {
    const c = this.ctx, g = c.createGain(), hp = c.createBiquadFilter();
    this._env(g, t, 0.001, v, 0.25);
    for (const m of [1, 1.47, 2.09, 2.56, 3.71]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = base * m; o.connect(g); o.start(t); o.stop(t + 0.3); }
    hp.type = 'highpass'; hp.frequency.value = 900;
    g.connect(hp); hp.connect(this.out); hp.connect(this.send);
  }
  // sirena dub / zumbido láser: tono que barre
  _sweep(t, f0, f1, len, v, type = 'sine') {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(this.out); g.connect(this.send); o.start(t); o.stop(t + len + 0.05);
  }

  // ---------------------------------------------------------------- dub (el coffeeshop): one drop, skank y eco
  _dub(k, t) {
    const s16 = ((k % 16) + 16) % 16, bar = Math.floor(k / 16), r = (n) => hash(bar * 977 + n);
    const root = [0, 0, 5, 5, 3, 3, 7, 5][((bar % 8) + 8) % 8]; // La menor: Am Am Dm Dm C C E Dm
    const sw = s16 % 4 === 2 ? SPB / 4 * 0.22 : 0; // el contratiempo, arrastrado
    if (s16 === 8) { this._softKick(t, 0.9, 95, 42, 0.38); this._hit(t, 'bandpass', 1700, 6, 0.06, 0.32, r(1) > 0.6); }
    if (s16 % 2 === 0) this._hit(t + sw, 'highpass', 8000, 0.7, s16 % 4 === 2 ? 0.08 : 0.03, s16 % 4 === 2 ? 0.06 : 0.035);
    // skank en el 2 y el 4 (y a veces el eco se lo lleva)
    if (s16 === 4 || s16 === 12) this._chop(t, [0, 3, 7].map((iv) => hz(root + iv + 24)), 0.13, 0.13, { f: 1400, q: 1.4, send: s16 === 12 && r(2) > 0.55 });
    // el burbujeo del órgano en semicorcheas sueltas
    if ((s16 === 6 || s16 === 7 || s16 === 14 || s16 === 15) && r(s16) > 0.35) this._chop(t, [hz(root + 12 + (s16 % 2 ? 7 : 0))], 0.07, 0.07, { type: 'triangle', f: 700, q: 2 });
    // bajo: profundo, redondo, con su frase de dos compases
    const line = bar % 2 ? { 0: 0, 3: 0, 6: 3, 8: 7, 10: 5, 12: 3, 14: 0 } : { 0: 0, 2: 0, 6: 7, 8: 10, 11: 7, 13: 3 };
    if (line[s16] !== undefined) this._note(t, hz(root + line[s16]), SPB * 0.42, 0.55, { type: 'triangle', a: 0.012, cut: 520 });
    // la sirena, cada ocho compases
    if (((bar % 8) + 8) % 8 === 7 && s16 === 0) this._sweep(t, 400, 1300, SPB * 3, 0.06, 'triangle');
  }

  // ---------------------------------------------------------------- deep house (el VIP): sensual, acordes de novena
  _deep(k, t) {
    const s16 = ((k % 16) + 16) % 16, bar = Math.floor(k / 16), r = (n) => hash(bar * 613 + n);
    const CH = [[0, 3, 7, 10, 14], [-4, 0, 3, 7, 11], [-7, -4, 0, 3, 7], [-5, -2, 2, 5, 9]]; // Am9 Fmaj7 Dm9 Em7
    const ch = CH[((Math.floor(bar / 2) % 4) + 4) % 4];
    if (s16 % 4 === 0) this._softKick(t, 0.75, 110, 45, 0.26);
    if (s16 === 4 || s16 === 12) this._hit(t, 'bandpass', 1900, 1.4, 0.09, 0.14, true);
    if (s16 % 4 === 2) this._hit(t, 'highpass', 7000, 0.7, 0.14, 0.07);
    else if (s16 % 2 === 1 && r(s16) > 0.3) this._hit(t + SPB / 4 * 0.12, 'highpass', 9000, 0.7, 0.025, 0.035);
    // acordes sincopados del piano
    if (s16 === 3 || s16 === 10 || (s16 === 14 && r(7) > 0.6)) this._rhodes(t, ch.map((iv) => hz(iv + 24)), SPB * 1.1, 0.045);
    // bajo en el contratiempo, redondo
    if (s16 % 4 === 2) this._note(t, hz(ch[0] + (r(s16 + 3) > 0.8 ? 12 : 0)), SPB * 0.4, 0.42, { type: 'sine', a: 0.008 });
    // colchón cada dos compases
    if (s16 === 0 && bar % 2 === 0) this._pad(t, ch.slice(0, 4).map((iv) => hz(iv + 12)), SPB * 8, 0.035, 1100);
  }

  // ---------------------------------------------------------------- industrial (el Infierno): metal, distorsión, coro
  _hell(k, t) {
    const s16 = ((k % 16) + 16) % 16, bar = Math.floor(k / 16), inPhrase = ((bar % 16) + 16) % 16, r = (n) => hash(bar * 389 + n);
    const root = [-5, -4, -5, -2][((Math.floor(bar / 2) % 4) + 4) % 4]; // Mi frigio
    if (s16 % 4 === 0 || (s16 === 14 && r(1) > 0.4)) this._softKick(t, 0.95, 160, 40, 0.34, this.S.dist);
    if (s16 === 4 || s16 === 12) { this._hit(t, 'bandpass', 900, 0.8, 0.2, 0.42, true); this._metal(t, 0.05, 240); }
    if (s16 % 2 === 1 && r(s16) > 0.62) this._metal(t, 0.035 + r(s16 + 9) * 0.03, 280 + Math.floor(r(s16 + 4) * 3) * 90);
    if (s16 % 4 === 2) this._hit(t, 'highpass', 6000, 0.7, 0.05, 0.07);
    // bajo sucio en el contratiempo
    if (s16 % 4 === 2) this._note(t, hz(root + 12), 0.14, 0.22, { type: 'sawtooth', cut: 900, cutEnd: 160, q: 6 });
    // el zumbido de fondo y el coro de condenados
    if (s16 === 0 && bar % 2 === 0) this._pad(t, [hz(root), hz(root + 0.15), hz(root + 7)], SPB * 8, 0.06, 500);
    if (s16 === 0 && inPhrase % 8 === 4) this._choir(t, root + 12, SPB * 8);
    if (inPhrase === 0 && s16 === 0) this._bell(t);
  }

  // ---------------------------------------------------------------- psytrance (la sala psicodélica): bajo que rueda y ácido
  _psy(k, t) {
    const s16 = ((k % 16) + 16) % 16, bar = Math.floor(k / 16), r = (n) => hash(bar * 271 + n);
    const root = [0, 0, 3, -2][((Math.floor(bar / 4) % 4) + 4) % 4] - 5; // Mi
    if (s16 % 4 === 0) this._softKick(t, 0.95, 150, 44, 0.2);
    else this._note(t, hz(root + 12), 0.075, 0.3, { type: 'sawtooth', cut: 1400, cutEnd: 150, q: 4, a: 0.002 }); // bombo-bajo-bajo-bajo
    if (s16 % 4 === 2) this._hit(t, 'highpass', 8000, 0.7, 0.07, 0.07);
    else if (s16 % 2 === 1) this._hit(t, 'highpass', 10000, 0.7, 0.02, 0.04);
    if ((s16 === 4 || s16 === 12) && bar % 4 >= 2) this._hit(t, 'bandpass', 2200, 1.2, 0.07, 0.1);
    // la línea ácida: notas de la escala al azar (con semilla), el filtro abre y cierra cada ocho compases
    const sweep = 0.5 + 0.5 * Math.sin((bar % 8 + s16 / 16) / 8 * Math.PI * 2);
    if (r(s16 + 20) > 0.42) {
      const sc = [0, 3, 5, 7, 10, 12, 15], n = sc[Math.floor(r(s16 + 40) * sc.length)], acc = r(s16 + 60) > 0.7;
      this._note(t, hz(root + 24 + n), 0.11, acc ? 0.11 : 0.07, { type: 'sawtooth', cut: 300 + sweep * 2600 + (acc ? 900 : 0), cutEnd: 220, q: 14, a: 0.003, send: acc });
    }
    // zumbidos láser antes del cambio
    if (s16 === 15 && bar % 4 === 3) this._sweep(t, 3000, 120, SPB * 0.9, 0.05, 'sawtooth');
  }

  // ---------------------------------------------------------------- el laberinto: zumbido grave, viento, latidos y gotas
  _maze(k, t) {
    const s16 = ((k % 16) + 16) % 16, bar = Math.floor(k / 16), r = (n) => hash(bar * 151 + n);
    if (s16 === 0 && bar % 4 === 0) this._pad(t, [hz(0), hz(0.2), hz(7)], SPB * 16, 0.07, 380);
    if (s16 === 0 && bar % 2 === 1) this._riser(t, SPB * 6);
    // latido: ocho compases sí, ocho no
    if ((bar % 16) < 8 && (s16 === 0 || s16 === 8)) { this._softKick(t, 0.5, 70, 38, 0.16); this._softKick(t + 0.2, 0.32, 65, 36, 0.14); }
    // gotas que suenan como campanitas lejanas
    if (s16 % 2 === 0 && r(s16) > 0.88) this._note(t, hz([0, 3, 5, 7, 10][Math.floor(r(s16 + 5) * 5)] + 36), 0.9, 0.03, { a: 0.002, send: true });
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
  stop() { if (this.ready) { for (const S of Object.values(this.styles)) { S.out.gain.value = 0; S.level = 0; } this.liftOut.gain.value = 0; this.lift = 0; } }
}

// qué toca cada estilo en cada semicorchea (se llama con 'this' = el mezclador)
const STEP = { techno: ClubMix.prototype._techno, dub: ClubMix.prototype._dub, deep: ClubMix.prototype._deep, hell: ClubMix.prototype._hell, psy: ClubMix.prototype._psy, maze: ClubMix.prototype._maze };
