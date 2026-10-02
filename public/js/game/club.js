// Lo que pasa en el Búnker (el club secreto del Diablo): cómo se entra y se sale, y lo que tiene reglas.
//  - La tumba de la cripta: X corre la tapa (lo ven todos) y abajo hay una escalera; X de nuevo, bajás.
//  - Arriba de la escalera del complejo, X sube a la cripta.
//  - El ascensor: una cabina con dos puertas. "Baja" (y "sube") de mentira: se cierran las puertas, tiembla, el visor
//    cuenta los pisos hasta el -666 y se abre la puerta del otro lado. Lo que aprieta uno lo ven todos (evento).
//  - El portero pide la contraseña ("tracatraca"); con la clave, la puerta blindada se te abre. De adentro, siempre.
//  - Los pentagramas: el del cuarto secreto (castillo) y el del Búnker (frente al trono). Parado en uno con el
//    Diablo, X abre el ritual (el servidor lo valida) y te llevás al otro a los que elijas de los que están ahí,
//    entre fuego, risas y humo.
//  - El trono: el que se sienta sale en la pantalla de atrás, en vivo, con su nombre escrito en sangre y fuego.
import { BAR_MENU, CAFE_MENU, DRUG_MENU, SLOT_KIND } from '../shared/consumables.js';
import * as THREE from 'three';
import { G, clamp } from '../core/G.js';
import { CLUB, CASTLE, INTERACT } from '../shared/mapdata.js';
import { Npc, prepareNpcCulling } from './npc.js';
import { clubBeat } from '../world/club.js';
import { getMat } from '../world/builder.js';
import { ClubMix } from '../audio/clubmix.js';

const HAS_DOM = typeof document !== 'undefined';
const F0 = CASTLE.keep.floor;
const P = CLUB.pentagram;
const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
// el viaje: puertas que cierran, el recorrido (depth: metros "de mentira" que usa el bamboleo de la cámara) y abrir
const LIFT = { close: 1.3, move: 5.5, open: 1.2, depth: 18, jolts: [0.31, 0.57, 0.84] };
const LIFT_AT = new THREE.Vector3(0, 1.5, -431.6);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

const DOORMAN_HI = ['¿Y vos quién sos?', 'Acá no entra cualquiera, mostro.', 'Sin contraseña no hay fiesta.', 'Ni lo sueñes, flaco.', 'La lista está cerrada. Bah, no hay lista.'];
const DOORMAN_OK = ['Pasá, rey. Portate mal.', 'Adelante. Lo que pasa en el Búnker queda en el Búnker.', 'Bienvenido al infierno, papu.', 'Todo tuyo. Cuidado con la jaula.'];
const DOORMAN_NO = ['¿Qué te pasa, gil? Tomatela.', 'Esa no es. Andá a la cripta a pensar.', 'Contraseña incorrecta. Te anoto en la lista negra.', 'Casi. No. Para nada. Rajá.'];

export class ClubGame {
  constructor({ world, getLocal, getNet, notify, big, teleport, fade, openUI, closeUI, shake, puff, isOwner, onItems, pick }) {
    this.onItems = onItems; this.pick = pick;
    this.world = world;
    this.club = world.club;
    this.getLocal = getLocal; this.getNet = getNet;
    this.notify = notify; this.big = big; this.teleport = teleport; this.fade = fade;
    this.openUI = openUI; this.closeUI = closeUI; this.shake = shake; this.puff = puff; this.isOwner = isOwner;
    this.authIds = new Set();
    try { this.authorized = sessionStorage.getItem('dukes.bunkerAuth') === '1'; } catch { this.authorized = false; }
    this.tomb = { open: 0, target: 0, closeAt: 0 };
    this.lift = { at: 'top', phase: 'idle', t0: 0, to: 'top', open: null };
    this.ritual = { on: 0, laughT: 0, fx: [] }; // el del castillo
    this.ritual2 = { on: 0, laughT: 0, fx: [] }; // el del Búnker
    this.camBob = 0; this._bobV = 0; // la cámara en el ascensor (ver _liftStep)
    this.npcs = [];
    this.busy = false;
    this._buildTomb();
    this._buildPentagram();
    this._buildThroneScreen();
    this._makeNpcs();
    this._makeWingNpcs();
    this._interact();
  }

  // ---------------------------------------------------------------- puntos de X
  _interact() {
    const T = CLUB.tomb;
    this.tombUse = { id: 'club_tomb', k: 'club', e: 'tomb', p: [T.x, 1.0, T.z], r: 1.9, label: 'Correr la tapa de la tumba' };
    const P2 = CLUB.pentagram2;
    this.ritualUse = { id: 'club_ritual', k: 'club', e: 'ritual', p: [P.x, F0 + 1, P.z], r: P.r, label: '⛧ Ritual: bajar al Búnker', when: () => this._ownerOnPentagram() === 'castle' };
    this.ritualUse2 = { id: 'club_ritual2', k: 'club', e: 'ritual', p: [P2.x, 1, P2.z], r: P2.r, label: '⛧ Ritual: volver al castillo', when: () => this._ownerOnPentagram() === 'bunker' };
    INTERACT.push(this.tombUse, this.ritualUse, this.ritualUse2);
    // el portero y el ascensor ya los registró world/club.js (k: 'club')
    for (const it of this.club.interact) { if (it.e === 'ride') this.rideUse = it; if (it.e === 'bell') this.bellUse = it; }
  }

  use(it) {
    const L = this.getLocal();
    if (!L || this.busy) return;
    switch (it.e) {
      case 'tomb':
        if (this.tomb.open < 0.85) { this._send({ e: 'tomb' }); this._openTomb(); G.sfx?.trigger('stone-grind', V1.set(CLUB.tomb.x, 1, CLUB.tomb.z), 0.9); }
        else this._goDown();
        break;
      case 'up': this._goUp(); break;
      case 'call': this._liftCall(it.side); break;
      case 'ride': this._liftRide(); break;
      case 'doorman': this._askPassword(); break;
      case 'give':
        L.giveItem(it.item); G.sfx?.trigger('pickup'); this.onItems?.();
        if (it.item === 'cash') this.notify('💵 <b>Click izquierdo</b>: tirás un fajo · <b>derecho</b>: todos. Los dólares del Diablo no se terminan.');
        else if (it.item === 'pistol') this.notify('🔫 <b>Click</b>: disparar (apuntás con la mira). El Búnker es zona PvP.');
        else if (it.item === 'grenade') this.notify('💣 <b>Click</b>: revolearla. Explota a los 3 segundos.');
        break;
      case 'drug': this._drug(L, it.drug); break;
      case 'bar': this._order(BAR_MENU, this.bartender, ['Tomá, invita la casa.', 'Esa te va a pegar.', 'Del infierno, como todo acá.']); break;
      case 'cafe': this._order(CAFE_MENU, this.budtender, ['Disfrutalo, amor.', 'Despacito que pega.', 'Ese es de la huerta.']); break;
      case 'shaman': {
        const lines = ['Abrí la mente, hijo.', 'Esto no lo vas a olvidar.', 'Respirá... y soltá.', 'El universo te está mirando.'];
        if (!this.pick?.(DRUG_MENU, (m) => { const P = this.getLocal(); if (P) { this._drug(P, m.drug); this.shaman?.say(lines[Math.floor(Math.random() * lines.length)], 2.6); } })) this._drug(L, 'acid');
        break;
      }
      case 'monitors': this.notify('📺 Las cámaras de seguridad todavía no están conectadas.'); break;
      case 'bell': { const m = { e: 'bell', on: this.truceUntil > G.time ? 0 : 1 }; this._bellApply(m); this._send(m); break; }
      case 'ritual': this._openRitual(); break;
      default: break;
    }
  }
  _send(m) { this.getNet()?.send({ t: 'ev', k: 'club', ...m }); }
  // pedir en la barra o en el coffeeshop: ruedita con el menú (sin ruedita, lo primero)
  _order(menu, who, lines) {
    const give = (m) => {
      const L = this.getLocal(); if (!L) return;
      L.giveItem(m.item); G.sfx?.trigger('pickup'); this.onItems?.();
      who?.say(lines[Math.floor(Math.random() * lines.length)], 2.4);
    };
    if (!this.pick?.(menu, give)) give(menu[0]);
  }
  _drug(L, kind) {
    const now = G.time;
    if (now < (this._drugT || 0)) { G.sfx?.trigger('ui-err', null, 0.4); this.notify('Pará un poco, campeón.'); return; }
    this._drugT = now + 2.5;
    if (kind === 'line') {
      L.speedHigh = Math.min(1.3, (L.speedHigh || 0) + 1);
      G.sfx?.trigger('cough', null, 0.4, { rate: 1.6 });
      this.big('¡ZAS!', 'Corrés como si te persiguiera el Diablo', 1800);
    } else if (kind === 'pill') {
      L.pill = Math.min(1.4, (L.pill || 0) + 0.8);
      L.high = Math.min(1.6, L.high + 0.15);
      G.sfx?.trigger('gulp', null, 0.6);
      this.big('🌈', 'Todo late con la música', 1800);
    } else if (kind === 'acid') {
      L.acid = Math.min(1.5, (L.acid || 0) + 0.9);
      L.setAction?.('eat', 0.8);
      this.big('🌈', 'Se derriten los colores', 1800);
    } else if (kind === 'keta') {
      L.keta = Math.min(1.5, (L.keta || 0) + 0.9);
      G.sfx?.trigger('cough', null, 0.35, { rate: 1.8 });
      this.big('🌀', 'Todo se va lejos...', 1800);
    } else if (kind === 'dmt') {
      L.dmt = 1.4;
      G.sfx?.trigger('cough', null, 0.7);
      this.shake?.(0.4);
      this.big('💠', 'Te fuiste a otra dimensión', 2200);
    } else {
      L.shroom = Math.min(1.5, (L.shroom || 0) + 0.85);
      L.setAction?.('eat', 1.2);
      G.sfx?.trigger('munch', null, 0.6);
      this.big('🍄', 'Uh... las paredes respiran', 1800);
    }
    this._send({ e: 'drug' });
  }

  // eventos de otros jugadores
  remote(m) {
    if (m.e === 'tomb') this._openTomb();
    else if (m.e === 'lift') this._liftApply(m);
    else if (m.e === 'auth' && m.id) this.authIds.add(m.id);
    else if (m.e === 'bell') this._bellApply(m);
  }

  // ---------------------------------------------------------------- la tumba y la escalera
  _buildTomb() {
    const T = CLUB.tomb, w = 1.0, l = 2.2, h = 0.9;
    const scene = this.club.scene;
    // cuerpo hueco (las cuatro paredes; adentro, escalones que bajan a lo negro)
    const stone = this._mat('keepStone');
    const g = new THREE.Group();
    g.position.set(T.x, 0, T.z);
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    add(new THREE.BoxGeometry(w, h, 0.12), stone, 0, h / 2, l / 2 - 0.06);
    add(new THREE.BoxGeometry(w, h, 0.12), stone, 0, h / 2, -l / 2 + 0.06);
    add(new THREE.BoxGeometry(0.12, h, l - 0.24), stone, w / 2 - 0.06, h / 2, 0);
    add(new THREE.BoxGeometry(0.12, h, l - 0.24), stone, -w / 2 + 0.06, h / 2, 0);
    for (let k = 0; k < 5; k++) add(new THREE.BoxGeometry(w - 0.24, 0.05, 0.32), stone, 0, h - 0.14 - k * 0.17, l / 2 - 0.3 - k * 0.3);
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.24, l - 0.24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    dark.rotation.x = -Math.PI / 2; dark.position.y = 0.04; g.add(dark);
    scene.add(g);
    this.club.phys.box(T.x, h / 2, T.z, w / 2, h / 2, l / 2, 0, { mat: 'stone' });
    // la tapa (se corre hacia el lado de la columna)
    const lid = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.16, l + 0.14), this._mat('castleStone'));
    lid.castShadow = true; lid.receiveShadow = true;
    lid.position.set(T.x, 0.98, T.z);
    scene.add(lid);
    this.tomb.lid = lid;
    // aire frío que sube (humito) cuando está abierta
    this.tomb.x0 = T.x;
  }
  _mat(key) { return getMat(key); }
  _openTomb() {
    this.tomb.target = 1;
    this.tomb.closeAt = G.time + 30;
  }
  _goDown() {
    this.busy = true;
    G.sfx?.trigger('stinger', null, 0.5);
    this.fade(true, () => {
      const S = CLUB.stairTop;
      this.teleport(new THREE.Vector3(S.x, S.y + 0.02, S.z), S.yaw);
      this.big('EL BÚNKER', 'La escalera baja... y baja... y baja', 2600);
      this.busy = false;
    });
  }
  _goUp() {
    this.busy = true;
    this.fade(true, () => {
      const B = CLUB.tomb.back;
      this.teleport(new THREE.Vector3(B.x, 0.03, B.z), B.yaw);
      this.busy = false;
    });
  }

  // ---------------------------------------------------------------- ascensor
  _liftCall(side) {
    const Lf = this.lift;
    if (Lf.phase !== 'idle') return;
    const here = side === 's' ? 'top' : 'bottom';
    const m = Lf.at === here ? { e: 'lift', a: 'open', side } : { e: 'lift', a: 'ride', to: here };
    this._liftApply({ ...m, t0: G.net?.now?.() ?? Date.now() });
    this._send({ ...m, t0: G.net?.now?.() ?? Date.now() });
    G.sfx?.trigger('ui-select', null, 0.4);
  }
  _liftRide() {
    const Lf = this.lift;
    if (Lf.phase !== 'idle') return;
    const m = { e: 'lift', a: 'ride', to: Lf.at === 'top' ? 'bottom' : 'top', t0: G.net?.now?.() ?? Date.now() };
    this._liftApply(m); this._send(m);
    G.sfx?.trigger('ui-select', null, 0.5);
  }
  _liftSfx(name, vol) { G.sfx?.trigger(name, LIFT_AT, vol, { full: 4, max: 22, rate: 1 }); }
  _liftApply(m) {
    const Lf = this.lift, D = this.club.doors;
    if (m.a === 'open') {
      Lf.open = m.side;
      const d = m.side === 's' ? D.liftS : D.liftN;
      if (d.target !== 1) this._liftSfx('lift-door', 0.55);
      d.target = 1;
      return;
    }
    if (D.liftS.target > 0 || D.liftN.target > 0) this._liftSfx('lift-door', 0.55);
    Lf.phase = 'ride'; Lf.t0 = m.t0; Lf.to = m.to === 'bottom' ? 'bottom' : 'top'; Lf.from = Lf.to === 'top' ? 'bottom' : 'top';
    Lf.cue = 0; // lo que ya sonó en este viaje (bits): arranque, sacudones
    D.liftS.target = 0; D.liftN.target = 0; Lf.open = null;
  }
  _liftStep(dt) {
    const Lf = this.lift, D = this.club.doors, L = this.getLocal(), C = this.club;
    const inside = L && this._inLift(L.pos);
    let acc = 0, speed = 0; // aceleración (m/s², + hacia arriba) y velocidad normalizada de la cabina "de mentira"
    if (Lf.phase === 'ride') {
      const t = ((G.net?.now?.() ?? Date.now()) - Lf.t0) / 1000;
      const down = Lf.to === 'bottom', sgn = down ? -1 : 1;
      const cue = (bit) => { if (Lf.cue & bit) return false; Lf.cue |= bit; return true; };
      if (t < LIFT.close) {
        C.setFloor(down ? 'P.B. ▼' : '-666 ▲', !down);
        // puertas cerradas: se suelta el freno (golpe seco y la cabina "cae" un poquito)
        if (t > LIFT.close - 0.2 && cue(1)) { this._liftSfx('lift-clunk', 0.7); if (inside) this._bobV -= 0.35 * sgn; }
      } else if (t < LIFT.close + LIFT.move) {
        const p = (t - LIFT.close) / LIFT.move, e = p * p * (3 - 2 * p);
        speed = 6 * p * (1 - p) / 1.5;
        acc = sgn * LIFT.depth * (6 - 12 * p) / (LIFT.move * LIFT.move);
        const n = Math.round((down ? e : 1 - e) * 666);
        C.setFloor((n === 0 ? 'P.B.' : '-' + n) + (down ? ' ▼' : ' ▲'), n > 600);
        // la luz de cada piso pasa por las rendijas de las puertas (sube al bajar)
        if (C.liftSeamU) {
          C.liftSeamU.uOn.value = Math.min(1, speed * 1.4);
          C.liftSeamU.uPhase.value += -sgn * LIFT.depth * speed * 1.5 / LIFT.move * dt / 1.7;
        }
        // sacudones en las juntas del riel: ruido de chapa, la luz tiembla y el cuerpo se sacude
        LIFT.jolts.forEach((jp, i) => {
          if (p > jp && cue(2 << i)) {
            G.sfx?.trigger('metal', LIFT_AT, 0.28, { full: 4, max: 18, rate: 0.7 + i * 0.08 });
            Lf.flick = 0.16;
            if (inside) { this._bobV -= 0.18; this.shake(0.35); }
          }
        });
        if (inside) this.shake(0.04 + 0.1 * speed);
      } else {
        Lf.phase = 'idle'; Lf.at = Lf.to;
        C.setFloor(Lf.at === 'bottom' ? '-666' : 'P.B.', Lf.at === 'bottom');
        Lf.open = Lf.at === 'bottom' ? 'n' : 's';
        (Lf.open === 's' ? D.liftS : D.liftN).target = 1;
        // frena: golpe, campanita, y se abre la puerta del otro lado
        this._liftSfx('lift-clunk', 0.6);
        this._liftSfx('lift-ding', 0.55);
        setTimeout(() => this._liftSfx('lift-door', 0.55), 350);
        if (inside) { this._bobV += 0.3 * sgn; this.shake(0.25); }
        if (inside && Lf.at === 'bottom') this.big('NIVEL -666', 'Bienvenido al infierno. Hay portero.', 2200);
      }
    }
    if (Lf.phase !== 'ride' && C.liftSeamU) C.liftSeamU.uOn.value = Math.max(0, C.liftSeamU.uOn.value - dt * 3);
    if (C.liftSeams) { const on = (C.liftSeamU?.uOn.value || 0) > 0.001; for (const m of C.liftSeams) m.visible = on; }
    // la luz de la cabina: tiembla con los sacudones y respira con el motor
    Lf.flick = Math.max(0, (Lf.flick || 0) - dt);
    if (C.liftLight) C.liftLight.intensity = 6.5 * (Lf.flick > 0 ? 0.25 + 0.5 * Math.random() : 1 - 0.06 * speed * (0.5 + 0.5 * Math.sin(G.time * 37)));
    // el cuerpo "se queda atrás" cuando la cabina acelera (resorte con un poco de rebote)
    const w = 9, zeta = 0.28, h = Math.min(dt, 0.05);
    this._bobV += (-(inside ? acc : 0) - w * w * this.camBob - 2 * zeta * w * this._bobV) * h;
    this.camBob = clamp(this.camBob + this._bobV * h, -0.12, 0.12);
    Lf.speed = speed;
    this.rideUse && (this.rideUse.label = Lf.phase === 'ride' ? 'Esperá...' : Lf.at === 'top' ? 'Apretar el botón (bajar al -666)' : 'Apretar el botón (subir)');
    if (this.bellUse) this.bellUse.label = this.truceUntil > G.time ? 'Tocar la campana (que vuelvan a pelear)' : 'Tocar la campana (cortar la pelea)';
    for (const d of [D.liftS, D.liftN]) { try { d.collider.setEnabled(d.open < 0.85); } catch { /* */ } }
    this.inLift = !!inside;
  }
  // sonidos que tienen que tocarse dentro del motor de audio (si no, el loop se apaga solo cada cuadro)
  ambience(dt, sfx) {
    const Lf = this.lift;
    if (Lf.phase !== 'ride' || !this.club.visible) return;
    const L = this.getLocal();
    if (!L || Math.hypot(L.pos.x - LIFT_AT.x, L.pos.z - LIFT_AT.z) > 14) return;
    const sp = Lf.speed || 0;
    if (this.inLift) sfx._loop('lift-hum', 'lift-hum', 0.14 + 0.32 * sp, null, { bus: 'ambient', rate: 0.72 + 0.4 * sp });
    else sfx._loop('lift-hum', 'lift-hum', 0.08 + 0.14 * sp, LIFT_AT, { bus: 'ambient', rate: 0.72 + 0.4 * sp, full: 3, max: 14 });
  }
  _inLift(p) { const Lc = CLUB.lift; return p.x > Lc.x0 && p.x < Lc.x1 && p.z > Lc.z0 && p.z < Lc.z1 && p.y < 3; }

  // ---------------------------------------------------------------- portero y puerta blindada
  _askPassword() {
    if (!HAS_DOM) return;
    const L = this.getLocal();
    if (this.authorized || (L && L.pos.z < CLUB.door.z)) { this.doorman?.say('Ya estás adentro, pasá.', 2.4); return; }
    this.doorman?.say('¿La contraseña?', 3);
    const modal = document.getElementById('bunker-modal');
    const input = document.getElementById('bunker-pass');
    const err = document.getElementById('bunker-err');
    if (!modal || !input) return;
    err.textContent = '';
    input.value = '';
    modal.classList.remove('hidden');
    this.openUI('bunker');
    setTimeout(() => input.focus(), 30);
  }
  closePassword() {
    document.getElementById('bunker-modal')?.classList.add('hidden');
    this.closeUI();
  }
  // devuelve true si era la clave (sirve también desde el chat, cerca del portero)
  tryPassword(text) {
    const ok = norm(text) === CLUB.password;
    const L = this.getLocal();
    if (ok) {
      this.authorized = true;
      try { sessionStorage.setItem('dukes.bunkerAuth', '1'); } catch { /* */ }
      this._send({ e: 'auth' });
      this.doorman?.say(DOORMAN_OK[Math.floor(Math.random() * DOORMAN_OK.length)], 3.5);
      G.sfx?.trigger('ui-ok', null, 0.7);
      if (this.doorman) { this.doorman.emote = 'point'; this.doorman.emoteT = 0; setTimeout(() => { if (this.doorman) this.doorman.emote = null; }, 1500); }
    } else {
      this.doorman?.say(DOORMAN_NO[Math.floor(Math.random() * DOORMAN_NO.length)], 3.5);
      G.sfx?.trigger('ui-err', null, 0.6);
      // el empujón: para atrás (hacia el ascensor) y un traspié
      if (L && this.doorman) {
        const dx = L.pos.x - this.doorman.pos.x, dz = L.pos.z - this.doorman.pos.z, d = Math.hypot(dx, dz) || 1;
        L.stun?.(0.5, V1.set((dx / d) * 5, 0, (dz / d) * 5 + 3));
        this.doorman.action = 'punchR'; this.doorman.actionT = 0; this.doorman.actionEnd = 0.6;
      }
    }
    return ok;
  }
  nearDoorman(p) { return Math.hypot(p.x - CLUB.doorman.x, p.z - CLUB.doorman.z) < 4.5; }
  _doorStep() {
    const L = this.getLocal(), D = this.club.doors.blast;
    if (!L) return;
    const dz = CLUB.door.z;
    const nearDoor = (p) => Math.abs(p.x) < 2.6 && Math.abs(p.z - dz) < 3.2;
    const insideHall = L.pos.z < dz - 0.1;
    const allowed = this.authorized || insideHall;
    let open = nearDoor(L.pos) && allowed;
    if (!open) for (const [id, rp] of G.players) if ((this.authIds.has(id) || rp.pos.z < dz) && nearDoor(rp.pos)) { open = true; break; }
    if (open !== D.target > 0.5) G.sfx?.trigger('stone-grind', V1.set(0, 1.5, dz), 0.5);
    D.target = open ? 1 : 0;
    try { D.collider.setEnabled(!(allowed && D.open > 0.75)); } catch { /* */ }
  }

  // ---------------------------------------------------------------- NPCs (modelos propios: assets/blender/mh)
  _makeNpcs() {
    const scene = this.club.group, A = this.club.anchors;
    const add = (o) => { const n = new Npc(scene, o); this.npcs.push(n); return n; };
    const Dm = CLUB.doorman;
    const near = (n, r) => { const L = this.getLocal(); return L && Math.hypot(L.pos.x - n.pos.x, L.pos.z - n.pos.z) < r ? L.pos : null; };
    this.doorman = add({
      name: 'El Portero', look: { model: 'portero' }, pos: new THREE.Vector3(Dm.x, 0, Dm.z), yaw: Dm.yaw, height: 1.08,
      role: (n, dt) => {
        const L = this.getLocal();
        const close = L && Math.hypot(L.pos.x - n.pos.x, L.pos.z - n.pos.z) < 6 && L.pos.z > CLUB.door.z;
        n.lookAt = close ? L.pos : null;
        n.data.t = (n.data.t || 0) - dt;
        if (close && !n.data.greeted) { n.data.greeted = true; if (!this.authorized) n.say(DOORMAN_HI[Math.floor(Math.random() * DOORMAN_HI.length)], 3); }
        if (!close) n.data.greeted = false;
        if (!n.emote && n.data.t < 0) { n.data.t = 6 + Math.random() * 6; n.emote = Math.random() < 0.5 ? 'flex' : null; n.emoteT = 0; setTimeout(() => { if (n.emote === 'flex') n.emote = null; }, 2500); }
      },
    });
    const pole = (c, phase) => this._poleRole(c, phase);
    const P = this.club.poles;
    [['lilith', 'Lilith'], ['coneja', 'La Coneja'], ['venus', 'Venus']].forEach(([m, name], i) => { if (P[i]) add({ name, look: { model: m }, pos: P[i].clone(), role: pole(P[i], i * 2.1) }); });
    // gogós en las jaulas colgantes
    const cage = (c, phase) => (n, dt) => {
      n.pos.copy(c);
      n.baseYaw = G.time * 0.25 + phase;
      n.data.t = (n.data.t || 0) - dt;
      if (n.data.t <= 0) { n.data.t = 4 + Math.random() * 4; n.emote = ['dance2', 'dance3', 'dance1'][Math.floor(Math.random() * 3)]; n.emoteT = 0; }
    };
    const Gc = this.club.gogo || [];
    [['raven', 'Raven'], ['emo', 'La Emo']].forEach(([m, name], i) => { if (Gc[i]) add({ name, look: { model: m }, pos: Gc[i].clone(), role: cage(Gc[i], i * 3) }); });
    // el DJ
    if (A.dj) add({ name: 'DJ Calavera', look: { model: 'dj' }, pos: A.dj.clone(), yaw: 0, role: (n, dt) => { n.emote = 'dance1'; n.lookAt = near(n, 8); } });
    // el bartender (atiende: ver use 'bar')
    if (A.bartender) this.bartender = add({ name: 'El Bartender', look: { model: 'bartender' }, pos: A.bartender.clone(), yaw: Math.PI / 2, role: (n, dt) => {
      n.lookAt = near(n, 7);
      n.data.t = (n.data.t || 0) - dt;
      if (n.data.t <= 0) { n.data.t = 8 + Math.random() * 6; n.action = 'cheers'; n.actionT = 0; n.actionEnd = 1.5; }
    } });
    // la gente de la pista: cada uno en la suya
    const dancer = (home) => this._dancerRole(home);
    for (const [m, name, x, z] of [['metalero', 'El Metalero', -3, -459], ['raver', 'El Raver', 3.5, -464], ['gordo', 'El Gordo', 0.5, -457.5]]) {
      add({ name, look: { model: m }, pos: new THREE.Vector3(x, 0.05, z), role: dancer(new THREE.Vector3(x, 0.05, z)) });
    }
    // la jaula de peleas: El Toro contra El Chacal (cuerpos físicos: se tumban, festejan, y si les pegás, te buscan)
    if (A.cage) {
      const c = A.cage;
      const toro = add({ name: 'El Toro', look: { model: 'toro' }, pos: c.clone().add(V1.set(-1, 0, 0)), yaw: Math.PI / 2 });
      const chacal = add({ name: 'El Chacal', look: { model: 'chacal' }, pos: c.clone().add(V1.set(1, 0, 0)), yaw: -Math.PI / 2 });
      for (const [a, b] of [[toro, chacal], [chacal, toro]]) {
        a.physical = true;
        a.role = (n, dt) => this._fighter(n, b, dt);
        a.onHurt = (n, s, point, byPlayer) => {
          G.sfx?.trigger(s > 0.8 ? 'hit' : 'hit-soft', point, Math.min(1, 0.4 + s * 0.4));
          G.fx?.blood(point.clone(), V1.set(Math.random() - 0.5, 0.6, Math.random() - 0.5).normalize(), Math.min(1.2, s));
          if (byPlayer) { n.data.aggroT = G.time + 15; if (!n.data.saidAggro || G.time > n.data.saidAggro) { n.data.saidAggro = G.time + 6; n.say(['¡¿Me pegaste a MÍ?!', 'Vení, vení, dale.', 'Te hago mierda, gil.'][Math.floor(Math.random() * 3)], 2.5); } }
        };
      }
      this.fighters = [toro, chacal];
    }
  }

  // el foso de lava del Infierno quema (a vos y a los NPC que caigan; el puente pasa por arriba)
  _lavaStep(dt) {
    const lv = this.club.anchors.lava;
    if (!lv) return;
    this._lavaT = (this._lavaT || 0) - dt;
    if (this._lavaT > 0) return;
    this._lavaT = 0.3;
    const inLava = (p) => { const r = Math.hypot(p.x - lv.x, p.z - lv.z); return r > lv.r0 + 0.1 && r < lv.r1 - 0.05 && p.y < 0.45; };
    const L = this.getLocal();
    if (L && !L.dead && inLava(L.pos) && !((G.owner?.burning?.get('me') || 0) > 1)) {
      G.owner?.ignite('me', 4);
      this.getNet()?.send({ t: 'ev', k: 'onfire', d: 4 });
      G.sfx?.trigger('fire-flare', L.pos, 0.6, { full: 3, max: 20 });
    }
    for (const n of this.npcs) if (!n.dead && n.char && inLava(n.pos) && !(n.burnT > 1)) n.ignite(4);
  }

  // ---------------------------------------------------------------- roles que se repiten
  _near(n, r) { const L = this.getLocal(); return L && Math.hypot(L.pos.x - n.pos.x, L.pos.z - n.pos.z) < r ? L.pos : null; }
  // bailarinas del caño: una coreografía de verdad (giros colgadas del caño, ondas de frente, apoyadas de espaldas,
  // trepadas, de cabeza y un poco de baile suelto). Cada una arranca en otra parte y a otro ritmo.
  _poleRole(c, phase) {
    const MOVES = [['pole_wave', 8], ['pole_spin', 5], ['dance1', 5], ['pole_lean', 8], ['pole_spin', 6], ['pole_climb', 7], ['pole_invert', 6], ['pole_spin', 4]];
    const T = new THREE.Vector3();
    return (n, dt) => {
      const d = n.data;
      if (d.mi === undefined) { d.mi = Math.floor(phase * 7) % MOVES.length; d.mt = 0; d.th = phase * 2.1; d.y = 0; n.noCollide = true; }
      d.mt += dt;
      if (d.mt > MOVES[d.mi][1]) { d.mi = (d.mi + 1) % MOVES.length; d.mt = 0; d.th0 = d.th; }
      const mv = MOVES[d.mi][0], mt = d.mt, end = MOVES[d.mi][1];
      if (n.emote !== mv) { n.emote = mv; n.emoteT = 0; }
      let r = 0.42, yaw, up = 0;
      if (mv === 'pole_spin') {
        d.th -= dt * (1.7 + Math.sin(mt * 1.3 + phase) * 0.5); // gira de frente (el caño a su derecha)
        r = 0.34; yaw = d.th - Math.PI / 2;
      } else if (mv === 'pole_wave' || mv === 'pole_climb' || mv === 'pole_invert') {
        if (mv !== 'pole_wave') d.th -= dt * 0.45;
        r = mv === 'pole_wave' ? 0.38 : 0.27;
        yaw = Math.atan2(-Math.sin(d.th), -Math.cos(d.th)); // mirando al caño
        if (mv === 'pole_climb') up = Math.min(1.15, mt * 0.55) * Math.min(1, (end - mt) / 1.2);
        if (mv === 'pole_invert') up = 1.15 * Math.min(1, mt * 1.5) * Math.min(1, (end - mt) / 0.9);
      } else if (mv === 'pole_lean') {
        r = 0.26; yaw = Math.atan2(Math.sin(d.th), Math.cos(d.th)); // de espaldas al caño
      } else {
        d.th -= dt * 0.25; r = 0.5; yaw = Math.atan2(Math.sin(d.th), Math.cos(d.th)) + Math.sin(mt) * 0.4;
      }
      T.set(c.x + Math.sin(d.th) * r, c.y, c.z + Math.cos(d.th) * r);
      const k = 1 - Math.exp(-dt * 7);
      n.pos.x += (T.x - n.pos.x) * k; n.pos.z += (T.z - n.pos.z) * k;
      d.y += (up - d.y) * Math.min(1, dt * 4);
      n.pos.y = c.y + d.y;
      n.baseYaw = yaw;
      if (mv === 'pole_spin' || mv === 'pole_climb' || mv === 'pole_invert') { n.yaw = yaw; n.lookAt = null; }
      else n.lookAt = this._near(n, 6);
    };
  }
  // la gente de la pista: cada uno en la suya, se mueve un poco y cambia de baile
  _dancerRole(home, spread = 3) {
    return (n, dt) => {
      n.data.t = (n.data.t || 0) - dt;
      if (n.data.t <= 0) {
        n.data.t = 6 + Math.random() * 6;
        n.emote = ['dance1', 'dance2', 'dance3', 'clap', 'dance1'][Math.floor(Math.random() * 5)]; n.emoteT = 0;
        n.data.to = home.clone().add(V1.set((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread));
        n.baseYaw = Math.random() * Math.PI * 2;
      }
      if (n.data.to) { const d = V2.subVectors(n.data.to, n.pos); d.y = 0; const l = d.length(); if (l > 0.05) n.pos.addScaledVector(d, Math.min(1, dt * 0.4 / l)); }
      n.lookAt = this._near(n, 4);
    };
  }
  // sentado en un sillón: cada tanto pita (con su humito) o toma
  _loungeRole(item, seat) {
    return (n, dt) => {
      n.sit = true; n.speed = 0; n.item = item;
      n.pos.set(seat.x, seat.y - 0.46, seat.z); n.baseYaw = seat.yaw;
      n.data.t = (n.data.t ?? 2 + Math.random() * 6) - dt;
      if (n.data.t <= 0 && !n.action) {
        n.data.t = 6 + Math.random() * 8;
        if (item === 2 || SLOT_KIND[item] === 'smoke') {
          n.action = 'smoke'; n.actionT = 0; n.actionEnd = 1.4;
          setTimeout(() => { if (n.char && !n.dead && n.scene.visible) G.fx?.puff(n.char.headWorld?.(V1) || n.pos, V2.set(Math.sin(n.yaw), 0.4, Math.cos(n.yaw)), 0.7, 0xb8b0a8); }, 1100);
        } else { n.action = 'drink'; n.actionT = 0; n.actionEnd = 1.6; }
      }
      n.lookAt = this._near(n, 4);
    };
  }
  // alguien que cuida un lugar: mira al que se acerca y le dice algo (una vez por visita)
  _keeperRole(lines, r = 5) {
    return (n) => {
      const L = this.getLocal(), close = this._near(n, r);
      n.lookAt = close;
      if (close && !n.data.said) { n.data.said = true; n.say(lines[Math.floor(Math.random() * lines.length)], 3); }
      if (!close && L && Math.hypot(L.pos.x - n.pos.x, L.pos.z - n.pos.z) > r + 4) n.data.said = false;
    };
  }

  // la gente del Búnker grande (club-wings.js): cada uno en el grupo de su sala, así se dibuja y se anima con ella
  _makeWingNpcs() {
    const W = this.club.wings, A = this.club.anchors;
    if (!W) return;
    const add = (wing, o) => { const n = new Npc(W.wings.get(wing).group, o); this.npcs.push(n); return n; };
    // más bailarinas en los caños (los mismos modelos de las del club, sin tocarlos): la VIP y la isla del Infierno
    [['lilith', 'Jezabel'], ['venus', 'Morgana'], ['coneja', 'Bambi']].forEach(([m, name], i) => { const c = A.vipPoles?.[i]; if (c) add('vip', { name, look: { model: m }, pos: c.clone(), role: this._poleRole(c, i * 1.7 + 0.4) }); });
    [['raven', 'Nyx'], ['emo', 'Belladona'], ['lilith', 'Lucrecia']].forEach(([m, name], i) => { const c = A.hellPoles?.[i]; if (c) add('hell', { name, look: { model: m }, pos: c.clone(), role: this._poleRole(c, i * 2.3 + 1.1) }); });
    if (A.hellDj) add('hell', { name: 'DJ Belcebú', look: { model: 'dj' }, pos: A.hellDj.clone(), yaw: 0, role: (n) => { n.emote = 'dance2'; n.lookAt = this._near(n, 9); } });
    // la pista del Infierno
    if (A.hellFloor) {
      const crowd = [['metalero', 'El Pelado Metal', -3.5, -2], ['raver', 'Rayo', 3, -3.5], ['v_punk', 'La Punk', -1.5, 3.5], ['v_hincha', 'El Hincha', 4, 2.5], ['v_corredora', 'La Corredora', -4.5, 3]];
      for (const [m, name, dx, dz] of crowd) { const h = A.hellFloor.clone().add(V1.set(dx, 0, dz)); add('hell', { name, look: { model: m }, pos: h.clone(), role: this._dancerRole(h, 2.5) }); }
    }
    // la VIP: el patovica de la puerta
    if (A.vipDoor) add('vip', { name: 'El Patovica', look: { model: 'portero' }, pos: A.vipDoor.clone(), yaw: Math.PI * 0.75, height: 1.06, role: this._keeperRole(['Mirar sí, tocar no.', 'Acá adentro se portan bien, ¿estamos?', 'Bienvenido a la VIP, capo.']) });
    // el coffeeshop: la que atiende y la gente fumando o tomando en los sillones (asientos que no usan los jugadores)
    if (A.budtender) this.budtender = add('cafe', { name: 'Mery Juana', look: { model: 'v_aldeana' }, pos: A.budtender.clone(), yaw: 0, role: this._keeperRole(['¡Hola, amor! ¿Qué te armo?', 'Probá el blunt de la casa.', 'Tranqui, acá nadie apura a nadie.', 'Lo de la huerta es todo nuestro, eh.'], 4.5) });
    // cada uno con lo suyo en la mano (los números son los modelos de equipment.js: blunt, habano, pipa, whisky, fernet)
    const people = [['v_vecino', 'El Rasta', 15], ['v_parrillero', 'El Tano', 16], ['v_abuela', 'La Abuela Porro', 17], ['gordo', 'Don Billetes', 12], ['v_tabernero', 'El Colorado', 11]];
    (A.npcSeats || []).forEach((s, i) => { const p = people[i]; if (p) add(s.wing, { name: p[1], look: { model: p[0] }, pos: new THREE.Vector3(s.x, s.y - 0.46, s.z), yaw: s.yaw, role: this._loungeRole(p[2], s) }); });
    // la sala de cultivo y el arsenal
    if (A.shaman) this.shaman = add('psico', { name: 'La Chamana', look: { model: 'v_bruja' }, pos: A.shaman.clone(), yaw: 0, role: this._keeperRole(['¿Venís a ver más allá?', 'Tengo lo que buscás, viajero.', 'Las puertas de la percepción están abiertas.'], 4.5) });
    if (A.gardener) add('grow', { name: 'El Jardinero', look: { model: 'v_granjero' }, pos: A.gardener.clone(), yaw: Math.PI, role: this._keeperRole(['Despacito con las nenas, que están floreciendo.', 'Cortá uno, nomás. Bueno, dos.', 'Las riego con las lágrimas de los que pierden al póker.'], 4.5) });
    if (A.sarge) add('arsenal', { name: 'El Sargento', look: { model: 'v_guardia' }, pos: A.sarge.clone(), yaw: -Math.PI / 2, role: this._keeperRole(['¡Firmes, recluta!', 'Se agarra una y se usa con cabeza.', 'Acá no se fuma. Andá al coffeeshop, hippie.', 'Si le tirás a una bailarina, te fusilo.'], 6) });
  }

  // la campana: cortan la pelea (cada uno a su rincón, a respirar) por un rato, o vuelven a pelear
  _bellApply(m) {
    const on = !!m.on;
    this.truceUntil = on ? G.time + 30 : 0;
    const at = this.club.anchors.bell;
    G.sfx?.trigger('ring-bell', at, 0.9, { full: 5, max: 40, rate: 1 });
    for (const f of this.fighters || []) {
      if (!f.char || f.dead) continue;
      f.data.aggroT = 0; f.action = null;
      if (on) f.say(['¡Ya va, ya va!', 'Esto no termina acá.', 'Salvado por la campana, gil.'][Math.floor(Math.random() * 3)], 2.5);
      else f.say(['¡A ver ahora!', '¡VENÍ!', 'Segundo round.'][Math.floor(Math.random() * 3)], 2.2);
    }
  }
  // un peleador: se acerca, gira alrededor, guardia, piñas y patadas; el golpe llega si está a distancia
  _fighter(n, other, dt) {
    const c = this.club.anchors.cage, R = this.club.anchors.cageR - 0.7;
    if (this.truceUntil > G.time && !(n.data.aggroT > G.time)) {
      // tregua: a su rincón, respira, se estira y lo mira de reojo
      const side = n === this.fighters?.[0] ? -1 : 1;
      const hx = c.x + side * R * 0.8, hz = c.z - R * 0.35;
      const dx = hx - n.pos.x, dz = hz - n.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.15) { n.speed = 1.3; n.baseYaw = Math.atan2(dx, dz); n.pos.x += dx / d * 1.3 * dt; n.pos.z += dz / d * 1.3 * dt; }
      else { n.speed = 0; n.baseYaw = Math.atan2(c.x - n.pos.x, c.z - n.pos.z); if (!n.emote && Math.random() < dt * 0.25) { n.emote = Math.random() < 0.5 ? 'flex' : null; n.emoteT = 0; } }
      if (n.action === 'guard') n.action = null;
      n.lookAt = other.pos;
      n.pos.y = c.y;
      return;
    }
    const L = this.getLocal();
    const vsPlayer = L && n.data.aggroT > G.time && !L.dead && Math.hypot(L.pos.x - c.x, L.pos.z - c.z) < R + 1.5;
    const tgt = vsPlayer ? L.pos : other.pos;
    if (!vsPlayer && other.down > 0) {
      // el otro está en el piso: festeja
      n.speed = 0; n.action = null;
      if (n.emote !== 'flex') { n.emote = 'flex'; n.emoteT = 0; if (Math.random() < 0.5) n.say(['¡Levantate, flojo!', '¡ESTE ES MI BÚNKER!', 'Uno menos.'][Math.floor(Math.random() * 3)], 2.5); }
      n.lookAt = tgt;
      return;
    }
    if (n.emote === 'flex') n.emote = null;
    const dx = tgt.x - n.pos.x, dz = tgt.z - n.pos.z, dist = Math.hypot(dx, dz) || 1;
    n.baseYaw = Math.atan2(dx, dz);
    n.lookAt = null;
    // moverse: acercarse, alejarse o rodear
    n.data.side = n.data.side || (Math.random() < 0.5 ? 1 : -1);
    if (Math.random() < dt * 0.3) n.data.side *= -1;
    let vx = 0, vz = 0;
    if (dist > 1.25) { vx = dx / dist * 1.7; vz = dz / dist * 1.7; }
    else if (dist < 0.8) { vx = -dx / dist * 1.2; vz = -dz / dist * 1.2; }
    else { vx = -dz / dist * 0.7 * n.data.side; vz = dx / dist * 0.7 * n.data.side; }
    if (n.action && n.action !== 'guard') { vx *= 0.3; vz *= 0.3; }
    n.pos.x += vx * dt; n.pos.z += vz * dt;
    const r = Math.hypot(n.pos.x - c.x, n.pos.z - c.z);
    if (r > R) { n.pos.x = c.x + (n.pos.x - c.x) * R / r; n.pos.z = c.z + (n.pos.z - c.z) * R / r; }
    n.pos.y = c.y;
    n.speed = Math.hypot(vx, vz);
    // atacar
    n.data.atk = (n.data.atk ?? 1) - dt;
    if (!n.action || n.action === 'guard') {
      if (n.data.atk <= 0 && dist < 1.45) {
        const r2 = Math.random();
        n.action = r2 < 0.4 ? 'punchR' : r2 < 0.75 ? 'punchL' : 'kick';
        n.actionT = 0; n.actionEnd = n.action === 'kick' ? 0.62 : 0.45;
        n.data.hitAt = n.action === 'kick' ? 0.24 : 0.2; n.data.hit = false;
        n.data.atk = 0.6 + Math.random() * 1.1;
      } else if (!n.action) { n.action = 'guard'; n.actionT = 0; n.actionEnd = 0.5; }
    }
    if (n.action && n.action !== 'guard' && !n.data.hit && n.actionT >= n.data.hitAt) {
      n.data.hit = true;
      if (dist < 1.4) {
        const kick = n.action === 'kick';
        const dir = V1.set(dx / dist, 0, dz / dist);
        if (vsPlayer) L.npcHit(n.pos, kick ? 1 : 2, kick ? 9 : 7.5, kick ? 'k' : 'p');
        else if (Math.random() < 0.75) {
          const pt = other.pos.clone().add(V2.set(0, kick ? 1.0 : 1.6, 0)).addScaledVector(dir, -0.12);
          other.punch(kick ? 9 : 6 + Math.random() * 3, pt, dir, kick ? 1.6 : 1, false);
        } else G.sfx?.trigger('swing', n.pos, 0.4);
      }
    }
  }

  // ---------------------------------------------------------------- pentagrama y ritual
  _buildPentagram() {
    if (!HAS_DOM) return;
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 512, 512);
    g.strokeStyle = '#ff3010'; g.lineCap = 'round'; g.shadowColor = '#ff2000'; g.shadowBlur = 30;
    for (const [lw, a] of [[16, 0.5], [7, 1]]) {
      g.globalAlpha = a; g.lineWidth = lw;
      g.beginPath(); g.arc(256, 256, 226, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(256, 256, 206, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      for (let i = 0; i <= 5; i++) { const a2 = -Math.PI / 2 + ((i * 2) % 5) * (Math.PI * 2 / 5), x = 256 + Math.cos(a2) * 206, y = 256 + Math.sin(a2) * 206; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    // el del castillo (piso F0 del cuarto secreto) y el del Búnker (piso del club): los dos iguales
    this._pentagramAt(this.ritual, P, F0, tex, 3.7);
    const P2 = CLUB.pentagram2;
    this._pentagramAt(this.ritual2, P2, 0.012, tex, P2.r * 2);
    // el del Búnker se ve siempre (apagado, como quemado en el piso): marca adónde se llega
    const burnt = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false, color: 0x5a0a04 });
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(P2.r * 2, P2.r * 2), burnt);
    mark.rotation.x = -Math.PI / 2; mark.position.set(P2.x, 0.055, P2.z);
    this.club.group.add(mark);
  }
  _pentagramAt(R, c, y, tex, size) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    mat.color.setScalar(3);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(c.x, y + 0.05, c.z);
    (y > 1 ? this.club.scene : this.club.group).add(m);
    R.glow = m; R.c = c; R.y = y;
    R.light = { position: new THREE.Vector3(c.x, y + 1.2, c.z), color: new THREE.Color(0xff2a10), intensity: 0, distance: 9, decay: 1.6, visible: true, priority: 3, base: 8 };
    this.world.pool?.add(R.light);
    // anillo de llamas (apagadas hasta que se para el Diablo)
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const i = this.world.flames?.add(c.x + Math.cos(a) * (c.r + 0.1), y + 0.02, c.z + Math.sin(a) * (c.r + 0.1), 0.18, 0.45, { intensity: 0 });
      if (i !== undefined && i >= 0) R.fx.push(i);
    }
  }
  // ¿en qué pentagrama está parado? 'castle' | 'bunker' | null
  _pentagramOf(p) {
    if (Math.hypot(p.x - P.x, p.z - P.z) < P.r && Math.abs(p.y - F0) < 1.2) return 'castle';
    const P2 = CLUB.pentagram2;
    if (Math.hypot(p.x - P2.x, p.z - P2.z) < P2.r && Math.abs(p.y) < 1.2) return 'bunker';
    return null;
  }
  _onPentagram(p, which = null) { const w = this._pentagramOf(p); return which ? w === which : !!w; }
  _ownerOnPentagram() {
    const L = this.getLocal();
    return L && G.owner?.active() ? this._pentagramOf(L.pos) : null;
  }
  _ritualStep(dt) {
    const L = this.getLocal();
    for (const [R, which] of [[this.ritual, 'castle'], [this.ritual2, 'bunker']]) {
      let demon = L && L.look?.model === 'diablo' && this._onPentagram(L.pos, which);
      if (!demon) for (const rp of G.players.values()) if (rp.look?.model === 'diablo' && this._onPentagram(rp.pos, which)) { demon = true; break; }
      const target = demon ? 1 : 0;
      R.on += clamp(target - R.on, -dt * 1.2, dt * 2);
      const t = G.time;
      if (R.glow) R.glow.material.opacity = R.on * (0.65 + 0.35 * Math.sin(t * 5.3) * Math.sin(t * 1.7));
      if (R.light) R.light.intensity = R.on * (6 + 3 * Math.sin(t * 13) + (R.burst || 0) * 20);
      // la llamarada del ritual crece en tamaño, no en brillo (con brillo de más el fuego se ve como una mancha blanca)
      const bu = R.burst || 0, on = Math.min(1, R.on + bu);
      for (const i of R.fx) { this.world.flames?.set(i, on * (1.05 + 0.2 * Math.sin(t * 7 + i))); this.world.flames?.scale(i, 0.18 * (1 + bu * 0.5), 0.45 * (1 + bu * 1.2)); }
      R.burst = Math.max(0, (R.burst || 0) - dt * 0.6);
      if (!R.c) continue;
      // risas de muchos: una cada tanto, con tonos distintos (como si se riera un coro de demonios)
      if (R.on > 0.5 && t > R.laughT) {
        R.laughT = t + 0.7 + Math.random() * 1.6;
        G.sfx?.trigger('devil-laugh', V1.set(R.c.x + (Math.random() - 0.5) * 6, R.y + 1.5, R.c.z + (Math.random() - 0.5) * 6), 0.45 + Math.random() * 0.3, { variant: Math.floor(Math.random() * 3), rate: 0.7 + Math.random() * 0.75, full: 4, max: 30 });
      }
      if (R.on > 0.05) G.sfx?._loop('penta-fire-' + which, 'fire', R.on * 0.5, V1.set(R.c.x, R.y + 0.5, R.c.z), { bus: 'ambient', full: 3, max: 18 });
    }
  }
  _openRitual() {
    const where = this._ownerOnPentagram();
    if (!HAS_DOM || !where) return;
    const list = document.getElementById('ritual-list');
    const modal = document.getElementById('ritual-modal');
    if (!list || !modal) return;
    const q = document.getElementById('ritual-q');
    if (q) q.textContent = where === 'bunker' ? '¿A quién te llevás de vuelta al castillo? Solo pueden ir los que están parados en el pentagrama.' : '¿A quién te llevás al Búnker? Solo pueden ir los que están parados en el pentagrama.';
    list.innerHTML = '';
    const here = [];
    for (const [id, rp] of G.players) if (this._onPentagram(rp.pos, where)) here.push({ id, name: rp.name || 'Jugador ' + id });
    if (!here.length) list.innerHTML = '<p class="hint">No hay nadie más en el pentagrama. Te podés llevar solo a vos.</p>';
    for (const h of here) {
      const row = document.createElement('label');
      row.className = 'chk';
      row.innerHTML = `<input type="checkbox" checked data-id="${h.id}"> <span></span>`;
      row.querySelector('span').textContent = h.name;
      list.appendChild(row);
    }
    document.getElementById('ritual-all').disabled = !here.length;
    document.getElementById('ritual-some').disabled = !here.length;
    modal.classList.remove('hidden');
    this.openUI('ritual');
  }
  // desde el modal: 'all' | 'me' | 'some'
  confirmRitual(how) {
    const ids = [];
    if (how !== 'me') {
      document.querySelectorAll('#ritual-list input[type=checkbox]').forEach((c) => { if (how === 'all' || c.checked) ids.push(+c.dataset.id); });
    }
    this.getNet()?.send({ t: 'pow', a: 'ritual', ids });
    this.closeRitual();
  }
  closeRitual() { document.getElementById('ritual-modal')?.classList.add('hidden'); this.closeUI(); }
  // el servidor aprobó el ritual: fuego, risas, humo... y los elegidos desaparecen (m.to: adónde van; un servidor
  // viejo no lo manda y siempre era al Búnker)
  onRitual(m) {
    const toCastle = m.to === 'castle';
    const R = toCastle ? this.ritual2 : this.ritual, c = R.c || P, y = R.y ?? F0;
    R.burst = 1.5;
    const at = V1.set(c.x, y + 0.3, c.z).clone();
    G.sfx?.trigger('fire-flare', at, 1, { full: 6, max: 50 });
    G.sfx?.trigger('devil-laugh', at, 1, { variant: 0, rate: 0.8, full: 6, max: 60 });
    G.sfx?.trigger('stinger', at, 0.8, { full: 6, max: 40 });
    for (let k = 0; k < 10; k++) setTimeout(() => this.puff?.(V2.set(c.x + (Math.random() - 0.5) * 3, y + 0.2 + Math.random() * 1.6, c.z + (Math.random() - 0.5) * 3).clone(), 2.5), k * 120);
    const L = this.getLocal();
    const all = [m.id, ...(m.ids || [])];
    if (!all.includes(G.myId) || !L) return;
    this.busy = true;
    this.shake(0.8);
    setTimeout(() => {
      this.fade(true, () => {
        // llegada: el Diablo en el centro del otro pentagrama y los invitados en ronda alrededor (cada uno en un
        // lugar libre: teleport ya se apoya en el piso y esquiva lo que haya)
        const D = toCastle ? { x: P.x, y: F0, z: P.z, yaw: P.yaw ?? 0 } : { x: CLUB.arrive.x, y: 0, z: CLUB.arrive.z, yaw: CLUB.arrive.yaw };
        const order = all.indexOf(G.myId), a = order * 1.3;
        const r = order ? 1.15 : 0;
        this.teleport(new THREE.Vector3(D.x + Math.cos(a) * r, D.y + 0.05, D.z + Math.sin(a) * r), D.yaw);
        if (!toCastle) { this.authorized = true; try { sessionStorage.setItem('dukes.bunkerAuth', '1'); } catch { /* */ } }
        for (let k = 0; k < 6; k++) setTimeout(() => this.puff?.(V2.set(D.x + (Math.random() - 0.5) * 3, D.y + 0.3 + Math.random() * 1.5, D.z + (Math.random() - 0.5) * 3).clone(), 2.2), k * 100);
        (toCastle ? this.ritual : this.ritual2).burst = 1.2;
        G.sfx?.trigger('devil-laugh', null, 0.8, { variant: 1, rate: 1 });
        if (toCastle) this.big('⛧ EL CASTILLO ⛧', m.id === G.myId ? 'De vuelta arriba' : 'El Diablo te devolvió al castillo', 2600);
        else this.big('⛧ EL BÚNKER ⛧', m.id === G.myId ? 'Tu casa, Diablo' : 'El Diablo te trajo de invitado', 2800);
        this.busy = false;
      }, 700);
    }, 1400);
  }

  // ---------------------------------------------------------------- el trono: cámara en vivo + nombre en sangre y fuego
  _buildThroneScreen() {
    if (!HAS_DOM) return;
    const A = this.club.anchors, T = CLUB.throne;
    this.rt = new THREE.WebGLRenderTarget(512, 288, { colorSpace: THREE.SRGBColorSpace });
    this.cam = new THREE.PerspectiveCamera(40, 512 / 288, 0.1, 40);
    this.cam.position.copy(A.throneCam);
    this.cam.lookAt(A.throneLook);
    this.nameCanvas = document.createElement('canvas'); this.nameCanvas.width = 1024; this.nameCanvas.height = 320;
    this.nameTex = new THREE.CanvasTexture(this.nameCanvas); this.nameTex.colorSpace = THREE.SRGBColorSpace;
    this.screenU = { tCam: { value: this.rt.texture }, tName: { value: this.nameTex }, uT: { value: 0 }, uLive: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.screenU, toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tCam, tName; uniform float uT, uLive; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec3 col = vec3(0.0);
          // arriba: la cámara (con línea de barrido, grano y viñeta roja); si no hay nadie, estática
          vec2 cu = vec2(vUv.x, (vUv.y - 0.3) / 0.7);
          if (vUv.y > 0.3) {
            vec3 c = texture2D(tCam, cu).rgb;
            float stat = h(floor(vUv * vec2(320.0, 180.0)) + floor(uT * 30.0));
            c = mix(vec3(stat * 0.5), c, uLive);
            c *= 0.85 + 0.15 * sin(cu.y * 600.0 + uT * 20.0);
            c = mix(c, c * vec3(1.3, 0.55, 0.5), 0.35);
            float v = smoothstep(0.9, 0.35, length(cu - 0.5));
            col = c * (0.35 + 0.65 * v) + vec3(0.25, 0.0, 0.0) * (1.0 - v);
            // "REC" que titila
            if (cu.x > 0.04 && cu.x < 0.08 && cu.y > 0.86 && cu.y < 0.93 && fract(uT) < 0.6) col = vec3(1.0, 0.1, 0.1) * 2.0;
          }
          // abajo: el nombre (sangre) con llamas que suben de las letras
          vec2 nu = vec2(vUv.x, vUv.y / 0.3);
          if (vUv.y <= 0.3) {
            vec4 nm = texture2D(tName, nu); // la textura del canvas ya viene derecha (flipY)
            col = vec3(0.03, 0.0, 0.0);
            float fl = 0.0;
            for (int k = 1; k <= 6; k++) {
              float o = float(k) * 0.035;
              float a = texture2D(tName, vec2(nu.x + sin(uT * 3.0 + nu.y * 20.0) * 0.004, nu.y - o)).a; // la letra de abajo
              fl += a * (1.0 - float(k) / 7.0);
            }
            float noise = n2(vec2(nu.x * 30.0, nu.y * 8.0 - uT * 4.0)) * n2(vec2(nu.x * 11.0 + 3.0, nu.y * 5.0 - uT * 2.3));
            fl = clamp(fl * noise * 2.4, 0.0, 1.0);
            // el fuego sale de ARRIBA de las letras (no las tapa) y alrededor queda una sombra que las recorta
            fl *= 1.0 - smoothstep(0.05, 0.6, nm.a);
            float halo = 0.0;
            for (int k = 0; k < 8; k++) {
              float an = float(k) * 0.785;
              halo += texture2D(tName, vec2(nu.x + cos(an) * 0.006, nu.y + sin(an) * 0.03)).a;
            }
            halo = clamp(halo / 8.0 * 1.6, 0.0, 1.0);
            col += mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.85, 0.3), fl) * fl * 1.8;
            col *= 1.0 - halo * 0.75;
            col = mix(col, nm.rgb * 1.35, nm.a);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const fx = Math.sin(T.yaw), fz = Math.cos(T.yaw);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.7), mat);
    m.position.copy(A.throneScreen).add(V1.set(fx * 0.01, 0, fz * 0.01));
    m.rotation.y = T.yaw;
    this.club.group.add(m);
    this.screen = m;
    this.sitter = undefined;
    this._drawName(null);
  }
  _drawName(name) {
    const cv = this.nameCanvas;
    if (!cv) return;
    const g = cv.getContext('2d'), W = cv.width, Hh = cv.height;
    g.clearRect(0, 0, W, Hh);
    const text = name ? String(name).toUpperCase().slice(0, 18) : 'EL TRONO TE ESPERA';
    let px = 150;
    g.font = `${px}px Creepster, "Metal Mania", fantasy`;
    while (g.measureText(text).width > W * 0.9 && px > 40) { px -= 6; g.font = `${px}px Creepster, "Metal Mania", fantasy`; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const y = Hh * 0.46;
    // huesos y miembros cruzados detrás de las letras
    const rnd = (() => { let s = 7; for (const c of text) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    g.save();
    for (let k = 0; k < 7; k++) {
      const x = W * (0.08 + rnd() * 0.84), yy = Hh * (0.2 + rnd() * 0.6), a = (rnd() - 0.5) * 1.6, L = 80 + rnd() * 90;
      g.translate(x, yy); g.rotate(a);
      g.fillStyle = 'rgba(214,200,170,0.55)';
      g.fillRect(-L / 2, -7, L, 14);
      for (const s of [-1, 1]) { g.beginPath(); g.arc(s * L / 2, -8, 10, 0, 7); g.arc(s * L / 2, 8, 10, 0, 7); g.fill(); }
      if (k % 3 === 0) { g.fillStyle = 'rgba(120,10,12,0.8)'; g.beginPath(); g.ellipse(L / 2 + 8, 0, 14, 20, 0, 0, 7); g.fill(); } // muñón
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    g.restore();
    // letras de sangre: oscuro abajo, brillante arriba, borde negro, y chorreado
    const grd = g.createLinearGradient(0, y - px / 2, 0, y + px / 2);
    grd.addColorStop(0, '#ff7a4a'); grd.addColorStop(0.35, '#ff1a10'); grd.addColorStop(0.7, '#b00008'); grd.addColorStop(1, '#5a0004');
    g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = '#0a0000'; g.strokeText(text, W / 2, y);
    g.fillStyle = grd; g.fillText(text, W / 2, y);
    const tw = g.measureText(text).width;
    g.fillStyle = '#8a0006';
    for (let k = 0; k < 26; k++) {
      const x = W / 2 - tw / 2 + rnd() * tw, top = y + px * 0.25, len = 20 + rnd() * 70, w = 4 + rnd() * 6;
      g.fillRect(x - w / 2, top, w, len);
      g.beginPath(); g.arc(x, top + len, w * 0.9, 0, 7); g.fill();
    }
    this.nameTex.needsUpdate = true;
  }
  _throneStep(dt) {
    if (!this.screen) return;
    const T = CLUB.throne, L = this.getLocal();
    let who = null;
    if (L?.seat?.throne) who = L.name || 'Vos';
    else for (const rp of G.players.values()) if (rp.stateName === 'seated') { if (Math.hypot(rp.pos.x - T.x, rp.pos.z - T.z) < 1.2) { who = rp.name; break; } }
    if (who !== this.sitter) {
      this.sitter = who;
      this._drawName(who);
      if (who && document.fonts?.load) document.fonts.load('150px Creepster').then(() => this._drawName(this.sitter)).catch(() => {});
      if (who && this.club.visible) G.sfx?.trigger('fire-flare', V1.set(T.x, 1.5, T.z), 0.7);
    }
    this.screenU.uT.value = G.time;
    this.screenU.uLive.value += ((who ? 1 : 0) - this.screenU.uLive.value) * Math.min(1, dt * 3);
    // la cámara del trono: 15 cuadros por segundo, solo si alguien la puede ver
    this._camT = (this._camT || 0) - dt;
    let camNearScreen = false;
    if (G.camera) this.screen.getWorldPosition(V1);
    if (G.camera && G.camera.position.distanceToSquared(V1) < 28 * 28) {
      G.camera.getWorldDirection(V2);
      camNearScreen = V2.dot(V1.sub(G.camera.position).normalize()) > 0.1;
    }
    if (who && this.club.visible && camNearScreen && this._camT <= 0 && G.renderer) {
      this._camT = 1 / 15;
      const r = G.renderer, prev = r.getRenderTarget();
      const vis = this.screen.visible; this.screen.visible = false;
      this.cam.position.x = this.club.anchors.throneCam.x + Math.sin(G.time * 0.4) * 0.25;
      this.cam.lookAt(this.club.anchors.throneLook);
      r.setRenderTarget(this.rt);
      r.render(this.club.scene, this.cam);
      r.setRenderTarget(prev);
      this.screen.visible = vis;
    }
  }

  // ---------------------------------------------------------------- cada cuadro
  update(dt) {
    const L = this.getLocal();
    const nowMs = G.net?.now?.() ?? Date.now();
    // tapa de la tumba
    const tb = this.tomb;
    if (tb.target && G.time > tb.closeAt) tb.target = 0;
    tb.open += clamp(tb.target - tb.open, -dt * 0.5, dt * 0.7);
    if (tb.lid) { tb.lid.position.x = tb.x0 + tb.open * 0.85; tb.lid.rotation.y = tb.open * 0.25; }
    if (this.tombUse) this.tombUse.label = tb.open > 0.85 ? 'Bajar por la escalera de la tumba' : 'Correr la tapa de la tumba';
    this._liftStep(dt);
    this._doorStep();
    this._ritualStep(dt);
    this._throneStep(dt);
    const cam = G.camera;
    prepareNpcCulling(cam);
    // los de las alas solo con su sala a la vista (club-wings.js): ocultos no se animan
    for (const n of this.npcs) n.update(dt, cam, this.club.visible && n.scene.visible);
    if (this.club.visible) this._lavaStep(dt);
    // la música: a pleno en el club; ahogada en la antesala y el ascensor; nada afuera. Se calla con un video puesto
    const p = cam?.position;
    let want = 0, muffle = 1;
    if (p && this.club.visible) {
      const room = this.club.roomOf(p.x, p.y, p.z);
      if (room === 904) want = 1;
      else if (room === 903) { want = 0.8; muffle = this.club.doors.blast.open > 0.3 ? 0.6 : 0.18; }
      else if (room === 902) { want = 0.5; muffle = 0.08; }
      else if (room === 901) { want = 0.3; muffle = 0.05; }
    }
    const scr = G.media?.screens?.get?.('bunker')?.control?.state?.cur;
    if (scr && !scr.paused) want = 0;
    this.musicLevel = want;
    if (G.sfx) {
      if (!this.mix && G.sfx.ctx) this.mix = new ClubMix(G.sfx);
      this.mix?.update(dt, nowMs, { want: want * 0.85, muffle, lift: this.inLift && this.lift.phase === 'ride' ? 1 : this.inLift ? 0.6 : 0 });
    }
    // los que bailan encima de la pista la prenden debajo de sus pies
    const feet = [];
    if (L && this.club.visible) {
      if (Math.abs(L.pos.x) < 8 && Math.abs(L.pos.z + 462) < 6) feet.push(L.pos);
      for (const rp of G.players.values()) if (feet.length < 8 && Math.abs(rp.pos.x) < 8 && Math.abs(rp.pos.z + 462) < 6) feet.push(rp.pos);
      for (const n of this.npcs) if (feet.length < 8 && Math.abs(n.pos.x) < 8 && Math.abs(n.pos.z + 462) < 6) feet.push(n.pos);
    }
    this.club.update(dt, G.time, nowMs, { level: scr && !scr.paused ? 0.35 : 1, feet });
    this.beat = clubBeat(nowMs);
  }
}
