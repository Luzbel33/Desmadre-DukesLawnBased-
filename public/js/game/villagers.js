// La gente del mapa: vendedores que atienden (y te venden cosas con su menú), parroquianos que toman y fuman
// sentados, gente que charla, guardias, el sepulturero cavando, el granjero en la huerta, hinchas en la cancha y una
// que sale a correr. Cada uno con la ropa de donde anda (modelos v_* de assets/blender/mh/villagers_cast.py).
// Son locales (como los del Búnker): si los matan, quedan tirados un rato y vuelven enteros a su lugar.
// Rendimiento: solo se bajan/dibujan cerca; lejos se actualizan de a ratos; el cuerpo físico solo a menos de 30 m.
import * as THREE from 'three';
import { G, clamp } from '../core/G.js';
import { Npc } from './npc.js';
import { startNpcDefense } from './npc-defense.js';
import { SCREEN_BY_ID } from '../shared/mapdata.js';
import { whenAsset, assetModel } from './assets.js';

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const HAS_DOM = typeof document !== 'undefined';
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const NEAR = 40, FAR = 75, PHYS = 30;

// ---------------------------------------------------------------- lo que vende cada puesto
export const SHOPS = {
  cinema: {
    title: 'Pochoclos del cine', vendor: 'cineVendor',
    items: [{ id: 'popcorn', icon: '🍿', name: 'Balde de pochoclos', desc: 'Para comer mirando la película. O revolear.' }, { id: 'beer', icon: '🍺', name: 'Una birra', desc: 'Bien fría.' }],
    hello: ['¿Dulces o salados? ¡Hay pochoclos!', 'Pasá, la película ya empieza.'],
    sold: ['¡Disfrutá la peli!', 'No me ensucien las butacas, eh.'],
  },
  potions: {
    title: 'Pociones de la Bruja Morgana', vendor: 'bruja',
    items: [
      { id: 'pocion_vida', icon: '❤️', name: 'Poción de vida', desc: 'Roja. Te cura casi todo.' },
      { id: 'pocion_liebre', icon: '🐇', name: 'Poción de liebre', desc: 'Verde agua. Corrés el doble un rato.' },
      { id: 'pocion_salto', icon: '🦘', name: 'Poción de salto', desc: 'Azul. Saltás como un canguro.' },
      { id: 'pocion_colores', icon: '🌈', name: 'Poción de colores', desc: 'Rosa. Todo brilla.' },
      { id: 'potion', icon: '🧪', name: 'Poción misteriosa', desc: 'Nadie sabe qué hace. Ni ella.' },
    ],
    hello: ['Acercate, corazón... ¿una pocioncita?', 'Tengo lo que necesitás. Y lo que no.', '¡Fresquitas, recién hervidas!'],
    sold: ['Tomala de un trago. No mires el fondo.', 'Si te salen escamas, no es culpa mía.', 'Je je je... salud.'],
  },
  apples: {
    title: 'Manzanas acarameladas', vendor: 'rosita',
    items: [{ id: 'apple', icon: '🍎', name: 'Manzana acaramelada', desc: 'Cura un poco. Pega en los dientes.' }],
    hello: ['¡Manzanas, manzanas acarameladas!', '¿Una manzanita, mi vida?', 'Recién bañadas en caramelo.'],
    sold: ['Cuidado que quema.', '¡Que la disfrutes!', 'Tres mordiscos y listo.'],
  },
  tarot: {
    title: 'El tarot de la Abuela Nieves', vendor: 'nieves',
    items: [{ id: 'fortune', icon: '🔮', name: 'Tirada de cartas', desc: 'La abuela te dice tu futuro.' }],
    hello: ['Sentate, nene. Las cartas no mienten.', 'Veo algo en tu aura... algo feo.', 'Vení que te tiro las cartas.'],
    sold: [],
  },
  tavern: {
    title: 'La Taberna del Ahorcado', vendor: 'tabernero',
    items: [
      { id: 'beer', icon: '🍺', name: 'Una birra', desc: 'Tirada, bien fría.' },
      { id: 'smoke', icon: '🚬', name: 'Un faso', desc: 'De la casa.' },
      { id: 'round', icon: '🍻', name: 'Una vuelta para todos', desc: 'Todos brindan por vos.' },
    ],
    hello: ['¿Qué te sirvo?', 'Pasá, que hay lugar.', 'La casa invita la primera. Y la segunda.'],
    sold: ['Ahí tenés, campeón.', 'Esa te va a pegar.', 'Salud y buena muerte.'],
  },
  grill: {
    title: 'La parrilla del Negro Pepe', vendor: 'pepe',
    items: [{ id: 'chori', icon: '🌭', name: 'Choripán', desc: 'Con chimichurri. Cura y llena.' }],
    hello: ['¡Chori, chori, choripán!', '¿Uno completo, maestro?', 'Están saliendo, están saliendo.'],
    sold: ['Con chimi, como tiene que ser.', 'Cuidado que chorrea.', '¡Buen provecho!'],
  },
  barra: {
    title: 'Bar El Cortacésped', vendor: 'rulo',
    items: [{ id: 'beer', icon: '🍺', name: 'Una birra', desc: 'La de siempre.' }, { id: 'smoke', icon: '🚬', name: 'Un faso', desc: 'Del paquete de Rulo.' }],
    hello: ['¿Lo de siempre?', 'Buenas. ¿Qué va a ser?'],
    sold: ['Ahí va.', 'Tomá, y no rompas nada.', 'Cortá el pasto después, eh.'],
  },
};
const FORTUNES = [
  'Veo una muerte... ¡ah no, es un choripán!', 'Hoy vas a perder un brazo. O dos.', 'Alguien de esta sala te va a traicionar.',
  'El Diablo te tiene fichado.', 'Vas a encontrar plata en el Búnker. Y problemas.', 'Evitá las granadas. Confiá en mí.',
  'Tu número de la suerte es el 666.', 'Una bruja te va a vender algo que no deberías tomar.', 'Vas a hacer un gol... en contra.',
];

// ---------------------------------------------------------------- charlas
const CHAT = {
  tavern: [['¿Viste lo del cementerio anoche?', 'Dicen que la dama de blanco se movió.'], ['Otra vuelta, tabernero.', '¡Salud!'], ['Mi suegra vive en el castillo.', 'Se nota.'], ['¿Quién ganó el partido?', 'Nadie, se murieron todos.']],
  bonfire: [['Contá la del ahorcado.', 'No, que después no dormís.'], ['¿Escuchaste eso?', 'Es el viento. Creo.'], ['Pasame el faso.', 'Tomá, no lo babees.']],
  well: [['Dicen que en el aljibe hay alguien.', 'Yo escuché que canta de noche.'], ['¿Probaste la poción de la bruja?', 'Estuve tres días viendo colores.'], ['¿Otra vez la tormenta?', 'Acá siempre llueve.']],
  bar: [['¿Viste la jaula del Búnker?', '¿El qué? No sé de qué hablás.'], ['El dueño es medio raro.', 'Dicen que es el Diablo.']],
};

export class Villagers {
  constructor({ scene, world, getLocal, onItems, big, openUI, closeUI }) {
    this.scene = scene;
    this.world = world;
    this.getLocal = getLocal;
    this.onItems = onItems;
    this.big = big;
    this.openUI = openUI;
    this.closeUI = closeUI;
    this.list = [];
    this.byKey = {};
    this.frame = 0;
    this.shop = null;
  }

  // ---------------------------------------------------------------- el elenco
  build() {
    const fair = this.world.castle?.fair?.spots || {};
    const add = (key, name, model, pos, yaw, role, opts = {}) => {
      const n = new Npc(this.scene, { name, look: { model }, pos: pos.clone ? pos.clone() : new THREE.Vector3(...pos), yaw, height: opts.h || 1 });
      n.role = role(n);
      n.data.key = key;
      n.item = opts.item || 0;
      n.physical = true;
      n.respawnSecs = 30;
      n.onHurt = (npc, s, point, byPlayer) => this._hurt(npc, s, point, byPlayer);
      n.onRespawn = (npc) => { npc.role = role(npc); npc.item = opts.item || 0; npc.data.key = key; };
      this.list.push(n);
      this.byKey[key] = n;
      return n;
    };
    // --- la feria de la explanada
    if (fair.potions) add('bruja', 'La Bruja Morgana', 'v_bruja', fair.potions.pos, fair.potions.yaw, (n) => this._vendor(n, 'potions'));
    if (fair.apples) add('rosita', 'Rosita', 'v_aldeana', fair.apples.pos, fair.apples.yaw, (n) => this._vendor(n, 'apples'));
    if (fair.tarot) add('nieves', 'La Abuela Nieves', 'v_abuela', fair.tarot.pos, fair.tarot.yaw, (n) => this._vendor(n, 'tarot'));
    if (fair.tavern) add('tabernero', 'Don Braulio', 'v_tabernero', fair.tavern.pos, fair.tavern.yaw, (n) => this._vendor(n, 'tavern'));
    // parroquianos de la taberna (sentados, tomando) y la fogata (fumando)
    const T = fair.tables || [], B = fair.bonfire || [];
    const tav = [];
    if (T[1]) tav.push(this._sitter(add, 'tito', 'Don Tito', 'v_vecino', T[1], 1, 'tavern'));
    if (T[2]) tav.push(this._sitter(add, 'turista', 'El Turista', 'gordo', T[2], 1, 'tavern'));
    if (T[13]) tav.push(this._sitter(add, 'metal', 'Un metalero', 'metalero', T[13], 1, 'tavern'));
    this._group(tav, 'tavern');
    const bon = [];
    if (B[0]) bon.push(this._sitter(add, 'negra', 'La Negra', 'v_punk', B[0], 2, 'bonfire'));
    if (B[3]) bon.push(this._sitter(add, 'emo', 'Una emo', 'emo', B[3], 2, 'bonfire'));
    if (B[5]) bon.push(this._sitter(add, 'raver', 'Un raver', 'raver', B[5], 1, 'bonfire'));
    this._group(bon, 'bonfire');
    // charlando en el aljibe
    const w1 = add('chino', 'El Chino', 'v_hincha', [-19.6, 0, -64.4], 0, (n) => this._chatter(n));
    const w2 = add('dj2', 'Un pibe', 'dj', [-18.3, 0, -63.3], 0, (n) => this._chatter(n));
    this._pair(w1, w2, 'well');
    // guardias del portón
    add('guardia1', 'Guardia', 'v_guardia', [-4.1, 0, -73.5], 0, (n) => this._guard(n));
    add('guardia2', 'Guardia', 'v_guardia', [4.1, 0, -73.5], 0, (n) => this._guard(n, true));
    // el sepulturero cava la tumba abierta; el granjero anda por la huerta
    add('sepul', 'El Sepulturero', 'v_sepulturero', [38.4, 0, -125.7], Math.PI, (n) => this._digger(n));
    add('granjero', 'Don Aníbal', 'v_granjero', [-35, 0, -110], 0, (n) => this._farmer(n));
    // el fogón: el parrillero en la parrilla
    add('pepe', 'El Negro Pepe', 'v_parrillero', [-17.2, 0, -97.35], Math.PI, (n) => this._vendor(n, 'grill'));
    // el bar El Cortacésped: Rulo atiende la barra; dos parados tomando en una mesa alta
    add('rulo', 'Rulo', 'bartender', [104, 0, -41.1], 0, (n) => this._vendor(n, 'barra'));
    // Use real couch/bench seats. Never stand NPCs inside loose chair props.
    const barSeats = (this.world.seats || []).filter(s => !s.poker && !s.taken && s.x > 95 && s.x < 123 && s.z > -43 && s.z < -20);
    const patrons = [['toro2','Un grandote','toro'], ['venus2','Una morocha','coneja'], ['barTito','Don Tito del bar','v_vecino'], ['barFan','El hincha del bar','v_hincha']];
    const bar = [];
    patrons.forEach(([key,name,model],i) => { if (barSeats[i]) bar.push(this._sitter(add,key,name,model,barSeats[i],1,'bar')); });
    this._group(bar, 'bar');
    add('cineVendor', 'El Pochoclero', 'v_tabernero', [98,0,-9.7], 0, n => this._vendor(n,'cinema'));
    const cinemaSeats = (this.world.seats || []).filter(s => !s.poker && !s.taken && s.x >= 103 && s.x < 120 && Math.abs(s.z-2) < 7);
    [5,22,41,61].forEach((index,i) => { const seat=cinemaSeats[index]; if(seat) this._sitter(add,'cineViewer'+i,['El Cinéfilo','El Vecino','El Trasnochado','El Fanático'][i],['v_vecino','v_granjero','v_tabernero','v_hincha'][i],seat,0,'cinema'); });
    // la cancha: dos hinchas alentando; el Gran Pasto: una que sale a correr
    add('hincha1', 'Hincha', 'v_hincha', [-6.5, 0, 17.3], 0, (n) => this._fan(n));
    add('hincha2', 'Hincha', 'v_hincha', [-5.2, 0, 17.1], 0.2, (n) => this._fan(n), { h: 0.96 });
    add('corre', 'La que corre', 'v_corredora', [-50, 0, -42], Math.PI / 2, (n) => this._walker(n, [[-50, -42], [50, -42], [52, 6], [-52, 6]], 3.1));
    // un vecino que pasea por la plaza del castillo
    add('paseo', 'Un vecino', 'v_vecino', [8, 0, -55], 0, (n) => this._walker(n, [[8, -55], [10, -70], [-8, -71], [-12, -56], [-2, -54]], 1.2, true), { h: 1.03 });
    return this;
  }

  // ---------------------------------------------------------------- roles
  _near(n, r) {
    const L = this.getLocal();
    if (!L || L.dead) return null;
    return Math.hypot(L.pos.x - n.pos.x, L.pos.z - n.pos.z) < r ? L.pos : null;
  }
  _vendor(n, shop) {
    return (npc, dt) => {
      const p = this._near(npc, 5);
      npc.lookAt = p;
      npc.speed = 0;
      const d = npc.data;
      if (p && !d.greeted && (d.greetT ?? 0) < G.time) { d.greeted = true; d.greetT = G.time + 30; npc.say(pick(SHOPS[shop].hello), 3); npc.emote = 'wave'; npc.emoteT = 0; }
      if (!p) d.greeted = false;
      if (npc.emote && npc.emoteT > 1.6) npc.emote = null;
      // de vez en cuando se acomoda o señala la mercadería
      d.idle = (d.idle ?? 4 + Math.random() * 6) - dt;
      if (d.idle <= 0) { d.idle = 7 + Math.random() * 9; if (!npc.emote) { npc.emote = Math.random() < 0.5 ? 'point' : null; npc.emoteT = 0; } }
    };
  }
  _sitter(add, key, name, model, seat, item, group) {
    const ws = this._worldSeat(seat);
    if (ws) ws.taken = true;
    const n = add(key, name, model, [seat.x, seat.y - 0.46, seat.z], seat.yaw, (npc) => (nn, dt) => {
      nn.sit = true; nn.table = !!seat.table; nn.speed = 0;
      nn.pos.set(seat.x, seat.y - 0.46, seat.z); nn.baseYaw = seat.yaw;
      const d = nn.data;
      d.sip = (d.sip ?? 3 + Math.random() * 6) - dt;
      if (d.sip <= 0 && !nn.action) {
        d.sip = 6 + Math.random() * 8;
        if (nn.item === 1) { nn.action = 'drink'; nn.actionT = 0; nn.actionEnd = 1.6; nn.habit('drink'); }
        else if (nn.item === 2) { nn.action = 'smoke'; nn.actionT = 0; nn.actionEnd = 1.4; nn.habit('smoke'); setTimeout(() => { if (nn.char && !nn.dead) G.fx?.puff(nn.char.headWorld?.(V1) || nn.pos, V2.set(Math.sin(nn.yaw), 0.4, Math.cos(nn.yaw)), 0.6, 0xb8b0a8); }, 1100); }
      }
      nn.lookAt = group === 'cinema' ? new THREE.Vector3(...SCREEN_BY_ID.cine.c) : d.partner && !d.partner.dead ? d.partner.pos : this._near(nn, 4);
    }, { item });
    n.data.seat = ws; n.sit = true; n.table = !!seat.table;
    return n;
  }
  _chatter(n) {
    return (npc, dt) => {
      npc.speed = 0;
      const d = npc.data;
      if (d.partner && !d.partner.dead) { npc.lookAt = d.partner.pos; npc.baseYaw = Math.atan2(d.partner.pos.x - npc.pos.x, d.partner.pos.z - npc.pos.z); }
      const p = this._near(npc, 3);
      if (p && Math.random() < dt * 0.3) npc.lookAt = p;
      if (npc.emote && npc.emoteT > 2) npc.emote = null;
      d.sip = (d.sip ?? 5 + Math.random() * 5) - dt;
      if (npc.item === 1 && d.sip <= 0 && !npc.action) { d.sip = 7 + Math.random() * 6; npc.action = 'drink'; npc.actionT = 0; npc.actionEnd = 1.6; npc.habit('drink'); }
    };
  }
  _guard(n, patrol = false) {
    const home = n.pos.clone();
    this._giveLantern(n);
    return (npc, dt) => {
      const d = npc.data;
      // Pursuit and patrol are mutually exclusive; never apply two movement steps.
      if (d.aggro > G.time) { this._brawl(npc, dt); return; }
      const step = Math.min(.1, Math.max(0, dt));
      const target = patrol && (d.patrolOut ?? true) ? home.x + 9 : home.x;
      const dx = target - npc.pos.x, dz = home.z - npc.pos.z, distance = Math.hypot(dx, dz);
      if (d.patrolWait > 0) { d.patrolWait -= step; npc.speed = 0; }
      else if (distance < .08) {
        npc.speed = 0;
        if (patrol) { d.patrolOut = !(d.patrolOut ?? true); d.patrolWait = 1.2; }
      } else {
        const travel = Math.min(distance, step * 1.1);
        npc.pos.x += dx / distance * travel; npc.pos.z += dz / distance * travel;
        npc.speed = dt > 0 ? travel / dt : 0;
        npc.baseYaw = Math.atan2(dx, dz);
        d.stuckFor = npc.blocked ? (d.stuckFor || 0) + step : 0;
        if (patrol && d.stuckFor > .7) { d.patrolOut = !(d.patrolOut ?? true); d.patrolWait = .6; d.stuckFor = 0; }
      }
      const p = this._near(npc, 3.2);
      npc.lookAt = p;
      if (p && (d.warnT ?? 0) < G.time) { d.warnT = G.time + 20; npc.say(pick(['Circulen.', 'Nada de armas en el castillo. Bueno, algunas.', 'El castillo cierra... nunca.', 'Cuidado con la bruja.']), 2.6); }
    };
  }
  // Farol en la mano (los guardias): de noche, con la tormenta, un uniforme oscuro no se veía ni de cerca. La llama y
  // la luz siguen a la mano (ver Npc.update: propHang)
  _giveLantern(n) {
    if (n.lamp) return;
    whenAsset('c_lantern', () => {
      const m = assetModel('c_lantern');
      if (!m || n.prop) return;
      const box = new THREE.Box3().setFromObject(m), h = box.max.y - box.min.y || 0.5;
      m.scale.multiplyScalar(0.42 / h); // unos 42 cm con la manija
      const glow = new THREE.MeshStandardMaterial({ color: 0x2a1808, emissive: 0xffa040, emissiveIntensity: 2.2, transparent: true, opacity: 0.9, depthWrite: false });
      m.traverse((o) => { if (o.isMesh) { o.castShadow = false; if (/glass/i.test(o.material?.name || '')) o.material = glow; } });
      m.userData.noCull = true; // lo mueve la mano: el descarte de adornos quietos no lo tiene que tocar
      this.scene.add(m);
      n.prop = m; n.propHang = 0.42;
      const W = this.world;
      n.lamp = { position: new THREE.Vector3(0, -50, 0), color: new THREE.Color(0xffa044), intensity: 2.8, distance: 8, decay: 1.8, visible: false, priority: 1.15, base: 2.8 };
      W.pool?.add(n.lamp);
      W.flicker?.push({ light: n.lamp, base: 2.8, seed: Math.random() * 100, fire: true });
      n.lampFlame = W.flames ? W.flames.add(0, -50, 0, 0.03, 0.07, { intensity: 0 }) : -1;
      n.lampWorld = W;
    });
  }
  _digger(n) {
    // la pala (del castillo: c_spade) en la mano; cava, tira la tierra, se seca la frente
    whenAsset('c_spade', () => { const m = assetModel('c_spade'); if (m && !n.prop) { m.scale.setScalar(0.9); m.userData.noCull = true; m.userData.shovel = true; m.userData.grip = 0.95; this.scene.add(m); n.prop = m; } });
    return (npc, dt) => {
      npc.speed = 0; npc.baseYaw = Math.PI;
      const d = npc.data;
      d.t = (d.t || 0) + dt;
      const cyc = d.t % 11;
      if (cyc < 8.8) {
        // cava con las dos manos (character.js 'dig'): clava, hace palanca y tira la tierra al costado
        if (!npc.action) { npc.action = 'dig'; npc.actionT = 0; npc.actionEnd = 2.2; d.hit = 0; }
        const fw = V2.set(Math.sin(npc.yaw), 0, Math.cos(npc.yaw));
        if (npc.action === 'dig' && d.hit === 0 && npc.actionT > 0.45) { d.hit = 1; G.fx?.puff(V1.set(npc.pos.x + fw.x * 0.75, 0.08, npc.pos.z + fw.z * 0.75), V2.set(0, 1, 0), 0.35, 0x3a2a1a); }
        if (npc.action === 'dig' && d.hit === 1 && npc.actionT > 1.35) { d.hit = 2; const side = V2.set(-Math.cos(npc.yaw), 0.6, Math.sin(npc.yaw)); G.fx?.puff(V1.set(npc.pos.x - side.x * 0.6 + fw.x * 0.4, 0.6, npc.pos.z - side.z * 0.6 + fw.z * 0.4), side.negate().setY(0.4), 0.7, 0x3a2a1a); }
      } else if (cyc < 6.1 && !npc.emote) { npc.emote = 'facepalm'; npc.emoteT = 0; if (this._near(npc, 8) && Math.random() < 0.5) npc.say(pick(['Otro más para el pozo.', 'Esta es para vos, si seguís mirando.', 'La tierra está blanda hoy.']), 2.6); }
      if (npc.emote && npc.emoteT > 2.2) npc.emote = null;
      npc.lookAt = this._near(npc, 4);
    };
  }
  _farmer(n) {
    return (npc, dt) => {
      const d = npc.data;
      if (!d.to) { d.to = new THREE.Vector3(-41.2 + Math.floor(Math.random() * 5) * 3.1 + 0.9, 0, -107 - Math.random() * 18); d.work = 3 + Math.random() * 4; }
      const dx = d.to.x - npc.pos.x, dz = d.to.z - npc.pos.z, l = Math.hypot(dx, dz);
      if (l > 0.15) { npc.crouch = false; npc.speed = 1.0; npc.baseYaw = Math.atan2(dx, dz); npc.pos.x += dx / l * dt * 1.0; npc.pos.z += dz / l * dt * 1.0; }
      else {
        npc.speed = 0; npc.crouch = true;
        d.work -= dt;
        if (d.work <= 0) { d.to = null; npc.crouch = false; }
      }
      npc.lookAt = this._near(npc, 3);
      if (npc.lookAt && (d.saidT ?? 0) < G.time) { d.saidT = G.time + 25; npc.say(pick(['Ojo con las calabazas.', 'Este año vienen gordas.', 'El espantapájaros se mueve de noche, ¿sabías?']), 2.8); }
    };
  }
  _fan(n) {
    return (npc, dt) => {
      npc.speed = 0; npc.baseYaw = 0;
      const d = npc.data;
      d.t = (d.t ?? Math.random() * 5) - dt;
      if (d.t <= 0) {
        d.t = 3 + Math.random() * 6;
        npc.emote = pick(['clap', 'dance2', 'point', null, 'clap']); npc.emoteT = 0;
        if (Math.random() < 0.35 && this._near(npc, 25)) npc.say(pick(['¡DALE, DALE!', '¡ÁRBITRO VENDIDO!', '¡PASALA, NENE!', '¡Uuuuh!']), 2);
      }
      npc.lookAt = this._near(npc, 3);
    };
  }
  _walker(n, path, speed, pauses = false) {
    const pts = path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    return (npc, dt) => {
      const d = npc.data;
      d.i = d.i ?? 1;
      if (d.wait > 0) { d.wait -= dt; npc.speed = 0; npc.lookAt = this._near(npc, 4); return; }
      const t = pts[d.i % pts.length];
      const dx = t.x - npc.pos.x, dz = t.z - npc.pos.z, l = Math.hypot(dx, dz);
      if (l < 0.3) { d.i++; if (pauses && Math.random() < 0.5) { d.wait = 2 + Math.random() * 4; npc.emote = pick(['wave', null, 'point']); npc.emoteT = 0; } return; }
      npc.speed = speed; npc.baseYaw = Math.atan2(dx, dz); npc.yaw = npc.baseYaw;
      npc.pos.x += dx / l * dt * speed; npc.pos.z += dz / l * dt * speed;
      if (npc.emote && npc.emoteT > 1.5) npc.emote = null;
      npc.lookAt = null;
    };
  }
  _group(list, topic) {
    for (let i = 0; i < list.length; i++) { list[i].data.partner = list[(i + 1) % list.length]; list[i].data.topic = topic; }
    if (list.length) this._talkers = (this._talkers || []).concat([{ list, topic, t: 4 + Math.random() * 6 }]);
  }
  _pair(a, b, topic) { this._group([a, b], topic); }
  _worldSeat(s) {
    let best = null, bd = 0.3;
    for (const w of this.world.seats || []) { const d = Math.hypot(w.x - s.x, w.z - s.z) + Math.abs(w.y - s.y); if (d < bd) { bd = d; best = w; } }
    return best;
  }

  // ---------------------------------------------------------------- golpes: se quejan; los guardias devuelven
  _hurt(npc, s, point, byPlayer) {
    G.sfx?.trigger(s > 0.8 ? 'hit' : 'hit-soft', point, Math.min(1, 0.4 + s * 0.4));
    G.fx?.blood(point.clone(), V1.set(Math.random() - 0.5, 0.6, Math.random() - 0.5).normalize(), Math.min(1.2, s));
    if (!byPlayer) return;
    startNpcDefense(npc, this.getLocal());
    const k = npc.data.key;
    if (k === 'guardia1' || k === 'guardia2' || k === 'toro2') { npc.data.aggro = G.time + 12; npc.say(pick(['¡Te la buscaste!', 'Ahora vas a ver.', 'Mal día para pegarme.']), 2.2); }
    else if ((npc.data.ouchT ?? 0) < G.time) { npc.data.ouchT = G.time + 4; npc.say(pick(['¡¿Qué hacés, loco?!', '¡Ay! ¡Salvaje!', '¡Guardia! ¡GUARDIA!', '¡Pará, pará!']), 2.2); for (const g of [this.byKey.guardia1, this.byKey.guardia2]) if (g && !g.dead && g.pos.distanceTo(npc.pos) < 35) g.data.aggro = G.time + 12; }
  }
  // perseguir y cagar a piñas al jugador (los guardias y el grandote del bar)
  _brawl(npc, dt) {
    const L = this.getLocal();
    if (!L || L.dead) { npc.data.aggro = 0; return; }
    if (npc.down > 0 || npc.dead || !npc.char) return; // pega el cuerpo que está parado, no un fantasma
    const dx = L.pos.x - npc.pos.x, dz = L.pos.z - npc.pos.z, dist = Math.hypot(dx, dz) || 1;
    npc.baseYaw = Math.atan2(dx, dz); npc.lookAt = null;
    if (dist > 1.2) { const v = dist > 6 ? 3.6 : 2; npc.speed = v; npc.pos.x += dx / dist * v * dt; npc.pos.z += dz / dist * v * dt; }
    else npc.speed = 0;
    const d = npc.data;
    d.atk = (d.atk ?? 0.8) - dt;
    if (!npc.action && d.atk <= 0 && dist < 1.4) {
      npc.action = Math.random() < 0.6 ? 'punchR' : 'kick'; npc.actionT = 0; npc.actionEnd = npc.action === 'kick' ? 0.62 : 0.45;
      d.hitAt = npc.action === 'kick' ? 0.24 : 0.2; d.hit = false; d.atk = 0.7 + Math.random() * 0.9;
    }
    if (npc.action && !d.hit && npc.actionT >= d.hitAt) { d.hit = true; if (dist < 1.45) L.npcHit?.(npc.pos, npc.action === 'kick' ? 1 : 2, npc.action === 'kick' ? 8.5 : 7, npc.action === 'kick' ? 'k' : 'p'); }
    // si se aleja mucho, vuelve a su puesto
    if (dist > 30) d.aggro = 0;
  }

  // ---------------------------------------------------------------- cada cuadro
  update(dt, camera) {
    if (!camera) return;
    this.frame++;
    const cp = camera.position;
    for (let i = 0; i < this.list.length; i++) {
      const n = this.list[i];
      const d = Math.hypot(n.pos.x - cp.x, n.pos.z - cp.z);
      n._acc = (n._acc || 0) + dt;
      if (d > FAR) {
        // lejos: ni se baja el modelo; si ya estaba, se esconde
        if (n.char && n.visible) n.update(0, camera, false);
        if (n.bubble) n.bubble.style.display = 'none'; // si habló de lejos, el globo no queda pegado en la pantalla
        n._acc = 0;
        continue;
      }
      // cuerpo físico solo cerca (a los de lejos no se les puede pegar igual)
      const wantPhys = d < PHYS;
      if (!wantPhys && n.rag && !n.down && !n.dead) { n.rag.destroy(); n.rag = null; }
      n.physical = wantPhys;
      if (d > NEAR && ((this.frame + i) & 3)) continue; // a media distancia, uno de cada cuatro cuadros
      if (n.char?.skinned) n.char.skinned.castShadow = d < 25;
      n.update(Math.min(0.2, n._acc), camera, true);
      n._acc = 0;
    }
    // las charlas: uno dice, el otro contesta
    for (const g of this._talkers || []) {
      g.t -= dt;
      if (g.t > 0) continue;
      g.t = 9 + Math.random() * 10;
      const alive = g.list.filter((n) => n.char && !n.dead && !n.down);
      if (alive.length < 2 || !this._near(alive[0], 16)) continue;
      const [a, b] = [alive[0], alive[1 + Math.floor(Math.random() * (alive.length - 1))]];
      const [l1, l2] = pick(CHAT[g.topic] || CHAT.well);
      a.say(l1, 3.2); a.emote = Math.random() < 0.4 ? 'point' : a.emote; a.emoteT = 0;
      setTimeout(() => { if (!b.dead) { b.say(l2, 3.2); if (!b.sit && Math.random() < 0.4) { b.emote = pick(['facepalm', 'clap']); b.emoteT = 0; } } }, 1900);
    }
  }

  // ---------------------------------------------------------------- comprar
  use(it) {
    const s = SHOPS[it.shop];
    if (!s) return false;
    const v = this.byKey[s.vendor];
    if (!v || v.dead || v.down) { this.big?.('NO HAY NADIE', v?.dead ? 'Al que atendía lo dejaron seco. Volvé en un rato.' : 'Volvé en un rato.', 1600); return true; }
    this.shop = { id: it.shop, v };
    if (!HAS_DOM) return true;
    const el = document.getElementById('shop');
    if (!el) return true;
    el.querySelector('h2').textContent = s.title;
    el.querySelector('.who').textContent = v.name;
    const list = el.querySelector('.items');
    list.innerHTML = '';
    for (const item of s.items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span class="ic">${item.icon}</span><span class="t"></span><span class="d"></span>`;
      b.querySelector('.t').textContent = item.name;
      b.querySelector('.d').textContent = item.desc;
      b.addEventListener('click', () => this.buy(item.id));
      list.appendChild(b);
    }
    v.say(pick(s.hello), 2.6);
    this.openUI?.();
    return true;
  }
  close() { this.shop = null; this.closeUI?.(); }
  buy(id) {
    const sh = this.shop;
    if (!sh) return;
    const s = SHOPS[sh.id], v = sh.v, L = this.getLocal();
    this.close();
    if (!L || L.dead) return;
    // el que atiende te lo alcanza (se da vuelta, estira el brazo) y te dice algo
    v.lookAt = L.pos; v.emote = 'point'; v.emoteT = 0;
    G.sfx?.trigger('pickup', null, 0.6);
    if (id === 'fortune') {
      const f = pick(FORTUNES);
      v.say(f, 5);
      this.big?.('🔮 LAS CARTAS DICEN', f, 3200);
      return;
    }
    if (id === 'popcorn') {
      const pos = L.handPos('r', new THREE.Vector3());
      const prop = G.props?.spawnThrow('popcorn', pos, new THREE.Vector3());
      if (prop) L.takeProp(prop, 'r');
      v.say(pick(s.sold), 2.8); this.onItems?.(); return;
    }
    if (id === 'round') {
      L.giveItem('beer');
      v.say('¡Una vuelta para todos, invita este!', 3);
      for (const n of this.list) if (!n.dead && n.pos.distanceTo(v.pos) < 14 && n !== v) { n.action = 'cheers'; n.actionT = 0; n.actionEnd = 1.8; setTimeout(() => n.say(pick(['¡SALUD!', '¡Grande!', '¡Por vos, crack!']), 2), 300 + Math.random() * 600); }
    } else {
      L.giveItem(id);
      if (s.sold.length) v.say(pick(s.sold), 2.8);
    }
    this.onItems?.();
  }
  dispose() { for (const n of this.list) n.dispose(); this.list.length = 0; }
}
