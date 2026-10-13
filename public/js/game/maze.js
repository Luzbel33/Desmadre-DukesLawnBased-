// El laberinto del terror del Búnker (lo arma world/club-wings.js _maze): los sustos del camino y el cofre del fondo.
// - Sustos: en las celdas marcadas (anchors.mazeScares) al pasar cerca salta uno: el espectro que se te tira encima,
//   el esqueleto que cae del techo con su cadena, el apagón con dos ojos rojos al fondo, los golpes en la pared de
//   atrás o la cara que aparece de golpe. Cada uno vuelve a estar listo al rato; entre susto y susto hay un respiro.
//   Son de cada uno (los demás oyen los gritos).
// - El cofre: X lo abre (la tapa, un brillo dorado y monedas) y te da una reliquia al azar (shared/relics.js). Se
//   vuelve a llenar solo; la tapa la ven abrirse todos.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { INTERACT } from '../shared/mapdata.js';
import { whenAsset, assetModel } from './assets.js';
import { Wraith } from './haunt.js';
import { RELICS } from '../shared/relics.js';

const HAS_DOM = typeof document !== 'undefined';
const ROOM = 1402; // WING_ROOM.maze
const KINDS = ['wraith', 'drop', 'dark', 'slam', 'face', 'drop', 'wraith', 'dark'];
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), BOX = new THREE.Box3();
const REFILL = 45; // segundos hasta que el cofre se vuelve a llenar (para cada uno)

// la cara del susto: pálida, cuencas negras, boca abierta que chorrea (dibujada una vez)
function faceTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 320;
  const g = cv.getContext('2d');
  // piel gris y enferma, que se pierde en lo negro hacia los bordes
  const gr = g.createRadialGradient(128, 140, 10, 128, 160, 150);
  gr.addColorStop(0, '#cfc6b4'); gr.addColorStop(0.5, '#8a8274'); gr.addColorStop(0.8, 'rgba(30,24,22,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(128, 160, 100, 145, 0, 0, Math.PI * 2); g.fill();
  // pómulos hundidos y sienes
  for (const [x, y, r] of [[78, 190, 34], [178, 190, 34], [60, 110, 26], [196, 110, 26]]) {
    const sh = g.createRadialGradient(x, y, 2, x, y, r); sh.addColorStop(0, 'rgba(20,14,12,0.6)'); sh.addColorStop(1, 'rgba(20,14,12,0)');
    g.fillStyle = sh; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // cuencas desparejas, negras, con lo negro chorreando para abajo
  g.fillStyle = '#000';
  g.beginPath(); g.ellipse(86, 122, 24, 32, 0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(172, 118, 27, 30, -0.2, 0, Math.PI * 2); g.fill();
  for (const [x, len] of [[80, 70], [92, 48], [166, 84], [178, 58], [172, 30]]) { g.fillRect(x, 130, 4 + (len % 3), len); g.beginPath(); g.arc(x + 2, 130 + len, 3, 0, Math.PI * 2); g.fill(); }
  // pupilas: dos puntitos que brillan
  g.fillStyle = '#ffd9b0'; g.beginPath(); g.arc(88, 126, 2.5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(170, 122, 2.5, 0, Math.PI * 2); g.fill();
  // la boca: un tajo enorme, torcido, con dientes
  g.fillStyle = '#000'; g.beginPath(); g.moveTo(70, 222); g.quadraticCurveTo(128, 205, 190, 218); g.quadraticCurveTo(140, 318, 78, 262); g.closePath(); g.fill();
  g.fillStyle = '#d8ccb0';
  for (let k = 0; k < 9; k++) { const x = 80 + k * 12, y = 214 + Math.abs(k - 4) * 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 9, y); g.lineTo(x + 4, y + 14 + (k % 2) * 6); g.fill(); }
  for (let k = 0; k < 6; k++) { const x = 92 + k * 13, y = 270 - Math.abs(k - 2.5) * 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 9, y); g.lineTo(x + 4, y - 12); g.fill(); }
  g.fillStyle = 'rgba(110,0,0,0.85)'; for (let k = 0; k < 5; k++) { const x = 96 + k * 17; g.fillRect(x, 268, 3, 20 + (k * 23) % 30); }
  // grietas y grano
  g.strokeStyle = 'rgba(40,20,18,0.55)'; g.lineWidth = 1.5;
  for (let k = 0; k < 18; k++) { let x = 50 + (k * 61) % 160, y = 50 + (k * 37) % 200; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += ((k + j) % 3 - 1) * 7; y += 6 + (j % 2) * 4; g.lineTo(x, y); } g.stroke(); }
  const img = g.getImageData(0, 0, 256, 320), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 34; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class MazeGame {
  constructor(game) {
    this.g = game;
    this.club = game.club;
    this.A = this.club.anchors;
    this.group = this.club.wings?.wings.get('maze')?.group;
    this.cool = new Map(); // ancla -> segundos de juego en que vuelve a estar lista
    this.lastScare = -99;
    this.busy = 0; // un susto a la vez
    this.chestOpen = 0; this.chestTarget = 0; this.chestUntil = 0;
    this.refillAt = 0;
    this.anims = [];
    if (!this.group || !this.A.mazeChest) return;
    this._build();
  }

  _build() {
    const C = this.A.mazeChest, wh = 3.2;
    // el cofre en el medio de la sala del fondo, de frente a la entrada (norte)
    whenAsset('c_chest', () => {
      const m = assetModel('c_chest');
      if (!m) return;
      BOX.setFromObject(m); const sz = BOX.getSize(V1);
      const k = 1.1 / Math.max(0.2, Math.max(sz.x, sz.z));
      m.scale.setScalar(k);
      BOX.setFromObject(m);
      m.position.set(C.x, -BOX.min.y + 0.02, C.z);
      m.rotation.y = Math.PI;
      m.traverse((o) => { if (/lid/i.test(o.name)) this.lid = o; });
      this.group.add(m);
      this.chest = m;
      G.phys?.box(C.x, 0.3, C.z, 0.55, 0.3, 0.35, 0, { mat: 'wood' });
    });
    this.chestLight = this.club.lights.reduce((b, l) => (l.room === ROOM && (!b || l.position.distanceToSquared(C) < b.position.distanceToSquared(C)) ? l : b), null);
    this.use = { id: 'maze_chest', k: 'club', e: 'mazeChest', p: [C.x, 1.0, C.z], r: 1.8, label: 'Abrir el cofre' };
    INTERACT.push(this.use);
    // los que asustan (escondidos hasta que toca)
    this.wraith = new Wraith(this.group);
    whenAsset('c_skel_hang', () => {
      const m = assetModel('c_skel_hang');
      if (!m) return;
      BOX.setFromObject(m);
      const inner = new THREE.Group();
      m.position.y = -BOX.max.y; // cuelga del punto más alto (el gancho)
      inner.add(m);
      this.skelModel = m; this.skelTop = BOX.max.y;
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.8, roughness: 0.5 }));
      chain.name = 'chain';
      inner.add(chain);
      inner.visible = false;
      this.group.add(inner);
      this.skel = inner; this.skelChain = chain; this.skelLen = BOX.max.y - BOX.min.y;
    });
    if (HAS_DOM) {
      this.face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78), new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      this.face.renderOrder = 20; this.face.visible = false;
      this.group.add(this.face);
      const em = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.2), transparent: true, opacity: 0, toneMapped: false });
      this.eyes = new THREE.Group();
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), em); e.position.x = s * 0.09; this.eyes.add(e); }
      this.eyes.visible = false; this.eyesMat = em;
      this.group.add(this.eyes);
    }
    this.wh = wh;
  }

  // ---------------------------------------------------------------- el cofre
  useChest() {
    const L = this.g.getLocal();
    if (!L) return;
    if (G.time < this.refillAt) {
      this.g.notify(`🕸️ El cofre está vacío. Se vuelve a llenar en ${Math.ceil(this.refillAt - G.time)} s.`);
      G.sfx?.trigger('creak', this.A.mazeChest, 0.6, { full: 2, max: 14 });
      return;
    }
    this.refillAt = G.time + REFILL;
    this._openLid();
    this.g._send({ e: 'mazeChest' });
    const keys = Object.keys(RELICS), have = L.hands.r.item;
    const pool = keys.filter((k) => k !== have);
    const item = pool[Math.floor(Math.random() * pool.length)];
    setTimeout(() => {
      const P = this.g.getLocal();
      if (!P) return;
      P.giveItem(item);
      this.g.onItems?.();
      const R = RELICS[item];
      this.g.big(`${R.icon} ${R.label.toUpperCase()}`, R.desc, 2600);
      G.sfx?.trigger('coins', this.A.mazeChest, 0.8, { full: 3, max: 18 });
    }, 650);
  }
  _openLid() {
    this.chestTarget = 1; this.chestUntil = G.time + 6;
    const C = this.A.mazeChest;
    G.sfx?.trigger('door-creak', C, 0.7, { full: 2, max: 16, rate: 1.4 });
    setTimeout(() => { G.fx?.sparks(V1.set(C.x, 0.9, C.z), V2.set(0, 1, 0), 26); }, 350);
    if (this.chestLight) this.glow = 1;
  }
  remote(m) { if (m.e === 'mazeChest') this._openLid(); }

  // ---------------------------------------------------------------- sustos
  _scare(k) { G.haunt?.scare?.(k); this.g.shake?.(0.55 * k); }
  _start(i, anchor, L) {
    const kind = KINDS[i % KINDS.length];
    const cam = G.camera;
    const fwd = cam.getWorldDirection(V1).setY(0).normalize().clone();
    const yaw = Math.atan2(fwd.x, fwd.z);
    this.busy = 1;
    const end = (s) => setTimeout(() => { this.busy = 0; }, s * 1000);
    if (kind === 'wraith') {
      const from = L.pos.clone().addScaledVector(fwd, 6);
      from.y = 0;
      this.wraith.show(from, yaw + Math.PI, 'stand', 0.9);
      G.sfx?.trigger('ghost-breath', from, 0.6, { full: 2, max: 14 });
      setTimeout(() => { this.wraith.rush(L.pos, 13); G.sfx?.trigger('ghost-scream', null, 0.9); setTimeout(() => this._scare(1.1), 280); }, 450);
      end(3);
    } else if (kind === 'drop' && this.skel) {
      const at = L.pos.clone().addScaledVector(fwd, 1.5);
      // el gancho queda en el techo y se estira la cadena: la punta de arriba del esqueleto baja hasta "low" (los pies
      // quedan a la altura de las rodillas), rebota y después se lo llevan para arriba
      const top = this.wh - 0.02, low = Math.min(top - 0.4, this.skelLen + 0.45);
      this.skel.position.set(at.x, top, at.z); this.skel.rotation.y = yaw + Math.PI; this.skel.visible = true;
      G.sfx?.trigger('creak', at, 0.8, { full: 2, max: 14, rate: 1.5 });
      const t0 = G.time;
      let clank = false;
      this.anims.push((t) => {
        const k = t - t0;
        let y;
        if (k < 0.22) y = top - (top - low) * (k / 0.22) ** 2;
        else if (k < 2.4) y = low + Math.sin((k - 0.22) * 14) * Math.exp(-(k - 0.22) * 3.2) * 0.22;
        else y = low + (top - low) * Math.min(1, (k - 2.4) / 1.2) ** 2;
        const len = Math.max(0.01, top - y);
        this.skelChain.scale.y = len; this.skelChain.position.y = -len / 2;
        this.skelModel.position.y = -len - this.skelTop;
        this.skel.rotation.z = Math.sin(k * 5) * 0.12 * Math.exp(-k);
        if (k > 0.2 && !clank) { clank = true; G.sfx?.trigger('hit', at, 0.9); G.sfx?.trigger('stinger', null, 0.85); this._scare(1); }
        if (k > 3.7) { this.skel.visible = false; return true; }
        return false;
      });
      end(4);
    } else if (kind === 'dark' && this.eyes) {
      const lights = this.club.lights.filter((l) => l.room === ROOM);
      for (const l of lights) l.visible = false;
      G.sfx?.trigger('whisper', null, 0.55);
      G.sfx?.trigger('heartbeat', null, 0.6);
      const at = L.pos.clone().addScaledVector(fwd, 3.6); at.y = 1.65;
      setTimeout(() => {
        this.eyes.position.copy(at); this.eyes.lookAt(cam.position); this.eyes.visible = true;
        const t0 = G.time;
        this.anims.push((t) => { const k = t - t0; this.eyesMat.opacity = k < 0.15 ? k / 0.15 : k < 0.9 ? 1 : Math.max(0, 1 - (k - 0.9) / 0.1); if (k > 1) { this.eyes.visible = false; return true; } return false; });
        setTimeout(() => { G.sfx?.trigger('stinger', null, 0.8); this._scare(0.8); }, 650);
      }, 1500);
      setTimeout(() => { for (const l of lights) l.visible = true; G.sfx?.trigger('ghost-breath', null, 0.35); }, 3600);
      end(4.5);
    } else if (kind === 'slam') {
      const at = L.pos.clone().addScaledVector(fwd, -1.8); at.y = 1.4;
      G.sfx?.trigger('door-slam', at, 1, { full: 2, max: 18 });
      this._scare(0.6);
      G.fx?.puff(at, fwd.clone().multiplyScalar(-1), 1.4, 0x6a625a);
      [380, 640, 860].forEach((ms) => setTimeout(() => { G.sfx?.trigger('knock', at, 0.9, { full: 2, max: 16 }); this.g.shake?.(0.2); }, ms));
      end(2.5);
    } else if (this.face) { // 'face' (o un susto que no tenía el modelo cargado)
      const t0 = G.time;
      this.face.visible = true;
      G.sfx?.trigger('stinger', null, 1);
      G.sfx?.trigger('ghost-scream', null, 0.8);
      this._scare(1.25);
      this.anims.push((t) => {
        const k = t - t0;
        const c = G.camera, f = c.getWorldDirection(V2);
        this.face.position.copy(c.position).addScaledVector(f, 0.62 - Math.min(0.2, k * 0.8));
        this.face.quaternion.copy(c.quaternion);
        this.face.scale.setScalar(0.9 + Math.min(0.35, k * 1.6) + Math.sin(k * 60) * 0.02);
        if (k > 0.34) { this.face.visible = false; return true; }
        return false;
      });
      end(2);
    } else this.busy = 0;
  }
  update(dt) {
    if (!this.group) return;
    const t = G.time;
    // la tapa del cofre (y el brillo dorado al abrirse)
    if (this.chestTarget && t > this.chestUntil) this.chestTarget = 0;
    this.chestOpen += Math.max(-dt * 1.2, Math.min(dt * 2.4, this.chestTarget - this.chestOpen));
    if (this.lid) this.lid.rotation.x = -this.chestOpen * 1.25;
    if (this.chestLight && this.glow !== undefined) {
      this.chestLight.base0 ??= this.chestLight.base;
      this.glow = Math.max(0, this.glow - dt * 0.6);
      this.chestLight.intensity = this.chestLight.base = this.chestLight.base0 * (1 + this.glow * 2.5);
    }
    if (this.use) this.use.label = t < this.refillAt ? 'El cofre está vacío (se llena solo)' : 'Abrir el cofre';
    for (let i = this.anims.length - 1; i >= 0; i--) if (this.anims[i](t)) this.anims.splice(i, 1);
    if (this.wraith?.visible) this.wraith.update(dt, t);
    // ¿pasó alguien por una celda del susto?
    const L = this.g.getLocal();
    const S = this.A.mazeScares;
    if (!L || L.dead || this.busy || !S || t - this.lastScare < 8) return;
    if (this.club.roomOf(L.pos.x, L.pos.y, L.pos.z) !== ROOM) return;
    for (let i = 0; i < S.length; i++) {
      const a = S[i];
      if ((this.cool.get(i) || 0) > t) continue;
      if (Math.hypot(L.pos.x - a.x, L.pos.z - a.z) > 2.1) continue;
      this.cool.set(i, t + 90);
      this.lastScare = t;
      this._start(i, a, L);
      break;
    }
  }
}
