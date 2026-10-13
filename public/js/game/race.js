// El Circuito del Desmadre en juego (world/circuit.js es lo que se ve):
// - Vueltas: cruzar la línea de largada manejando arranca el cronómetro; para que cuente la vuelta hay que pasar por el
//   tramo Guts and Glory. Mejor vuelta personal y aviso a la sala.
// - Carrera: X en el poste del semáforo larga una carrera de 3 vueltas para todos (cinco luces rojas y ¡VERDE!).
//   Corre todo el que esté en un vehículo cerca de la grilla. Al terminar se avisa en qué puesto llegaste.
// - Trampas: a mí (y a mi vehículo) me agarran el hacha, los pinchos, las sierras, la prensa, las minas y la bola
//   (shared/circuit-traps.js dice dónde está cada una). Cada una tiene su castigo, su sonido y su sangre.
import * as THREE from 'three';
import { G, clamp } from '../core/G.js';
import { CIRCUIT, INTERACT } from '../shared/mapdata.js';
import { TRAPS, MINES, axeBlade, sawX, crusherY, ballPos } from '../shared/circuit-traps.js';
import { GORE_HEAD_POP, GORE_GUTS } from './gore.js';
import { PART } from './ragdoll.js';

const HALF = CIRCUIT.width / 2;
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
// tamaño aproximado de cada vehículo: medio ancho, medio largo, alto (con el que va arriba)
const SIZE = { racecar: [0.92, 2.15, 1.25], moto: [0.34, 1.05, 1.85], mower: [0.7, 1.0, 1.6], tractor: [0.95, 1.3, 2.0], cart: [0.72, 1.3, 2.05] };
const fmt = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return (m ? `${m}:${r < 10 ? '0' : ''}` : '') + r.toFixed(2) + (m ? '' : ' s'); };
const KILL_LINES = {
  axe: [['¡HACHAZO!', 'El péndulo no perdona'], ['¡ZAS!', 'Medio vos quedó en la pista']],
  spikes: [['¡ENSARTADO!', 'Tenías que saltar, campeón'], ['¡BROCHETA!', 'La cama de pinchos te abrazó']],
  saw: [['¡SIERRAZO!', 'Te cortaron en fetas'], ['¡RRRRZZZ!', 'Las sierras tenían hambre']],
  crush: [['¡PURÉ!', 'La prensa te dejó finito'], ['¡PLAF!', 'Ahora sos una calcomanía']],
  mine: [['¡BUM!', 'Pisaste una mina'], ['¡VOLASTE!', 'Campo minado, decía el cartel']],
  ball: [['¡BOLAZO!', 'La bola de demolición te mandó a otra galaxia'], ['¡PUM!', 'Strike']],
};

export class RaceGame {
  constructor({ circuit, getLocal, getNet, notify, big, shake, chat }) {
    Object.assign(this, { circuit, getLocal, getNet, notify, big, shake, chat });
    this.prevD = null;
    this.lapStart = null; this.lap = 0; this.best = Infinity; this.gg = false;
    this.race = null; // { t0 (s servidor), laps, mine: { on, lap, start } , finishers: [] }
    this.hitT = 0;
    this._lightsN = -1;
    const p = circuit.startP, nx = p[3], nz = -p[2];
    // el poste del semáforo del lado de la tribuna
    const s = nz > 0 ? 1 : -1, px = p[0] + nx * s * (HALF + 1.2), pz = p[1] + nz * s * (HALF + 1.2);
    this.use = { id: 'race_start', k: 'race', p: [px - p[2] * 1.2, 1.0, pz - p[3] * 1.2], r: 2.0, label: 'Largar una carrera (3 vueltas)' };
    INTERACT.push(this.use);
    if (typeof document !== 'undefined') {
      this.hud = document.createElement('div');
      this.hud.id = 'race-hud';
      this.hud.className = 'hidden';
      document.body.appendChild(this.hud);
    }
  }
  now() { return (G.net?.now?.() ?? Date.now()) / 1000; }

  // ---------------------------------------------------------------- largada
  start() {
    if (this.race && this.now() < this.race.t0 + 4) { this.notify('🚦 Ya hay una largada en marcha.'); return; }
    const t0 = this.now() + 6;
    this._begin(t0);
    this.getNet()?.send({ t: 'ev', k: 'race', t0 });
  }
  _begin(t0) {
    const L = this.getLocal();
    this.race = { t0, laps: CIRCUIT.laps, finishers: [], mine: null };
    // corre el que esté en un vehículo cerca de la grilla (detrás de la línea)
    const v = L?.vehicle;
    if (v && v.seats?.[0] === G.myId) {
      const d = this._lineD(v.pos.x, v.pos.z);
      if (d > -40 && d < 3 && Math.abs(this._lineLat(v.pos.x, v.pos.z)) < 14) {
        this.race.mine = { on: true, lap: 0, armed: false };
        this.notify('🏁 ¡Estás en la grilla! Esperá la luz verde.');
      }
    }
    G.sfx?.trigger('ui', null, 0.5);
  }
  remote(m) {
    if (m.k === 'race' && Number.isFinite(m.t0)) { if (!this.race || this.now() > this.race.t0 + 4) this._begin(m.t0); return; }
    if (m.k === 'lap') { const rp = G.players.get(m.id); if (rp) this.chat?.(`🏁 ${rp.name}: vuelta en ${fmt(m.s)}${m.best ? ' (su mejor)' : ''}`); return; }
    if (m.k === 'raceFin') {
      const rp = G.players.get(m.id);
      if (!this.race || !rp) return;
      this.race.finishers.push(m.id);
      const pos = this.race.finishers.length;
      this.chat?.(pos === 1 ? `🏆 ¡${rp.name} ganó la carrera! (${fmt(m.s)})` : `🏁 ${rp.name} llegó ${pos}° (${fmt(m.s)})`);
      return;
    }
    if (m.k === 'mine' && Number.isInteger(m.i)) { this.circuit.mineGone(m.i); const mn = MINES[m.i]; if (mn) G.items?._blastFx?.(V1.set(mn.x, 0.2, mn.z)); }
  }
  _lineD(x, z) { const p = this.circuit.startP; return (x - p[0]) * p[2] + (z - p[1]) * p[3]; }
  _lineLat(x, z) { const p = this.circuit.startP; return (x - p[0]) * p[3] - (z - p[1]) * p[2]; }

  // ---------------------------------------------------------------- cada cuadro
  update(dt) {
    const L = this.getLocal();
    const now = this.now();
    // semáforo: una luz roja por segundo, se apagan todas y ¡verde!
    if (this.race) {
      const k = now - this.race.t0;
      const n = k < -5 ? 0 : k < 0 ? Math.min(5, Math.floor(k + 6)) : k < 2.5 ? 6 : 0;
      if (n !== this._lightsN) {
        this._lightsN = n;
        this.circuit.setLights(n);
        const at = V1.set(this.circuit.startP[0], 5, this.circuit.startP[1]);
        if (n >= 1 && n <= 5) G.sfx?.trigger('ui', at, 0.9, { full: 20, max: 120, rate: 0.8 });
        if (n === 6) { G.sfx?.trigger('ui-ok', at, 1, { full: 20, max: 140, rate: 1.1 }); if (this.race.mine) this.big('¡VERDE!', 'Dale que va', 1200); }
      }
      if (k > 900) this.race = null;
    }
    if (!L || L.dead) { this.prevD = null; this._hud(null); return; }
    const v = L.vehicle, driving = v && v.seats?.[0] === G.myId;
    const inZone = L.pos.x < -28 && L.pos.z > 6;
    if (inZone) this._traps(L, v, now);
    if (!driving || !inZone) { this.prevD = null; this._hud(null); return; }
    // por dónde pasó: el tramo Guts and Glory es el control (sin pasar por ahí no cuenta la vuelta)
    if (v.pos.z < 34 && v.pos.x < -95) this.gg = true;
    const d = this._lineD(v.pos.x, v.pos.z), lat = this._lineLat(v.pos.x, v.pos.z);
    const crossed = this.prevD !== null && this.prevD < 0 && d >= 0 && Math.abs(lat) < HALF + 1.5;
    this.prevD = d;
    const R = this.race?.mine;
    if (crossed) {
      const t = G.time;
      if (R && !R.armed) {
        if (now >= this.race.t0) { R.armed = true; R.lap = 1; R.start = t; this.lapStart = t; this.gg = false; }
      } else if (this.lapStart !== null && this.gg) {
        const lapT = t - this.lapStart, best = lapT < this.best;
        if (best) this.best = lapT;
        this.lap++;
        this.notify(`🏁 Vuelta ${R ? `${R.lap}/${this.race.laps}` : this.lap}: <b>${fmt(lapT)}</b>${best ? ' · ¡mejor vuelta!' : ''}`);
        G.sfx?.trigger(best ? 'ui-ok' : 'ui', null, 0.6);
        this.getNet()?.send({ t: 'ev', k: 'lap', s: +lapT.toFixed(2), best: best ? 1 : 0 });
        if (R) {
          if (R.lap >= this.race.laps) {
            const total = t - R.start;
            this.race.finishers.push(G.myId);
            const pos = this.race.finishers.length;
            this.big(pos === 1 ? '🏆 ¡GANASTE!' : `LLEGASTE ${pos}°`, `Carrera de ${this.race.laps} vueltas en ${fmt(total)}`, 3200);
            this.getNet()?.send({ t: 'ev', k: 'raceFin', s: +total.toFixed(2) });
            this.race.mine = null;
          } else R.lap++;
        }
      } else if (this.lapStart === null || !this.gg) {
        if (this.lapStart !== null && !this.gg) this.notify('🚫 Esa vuelta no cuenta: hay que pasar por el Guts and Glory.');
      }
      this.lapStart = t; this.gg = false;
    }
    this._hud(v);
  }
  _hud(v) {
    if (!this.hud) return;
    if (!v || this.lapStart === null) {
      const R = this.race;
      if (v && R && this.now() < R.t0 + 3 && R.mine) { this.hud.classList.remove('hidden'); this.hud.textContent = this.now() < R.t0 ? '🚦 Preparate…' : '¡DALE!'; return; }
      this.hud.classList.add('hidden');
      return;
    }
    const R = this.race?.mine;
    const lapT = G.time - this.lapStart;
    this.hud.classList.remove('hidden');
    this.hud.innerHTML = `${R ? `VUELTA <b>${Math.min(R.lap, this.race.laps)}/${this.race.laps}</b> · ` : ''}<b>${fmt(lapT)}</b>${Number.isFinite(this.best) ? ` · mejor ${fmt(this.best)}` : ''} · ${Math.round(Math.abs(v.speed || 0) * 3.6)} km/h`;
  }

  // ---------------------------------------------------------------- trampas
  _box(L, v) {
    // caja (en mundo, alineada a los ejes) de lo mío: el vehículo con el que voy arriba, o yo a pie
    if (v) {
      const [hx, hz, h] = SIZE[v.type] || SIZE.mower, c = Math.abs(Math.cos(v.yaw)), s = Math.abs(Math.sin(v.yaw));
      const ex = hx * c + hz * s, ez = hx * s + hz * c;
      return { x0: v.pos.x - ex, x1: v.pos.x + ex, z0: v.pos.z - ez, z1: v.pos.z + ez, y0: v.pos.y, y1: v.pos.y + h, x: v.pos.x, z: v.pos.z, grounded: !v.air };
    }
    return { x0: L.pos.x - 0.35, x1: L.pos.x + 0.35, z0: L.pos.z - 0.35, z1: L.pos.z + 0.35, y0: L.pos.y, y1: L.pos.y + 1.8, x: L.pos.x, z: L.pos.z, grounded: L.grounded };
  }
  _traps(L, v, now) {
    if (G.time < this.hitT || L.immortal) return;
    const B = this._box(L, v);
    const over = (x0, x1, y0, y1, z0, z1) => B.x1 > x0 && B.x0 < x1 && B.y1 > y0 && B.y0 < y1 && B.z1 > z0 && B.z0 < z1;
    const T = TRAPS;
    const a = axeBlade(now);
    if (over(a.x - 1.0, a.x + 1.0, a.y - 0.95, a.y + 0.95, T.axe.z - 0.14, T.axe.z + 0.14)) return this._hit('axe', L, v, V1.set(Math.sign(a.vx || 1) * 9, 3, 0), V2.set(a.x, a.y, a.z));
    const P = T.spikes;
    if (B.grounded && B.y0 < 0.6 && B.x > P.x - HALF - 0.2 && B.x < P.x + HALF + 0.2 && B.z > P.z0 && B.z < P.z1) return this._hit('spikes', L, v, V1.set(0, 1.5, 0), V2.set(B.x, 0.4, B.z));
    const S = T.saws;
    for (let k = 0; k < 2; k++) { const sx = sawX(now, k); if (over(sx - S.r, sx + S.r, 0, S.y + S.r, S.z - 0.12, S.z + 0.12)) return this._hit('saw', L, v, V1.set(0, 4, v ? -Math.sign(Math.cos(v.yaw)) * 3 : 0), V2.set(sx, 0.6, S.z)); }
    const C = T.crusher, cy = crusherY(now);
    if (cy < 1.7 && over(C.x - HALF - 0.2, C.x + HALF + 0.2, 0, cy, C.z - C.depth / 2, C.z + C.depth / 2)) return this._hit('crush', L, v, V1.set(0, -2, 0), V2.set(B.x, 0.3, B.z));
    const bp = ballPos(now), br = T.ball.r;
    if (over(bp.x - br, bp.x + br, bp.y - br, bp.y + br, bp.z - br, bp.z + br)) return this._hit('ball', L, v, V1.set(0, 6, Math.sign(bp.vz || 1) * 16), V2.set(bp.x, bp.y, bp.z));
    for (let i = 0; i < MINES.length; i++) {
      const m = MINES[i], g = this.circuit.mines[i];
      if (g && !g.armed) continue;
      if (B.x1 + 0.3 > m.x && B.x0 - 0.3 < m.x && B.z1 + 0.3 > m.z && B.z0 - 0.3 < m.z && B.y0 < 0.5) {
        this.circuit.mineGone(i);
        G.items?._blastFx?.(V2.set(m.x, 0.2, m.z));
        this.getNet()?.send({ t: 'ev', k: 'mine', i });
        return this._hit('mine', L, v, V1.set((Math.random() - 0.5) * 6, 12, (Math.random() - 0.5) * 6), V2.set(m.x, 0.3, m.z));
      }
    }
  }
  // qué le pasa a uno según la trampa: los de moto o a pie la ligan peor que adentro de un auto de carrera
  _hit(kind, L, v, push, at) {
    this.hitT = G.time + 2.2;
    const exposed = !v || v.type === 'moto' || v.type === 'mower' || v.type === 'cart' || v.type === 'tractor';
    const lines = KILL_LINES[kind], [title, sub] = lines[Math.floor(Math.random() * lines.length)];
    this.shake?.(kind === 'crush' || kind === 'mine' ? 1.2 : 0.8);
    G.fx?.blood?.(at.clone(), V1.clone().normalize(), kind === 'crush' ? 2.2 : 1.3);
    G.blood?.add(at.x, at.z, kind === 'crush' ? 2.8 : 1.4, 0x5a0006, 0.03, 600);
    const sfx = { axe: 'hit', spikes: 'hit', saw: 'cut', crush: 'door-slam', ball: 'hit', mine: null }[kind];
    if (sfx) G.sfx?.trigger(sfx, at, 1, { full: 4, max: 40 });
    if (kind === 'saw') G.fx?.sparks?.(at, V1.set(0, 1, 0), 24);
    // el vehículo: se frena (la mina lo hace volar)
    if (v) {
      if (kind === 'mine') { v.vy = 9 + Math.random() * 3; v.air = true; v.speed *= 0.45; }
      else if (kind === 'ball') { v.speed = -v.speed * 0.3; v.vy = 4; v.air = true; }
      else v.speed = 0;
    }
    const fly = push.clone();
    const out = () => { if (v) { L.eject(fly); G.vehicles?.exitCurrent(); } else L.knockout(3, 0, fly); };
    switch (kind) {
      case 'crush':
        L.damage(999);
        if (L.dead) L._gore?.(GORE_HEAD_POP, V1.set(0, -1, 0));
        if (v) G.vehicles?.exitCurrent();
        break;
      case 'spikes':
        if (exposed || v?.type === 'racecar') { out(); L.damage(exposed ? 140 : 70); if (!L.dead) L._gore?.(GORE_GUTS, V1.set(0, 1, 0)); }
        break;
      case 'axe':
        if (exposed) {
          out();
          if (Math.random() < 0.4) L._gore?.(GORE_HEAD_POP, fly);
          else { L.damage(55); L._gore?.(1 << [PART.UARM_L, PART.UARM_R, PART.FARM_L][Math.floor(Math.random() * 3)], fly); }
        } else { out(); L.damage(60); }
        break;
      case 'saw':
        out();
        L.damage(exposed ? 50 : 35);
        if (exposed && !L.dead) L._gore?.(1 << (Math.random() < 0.5 ? PART.SHIN_L : PART.SHIN_R), V1.set(0, 2, 0));
        break;
      case 'ball':
        out(); L.damage(exposed ? 55 : 30);
        break;
      case 'mine':
        if (exposed) { out(); L.damage(60); if (!L.dead) L.blastGore?.(0.8, fly); }
        else L.damage(35);
        break;
    }
    this.big(title, sub, 1800);
  }
}
