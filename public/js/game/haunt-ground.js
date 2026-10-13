// Sustos nuevos de la planta baja del torreón (cocina, biblioteca, y variantes para el salón y el comedor). Igual que
// los del piso de arriba (game/haunt-upper.js): cada cuarto tiene varias versiones y elige una al azar cada vez, con
// su recarga, y usa lo que ya tiene Haunt (apagones por cuarto, la dama, latidos, el susto).
import * as THREE from 'three';
import { G } from '../core/G.js';
import { CASTLE } from '../shared/mapdata.js';

const F0 = CASTLE.keep.floor;
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
const pick = (n) => Math.floor(Math.random() * n);
const at = (x, y, z) => new THREE.Vector3(x, y, z);
const BOX = {
  kitchen: [-23.8, F0 - 0.5, -125.8, -8.3, 9, -115.3],
  library: [8.3, F0 - 0.5, -114.7, 23.8, 9, -104.2],
  hall: [-7.7, F0 - 0.5, -116.5, 7.7, 9, -104.8],
  dining: [-23.8, F0 - 0.5, -114.7, -8.3, 9, -104.2],
};
const BOOK_COLORS = [0x5a1a14, 0x1d3a2a, 0x2a2a4a, 0x4a3a1a, 0x3a1a3a, 0x6a4a2a, 0x222222];

export class GroundHaunts {
  constructor(h) {
    this.h = h;
    this.books = []; // los libros que volaron (quedan tirados un rato)
  }
  get sfx() { return G.sfx; }
  later(ms, fn) { setTimeout(fn, ms); }
  _near(p, r) { return this.h._near(p, r); }

  enter(id) {
    const h = this.h;
    if (id === 'kitchen' && h._can('g_kitchen', 110)) this.kitchen();
    else if (id === 'library' && h._can('g_library', 110)) this.library();
    else if (id === 'hall' && Math.random() < 0.6 && h._can('g_hall', 140)) this.hall();
    else if (id === 'dining' && h._can('g_dining', 150)) this.dining();
  }

  // ---------------------------------------------------------------- la cocina
  kitchen() {
    const h = this.h, s = this.sfx, stove = at(-16.5, F0, -124.7), v = pick(3);
    if (v === 0) {
      // la cocinera: se apaga todo y en la oscuridad alguien pica algo; al volver la luz está de espaldas, en la
      // mesada... deja de picar, gira la cabeza y se te viene
      h._lightsOut(BOX.kitchen, { dur: 1.3, back: 2.6, keep: 0.04 });
      for (let k = 0; k < 11; k++) this.later(500 + k * 390 + (k > 5 ? 600 : 0), () => s?.trigger('cut', V1.set(stove.x, F0 + 0.95, stove.z), 0.55, { full: 2, max: 14, rate: 0.9 + Math.random() * 0.2 }));
      this.later(2700, () => {
        const g = h.lady?.g; if (!g) return;
        h.lady.flashOnly = false;
        g.show(V1.set(stove.x, F0, stove.z + 0.55), Math.PI, 'stand', 0.8);
        g.pose.headYaw = 0;
      });
      this.later(5600, () => { // silencio... y gira la cabeza
        const g = h.lady?.g; if (!g?.visible) return;
        g.pose.headYaw = 1.2;
        s?.trigger('ghost-breath', g.pos, 0.8, { full: 2, max: 12 });
        h.heart = Math.max(h.heart, 0.8);
      });
      this.later(7000, () => {
        const g = h.lady?.g; if (!g?.visible) return;
        g.pose.headYaw = 0;
        if (!this._near(stove, 12) || !G.camera) { g.hide(); return; }
        g.rush(G.camera.position.clone().setY(F0 + 0.1), 11);
        g.onDone = () => h._jumpscare();
        s?.trigger('ghost-scream', g.pos, 1, { full: 4, max: 30 });
      });
    } else if (v === 1) {
      // las ollas colgadas empiezan a golpearse entre sí, un cajón se abre de golpe, se rompe algo... y lo que
      // estaba bajo la sábana se sienta
      const rack = at(-16, F0 + 2.45, -121);
      for (let k = 0; k < 9; k++) this.later(k * 230 + Math.random() * 120, () => s?.trigger(k % 3 ? 'pot' : 'metal', V1.set(rack.x + (Math.random() - 0.5) * 2.4, rack.y, rack.z), 0.25 + k * 0.05, { full: 2, max: 16 }));
      this.later(2300, () => s?.trigger('draw', at(-20.5, F0 + 0.9, -125.2), 0.9, { full: 2, max: 14 }));
      this.later(2900, () => {
        const p = at(-12.5, F0 + 1.2, -125.2);
        s?.trigger('plate', p, 0.9, { full: 3, max: 20 }); s?.trigger('glass', p, 0.6, { full: 3, max: 20 });
        G.fx?.glass(p, 14, 0xd8d0c0);
      });
      this.later(4200, () => h.play('sheet'));
    } else {
      // alguien golpea la puerta de la alacena desde adentro, cada vez más fuerte; se corta; y te respiran en la nuca
      const pantry = at(-23.5, F0 + 1.3, -117.3);
      [0, 700, 1250, 1650, 1900, 2100].forEach((ms, k) => this.later(ms, () => {
        s?.trigger('knock', pantry, 0.35 + k * 0.12, { full: 2, max: 18 });
        if (k >= 3) G.fx?.puff(pantry, V2.set(1, 0, 0), 0.4, 0x4a4440);
      }));
      this.later(2200, () => h._lightsOut(BOX.kitchen, { dur: 0.15, back: 0.6, keep: 0.2 }));
      this.later(4600, () => {
        const me = G.me?.pos;
        if (!me || !this._near(pantry, 14)) return;
        s?.trigger('ghost-wail', V1.copy(me).setY(me.y + 1.6), 0.8, { full: 1, max: 8 });
        h._scare(0.8);
      });
    }
  }

  // ---------------------------------------------------------------- la biblioteca
  library() {
    const h = this.h, s = this.sfx, v = pick(3);
    if (v === 0) {
      // los libros se tiran solos de los estantes, hacia vos
      const shelves = [10.6, 13.5, 19.5, 22.4];
      s?.trigger('whisper', at(16, F0 + 1.8, -113.5), 0.6, { full: 2, max: 16 });
      for (let k = 0; k < 10; k++) this.later(400 + k * 170 + Math.random() * 90, () => this._throwBook(at(shelves[k % 4] + (Math.random() - 0.5) * 1.2, F0 + 0.55 + Math.random() * 1.6, -114.15)));
      this.later(900, () => h._scare(0.55));
    } else if (v === 1) {
      // el lector: se apagan las velas; al volver hay alguien leyendo en el sillón, da vuelta la página... y te mira
      const chair = at(17.5, F0, -107.45);
      h._lightsOut(BOX.library, { dur: 1.2, back: 2.2, keep: 0.05 });
      this.later(2000, () => {
        const g = h.lady?.g; if (!g) return;
        h.lady.flashOnly = false;
        g.show(V1.set(chair.x, F0, chair.z - 0.08), Math.PI, 'sit', 0.75);
        g.pose.look = 0.5; // mirando el libro
      });
      for (let k = 0; k < 3; k++) this.later(2600 + k * 1300, () => s?.trigger('cloth', V1.set(chair.x, F0 + 1, chair.z), 0.45, { full: 1.5, max: 10 }));
      this.later(6400, () => { const g = h.lady?.g; if (g?.visible) { g.pose.look = -0.7; s?.trigger('ghost-breath', g.pos, 0.6, { full: 2, max: 12 }); h.heart = Math.max(h.heart, 0.8); } });
      this.later(7800, () => {
        h._lightsOut(BOX.library, { dur: 0.25, back: 0.5, keep: 0 });
        this.later(200, () => h.lady?.g?.hide(true));
        const me = G.me?.pos;
        if (me && this._near(chair, 14)) { s?.trigger('whisper', V1.copy(me).setY(me.y + 1.6), 0.9, { full: 1, max: 6 }); h._scare(0.7); }
      });
    } else {
      // pasos en el piso de arriba que cruzan el cuarto, se paran justo encima tuyo, dos golpes y cae polvo
      const y = F0 + 5.6;
      for (let k = 0; k < 12; k++) this.later(k * 380, () => s?.trigger('step-wood', V1.set(9.5 + k * 1.2, y, -109.5 + Math.sin(k) * 0.6), 0.55, { full: 3, max: 20, rate: 0.85 }));
      this.later(5400, () => {
        const me = G.me?.pos; if (!me) return;
        for (let k = 0; k < 2; k++) this.later(k * 520, () => {
          s?.trigger('knock', V1.set(me.x, y, me.z), 0.75, { full: 3, max: 20, rate: 0.7 });
          G.fx?.puff(V2.set(me.x, F0 + 4.4, me.z), V1.set(0, -1, 0), 1.2, 0x8a8070);
        });
        this.later(1400, () => { s?.trigger('creak', V1.set(me.x, y, me.z), 0.6, { full: 3, max: 20 }); h._scare(0.5); });
      });
    }
  }
  _throwBook(from) {
    if (!this.h.scene) return;
    const me = G.me?.pos;
    const w = 0.03 + Math.random() * 0.03, hgt = 0.2 + Math.random() * 0.06, d = 0.15 + Math.random() * 0.04;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), new THREE.MeshStandardMaterial({ color: BOOK_COLORS[pick(BOOK_COLORS.length)], roughness: 0.7 }));
    m.castShadow = true;
    m.position.copy(from);
    this.h.scene.add(m);
    // hacia vos (si estás en la biblioteca), con un arco; si no, al medio del cuarto
    const to = me && me.z > -114.7 && me.z < -104.2 && me.x > 8.3 ? V1.set(me.x, F0 + 1.2, me.z) : V1.set(16, F0 + 0.8, -109.5);
    const v = to.clone().sub(from); const T = 0.55 + v.length() * 0.08;
    const vel = new THREE.Vector3(v.x / T, v.y / T + 4.9 * T, v.z / T);
    this.books.push({ m, vel, spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14), t: 0, down: false });
    this.sfx?.trigger('cloth', from, 0.5, { full: 2, max: 14, rate: 1.2 });
  }

  // ---------------------------------------------------------------- el salón (otra cosa que puede pasar al entrar)
  hall() {
    const h = this.h, s = this.sfx;
    if (pick(2) === 0) {
      // alguien corre por la galería de arriba de una punta a la otra y se cierra una puerta de un golpe
      for (let k = 0; k < 10; k++) this.later(k * 210, () => s?.trigger('step-wood', V1.set(-7 + k * 1.5, 7.9, -115.4), 0.6, { full: 3, max: 22, rate: 1.15 }));
      this.later(2300, () => { s?.trigger('door-slam', at(7.2, 8.5, -115.6), 0.85, { full: 4, max: 40 }); h._scare(0.45); });
    } else {
      // el candelabro: tiemblan las luces, rechina la cadena y le llueven vidrios al que está abajo
      const top = at(0, F0 + 5.2, -110.5);
      h._lightsOut(BOX.hall, { dur: 0.2, back: 0.4, keep: 0.4 });
      s?.trigger('creak', top, 0.8, { full: 3, max: 24, rate: 0.6 });
      this.later(700, () => s?.trigger('metal', top, 0.5, { full: 3, max: 24, rate: 0.7 }));
      this.later(1500, () => {
        const me = G.me?.pos;
        const p = me && Math.hypot(me.x - top.x, me.z - top.z) < 6 ? V1.set(me.x, F0 + 3.6, me.z) : V1.copy(top).setY(F0 + 3.6);
        s?.trigger('glass', p, 0.9, { full: 3, max: 24 });
        G.fx?.glass(p, 26, 0xe8f0ff);
        h._lightsOut(BOX.hall, { dur: 0.15, back: 1.5, keep: 0.2 });
        h._scare(0.6);
      });
    }
  }

  // ---------------------------------------------------------------- el comedor (si no tocó el anfitrión)
  dining() {
    const h = this.h, s = this.sfx, table = at(-16, F0 + 0.9, -109.5);
    // los cubiertos tiemblan sobre la mesa, se arrastra una silla, las velas se apagan de punta a punta
    for (let k = 0; k < 14; k++) this.later(k * 120, () => s?.trigger('metal', V1.set(table.x + (Math.random() - 0.5) * 6, table.y, table.z + (Math.random() - 0.5) * 1.5), 0.12 + k * 0.012, { full: 2, max: 14, rate: 1.6 + Math.random() * 0.4 }));
    this.later(1900, () => s?.trigger('creak', at(-10.5, F0 + 0.4, -108.6), 0.8, { full: 2, max: 18, rate: 0.75 }));
    this.later(2600, () => h._lightsOut(BOX.dining, { from: at(-23, F0, -109.5), dur: 1.6, back: 2.4, keep: 0.05 }));
    this.later(4300, () => { s?.trigger('ghost-moan', table, 0.7, { full: 3, max: 18 }); if (this._near(table, 12)) h._scare(0.6); });
  }

  // ---------------------------------------------------------------- por cuadro: los libros que vuelan
  update(dt) {
    for (let i = this.books.length - 1; i >= 0; i--) {
      const b = this.books[i];
      b.t += dt;
      if (!b.down) {
        b.vel.y -= 9.8 * dt;
        b.m.position.addScaledVector(b.vel, dt);
        b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
        // cae al piso (acostado) o choca contra alguien (te pega)
        const me = G.me?.pos;
        if (me && !b.hit && Math.hypot(me.x - b.m.position.x, me.z - b.m.position.z) < 0.35 && b.m.position.y > me.y + 0.3 && b.m.position.y < me.y + 1.9) {
          b.hit = true; b.vel.multiplyScalar(-0.25); this.sfx?.trigger('hit-soft', b.m.position, 0.5, { full: 1, max: 8 });
        }
        if (b.m.position.y < F0 + 0.03) {
          b.down = true; b.m.position.y = F0 + 0.015;
          b.m.rotation.set(-Math.PI / 2, b.m.rotation.y, 0);
          this.sfx?.trigger('wood', b.m.position, 0.25, { full: 1.5, max: 10, rate: 1.4 });
        }
      } else if (b.t > 40) {
        b.m.parent?.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose();
        this.books.splice(i, 1);
      }
    }
  }
}
