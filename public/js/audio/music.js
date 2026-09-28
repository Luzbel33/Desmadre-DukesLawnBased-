// Música por zona del castillo del terror (streaming con <audio>, no se decodifica entera en memoria).
// Cada pista entra y sale con fundido; la que no suena se pausa. Volumen: "Música" de las opciones.
// Pistas CC0 (assets/music/CREDITOS.txt): torreón, cripta, patio, fogón, cementerio y tensión.
const FADE_IN = 2.2, FADE_OUT = 1.6;

export class ZoneMusic {
  constructor(engine) {
    this.engine = engine;
    this.tracks = new Map(); // nombre -> { el, node, gain, level }
    this.want = null;
    this.level = 0;
  }
  _track(name) {
    let t = this.tracks.get(name);
    if (t) return t;
    const ctx = this.engine.ctx, bus = this.engine.musicBus;
    if (!ctx || !bus || typeof Audio === 'undefined') return null;
    const el = new Audio(`assets/music/${name}.ogg`);
    el.loop = true;
    el.preload = 'auto';
    const node = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    node.connect(gain);
    gain.connect(bus);
    t = { el, node, gain, level: 0, playing: false };
    this.tracks.set(name, t);
    return t;
  }
  // name: pista deseada (o null = silencio); level: 0..1
  update(dt, name, level) {
    if (!this.engine.ctx || this.engine.ctx.state !== 'running') return;
    this.want = name;
    for (const [n, t] of this.tracks) {
      const target = n === name ? level : 0;
      const rate = target > t.level ? dt / FADE_IN : dt / FADE_OUT;
      t.level += Math.max(-rate, Math.min(rate, target - t.level));
      t.gain.gain.value = t.level;
      if (t.level <= 0.001 && t.playing && n !== name) { t.el.pause(); t.playing = false; }
    }
    if (name && level > 0.001) {
      const t = this._track(name);
      if (t && !t.playing) { t.playing = true; t.el.play().catch(() => { t.playing = false; }); }
    }
  }
  stop() {
    for (const t of this.tracks.values()) { t.el.pause(); t.playing = false; t.level = 0; t.gain.gain.value = 0; }
  }
}
