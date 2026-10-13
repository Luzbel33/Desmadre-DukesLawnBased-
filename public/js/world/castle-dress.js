// Vestido del castillo: qué hay en cada cuarto y por qué (modelos CC0 de Poly Haven + piezas procedurales).
// Cada cuarto cuenta algo: el comedor quedó a mitad de una cena, la cocina todavía se usa, la biblioteca es el estudio de
// alguien que buscaba algo prohibido, el salón presume trofeos, la sala de retratos es un salón de té abandonado, el
// cuarto secreto es un altar y la cripta tiene barriles rotos y raíces que se metieron por el techo.
// Reglas: nada flota (todo se apoya en el piso, una mesa, un estante o cuelga de algo visible), lo repetido va
// instanciado (una llamada de dibujo por tipo y cuarto) y lo chico no proyecta sombra.
import * as THREE from 'three';
import { rng } from '../core/G.js';
import { CASTLE } from '../shared/mapdata.js';
import { whenAsset, assetBounds } from '../game/assets.js';
import { supportedMatrix } from '../game/placement.js';
import { UPPER_FLOOR } from './castle-expansion.js';

const F0 = CASTLE.keep.floor;
const HAS_DOM = typeof document !== 'undefined';
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const PI = Math.PI;
const TAU = PI * 2;

// matriz de un objeto: posición de su base, giro (yaw), escala y, si hace falta, inclinaciones (rx, rz)
function mx(x, y, z, yaw = 0, s = 1, o = {}) {
  _e.set(o.rx || 0, yaw, o.rz || 0, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(o.sx ?? s, o.sy ?? s, o.sz ?? s));
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ctex(cv, srgb = true) { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// ---------------------------------------------------------------- tanda de instancias (una por tipo y cuarto)
class Batch {
  constructor(d, roomId = null) { this.d = d; this.map = new Map(); this.roomId = roomId; }
  add(type, x, y, z, yaw = 0, s = 1, o = {}) {
    if (['c_chair', 'c_armchair'].includes(type) && y >= F0 - .05 && !o.rx && !o.rz) this.d.c.seats.push({x, y:y+(type==='c_chair'?.46:.48)*s, z, yaw});
    if (!this.map.has(type)) this.map.set(type, { mats: [], supports: [], shadow: false });
    const b = this.map.get(type);
    b.mats.push(mx(x, y, z, yaw, s, o));
    b.supports.push(o.ground ? { x, y, z, yaw, s, o } : null);
    if (o.shadow) b.shadow = true;
    return this;
  }
  // un modelo de alto `h` y ancho `w` acostado sobre su lado, con el centro en (cx, cz) apoyado en y
  lay(type, w, h, cx, y, cz, yaw = 0, o = {}) {
    return this.add(type, cx, y, cz, yaw, 1, { ...o, rz: PI / 2, ground: true });
  }
  // un modelo plano (cara hacia +z, espesor t, alto h) apoyado boca arriba con el centro en (cx, cz)
  flat(type, h, t, cx, y, cz, yaw = 0, o = {}) {
    return this.add(type, cx, y, cz, yaw, 1, { ...o, rx: -PI / 2, ground: true });
  }
  // un arma cruzada detrás de un escudo: gira alrededor de su punto medio (h = largo del modelo)
  cross(type, h, cx, cy, z, ang, s = 1) {
    return this.add(type, cx + Math.sin(ang) * (h * s) / 2, cy - Math.cos(ang) * (h * s) / 2, z, 0, s, { rz: ang });
  }
  flush() {
    const roomId = this.roomId;
    for (const [type, b] of this.map) whenAsset(type, () => {
      const bounds = assetBounds(type);
      b.supports.forEach((p, i) => {
        if (p && bounds) b.mats[i] = supportedMatrix(bounds, p.x, p.y, p.z, p.yaw, p.s, p.o);
      });
      this.d.instances(type, b.mats, { shadow: b.shadow, onReady: roomId == null ? null : meshes => { for (const m of meshes) m.userData.castleRoom = roomId; } });
    });
    this.map.clear();
  }
}

// ---------------------------------------------------------------- libros de mentira (instanciados, una sola llamada)
// Un atlas de 8 colores de cuero: por cada libro se elige la fila (aRow); el lomo tiene bandas doradas y etiqueta.
function bookAtlas() {
  const cv = canvas(256, 512), c = cv.getContext('2d');
  const r = rng(555);
  const cols = ['#5a1a1a', '#3a2418', '#6b4a2a', '#2f3d24', '#1f2a44', '#171412', '#4a2a3e', '#7a5a34'];
  for (let row = 0; row < 8; row++) {
    const y0 = row * 64, base = cols[row];
    for (let cell = 0; cell < 4; cell++) {
      const x0 = cell * 64;
      if (cell === 2 || cell === 3) { // páginas (arriba/abajo y el borde de adelante): crema con vetas
        c.fillStyle = '#cdbf9c'; c.fillRect(x0, y0, 64, 64);
        for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(90,70,40,${0.08 + r() * 0.1})`; c.fillRect(x0, y0 + r() * 64, 64, 1); }
        if (cell === 2) { c.fillStyle = base; c.fillRect(x0, y0, 5, 64); c.fillRect(x0 + 59, y0, 5, 64); }
        continue;
      }
      c.fillStyle = base; c.fillRect(x0, y0, 64, 64);
      for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.1})`; c.fillRect(x0 + r() * 64, y0 + r() * 64, 1 + r() * 3, 1 + r() * 3); }
      if (cell === 0) { // lomo: bandas doradas y etiqueta
        c.fillStyle = '#b8902a';
        for (const yy of [5, 9, 55, 59]) c.fillRect(x0, y0 + yy, 64, 2);
        c.fillStyle = '#d8c89a'; c.fillRect(x0 + 8, y0 + 18, 48, 22);
        c.fillStyle = 'rgba(40,20,10,0.75)'; for (let i = 0; i < 3; i++) c.fillRect(x0 + 12, y0 + 22 + i * 6, 24 + r() * 16, 2);
      }
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 3; c.strokeRect(x0 + 1, y0 + 1, 62, 62); // borde gastado
    }
  }
  return ctex(cv);
}
let BOOK = null;
function bookAssets() {
  if (BOOK || !HAS_DOM) return BOOK;
  const g = new THREE.BoxGeometry(1, 1, 1);
  // caras de la caja: +x, -x (tapas), +y, -y (páginas), +z (lomo), -z (corte de las páginas)
  const cell = [1, 1, 2, 2, 0, 3], uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v, u = uv.getX(i), w = uv.getY(i);
    uv.setXY(i, (cell[f] + 0.04 + u * 0.92) * 0.25, (0.04 + w * 0.92) * 0.125);
  }
  const mat = new THREE.MeshStandardMaterial({ map: bookAtlas(), roughness: 0.8 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aRow;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vMapUv.y += aRow * 0.125;');
  };
  mat.customProgramCacheKey = () => 'book-rows';
  BOOK = { g, mat };
  return BOOK;
}
// filas de libros en los estantes. Cada estante se describe en su propio marco (x a lo ancho, z hacia adelante) y se
// lleva al mundo con su posición y giro; `levels` son las alturas de las tablas y `gap` el alto libre sobre cada una.
const SHELF = { levels: [0.13, 0.47, 0.81, 1.16, 1.55, 2.01], gap: [0.29, 0.29, 0.3, 0.34, 0.41, 0.44], half: 0.7, back: -0.31 };
function shelfBooks(d, list, r, parent = null, roomId = null) {
  if (!HAS_DOM) return;
  const { g, mat } = bookAssets();
  const items = [];
  for (const s of list) {
    const co = Math.cos(s.yaw), si = Math.sin(s.yaw);
    const fill = s.fill ?? 0.9;
    for (let li = 0; li < SHELF.levels.length; li++) {
      const gap = SHELF.gap[li], y = s.y + SHELF.levels[li];
      let x = -SHELF.half;
      while (x < SHELF.half - 0.05) {
        if (r() > fill) { x += 0.06 + r() * 0.3; continue; } // hueco en la fila
        const t = 0.022 + r() * 0.04, h = Math.min(gap - 0.04, 0.17 + r() * 0.17), dep = 0.14 + r() * 0.08;
        const lean = r() < 0.05 ? (r() - 0.5) * 0.5 : (r() - 0.5) * 0.04;
        const lx = x + t / 2, lz = SHELF.back + dep / 2 + 0.012;
        const wx = s.local ? lx : s.x + lx * co + lz * si, wz = s.local ? lz : s.z - lx * si + lz * co;
        items.push({ x: wx, y: y + (h / 2) * Math.cos(lean), z: wz, yaw: s.local ? 0 : s.yaw, sx: t, sy: h, sz: dep, rz: lean, row: (r() * 8) | 0 });
        x += t + 0.002 + (r() < 0.04 ? 0.02 : 0);
      }
    }
  }
  if (!items.length) return;
  const geo = g.clone();
  geo.setAttribute('aRow', new THREE.InstancedBufferAttribute(new Float32Array(items.map((it) => it.row)), 1));
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => im.setMatrixAt(i, mx(it.x, it.y, it.z, it.yaw, 1, { sx: it.sx, sy: it.sy, sz: it.sz, rz: it.rz })));
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = false;
  im.receiveShadow = true;
  if (roomId != null) im.userData.castleRoom = roomId;
  if (parent) parent.add(im);
  else { im.matrixAutoUpdate = false; d.scene.add(im); }
  return im;
}

// ---------------------------------------------------------------- alfombras (dibujadas por código, gastadas y manchadas)
function rugCanvas(pal, seed) {
  const W = 512, H = 768, cv = canvas(W, H), c = cv.getContext('2d');
  const r = rng(seed);
  c.fillStyle = pal.border; c.fillRect(0, 0, W, H);
  c.fillStyle = pal.trim; c.fillRect(14, 14, W - 28, H - 28);
  c.fillStyle = pal.border; c.fillRect(22, 22, W - 44, H - 44);
  c.fillStyle = pal.accent;
  for (let i = 0; i < 30; i++) { c.fillRect(30 + i * ((W - 60) / 30), 30, 6, 10); c.fillRect(30 + i * ((W - 60) / 30), H - 40, 6, 10); }
  for (let i = 0; i < 46; i++) { c.fillRect(30, 30 + i * ((H - 60) / 46), 10, 6); c.fillRect(W - 40, 30 + i * ((H - 60) / 46), 10, 6); }
  c.fillStyle = pal.field; c.fillRect(58, 58, W - 116, H - 116);
  c.strokeStyle = pal.accent; c.lineWidth = 2; c.globalAlpha = 0.5;
  for (let y = 60; y < H - 60; y += 64) for (let x = 60; x < W - 60; x += 64) {
    c.beginPath(); c.moveTo(x + 32, y); c.lineTo(x + 64, y + 32); c.lineTo(x + 32, y + 64); c.lineTo(x, y + 32); c.closePath(); c.stroke();
  }
  c.globalAlpha = 1;
  c.save(); c.translate(W / 2, H / 2);
  for (const [rx, ry, col] of [[150, 210, pal.border], [130, 188, pal.accent], [112, 170, pal.field]]) { c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, PI * 2); c.fill(); }
  c.strokeStyle = pal.accent; c.lineWidth = 3;
  for (let i = 0; i < 8; i++) { c.rotate(PI / 4); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 165); c.stroke(); }
  c.fillStyle = pal.border; c.beginPath(); c.arc(0, 0, 34, 0, PI * 2); c.fill();
  c.fillStyle = pal.accent; c.beginPath(); c.arc(0, 0, 20, 0, PI * 2); c.fill();
  c.restore();
  // desgaste: el centro pisado, manchas oscuras y polvo
  const wear = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, H * 0.62);
  wear.addColorStop(0, 'rgba(170,150,120,0.22)'); wear.addColorStop(0.55, 'rgba(0,0,0,0)'); wear.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = wear; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) { c.fillStyle = `rgba(20,8,6,${0.12 + r() * 0.2})`; c.beginPath(); c.ellipse(r() * W, r() * H, 14 + r() * 40, 8 + r() * 26, r() * 3, 0, PI * 2); c.fill(); }
  for (let i = 0; i < 3500; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '200,180,150'},${r() * 0.08})`; c.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 3); }
  return cv;
}
const RUGS = {
  red: { field: '#5a1216', accent: '#c9a13b', border: '#1c1418', trim: '#8a6a3a' },
  blue: { field: '#1d2d3c', accent: '#b8a060', border: '#3a1214', trim: '#6a5a3a' },
  green: { field: '#26382a', accent: '#a08a48', border: '#2a1a14', trim: '#6a5a3a' },
  brown: { field: '#4a3020', accent: '#b08a50', border: '#180e0a', trim: '#7a5a34' },
};
function rug(d, x, z, w, l, kind = 'red', yaw = 0, seed = 1, floor = F0, roomId = null) {
  if (!HAS_DOM) return;
  const mat = new THREE.MeshStandardMaterial({ map: ctex(rugCanvas(RUGS[kind], seed * 77 + 5)), roughness: 1 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.018, l), mat);
  m.position.set(x, floor + 0.03, z);
  m.rotation.y = yaw;
  m.receiveShadow = true;
  if (roomId != null) m.userData.castleRoom = roomId;
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  d.scene.add(m);
}

// ---------------------------------------------------------------- cortinas de terciopelo (fusionadas al castillo)
// Paño con pliegues verticales: una grilla que se ondula y se oscurece en los valles.
function curtainGeo(w, h, folds) {
  const g = new THREE.PlaneGeometry(w, h, 24, 6);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / w + 0.5, v = pos.getY(i) / h + 0.5;
    const f = Math.sin(u * folds * PI * 2 + 0.6);
    pos.setZ(i, 0.05 + 0.055 * f * (0.4 + 0.6 * (1 - v)) + 0.02 * Math.sin(v * 6 + u * 9));
    const k = 0.62 + 0.38 * (0.5 + 0.5 * f);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
// along 'x': el muro corre en x y el cuarto queda hacia `dir` en z; 'z': el muro corre en z y el cuarto queda hacia `dir` en x.
// (cx, cz) es el centro del vano, ya corrido un poco hacia adentro; dos paños a los costados y la barra arriba.
function curtains(d, cx, cz, along, dir, y0, y1, gapHalf, r) {
  const h = y1 - y0;
  for (const side of [-1, 1]) {
    const w = 0.62 + r() * 0.12, off = side * (gapHalf + w / 2 + 0.03);
    const g = curtainGeo(w, h, 3.2 + r() * 0.8);
    if (along === 'x') { if (dir < 0) g.rotateY(PI); g.translate(cx + off, y0 + h / 2, cz); }
    else { g.rotateY(dir > 0 ? PI / 2 : -PI / 2); g.translate(cx, y0 + h / 2, cz + off); }
    d.c.b.geo('banner', g);
  }
  const rodW = gapHalf * 2 + 1.75;
  if (along === 'x') d.c.b.box('iron', cx, y1 + 0.06, cz + dir * 0.1, rodW, 0.04, 0.04, { collide: false, noShadow: true, mask: false });
  else d.c.b.box('iron', cx + dir * 0.1, y1 + 0.06, cz, 0.04, 0.04, rodW, { collide: false, noShadow: true, mask: false });
}

// ---------------------------------------------------------------- bolsas de harina o granos (lathe abollado)
function sackGeo(r, s = 1) {
  const prof = [[0.0, 0.0], [0.2, 0.01], [0.29, 0.1], [0.32, 0.22], [0.28, 0.36], [0.2, 0.46], [0.11, 0.52], [0.13, 0.57], [0.06, 0.62], [0.0, 0.6]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x * 0.85 * s, y * 0.85 * s)), 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 1 + 0.08 * Math.sin(p.getY(i) * 11 + p.getX(i) * 7 + r() * 0.2); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals();
  return g;
}
// algo cubierto con una sábana: caja abollada que cae hacia los bordes
function sheetGeo(w, h, dp, r) {
  const g = new THREE.BoxGeometry(w, h, dp, 10, 5, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const top = (y + h / 2) / h; // 0 abajo, 1 arriba
    const fx = Math.abs(x) / (w / 2), fz = Math.abs(z) / (dp / 2);
    const slump = Math.max(fx, fz);
    // arriba se redondea, abajo se abre (pliegues del paño en el suelo)
    x *= 1 + 0.12 * (1 - top) + 0.03 * Math.sin(z * 9 + y * 4);
    z *= 1 + 0.12 * (1 - top) + 0.03 * Math.sin(x * 9 + y * 5);
    y += -0.06 * slump * slump * top + 0.02 * Math.sin(x * 12 + z * 10 + r());
    p.setXYZ(i, x, y, z);
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  return g;
}

// ================================================================ el vestido
export function dressCastle(d) {
  const c = d.c, r = d.r;
  // colisionador de un mueble (caja apoyada en el piso `y`)
  const col = (x, y, z, w, h, dep, yaw = 0) => d.phys.box(x, y + h / 2, z, w / 2, h / 2, dep / 2, yaw, { paint: false });
  const rnd = (a, b) => a + r() * (b - a);
  const ctx = { d, c, r, col, rnd };
  dressHall(ctx);
  dressBalcony(ctx);
  dressDining(ctx);
  dressKitchen(ctx);
  dressLibrary(ctx);
  dressGallery(ctx);
  dressSecret(ctx);
  dressCrypt(ctx);
  dressYard(ctx);
  dressUpperCastle(ctx);
  dressTowerRooms(ctx);
  c.b.finish(d.scene);
}

// ---------------------------------------------------------------- inhabited upper storey
function dressUpperCastle({ d, c, r, col }) {
  const B = new Batch(d, 121), y = UPPER_FLOOR;
  const lamp = (x, sy, z, scale = 1) => {
    B.add('c_oillamp', x, sy, z, 0, scale);
    c.flame(x, sy + 0.5 * scale, z, 0.035, 0.095, {});
    c.light(x, sy + 0.65 * scale, z, 0xffbf80, 3.8, 7, { flicker: true, priority: 1.5 });
  };
  const chair = (x, z, yaw) => { B.add('c_armchair', x, y, z, yaw, 1, { shadow: true }); col(x, y, z, 0.8, 0.75, 0.8, yaw); };
  // The count's room: four-poster bed, dressing area and an interrupted game.
  rug(d, -17.5, -120.1, 6.2, 7.6, 'red', 0, 31, y, 121);
  c.box('blackWood', -18.5, y + 0.18, -123.1, 2.45, 0.36, 2.8, { mask: false });
  c.deco('oldWood', -18.5, y + 0.31, -121.66, 2.5, 0.18, 0.12, { mask: false });
  B.add('c_bed', -18.5, y + 0.36, -123.1, 0, 1, { shadow: true }); col(-18.5, y, -123.1, 2.45, 1.0, 2.8);
  for (const x of [-19.72, -17.28]) for (const z of [-124.54, -121.66]) {
    c.cyl('blackWood', x, y + 1.42, z, 0.055, 0.075, 2.84, 8, { mask: false });
    c.cyl('bronze', x, y + 2.88, z, 0.085, 0.065, 0.12, 8, { mask: false });
  }
  for (const z of [-124.54, -121.66]) c.deco('blackWood', -18.5, y + 2.8, z, 2.55, 0.15, 0.12, { mask: false });
  for (const x of [-19.72, -17.28]) c.deco('blackWood', x, y + 2.8, -123.1, 0.12, 0.15, 3.0, { mask: false });
  const canopy = curtainGeo(2.45, 2.85, 12); canopy.rotateX(-PI / 2); canopy.translate(-18.5, y + 2.78, -123.1); c.b.geo('velvet', canopy);
  for (const x of [-20.35, -16.65]) { B.add('c_nightstand', x, y, -124, 0, 1, { shadow: true }); col(x, y, -124, 0.55, 0.7, 0.55); lamp(x, y + 0.7, -124, 0.8); }
  B.add('c_commode', -22.8, y, -118.0, PI / 2, 1, { shadow: true }); col(-22.8, y, -118, 0.7, 1.2, 1.3);
  B.add('c_frame_stand', -22.75, y + 1.21, -118, PI / 2, 1).add('c_vase_b3', -22.75, y + 1.21, -118.4, 0, 1);
  B.add('c_roundtable', -14, y, -118.1, 0, 1, { shadow: true }); col(-14, y, -118.1, 0.9, 0.75, 0.9);
  // el ajedrez de la mesa es jugable: lo arma game/chess.js (CHESS_BOARDS en shared/mapdata.js)
  chair(-15.3, -118.1, PI / 2); chair(-12.7, -118.1, -PI / 2);
  wallChart(d, 'lineage', -18.5, y + 3.83, -125.59, 0, 1.05, 1.15, 121);
  curtains(d, -23.72, -124, 'z', 1, y + 0.05, 14.5, 0.7, r);
  B.flush(); B.roomId = 122;

  // Cartography: navigable worktable, brass armillary and map drawers. The map
  // depicts this castle, so the room doubles as an in-world orientation aid.
  rug(d, -16.8, -109.6, 8.5, 6.5, 'blue', 0, 32, y, 122);
  c.box('oldWood', -20.2, y + 0.91, -110.2, 3.2, 0.12, 2.05, { mask: false });
  for (const x of [-21.55, -18.85]) for (const z of [-110.95, -109.45]) c.box('blackWood', x, y + 0.44, z, 0.14, 0.88, 0.14, { mask: false });
  castleMap(d, -20.2, y + 0.977, -110.2, 2.5, 1.64);
  B.add('c_compass', -19, y + 0.97, -109.7, 0.4, 1).add('c_specs', -19.2, y + 0.97, -110.6, 0.5, 1);
  lamp(-21.3, y + 0.97, -110.7, 0.85);
  chair(-20.1, -108.7, PI);
  for (const x of [-22.4, -20.5]) { B.add('c_drawer', x, y, -114.25, 0, 1.4, { shadow: true }); col(x, y, -114.25, 1.2, 0.77, 0.65); }
  B.lay('c_book_a', 0, 0, -20.4, y + 0.78, -114.25, 0.15).add('c_horsestat', -22.4, y + 0.78, -114.25, 0.6, 1);
  B.add('c_daybed', -13.5, y, -104.95, PI, 1, { shadow: true }); col(-13.5, y, -104.95, 2.1, 0.7, 0.8);
  wallChart(d, 'stars', -23.63, y + 2.65, -110.2, PI / 2, 2.8, 2.1, 122);
  const mapShelves = [-15, -17].map(x => ({ x, y, z: -114.3, yaw: 0, fill: 0.72 }));
  for (const s of mapShelves) { B.add('c_bookshelf', s.x, y, s.z, 0, 1, { shadow: true }); col(s.x, y, s.z, 1.6, 2.5, 0.65); }
  shelfBooks(d, mapShelves, r, null, 122);
  curtains(d, -17.3, -104.28, 'x', -1, y + 0.05, 14.55, 0.7, r);
  B.flush(); B.roomId = 123;

  // The apothecary's bench is used, with a microscope, labelled glass and
  // hanging roots; clear circulation stays along the west and south edges.
  rug(d, 17.6, -121, 6.5, 6.5, 'green', 0, 33, y, 123);
  c.box('oldWood', 18.1, y + 0.93, -123.1, 4.4, 0.14, 1.25, { mask: false });
  for (const x of [16.2, 20]) for (const z of [-123.55, -122.65]) c.box('blackWood', x, y + 0.45, z, 0.15, 0.9, 0.15, { mask: false });
  B.add('c_microscope', 18.1, y + 1, -123.1, 0.3, 1).add('c_bowl', 16.8, y + 1, -123.1, 0.3, 1);
  B.add('c_jug', 19.7, y + 1, -123.1, 0.5, 0.7).add('c_specs', 18.8, y + 1, -122.7, 0.5, 1);
  B.lay('c_book_b', 0, 0, 17.2, y + 1, -122.75, -0.2); lamp(16.15, y + 1, -123.25, 0.85);
  B.add('c_stool2', 18.1, y, -121.7, PI, 1, { shadow: true });
  for (const x of [12.2, 14.2]) { B.add('c_cabinet2', x, y, -125.1, 0, 1, { shadow: true }); col(x, y, -125.1, 1.3, 1.8, 0.65); }
  for (const [x, type] of [[21.9, 'c_vase_c'], [22.6, 'c_pots'], [21.1, 'c_basket1']]) B.add(type, x, y, -119.2, x, 1, { shadow: true });
  wallChart(d, 'botany', 23.62, y + 2.6, -121.1, -PI / 2, 1.9, 2.2, 123);
  for (const sy of [1.8, 2.5, 3.2]) {
    c.box('oldWood', 17.2, y + sy, -125.35, 3.6, 0.08, 0.58, { mask: false });
    for (const x of [15.6, 18.8]) c.deco('iron', x, y + sy - 0.13, -125.51, 0.04, 0.25, 0.3, { mask: false });
  }
  apothecaryBottles(d, y);
  for (const x of [20.4, 21.1, 21.8]) {
    c.cyl('hemp', x, y + 3.5, -124.3, 0.011, 0.011, 1.8, 5, { mask: false });
    B.add('c_branches', x, y + 2.35, -124.3, x, 0.22, { rx: PI, ground: true });
  }
  B.add('c_daybed', 21.9, y, -116.1, PI, 1, { shadow: true }); col(21.9, y, -116.1, 2.1, 0.7, 0.8);
  for (const z of [-118, -124]) curtains(d, 23.72, z, 'z', -1, y + 0.05, 14.5, 0.7, r);
  B.flush(); B.roomId = 124;

  // Armoury: weapons are mounted with grips down; the table holds maintenance
  // tools and a shield. Nothing is a fake new pickup or displaces the real arsenal.
  rug(d, 16.7, -109.6, 7.5, 5.8, 'brown', 0, 34, y, 124);
  for (const x of [15.3, 18.6, 21.3]) {
    B.add('c_shield', x, y + 1.6, -114.65, 0, 1);
    B.cross('c_estoc', 1.49, x, y + 2.3, -114.68, 0.68).cross('c_mace', 0.63, x, y + 2.3, -114.7, -0.7, 1.2);
  }
  B.add('c_console', 18.5, y, -106.0, PI, 1.2, { shadow: true }); col(18.5, y, -106, 1.85, 1.14, 0.72);
  B.add('c_hatchet', 18.1, y + 1.14, -106.1, 0.7, 0.9, { ground: true, rx: -PI / 2 });
  B.add('c_mclock', 18.8, y + 1.14, -106, PI, 1); lamp(17.8, y + 1.14, -106, 0.8);
  B.add('c_commode', 22.8, y, -111, -PI / 2, 1, { shadow: true }); col(22.8, y, -111, 0.7, 1.2, 1.3);
  chair(13.5, -108, 0.5); B.add('c_footstool', 14.4, y, -107.6, 0.5, 1);
  B.add('c_bullhead', 18.5, y + 3.3, -114.65, 0, 1.3);
  curtains(d, 17.3, -104.28, 'x', -1, y + 0.05, 14.55, 0.7, r);
  B.flush(); B.roomId = 125;

  // Archive: a narrow central study with an unobstructed east/west crossing.
  const shelves = [];
  for (const x of [-1.8, 0.05, 1.9]) {
    B.add('c_bookshelf', x, y, -125.17, 0, 1, { shadow: true }); col(x, y, -125.17, 1.6, 2.5, 0.65);
    shelves.push({ x, y, z: -125.17, yaw: 0, fill: 0.75 });
  }
  shelfBooks(d, shelves, r, null, 125);
  rug(d, 2.1, -120.35, 5.6, 2, 'red', 0, 35, y, 125);
  B.add('c_nightstand', 6.8, y, -117.85, PI, 1, { shadow: true }); col(6.8, y, -117.85, 0.6, 0.7, 0.6); lamp(6.8, y + 0.7, -117.85, 0.8);
  B.lay('c_book_b', 0, 0, 4.65, y + 1.41, -124.32, 0.25).flat('c_pocketwatch', 0, 0, 5.35, y + 1.41, -124.34, 0.4);
  B.add('c_candlestick', -2.6, y, -121.65, 0, 1.3); c.flame(-2.6, y + 0.325, -121.65, 0.035, 0.1, {});
  wallChart(d, 'archive', 4.8, y + 2.9, -125.66, 0, 2.0, 1.65, 125);
  upperPlaque(d, 'EL CONDE NUNCA DUERME', 4.8, y + 1.03, -124.82, 0, 125);
  B.flush();
}

function castleMap(d, x, y, z, w, h) {
  if (!HAS_DOM) return;
  const cv = canvas(768, 512), ctx = cv.getContext('2d'), r = rng(1947);
  ctx.fillStyle = '#bba77b'; ctx.fillRect(0, 0, 768, 512);
  for (let i = 0; i < 2400; i++) { ctx.fillStyle = `rgba(49,29,15,${r() * 0.08})`; ctx.fillRect(r() * 768, r() * 512, 2 + r() * 8, 1 + r() * 4); }
  ctx.strokeStyle = '#554632'; ctx.lineWidth = 3; ctx.strokeRect(18, 18, 732, 476);
  ctx.textAlign = 'center'; ctx.fillStyle = '#453525'; ctx.font = '24px Georgia'; ctx.fillText('DOMINIOS DEL CONDE', 384, 60);
  ctx.lineWidth = 11; ctx.strokeRect(142, 113, 484, 281);
  for (const cx of [142, 626]) for (const cy of [113, 394]) { ctx.fillStyle = '#bba77b'; ctx.beginPath(); ctx.arc(cx, cy, 26, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.lineWidth = 4; ctx.strokeRect(248, 147, 275, 119); ctx.strokeRect(172, 293, 137, 61);
  ctx.beginPath(); ctx.moveTo(369, 394); ctx.lineTo(369, 435); ctx.moveTo(399, 394); ctx.lineTo(399, 435); ctx.stroke();
  ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(384, 420); ctx.lineTo(384, 266); ctx.stroke(); ctx.setLineDash([]);
  ctx.font = '17px Georgia'; ctx.fillText('TORREÓN', 385, 208); ctx.fillText('FOGÓN', 240, 330); ctx.fillText('N', 685, 133);
  ctx.beginPath(); ctx.moveTo(685, 150); ctx.lineTo(685, 190); ctx.moveTo(676, 160); ctx.lineTo(685, 146); ctx.lineTo(694, 160); ctx.stroke();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: ctex(cv), roughness: 1 }));
  mesh.rotation.x = -PI / 2; mesh.position.set(x, y, z); mesh.updateMatrix(); mesh.matrixAutoUpdate = false; mesh.userData.castleRoom = 122; d.scene.add(mesh);
}

function upperPlaque(d, text, x, y, z, yaw, roomId) {
  if (!HAS_DOM) return;
  const cv = canvas(512, 96), ctx = cv.getContext('2d');
  ctx.fillStyle = '#251b14'; ctx.fillRect(0, 0, 512, 96); ctx.strokeStyle = '#9b8053'; ctx.lineWidth = 3; ctx.strokeRect(8, 8, 496, 80);
  ctx.fillStyle = '#cfb88b'; ctx.font = '30px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 48);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.25), new THREE.MeshStandardMaterial({ map: ctex(cv), roughness: 0.85 }));
  m.position.set(x, y, z); m.rotation.y = yaw; m.updateMatrix(); m.matrixAutoUpdate = false; m.userData.castleRoom = roomId; d.scene.add(m);
}

function wallChart(d, kind, x, y, z, yaw, width, height, roomId) {
  if (!HAS_DOM) return;
  const cv = canvas(768, 768), ctx = cv.getContext('2d'), rand = rng(893 + roomId);
  const night = kind === 'stars';
  ctx.fillStyle = night ? '#182832' : '#baaa81'; ctx.fillRect(0, 0, 768, 768);
  for (let i = 0; i < 5000; i++) { ctx.fillStyle = `rgba(${night ? '191,166,111' : '61,36,17'},${rand() * 0.09})`; ctx.fillRect(rand() * 768, rand() * 768, 1 + rand() * 5, 1 + rand() * 3); }
  ctx.strokeStyle = night ? '#9a895f' : '#675139'; ctx.fillStyle = night ? '#cbb985' : '#493a26'; ctx.lineWidth = 3;
  ctx.strokeRect(27, 27, 714, 714); ctx.strokeRect(36, 36, 696, 696);
  ctx.textAlign = 'center'; ctx.font = '31px Georgia';
  const titles = { stars: 'ATLAS DEL CIELO NOCTURNO', botany: 'HERBARIO · XII', lineage: 'LA CASA DEL CONDE', archive: 'REGISTRO DE CAMPANAS' };
  ctx.fillText(titles[kind], 384, 85);
  ctx.font = '17px Georgia'; ctx.fillText(kind === 'stars' ? 'CARTOGRAFÍA DE LA NOCHE ETERNA' : 'ARCHIVO PRIVADO · CASTILLO DEL TERROR', 384, 115);
  if (kind === 'stars') {
    for (const r of [110, 200, 280]) { ctx.beginPath(); ctx.arc(384, 425, r, 0, TAU); ctx.stroke(); }
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) { const a = i * TAU / 24; ctx.beginPath(); ctx.moveTo(384 + Math.cos(a) * 110, 425 + Math.sin(a) * 110); ctx.lineTo(384 + Math.cos(a) * 280, 425 + Math.sin(a) * 280); ctx.stroke(); }
    for (let i = 0; i < 140; i++) { const a = rand() * TAU, r = Math.sqrt(rand()) * 266; ctx.beginPath(); ctx.arc(384 + Math.cos(a) * r, 425 + Math.sin(a) * r, 1 + rand() * 2.3, 0, TAU); ctx.fill(); }
    ctx.lineWidth = 2.5;
    for (const points of [[[216,336],[271,294],[330,322],[349,377],[299,431]], [[467,505],[520,468],[553,403],[604,411]], [[382,609],[413,566],[469,590]]]) { ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
  } else if (kind === 'botany') {
    for (let k = 0; k < 3; k++) {
      const bx = 171 + k * 211;
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bx, 632); ctx.bezierCurveTo(bx - 29, 504, bx + 22, 346, bx - 10, 205); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const by = 260 + i * 43, side = i % 2 ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(bx, by + 25); ctx.bezierCurveTo(bx + side * 40, by + 9, bx + side * 68, by - 30, bx + side * 41, by - 31); ctx.bezierCurveTo(bx + side * 7, by - 34, bx + side * 12, by + 17, bx, by + 25); ctx.stroke();
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, by + 23); ctx.lineTo(bx + side * 41, by - 28); ctx.stroke(); ctx.lineWidth = 3;
      }
      ctx.font = '21px Georgia'; ctx.fillText(['SALVIA', 'ROMERO', 'AJENJO'][k], bx, 687);
    }
  } else if (kind === 'lineage') {
    const nodes = [[384,218],[239,385],[529,385],[151,572],[327,572],[460,572],[637,572]];
    for (const [a, b] of [[0,1],[0,2],[1,3],[1,4],[2,5],[2,6]]) { ctx.beginPath(); ctx.moveTo(...nodes[a]); ctx.lineTo(...nodes[b]); ctx.stroke(); }
    nodes.forEach(([cx, cy], i) => { ctx.fillStyle = '#a8956d'; ctx.beginPath(); ctx.ellipse(cx, cy, 55, 63, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#493a26'; ctx.font = '25px Georgia'; ctx.fillText(['I','II','III','IV','V','VI','VII'][i], cx, cy + 10); });
    ctx.font = '23px Georgia'; ctx.fillText('NADIE ABANDONA ESTA CASA', 384, 697);
  } else {
    ctx.font = '22px Georgia'; ctx.textAlign = 'left';
    for (const [i, line] of ['TORRE OESTE        00 : 00', 'TORRE DEL HUERTO   03 : 00', 'TORRE DE DIFUNTOS  06 : 00', 'TORRE DEL VIGÍA    09 : 00'].entries()) { const py = 240 + i * 100; ctx.fillText(line, 107, py); ctx.beginPath(); ctx.moveTo(107, py + 19); ctx.lineTo(662, py + 19); ctx.stroke(); }
    ctx.textAlign = 'center'; ctx.font = '24px Georgia'; ctx.fillText('SI RESPONDEN, NO VUELVAS A TOCAR.', 384, 676);
  }
  const mat = new THREE.MeshStandardMaterial({ map: ctex(cv), roughness: 0.93, emissive: night ? 0x5d7691 : 0x9b814b, emissiveIntensity: 0.035 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.position.set(x, y, z); mesh.rotation.y = yaw; mesh.updateMatrix(); mesh.matrixAutoUpdate = false; mesh.userData.castleRoom = roomId; d.scene.add(mesh);
  const co = Math.cos(yaw), si = Math.sin(yaw);
  for (const sx of [-1, 1]) d.c.deco('blackWood', x + co * sx * (width / 2 + 0.035), y, z - si * sx * (width / 2 + 0.035), 0.07, height + 0.14, 0.07, { yaw, mask: false });
  for (const sy of [-1, 1]) d.c.deco('blackWood', x, y + sy * (height / 2 + 0.035), z, width + 0.14, 0.07, 0.07, { yaw, mask: false });
}

function apothecaryBottles(d, floor) {
  const points = [[0, 0], [0.065, 0], [0.073, 0.025], [0.073, 0.18], [0.029, 0.23], [0.027, 0.30], [0, 0.30]].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(points, 12);
  for (const [k, color] of [0x5c8761, 0x9b602c, 0x647f87].entries()) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.23, metalness: 0.18 });
    const im = new THREE.InstancedMesh(geo, mat, 9);
    for (let i = 0; i < 9; i++) {
      const level = Math.floor(i / 3), j = i % 3, x = 15.9 + j * 0.98 + k * 0.22, y = floor + 1.84 + level * 0.7, z = -125.23;
      const scale = 0.85 + ((i + k) % 3) * 0.15;
      im.setMatrixAt(i, mx(x, y, z, i, scale));
      d.c.deco('woodDark', x, y + 0.30 * scale, z, 0.048 * scale, 0.05, 0.048 * scale, { mask: false });
    }
    im.receiveShadow = true; im.userData.castleRoom = 123; im.updateMatrix(); im.matrixAutoUpdate = false; d.scene.add(im);
    // los frascos se pueden reventar en un susto (game/haunt-upper.js)
    (d.c.potionShelves ||= []).push({ im, list: Array.from({ length: 9 }, (_, i) => ({ i, pos: new THREE.Vector3(15.9 + (i % 3) * 0.98 + k * 0.22, floor + 1.84 + Math.floor(i / 3) * 0.7 + 0.15, -125.1) })) });
  }
}

function dressTowerRooms({ d, c, col }) {
  const B = new Batch(d);
  for (const tower of c.towerRooms || []) {
    const { x, z, floor: y, inward, corner, id } = tower;
    if (!corner) {
      B.add('c_winebarrel', x + Math.sign(x) * 0.7, y, z, 0, 1, { shadow: true });
      B.add('c_stool2', x, y, z + 1.25, 0, 1, { shadow: true });
      B.add('c_shield', x + Math.sign(x) * 1.5, y + 0.3, z + 1.65, PI, 1);
      continue;
    }
    // Each central nook has a purpose; spiral circulation occupies the outer ring.
    const a = inward + PI, px = x + Math.sin(a) * 1.18, pz = z + Math.cos(a) * 1.18;
    if (id === 400) {
      B.add('c_winebarrel', px, y, pz, 0, 0.9, { shadow: true }); col(px, y, pz, 0.65, 0.95, 0.65);
      B.add('c_jug', px, y + 1.02, pz, 0, 0.7);
    } else if (id === 401) {
      B.add('c_pots', px, y, pz, 0, 1, { shadow: true }).add('c_basket2', x - Math.sin(a) * 1.0, y, z - Math.cos(a) * 1.0, 1, 1);
    } else if (id === 402) {
      B.add('c_shield', px, y + 0.2, pz, inward, 1).add('c_mace', px + 0.35, y, pz, inward, 1);
    } else {
      B.add('c_skull', px, y + 0.52, pz, inward, 1);
      c.box('keepStone', px, y + 0.25, pz, 0.68, 0.5, 0.65, { mask: false });
      B.add('c_candlestick', px + 0.43, y, pz, 0, 1); c.flame(px + 0.43, y + 0.25, pz, 0.04, 0.11, {});
    }
    B.add('c_oillamp', x, 11.05, z, 0, 1.5);
    c.flame(x, 11.8, z, 0.055, 0.17, {});
    c.light(x, 12, z, 0xffc78a, 5, 8, { flicker: true, priority: 1.5 });
  }
  B.flush();
}

// ---------------------------------------------------------------- salón (101): entrada, trofeos, alfombra de pasillo
function dressHall({ d, c, r, col }) {
  const B = new Batch(d);
  rug(d, 0, -109.4, 3.3, 9.4, 'red', 0, 1); // desde la puerta hasta el pie del balcón
  // dos sofás bajo los ventanales del frente, de espaldas al muro
  for (const x of [-4.6, 4.6]) { B.add('c_sofa3', x, F0, -104.7, PI, 1, { shadow: true }); col(x, F0, -104.7, 2.6, 0.9, 0.9); }
  // consola bajo el espejo con floreros y el reloj de bolsillo
  B.add('c_console', 7.4, F0, -106.3, -PI / 2, 1, { shadow: true });
  col(7.4, F0, -106.3, 0.59, 0.95, 1.54);
  B.add('c_vase_a', 7.4, F0 + 0.95, -105.65, 0, 1).add('c_vase_b3', 7.4, F0 + 0.95, -106.95, 0, 1.4);
  B.flat('c_pocketwatch', 0.08, 0.014, 7.32, F0 + 0.95, -106.3, 0.6);
  // trofeos en el muro del fondo: cabeza de toro sobre la puerta, escudo con armas cruzadas y cabeza de león
  B.add('c_bullhead', 3.0, F0 + 3.55, -116.36, 0, 1.15);
  B.cross('c_estoc', 1.49, -2.85, F0 + 2.5, -116.42, PI / 4.2).cross('c_mace', 0.63, -2.85, F0 + 2.5, -116.42, -PI / 3.4, 1.15);
  B.add('c_shield', -2.85, F0 + 1.75, -116.4, 0, 1);
  B.add('c_lionhead', 6.7, F0 + 2.95, -116.38, 0, 1.1);
  B.cross('c_warhammer', 0.71, 6.7, F0 + 2.1, -116.44, PI / 5).cross('c_saber', 0.94, 6.7, F0 + 2.1, -116.44, -PI / 5);
  // linternas colgadas de la panza del balcón
  for (const x of [-1.6, 5.0]) {
    c.b.cylinder('iron', x, F0 + 3.55, -115.3, 0.012, 0.012, 1.0, 5, { collide: false, noShadow: true, mask: false });
    B.add('c_lchand', x, F0 + 2.62, -115.3, 0, 0.9);
    c.flame(x, F0 + 2.84, -115.3, 0.05, 0.1, {});
  }
  // una silla volcada al pie de la escalera
  B.add('c_chair', -3.9, F0 + 0.02, -111.4, 0.7, 1, { rx: -PI / 2 + 0.12, ground: true });
  B.flush();
}

// Galería superior EXISTENTE: rincón de lectura, archivos y velas sobre el balcón.
// Una franja de 1.25 m queda libre frente a todo el mobiliario y a la escalera.
function dressBalcony({ d, c, r, col }) {
  const B = new Batch(d), y = 8;
  rug(d, 1.0, -115.2, 6.5, 0.65, 'red', 0, 8, y);
  B.add('c_console', 0.8, y, -116.12, 0, 0.7, { shadow: true });
  col(0.8, y, -116.12, 1.08, 0.665, 0.41);
  B.add('c_oillamp', 1.12, y + 0.665, -116.12, 0, 0.7);
  B.lay('c_book_a', 0, 0, 0.45, y + 0.665, -116.12, 0.2);
  B.add('c_stool2', 2.1, y, -116.0, 0, 0.8, { shadow: true });
  col(2.1, y, -116.0, 0.38, 0.44, 0.38);
  B.add('c_drawer', 6.6, y, -116.05, 0, 0.8, { shadow: true });
  col(6.6, y, -116.05, 0.69, 0.44, 0.37);
  B.add('c_vase_c2', 6.65, y + 0.44, -116.05, 0, 0.8);
  B.flush();
  c.flame(1.12, y + 1.015, -116.12, 0.035, 0.08, {});
  c.light(1.12, y + 1.25, -115.9, 0xffc78b, 5, 7, { flicker: true, priority: 1.4 });
  c.seats.push({ x: 2.1, y: y + 0.44, z: -116.0, yaw: -PI / 2 });
}

// ---------------------------------------------------------------- comedor (103): la cena quedó a medias
function dressDining({ d, c, r, col, rnd }) {
  const B = new Batch(d);
  const TOP = F0 + 0.85; // mantel
  rug(d, -16, -109.5, 8.7, 3.7, 'blue', 0, 2);
  // una copa frente a cada plato (algunas caídas) y fruta a medio comer
  const xs = [-18.75, -17.65, -16.55, -15.45, -14.35, -13.25];
  xs.forEach((x, i) => {
    for (const s of [-1, 1]) {
      const z = -109.5 + s * 0.31, k = 'c_goblet_' + 'abc'[(i + (s > 0 ? 1 : 0)) % 3];
      if ((i === 2 && s > 0) || (i === 4 && s < 0)) B.lay(k, 0.15, 0.27, x + 0.28, TOP, z + s * 0.08, r() * 6);
      else B.add(k, x + 0.22, TOP, z, 0, 1);
      const zp = -109.5 + s * 0.45, roll = (i * 3 + (s > 0 ? 5 : 0) + 2) % 7;
      if (roll < 2) B.add('c_apple', x + rnd(-0.03, 0.03), TOP + 0.02, zp, r() * 6, 1);
      else if (roll < 3) B.add('c_pear', x, TOP + 0.02, zp, r() * 6, 1);
      else if (roll < 4) B.add('c_lemon', x, TOP + 0.02, zp, r() * 6, 1);
    }
  });
  B.add('c_jug', -19.3, TOP, -109.5, 0.6, 1).add('c_metaljug', -14.95, TOP, -109.5, 0, 1).add('c_teapot', -12.85, TOP, -109.1, 2.2, 1);
  B.add('c_bowl', -17.1, TOP, -109.5, 0, 1);
  for (const [dx, dz] of [[-0.05, 0.02], [0.06, -0.04], [0.0, 0.07]]) B.add('c_apple', -17.1 + dx, TOP + 0.03, -109.5 + dz, r() * 6, 1);
  B.add('c_plate', -12.95, TOP, -109.9, 0, 1).add('c_onion', -12.98, TOP + 0.038, -109.92, 1, 1).add('c_onion', -12.9, TOP + 0.038, -109.86, 2, 1);
  B.add('c_spoon', -15.2, TOP, -108.95, 1.3, 1); // se les cayó
  // vino derramado sobre el mantel
  if (HAS_DOM) {
    const spill = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), new THREE.MeshStandardMaterial({ color: 0x3a0508, roughness: 0.18, metalness: 0.1 }));
    spill.rotation.x = -PI / 2; spill.scale.set(1.5, 1, 1); spill.position.set(-16.3, TOP + 0.004, -109.16);
    d.scene.add(spill);
  }
  // aparador contra el frente (entre las ventanas): reloj de repisa, florero y vela; un cuadro arriba
  B.add('c_console', -16.5, F0, -104.5, PI, 1, { shadow: true });
  col(-16.5, F0, -104.5, 1.54, 0.95, 0.59);
  B.add('c_mclock', -16.5, F0 + 0.95, -104.5, PI, 1).add('c_vase_a', -17.15, F0 + 0.95, -104.5, 0, 1).add('c_candlestick', -15.9, F0 + 0.95, -104.5, 0, 1);
  c.flame(-15.9, F0 + 0.95 + 0.25, -104.5, 0.03, 0.07, {});
  B.add('c_frame2', -16.5, F0 + 2.0, -104.22, PI, 1.25);
  // cómoda contra el tabique del salón, con floreros y un retrato de mesa
  B.add('c_commode', -8.62, F0, -112.2, -PI / 2, 1, { shadow: true });
  col(-8.62, F0, -112.2, 0.58, 1.21, 1.2);
  B.add('c_vase_c', -8.6, F0 + 1.21, -111.7, 0, 1).add('c_vase_c2', -8.6, F0 + 1.21, -112.7, 0, 1).add('c_frame_stand', -8.7, F0 + 1.21, -112.2, -PI / 2 + 0.3, 1);
  B.add('c_frame3', -8.34, F0 + 2.05, -112.2, -PI / 2, 1.2);
  // repisa del hogar: reloj, florero y caballito; arriba, la cabeza de toro
  B.add('c_mclock', -23.05, F0 + 2.125, -109.5, PI / 2, 1.1).add('c_vase_c2', -23.05, F0 + 2.125, -110.4, 0, 1).add('c_horsestat', -23.05, F0 + 2.125, -108.65, PI / 2, 1);
  B.add('c_bullhead', -23.66, F0 + 2.85, -109.5, PI / 2, 1.35);
  // araña de luces sobre la mesa: cadena hasta el cielorraso y velas encendidas
  c.b.cylinder('iron', -16, F0 + 4.7, -109.5, 0.014, 0.014, 2.3, 5, { collide: false, noShadow: true, mask: false });
  B.add('c_chand1', -16, F0 + 3.55, -109.5, 0.4, 1.25);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * PI * 2; c.flame(-16 + Math.cos(a) * 0.4, F0 + 3.97, -109.5 + Math.sin(a) * 0.4, 0.05, 0.1, {}); }
  c.light(-16, F0 + 3.4, -109.5, 0xffb060, 5, 10, { flicker: true, priority: 1.3 });
  // cortinas: ventanas del frente (el cuarto queda hacia -z) y del oeste (hacia +x)
  for (const x of [-20.5, -12.5]) curtains(d, x, -104.25, 'x', -1, F0 + 0.05, F0 + 5.5, 0.75, r);
  for (const z of [-106.2, -112.8]) curtains(d, -23.75, z, 'z', 1, F0 + 0.05, F0 + 5.5, 0.75, r);
  B.flush();
}

// ---------------------------------------------------------------- cocina (104): todavía se cocina algo
function dressKitchen({ d, c, r, col, rnd }) {
  const B = new Batch(d);
  // despensa entre las dos ventanas del fondo, pegada al muro
  const SX = -16.6, SZ = -125.66;
  B.add('c_shelf', SX, F0, -125.78, 0, 1, { shadow: true });
  col(SX, F0, SZ, 1.0, 2.08, 0.26);
  const L = [0.14, 0.38, 0.66, 0.94, 1.22, 1.51, 2.08];
  const on = (type, lv, ux, yaw = 0, s = 1) => B.add(type, SX + ux, F0 + L[lv], SZ, yaw, s);
  on('c_jug', 0, -0.27, 0.3); on('c_potE', 0, 0.22, 0.4);
  for (const [u, k] of [[-0.32, 1], [-0.22, 2], [-0.1, 3]]) on('c_onion', 1, u, k);
  for (const [u, k] of [[0.12, 0], [0.22, 1], [0.17, 2]]) on('c_lemon', 1, u, k);
  on('c_bowl2', 2, -0.26); on('c_pear', 2, -0.05, 0.6); on('c_pear', 2, 0.07, 2.1); on('c_teacup', 2, 0.28, 1.2);
  on('c_bowl', 3, -0.22); on('c_pan', 3, 0.22, 0.3, 0.8);
  on('c_plate2', 4, -0.25); on('c_plate2', 4, -0.1, 0.4); on('c_teacup', 4, 0.15, 0.2); on('c_teacup', 4, 0.3, 2);
  on('c_jug', 5, -0.3, 1); on('c_metaljug', 5, 0.1, 2) ;
  on('c_pot', 6, -0.2, 0.2); on('c_potE', 6, 0.15, 2.4);
  // mesadas bajo las ventanas del fondo, con cosas encima
  for (const x of [-20.5, -12.5]) { B.add('c_cabinet2', x, F0, -125.47, 0, 1, { shadow: true }); col(x, F0, -125.47, 1.2, 1.18, 0.62); }
  B.add('c_jug', -20.9, F0 + 1.18, -125.5, 1).add('c_bowl2', -20.4, F0 + 1.18, -125.45, 0).add('c_lemon', -20.4, F0 + 1.18 + 0.03, -125.45, 0.5).add('c_pear', -20.1, F0 + 1.18, -125.4, 2);
  B.add('c_vase_c', -12.9, F0 + 1.18, -125.5, 0).add('c_pot', -12.2, F0 + 1.18, -125.45, 0.8).add('c_metaljug', -12.55, F0 + 1.18, -125.3, 2);
  // repisas del muro oeste (las dos tablas de madera)
  for (const [z, k] of [[-116.7, 0], [-117.35, 1], [-118.05, 2]]) B.add(['c_jug', 'c_potE', 'c_bowl2'][k], -23.5, F0 + 1.23, z, 1.5 + k, 1);
  B.add('c_metaljug', -23.5, F0 + 2.03, -116.75, 1.6).add('c_vase_c', -23.5, F0 + 2.03, -118.5, 0);
  // cremallera de ollas sobre la mesa de carnicero: barra de hierro colgada del cielorraso con cadenas
  const RX0 = -17.4, RX1 = -14.6, RZ = -121, RY = F0 + 2.65;
  c.b.box('iron', (RX0 + RX1) / 2, RY, RZ, RX1 - RX0, 0.04, 0.04, { collide: false, noShadow: true, mask: false });
  for (const x of [RX0, RX1]) c.b.cylinder('iron', x, (RY + 10) / 2, RZ, 0.012, 0.012, 10 - RY, 5, { collide: false, noShadow: true, mask: false });
  const hang = (type, x, top, yaw = 0, s = 1) => { // cuelga de un gancho: cadenita corta y el objeto debajo
    c.b.cylinder('iron', x, RY - top / 2, RZ, 0.006, 0.006, top, 4, { collide: false, noShadow: true, mask: false });
    return B.add(type, x, RY - top - ({ c_pot: 0.29, c_potE: 0.18, c_metaljug: 0.29 }[type] || 0.2) * s, RZ, yaw, s);
  };
  hang('c_pot', -17.05, 0.08); hang('c_potE', -16.4, 0.3, 1); hang('c_pot', -15.75, 0.2, 2, 0.85); hang('c_metaljug', -15.1, 0.12, 0.5);
  // hilos de cebollas colgando de la barra
  for (const x of [-16.05, -14.85]) {
    c.b.cylinder('hemp', x, RY - 0.25, RZ + 0.15, 0.006, 0.006, 0.5, 4, { collide: false, noShadow: true, mask: false });
    for (let k = 0; k < 5; k++) B.add('c_onion', x + (k % 2 ? 0.02 : -0.02), RY - 0.07 - k * 0.1, RZ + 0.15, k, 1.1);
  }
  // hacha sobre la mesa de carnicero (el cuerpo tapado ocupa casi todo)
  B.lay('c_hatchet', 0.104, 0.288, -14.92, F0 + 0.91, -120.95, PI / 2 + 0.2);
  // mesa de trabajo: tabla, cuenco de cebollas, cuchara y un canasto de manzanas
  B.add('c_roundtable', -12.6, F0, -122.9, 0, 1, { shadow: true });
  col(-12.6, F0, -122.9, 0.8, 0.75, 0.8);
  B.add('c_board', -12.75, F0 + 0.75, -122.9, 0.3, 1).add('c_bowl', -12.35, F0 + 0.75, -122.75, 0, 1).add('c_onion', -12.35, F0 + 0.78, -122.75, 1, 1).add('c_onion', -12.28, F0 + 0.78, -122.7, 2, 1);
  B.add('c_spoon', -12.9, F0 + 0.75 + 0.042, -122.7, 0.4, 1);
  B.add('c_basket1', -13.9, F0, -122.0, 0.4, 1);
  for (const [dx, dz] of [[-0.08, 0.0], [0.05, 0.05], [0.02, -0.06], [0.1, -0.02]]) B.add('c_apple', -13.9 + dx, F0 + 0.06, -122.0 + dz, r() * 6, 1);
  B.add('c_basket2', -13.7, F0, -120.0, 2.4, 1).add('c_lemon', -13.75, F0 + 0.07, -120.0, 0, 1).add('c_lemon', -13.65, F0 + 0.07, -119.95, 1, 1);
  // tajo de leña con el hacha al lado, un balde junto al hogar y la escoba contra la pared
  B.add('c_stump', -12.0, F0, -118.9, 0.5, 0.5, { shadow: true });
  col(-12.0, F0, -118.9, 0.7, 0.28, 0.8);
  B.lay('c_hatchet', 0.104, 0.288, -11.9, F0 + 0.285, -118.85, 2.1);
  B.add('c_bucket2', -21.7, F0, -120.4, 0.3, 1);
  B.add('c_broom', -23.55, F0, -115.6, 0, 1, { rz: -0.1 });
  B.add('c_mousetrap', -10.2, F0, -124.2, 0.7, 1);
  B.flush();
  // bolsas de harina en la esquina y astillas de leña en el piso
  const sg = [sackGeo(r), sackGeo(r, 0.9), sackGeo(r, 1.05)];
  [[-9.35, -123.7, 0], [-9.75, -122.85, 1], [-9.0, -122.75, 2]].forEach(([x, z, k], i) => {
    const g = sg[k].clone(); g.rotateY(r() * 6); g.translate(x, F0, z); c.b.geo('linen', g);
    col(x, F0, z, 0.5, 0.5, 0.5);
  });
  for (let k = 0; k < 9; k++) c.b.box('woodDark', -12 + rnd(-0.6, 0.6), F0 + 0.02, -118.9 + rnd(-0.6, 0.6), 0.09, 0.02, 0.03, { collide: false, noShadow: true, yaw: r() * 6, mask: false });
}

// ---------------------------------------------------------------- biblioteca (105): el estudio de alguien que buscaba algo
function dressLibrary({ d, c, r, col }) {
  const B = new Batch(d);
  // libros en todos los estantes (menos el que gira: ese lleva los suyos pegados)
  const north = [10.6, 13.5, 19.5, 22.4].map((x) => ({ x, z: -114.35, yaw: 0, y: F0 }));
  const west = [-105.9, -112.9].map((z) => ({ x: 8.65, z, yaw: PI / 2, y: F0 }));
  shelfBooks(d, [...north, ...west, { x: 16.5, z: -104.55, yaw: PI, y: F0 }], r);
  d.secretBooks = () => d.models.secretShelf && shelfBooks(d, [{ local: true, y: 0, yaw: 0 }], r, d.models.secretShelf);
  // hasta que el estante giratorio existe no se le pueden pegar libros: se hace apenas llega
  const iv = setInterval(() => { if (d.models.secretShelf) { clearInterval(iv); d.secretBooks(); } }, 500);
  setTimeout(() => clearInterval(iv), 60000);
  // mesa de lectura: microscopio, lámpara de aceite, pila de libros, compás, reloj y anteojos
  const T = F0 + 0.8;
  B.add('c_microscope', 16.75, T, -108.6, PI, 1);
  B.add('c_oillamp', 18.3, T, -108.85, 0, 1);
  c.flame(18.3, T + 0.5, -108.85, 0.04, 0.09, {});
  c.light(18.3, T + 0.65, -108.85, 0xffc070, 4.2, 9, { flicker: true, priority: 1.5 });
  B.lay('c_book_a', 0.039, 0.237, 17.9, T, -108.3, 0.4).lay('c_book_b', 0.037, 0.237, 17.92, T + 0.039, -108.32, 0.05).lay('c_book_a', 0.039, 0.237, 17.88, T + 0.076, -108.28, -0.3);
  B.add('c_compass', 17.15, T, -108.15, 0.8, 1).flat('c_pocketwatch', 0.08, 0.014, 17.45, T, -108.2, 1.4).add('c_specs', 17.6, T, -108.9, 0.5, 1);
  // sillas de lectura, una pegada a la mesa y otra corrida
  B.add('c_chair', 17.5, F0, -107.45, PI, 1).add('c_chair', 18.6, F0, -109.8, 0.5, 1);
  // mesa de ajedrez junto a la ventana con dos banquitos
  B.add('c_roundtable', 12.3, F0, -108.4, 0, 1, { shadow: true });
  col(12.3, F0, -108.4, 0.8, 0.75, 0.8);
  B.add('c_stool2', 12.3, F0, -107.45, PI, 1).add('c_stool2', 12.3, F0, -109.35, 0, 1);
  // escalera baja apoyada entre dos estantes y un baúl-cajonera contra el tabique
  B.add('c_ladder2', 12.05, F0, -114.2, 0, 1, { shadow: true });
  B.add('c_drawer', 9.05, F0, -111.0, PI / 2, 1, { shadow: true });
  col(9.05, F0, -111.0, 0.46, 0.55, 0.86);
  B.add('c_vase_c', 9.0, F0 + 0.55, -110.7, 0, 1).add('c_candlestick', 9.0, F0 + 0.55, -111.3, 0, 1);
  c.flame(9.0, F0 + 0.55 + 0.25, -111.3, 0.03, 0.07, {});
  // repisa del hogar: reloj y dos floreros de bronce; la alfombra delante del fuego
  B.add('c_mclock', 23.05, F0 + 2.125, -111.5, -PI / 2, 1.1).add('c_vase_b3', 23.05, F0 + 2.125, -112.35, 0, 1.2).add('c_vase_b3', 23.05, F0 + 2.125, -110.65, 0, 1.2);
  rug(d, 20.9, -111.4, 3.6, 4.4, 'green', 0, 3);
  // cortinas: ventanas del frente (el cuarto queda hacia -z) y del este (hacia -x)
  for (const x of [12.5, 20.5]) curtains(d, x, -104.25, 'x', -1, F0 + 0.05, F0 + 5.5, 0.75, r);
  curtains(d, 23.75, -105.6, 'z', -1, F0 + 0.05, F0 + 5.5, 0.75, r);
  B.flush();
}

// ---------------------------------------------------------------- sala de los retratos (102): salón de té abandonado
function dressGallery({ d, c, r, col }) {
  const B = new Batch(d);
  rug(d, 0, -121.5, 5.6, 4.8, 'brown', 0, 4);
  B.add('c_sofa3', 0, F0, -125.3, 0, 1, { shadow: true });
  col(0, F0, -125.3, 2.6, 0.9, 0.9);
  // mesa baja con el servicio de té servido para nadie
  const T = F0 + 0.56;
  B.add('c_cofftable', 0, F0, -121.6, 0.3, 1, { shadow: true });
  col(0, F0, -121.6, 1.4, 0.56, 1.4);
  B.add('c_teapot', 0, T, -121.6, 0.9, 1).add('c_sugarcup', 0.3, T, -121.4, 0, 1);
  for (const [x, z, k] of [[-0.35, -121.3, 0], [0.1, -121.95, 1.6], [-0.3, -121.9, 3]]) B.add('c_saucer', x, T, z, k, 1).add('c_teacup', x, T + 0.016, z, k + 0.5, 1);
  B.add('c_candlestick', -0.05, T, -121.1, 0, 1);
  c.flame(-0.05, T + 0.25, -121.1, 0.03, 0.07, {});
  // rueca junto a la puerta, cómoda con floreros contra el muro este y mesa de luz con lámpara contra el oeste
  B.add('c_spinwheel', 6.6, F0, -118.4, 0.5, 1, { shadow: true });
  col(6.6, F0, -118.4, 0.6, 0.97, 0.9);
  B.add('c_commode', 7.4, F0, -124.0, -PI / 2, 1, { shadow: true });
  col(7.4, F0, -124.0, 0.58, 1.21, 1.2);
  B.add('c_horsestat', 7.35, F0 + 1.21, -123.6, -PI / 2 + 0.4, 1.2).add('c_vase_c2', 7.35, F0 + 1.21, -124.4, 0, 1);
  B.add('c_nightstand', -7.45, F0, -118.7, PI / 2, 1, { shadow: true });
  col(-7.45, F0, -118.7, 0.42, 0.7, 0.57);
  B.add('c_oillamp', -7.45, F0 + 0.7, -118.7, 0, 0.8);
  c.flame(-7.45, F0 + 0.7 + 0.4, -118.7, 0.035, 0.08, {});
  c.light(-7.2, F0 + 1.4, -118.7, 0xffc070, 3.4, 8, { flicker: true, priority: 1.2 });
  // muebles con sábana en las esquinas
  B.flush();
  if (HAS_DOM) {
    for (const [x, z, w, h, dp, yaw] of [[-6.3, -124.6, 1.5, 1.05, 0.9, 0.2], [5.7, -125.0, 1.1, 0.8, 0.8, -0.3]]) {
      const g = sheetGeo(w, h, dp, r); g.rotateY(yaw); g.translate(x, F0, z); c.b.geo('linen', g);
      col(x, F0, z, w * 0.9, h, dp * 0.9, yaw);
    }
  }
  // cortinas de las ventanas del fondo (el cuarto queda hacia +z)
  for (const x of [-4, 4]) curtains(d, x, -125.75, 'x', 1, F0 + 0.05, F0 + 5.5, 0.75, r);
}

// ---------------------------------------------------------------- cuarto secreto (106): el altar y el ídolo
function dressSecret({ d, c, r, col }) {
  const B = new Batch(d);
  // cabeza de toro enorme sobre el altar; floreros altos a los lados
  B.add('c_bullhead', 13, F0 + 2.55, -125.68, 0, 1.7, { shadow: true });
  B.add('c_vase_b1', 10.1, F0, -125.3, 0, 1, { shadow: true }).add('c_vase_b1', 15.9, F0, -125.3, 0, 1, { shadow: true });
  // sobre el altar (velludo a F0+1.04): libros, vela y el reloj de bolsillo; las calaveras van a la derecha
  const T = F0 + 1.04;
  B.lay('c_book_a', 0.039, 0.237, 11.9, T, -125.05, 0.2).lay('c_book_b', 0.037, 0.237, 11.92, T + 0.039, -125.07, -0.2);
  B.add('c_candlestick', 12.5, T, -125.1, 0, 1).flat('c_pocketwatch', 0.08, 0.014, 12.9, T, -125.0, 0.9);
  c.flame(12.5, T + 0.25, -125.1, 0.03, 0.07, {});
  B.flush();
  // círculo ritual en el piso: pintado en sangre seca, con velas alrededor
  if (HAS_DOM) {
    const cv = canvas(512, 512), g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(70,6,8,0.92)'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.arc(256, 256, 226, 0, PI * 2); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.arc(256, 256, 206, 0, PI * 2); g.stroke();
    g.lineWidth = 8; g.beginPath();
    for (let i = 0; i <= 5; i++) { const a = -PI / 2 + ((i * 2) % 5) * (PI * 2 / 5), x = 256 + Math.cos(a) * 206, y = 256 + Math.sin(a) * 206; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    for (let i = 0; i < 26; i++) { const a = r() * 6.28, rr = 216 + r() * 8; g.fillStyle = 'rgba(70,6,8,0.8)'; g.fillRect(256 + Math.cos(a) * rr, 256 + Math.sin(a) * rr, 3, 10 + r() * 24); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 3.7), new THREE.MeshBasicMaterial({ map: ctex(cv), transparent: true, depthWrite: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true }));
    m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2;
    m.rotation.x = -PI / 2; m.position.set(13, F0 + 0.04, -120.3);
    d.scene.add(m);
  }
  for (let k = 0; k < 6; k++) { const a = (k / 6) * PI * 2 + 0.3; d.candleCluster(13 + Math.cos(a) * 1.9, F0, -120.3 + Math.sin(a) * 1.9, 3, 0.1, k % 3 === 0 ? 0.9 : 0); }
  d._flushCandles?.();
}

// ---------------------------------------------------------------- cripta (201): raíces que entraron por el techo y barriles rotos
function dressCrypt({ d, c, r, col }) {
  const B = new Batch(d);
  const CEIL = F0 - 0.3;
  // raíces colgando del techo (el modelo del suelo, dado vuelta) y una maraña en el piso junto a la pared
  B.add('c_roots1', 21.4, CEIL, -106.6, 0.4, 0.55, { rx: PI }).add('c_roots1', 10.2, CEIL, -123.6, 2.1, 0.5, { rx: PI }).add('c_roots1', 22.5, CEIL, -119.2, 4.2, 0.45, { rx: PI });
  B.add('c_roots2', 9.7, 0, -117.2, 1.0, 0.55).add('c_roots2', 22.1, 0, -108.6, 0.2, 0.5);
  // rincón del fondo: barriles rotos, duelas y una escalera caída
  B.add('c_barrel_a', 22.3, 0, -123.4, 0.4, 1, { shadow: true });
  col(22.3, 0, -123.4, 0.76, 0.92, 0.76);
  B.add('c_barrel_b', 19.5, 0.02, -123.2, 0.8, 1, { rz: PI / 2 - 0.05, ground: true, shadow: true });
  B.add('c_staves', 20.5, 0, -124.6, 0.3, 0.9).add('c_staves', 22.6, 0, -121.0, 2.2, 0.7);
  B.add('c_ladder', 9.6, 0, -106.3, PI / 2, 1, { shadow: true });
  // urnas y floreros junto a los nichos, ramas secas y una trampa para ratas
  B.add('c_vase_c2', 9.0, 0, -108.6).add('c_vase_a', 9.0, 0, -111.6, 0.3).add('c_vase_c', 9.0, 0, -120.0).add('c_vase_a', 9.05, 0, -123.4, 1);
  B.add('c_branches', 20.0, 0, -106.0, 0.6, 0.8).add('c_branches', 9.4, 0, -124.9, 2.4, 0.7);
  B.add('c_mousetrap', 13.0, 0, -122.6, 2.0, 1).add('c_mousetrap', 19.6, 0, -108.4, 0.5, 1);
  B.flush();
}

// ---------------------------------------------------------------- patio: un cañón vigilando el portón y el tajo de leña
function dressYard({ d, c, r, col }) {
  const B = new Batch(d);
  B.add('c_cannon', -9.5, 0.03, -86.8, 2.7, 1, { shadow: true });
  col(-9.5, 0.03, -86.8, 1.1, 0.8, 2.1, 2.7);
  const wp = c.woodpile;
  if (wp) {
    B.add('c_stump', wp.x + 1.7, 0.03, wp.z + 0.6, 0.3, 0.6, { shadow: true });
    col(wp.x + 1.7, 0.03, wp.z + 0.6, 0.85, 0.34, 0.95);
    B.lay('c_hatchet', 0.104, 0.288, wp.x + 1.7, 0.03 + 0.34, wp.z + 0.6, 1.2);
  }
  B.flush();
}
