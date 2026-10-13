// Sustos del piso de arriba del torreón y de las torres (world/castle-expansion.js). Cada cuarto tiene dos o tres
// versiones y elige una al azar cada vez (no siempre pasa lo mismo), con su recarga. Además, mientras andás por el
// castillo, cada tanto suena algo que no está: golpes en una puerta, cadenas, un llanto, pasos arriba.
// Usa lo que ya tiene Haunt (game/haunt.js): apagar las luces de un cuarto, el espectro, la dama, los latidos.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { UPPER_FLOOR } from '../world/castle-expansion.js';

const Y = UPPER_FLOOR;
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), M4 = new THREE.Matrix4();
export const UPPER_ZONES = {
  condes: [-23.8, Y - 0.5, -125.8, -8.3, 16, -115.25],
  carto: [-23.8, Y - 0.5, -114.75, -8.3, 16, -104.2],
  botica: [8.3, Y - 0.5, -125.8, 23.8, 16, -115.25],
  armeria: [8.3, Y - 0.5, -114.75, 23.8, 16, -104.2],
  archivo: [-7.7, Y - 0.5, -125.8, 7.7, 16, -117.1],
  torreNO: [-49.5, -0.5, -135.5, -40.5, 17, -126.5], torreNE: [40.5, -0.5, -135.5, 49.5, 17, -126.5],
  torreSO: [-49.5, -0.5, -83.5, -40.5, 17, -74.5], torreSE: [40.5, -0.5, -83.5, 49.5, 17, -74.5],
};
const pick = (n) => Math.floor(Math.random() * n);
const at = (x, y, z) => new THREE.Vector3(x, y, z);

export class UpperHaunts {
  constructor(h) {
    this.h = h;
    this.ambT = 20 + Math.random() * 20;
    this.steps = null; // pasos que te siguen en la escalera de una torre
  }
  get sfx() { return G.sfx; }
  later(ms, fn) { setTimeout(fn, ms); }

  enter(id) {
    const h = this.h;
    switch (id) {
      case 'condes': if (h._can('up_condes', 110)) this.condes(); break;
      case 'carto': if (h._can('up_carto', 100)) this.carto(); break;
      case 'botica': if (h._can('up_botica', 100)) this.botica(); break;
      case 'armeria': if (h._can('up_armeria', 100)) this.armeria(); break;
      case 'archivo': if (h._can('up_archivo', 120)) this.archivo(); break;
      default: if (id.startsWith('torre') && h._can('up_' + id, 90)) this.tower(id);
    }
  }

  // ---------------------------------------------------------------- los aposentos del Conde
  condes() {
    const h = this.h, s = this.sfx, box = UPPER_ZONES.condes, bed = at(-18.5, Y, -123.1);
    const v = pick(3);
    if (v === 0) {
      // las velas se apagan; cuando vuelven, el Conde está sentado en su cama mirándote... y se te tira encima
      h._lightsOut(box, { dur: 1.6, back: 3.2, keep: 0.05 });
      s?.trigger('ghost-breath', bed, 0.7, { full: 2, max: 14 });
      this.later(2200, () => {
        const w = h.count; if (!w) return;
        w.show(V1.set(bed.x + 0.4, Y + 0.45, bed.z + 0.6), Math.PI * 0.5, 'sit', 1);
        s?.trigger('whisper', bed, 0.8, { full: 2, max: 12 });
      });
      this.later(4400, () => {
        const w = h.count; if (!w?.visible || !G.camera) return;
        w.rush(G.camera.position.clone().setY(Y + 0.1), 12);
        s?.trigger('ghost-scream', w.pos, 1, { full: 4, max: 30 });
        w.onDone = () => h._jumpscare();
      });
    } else if (v === 1) {
      // alguien golpea el ropero desde adentro, cada vez más fuerte; después silencio total y un suspiro en la nuca
      const wardrobe = at(-22.6, Y + 1.2, -118);
      [0, 600, 1100, 1450, 1700].forEach((ms, k) => this.later(ms, () => { s?.trigger('knock', wardrobe, 0.45 + k * 0.12, { full: 2, max: 18 }); if (k === 4) G.fx?.puff(wardrobe, V2.set(1, 0, 0), 0.6, 0x4a4440); }));
      this.later(3800, () => { const me = G.me?.pos; if (me) s?.trigger('ghost-breath', V1.copy(me).setY(me.y + 1.6), 0.9, { full: 1, max: 6 }); h._scare(0.7); });
    } else {
      // la cajita de música del tocador arranca sola, la dama cruza el cuarto caminando, se apaga todo de golpe
      s?.trigger('musicbox', at(-12.5, Y + 1, -124.6), 0.6, { full: 2, max: 14, rate: 0.85 });
      this.later(1600, () => {
        const g = h.lady?.g; if (!g) return;
        h.lady.flashOnly = false;
        g.show(V1.set(-22.4, Y, -116.4), Math.PI * 0.75, 'stand', 0.7);
        g.walk(V2.set(-9.6, Y, -124.2), 1.0);
      });
      this.later(6200, () => { h._lightsOut(box, { dur: 0.2, back: 2.5, keep: 0 }); s?.trigger('stinger', null, 0.8); h._scare(0.9); });
    }
  }

  // ---------------------------------------------------------------- el gabinete de cartografía
  carto() {
    const h = this.h, s = this.sfx, c = h.castle;
    const v = pick(2);
    if (v === 0) {
      // la esfera armilar gira loca, las cortinas se sacuden, un viento helado y un portazo detrás
      if (c.armillary) c.armillary.until = G.time + 8;
      s?.trigger('gust', c.anchors.armillary, 0.8, { full: 3, max: 20 });
      s?.trigger('clock-chime', c.anchors.armillary, 0.5, { full: 2, max: 18, rate: 0.7 });
      this.later(2600, () => { s?.trigger('door-slam', at(-11.5, Y + 1.5, -115), 1, { full: 3, max: 30 }); h._scare(0.7); });
    } else {
      // papeles: alguien escribe a toda velocidad en el escritorio (pluma raspando) y se ríe bajito
      const desk = at(-16, Y + 1, -107.5);
      for (let k = 0; k < 9; k++) this.later(k * 170, () => s?.trigger('cloth', desk, 0.35, { full: 1.5, max: 10, rate: 1.7 + Math.random() * 0.4 }));
      this.later(1900, () => s?.trigger('whisper', desk, 0.7, { full: 2, max: 12 }));
      this.later(3300, () => { h._lightsOut(UPPER_ZONES.carto, { dur: 0.6, back: 2.2, keep: 0.05 }); s?.trigger('ghost-wail', desk, 0.7, { full: 3, max: 20 }); h._scare(0.6); });
    }
  }

  // ---------------------------------------------------------------- la botica de medianoche
  botica() {
    const h = this.h, s = this.sfx, c = h.castle;
    const v = pick(2);
    if (v === 0 && c.potionShelves?.length) {
      // los frascos de los estantes revientan de a uno, de izquierda a derecha; al final, una carcajada
      const list = c.potionShelves.flatMap((p) => p.list.map((it) => ({ ...it, im: p.im }))).sort((a, b) => a.pos.x - b.pos.x);
      list.forEach((it, k) => this.later(300 + k * 120, () => {
        it.im.getMatrixAt(it.i, M4); it.saved = M4.clone();
        it.im.setMatrixAt(it.i, M4.makeScale(0, 0, 0)); it.im.instanceMatrix.needsUpdate = true;
        G.fx?.glass?.(it.pos.clone(), 10, 0x5c8761);
        s?.trigger('glass', it.pos, 0.55, { full: 2, max: 16 });
      }));
      this.later(300 + list.length * 120 + 500, () => { s?.trigger('devil-laugh', at(16, Y + 1.6, -122), 0.55, { full: 3, max: 22, rate: 1.25 }); h._scare(0.8); });
      // a los dos minutos el boticario repone todo
      this.later(120000, () => { for (const it of list) if (it.saved) { it.im.setMatrixAt(it.i, it.saved); it.im.instanceMatrix.needsUpdate = true; } });
    } else {
      // humo verde que sale del caldero, tos, y una voz que te pide que pruebes
      const p = at(15.6, Y + 0.9, -119.5);
      for (let k = 0; k < 8; k++) this.later(k * 220, () => G.fx?.puff(p, V2.set((Math.random() - 0.5) * 0.4, 1, (Math.random() - 0.5) * 0.4), 1.4, 0x5e8a4a));
      this.later(900, () => s?.trigger('cough', p, 0.6, { full: 2, max: 14 }));
      this.later(2400, () => s?.trigger('whisper', p, 0.85, { full: 2, max: 12 }));
      this.later(3600, () => { s?.trigger('ghost-scream', p, 0.7, { full: 3, max: 20 }); h._scare(0.8); });
    }
  }

  // ---------------------------------------------------------------- la armería del Conde
  armeria() {
    const h = this.h, s = this.sfx;
    const v = pick(2);
    if (v === 0) {
      // el espectro entra por la ventana y atraviesa el cuarto rozándote
      const w = h.count; if (!w || !G.camera) return;
      w.show(V1.set(23.2, Y, -109), -Math.PI / 2, 'stand', 0.9);
      s?.trigger('gust', V1, 0.9, { full: 3, max: 22 });
      this.later(500, () => { w.rush(G.camera.position.clone().setY(Y + 0.1), 10); s?.trigger('ghost-wail', w.pos, 0.9, { full: 4, max: 26 }); w.onDone = () => h._jumpscare(); });
    } else {
      // metal que cae: escudos y mazas golpean el piso uno atrás del otro, como si alguien los tirara
      [0, 420, 700, 1300].forEach((ms, k) => this.later(ms, () => s?.trigger('metal', at(10 + k * 3.5, Y + 0.3, -114.7), 0.8, { full: 3, max: 22, rate: 0.7 + k * 0.08 })));
      this.later(2100, () => { s?.trigger('ghost-moan', at(16, Y + 1.5, -110), 0.8, { full: 3, max: 22 }); h._scare(0.6); });
    }
  }

  // ---------------------------------------------------------------- el archivo del campanario
  archivo() {
    const h = this.h, s = this.sfx, c = h.castle;
    const v = pick(2);
    if (v === 0) {
      // la campana toca sola tres veces y el gabinete se abre de golpe
      [0, 1400, 2800].forEach((ms) => this.later(ms, () => s?.trigger('bell', at(0, 27, -121.4), 0.7, { full: 10, max: 120 })));
      this.later(3600, () => { if (c.archiveCabinet) c.archiveCabinet.target = 1; s?.trigger('door-slam', c.anchors.upperArchive, 0.9, { full: 3, max: 22 }); h._scare(0.8); });
    } else {
      // pasos pesados en el techo que cruzan de una punta a la otra y se detienen justo arriba tuyo
      const me = G.me?.pos;
      for (let k = 0; k < 7; k++) this.later(k * 520, () => s?.trigger('step-hard', at(-6 + k * 1.6, 16.1, -121.4), 0.9, { full: 3, max: 18, rate: 0.55 }));
      this.later(7 * 520 + 900, () => { if (me) s?.trigger('knock', V1.set(me.x, 16.1, me.z), 1, { full: 3, max: 18, rate: 0.6 }); h._scare(0.5); });
    }
  }

  // ---------------------------------------------------------------- las torres
  tower(id) {
    const h = this.h, s = this.sfx, box = UPPER_ZONES[id];
    const cx = (box[0] + box[3]) / 2, cz = (box[2] + box[5]) / 2;
    const v = pick(2);
    if (v === 0) {
      // pasos que te siguen por la escalera: suenan cuando caminás y paran cuando parás
      this.steps = { id, t: 0, until: G.time + 25, last: G.me?.pos.clone() };
      s?.trigger('ghost-breath', at(cx, 1.5, cz), 0.45, { full: 2, max: 14 });
    } else {
      // una bandada de cuervos estalla desde arriba de la torre y algo cae por el hueco de la escalera
      for (let k = 0; k < 6; k++) this.later(k * 140, () => s?.trigger('crow', at(cx + (Math.random() - 0.5) * 4, 14, cz + (Math.random() - 0.5) * 4), 0.8, { full: 4, max: 40 }));
      this.later(1500, () => { s?.trigger('wood', at(cx, 3, cz), 1, { full: 3, max: 20, rate: 0.6 }); G.fx?.puff(at(cx, 0.5, cz), V2.set(0, 1, 0), 1.6, 0x6a625a); h._scare(0.6); });
    }
  }

  update(dt) {
    const me = G.me?.pos, h = this.h;
    if (!me) return;
    // los pasos de la torre: un eco que te sigue a un par de metros, al ritmo de tu andar
    const st = this.steps;
    if (st) {
      const moved = st.last ? Math.hypot(me.x - st.last.x, me.z - st.last.z) + Math.abs(me.y - st.last.y) : 0;
      st.last?.copy(me);
      st.t += moved;
      if (st.t > 0.9) { st.t = 0; echoStep(this.sfx, me); }
      // se termina al salir de la torre; si aguantaste hasta el final, un último susto
      if (G.time > st.until || !h.inside[st.id]) { if (G.time > st.until) h._scare(0.4); this.steps = null; }
    }
    // ruidos que no están: solo adentro del castillo, cada 25 a 60 s, lejos de lo que ves
    const inCastle = Object.entries(h.inside).some(([k, v]) => v && k !== 'graveyard' && k !== 'eastcourt');
    if (!inCastle) return;
    this.ambT -= dt;
    if (this.ambT > 0) return;
    this.ambT = 25 + Math.random() * 35;
    const fwd = G.camera ? G.camera.getWorldDirection(V2).setY(0).normalize() : V2.set(0, 0, 1);
    const p = V1.copy(me).addScaledVector(fwd, -(4 + Math.random() * 4)).add(V2.set((Math.random() - 0.5) * 6, 0.5 + Math.random() * 2, (Math.random() - 0.5) * 6));
    const k = pick(6);
    if (k === 0) [0, 380, 760].forEach((ms) => this.later(ms, () => this.sfx?.trigger('knock', p, 0.6, { full: 2, max: 18 })));
    else if (k === 1) this.sfx?.trigger('creak', p, 0.7, { full: 2, max: 18, rate: 0.6 });
    else if (k === 2) this.sfx?.trigger('ghost-wail', p, 0.35, { full: 3, max: 30, rate: 1.2 });
    else if (k === 3) this.sfx?.trigger('door-creak', p, 0.55, { full: 2, max: 20, rate: 0.7 });
    else if (k === 4) this.sfx?.trigger('whisper', p, 0.45, { full: 1.5, max: 10 });
    else for (let i = 0; i < 4; i++) this.later(i * 450, () => this.sfx?.trigger('step-hard', V1.set(me.x + 3, me.y + 6, me.z), 0.5, { full: 3, max: 14, rate: 0.6 }));
  }
}

// un paso del eco: atrás tuyo, un poco a destiempo
function echoStep(sfx, me) {
  const fwd = G.camera ? G.camera.getWorldDirection(V2).setY(0).normalize() : V2.set(0, 0, 1);
  const p = V1.copy(me).addScaledVector(fwd, -2.2).setY(me.y + 0.1);
  setTimeout(() => sfx?.trigger('step-hard', p, 0.55, { full: 1.5, max: 12, rate: 0.8 + Math.random() * 0.1 }), 180 + Math.random() * 120);
}
