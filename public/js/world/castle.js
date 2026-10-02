// Castillo del Terror (reemplaza a la mansión): murallas con torres, portón, patio de armas con el fogón
// techado (zona tranquila, con pantalla), y un torreón elevado que es la casa del terror: salón con balcón,
// comedor, cocina, biblioteca con pasadizo secreto, sala de los retratos, cuarto secreto y la cripta abajo,
// que sale al cementerio. Afuera, el aljibe reemplaza a la fuente.
// Todo lo quieto se fusiona por material (Builder). Además se arma:
// - un mapa de alturas de techos para que la lluvia no pase por adentro (storm.setRainMask)
// - volúmenes "adentro" (cuartos cerrados) y "bajo techo" (el galpón) para el audio y la luz
// - luces virtuales (velas, antorchas, el fogón) que reparte el LightPool
// - anclas para los sustos e interacciones (haunt.js)
import * as THREE from 'three';
import { Builder, getMat } from './builder.js';
import { PROXY_LAYER } from './lightpool.js';
import { rope, wellWater } from './rope.js';
import { groundCastle } from './castle-ground.js';
import { rng } from '../core/G.js';
import { CASTLE, STORM, MOON } from '../shared/mapdata.js';

const KX0 = CASTLE.keep.x0, KX1 = CASTLE.keep.x1, KZ0 = CASTLE.keep.z0, KZ1 = CASTLE.keep.z1;
const KT = 1.2; // muros del torreón
const F0 = CASTLE.keep.floor; // piso del torreón (3.5)
const F1 = 10; // cielorraso de los cuartos laterales
const KTOP = CASTLE.keep.top; // 16.5
const IX0 = KX0 + KT, IX1 = KX1 - KT, IZ0 = KZ0 + KT, IZ1 = KZ1 - KT; // caras interiores
const WT = CASTLE.wallT, WH = CASTLE.wallH;
const CX0 = CASTLE.x0, CX1 = CASTLE.x1, CZ0 = CASTLE.z0, CZ1 = CASTLE.z1;
const PT = 0.6; // tabiques
const FIRE = CASTLE.fire;

const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const M4 = new THREE.Matrix4();
const V = new THREE.Vector3();

// ---------------------------------------------------------------- mapa de techos (para la lluvia)
class RoofMask {
  constructor(x0, z0, x1, z1, res = 0.5) {
    this.x0 = x0; this.z0 = z0; this.x1 = x1; this.z1 = z1;
    this.w = Math.round((x1 - x0) / res); this.h = Math.round((z1 - z0) / res);
    this.res = res;
    this.data = new Uint8Array(this.w * this.h);
  }
  rect(ax, az, bx, bz, top) {
    if (top <= 0.3) return;
    const v = Math.min(255, Math.round(top * 4));
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - this.x0) / this.res)), i1 = Math.min(this.w - 1, Math.floor((Math.max(ax, bx) - this.x0) / this.res));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - this.z0) / this.res)), j1 = Math.min(this.h - 1, Math.floor((Math.max(az, bz) - this.z0) / this.res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * this.w + i; if (this.data[k] < v) this.data[k] = v; }
  }
  circle(cx, cz, r, top) {
    const v = Math.min(255, Math.round(top * 4));
    for (let z = cz - r; z <= cz + r; z += this.res) {
      const hw = Math.sqrt(Math.max(0, r * r - (z - cz) ** 2));
      const j = Math.floor((z - this.z0) / this.res);
      if (j < 0 || j >= this.h) continue;
      const i0 = Math.max(0, Math.floor((cx - hw - this.x0) / this.res)), i1 = Math.min(this.w - 1, Math.floor((cx + hw - this.x0) / this.res));
      for (let i = i0; i <= i1; i++) { const k = j * this.w + i; if (this.data[k] < v) this.data[k] = v; }
    }
  }
}

// ---------------------------------------------------------------- arco ojival (relleno de las esquinas sobre un vano)
// Devuelve la forma de "rectángulo menos arco": ancho `span`, arranque del arco en `spring`, clave en `apex`, tope `top`
function pointedFill(span, spring, apex, top) {
  const h = span / 2;
  // radio del arco que pasa por el arranque (±h, spring) y la clave (0, apex) con centros sobre la línea de arranque
  const a = apex - spring;
  const r = (h * h + a * a) / (2 * h);
  const c = h - r; // centro del arco derecho en x = c (a la izquierda del eje si r > h)
  const s = new THREE.Shape();
  s.moveTo(-h, spring);
  s.lineTo(-h, top);
  s.lineTo(h, top);
  s.lineTo(h, spring);
  const th = Math.acos(clamp01((0 - c) / r));
  s.absarc(c, spring, r, 0, th, false); // de (h, spring) a la clave
  s.absarc(-c, spring, r, Math.PI - th, Math.PI, false); // de la clave a (-h, spring)
  return s;
}
function clamp01(v) { return Math.max(-1, Math.min(1, v)); }
// puntos de un arco ojival de izquierda a derecha (luz `span`, arranque `spring`, clave `apex`)
function archPoints(span, spring, apex, n = 12) {
  const h = span / 2, a = apex - spring, r = (h * h + a * a) / (2 * h), c = h - r;
  const th = Math.acos(clamp01(-c / r));
  const pts = [];
  // arco izquierdo: centro (-c, spring), de ángulo PI hasta PI - th
  for (let i = 0; i <= n; i++) { const ang = Math.PI - (i / n) * th; pts.push(new THREE.Vector2(-c + r * Math.cos(ang), spring + r * Math.sin(ang))); }
  // arco derecho: centro (c, spring), de th hasta 0
  for (let i = 1; i <= n; i++) { const ang = th - (i / n) * th; pts.push(new THREE.Vector2(c + r * Math.cos(ang), spring + r * Math.sin(ang))); }
  return pts;
}
function archRing(outer, inner) {
  const s = new THREE.Shape();
  const o = archPoints(...outer), i = archPoints(...inner).reverse();
  s.moveTo(o[0].x, o[0].y);
  for (const p of o.slice(1)) s.lineTo(p.x, p.y);
  for (const p of i) s.lineTo(p.x, p.y);
  s.lineTo(o[0].x, o[0].y);
  return s;
}

// UV en metros para geometrías extruidas/lathe (para que las texturas tengan escala real)
function scaleUV(g, su, sv = su) {
  const uv = g.attributes.uv;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

export class Castle {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;
    this.phys = world.phys;
    this.b = new Builder(world.phys);
    this.bp = new Builder(world.phys); // galpón del fogón: sus mallas proyectan la sombra del fuego (capa 1)
    this.cur = this.b;
    this.mask = new RoofMask(STORM.x0 - 2, STORM.z0 + 4, STORM.x1 + 2, STORM.z1 + 2);
    this.rooms = []; // { x0, y0, z0, x1, y1, z1 } cuartos cerrados
    this.roofs = []; // { x0, y0, z0, x1, y1, z1 } techos abiertos (galpón)
    this.lights = []; // luces virtuales
    this.flames = []; // índices de llamas (Flames)
    this.anchors = {}; // puntos con nombre para los sustos (haunt.js)
    this.doors = {}; // puertas que se mueven
    this.seats = [];
    this.interact = []; // puntos de "X" propios del castillo
    this.windowsLit = []; // materiales de ventanas que el relámpago enciende
    this.shafts = []; // haces de luna por ventanas y puertas (fx/volume.js)
    this.rand = rng(1313);
  }

  // ---------------------------------------------------------------- primitivas con registro en la máscara de lluvia
  box(key, cx, cy, cz, sx, sy, sz, opts = {}) {
    this.cur.box(key, cx, cy, cz, sx, sy, sz, opts);
    if (opts.mask === false) return;
    const top = cy + sy / 2;
    if (top < 0.35) return;
    const yaw = opts.yaw || 0;
    if (!yaw && !opts.rx && !opts.rz) { this.mask.rect(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, top); return; }
    // caja girada: caja envolvente de las 8 esquinas
    E.set(opts.rx || 0, yaw, opts.rz || 0, 'YXZ');
    Q.setFromEuler(E);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, t = -1e9;
    for (const a of [-1, 1]) for (const b2 of [-1, 1]) for (const c of [-1, 1]) {
      V.set(a * sx / 2, b2 * sy / 2, c * sz / 2).applyQuaternion(Q);
      x0 = Math.min(x0, cx + V.x); x1 = Math.max(x1, cx + V.x); z0 = Math.min(z0, cz + V.z); z1 = Math.max(z1, cz + V.z); t = Math.max(t, cy + V.y);
    }
    this.mask.rect(x0, z0, x1, z1, t);
  }
  deco(key, cx, cy, cz, sx, sy, sz, opts = {}) { this.box(key, cx, cy, cz, sx, sy, sz, { ...opts, collide: false }); }
  cyl(key, x, y, z, r0, r1, h, seg = 16, opts = {}) {
    const circ = 2 * Math.PI * Math.max(r0, r1);
    const t = getMat(key).userData.tileU || 1;
    this.cur.cylinder(key, x, y, z, r0, r1, h, seg, { uvScale: [circ / t, h / t], ...opts });
    if (opts.mask !== false && y + h / 2 > 0.35) this.mask.circle(x, z, Math.max(r0, r1), y + h / 2);
  }
  // muro recto con huecos absolutos: holes [{ a, b, y0, y1 }] medidos sobre el eje del muro (x o z según vaya)
  wall(key, x0, z0, x1, z1, h, t, holes = [], opts = {}) {
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 'x' : 'z';
    const s0 = along === 'x' ? x0 : z0, dir = Math.sign((along === 'x' ? x1 - x0 : z1 - z0)) || 1;
    const rel = holes.map((hh) => {
      const a = (hh.a - s0) * dir, b2 = (hh.b - s0) * dir;
      return { from: Math.min(a, b2), to: Math.max(a, b2), bottom: hh.y0 - (opts.y0 || 0), top: hh.y1 - (opts.y0 || 0) };
    });
    this.cur.wall(key, x0, z0, x1, z1, h, t, rel, opts);
    if (opts.mask !== false) {
      const hx = along === 'x' ? 0 : t / 2, hz = along === 'x' ? t / 2 : 0;
      this.mask.rect(Math.min(x0, x1) - hx, Math.min(z0, z1) - hz, Math.max(x0, x1) + hx, Math.max(z0, z1) + hz, (opts.y0 || 0) + h);
    }
  }
  geo(key, g, maskRect = null) {
    this.cur.geo(key, g);
    if (maskRect) this.mask.rect(...maskRect);
  }
  // id: edificio * 100 + cuarto (el pool de luces trata distinto al cuarto de al lado que a otro edificio)
  room(x0, y0, z0, x1, y1, z1, id = 100 + this.rooms.length + 1) { this.rooms.push({ x0, y0, z0, x1, y1, z1, id }); }

  // luz virtual (la reparte el LightPool): { position, color, intensity, distance, decay, priority }
  light(x, y, z, color, intensity, distance, { flicker = false, priority = 1, decay = 1.7, shadow = false } = {}) {
    const l = { position: new THREE.Vector3(x, y, z), color: new THREE.Color(color), intensity, distance, decay, visible: true, priority, base: intensity, shadow };
    l.room = this.roomOf(x, y, z);
    this.world.pool?.add(l);
    if (flicker) this.world.flicker.push({ light: l, base: intensity, seed: this.rand() * 100, fire: true });
    this.lights.push(l);
    return l;
  }
  flame(x, y, z, w, h, opts = {}) {
    const i = this.world.flames ? this.world.flames.add(x, y, z, w, h, opts) : -1;
    this.flames.push(i);
    return i;
  }
  // fuego de verdad (volumétrico): base en (x, y, z), medio ancho hx/hz y alto h. En calidad baja, llamas planas
  fire3d(x, y, z, hx, hz, h, { intensity = 1, wind = 0, speed = 1 } = {}) {
    const w = this.world;
    const fire = w.fires ? w.fires.add(x, y, z, hx, hz, h, { intensity, wind, speed }) : -1;
    const n = Math.max(1, Math.round((hx + hz) / 0.35));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const index = this.flame(x + Math.cos(a) * hx * 0.4 * (n > 1 ? 1 : 0), y, z + Math.sin(a) * hz * 0.4 * (n > 1 ? 1 : 0), Math.min(hx, hz) * 1.6, h * (k === 0 ? 1 : 0.8), { wind, intensity: w.fires ? 0 : intensity });
      (w.fireFallback ||= []).push({ index, intensity });
    }
    return fire;
  }

  // ================================================================ armado
  build() {
    // torreón por cuartos: salón, retratos, comedor, cocina, biblioteca, cuarto secreto; y la cripta abajo
    this.room(-8, F0 - 0.2, -116.8, 8, KTOP, IZ1, 101);
    this.room(-8, F0 - 0.2, IZ0, 8, KTOP, -116.8, 102);
    this.room(IX0, F0 - 0.2, -115, -8, KTOP, IZ1, 103);
    this.room(IX0, F0 - 0.2, IZ0, -8, KTOP, -115, 104);
    this.room(8, F0 - 0.2, -115, IX1, KTOP, IZ1, 105);
    this.room(8, F0 - 0.2, IZ0, IX1, KTOP, -115, 106);
    this.room(8.3, -0.5, IZ0, IX1, F0 - 0.25, IZ1, 201);
    this._grounds();
    groundCastle();
    this._curtain();
    this._gatehouse();
    this._keep();
    this._keepInterior();
    this._crypt();
    this._keepStairs();
    this._courtyard();
    this._pavilion();
    this._yards();
    this._well();
    this._torches();
    this._shadowProxies();
    const meshes = this.b.finish(this.scene);
    for (const m of meshes) m.userData.castle = true;
    for (const m of this.bp.finish(this.scene)) { m.userData.castle = true; m.layers.enable(1); meshes.push(m); }
    this.meshes = meshes;
    return this;
  }

  // ---------------------------------------------------------------- pisos
  _grounds() {
    // patio de armas: adoquines con musgo, mojados
    this.deco('cobble', 0, 0.02, (CZ1 - WT + KZ1) / 2, CX1 * 2 - WT * 2, 0.04, (CZ1 - WT) - KZ1, { noShadow: true, mask: false });
    // franja de atrás del torreón y pasaje del portón
    this.deco('cobble', 0, 0.02, (KZ0 + CZ0 + WT) / 2, (KX1 - KX0) + 0.6, 0.04, KZ0 - (CZ0 + WT), { noShadow: true, mask: false });
    this.deco('cobble', 0, 0.03, -79.55, 6.4, 0.06, 10.3, { noShadow: true, mask: false });
    // huerta (oeste) y cementerio (este): barro con hojas
    const yz = (KZ1 + CZ0 + WT) / 2, yd = KZ1 - (CZ0 + WT);
    this.deco('mud', (CX0 + WT + KX0) / 2, 0.018, yz, KX0 - (CX0 + WT), 0.036, yd, { noShadow: true, mask: false });
    this.deco('mud', (CX1 - WT + KX1) / 2, 0.018, yz, (CX1 - WT) - KX1, 0.036, yd, { noShadow: true, mask: false });
    // camino de lajas desde la explanada hasta el portón
    this.deco('flagstone', 0, 0.035, -66.35, 5.2, 0.07, 16.3, { noShadow: true, mask: false });
  }

  // Patio: eje de llegada legible y dos bancos de espera junto al torreón.
  // Sólo materiales ya cargados y geometría fusionada; el centro queda libre.
  _courtyard() {
    const floor = { noShadow: true, mask: false };
    // Lajas sobre el adoquín (3 cm): llegan al primer escalón, sin nuevo collider.
    this.deco('flagstone', 0, 0.055, -89.25, 5.2, 0.03, 8.9, floor);
    for (const x of [-2.78, 2.78]) {
      this.deco('keepStone', x, 0.055, -89.25, 0.22, 0.03, 8.9, floor);
    }
    // Descansillo transversal: une visualmente los braseros existentes.
    this.deco('flagstone', 0, 0.055, -94.65, 12.6, 0.03, 1.9, floor);
    for (const x of [-11, 11]) {
      // Banco de piedra a escala humana: asiento a 50 cm, profundidad 62 cm.
      // Apoyos desde la cara del adoquín; 2.69 m libres hasta la fachada.
      for (const dx of [-1.02, 1.02]) {
        this.box('castleStone', x + dx, 0.21, -100, 0.42, 0.34, 0.52, { mask: false });
      }
      this.box('keepStone', x, 0.44, -100, 3, 0.12, 0.62, { mask: false });
      // Los asientos usan el mismo contrato que los bancos existentes.
      for (const dx of [-0.75, 0.75]) this.seats.push({ x: x + dx, y: 0.5, z: -100, yaw: 0 });
    }
    // Ménsulas sujetas a la fachada: las telas quedan delante del relieve de piedra.
    for (const x of [8.5, 16.5]) for (const dx of [-0.55, 0.55]) {
      this.deco('iron', x + dx, 10.02, -102.15, 0.055, 0.055, 1.8, { mask: false });
    }
    // Puesto de provisiones: apoyado en el patio, separado de la fachada y del paso al cementerio.
    for (const x of [16, 23]) for (const z of [-100.6, -97.6]) {
      this.box('woodDark', x, 1.48, z, 0.18, 2.88, 0.18, { mask: false });
      this.deco('iron', x, 0.28, z, 0.2, 0.12, 0.2, { mask: false });
    }
    for (const z of [-100.6, -97.6]) this.box('woodDark', 19.5, 2.9, z, 7.4, 0.16, 0.18, { mask: false });
    for (const x of [16, 19.5, 23]) this.box('woodDark', x, 2.94, -99.1, 0.12, 0.12, 3.2, { mask: false });
    this.box('canvasRed', 19.5, 3.04, -99.1, 7.7, 0.08, 3.55);
    this.roofs.push({ x0: 15.65, x1: 23.35, z0: -100.875, z1: -97.325, y0: -1, y1: 3.08 });
    // Mostrador abierto por los lados; patas y tablero comparten los colliders del modelo.
    this.box('woodDark', 19.5, 0.92, -99.45, 3.8, 0.12, 0.9, { mask: false });
    for (const x of [17.85, 21.15]) for (const z of [-99.75, -99.15]) {
      this.box('woodDark', x, 0.45, z, 0.14, 0.82, 0.14, { mask: false });
    }
    for (const x of [16.45, 22.55]) this.light(x, 2.1, -97.6, 0xffae62, 12, 10, { flicker: true, priority: 2.5 });
  }

  // ---------------------------------------------------------------- murallas y torres de las esquinas
  _wallRun(x0, z0, x1, z1, nx, nz) {
    // (nx, nz): normal hacia afuera
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.box('castleStone', cx, WH / 2, cz, WT, WH, len, { yaw });
    // zócalo, cornisa y parapeto
    this.deco('castleStone', cx + nx * 0.2, 0.6, cz + nz * 0.2, WT + 0.4, 1.2, len, { yaw });
    this.deco('keepStone', cx + nx * 0.1, 8.2, cz + nz * 0.1, WT + 0.3, 0.35, len, { yaw, noShadow: true });
    this.deco('castleStone', cx + nx * (WT / 2 - 0.35), WH + 0.15, cz + nz * (WT / 2 - 0.35), 0.7, 0.3, len, { yaw });
    const n = Math.floor(len / 2.1);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const px = cx + (x1 - x0) * t, pz = cz + (z1 - z0) * t;
      this.deco('castleStone', px + nx * (WT / 2 - 0.35), WH + 0.95, pz + nz * (WT / 2 - 0.35), 0.7, 1.3, 1.2, { yaw });
      // parapeto bajo del lado de adentro
      this.deco('castleStone', px - nx * (WT / 2 - 0.25), WH + 0.3, pz - nz * (WT / 2 - 0.25), 0.5, 0.6, 2.1, { yaw });
    }
    // troneras (aspilleras) en la cara de afuera
    const m = Math.floor(len / 7.5);
    for (let i = 0; i < m; i++) {
      const t = (i + 0.5) / m - 0.5;
      const px = cx + (x1 - x0) * t, pz = cz + (z1 - z0) * t;
      this.deco('black', px + nx * (WT / 2 + 0.02), 5.8, pz + nz * (WT / 2 + 0.02), 0.06, 1.9, 0.2, { yaw, noShadow: true, mask: false });
      this.deco('black', px - nx * (WT / 2 + 0.02), 5.8, pz - nz * (WT / 2 + 0.02), 0.06, 1.9, 0.2, { yaw, noShadow: true, mask: false });
    }
  }

  _tower(x, z, r, h, roofH, { lit = false } = {}) {
    this.cyl('castleStone', x, h / 2, z, r, r + 0.15, h, 28, { collide: true });
    this.cyl('castleStone', x, 0.6, z, r + 0.5, r + 0.6, 1.2, 28, { mask: false });
    this.cyl('keepStone', x, h * 0.62, z, r + 0.2, r + 0.2, 0.35, 28, { noShadow: true, mask: false });
    // matacanes: ménsulas bajo el parapeto
    const nC = Math.round(r * 4);
    for (let i = 0; i < nC; i++) {
      const a = (i / nC) * Math.PI * 2;
      this.deco('keepStone', x + Math.sin(a) * (r + 0.25), h - 0.6, z + Math.cos(a) * (r + 0.25), 0.55, 0.9, 0.45, { yaw: a, noShadow: true, mask: false });
    }
    this.cyl('castleStone', x, h + 0.55, z, r + 0.55, r + 0.55, 1.1, 28);
    // almenas
    const nM = Math.round(r * 3.2);
    for (let i = 0; i < nM; i++) {
      const a = (i / nM) * Math.PI * 2;
      this.deco('castleStone', x + Math.sin(a) * (r + 0.3), h + 1.7, z + Math.cos(a) * (r + 0.3), 1.1, 1.2, 0.55, { yaw: a });
    }
    // techo cónico de pizarra con aguja
    const cone = new THREE.ConeGeometry(r * 0.92, roofH, 28, 1, true);
    scaleUV(cone, (2 * Math.PI * r) / 2.4, roofH / 2.4);
    cone.translate(x, h + 1.1 + roofH / 2, z);
    this.geo('slate', cone, [x - r, z - r, x + r, z + r, h + 1.1 + roofH]);
    this.cyl('iron', x, h + 1.1 + roofH + 0.7, z, 0.04, 0.07, 1.6, 6, { mask: false });
    // aspilleras alrededor y una ventana encendida (hay alguien arriba...)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      for (const y of [5.5, 11.5]) this.deco('black', x + Math.sin(a) * (r + 0.02), y, z + Math.cos(a) * (r + 0.02), 0.22, 1.6, 0.08, { yaw: a, noShadow: true, mask: false });
    }
    if (lit) {
      const a = lit;
      const m = this._litMat();
      const g = new THREE.PlaneGeometry(0.7, 1.4);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x + Math.sin(a) * (r + 0.05), h - 3.2, z + Math.cos(a) * (r + 0.05));
      mesh.rotation.y = a;
      this.scene.add(mesh);
    }
  }
  _litMat() {
    if (!this._lit) {
      this._lit = new THREE.MeshStandardMaterial({ color: 0x140a04, emissive: 0xff9440, emissiveIntensity: 1.6, roughness: 0.6 });
      this.windowsLit.push(this._lit);
    }
    return this._lit;
  }

  _curtain() {
    const ox = CX1 - WT / 2, fz = CZ1 - WT / 2, bz = CZ0 + WT / 2;
    // frente (con el portón al medio), fondo y costados
    this._wallRun(-ox, fz, -8, fz, 0, 1);
    this._wallRun(8, fz, ox, fz, 0, 1);
    this._wallRun(-ox, bz, ox, bz, 0, -1);
    this._wallRun(-ox, bz, -ox, fz, -1, 0);
    this._wallRun(ox, bz, ox, fz, 1, 0);
    // torres de las esquinas
    this._tower(-45, -79, 5.2, 17, 10, { lit: Math.PI * 0.75 });
    this._tower(45, -79, 5.2, 17, 10);
    this._tower(-45, -131, 5.2, 17, 10);
    this._tower(45, -131, 5.2, 17, 10, { lit: -Math.PI * 0.2 });
  }

  // ---------------------------------------------------------------- portón (con bóveda ojival y rastrillo)
  _gatehouse() {
    const z0 = -84.4, z1 = -74.6, zc = (z0 + z1) / 2, d = z1 - z0, H = 14, top = 8;
    this.box('castleStone', -5.6, H / 2, zc, 4.8, H, d);
    this.box('castleStone', 5.6, H / 2, zc, 4.8, H, d);
    this.box('castleStone', 0, (top + H) / 2, zc, 6.4, H - top, d);
    // bóveda ojival: relleno de las esquinas del vano en todo el largo del pasaje
    const fill = new THREE.ExtrudeGeometry(pointedFill(6.4, 4.0, 7.9, top), { depth: d, bevelEnabled: false });
    scaleUV(fill, 1 / 3.4);
    fill.translate(0, 0, z0);
    this.geo('castleStone', fill);
    // dovelas: arco resaltado en las dos caras
    for (const fz of [z1 + 0.12, z0 - 0.12]) {
      const ring = new THREE.ExtrudeGeometry(archRing([7.4, 4.0, 8.6], [6.4, 4.0, 7.9]), { depth: 0.24, bevelEnabled: false });
      scaleUV(ring, 1 / 3.2);
      ring.translate(0, 0, fz - 0.12);
      this.geo('keepStone', ring);
    }
    // almenas y cornisa
    for (let i = 0; i < 8; i++) {
      const x = -7.4 + i * 2.1;
      this.deco('castleStone', x, H + 0.65, z1 - 0.35, 1.2, 1.3, 0.7);
      this.deco('castleStone', x, H + 0.65, z0 + 0.35, 1.2, 1.3, 0.7);
    }
    this.deco('keepStone', 0, 11.2, z1 + 0.1, 16.4, 0.35, 0.3, { noShadow: true, mask: false });
    // rastrillo levantado (asoma debajo del arco)
    for (let i = 0; i < 14; i++) this.deco('iron', -2.95 + i * 0.454, 7.2, z1 - 0.9, 0.09, 2.6, 0.09, { mask: false });
    for (const y of [6.3, 7.4]) this.deco('iron', 0, y, z1 - 0.9, 6.2, 0.1, 0.1, { mask: false });
    for (let i = 0; i < 14; i++) {
      const g = new THREE.ConeGeometry(0.06, 0.28, 4);
      g.rotateX(Math.PI);
      g.translate(-2.95 + i * 0.454, 5.76, z1 - 0.9);
      this.geo('iron', g);
    }
    // (las hojas de madera abiertas contra el pasaje se sacaron: más altas que la bóveda, se metían en la piedra)
    // torres que flanquean
    for (const s of [-1, 1]) this._tower(s * 8.6, -75.8, 3.4, 16, 7.5);
    this.anchors.gate = new THREE.Vector3(0, 0, -76);
  }

  // ---------------------------------------------------------------- torreón (cáscara, techo, torretas y campanario)
  _keep() {
    const wx0 = KX0 + KT / 2, wx1 = KX1 - KT / 2, wz1 = KZ1 - KT / 2, wz0 = KZ0 + KT / 2;
    const WIN = (c, y0 = 5, y1 = 8.6, w = 1.5) => ({ a: c - w / 2, b: c + w / 2, y0, y1 });
    const UP = (c) => WIN(c, 11.2, 14.4, 1.3);
    // frente: puerta principal, ventanales dobles del salón, ventanas del comedor y la biblioteca
    this.wall('keepStone', KX0, wz1, KX1, wz1, KTOP, KT, [
      WIN(-20.5), UP(-20.5 + 3.2), WIN(-12.5), WIN(-5, 5, 14.6, 1.6), { a: -1.8, b: 1.8, y0: F0, y1: 8.7 }, WIN(5, 5, 14.6, 1.6), WIN(12.5), WIN(20.5), UP(20.5 - 3.2),
    ].sort((p, q) => p.a - q.a));
    // fondo: cocina, sala de los retratos (el cuarto secreto no tiene ventanas)
    this.wall('keepStone', KX0, wz0, KX1, wz0, KTOP, KT, [WIN(-20.5), WIN(-12.5), WIN(-4), WIN(4), UP(12.5), UP(20.5)].sort((p, q) => p.a - q.a));
    // costados: la chimenea del comedor y la de la biblioteca, la salida de la cripta al cementerio
    this.wall('keepStone', wx0, KZ1, wx0, KZ0, KTOP, KT, [WIN(-106.2), WIN(-112.8), WIN(-118.5), UP(-124)].sort((p, q) => p.a - q.a).reverse());
    this.wall('keepStone', wx1, KZ1, wx1, KZ0, KTOP, KT, [WIN(-105.6), { a: -107.4, b: -109.4, y0: 0, y1: 2.6 }, UP(-118), UP(-124)].sort((p, q) => p.a - q.a).reverse());
    // zócalo, línea del piso y cornisa
    for (const [x0, z0, x1, z1] of [[KX0, KZ1, KX1, KZ1], [KX0, KZ0, KX1, KZ0], [KX0, KZ0, KX0, KZ1], [KX1, KZ0, KX1, KZ1]]) {
      const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      this.deco('castleStone', cx, 0.45, cz, 0.5, 0.9, len + 0.5, { yaw, mask: false });
      this.deco('keepStone', cx, F0 - 0.1, cz, 0.36, 0.3, len + 0.36, { yaw, noShadow: true, mask: false });
      this.deco('keepStone', cx, KTOP - 0.2, cz, 0.6, 0.5, len + 0.6, { yaw });
    }
    // ventanas: vidrio emplomado (oscuro) y algunas encendidas
    this._windows();
    // techo a dos aguas (cumbrera en x) con hastiales de piedra
    const ridgeY = 24, eave = KTOP - 0.1, run = (KZ1 - KZ0) / 2 + 0.7, zc = (KZ1 + KZ0) / 2;
    const rise = ridgeY - eave, slope = Math.atan2(rise, run), L = Math.hypot(rise, run);
    for (const s of [1, -1]) {
      this.box('slate', 0, (eave + ridgeY) / 2, zc + s * run / 2, KX1 - KX0 + 1.4, 0.3, L, { rx: s * slope, tileU: 2.4, tileV: 2.4 });
    }
    this.deco('iron', 0, ridgeY + 0.1, zc, KX1 - KX0 + 1.4, 0.18, 0.18);
    for (const x of [KX0 + 0.6, KX1 - 0.6]) {
      const tri = new THREE.Shape();
      tri.moveTo(-run + 0.7, 0); tri.lineTo(run - 0.7, 0); tri.lineTo(0, rise - 0.3); tri.lineTo(-run + 0.7, 0);
      const g = new THREE.ExtrudeGeometry(tri, { depth: 1.2, bevelEnabled: false });
      scaleUV(g, 1 / 3.2);
      g.rotateY(Math.PI / 2);
      g.translate(x - 0.6, eave, zc);
      this.geo('keepStone', g);
    }
    // chimeneas
    for (const [x, z] of [[-24.2 + 1.2, -109.5], [23.4 - 0.6, -111.5], [-23.2, -123]]) {
      this.box('keepStone', x, 20.5, z, 1.5, 9, 1.5);
      this.deco('castleStone', x, 25.1, z, 1.9, 0.3, 1.9);
    }
    this.anchors.chimney = new THREE.Vector3(-23, 25.4, -109.5);
    // torretas en las esquinas del frente y del fondo
    for (const [x, z] of [[KX0 + 0.8, KZ1 - 0.8], [KX1 - 0.8, KZ1 - 0.8], [KX0 + 0.8, KZ0 + 0.8], [KX1 - 0.8, KZ0 + 0.8]]) {
      const base = new THREE.ConeGeometry(1.7, 1.6, 16, 1, true);
      base.rotateX(Math.PI);
      scaleUV(base, 3, 1);
      base.translate(x, 10.9, z);
      this.geo('keepStone', base);
      this.cyl('keepStone', x, 15, z, 1.7, 1.7, 7.4, 16, { collide: false });
      this.cyl('castleStone', x, 18.9, z, 1.95, 1.95, 0.4, 16, { collide: false });
      const cone = new THREE.ConeGeometry(2.0, 5.2, 16, 1, true);
      scaleUV(cone, 5, 2.2);
      cone.translate(x, 19.1 + 2.6, z);
      this.geo('slate', cone, [x - 2, z - 2, x + 2, z + 2, 24.3]);
      this.cyl('iron', x, 25, z, 0.03, 0.05, 1.2, 6, { mask: false });
      this.deco('black', x + Math.sign(x) * 1.72, 15, z, 0.06, 1.4, 0.18, { noShadow: true, mask: false });
    }
    // campanario: torre cuadrada que atraviesa el techo, con la campana a la vista y aguja de pizarra
    const tx0 = -3.6, tx1 = 3.6, tz0 = -125, tz1 = -117.8, tcx = 0, tcz = (tz0 + tz1) / 2, tw = tx1 - tx0;
    const bel0 = 25.2, bel1 = 29.6;
    for (const [x0, z0, x1, z1] of [[tx0, tz1, tx1, tz1], [tx0, tz0, tx1, tz0]]) {
      this.wall('keepStone', x0, z0, x1, z1, 32 - 12, 0.9, [{ a: -1.1, b: 1.1, y0: bel0, y1: bel1 }], { y0: 12, collide: false });
    }
    for (const [x0, z0, x1, z1] of [[tx0, tz0, tx0, tz1], [tx1, tz0, tx1, tz1]]) {
      this.wall('keepStone', x0, z0, x1, z1, 32 - 12, 0.9, [{ a: tcz - 1.1, b: tcz + 1.1, y0: bel0, y1: bel1 }], { y0: 12, collide: false });
    }
    this.deco('keepStone', tcx, bel0 - 0.25, tcz, tw + 0.5, 0.5, tw + 0.5);
    this.deco('keepStone', tcx, 32.2, tcz, tw + 0.8, 0.5, tw + 0.8);
    const spire = new THREE.ConeGeometry(tw * 0.74, 14, 4, 1, true);
    spire.rotateY(Math.PI / 4);
    scaleUV(spire, 6, 6);
    spire.translate(tcx, 32.4 + 7, tcz);
    this.geo('slate', spire, [tx0, tz0, tx1, tz1, 46.4]);
    this.cyl('iron', tcx, 47.2, tcz, 0.035, 0.06, 1.8, 6, { mask: false });
    this.deco('iron', tcx, 47.6, tcz, 0.9, 0.05, 0.05, { mask: false });
    this.spire = new THREE.Vector3(tcx, 48, tcz);
    // campana (bronce) colgando del yugo
    const prof = [[0.02, 0], [0.62, 0.02], [0.66, 0.12], [0.55, 0.3], [0.44, 0.7], [0.4, 1.05], [0.3, 1.2], [0.02, 1.24]];
    const bell = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * 1.35, y * 1.35)), 20);
    bell.translate(tcx, 26.2, tcz);
    this.geo('bronze', bell);
    this.deco('woodDark', tcx, 28.2, tcz, tw - 0.9, 0.3, 0.35, { mask: false });
    this.anchors.bell = new THREE.Vector3(tcx, 27, tcz);
  }

  _windows() {
    const glass = this._leadedGlass();
    const lit = this._litMat();
    const cold = glass;
    const add = (x, y, z, w, h, yaw, m) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      // parteluz y travesaño de hierro
      this.deco('iron', x, y, z, yaw ? 0.06 : w, 0.06, yaw ? w : 0.06, { mask: false, noShadow: true });
      this.deco('iron', x, y, z, yaw ? 0.06 : 0.06, h, yaw ? 0.06 : 0.06, { mask: false, noShadow: true });
      // alféizar y guardapolvo de piedra
      const out = (yaw ? 0 : 0);
      this.deco('keepStone', x, y - h / 2 - 0.08, z, yaw ? 1.5 : w + 0.4, 0.16, yaw ? w + 0.4 : 1.5, { mask: false });
      this.deco('keepStone', x, y + h / 2 + 0.22, z, yaw ? 1.45 : w + 0.5, 0.3, yaw ? w + 0.5 : 1.45, { mask: false });
      return mesh;
    };
    const fz = KZ1 - KT / 2, bz = KZ0 + KT / 2, wx = KX0 + KT / 2, ex = KX1 - KT / 2;
    // planta baja (vidrio oscuro: adentro manda la vela)
    for (const x of [-20.5, -12.5, 12.5, 20.5]) add(x, 6.8, fz, 1.5, 3.6, 0, cold);
    for (const x of [-5, 5]) { add(x, 6.8, fz, 1.6, 3.6, 0, cold); add(x, 12.8, fz, 1.6, 3.6, 0, cold); this.deco('keepStone', x, 9.8, fz, 1.8, 2.4, KT, {}); }
    for (const x of [-20.5, -12.5, -4, 4]) add(x, 6.8, bz, 1.5, 3.6, 0, cold);
    for (const z of [-106.2, -112.8, -118.5]) add(wx, 6.8, z, 1.5, 3.6, Math.PI / 2, cold);
    add(ex, 6.8, -105.6, 1.5, 3.6, Math.PI / 2, cold);
    // piso de arriba (no se entra): unas ventanas oscuras y otras con luz de vela...
    for (const [x, m] of [[-17.3, lit], [17.3, cold]]) add(x, 12.8, fz, 1.3, 3.2, 0, m);
    for (const [x, m] of [[12.5, cold], [20.5, lit]]) add(x, 12.8, bz, 1.3, 3.2, 0, m);
    add(wx, 12.8, -124, 1.3, 3.2, Math.PI / 2, lit);
    for (const [z, m] of [[-118, cold], [-124, lit]]) add(ex, 12.8, z, 1.3, 3.2, Math.PI / 2, m);
    // anclas: la silueta que cruza una ventana de arriba
    this.anchors.upperWindow = new THREE.Vector3(-17.3, 12.8, fz - 0.4);
    this._moonShafts();
  }

  // Haces de luna por las aberturas del frente (la luna viene del sudoeste: entra por el frente, no por los costados).
  // El grosor del muro recorta la luz oblicua: queda el rectángulo común entre la boca de adentro y la de afuera
  // corrida por la luz. La cruz de hierro y el emplomado se miden en el plano del vidrio (medio muro).
  _moonShafts() {
    const D = new THREE.Vector3(-MOON[0], -MOON[1], -MOON[2]).normalize();
    const dn = -D.z; // hacia adentro del frente es -z
    if (dn < 0.05) return;
    const T = KT, zin = KZ1 - KT;
    const hall = { bmin: new THREE.Vector3(-7.7, F0, -116.5), bmax: new THREE.Vector3(7.7, 16.2, IZ1) };
    const dining = { bmin: new THREE.Vector3(IX0, F0, -115), bmax: new THREE.Vector3(-8.3, F1, IZ1) };
    const library = { bmin: new THREE.Vector3(8.3, F0, -115), bmax: new THREE.Vector3(IX1, F1, IZ1) };
    const add = (x0, x1, y0, y1, room, bars = true, extra = {}) => {
      const da = (T * D.x) / dn, db = (T * D.y) / dn;
      const a0 = Math.max(x0, x0 + da), a1 = Math.min(x1, x1 + da);
      const b0 = Math.max(y0, y0 + db), b1 = Math.min(y1, y1 + db);
      if (a1 - a0 < 0.1 || b1 - b0 < 0.1) return;
      const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
      this.shafts.push({
        c: new THREE.Vector3(ca, cb, zin), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), d: D.clone(),
        hw: (a1 - a0) / 2, hh: (b1 - b0) / 2, len: (b1 - room.bmin.y) / -D.y + 1.5,
        glass: [((T / 2) * D.x) / dn + (x0 + x1) / 2 - ca, ((T / 2) * D.y) / dn + (y0 + y1) / 2 - cb],
        bars, bmin: room.bmin, bmax: room.bmax, ...extra,
      });
    };
    for (const x of [-5, 5]) { add(x - 0.8, x + 0.8, 5, 8.6, hall); add(x - 0.8, x + 0.8, 11, 14.6, hall); }
    for (const x of [-20.5, -12.5]) add(x - 0.75, x + 0.75, 5, 8.6, dining);
    for (const x of [12.5, 20.5]) add(x - 0.75, x + 0.75, 5, 8.6, library);
    // la puerta principal (si la cierran de golpe, se corta)
    add(-1.8, 1.8, F0, 8.7, hall, false, { on: () => (this.doors.keep?.open ?? 1) > 0.5 });
  }

  _leadedGlass() {
    if (this._glass) return this._glass;
    let map = null;
    if (typeof document !== 'undefined') {
      // vidrio emplomado en rombos, sucio
      const cv = document.createElement('canvas');
      cv.width = 128; cv.height = 256;
      const c = cv.getContext('2d');
      c.fillStyle = '#20262c'; c.fillRect(0, 0, 128, 256);
      for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${60 + Math.random() * 40},${70 + Math.random() * 40},${60 + Math.random() * 30},0.08)`; c.fillRect(Math.random() * 128, Math.random() * 256, 8, 8); }
      c.strokeStyle = '#0c0c0e'; c.lineWidth = 3;
      for (let k = -8; k < 16; k++) {
        c.beginPath(); c.moveTo(k * 32, 0); c.lineTo(k * 32 + 256, 256); c.stroke();
        c.beginPath(); c.moveTo(k * 32 + 128, 0); c.lineTo(k * 32 - 128, 256); c.stroke();
      }
      map = new THREE.CanvasTexture(cv);
      map.colorSpace = THREE.SRGBColorSpace;
    }
    this._glass = new THREE.MeshStandardMaterial({ map, color: 0x5a6470, roughness: 0.22, metalness: 0.3, emissive: 0x6a88c0, emissiveIntensity: 0.25, emissiveMap: map, envMapIntensity: 0.12 });
    this.windowsCold = this._glass;
    return this._glass;
  }

  // ---------------------------------------------------------------- interior del torreón
  _keepInterior() {
    // losa del piso (con el hueco de la escalera a la cripta) y terminaciones por cuarto
    this.box('keepStone', -1.6, F0 - 0.15, (IZ0 + IZ1) / 2, 44.4, 0.3, IZ1 - IZ0, { mask: false });
    this.box('keepStone', 22.2, F0 - 0.15, -110.2, 3.2, 0.3, 12, { mask: false });
    const floor = (key, x0, z0, x1, z1) => this.deco(key, (x0 + x1) / 2, F0 + 0.01, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0, { noShadow: true, mask: false });
    floor('flagstone', -8, IZ0, 8, IZ1); // salón y sala de retratos
    floor('oldWood', IX0, -115, -8, IZ1); // comedor
    floor('flagstone', IX0, IZ0, -8, -115); // cocina
    floor('oldWood', 8, -115, IX1, IZ1); // biblioteca
    floor('flagstone', 8, IZ0, 20.6, -115); // cuarto secreto
    // tabiques (revoque viejo con moho)
    const W1 = -8, W2 = 8;
    this.wall('moldy', W1, IZ1, W1, IZ0, 16.2 - F0, PT, [{ a: -104.9, b: -107.1, y0: F0, y1: F0 + 3.2 }, { a: -120.4, b: -122.6, y0: F0, y1: F0 + 3.2 }].sort((p, q) => p.a - q.a).reverse(), { y0: F0 });
    this.wall('moldy', W2, IZ1, W2, IZ0, 16.2 - F0, PT, [{ a: -108.4, b: -110.6, y0: F0, y1: F0 + 3.2 }], { y0: F0 });
    this.wall('moldy', IX0, -115, W1 - PT / 2, -115, F1 - F0, PT, [{ a: -17.1, b: -14.9, y0: F0, y1: F0 + 3.2 }], { y0: F0 });
    this.wall('moldy', W2 + PT / 2, -115, IX1, -115, F1 - F0, PT, [{ a: 15.7, b: 17.3, y0: F0, y1: F0 + 2.6 }], { y0: F0 });
    this.wall('moldy', W1 + PT / 2, -116.8, W2 - PT / 2, -116.8, 16.2 - F0, PT, [{ a: 1.8, b: 4.2, y0: F0, y1: F0 + 3.2 }], { y0: F0 });
    // marcos de las puertas (madera oscura)
    const frame = (x, z, w, h, alongX) => {
      const sx = alongX ? w + 0.3 : PT + 0.1, sz = alongX ? PT + 0.1 : w + 0.3;
      this.deco('blackWood', x, F0 + h + 0.12, z, sx, 0.24, sz, { mask: false });
      for (const s of [-1, 1]) this.deco('blackWood', x + (alongX ? s * (w / 2 + 0.06) : 0), F0 + h / 2, z + (alongX ? 0 : s * (w / 2 + 0.06)), alongX ? 0.14 : PT + 0.1, h, alongX ? PT + 0.1 : 0.14, { mask: false });
    };
    frame(W1, -106, 2.2, 3.2, false); frame(W1, -121.5, 2.2, 3.2, false); frame(W2, -109.5, 2.2, 3.2, false);
    frame(-16, -115, 2.2, 3.2, true); frame(3, -116.8, 2.4, 3.2, true);
    // cielorrasos (madera oscura con vigas) y el del salón, alto
    const ceil = (x0, z0, x1, z1, y) => {
      this.box('woodDark', (x0 + x1) / 2, y + 0.15, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, { mask: false, noShadow: true });
      for (let x = x0 + 1.6; x < x1 - 0.5; x += 2.2) this.deco('blackWood', x, y - 0.18, (z0 + z1) / 2, 0.3, 0.36, z1 - z0, { mask: false, noShadow: true });
    };
    ceil(IX0, IZ1, W1 - PT / 2, IZ0, F1);
    ceil(W2 + PT / 2, IZ1, IX1, IZ0, F1);
    ceil(W1 + PT / 2, -117.1, W2 - PT / 2, IZ0, F1);
    ceil(W1 + PT / 2, IZ1, W2 - PT / 2, -116.5, 16.2);
    // zócalo de madera (boiserie) en el comedor, la biblioteca y los retratos
    const wains = (x0, z0, x1, z1) => this.deco('blackWood', (x0 + x1) / 2, F0 + 0.6, (z0 + z1) / 2, Math.max(0.06, x1 - x0), 1.2, Math.max(0.06, z1 - z0), { mask: false, noShadow: true });
    wains(IX0 + 0.03, IZ1 - 0.3, IX0 + 0.09, -114.7); wains(IX0 + 0.3, IZ1 - 0.03, -8.6, IZ1 - 0.09);
    wains(IX1 - 0.09, IZ1 - 0.3, IX1 - 0.03, -114.7); wains(8.6, IZ1 - 0.09, IX1 - 0.3, IZ1 - 0.03);
    wains(-7.7, IZ0 + 0.03, 7.7, IZ0 + 0.09);
    // balcón del salón y escalera (pegada al muro oeste del salón)
    const by = 8, bz0 = -116.5, bz1 = -114.4;
    this.box('woodDark', 0, by - 0.15, (bz0 + bz1) / 2, 15.4, 0.3, bz1 - bz0, { mask: false });
    for (let x = -5.3; x <= 7.5; x += 0.42) this.deco('blackWood', x, by + 0.5, bz1 + 0.05, 0.08, 1.0, 0.08, { mask: false });
    this.box('blackWood', 1.1, by + 1.02, bz1 + 0.05, 12.8, 0.1, 0.16, { mask: false });
    this.phys.box(1.1, by + 0.55, bz1 + 0.05, 6.4, 0.55, 0.08, 0, { paint: false });
    const sx0 = -7.7, sx1 = -5.5, sz0 = -107.5, sz1 = bz1, rise = by - F0, run = sz0 - sz1;
    const n = 25;
    for (let i = 0; i < n; i++) {
      const z = sz0 - (i + 0.5) * (run / n), y = F0 + (i + 1) * (rise / n);
      this.deco('woodDark', (sx0 + sx1) / 2, y - 0.09, z, sx1 - sx0, 0.18, run / n + 0.02, { mask: false });
    }
    // rampa invisible: sube parejo (las cápsulas no se traban en los escalones)
    const ang = Math.atan2(rise, run), L = Math.hypot(rise, run);
    const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(ang, 0, 0));
    this.phys.box((sx0 + sx1) / 2, F0 + rise / 2 - 0.12, (sz0 + sz1) / 2, (sx1 - sx0) / 2, 0.1, L / 2, 0, { rot: { x: rq.x, y: rq.y, z: rq.z, w: rq.w }, mat: 'wood' });
    // zanca y baranda del lado abierto
    const stringer = new THREE.BoxGeometry(0.2, 0.5, L);
    stringer.rotateX(ang);
    stringer.translate(sx1 + 0.1, F0 + rise / 2 - 0.1, (sz0 + sz1) / 2);
    this.geo('blackWood', stringer);
    for (let i = 1; i < n; i += 2) {
      const z = sz0 - i * (run / n), y = F0 + i * (rise / n);
      this.deco('blackWood', sx1 + 0.1, y + 0.5, z, 0.07, 1.0, 0.07, { mask: false });
    }
    const rail = new THREE.BoxGeometry(0.1, 0.1, L);
    rail.rotateX(ang);
    rail.translate(sx1 + 0.1, F0 + rise / 2 + 1.0, (sz0 + sz1) / 2);
    this.geo('blackWood', rail);
    this.phys.box(sx1 + 0.1, F0 + rise / 2 + 0.5, (sz0 + sz1) / 2, 0.06, 0.55, L / 2, 0, { rot: { x: rq.x, y: rq.y, z: rq.z, w: rq.w }, paint: false });
    // puertas clausuradas del piso de arriba (con tablas clavadas): algún día se abren...
    for (const x of [-2.6, 4.6]) {
      this.deco('doorWood', x, by + 1.35, -116.45, 1.5, 2.7, 0.08, { mask: false });
      for (const [y, r] of [[by + 0.8, 0.35], [by + 1.5, -0.3], [by + 2.1, 0.2]]) this.deco('woodDark', x, y, -116.36, 1.9, 0.18, 0.05, { rz: r, mask: false });
    }
    this.anchors.upperDoors = new THREE.Vector3(1, by + 1.4, -116);
    // anclas de los cuartos
    this.anchors.hall = new THREE.Vector3(0, F0, -110);
    this.anchors.dining = new THREE.Vector3(-16, F0, -109.5);
    this.anchors.kitchen = new THREE.Vector3(-16, F0, -120.5);
    this.anchors.library = new THREE.Vector3(16, F0, -109.5);
    this.anchors.gallery = new THREE.Vector3(0, F0, -121.5);
    this.anchors.secret = new THREE.Vector3(15, F0, -120.5);
    this.anchors.balcony = new THREE.Vector3(1, by, -115.5);
    // puerta principal del torreón (hojas de madera, se pueden cerrar de golpe)
    this.doors.keep = { x: 0, y: F0, z: KZ1 - 0.1, open: 1 };
    // puerta de la sala de retratos (hoja propia: el susto la cierra)
    const gd = this._doorLeaf(1.8, F0, -116.8, 2.4, 3.2, 'x');
    this.doors.gallery = gd;
    // hueco del pasadizo: la biblioteca tapa el vano con un estante que gira (lo arma haunt.js con el modelo)
    this.anchors.secretDoor = new THREE.Vector3(16.5, F0, -115 + PT / 2 + 0.02);
    // collider del estante-puerta: se saca mientras está abierto
    this.secretCollider = this.phys.box(16.5, F0 + 1.3, -115, 0.85, 1.3, 0.35, 0, { paint: false });
  }

  // Muros del torreón en cajas simples (con los huecos de las puertas) que solo ve la sombra de la luz heroica
  // (capa 4): así el candelabro y las chimeneas no alumbran a través de los tabiques, sin redibujar todo el castillo
  _shadowProxies() {
    const boxes = [];
    const B = (x0, y0, z0, x1, y1, z1) => { if (x1 - x0 > 0.01 && y1 - y0 > 0.01 && z1 - z0 > 0.01) boxes.push([x0, y0, z0, x1, y1, z1]); };
    // tramo de muro con huecos [a0, a1, y0, y1] a lo largo del eje ax ('x' o 'z'); c0..c1 su grosor
    const run = (ax, a0, a1, c0, c1, y0, y1, holes = []) => {
      const put = (p, q, ya, yb) => (ax === 'x' ? B(p, ya, c0, q, yb, c1) : B(c0, ya, p, c1, yb, q));
      let a = a0;
      for (const [h0, h1, hy0, hy1] of [...holes].sort((p, q) => p[0] - q[0])) {
        if (h0 > a) put(a, h0, y0, y1);
        if (hy1 < y1) put(h0, h1, hy1, y1);
        if (hy0 > y0) put(h0, h1, y0, hy0);
        a = h1;
      }
      if (a < a1) put(a, a1, y0, y1);
    };
    const D = (a0, a1, h = 3.2) => [a0, a1, F0 - 0.1, F0 + h];
    // cáscara del torreón (la puerta principal y la salida de la cripta abiertas)
    run('x', KX0, KX1, IZ1, KZ1, 0, KTOP, [[-1.8, 1.8, F0, 8.7]]);
    run('x', KX0, KX1, KZ0, IZ0, 0, KTOP);
    run('z', KZ0, KZ1, KX0, IX0, 0, KTOP);
    run('z', KZ0, KZ1, IX1, KX1, 0, KTOP, [[-109.4, -107.4, 0, 2.6]]);
    // tabiques con sus puertas
    run('z', IZ0, IZ1, -8.3, -7.7, F0, 16.2, [D(-107.1, -104.9), D(-122.6, -120.4)]);
    run('z', IZ0, IZ1, 7.7, 8.3, F0, 16.2, [D(-110.6, -108.4)]);
    run('x', IX0, -8.3, -115.3, -114.7, F0, F1, [D(-17.1, -14.9)]);
    run('x', 8.3, IX1, -115.3, -114.7, F0, F1, [D(15.7, 17.3, 2.6)]);
    run('x', -7.7, 7.7, -117.1, -116.5, F0, 16.2, [D(1.8, 4.2)]);
    // losa del piso (la luz del salón no baja a la cripta) y cielorrasos de los cuartos bajos
    B(IX0, F0 - 0.3, IZ0, IX1, F0, IZ1);
    B(IX0, F1, IZ0, -8, F1 + 0.3, IZ1);
    B(8, F1, IZ0, IX1, F1 + 0.3, IZ1);
    const geos = boxes.map(([x0, y0, z0, x1, y1, z1]) => {
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      return g;
    });
    if (!geos.length) return;
    let n = 0;
    for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), idx = [];
    let o = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, o * 3);
      for (const i of g.index.array) idx.push(i + o);
      o += g.attributes.position.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.name = 'keep-shadow-proxies';
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.layers.set(PROXY_LAYER);
    this.scene.add(mesh);
    this.proxies = mesh;
  }

  // Hoja de puerta con bisagra en (hx, y, hz); se abre girando. along: 'x' si la puerta está en un muro que corre en x
  _doorLeaf(hx, y, hz, w, h, along) {
    const pivot = new THREE.Group();
    pivot.position.set(hx, y, hz);
    const mat = getMat('doorWood');
    const g = new THREE.BoxGeometry(along === 'x' ? w : 0.1, h, along === 'x' ? 0.1 : w);
    g.translate(along === 'x' ? w / 2 : 0, h / 2, along === 'x' ? 0 : w / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 1.8, uv.getY(i) * h / 1.8);
    const leaf = new THREE.Mesh(g, mat);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    pivot.add(leaf);
    const iron = getMat('iron');
    for (const yy of [0.5, h - 0.5]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? w * 0.9 : 0.12, 0.1, along === 'x' ? 0.12 : w * 0.9), iron);
      band.position.set(along === 'x' ? w * 0.45 : 0, yy, along === 'x' ? 0 : w * 0.45);
      pivot.add(band);
    }
    const knob = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 12), iron);
    knob.position.set(along === 'x' ? w - 0.2 : 0.07, h * 0.47, along === 'x' ? 0.07 : w - 0.2);
    pivot.add(knob);
    this.scene.add(pivot);
    // abierta contra la pared (90°); el susto la cierra de golpe
    pivot.rotation.y = -Math.PI / 2 * 0.92;
    return { pivot, open: 1, target: 1, w, h, along, collider: null };
  }

  // ---------------------------------------------------------------- cripta (debajo de la biblioteca y del cuarto secreto)
  _crypt() {
    const x0 = 8.3, x1 = IX1, top = F0 - 0.3;
    // muro que la separa del sótano cerrado del oeste
    this.box('cryptBrick', 8, top / 2, (IZ0 + IZ1) / 2, PT, top, IZ1 - IZ0, { mask: false });
    // piso de lajas y columnas
    this.deco('flagstone', (x0 + x1) / 2, 0.03, (IZ0 + IZ1) / 2, x1 - x0, 0.06, IZ1 - IZ0, { noShadow: true, mask: false });
    for (const x of [12.2, 16.3]) for (const z of [-108.2, -112.4, -116.6, -120.8]) {
      this.box('cryptBrick', x, top / 2, z, 0.8, top, 0.8, { mask: false });
      this.deco('keepStone', x, top - 0.15, z, 1.1, 0.3, 1.1, { mask: false });
    }
    // revestimiento de ladrillo musgoso en los muros del torreón (por dentro)
    this.deco('cryptBrick', IX1 - 0.03, top / 2, (IZ0 + IZ1) / 2, 0.06, top, IZ1 - IZ0, { mask: false, noShadow: true });
    this.deco('cryptBrick', (x0 + x1) / 2, top / 2, IZ1 - 0.03, x1 - x0, top, 0.06, { mask: false, noShadow: true });
    this.deco('cryptBrick', (x0 + x1) / 2, top / 2, IZ0 + 0.03, x1 - x0, top, 0.06, { mask: false, noShadow: true });
    // escalera del cuarto secreto a la cripta (baja hacia el sur, pegada al muro este)
    const sx0 = 20.8, sx1 = 23.6, zt = -116.4, zb = -124.0, n = 20, rise = F0, run = zt - zb;
    for (let i = 0; i < n; i++) {
      const z = zt - (i + 0.5) * (run / n), y = F0 - (i + 1) * (rise / n) + rise / n;
      this.deco('keepStone', (sx0 + sx1) / 2, y / 2, z, sx1 - sx0, Math.max(0.05, y), run / n + 0.01, { mask: false });
    }
    const ang = Math.atan2(rise, run), L = Math.hypot(rise, run);
    const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-ang, 0, 0));
    this.phys.box((sx0 + sx1) / 2, rise / 2 - 0.1, (zt + zb) / 2, (sx1 - sx0) / 2, 0.1, L / 2, 0, { rot: { x: rq.x, y: rq.y, z: rq.z, w: rq.w } });
    // baranda de hierro alrededor del hueco (arriba)
    for (let z = -117.6; z > IZ0; z -= 0.5) this.deco('iron', 20.5, F0 + 0.5, z, 0.05, 1.0, 0.05, { mask: false });
    this.deco('iron', 20.5, F0 + 1.02, (-117.6 + IZ0) / 2, 0.08, 0.08, -117.6 - IZ0, { mask: false });
    this.phys.box(20.5, F0 + 0.55, (-117.6 + IZ0) / 2, 0.06, 0.55, (-117.6 - IZ0) / 2, 0, { paint: false });
    // puerta de reja de la cripta al cementerio (se abre desde adentro)
    this.anchors.cryptDoor = new THREE.Vector3(KX1 - KT / 2, 0, -108.4);
    this.cryptGate = this._gateBars(KX1 - KT / 2 + 0.35, -108.4);
    this.anchors.crypt = new THREE.Vector3(16, 0, -114);
    this.anchors.cryptTomb = new THREE.Vector3(14.2, 0, -114.5);
  }
  _gateBars(x, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0, z + 1.0);
    const iron = getMat('iron');
    for (let i = 0; i < 8; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.5, 6), iron);
      bar.position.set(0, 1.25, -0.12 - i * 0.25);
      pivot.add(bar);
    }
    for (const y of [0.3, 1.3, 2.35]) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 2.0), iron);
      cross.position.set(0, y, -1.0);
      pivot.add(cross);
    }
    this.scene.add(pivot);
    const collider = this.phys.box(x, 1.3, z, 0.08, 1.3, 1.0, 0, { paint: false });
    return { pivot, collider, open: 0 };
  }

  // ---------------------------------------------------------------- escalinata del torreón
  _keepStairs() {
    const x0 = -4.2, x1 = 4.2, zb = -95.6, zt = KZ1 + 0.8, n = 20, rise = F0, run = zb - zt;
    for (let i = 0; i < n; i++) {
      const z = zb - (i + 0.5) * (run / n), y = (i + 1) * (rise / n);
      this.deco('keepStone', 0, y / 2, z, x1 - x0, y, run / n + 0.01, {});
    }
    this.deco('keepStone', 0, F0 / 2, (zt + KZ1) / 2, x1 - x0, F0, zt - KZ1, {});
    const ang = Math.atan2(rise, run), L = Math.hypot(rise, run);
    const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(ang, 0, 0));
    this.phys.box(0, rise / 2 - 0.1, (zb + zt) / 2, (x1 - x0) / 2, 0.1, L / 2, 0, { rot: { x: rq.x, y: rq.y, z: rq.z, w: rq.w } });
    this.phys.box(0, F0 / 2, (zt + KZ1) / 2, (x1 - x0) / 2, F0 / 2, (zt - KZ1) / 2, 0);
    // barandas de piedra
    for (const s of [-1, 1]) {
      const x = s * 4.45;
      const g = new THREE.BoxGeometry(0.5, 1.0, L);
      g.rotateX(ang);
      g.translate(x, rise / 2 + 0.45, (zb + zt) / 2);
      this.geo('keepStone', g);
      this.box('keepStone', x, F0 / 2 + 0.5, (zt + KZ1) / 2, 0.5, F0 + 1, zt - KZ1, {});
      this.phys.box(x, rise / 2 + 0.45, (zb + zt) / 2, 0.25, 0.55, L / 2, 0, { rot: { x: rq.x, y: rq.y, z: rq.z, w: rq.w }, paint: false });
      this.box('keepStone', x, 0.7, zb - 0.2, 0.8, 1.4, 0.8);
      // braseros al pie de la escalinata
      this.cyl('keepStone', s * 5.6, 0.55, zb + 0.6, 0.45, 0.55, 1.1, 10, { collide: true });
      // The closed Blender bowl is placed by Decor; this base and fire stay here.
      this.brazier(s * 5.6, 1.45, zb + 0.6);
    }
  }
  brazier(x, y, z, big = 1) {
    const w = this.world;
    this.fire3d(x, y - 0.12, z, 0.34 * big, 0.34 * big, .85 * big, { wind: 1, intensity:.8 });
    w.embers?.add(x, y + 0.2, z, 14, { radius: 0.25, height: 2.6, strength: 0.8 });
    this.light(x, y + 0.9, z, 0xff9b52, 8 * big, 14, { flicker: true, priority: 1.4 });
  }

  // ---------------------------------------------------------------- galpón del fogón (zona tranquila)
  _pavilion() {
    this.cur = this.bp;
    const x0 = -39, x1 = -15, z0 = -99.6, z1 = -85.4, H = 5.4, ridge = 8.6, [fx, fz] = FIRE;
    const posts = [];
    for (let i = 0; i < 6; i++) posts.push(x0 + i * ((x1 - x0) / 5));
    for (const x of posts) for (const z of [z0, z1]) {
      this.box('woodDark', x, H / 2, z, 0.34, H, 0.34, { pmat: 'wood', mask: false });
      this.deco('keepStone', x, 0.2, z, 0.6, 0.4, 0.6, { mask: false });
      // tornapuntas
      for (const s of [-1, 1]) if ((s < 0 && x > x0) || (s > 0 && x < x1)) this.deco('woodDark', x + s * 0.55, H - 0.55, z, 0.16, 1.3, 0.16, { rz: -s * 0.75, mask: false });
    }
    for (const z of [z0, z1]) this.deco('woodDark', (x0 + x1) / 2, H + 0.17, z, x1 - x0 + 0.4, 0.36, 0.36, {});
    for (const x of posts) this.deco('woodDark', x, H + 0.17, (z0 + z1) / 2, 0.3, 0.3, z1 - z0 + 0.3, {});
    // techo a dos aguas con una linterna de humo sobre el fuego
    const eaveZ0 = z0 - 0.9, eaveZ1 = z1 + 0.9, zc = (z0 + z1) / 2, run = (eaveZ1 - eaveZ0) / 2, eaveY = H - 0.1;
    const rise = ridge - eaveY, ang = Math.atan2(rise, run), L = Math.hypot(rise, run);
    const ventX0 = fx - 2.2, ventX1 = fx + 2.2, gap = 1.3; // en la cumbrera, sobre el fuego, queda una abertura
    const slab = (xa, xb, cut) => {
      for (const s of [1, -1]) {
        const Ls = L - cut;
        const cz = zc + s * (run - (Ls * Math.cos(ang)) / 2) ;
        const cy = eaveY + (Ls * Math.sin(ang)) / 2;
        this.box('slate', (xa + xb) / 2, cy, cz, xb - xa, 0.16, Ls, { rx: s * ang, tileU: 2.4, tileV: 2.4 });
        // cabios a la vista
        for (let x = xa + 0.6; x < xb; x += 1.2) this.deco('woodDark', x, cy - 0.17, cz, 0.12, 0.18, Ls, { rx: s * ang, mask: false, noShadow: true });
      }
    };
    slab(x0 - 0.9, ventX0, 0);
    slab(ventX1, x1 + 0.9, 0);
    slab(ventX0, ventX1, gap / Math.cos(ang));
    this.deco('woodDark', (x0 + x1) / 2, ridge - 0.12, zc, x1 - x0 + 1.8, 0.3, 0.3, {});
    // sombrerete de la linterna de humo (más arriba, deja salir el humo y no entra la lluvia)
    for (const s of [1, -1]) this.box('slate', fx, ridge + 1.2, zc + s * 1.05, 5.2, 0.12, 2.3, { rx: s * 0.42 });
    for (const [x, z] of [[ventX0, zc - 1.2], [ventX0, zc + 1.2], [ventX1, zc - 1.2], [ventX1, zc + 1.2]]) this.deco('woodDark', x, ridge + 0.4, z, 0.16, 1.3, 0.16, {});
    this.roofs.push({ x0: x0 - 0.9, y0: -1, z0: eaveZ0, x1: x1 + 0.9, y1: ridge, z1: eaveZ1 });
    // piso de lajas
    this.deco('flagstone', (x0 + x1) / 2, 0.04, zc, x1 - x0 + 0.8, 0.08, z1 - z0 + 0.8, { noShadow: true, mask: false });
    // fogón: piedras, leños carbonizados y brasas son un modelo (castle-decor); acá, collider, fuego y luz
    this.phys.cylinder(fx, 0.2, fz, 0.2, 1.25);
    this.anchors.fire = new THREE.Vector3(fx, 0, fz);
    this.fire = { x: fx, z: fz, flames: [], boost: 0 };
    this.fire.vol = this.fire3d(fx, 0.16, fz, 0.62, 0.62, 0.72, { intensity: 1.15 });
    this.fire.embers = this.world.embers?.add(fx, 0.5, fz, 70, { radius: 0.45, height: 5.5, strength: 1, speed: 0.4 });
    this.fire.smoke = this.world.smoke?.add(fx, 1.0, fz, 18, { radius: 0.4, height: 4, opacity: 0.045, speed: 0.07 });
    this.fire.light = this.light(fx, 1.25, fz, 0xff7a30, 22, 23, { flicker: true, priority: 3, decay: 1.4, shadow: true });
    this.fire.light2 = this.light(fx, 3.6, fz, 0xff9a50, 5, 14, { flicker: true, priority: 2 });
    // bancos de troncos en ronda (asientos que miran al fuego)
    const R = 3.35;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const cx = fx + Math.sin(a) * R, cz = fz + Math.cos(a) * R;
      const yaw = a, tx = Math.cos(a), tz = -Math.sin(a);
      // el tronco es un modelo (castle-decor); acá el collider y los dos asientos
      this.benches = this.benches || [];
      this.benches.push({ x: cx, z: cz, yaw });
      this.phys.box(cx, 0.24, cz, 0.9, 0.24, 0.27, yaw, { mat: 'wood', paint: false });
      for (const s of [-1, 1]) {
        const sx = cx + tx * s * 0.42, sz = cz + tz * s * 0.42;
        this.seats.push({ x: sx, y: 0.46, z: sz, yaw: Math.atan2(fx - sx, fz - sz) });
      }
    }
    // alfombra grande bajo los sillones del fondo
    this.deco('velvet', -21.3, 0.09, fz, 4.2, 0.015, 7.5, { mask: false, noShadow: true });
    // mesa para las botellas (props) y leña apilada
    this.box('woodDark', -20.5, 0.8, -87.0, 1.6, 0.08, 0.9, { mask: false });
    for (const [dx, dz] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) this.deco('woodDark', -20.5 + dx, 0.4, -87.0 + dz, 0.08, 0.8, 0.08, { mask: false });
    // pila de leña (modelos en castle-decor)
    this.woodpile = { x: -37.1, z: -98.6 };
    this.phys.box(-37.1, 0.3, -98.6, 0.75, 0.3, 0.45, 0, { mat: 'wood', paint: false });
    this.anchors.logs = new THREE.Vector3(-37.1, 0, -98.6);
    // pantalla: bastidor de madera (la imagen la pone el sistema de pantallas, ver SCREENS 'fogon')
    const sx = -38.45, sy = 3.2, sz = fz, sw = 7, sh = 3.9375;
    this.deco('blackWood', sx - 0.05, sy + sh / 2 + 0.12, sz, 0.14, 0.24, sw + 0.5, { mask: false });
    this.deco('blackWood', sx - 0.05, sy - sh / 2 - 0.12, sz, 0.14, 0.24, sw + 0.5, { mask: false });
    for (const s of [-1, 1]) this.box('blackWood', sx - 0.05, sy / 2 + 1.1, sz + s * (sw / 2 + 0.2), 0.18, sy + 2.2, 0.18, { mask: false });
    this.deco('black', sx - 0.14, sy, sz, 0.04, sh + 0.1, sw + 0.1, { mask: false, noShadow: true });
    // proyector viejo sobre cajones, apuntando a la pantalla
    const px = -17.4, pz = fz;
    this.box('woodDark', px, 0.45, pz, 0.9, 0.9, 0.9, { mask: false });
    this.deco('woodDark', px, 1.05, pz, 0.7, 0.3, 0.7, { mask: false });
    this.deco('iron', px, 1.4, pz, 0.55, 0.36, 0.3, { mask: false });
    this.cur.cylinder('iron', px - 0.38, 1.42, pz, 0.08, 0.1, 0.24, 12, { rz: Math.PI / 2 });
    for (const dx of [-0.14, 0.18]) this.cur.cylinder('iron', px + dx, 1.82, pz, 0.24, 0.24, 0.05, 20, { rx: Math.PI / 2 });
    this.anchors.projector = new THREE.Vector3(px - 0.5, 1.42, pz);
    this.anchors.screen = new THREE.Vector3(sx, sy, sz);
    this.cur = this.b;
  }

  // ---------------------------------------------------------------- patios: huerta (oeste) y cementerio (este)
  _yards() {
    const zw = KZ1; // límite con el patio de armas
    // muros bajos con portón de rejas al cementerio y arco a la huerta
    this.box('castleStone', (KX1 + 31.5) / 2, 0.7, zw, 31.5 - KX1, 1.4, 0.6);
    this.box('castleStone', (35.5 + CX1 - WT) / 2, 0.7, zw, CX1 - WT - 35.5, 1.4, 0.6);
    for (const x of [31.5, 35.5]) {
      this.box('castleStone', x, 1.6, zw, 0.9, 3.2, 0.9);
      const ball = new THREE.SphereGeometry(0.34, 12, 8);
      ball.translate(x, 3.5, zw);
      this.geo('keepStone', ball);
    }
    this.anchors.cemeteryGate = new THREE.Vector3(33.5, 0, zw);
    // rejas sobre los muros bajos
    for (const [xa, xb] of [[KX1 + 0.4, 31.0], [36.0, CX1 - WT - 0.3]]) {
      for (let x = xa; x <= xb; x += 0.28) {
        this.deco('iron', x, 2.0, zw, 0.04, 1.2, 0.04, { mask: false });
        const g = new THREE.ConeGeometry(0.045, 0.16, 4);
        g.translate(x, 2.68, zw);
        this.geo('iron', g);
      }
      this.deco('iron', (xa + xb) / 2, 2.45, zw, xb - xa, 0.05, 0.05, { mask: false });
      this.phys.box((xa + xb) / 2, 2.0, zw, (xb - xa) / 2, 0.6, 0.05, 0, { paint: false });
    }
    // huerta: muro con arco
    this.box('castleStone', (CX0 + WT + (-36.2)) / 2, 0.8, zw, -36.2 - (CX0 + WT), 1.6, 0.6);
    this.box('castleStone', (-31.8 + KX0) / 2, 0.8, zw, KX0 - (-31.8), 1.6, 0.6);
    for (const x of [-36.2, -31.8]) this.box('castleStone', x, 1.7, zw, 0.8, 3.4, 0.8);
    const arch = new THREE.TorusGeometry(2.2, 0.28, 8, 16, Math.PI);
    arch.translate(-34, 3.4, zw);
    this.geo('castleStone', arch);
    this.anchors.huerta = new THREE.Vector3(-34, 0, -116);
    this.anchors.cemetery = new THREE.Vector3(34, 0, -117);
  }

  // ---------------------------------------------------------------- el aljibe (reemplaza a la fuente de la explanada)
  _well() {
    const x = -21, z = -66.5;
    this.cyl('castleStone', x, 0.5, z, 1.25, 1.35, 1.0, 20, { collide: true, open: true });
    const lining = new THREE.CylinderGeometry(.95,.95,.88,32,1,true);
    const indices=lining.index, normals=lining.attributes.normal,uv=lining.attributes.uv;
    // Inside-facing triangles share the live PBR material with the well rim.
    for(let i=0;i<indices.count;i+=3){const a=indices.getX(i+1);indices.setX(i+1,indices.getX(i+2));indices.setX(i+2,a);}
    for(let i=0;i<normals.count;i++) {
      normals.setXYZ(i,-normals.getX(i),-normals.getY(i),-normals.getZ(i));
      uv.setXY(i,uv.getX(i)*Math.PI*1.9/3.2,uv.getY(i)*.88/3.2);
    }
    lining.translate(x,.56,z);this.geo('keepStone',lining);
    const lip = new THREE.RingGeometry(0.93, 1.3, 20);
    lip.rotateX(-Math.PI / 2);
    lip.translate(x, 1.0, z);
    this.geo('keepStone', lip);
    this.wellWater = wellWater(this.scene, x, z, .38);
    for (const s of [-1, 1]) this.box('woodDark', x + s * 1.15, 1.35, z, 0.18, 2.7, 0.18, { pmat: 'wood' });
    this.deco('woodDark', x, 2.62, z, 2.6, 0.16, 0.16, {});
    this.b.cylinder('woodDark', x, 2.05, z, 0.09, 0.09, 2.2, 10, { rz: Math.PI / 2 });
    this.deco('woodDark', x + 1.32, 2.05, z, 0.05, 0.05, 0.45, {});
    rope(this.scene, [[x,2.09,z+.08],[x+.015,1.63,z+.08],[x,1.11,z]], .018);
    const winding=[];
    for(let i=0;i<=48;i++) { const a=i/48*Math.PI*8; winding.push([x-.11+i/48*.22,2.05+Math.cos(a)*.106,z+Math.sin(a)*.106]); }
    rope(this.scene,winding,.015);
    for (const s of [1, -1]) this.box('slate', x, 3.0, z + s * 0.5, 2.9, 0.08, 1.2, { rx: s * 0.6 });
    this.anchors.well = new THREE.Vector3(x, 0, z);
    this.interact.push({ id: 'aljibe', k: 'haunt', ev: 'well', p: [x, 1.0, z], r: 2.3, label: 'Asomarse al aljibe' });
  }

  // ---------------------------------------------------------------- antorchas en las murallas y el portón
  _torches() {
    this.soot = this.soot || []; // [x, y, z, nx, nz, grande]: mancha de hollín en la pared (castle-stains.js)
    const t = (x, y, z, nx, nz, wall = 0.2) => {
      this.soot.push([x - nx * wall, y, z - nz * wall, nx, nz, 1]);
      this.deco('iron', x - nx * 0.1, y - 0.3, z - nz * 0.1, nx ? 0.3 : 0.1, 0.1, nz ? 0.3 : 0.1, { mask: false });
      const cup = new THREE.CylinderGeometry(0.12, 0.06, 0.22, 8);
      cup.translate(x, y, z);
      this.geo('iron', cup);
      this.fire3d(x, y + 0.04, z, 0.13, 0.13, 0.62, { wind: 1, speed: 1.3, intensity: 0.9 });
      this.world.embers?.add(x, y + 0.25, z, 5, { radius: 0.12, height: 1.6, strength: 0.6 });
      return this.light(x + nx * 0.4, y + 0.4, z + nz * 0.4, 0xff8a3a, 4.5, 11, { flicker: true, priority: 1.2 });
    };
    // portón (afuera) y patio (caras de adentro de la muralla)
    t(-4.45, 3.6, -74.4, 0, 1); t(4.45, 3.6, -74.4, 0, 1);
    t(-4.45, 3.6, -84.8, 0, -1); t(4.45, 3.6, -84.8, 0, -1);
    const iz = CZ1 - WT - 0.2, ix = CX1 - WT - 0.2, bz = CZ0 + WT + 0.2;
    for (const x of [-14, 14, 30]) t(x, 3.4, iz, 0, -1);
    for (const z of [-92, -118]) { t(-ix, 3.4, z, 1, 0); t(ix, 3.4, z, -1, 0); }
    for (const x of [-16, 16]) t(x, 3.4, bz, 0, 1);
    // puerta del torreón
    t(-2.9, F0 + 3.3, KZ1 + 0.3, 0, 1, 0.3); t(2.9, F0 + 3.3, KZ1 + 0.3, 0, 1, 0.3);
  }

  // ---------------------------------------------------------------- consultas
  // cuarto cerrado donde está un punto (el pool de luces no gasta luces de adentro si la cámara está afuera)
  roomOf(x, y, z) {
    for (const r of this.rooms) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && y > r.y0 && y < r.y1) return r.id;
    return 0;
  }
  indoorAt(x, y, z) {
    let indoor = 0, roofed = 0;
    for (const r of this.rooms) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && y > r.y0 && y < r.y1) { indoor = 1; break; }
    for (const r of this.roofs) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && y > r.y0 && y < r.y1) { roofed = 1; break; }
    return { indoor, roofed };
  }
  rainMask() {
    const m = this.mask;
    return { x0: m.x0, z0: m.z0, x1: m.x0 + m.w * m.res, z1: m.z0 + m.h * m.res, w: m.w, h: m.h, data: m.data };
  }
}
