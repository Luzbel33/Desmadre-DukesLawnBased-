// El Búnker: el club secreto del Diablo (ver CLUB en mapdata.js).
// De sur a norte: la escalera de piedra que baja desde la tumba de la cripta, el pasillo de hormigón con el
// ascensor, la antesala (el portero y la puerta blindada) y el club: pista de LED, escenario con caños, cabina del
// DJ, barra, jaula de peleas, el trono del Diablo con fuego, sillones, el rincón del calabozo y la sala de monitores.
// Acá va lo que se ve y los colliders; lo que se mueve con reglas (ascensor, puertas, portero, ritual) está en
// game/club.js. Todo lo del club cuelga de un grupo que solo se dibuja cuando la cámara anda cerca.
import * as THREE from 'three';
import { G, clamp, rng } from '../core/G.js';
import { Builder, getMat, defineMat } from './builder.js';
import { CLUB } from '../shared/mapdata.js';

const HAS_DOM = typeof document !== 'undefined';
const C = CLUB, H = C.hall;
const WT = 0.4; // espesor de muros
export const BPM = 126;
const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const COL = new THREE.Color();

// pulso de la música: todos los clientes con la misma hora del servidor ven el mismo compás
export function clubBeat(nowMs) {
  const b = (nowMs / 1000) * (BPM / 60);
  return { beat: b, i: Math.floor(b), f: b - Math.floor(b), bar: Math.floor(b / 4) };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ctex(cv) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// cartel de neón: letras con halo (se dibuja una vez); emisivo fuerte para que el bloom lo haga brillar
function neonSign(text, { font = 'Metal Mania', px = 120, color = '#ff2040', w = 1024, h = 256, glow = 28 } = {}) {
  const cv = canvas(w, h), g = cv.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.font = `${px}px "${font}", Georgia, serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const [blur, alpha, lw] of [[glow, 0.9, 10], [glow * 0.5, 1, 6], [0, 1, 3]]) {
    g.shadowColor = color; g.shadowBlur = blur; g.globalAlpha = alpha;
    g.strokeStyle = color; g.lineWidth = lw; g.strokeText(text, w / 2, h / 2);
  }
  g.globalAlpha = 1; g.shadowBlur = 8; g.fillStyle = '#fff6f8'; g.fillText(text, w / 2, h / 2);
  const t = ctex(cv);
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  m.color.setScalar(2.2); // > 1: pasa el umbral del bloom
  return m;
}
// pared pintada / cartel impreso (no brilla)
function printed(draw, w = 512, h = 256) {
  const cv = canvas(w, h), g = cv.getContext('2d');
  draw(g, w, h);
  return new THREE.MeshStandardMaterial({ map: ctex(cv), roughness: 0.85, transparent: true });
}
function hazardTex() {
  const cv = canvas(256, 64), g = cv.getContext('2d');
  g.fillStyle = '#d8b020'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#141414';
  for (let x = -64; x < 320; x += 48) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 24, 64); g.lineTo(x + 88, 0); g.lineTo(x + 64, 0); g.fill(); }
  const t = ctex(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Club {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;
    this.phys = world.phys;
    this.group = new THREE.Group();
    this.group.name = 'bunker';
    this.scene.add(this.group);
    this.b = new Builder(world.phys);
    this.rooms = [];
    this.lights = []; // virtuales (el pool de luces las reparte)
    this.party = []; // luces que laten con la música
    this.seats = [];
    this.interact = [];
    this.anchors = {};
    this.doors = {}; // { leaves: [mesh...], collider, open, target, axis, slide }
    this.anim = []; // (t, dt, beat) => void
    this.fireIds = [];
    this.poles = [];
    this.rand = rng(666);
    this.visible = true;
  }

  // ---------------------------------------------------------------- primitivas
  box(key, cx, cy, cz, sx, sy, sz, opts = {}) { this.b.box(key, cx, cy, cz, sx, sy, sz, opts); }
  deco(key, cx, cy, cz, sx, sy, sz, opts = {}) { this.b.box(key, cx, cy, cz, sx, sy, sz, { ...opts, collide: false }); }
  cyl(key, x, y, z, r0, r1, h, seg = 16, opts = {}) {
    const circ = 2 * Math.PI * Math.max(r0, r1), t = getMat(key).userData.tileU || 1;
    this.b.cylinder(key, x, y, z, r0, r1, h, seg, { uvScale: [circ / t, h / t], ...opts });
  }
  // muro en X (a lo largo de x, en z fijo) o en Z, con huecos [a, b, y0, y1] sobre su eje
  wallX(key, x0, x1, z, h, holes = [], y0 = 0, t = WT) {
    this.b.wall(key, x0, z, x1, z, h, t, holes.map(([a, b, h0, h1]) => ({ from: a - x0, to: b - x0, bottom: h0 - y0, top: h1 - y0 })), { y0 });
  }
  wallZ(key, x, z0, z1, h, holes = [], y0 = 0, t = WT) {
    // corre de z0 a z1 (z0 > z1: hacia el norte)
    this.b.wall(key, x, z0, x, z1, h, t, holes.map(([a, b, h0, h1]) => ({ from: Math.min(z0 - a, z0 - b), to: Math.max(z0 - a, z0 - b), bottom: h0 - y0, top: h1 - y0 })), { y0 });
  }
  room(x0, y0, z0, x1, y1, z1, id) { this.rooms.push({ x0, y0, z0: Math.min(z0, z1), x1, y1, z1: Math.max(z0, z1), id }); }
  roomOf(x, y, z) {
    for (const r of this.rooms) if (x >= r.x0 && x <= r.x1 && y >= r.y0 - 0.5 && y <= r.y1 && z >= r.z0 && z <= r.z1) return r.id;
    return 0;
  }
  light(x, y, z, color, intensity, distance, { flicker = false, priority = 1, decay = 1.7, shadow = false } = {}) {
    const l = { position: new THREE.Vector3(x, y, z), color: new THREE.Color(color), intensity, distance, decay, visible: true, priority, base: intensity, shadow };
    l.room = this.roomOf(x, y, z);
    this.world.pool?.add(l);
    if (flicker) this.world.flicker.push({ light: l, base: intensity, seed: this.rand() * 100, fire: true });
    this.lights.push(l);
    return l;
  }
  fire(x, y, z, hx, hz, h, intensity = 1) {
    const w = this.world;
    if (w.fires && w.quality !== 'baja') { this.fireIds.push(w.fires.add(x, y, z, hx, hz, h, { intensity, wind: 0, speed: 1.1 })); return; }
    w.flames?.add(x, y, z, Math.min(hx, hz) * 1.8, h, { intensity });
  }
  mesh(geo, mat, x, y, z, { yaw = 0, rx = 0, rz = 0, shadow = false } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, yaw, rz, 'YXZ');
    m.castShadow = shadow; m.receiveShadow = true;
    this.group.add(m);
    return m;
  }
  seat(x, y, z, yaw, extra = {}) { this.seats.push({ x, y, z, yaw, ...extra }); }
  use(id, p, r, label, extra = {}) { this.interact.push({ id, k: 'club', p, r, label, ...extra }); }

  build() {
    this.room(-1.6, 0, -407.8, 1.6, 9.8, C.stairs.zBot, 900);
    this.room(C.lobby.x0, 0, C.lobby.z1, C.lobby.x1, 3.2, C.lobby.z0, 901);
    this.room(C.lift.x0, 0, C.lift.z1, C.lift.x1, C.lift.h, C.lift.z0, 902);
    this.room(C.ante.x0, 0, C.ante.z1, C.ante.x1, C.ante.h, C.ante.z0, 903);
    this.room(H.x0, 0, H.z1, H.x1, H.h, H.z0, 904);
    this._stairs();
    this._lobby();
    this._lift();
    this._ante();
    this._hall();
    this._stage();
    this._bar();
    this._cage();
    this._throne();
    this._lounge();
    this._dungeon();
    this._control();
    const meshes = this.b.finish(this.group);
    for (const m of meshes) m.userData.club = true;
    if (HAS_DOM) {
      this._led();
      this._beams();
      this._lasers();
      this._mirrorBall();
      this._signs();
    }
    this._smoke();
    this.group.traverse((o) => { if (o.isMesh) o.userData.club = true; });
    return this;
  }

  // ---------------------------------------------------------------- escalera de piedra (desde la tumba)
  _stairs() {
    const S = C.stairs, n = 24, rise = S.rise / n, run = (S.zTop - S.zBot) / n;
    const top = S.rise;
    // descanso de arriba (adonde llegás) y la pared de atrás con el hueco negro de la tumba
    this.box('keepStone', 0, top / 2, -409.1, 3.2, top, 2.6);
    this.wallX('castleStone', -1.8, 1.8, -407.6, 9.8, [[-0.8, 0.8, top, top + 2.3]]);
    this.deco('black', 0, top + 1.15, -407.84, 1.6, 2.3, 0.05); // la subida a la cripta: oscuridad
    for (let k = 0; k < 3; k++) this.deco('keepStone', 0, top + (k + 1) * 0.09, -408.1 - (2 - k) * 0.28, 1.5, (k + 1) * 0.18, 0.28);
    this.anchors.up = new THREE.Vector3(0, top, -408.4);
    this.use('club_up', [0, top + 1, -408.3], 1.8, 'Subir a la cripta', { e: 'up' });
    // escalones (macizos, como en el castillo) y una rampa invisible para caminar
    for (let i = 0; i < n; i++) {
      const z = S.zTop - (i + 0.5) * run, y = top - (i + 1) * rise;
      if (y > 0.02) this.deco('keepStone', 0, y / 2, z, 3.2, y, run + 0.01);
    }
    const L = Math.hypot(S.rise, S.zTop - S.zBot), ang = Math.atan2(S.rise, S.zTop - S.zBot);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(ang, 0, 0));
    this.phys.box(0, top / 2 - 0.1, (S.zTop + S.zBot) / 2, 1.6, 0.1, L / 2, 0, { rot: { x: q.x, y: q.y, z: q.z, w: q.w }, mat: 'stone' });
    // muros, techo alto y antorchas
    for (const x of [-1.8, 1.8]) this.wallZ('castleStone', x, -407.4, S.zBot, 9.8);
    this.deco('keepStone', 0, 9.95, (-407.4 + S.zBot) / 2, 4, 0.3, -407.4 - S.zBot);
    for (let k = 0; k < 4; k++) {
      const z = S.zTop - 1.5 - k * 2.9, y = top - ((S.zTop - z) / (S.zTop - S.zBot)) * S.rise + 2.1;
      const x = k % 2 ? 1.5 : -1.5;
      this.deco('iron', x, y - 0.25, z, 0.06, 0.5, 0.06);
      this.cyl('blackWood', x, y + 0.05, z, 0.05, 0.03, 0.34, 8);
      this.fire(x, y + 0.22, z, 0.07, 0.07, 0.34, 0.9);
      this.light(x * 0.8, y + 0.4, z, 0xff8a3a, 3.2, 7, { flicker: true, priority: 1.4 });
    }
    // telarañas y huesos en los escalones de abajo
    for (let k = 0; k < 6; k++) this.deco('bone', (this.rand() - 0.5) * 2.4, 0.04, S.zBot + 0.4 + this.rand() * 1.2, 0.05, 0.05, 0.3 + this.rand() * 0.2, { yaw: this.rand() * 3 });
  }

  // ---------------------------------------------------------------- pasillo de hormigón y ascensor
  _lobby() {
    const Lb = C.lobby, h = 3.2;
    this.deco('bunkerConcrete', 0, 0.02, (Lb.z0 + Lb.z1) / 2, Lb.x1 - Lb.x0, 0.04, Lb.z1 - Lb.z0);
    for (const x of [Lb.x0 - 0.2, Lb.x1 + 0.2]) this.wallZ('bunkerConcrete', x, Lb.z1, Lb.z0 - 0.2, h);
    // del lado de la escalera: la abertura y el dintel
    this.wallX('bunkerConcrete', Lb.x0 - 0.4, Lb.x1 + 0.4, Lb.z1, 9.8, [[-1.6, 1.6, 0, h]]);
    // del lado del ascensor: la puerta
    this.wallX('bunkerConcrete', Lb.x0 - 0.4, Lb.x1 + 0.4, Lb.z0 - 0.2, h, [[-1.2, 1.2, 0, 2.4]]);
    this.deco('bunkerConcrete', 0, h + 0.15, (Lb.z0 + Lb.z1) / 2, Lb.x1 - Lb.x0 + 0.8, 0.3, Lb.z1 - Lb.z0 + 0.4);
    // caños por el techo, tubo fluorescente que titila, franja amarilla y negra en el marco del ascensor
    for (const x of [-2.6, -2.35, 2.5]) this.cyl('rust', x, h - 0.2, (Lb.z0 + Lb.z1) / 2, 0.06, 0.06, Lb.z1 - Lb.z0, 8, { rx: Math.PI / 2 });
    this.deco('fluo', 0, h - 0.05, -425.6, 0.12, 0.05, 1.3);
    const fl = this.light(0, h - 0.3, -425.6, 0xdfeeff, 5.5, 9, { priority: 1.3 });
    this.anim.push((t) => { const x = Math.sin(t * 23) + Math.sin(t * 7.3); fl.intensity = x > 1.55 ? 0.6 : 5.5; });
    if (HAS_DOM) {
      const hz = new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.6 });
      hz.map.repeat.set(3, 1);
      for (const x of [-1.32, 1.32]) this.mesh(new THREE.BoxGeometry(0.2, 2.5, 0.06), hz, x, 1.25, Lb.z0 - 0.02);
      this.mesh(new THREE.BoxGeometry(2.84, 0.2, 0.06), hz, 0, 2.5, Lb.z0 - 0.02);
      const sign = printed((g, w, hh) => {
        g.fillStyle = '#e8e2d0'; g.fillRect(0, 0, w, hh);
        g.fillStyle = '#b01010'; g.fillRect(0, 0, w, 64);
        g.fillStyle = '#fff'; g.font = 'bold 44px Rubik, sans-serif'; g.textAlign = 'center'; g.fillText('¡PELIGRO!', w / 2, 48);
        g.fillStyle = '#111'; g.font = 'bold 38px Rubik, sans-serif'; g.fillText('BÚNKER — NIVEL -666', w / 2, 120);
        g.font = '26px Rubik, sans-serif'; g.fillText('Solo personal autorizado', w / 2, 170);
        g.fillText('No se aceptan devoluciones de almas', w / 2, 212);
      });
      this.mesh(new THREE.PlaneGeometry(1.3, 0.65), sign, 2.2, 1.7, Lb.z0 + 0.02);
      const wet = printed((g, w, hh) => {
        g.fillStyle = '#f0c020'; g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w - 20, hh - 10); g.lineTo(20, hh - 10); g.fill();
        g.fillStyle = '#111'; g.font = 'bold 34px Rubik'; g.textAlign = 'center'; g.fillText('PISO CON', w / 2, hh * 0.62); g.fillText('SANGRE', w / 2, hh * 0.8);
      }, 256, 256);
      this.mesh(new THREE.PlaneGeometry(0.5, 0.5), wet, -2.6, 0.26, -423.2, { yaw: 0.6 });
    }
    // el botón para llamarlo
    this.deco('steel', 1.55, 1.2, Lb.z0 + 0.02, 0.14, 0.28, 0.04);
    this.deco('redLamp', 1.55, 1.24, Lb.z0 + 0.05, 0.05, 0.05, 0.02);
    this.use('club_call_s', [1.3, 1.2, Lb.z0 + 0.7], 1.6, 'Llamar el ascensor', { e: 'call', side: 's' });
  }

  _lift() {
    const L = C.lift, h = L.h;
    // cabina de acero con piso de chapa semillada, pasamanos, tablero y el visor de pisos
    this.deco('bunkerIron', 0, 0.03, (L.z0 + L.z1) / 2, L.x1 - L.x0, 0.06, L.z1 - L.z0);
    for (const x of [L.x0 - 0.1, L.x1 + 0.1]) this.box('steel', x, h / 2, (L.z0 + L.z1) / 2, 0.2, h, L.z1 - L.z0);
    this.deco('steel', 0, h + 0.1, (L.z0 + L.z1) / 2, L.x1 - L.x0 + 0.4, 0.2, L.z1 - L.z0);
    for (const x of [L.x0 + 0.06, L.x1 - 0.06]) this.deco('chrome', x, 0.95, (L.z0 + L.z1) / 2, 0.04, 0.04, 2.6);
    this.deco('fluo', 0, h - 0.02, (L.z0 + L.z1) / 2, 1.8, 0.03, 0.18);
    this.liftLight = this.light(0, h - 0.3, (L.z0 + L.z1) / 2, 0xfff4e0, 3.5, 6, { priority: 1.6 });
    // tablero (del lado este, adentro)
    this.deco('darkgray', L.x1 - 0.02, 1.3, -431.6, 0.04, 0.6, 0.34);
    for (let k = 0; k < 4; k++) this.deco(k === 3 ? 'redLamp' : 'gold', L.x1 - 0.05, 1.12 + k * 0.12, -431.6, 0.02, 0.06, 0.06);
    this.use('club_lift', [0.9, 1.2, -431.6], 1.3, 'Apretar el botón', { e: 'ride' });
    // visor de pisos (lo escribe game/club.js)
    if (HAS_DOM) {
      this.floorCanvas = canvas(256, 96);
      this.floorTex = ctex(this.floorCanvas);
      const m = new THREE.MeshBasicMaterial({ map: this.floorTex, toneMapped: false });
      m.color.setScalar(1.6);
      for (const [z, yaw] of [[L.z1 - 0.12, Math.PI], [L.z0 + 0.12, 0]]) this.mesh(new THREE.PlaneGeometry(0.5, 0.19), m, 0, 2.66, z, { yaw });
      this.setFloor('P.B.');
    }
    // puertas corredizas: sur (pasillo) y norte (antesala); dos hojas cada una
    const leaves = (z) => [-1, 1].map((s) => this.mesh(new THREE.BoxGeometry(0.62, 2.4, 0.06), getMat('steel'), s * 0.3, 1.2, z));
    this.doors.liftS = { leaves: leaves(L.z1 - 0.05), collider: this.phys.box(0, 1.2, L.z1 - 0.05, 1.2, 1.2, 0.05, 0, { paint: false }), open: 0, target: 0, kind: 'lift' };
    this.doors.liftN = { leaves: leaves(L.z0 + 0.05), collider: this.phys.box(0, 1.2, L.z0 + 0.05, 1.2, 1.2, 0.05, 0, { paint: false }), open: 0, target: 0, kind: 'lift' };
    this.anchors.liftCenter = new THREE.Vector3(0, 0, (L.z0 + L.z1) / 2);
  }
  setFloor(text, red = false) {
    if (!this.floorCanvas) return;
    const g = this.floorCanvas.getContext('2d');
    g.fillStyle = '#070303'; g.fillRect(0, 0, 256, 96);
    g.font = 'bold 64px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = red ? '#ff2010' : '#ff9a20'; g.shadowBlur = 14; g.fillStyle = red ? '#ff4030' : '#ffb040';
    g.fillText(text, 128, 50);
    this.floorTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- antesala: el portero y la puerta blindada
  _ante() {
    const A = C.ante, h = A.h;
    this.deco('blackTile', 0, 0.02, (A.z0 + A.z1) / 2, A.x1 - A.x0, 0.04, A.z1 - A.z0);
    this.deco('velvet', 0, 0.045, (A.z0 + A.z1) / 2 + 0.6, 2.2, 0.01, A.z1 - A.z0 - 2);
    for (const x of [A.x0 - 0.2, A.x1 + 0.2]) this.wallZ('bunkerBrick', x, A.z1, A.z0, h);
    this.wallX('bunkerBrick', A.x0 - 0.4, A.x1 + 0.4, A.z1 - 0.2, h, [[-1.2, 1.2, 0, 2.4]]);
    this.deco('bunkerBrick', 0, h + 0.15, (A.z0 + A.z1) / 2, A.x1 - A.x0 + 0.8, 0.3, A.z1 - A.z0 + 0.4);
    // cordón de terciopelo con postes dorados (la fila que nadie respeta)
    for (let k = 0; k < 4; k++) this.cyl('gold', -2.2, 0.5, -436 - k * 1.8, 0.05, 0.08, 1, 10);
    for (let k = 0; k < 3; k++) this.cyl('velvet', -2.2, 0.88, -436.9 - k * 1.8, 0.03, 0.03, 1.8, 6, { rx: Math.PI / 2 });
    // apliques rojos y un banco
    for (const [x, z] of [[-6.8, -436.5], [6.8, -436.5], [-6.8, -441.5], [6.8, -441.5]]) {
      this.deco('iron', x, 2.4, z, 0.08, 0.4, 0.2);
      this.deco('redLamp', x + (x < 0 ? 0.1 : -0.1), 2.55, z, 0.1, 0.16, 0.1);
      this.light(x + (x < 0 ? 0.6 : -0.6), 2.5, z, 0xff2a20, 2.4, 6, { flicker: true, priority: 1.1 });
    }
    this.box('leatherBlack', -6.4, 0.25, -439, 0.7, 0.5, 2.2);
    for (const dz of [-0.6, 0.6]) this.seat(-6.3, 0.52, -439 + dz, Math.PI / 2);
    // el portero: se para al lado de la puerta (su cuerpo lo pone game/club.js); acá su lámpara y su atril
    this.box('blackWood', C.doorman.x + 0.6, 0.55, C.doorman.z + 0.5, 0.5, 1.1, 0.4);
    this.deco('lamp', C.doorman.x + 0.6, 1.2, C.doorman.z + 0.5, 0.08, 0.1, 0.08);
    this.light(C.doorman.x + 0.2, 2.1, C.doorman.z + 0.4, 0xffd9a0, 2.2, 5, { priority: 1.2 });
    this.use('club_doorman', [C.doorman.x - 0.4, 1.1, C.doorman.z + 0.6], 2.2, 'Hablar con el portero', { e: 'doorman' });
    // la pared de la puerta blindada es la del club (ver _hall); el marco con franjas y la puerta
    if (HAS_DOM) {
      const hz = new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.6 });
      hz.map.repeat.set(4, 1);
      for (const x of [-1.5, 1.5]) this.mesh(new THREE.BoxGeometry(0.3, 3.4, 0.12), hz, x, 1.7, C.door.z + 0.28);
      this.mesh(new THREE.BoxGeometry(3.3, 0.3, 0.12), hz, 0, 3.35, C.door.z + 0.28);
      const stencil = printed((g, w, hh) => {
        g.clearRect(0, 0, w, hh);
        g.fillStyle = 'rgba(210,20,20,0.9)'; g.font = 'bold 150px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('666', w / 2, hh / 2 + 6);
      }, 512, 256);
      this.doorStencil = stencil;
    }
    const leaf = this.mesh(new THREE.BoxGeometry(C.door.w + 0.1, C.door.h + 0.05, 0.22), getMat('bunkerIron'), 0, C.door.h / 2, C.door.z + 0.12, { shadow: true });
    if (this.doorStencil) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), this.doorStencil);
      s.position.set(0, 0.45, 0.115);
      leaf.add(s);
      const s2 = s.clone(); s2.rotation.y = Math.PI; s2.position.z = -0.115; leaf.add(s2);
    }
    for (let k = 0; k < 3; k++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(C.door.w - 0.2, 0.08, 0.06), getMat('rust')); bar.position.set(0, -1 + k * 1, 0.13); leaf.add(bar); }
    this.doors.blast = { leaves: [leaf], collider: this.phys.box(0, C.door.h / 2, C.door.z + 0.12, C.door.w / 2 + 0.1, C.door.h / 2, 0.11, 0, { paint: false }), open: 0, target: 0, kind: 'blast' };
  }

  // ---------------------------------------------------------------- el club
  _hall() {
    const h = H.h;
    // piso negro brillante (la pista de LED va arriba, ver _led) y muros de ladrillo negro
    this.deco('blackTile', 0, 0.02, (H.z0 + H.z1) / 2, H.x1 - H.x0, 0.04, H.z1 - H.z0);
    this.wallX('bunkerBrick', H.x0 - WT, H.x1 + WT, H.z0 + WT / 2 * 0, h, [[-C.door.w / 2, C.door.w / 2, 0, C.door.h]]);
    this.wallX('bunkerBrick', H.x0 - WT, H.x1 + WT, H.z1 - WT / 2, h);
    for (const x of [H.x0 - WT / 2, H.x1 + WT / 2]) this.wallZ('bunkerBrick', x, H.z0, H.z1, h);
    this.deco('black', 0, h + 0.15, (H.z0 + H.z1) / 2, H.x1 - H.x0 + 0.8, 0.3, H.z1 - H.z0 + 0.8);
    // estructura de reticulado en el techo (de donde cuelgan los cabezales) y columnas de hormigón
    for (const z of [-452, -461, -470]) this.deco('iron', 0, h - 1.1, z, H.x1 - H.x0 - 1, 0.18, 0.18);
    for (const x of [-12, 0, 12]) this.deco('iron', x, h - 1.1, (H.z0 + H.z1) / 2, 0.18, 0.18, H.z1 - H.z0 - 1);
    for (const [x, z] of [[-12, -452], [12, -452], [-12, -470], [12, -470]]) this.box('bunkerConcrete', x, h / 2, z, 0.8, h, 0.8);
    // zócalo de neón violeta alrededor
    for (const [x, z, sx, sz] of [[0, H.z1 + 0.08, H.x1 - H.x0, 0.05], [H.x0 + 0.08, (H.z0 + H.z1) / 2, 0.05, H.z1 - H.z0], [H.x1 - 0.08, (H.z0 + H.z1) / 2, 0.05, H.z1 - H.z0]]) this.deco('neonPurple', x, 0.12, z, sx, 0.05, sz);
    // luces de ambiente: bañadores rojos en los muros y violeta en el techo (laten con la música)
    const wash = [[-22, 3, -450, 0xff1030], [-22, 3, -466, 0x8020ff], [22, 3, -458, 0xff1030], [22, 3, -472, 0x8020ff], [0, 6.2, -448, 0xff2060], [-10, 6.2, -476, 0x3040ff], [10, 6.2, -476, 0xff1030]];
    for (const [x, y, z, c] of wash) this.party.push(this.light(x, y, z, c, 14, 18, { priority: 1.6 }));
    // la pista: tres luces que cambian de color con el compás
    for (const x of [-5, 0, 5]) this.party.push(Object.assign(this.light(x, 4.5, -462, 0xffffff, 16, 14, { priority: 2.2 }), { dance: true }));
    this.anchors.hallCenter = new THREE.Vector3(0, 0, -461);
  }

  _stage() {
    // escenario al fondo (norte): tarima, escalones, tres caños con sus pedestales, cortina roja y la cabina del DJ
    const z0 = H.z1, z1 = H.z1 + 7, sh = 0.9;
    this.box('blackTile', 0, sh / 2, (z0 + z1) / 2, 22, sh, z1 - z0);
    this.deco('neonRed', 0, sh + 0.01, z1 - 0.05, 22, 0.03, 0.06);
    for (let k = 0; k < 3; k++) this.box('blackTile', 0, (k + 1) * sh / 4 - sh / 8, z1 + 0.25 + (2 - k) * 0.35, 4, (k + 1) * sh / 4, 0.36);
    this.deco('velvet', 0, 4.2, z0 + 0.25, 22, 8.4, 0.12);
    for (const [i, x] of [-6.5, 0, 6.5].entries()) {
      this.cyl('blackTile', x, sh + 0.12, z0 + 3.4, 1.15, 1.25, 0.24, 28, { collide: true });
      this.deco('neonPink', x, sh + 0.25, z0 + 3.4, 2.2, 0.02, 0.02);
      this.cyl('chrome', x, (sh + H.h) / 2, z0 + 3.4, 0.045, 0.045, H.h - sh, 12);
      this.phys.cylinder(x, (sh + H.h) / 2, z0 + 3.4, (H.h - sh) / 2, 0.05, { mat: 'metal' });
      this.poles.push(new THREE.Vector3(x, sh + 0.24, z0 + 3.4));
      this.light(x, sh + 3.2, z0 + 4.4, i === 1 ? 0xff3080 : 0xa040ff, 10, 9, { priority: 1.8 });
    }
    // cabina del DJ (arriba del escenario, a la izquierda, contra el borde)
    const dx = -7.2, dz = -472.2;
    this.box('leatherBlack', dx, sh + 0.55, dz, 3.2, 1.1, 1.0);
    this.deco('neonCyan', dx, sh + 0.55, dz + 0.51, 3.2, 0.04, 0.02);
    for (const s of [-1, 1]) { this.cyl('black', dx + s * 0.8, sh + 1.12, dz, 0.2, 0.2, 0.03, 20); this.deco('darkgray', dx + s * 0.8, sh + 1.11, dz, 0.5, 0.02, 0.5); }
    this.deco('darkgray', dx, sh + 1.14, dz, 0.5, 0.05, 0.35);
    this.deco('neonGreen', dx, sh + 1.17, dz, 0.4, 0.01, 0.2);
    this.anchors.dj = new THREE.Vector3(dx, sh, dz - 0.9);
    // parlantes gigantes a los costados
    for (const x of [-10.2, 10.2]) {
      this.box('black', x, sh + 1.4, z1 - 1.2, 1.5, 2.8, 1.2);
      for (const y of [0.8, 2.0]) { this.cyl('darkgray', x, sh + y, z1 - 0.58, 0.45, 0.45, 0.04, 24, { rx: Math.PI / 2 }); this.cyl('black', x, sh + y, z1 - 0.55, 0.18, 0.18, 0.05, 16, { rx: Math.PI / 2 }); }
    }
    this.anchors.stage = new THREE.Vector3(0, sh, (z0 + z1) / 2);
  }

  _bar() {
    // barra contra el muro oeste: mostrador, estantes de botellas iluminados de abajo, banquetas
    const x = -19, za = -468, zb = -452;
    this.box('leatherBlack', x, 0.55, (za + zb) / 2, 0.8, 1.1, zb - za);
    this.deco('blackTile', x, 1.13, (za + zb) / 2, 1.0, 0.06, zb - za + 0.2);
    this.deco('neonRed', x + 0.41, 0.95, (za + zb) / 2, 0.02, 0.03, zb - za);
    for (let k = 0; k < 3; k++) {
      const y = 1.5 + k * 0.55;
      this.deco('blackWood', H.x0 + 0.25, y, (za + zb) / 2, 0.5, 0.05, zb - za);
      this.deco('neonPurple', H.x0 + 0.48, y + 0.03, (za + zb) / 2, 0.02, 0.02, zb - za);
      for (let i = 0; i < 30; i++) {
        const bz = za + 0.4 + i * ((zb - za - 0.8) / 29) + (this.rand() - 0.5) * 0.08;
        const col = ['glass', 'darkGlass', 'gold', 'green', 'red'][Math.floor(this.rand() * 5)];
        const bh = 0.24 + this.rand() * 0.14;
        this.cyl(col === 'gold' ? 'glass' : col, H.x0 + 0.24, y + 0.03 + bh / 2, bz, 0.035, 0.04, bh, 8);
      }
    }
    for (let i = 0; i < 7; i++) {
      const z = za + 1.4 + i * 2.2;
      this.cyl('chrome', x + 1.05, 0.38, z, 0.04, 0.05, 0.76, 8);
      this.cyl('leatherRed', x + 1.05, 0.8, z, 0.22, 0.2, 0.1, 16);
      this.seat(x + 1.1, 0.86, z, -Math.PI / 2, { stool: true });
    }
    this.light(x + 0.6, 2.6, (za + zb) / 2, 0xff3050, 12, 14, { priority: 1.7 });
    this.use('club_bar', [x + 1.0, 1.1, (za + zb) / 2], 7, 'Pedir un trago', { e: 'bar' });
    this.anchors.bartender = new THREE.Vector3(x - 0.75, 0, (za + zb) / 2);
  }

  _cage() {
    // jaula octogonal para las peleas (con la puerta mirando al oeste): lona roja, postes y alambrado
    const cx = 15, cz = -466, R = 3.8, h = 3.6;
    this.deco('canvasRed', cx, 0.1, cz, R * 2, 0.12, R * 2, { yaw: Math.PI / 8 });
    this.box('black', cx, 0.05, cz, R * 2 + 0.4, 0.1, R * 2 + 0.4, { yaw: Math.PI / 8 });
    const fence = HAS_DOM ? this._fenceMat() : getMat('iron');
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * R, z0 = cz + Math.sin(a0) * R, x1 = cx + Math.cos(a1) * R, z1 = cz + Math.sin(a1) * R;
      this.cyl('iron', x0, h / 2, z0, 0.06, 0.06, h, 8, { collide: true });
      const mid = (a0 + a1) / 2;
      const door = Math.abs(((mid - Math.PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.3; // el lado que mira al oeste
      const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
      if (door) { this.deco('iron', (x0 + x1) / 2, h - 0.05, (z0 + z1) / 2, 0.08, 0.1, len, { yaw }); continue; }
      const p = this.mesh(new THREE.PlaneGeometry(len, h - 0.2), fence, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, { yaw: yaw + Math.PI / 2 });
      p.material.side = THREE.DoubleSide;
      this.phys.box((x0 + x1) / 2, h / 2, (z0 + z1) / 2, 0.04, h / 2, len / 2, yaw, { paint: false, mat: 'metal' });
    }
    this.light(cx, 5.8, cz, 0xfff0d0, 18, 12, { priority: 2 });
    this.deco('lamp', cx, 5.9, cz, 1.2, 0.06, 1.2);
    this.anchors.cage = new THREE.Vector3(cx, 0.16, cz);
    this.anchors.cageR = R;
  }
  _fenceMat() {
    const cv = canvas(128, 128), g = cv.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(150,150,160,0.95)'; g.lineWidth = 3;
    for (let k = -128; k < 256; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke(); g.beginPath(); g.moveTo(k + 128, 0); g.lineTo(k, 128); g.stroke(); }
    const t = ctex(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 9);
    return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, transparent: false, metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide });
  }

  _throne() {
    // tarima con escalones, el trono con cuernos y cuatro braseros con fuego alrededor
    const T = C.throne, x = T.x, z = T.z, up = 0.6;
    this.box('keepStone', 18.6, up / 2, -449.6, 8.4, up, 9);
    for (let k = 0; k < 2; k++) this.box('keepStone', 14.2 - k * 0.35, (2 - k) * up / 6, -449.6, 0.36, (2 - k) * up / 3, 6);
    this.deco('velvet', 16.3, up + 0.01, -449.8, 3.2, 0.01, 1.6, { yaw: T.yaw + Math.PI / 2 });
    const fx = Math.sin(T.yaw), fz = Math.cos(T.yaw);
    const g = new THREE.Group();
    g.position.set(x, up, z); g.rotation.y = T.yaw;
    const M = (key) => getMat(key);
    const add = (geo, key, px, py, pz, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, M(key)); m.position.set(px, py, pz); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    add(new THREE.BoxGeometry(1.2, 0.5, 1.0), 'blackWood', 0, 0.25, 0);
    add(new THREE.BoxGeometry(1.0, 0.1, 0.85), 'velvet', 0, 0.52, 0.05);
    add(new THREE.BoxGeometry(1.25, 2.6, 0.18), 'blackWood', 0, 1.3, -0.45);
    add(new THREE.BoxGeometry(0.9, 1.9, 0.05), 'velvet', 0, 1.4, -0.34);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.16, 0.45, 0.95), 'blackWood', s * 0.62, 0.72, 0.02);
      add(new THREE.SphereGeometry(0.1, 12, 10), 'gold', s * 0.62, 0.98, 0.45);
      // cuernos retorcidos arriba del respaldo
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.9, 10, 1), M('bone'));
      horn.position.set(s * 0.52, 2.95, -0.45); horn.rotation.set(-0.2, 0, -s * 0.55);
      horn.castShadow = true; g.add(horn);
    }
    add(new THREE.TorusGeometry(0.28, 0.035, 8, 24), 'gold', 0, 2.2, -0.35);
    this.group.add(g);
    this.throneModel = g;
    // collider del trono (el asiento se usa con X; el cuerpo va por el asiento)
    this.phys.box(x - fx * 0.25, up + 1.3, z - fz * 0.25, 0.62, 1.3, 0.45, T.yaw, { paint: false });
    this.seat(x + fx * 0.08, up + 0.56, z + fz * 0.08, T.yaw, { throne: true });
    for (const [dx, dz] of [[1.8, 1.2], [-1.8, 1.2], [1.9, -1.3], [-1.9, -1.3]]) {
      // en el marco del trono: adelante (+z local) y atrás
      const bx = x + Math.cos(T.yaw) * dx + fx * dz, bz = z - Math.sin(T.yaw) * dx + fz * dz;
      this.cyl('iron', bx, up + 0.45, bz, 0.08, 0.14, 0.9, 10, { collide: true });
      this.cyl('iron', bx, up + 0.95, bz, 0.42, 0.3, 0.2, 16);
      this.deco('ember', bx, up + 1.06, bz, 0.5, 0.05, 0.5);
      this.fire(bx, up + 1.06, bz, 0.26, 0.26, 1.0, 1.25);
      this.light(bx, up + 1.8, bz, 0xff6a20, 5, 9, { flicker: true, priority: 2.4 });
    }
    this.world.embers?.add(x, up + 1, z, 50, { radius: 2.2, height: 5, strength: 0.8, speed: 0.4 });
    // la pantalla de atrás (cámara en vivo del que se sienta): la llena game/club.js
    const back = V1.set(x - fx * 1.25, up + 3.6, z - fz * 1.25);
    this.anchors.throneScreen = back.clone();
    this.anchors.throneCam = new THREE.Vector3(x + fx * 2.6, up + 1.45, z + fz * 2.6);
    this.anchors.throneLook = new THREE.Vector3(x, up + 1.2, z);
    this.box('iron', back.x - fx * 0.12, back.y, back.z - fz * 0.12, 4.8, 3.0, 0.16, { yaw: T.yaw });
  }

  _lounge() {
    // sillones de terciopelo contra el muro sur (a los dos lados de la entrada) con mesas ratonas
    for (const cx of [-15, -8.5, 8.5]) {
      const z = H.z0 - 0.75;
      this.box('velvet', cx, 0.24, z, 3.4, 0.48, 0.9);
      this.box('velvet', cx, 0.75, z + 0.35, 3.4, 0.6, 0.2);
      for (let k = -1; k <= 1; k++) this.seat(cx + k * 1.05, 0.5, z - 0.05, Math.PI);
      this.box('blackTile', cx, 0.22, z - 1.25, 1.6, 0.44, 0.8);
      this.deco('chrome', cx, 0.45, z - 1.25, 1.3, 0.01, 0.55);
    }
    this.anchors.drugTable = new THREE.Vector3(-8.5, 0.45, H.z0 - 2.0);
    this.light(-11.8, 3, H.z0 - 2, 0xff2060, 3, 8, { priority: 1.3 });
  }

  _dungeon() {
    // el calabozo (rincón noroeste, al lado del escenario): cruz de San Andrés, cadenas, jaula colgante, velas
    const x = -20.5, z = -474;
    for (const s of [-1, 1]) this.box('blackWood', x, 1.3, z, 0.22, 2.9, 0.12, { rz: s * 0.5 });
    for (const [ax, ay] of [[-0.62, 2.4], [0.62, 2.4], [-0.62, 0.3], [0.62, 0.3]]) this.cyl('iron', x + ax, ay, z + 0.08, 0.07, 0.07, 0.08, 10, { rx: Math.PI / 2 });
    for (let k = 0; k < 7; k++) {
      const cx = -23 + k * 0.5, len = 1.2 + this.rand() * 2;
      this.cyl('iron', cx, H.h - len / 2, -470 - this.rand() * 2, 0.012, 0.012, len, 4);
    }
    this.box('leatherBlack', -17.4, 0.4, -475.5, 1.6, 0.8, 0.7);
    this.seat(-17.4, 0.82, -475.2, 0);
    for (let k = 0; k < 9; k++) {
      const cx = -23.2 + this.rand() * 5, cz = -477.4 + this.rand() * 0.4, ch = 0.15 + this.rand() * 0.3;
      this.cyl('wax', cx, ch / 2, cz, 0.04, 0.045, ch, 8);
      this.world.flames?.add(cx, ch + 0.03, cz, 0.035, 0.08);
    }
    this.light(-21, 1.2, -476, 0xff6a30, 2.5, 6, { flicker: true, priority: 1.2 });
    // jaulas de gogó colgando sobre los costados de la pista (las bailarinas van adentro)
    this.gogo = [];
    for (const gx of [-10.5, 10.5]) {
      const gz = -460, gy = 2.1;
      this.cyl('blackTile', gx, gy, gz, 0.9, 0.9, 0.12, 20);
      this.cyl('blackTile', gx, gy + 2.4, gz, 0.9, 0.9, 0.08, 20);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; this.cyl('gold', gx + Math.cos(a) * 0.88, gy + 1.2, gz + Math.sin(a) * 0.88, 0.015, 0.015, 2.4, 4); }
      this.cyl('iron', gx, (gy + 2.44 + H.h) / 2, gz, 0.02, 0.02, H.h - gy - 2.44, 4);
      this.phys.cylinder(gx, gy, gz, 0.06, 0.9, { mat: 'metal' });
      this.gogo.push(new THREE.Vector3(gx, gy + 0.06, gz));
    }
  }

  _control() {
    // sala de monitores (esquina suroeste): escritorio y la pared de pantallas (las llena game/club.js)
    const x = -21, z = -448.5;
    this.box('darkgray', x, 0.4, z, 1.2, 0.8, 3.2);
    this.deco('black', x, 0.82, z, 1.3, 0.04, 3.3);
    this.deco('neonGreen', x + 0.2, 0.84, z, 0.3, 0.01, 0.8);
    this.anchors.monitors = new THREE.Vector3(H.x0 + 0.05, 2.6, z);
    this.box('black', H.x0 + 0.1, 2.6, z, 0.12, 2.6, 4.6);
    this.cyl('leatherBlack', x + 1.2, 0.3, z, 0.3, 0.3, 0.6, 12);
    this.seat(x + 1.2, 0.62, z, -Math.PI / 2);
    this.use('club_monitors', [x + 0.9, 1.0, z], 2.2, 'Mirar las cámaras', { e: 'monitors' });
  }

  // ---------------------------------------------------------------- efectos
  _led() {
    // pista de 16 x 12 m en baldosas de 50 cm que se prenden con el compás (patrones que cambian cada 4 compases)
    // y se encienden debajo de los que bailan
    const w = 16, d = 12;
    const u = { uBeat: { value: 0 }, uBar: { value: 0 }, uT: { value: 0 }, uFeet: { value: Array.from({ length: 8 }, () => new THREE.Vector3(1e4, 0, 1e4)) }, uLevel: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: u, toneMapped: false,
      vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */ `
        uniform float uBeat, uBar, uT, uLevel; uniform vec3 uFeet[8]; varying vec2 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        vec3 pal(float t){ return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }
        void main(){
          vec2 c = floor(vP / 0.5); vec2 f = fract(vP / 0.5);
          float edge = smoothstep(0.0, 0.06, f.x) * smoothstep(0.0, 0.06, f.y) * smoothstep(1.0, 0.94, f.x) * smoothstep(1.0, 0.94, f.y);
          float bi = floor(uBeat), bf = fract(uBeat), pat = mod(uBar, 4.0);
          vec2 q = c - vec2(0.0, -922.0);
          float on;
          if (pat < 1.0) on = step(0.55, h(c + bi));                                   // chispas al azar
          else if (pat < 2.0) on = step(0.5, fract((length(q) - uBeat * 2.0) * 0.25));    // ondas desde el centro
          else if (pat < 3.0) on = mod(c.x + c.y + bi, 2.0);                             // damero que salta
          else on = step(abs(q.x) + abs(q.y), mod(bi * 3.0, 20.0)) * step(mod(bi * 3.0, 20.0) - 4.0, abs(q.x) + abs(q.y)); // rombos
          float pulse = 0.35 + 0.65 * exp(-bf * 4.0);
          vec3 col = pal(uBar * 0.13 + h(c) * 0.25) * on * pulse;
          for (int i = 0; i < 8; i++) { float dd = length(vP - uFeet[i].xz); col += vec3(1.0, 0.85, 0.95) * smoothstep(0.9, 0.2, dd) * 0.9; }
          gl_FragColor = vec4(col * edge * 2.2 * uLevel + vec3(0.01), 1.0);
        }`,
    });
    const m = this.mesh(new THREE.PlaneGeometry(w, d), mat, 0, 0.045, -462, { rx: -Math.PI / 2 });
    m.receiveShadow = false;
    this.ledU = u;
  }

  _beams() {
    // ocho cabezales en el reticulado: conos de luz en la humareda que giran y cambian de color con la música
    this.heads = [];
    const geo = new THREE.CylinderGeometry(0.06, 1.3, 9, 20, 1, true);
    geo.translate(0, -4.5, 0);
    const mkMat = () => new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 0.2, 0.4) }, uA: { value: 0.22 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      vertexShader: 'varying float vL; varying vec3 vN; varying vec3 vV; void main(){ vL = -position.y / 9.0; vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uA; varying float vL; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float a = uA * rim * (1.0 - vL) * (1.0 - vL) * smoothstep(0.0, 0.05, vL); gl_FragColor = vec4(uColor * a * 2.0, a); }',
    });
    const spots = [[-12, -452], [0, -452], [12, -452], [-12, -470], [0, -470], [12, -470], [-6, -461], [6, -461]];
    spots.forEach(([x, z], i) => {
      const head = new THREE.Group();
      head.position.set(x, H.h - 1.25, z);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.3), getMat('black'));
      head.add(body);
      const beam = new THREE.Mesh(geo, mkMat());
      beam.frustumCulled = false;
      head.add(beam);
      this.group.add(head);
      this.heads.push({ head, beam, seed: i * 1.7 });
    });
  }

  _lasers() {
    // abanico de láseres verdes y rojos desde la cabina del DJ, barriendo por arriba de la gente
    this.lasers = [];
    const origin = new THREE.Vector3(-7.2, 2.25, -471.6);
    const geo = new THREE.BoxGeometry(0.018, 0.018, 1);
    geo.translate(0, 0, 0.5);
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xff2030 : 0x30ff50, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      mat.color.multiplyScalar(3);
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(origin);
      m.frustumCulled = false;
      this.group.add(m);
      this.lasers.push({ m, i });
    }
    this.laserOrigin = origin;
  }

  _mirrorBall() {
    const p = new THREE.Vector3(0, H.h - 1.6, -461);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 2), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.12, flatShading: true }));
    ball.position.copy(p);
    this.group.add(ball);
    this.cyl('iron', p.x, (p.y + H.h) / 2 + 0.3, p.z, 0.01, 0.01, H.h - p.y - 0.5, 4);
    this.ball = ball;
    // puntitos de luz que recorren muros, piso y techo
    const n = 90;
    this.dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.07, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), n);
    this.dots.frustumCulled = false;
    this.dotDirs = [];
    for (let i = 0; i < n; i++) {
      const y = -1 + (2 * i + 1) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      this.dotDirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    this.group.add(this.dots);
    this.ballPos = p;
  }

  _signs() {
    const hall = neonSign('EL BÚNKER', { px: 150, color: '#ff1a3a' });
    this.mesh(new THREE.PlaneGeometry(4.4, 1.1), hall, 0, 6.95, H.z1 + 0.36);
    const hell = neonSign('Bienvenidos al infierno', { font: 'Metal Mania', px: 84, color: '#b040ff' });
    this.mesh(new THREE.PlaneGeometry(7, 1.75), hell, 0, 3.7, H.z0 - 0.26, { yaw: Math.PI });
    const bar = neonSign('BARRA LIBRE*', { font: 'Metal Mania', px: 100, color: '#ff3080' });
    this.mesh(new THREE.PlaneGeometry(5, 1.25), bar, H.x0 + 0.2, 4.6, -460, { yaw: Math.PI / 2 });
    const fine = neonSign('*se paga con el alma', { font: 'Rubik', px: 44, color: '#ff80b0', h: 128 });
    this.mesh(new THREE.PlaneGeometry(2.6, 0.33), fine, H.x0 + 0.2, 3.9, -458.3, { yaw: Math.PI / 2 });
    const fight = neonSign('FIGHT CLUB', { font: 'Bangers', px: 130, color: '#ffd23b' });
    this.mesh(new THREE.PlaneGeometry(5, 1.25), fight, H.x1 - 0.2, 5.2, -466, { yaw: -Math.PI / 2 });
    const rules = neonSign('Regla 1: no hablar del Búnker', { font: 'Rubik', px: 52, color: '#ffe080', h: 128 });
    this.mesh(new THREE.PlaneGeometry(3.4, 0.42), rules, H.x1 - 0.2, 4.35, -466, { yaw: -Math.PI / 2 });
    const dj = neonSign('DJ', { font: 'Bangers', px: 150, color: '#20d8ff', w: 256 });
    this.mesh(new THREE.PlaneGeometry(0.9, 0.9), dj, -7.2, 1.45, -471.68);
    const pent = neonSign('⛧', { font: 'serif', px: 220, color: '#ff1030', w: 256, h: 256 });
    this.mesh(new THREE.PlaneGeometry(1.6, 1.6), pent, 0, 5.9, H.z0 - 0.26, { yaw: Math.PI });
  }

  _smoke() {
    // humo de máquina a ras del piso en la pista y el escenario
    const sm = this.world.smoke;
    if (!sm) return;
    for (const [x, z] of [[-6, -470], [6, -470], [0, -462], [-4, -458], [4, -458]]) sm.add(x, 0.3, z, 12, { radius: 3, height: 1.6, opacity: 0.1, speed: 0.05 });
  }

  // ---------------------------------------------------------------- cada cuadro
  // near: la cámara está en el complejo (o muy cerca): recién ahí se anima y se dibuja
  update(dt, t, nowMs, { level = 1, feet = [] } = {}) {
    const cam = G.camera?.position;
    const near = !!cam && cam.x > C.x0 - 40 && cam.x < C.x1 + 40 && cam.z > C.z0 - 40 && cam.z < C.z1 + 40;
    if (near !== this.visible) {
      this.visible = near;
      this.group.visible = near;
      for (const l of this.lights) l.visible = near;
    }
    if (!near) return;
    const B = clubBeat(nowMs);
    const kick = Math.exp(-B.f * 5) * level;
    for (const a of this.anim) a(t, dt, B);
    // luces que laten: los bañadores respiran con el compás, las de la pista cambian de color en cada negra
    for (let i = 0; i < this.party.length; i++) {
      const l = this.party[i];
      if (l.dance) {
        COL.setHSL(((B.i * 0.13 + i * 0.33) % 1), 1, 0.55);
        l.color.copy(COL);
        l.intensity = l.base * (0.25 + 0.95 * kick);
      } else l.intensity = l.base * (0.55 + 0.45 * Math.sin(B.beat * Math.PI * 0.5 + i));
    }
    if (this.ledU) {
      this.ledU.uBeat.value = B.beat % 1024; this.ledU.uBar.value = B.bar % 256; // la GPU no se banca números del tamaño de la hora this.ledU.uT.value = t; this.ledU.uLevel.value = 0.25 + 0.75 * level;
      for (let i = 0; i < 8; i++) { const f = feet[i]; if (f) this.ledU.uFeet.value[i].set(f.x, 0, f.z); else this.ledU.uFeet.value[i].set(1e4, 0, 1e4); }
    }
    if (this.heads) {
      for (const h of this.heads) {
        const s = h.seed, tt = B.beat * 0.25;
        h.head.rotation.set(Math.sin(tt * 1.3 + s) * 0.75, tt * 0.6 + s, Math.cos(tt * 0.9 + s * 2) * 0.6);
        COL.setHSL(((B.bar * 0.21 + s * 0.1) % 1), 1, 0.5);
        h.beam.material.uniforms.uColor.value.copy(COL);
        h.beam.material.uniforms.uA.value = (0.1 + 0.2 * kick) * (0.4 + 0.6 * level);
      }
    }
    if (this.lasers) {
      const on = level > 0.3 && Math.floor(B.bar / 2) % 2 === 0; // los láseres van de a dos compases
      for (const L of this.lasers) {
        L.m.visible = on;
        if (!on) continue;
        const k = L.i / (this.lasers.length - 1) - 0.5;
        const yaw = k * 1.5 + Math.sin(B.beat * 0.5) * 0.45, pitch = 0.012 + Math.sin(B.beat * 0.25 + k * 3) * 0.05;
        L.m.rotation.set(-pitch, yaw, 0, 'YXZ');
        L.m.scale.set(1, 1, 26); // terminan antes del muro sur
        L.m.material.opacity = 0.4 + 0.5 * kick;
      }
    }
    if (this.ball) {
      this.ball.rotation.y = t * 0.35;
      const M = this._m4 || (this._m4 = new THREE.Matrix4());
      const q = (this._q || (this._q = new THREE.Quaternion())).setFromAxisAngle(V2.set(0, 1, 0), t * 0.35);
      const QN = this._qn || (this._qn = [new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Quaternion()]);
      const SC = this._sc || (this._sc = new THREE.Vector3());
      const p = this.ballPos;
      for (let i = 0; i < this.dotDirs.length; i++) {
        const d = V1.copy(this.dotDirs[i]).applyQuaternion(q);
        // hasta qué pared/piso/techo llega (caja del club)
        let tt = 1e9, n = 0;
        const tx = d.x > 0 ? (H.x1 - 0.02 - p.x) / d.x : (H.x0 + 0.02 - p.x) / d.x;
        const ty = d.y > 0 ? (H.h - 0.02 - p.y) / d.y : (0.06 - p.y) / d.y;
        const tz = d.z > 0 ? (H.z0 - 0.02 - p.z) / d.z : (H.z1 + 0.02 - p.z) / d.z;
        if (tx < tt) { tt = tx; n = 0; }
        if (ty < tt) { tt = ty; n = 1; }
        if (tz < tt) { tt = tz; n = 2; }
        const hp = V2.copy(p).addScaledVector(d, tt);
        M.compose(hp, QN[n], SC.setScalar(0.6 + 0.8 * (tt / 20)));
        this.dots.setMatrixAt(i, M);
      }
      this.dots.instanceMatrix.needsUpdate = true;
      this.dots.material.opacity = 0.35 + 0.45 * level;
    }
    // puertas: se deslizan hacia su objetivo
    for (const d of Object.values(this.doors)) {
      d.open += clamp(d.target - d.open, -dt * (d.kind === 'blast' ? 0.9 : 1.6), dt * (d.kind === 'blast' ? 0.9 : 1.6));
      if (d.kind === 'lift') { d.leaves[0].position.x = -0.3 - d.open * 0.6; d.leaves[1].position.x = 0.3 + d.open * 0.6; }
      else d.leaves[0].position.x = d.open * (C.door.w + 0.3);
    }
  }

  indoorAt(x, y, z) {
    return this.roomOf(x, y, z) ? { indoor: 1, roofed: 1 } : null;
  }
}
