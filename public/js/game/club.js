// Lo que pasa en el Búnker (el club secreto del Diablo): cómo se entra y se sale, y lo que tiene reglas.
//  - La tumba de la cripta: X corre la tapa (lo ven todos) y abajo hay una escalera; X de nuevo, bajás.
//  - Arriba de la escalera del complejo, X sube a la cripta.
//  - El ascensor: una cabina con dos puertas. "Baja" (y "sube") de mentira: se cierran las puertas, tiembla, el visor
//    cuenta los pisos hasta el -666 y se abre la puerta del otro lado. Lo que aprieta uno lo ven todos (evento).
//  - El portero pide la contraseña ("tracatraca"); con la clave, la puerta blindada se te abre. De adentro, siempre.
//  - El pentagrama del cuarto secreto: parado ahí con el Diablo, X abre el ritual (el servidor lo valida) y te llevás
//    al Búnker a los que elijas de los que están en el pentagrama, entre fuego, risas y humo.
//  - El trono: el que se sienta sale en la pantalla de atrás, en vivo, con su nombre escrito en sangre y fuego.
import * as THREE from 'three';
import { G, clamp } from '../core/G.js';
import { CLUB, CASTLE, INTERACT } from '../shared/mapdata.js';
import { Npc } from './npc.js';
import { clubBeat } from '../world/club.js';
import { getMat } from '../world/builder.js';
import { ClubMix } from '../audio/clubmix.js';

const HAS_DOM = typeof document !== 'undefined';
const F0 = CASTLE.keep.floor;
const P = CLUB.pentagram;
const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const LIFT = { close: 1.3, move: 5.5, open: 1.2 };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

const DOORMAN_HI = ['¿Y vos quién sos?', 'Acá no entra cualquiera, mostro.', 'Sin contraseña no hay fiesta.', 'Ni lo sueñes, flaco.', 'La lista está cerrada. Bah, no hay lista.'];
const DOORMAN_OK = ['Pasá, rey. Portate mal.', 'Adelante. Lo que pasa en el Búnker queda en el Búnker.', 'Bienvenido al infierno, papu.', 'Todo tuyo. Cuidado con la jaula.'];
const DOORMAN_NO = ['¿Qué te pasa, gil? Tomatela.', 'Esa no es. Andá a la cripta a pensar.', 'Contraseña incorrecta. Te anoto en la lista negra.', 'Casi. No. Para nada. Rajá.'];

export class ClubGame {
  constructor({ world, getLocal, getNet, notify, big, teleport, fade, openUI, closeUI, shake, puff, isOwner }) {
    this.world = world;
    this.club = world.club;
    this.getLocal = getLocal; this.getNet = getNet;
    this.notify = notify; this.big = big; this.teleport = teleport; this.fade = fade;
    this.openUI = openUI; this.closeUI = closeUI; this.shake = shake; this.puff = puff; this.isOwner = isOwner;
    this.authIds = new Set();
    try { this.authorized = sessionStorage.getItem('dukes.bunkerAuth') === '1'; } catch { this.authorized = false; }
    this.tomb = { open: 0, target: 0, closeAt: 0 };
    this.lift = { at: 'top', phase: 'idle', t0: 0, to: 'top', open: null };
    this.ritual = { on: 0, laughT: 0, fx: [] };
    this.npcs = [];
    this.busy = false;
    this._buildTomb();
    this._buildPentagram();
    this._buildThroneScreen();
    this._makeNpcs();
    this._interact();
  }

  // ---------------------------------------------------------------- puntos de X
  _interact() {
    const T = CLUB.tomb;
    this.tombUse = { id: 'club_tomb', k: 'club', e: 'tomb', p: [T.x, 1.0, T.z], r: 1.9, label: 'Correr la tapa de la tumba' };
    this.ritualUse = { id: 'club_ritual', k: 'club', e: 'ritual', p: [P.x, F0 + 1, P.z], r: P.r, label: '⛧ Ritual: bajar al Búnker', when: () => this._ownerOnPentagram() };
    INTERACT.push(this.tombUse, this.ritualUse);
    // el portero y el ascensor ya los registró world/club.js (k: 'club')
    for (const it of this.club.interact) if (it.e === 'ride') this.rideUse = it;
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
      case 'bar': L.giveItem('beer'); G.sfx?.trigger('pickup'); this.bartender?.say(['Tomá, invita la casa.', 'Esa te va a pegar.', 'Una birra del infierno.'][Math.floor(Math.random() * 3)], 2.4); break;
      case 'monitors': this.notify('📺 Las cámaras de seguridad todavía no están conectadas.'); break;
      case 'ritual': this._openRitual(); break;
      default: break;
    }
  }
  _send(m) { this.getNet()?.send({ t: 'ev', k: 'club', ...m }); }

  // eventos de otros jugadores
  remote(m) {
    if (m.e === 'tomb') this._openTomb();
    else if (m.e === 'lift') this._liftApply(m);
    else if (m.e === 'auth' && m.id) this.authIds.add(m.id);
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
  _liftApply(m) {
    const Lf = this.lift, D = this.club.doors;
    if (m.a === 'open') {
      Lf.open = m.side;
      (m.side === 's' ? D.liftS : D.liftN).target = 1;
      G.sfx?.trigger('pickup', this.club.anchors.liftCenter, 0.5);
      return;
    }
    Lf.phase = 'ride'; Lf.t0 = m.t0; Lf.to = m.to === 'bottom' ? 'bottom' : 'top'; Lf.from = Lf.to === 'top' ? 'bottom' : 'top';
    D.liftS.target = 0; D.liftN.target = 0; Lf.open = null;
  }
  _liftStep(dt) {
    const Lf = this.lift, D = this.club.doors, L = this.getLocal();
    const inside = L && this._inLift(L.pos);
    if (Lf.phase === 'ride') {
      const t = ((G.net?.now?.() ?? Date.now()) - Lf.t0) / 1000;
      const down = Lf.to === 'bottom';
      if (t < LIFT.close) this.club.setFloor(down ? 'P.B.' : '-666', !down);
      else if (t < LIFT.close + LIFT.move) {
        const p = (t - LIFT.close) / LIFT.move, e = p * p * (3 - 2 * p);
        const n = Math.round((down ? e : 1 - e) * 666);
        this.club.setFloor(n === 0 ? 'P.B.' : '-' + n, n > 600);
        if (inside) {
          this.shake(0.05 + 0.1 * Math.sin(p * Math.PI));
          G.sfx?._loop('lift-hum', 'engine', 0.35, null, { bus: 'ambient', rate: 0.45 });
        }
      } else {
        Lf.phase = 'idle'; Lf.at = Lf.to;
        this.club.setFloor(Lf.at === 'bottom' ? '-666' : 'P.B.', Lf.at === 'bottom');
        Lf.open = Lf.at === 'bottom' ? 'n' : 's';
        (Lf.open === 's' ? D.liftS : D.liftN).target = 1;
        G.sfx?.trigger('pickup', this.club.anchors.liftCenter, 0.7);
        if (inside && Lf.at === 'bottom') this.big('NIVEL -666', 'Bienvenido al infierno. Hay portero.', 2200);
      }
    }
    this.rideUse && (this.rideUse.label = Lf.phase === 'ride' ? 'Esperá...' : Lf.at === 'top' ? 'Apretar el botón (bajar al -666)' : 'Apretar el botón (subir)');
    for (const d of [D.liftS, D.liftN]) { try { d.collider.setEnabled(d.open < 0.85); } catch { /* */ } }
    this.inLift = !!inside;
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
        this.doorman.action = 'punch'; this.doorman.actionT = 0; this.doorman.actionEnd = 0.6;
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

  // ---------------------------------------------------------------- NPCs (por ahora el portero; el resto con los modelos nuevos)
  _makeNpcs() {
    const scene = this.club.group;
    const Dm = CLUB.doorman;
    this.doorman = new Npc(scene, {
      name: 'El Portero', look: { model: 'galleta', hat: 'none', glasses: 'sun' }, pos: new THREE.Vector3(Dm.x, 0, Dm.z), yaw: Dm.yaw, height: 1.35,
      role: (n, dt) => {
        const L = this.getLocal();
        const near = L && Math.hypot(L.pos.x - n.pos.x, L.pos.z - n.pos.z) < 6 && L.pos.z > CLUB.door.z;
        n.lookAt = near ? L.pos : null;
        n.data.t = (n.data.t || 0) - dt;
        if (near && !n.data.greeted) { n.data.greeted = true; if (!this.authorized) n.say(DOORMAN_HI[Math.floor(Math.random() * DOORMAN_HI.length)], 3); }
        if (!near) n.data.greeted = false;
        if (!n.emote && n.data.t < 0) { n.data.t = 6 + Math.random() * 6; n.emote = Math.random() < 0.5 ? 'flex' : null; n.emoteT = 0; setTimeout(() => { if (n.emote === 'flex') n.emote = null; }, 2500); }
      },
    });
    this.npcs.push(this.doorman);
  }

  // ---------------------------------------------------------------- pentagrama y ritual
  _buildPentagram() {
    const scene = this.club.scene;
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
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    mat.color.setScalar(3);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 3.7), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(P.x, F0 + 0.05, P.z);
    scene.add(m);
    this.ritual.glow = m;
    this.ritual.light = { position: new THREE.Vector3(P.x, F0 + 1.2, P.z), color: new THREE.Color(0xff2a10), intensity: 0, distance: 9, decay: 1.6, visible: true, priority: 3, base: 8 };
    this.world.pool?.add(this.ritual.light);
    // anillo de llamas (apagadas hasta que se para el Diablo)
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const i = this.world.flames?.add(P.x + Math.cos(a) * (P.r + 0.1), F0 + 0.02, P.z + Math.sin(a) * (P.r + 0.1), 0.18, 0.45, { intensity: 0 });
      if (i !== undefined && i >= 0) this.ritual.fx.push(i);
    }
  }
  _onPentagram(p) { return Math.hypot(p.x - P.x, p.z - P.z) < P.r && Math.abs(p.y - F0) < 1.2; }
  _ownerOnPentagram() {
    const L = this.getLocal();
    return !!(L && G.owner?.active() && this._onPentagram(L.pos));
  }
  _ritualStep(dt) {
    const L = this.getLocal();
    let demon = L && L.look?.model === 'diablo' && this._onPentagram(L.pos);
    if (!demon) for (const rp of G.players.values()) if (rp.look?.model === 'diablo' && this._onPentagram(rp.pos)) { demon = true; break; }
    const R = this.ritual;
    const target = demon ? 1 : 0;
    R.on += clamp(target - R.on, -dt * 1.2, dt * 2);
    const t = G.time;
    if (R.glow) R.glow.material.opacity = R.on * (0.65 + 0.35 * Math.sin(t * 5.3) * Math.sin(t * 1.7));
    if (R.light) R.light.intensity = R.on * (6 + 3 * Math.sin(t * 13) + (R.burst || 0) * 20);
    for (const i of R.fx) this.world.flames?.set(i, R.on * (1.4 + 0.3 * Math.sin(t * 7 + i)) + (R.burst || 0) * 2);
    R.burst = Math.max(0, (R.burst || 0) - dt * 0.6);
    // risas de muchos: una cada tanto, con tonos distintos (como si se riera un coro de demonios)
    if (R.on > 0.5 && t > R.laughT) {
      R.laughT = t + 0.7 + Math.random() * 1.6;
      G.sfx?.trigger('devil-laugh', V1.set(P.x + (Math.random() - 0.5) * 6, F0 + 1.5, P.z + (Math.random() - 0.5) * 6), 0.45 + Math.random() * 0.3, { variant: Math.floor(Math.random() * 3), rate: 0.7 + Math.random() * 0.75, full: 4, max: 30 });
    }
    if (R.on > 0.05) G.sfx?._loop('penta-fire', 'fire', R.on * 0.5, V1.set(P.x, F0 + 0.5, P.z), { bus: 'ambient', full: 3, max: 18 });
  }
  _openRitual() {
    if (!HAS_DOM || !this._ownerOnPentagram()) return;
    const list = document.getElementById('ritual-list');
    const modal = document.getElementById('ritual-modal');
    if (!list || !modal) return;
    list.innerHTML = '';
    const here = [];
    for (const [id, rp] of G.players) if (this._onPentagram(rp.pos)) here.push({ id, name: rp.name || 'Jugador ' + id });
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
  // el servidor aprobó el ritual: fuego, risas, humo... y los elegidos desaparecen
  onRitual(m) {
    const R = this.ritual;
    R.burst = 1.5;
    const at = V1.set(P.x, F0 + 0.3, P.z).clone();
    G.sfx?.trigger('fire-flare', at, 1, { full: 6, max: 50 });
    G.sfx?.trigger('devil-laugh', at, 1, { variant: 0, rate: 0.8, full: 6, max: 60 });
    G.sfx?.trigger('stinger', at, 0.8, { full: 6, max: 40 });
    for (let k = 0; k < 10; k++) setTimeout(() => this.puff?.(V2.set(P.x + (Math.random() - 0.5) * 3, F0 + 0.2 + Math.random() * 1.6, P.z + (Math.random() - 0.5) * 3).clone(), 2.5), k * 120);
    const L = this.getLocal();
    const mine = [m.id, ...(m.ids || [])].includes(G.myId);
    if (!mine || !L) return;
    this.busy = true;
    this.shake(0.8);
    setTimeout(() => {
      this.fade(true, () => {
        const A = CLUB.arrive, order = [m.id, ...(m.ids || [])].indexOf(G.myId);
        const a = order * 1.1;
        this.teleport(new THREE.Vector3(A.x + Math.cos(a) * (order ? 1.4 : 0), 0.05, A.z + Math.sin(a) * (order ? 1.4 : 0)), A.yaw);
        this.authorized = true; try { sessionStorage.setItem('dukes.bunkerAuth', '1'); } catch { /* */ }
        for (let k = 0; k < 6; k++) setTimeout(() => this.puff?.(V2.set(A.x + (Math.random() - 0.5) * 3, 0.3 + Math.random() * 1.5, A.z + (Math.random() - 0.5) * 3).clone(), 2.2), k * 100);
        G.sfx?.trigger('devil-laugh', null, 0.8, { variant: 1, rate: 1 });
        this.big('⛧ EL BÚNKER ⛧', m.id === G.myId ? 'Tu casa, Diablo' : 'El Diablo te trajo de invitado', 2800);
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
            vec4 nm = texture2D(tName, vec2(nu.x, 1.0 - nu.y));
            col = vec3(0.03, 0.0, 0.0);
            float fl = 0.0;
            for (int k = 1; k <= 6; k++) {
              float o = float(k) * 0.035;
              float a = texture2D(tName, vec2(nu.x + sin(uT * 3.0 + nu.y * 20.0) * 0.004, 1.0 - (nu.y - o))).a;
              fl += a * (1.0 - float(k) / 7.0);
            }
            float noise = n2(vec2(nu.x * 30.0, nu.y * 8.0 - uT * 4.0)) * n2(vec2(nu.x * 11.0 + 3.0, nu.y * 5.0 - uT * 2.3));
            fl = clamp(fl * noise * 2.4, 0.0, 1.0);
            col += mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.85, 0.3), fl) * fl * 1.8;
            col = mix(col, nm.rgb, nm.a);
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
    grd.addColorStop(0, '#ff2a2a'); grd.addColorStop(0.5, '#b00008'); grd.addColorStop(1, '#4a0003');
    g.lineWidth = 10; g.strokeStyle = '#1a0000'; g.strokeText(text, W / 2, y);
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
    if (who && this.club.visible && this._camT <= 0 && G.renderer) {
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
    for (const n of this.npcs) n.update(dt, cam, this.club.visible);
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
