// La parte de arriba de las cuatro torres de esquina (nivel 11): antes era un cuarto redondo pelado con un brasero y una
// lámpara en el piso. Cada una cuenta algo y se vive: la del alquimista (estantes, mesa de trabajo, hierbas colgando,
// la carta del cielo), el cuarto de la guardia (mesa con la partida de dados a medio jugar, banquitos, catres de paja,
// armas en el muro), el calabozo de arriba (colgados encadenados, huesos, paja podrida, sangre y la rejilla) y el depósito
// de la armería (bastidores con armas, cajones, balas de cañón, la piedra de afilar).
// Común a todas: techo de vigas radiales con un aro de hierro y una araña de velas colgando de cadena, postes contra el
// muro, aspilleras con luz de luna, humedad y musgo al pie del muro, telarañas entre las vigas y niebla baja.
// Reglas: la escalera (casi media vuelta antes de la salida), las dos puertas al adarve y el descanso quedan libres;
// los muebles van de espaldas al muro; lo repetido va instanciado; lo chico no tiene choque ni sombra.
import * as THREE from 'three';
import { Builder } from './builder.js';
import { TOWER_DECK } from './castle-expansion.js';
import { shelfBooks, sackGeo } from './castle-dress.js';

const HAS_DOM = typeof document !== 'undefined';
const PI = Math.PI, TAU = PI * 2;
const RW = 5.2 - 0.72; // radio del muro de adentro
const CEIL = 16.6; // las vigas del techo (el cuarto llega a 17)
const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

// modelos instanciados por tipo (una llamada de dibujo cada uno)
class Inst {
  constructor(d) { this.d = d; this.map = new Map(); }
  add(type, x, y, z, yaw = 0, s = 1, o = {}) {
    if (!this.map.has(type)) this.map.set(type, { mats: [], shadow: false });
    const b = this.map.get(type);
    _e.set(o.rx || 0, yaw, o.rz || 0, 'YXZ'); _q.setFromEuler(_e);
    b.mats.push(new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(s, s, s)));
    if (o.shadow) b.shadow = true;
    return this;
  }
  flush() { for (const [type, b] of this.map) this.d.instances(type, b.mats, { shadow: b.shadow }); this.map.clear(); }
}

// textura de humedad: manchas verdinegras que suben del piso y chorreados
let DAMP = null;
function dampTex() {
  if (DAMP || !HAS_DOM) return DAMP;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  let s = 4243; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 1600; i++) { const x = r() * 256, y = 256 - r() * r() * 230; g.fillStyle = `rgba(${18 + r() * 22},${34 + r() * 40},${16 + r() * 14},${0.06 + r() * 0.22})`; g.beginPath(); g.arc(x, y, 1 + r() * 5, 0, TAU); g.fill(); }
  for (let i = 0; i < 12; i++) { const x = r() * 256, w = 2 + r() * 7, len = 60 + r() * 150; const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, 'rgba(10,14,10,0.22)'); gr.addColorStop(1, 'rgba(10,14,10,0)'); g.fillStyle = gr; g.fillRect(x, 0, w, len); }
  DAMP = new THREE.CanvasTexture(cv); DAMP.colorSpace = THREE.SRGBColorSpace;
  return DAMP;
}
// mancha en el piso (sangre, aceite, vino): calcomanía oscura con bordes irregulares
function stainTex(rgb, seed) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  let s = seed; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 26; i++) { const a = r() * TAU, d = r() * 40; g.fillStyle = `rgba(${rgb},${0.18 + r() * 0.3})`; g.beginPath(); g.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 6 + r() * 22, 4 + r() * 16, r() * 3, 0, TAU); g.fill(); }
  for (let i = 0; i < 30; i++) { const a = r() * TAU, d = 40 + r() * 20; g.fillStyle = `rgba(${rgb},${0.3 + r() * 0.4})`; g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + r() * 3, 0, TAU); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// carta del cielo para la mesa del alquimista
function skyChartTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  let s = 777; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.fillStyle = '#b9a67a'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(60,36,16,${r() * 0.08})`; g.fillRect(r() * 512, r() * 512, 1 + r() * 5, 1 + r() * 3); }
  g.strokeStyle = '#4a3622'; g.fillStyle = '#4a3622'; g.lineWidth = 2;
  for (const rr of [70, 140, 210]) { g.beginPath(); g.arc(256, 256, rr, 0, TAU); g.stroke(); }
  for (let i = 0; i < 12; i++) { const a = i * TAU / 12; g.beginPath(); g.moveTo(256 + Math.cos(a) * 70, 256 + Math.sin(a) * 70); g.lineTo(256 + Math.cos(a) * 230, 256 + Math.sin(a) * 230); g.stroke(); }
  for (let i = 0; i < 90; i++) { const a = r() * TAU, rr = Math.sqrt(r()) * 220; g.beginPath(); g.arc(256 + Math.cos(a) * rr, 256 + Math.sin(a) * rr, 1 + r() * 2.5, 0, TAU); g.fill(); }
  g.font = '22px Georgia'; g.textAlign = 'center'; g.fillText('CÆLVM · NOCTIS', 256, 36);
  for (let i = 0; i < 12; i++) { const a = i * TAU / 12 + 0.26; g.font = '15px Georgia'; g.fillText(['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'][i], 256 + Math.cos(a) * 225, 262 + Math.sin(a) * 225); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function dressTowerTop(d, t, kind) {
  if (!t.stair) return;
  const c = d.c, b = new Builder(d.phys), I = new Inst(d), Y = TOWER_DECK, r = d.r;
  const rnd = (a, z) => a + r() * (z - a);
  const P = (a, rad) => [t.x + Math.sin(a) * rad, t.z + Math.cos(a) * rad];
  const col = (x, y, z, w, h, dp, yaw = 0) => d.phys.box(x, y + h / 2, z, w / 2, h / 2, dp / 2, yaw, { paint: false, mat: 'wood' });
  // dónde NO va nada en el piso: el hueco de la escalera (y su borde), el descanso y las dos puertas al adarve
  const finish = t.stair.finish;
  const doors = [Math.sign(t.x) * -PI / 2, t.z < -100 ? 0 : PI];
  const stairSide = (a) => { const before = (((finish - a) % TAU) + TAU) % TAU; return before < 3.55 || before > TAU - 0.55; };
  const floorFree = (a, half = 0.2) => !stairSide(a - half) && !stairSide(a + half) && !stairSide(a) && doors.every((q) => angDist(a, q) > 0.5 + half);
  const wallFree = (a, half = 0.15) => doors.every((q) => angDist(a, q) > 0.42 + half); // colgado del muro: también arriba del pasillo
  // contra el muro, de espaldas: centro a (RW - prof/2 - 1 cm), mirando al centro de la torre
  const against = (a, dep) => P(a, RW - dep / 2 - 0.04);
  const face = (a) => a + PI;
  const loc3 = (x, z, yaw, lx, lz, y) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), y, z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

  // arco libre de piso: de dónde a dónde se puede apoyar contra el muro
  const arc = [];
  for (let i = 0; i < 240; i++) { const a = (i / 240) * TAU; if (floorFree(a, 0)) arc.push(a); }
  // ordenados de corrido (el arco puede cruzar el 0)
  arc.sort((p, q) => p - q);
  let gapAt = 0, gap = 0;
  for (let i = 0; i < arc.length; i++) { const nx = arc[(i + 1) % arc.length] + (i === arc.length - 1 ? TAU : 0), g = nx - arc[i]; if (g > gap) { gap = g; gapAt = i; } }
  const run = arc.slice(gapAt + 1).concat(arc.slice(0, gapAt + 1).map((a) => a + TAU));
  // reparte cosas de ancho w contra el muro, de punta a punta del arco libre, salteando las puertas
  let cursor = run[0] + 0.06;
  const slot = (w) => {
    const half = w / 2 / (RW - 0.3);
    for (let k = 0; k < 60; k++) {
      const a = cursor + half;
      if (a + half > run[run.length - 1] - 0.04) return null;
      if (floorFree(a, half)) { cursor = a + half + 0.07; return a; }
      cursor += 0.05;
    }
    return null;
  };

  // ---------------------------------------------------------------- techo: vigas radiales, aro de hierro y la araña
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8 + 0.2, [mx, mz] = P(a, (RW + 0.5) / 2);
    b.box('blackWood', mx, CEIL, mz, 0.22, 0.3, RW - 0.4, { yaw: a, collide: false });
    // ménsula de piedra donde apoya cada viga, y el poste que baja por el muro (salvo en las puertas)
    const [kx, kz] = P(a, RW - 0.15);
    b.box('keepStone', kx, CEIL - 0.3, kz, 0.34, 0.3, 0.34, { yaw: a, collide: false, noShadow: true });
    if (wallFree(a, 0.12)) { const [px, pz] = P(a, RW - 0.1); b.box('blackWood', px, (Y + CEIL) / 2, pz, 0.2, CEIL - Y, 0.16, { yaw: a, collide: false, noShadow: true }); }
  }
  b.cylinder('iron', t.x, CEIL - 0.05, t.z, 0.45, 0.45, 0.12, 16, { collide: false, noShadow: true });
  // cadena (eslabones alternados) y la araña de hierro con velas
  const chY = Y + 3.15;
  for (let k = 0; k < 11; k++) b.box('iron', t.x, CEIL - 0.25 - k * 0.15, t.z, 0.035, 0.12, 0.012, { yaw: k % 2 ? PI / 2 : 0, collide: false, noShadow: true });
  I.add('c_lchand', t.x, chY - 0.4, t.z, 0.3, 1.25);
  for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + 0.3; c.flame(t.x + Math.sin(a) * 0.3, chY + 0.32, t.z + Math.cos(a) * 0.3, 0.03, 0.08, {}); }
  c.light(t.x, chY + 0.1, t.z, 0xffb76a, 6, 10, { flicker: true, priority: 1.5 });
  // telarañas en los huecos entre vigas, contra el muro
  const webs = [];
  for (let i = 0; i < 8; i++) if (r() < 0.75) { const a = i * TAU / 8 + 0.2 + TAU / 16, [wx, wz] = P(a, RW - 0.05); webs.push([wx, CEIL - 0.1, wz, a + PI * 0.75, 0.9 + r() * 0.7]); }
  d.cobwebs?.(webs);

  // ---------------------------------------------------------------- muro: aspilleras con luna, humedad, antorchas
  if (HAS_DOM) {
    const slitMat = new THREE.MeshBasicMaterial({ color: 0x5d7799, toneMapped: true });
    const dampMat = new THREE.MeshBasicMaterial({ map: dampTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3;
      if (!wallFree(a, 0.1)) continue;
      // la aspillera se ve de adentro: una ranura con el cielo de noche y un derrame de luz fría
      const [sx, sz] = P(a, RW - 0.01);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 1.15), slitMat); m.position.set(sx, Y + 1.7, sz); m.rotation.y = face(a); d.scene.add(m);
      b.box('keepStone', sx, Y + 1.08, sz, 0.42, 0.08, 0.2, { yaw: a, collide: false, noShadow: true });
    }
    for (let k = 0; k < 7; k++) {
      const a = k * TAU / 7 + r() * 0.4, [mx, mz] = P(a, RW - 0.03);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + r(), 1.4 + r() * 0.8), dampMat);
      m.position.set(mx, Y + 0.7, mz); m.rotation.y = face(a); m.renderOrder = 2; d.scene.add(m);
    }
  }
  // dos luces frías y bajas por las aspilleras (la luna) para que la penumbra tenga dos colores
  for (const k of [1, 4]) { const a = (k / 6) * TAU + 0.3, [lx, lz] = P(a, RW - 0.6); c.light(lx, Y + 1.8, lz, 0x6f8fc4, 1.6, 6, { priority: 0.8 }); }
  // antorchas en el muro (del lado de la escalera también: van altas)
  const torch = (a, y = Y + 2.2) => { const [x, z] = P(a, RW - 0.08); b.box('iron', x, y, z, 0.09, 0.36, 0.09, { collide: false }); b.box('iron', x, y + 0.05, z, 0.05, 0.05, 0.22, { yaw: a, collide: false, noShadow: true }); c.flame(x - Math.sin(a) * 0.12, y + 0.25, z - Math.cos(a) * 0.12, 0.06, 0.18, { intensity: 0.9 }); };
  { const a = finish - 1.6; if (wallFree(a)) torch(a, Y + 2.4); }

  // ---------------------------------------------------------------- piso: niebla, paja, mugre
  d.fogLayer?.(t.x, Y + 0.3, t.z, RW * 2 - 0.2, 0, { round: true });
  const strawG = [];
  const straw = (cx, cz, n, rad) => { for (let i = 0; i < n; i++) { const a = r() * TAU, dd = Math.sqrt(r()) * rad, g = new THREE.CylinderGeometry(0.004, 0.004, 0.18 + r() * 0.22, 3); g.rotateZ(PI / 2); g.rotateY(r() * TAU); g.translate(cx + Math.cos(a) * dd, Y + 0.012 + r() * 0.015, cz + Math.sin(a) * dd); strawG.push(g); } };
  const stain = (x, z, size, rgb, seed) => { if (!HAS_DOM) return; const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: stainTex(rgb, seed), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); m.rotation.x = -PI / 2; m.rotation.z = r() * TAU; m.position.set(x, Y + 0.012, z); d.scene.add(m); };
  const scatter = (type, n, rMin, rMax, s = 1, y = 0, o = {}) => { for (let i = 0; i < n; i++) { for (let k = 0; k < 8; k++) { const a = r() * TAU; if (!floorFree(a, 0.05)) continue; const [x, z] = P(a, rnd(rMin, rMax)); I.add(type, x, Y + y, z, r() * TAU, s, o); break; } } };

  // ---------------------------------------------------------------- el brasero (en todas) y lo especial de cada una
  {
    const a = slot(0.9);
    if (a != null) {
      const [x, z] = P(a, RW - 0.75);
      b.cylinder('iron', x, Y + 0.85, z, 0.4, 0.15, 0.16, 12, { collide: false }); b.cylinder('iron', x, Y + 0.45, z, 0.05, 0.05, 0.8, 6, { collide: true });
      for (const s of [-1, 0, 1]) b.box('iron', x + s * 0.18, Y + 0.2, z, 0.03, 0.4, 0.03, { rz: s * 0.4, collide: false });
      c.fire3d?.(x, Y + 0.95, z, 0.24, 0.24, 0.55, { intensity: 0.9 });
      c.light(x, Y + 1.4, z, 0xff9a40, 4.2, 9, { flicker: true, priority: 1.0 });
      const [fx, fz] = P(a + 0.2, RW - 0.4); I.add('c_firewood', fx, Y, fz, face(a), 1).add('c_firewood', fx, Y + 0.15, fz, face(a) + 0.3, 1);
    }
  }
  if (kind === 'guardia' || kind === 'armeria') {
    // un cañón asomado a la aspillera grande, apuntando afuera
    const a = slot(1.3);
    if (a != null) { const [x, z] = P(a, RW - 1.0); I.add('c_cannon', x, Y, z, a, 0.85, { shadow: true }); col(x, Y, z, 1.0, 0.75, 1.8, a); }
  } else if (kind === 'alquimia') {
    // telescopio de bronce sobre trípode, apuntando al cielo por la aspillera
    const a = slot(0.8);
    if (a != null) { const [x, z] = P(a, RW - 0.55); for (const s of [-1, 0, 1]) b.cylinder('woodDark', x + s * 0.18, Y + 0.55, z + (s ? 0.1 : -0.15), 0.015, 0.02, 1.1, 4, { rz: s * 0.18, collide: false }); const tube = new THREE.CylinderGeometry(0.07, 0.05, 1.1, 10); tube.rotateZ(PI / 2 - 0.9); tube.rotateY(a + PI / 2); tube.translate(x, Y + 1.25, z); b.geo('bronze', tube); col(x, Y, z, 0.5, 1.2, 0.5); }
  } else if (kind === 'calabozo') {
    // la jaula colgada de la viga, con un esqueleto sentado adentro
    const a = finish - TAU + 1.2, [x, z] = P(a, 2.4);
    for (let k = 0; k < 8; k++) { const ang = k * TAU / 8; b.cylinder('iron', x + Math.sin(ang) * 0.32, Y + 2.0, z + Math.cos(ang) * 0.32, 0.012, 0.012, 1.0, 4, { collide: false, noShadow: true }); }
    b.cylinder('iron', x, Y + 1.5, z, 0.34, 0.34, 0.04, 12, { collide: false }); b.cylinder('iron', x, Y + 2.5, z, 0.34, 0.34, 0.04, 12, { collide: false });
    for (let k = 0; k < 14; k++) b.box('iron', x, CEIL - 0.2 - k * 0.14, z, 0.03, 0.11, 0.012, { yaw: k % 2 ? PI / 2 : 0, collide: false, noShadow: true });
    I.add('c_skel_sit', x, Y + 1.52, z, a, 0.5);
  }

  // ---------------------------------------------------------------- cada torre lo suyo
  if (kind === 'alquimia') {
    // estante con libros y frascos, la mesa de trabajo, un armario con bocales y el baúl
    let a = slot(1.7);
    if (a != null) { const [x, z] = against(a, 0.7); I.add('c_bookshelf', x, Y, z, face(a), 1, { shadow: true }); col(x, Y, z, 1.66, 2.5, 0.7, face(a)); shelfBooks(d, [{ x, y: Y, z, yaw: face(a), fill: 0.82 }], r); }
    a = slot(1.8);
    if (a != null) {
      const [x, z] = against(a, 0.8), yaw = face(a), cx = Math.cos(yaw), sx = Math.sin(yaw);
      b.box('oldWood', x, Y + 0.88, z, 1.8, 0.08, 0.8, { yaw, collide: false }); col(x, Y, z, 1.8, 0.92, 0.8, yaw);
      for (const [lx, lz] of [[-0.82, -0.32], [0.82, -0.32], [-0.82, 0.32], [0.82, 0.32]]) b.box('blackWood', x + lx * cx + lz * sx, Y + 0.42, z - lx * sx + lz * cx, 0.08, 0.84, 0.08, { yaw, collide: false });
      const top = Y + 0.92, at3 = (lx, lz, y = top) => loc3(x, z, yaw, lx, lz, y);
      I.add('c_skull', ...at3(-0.55, 0.05), yaw + 0.4, 1).add('c_book_a', ...at3(-0.15, -0.15), yaw, 1, { rz: PI / 2 });
      I.add('c_compass', ...at3(0.25, 0.1), yaw, 1.2).add('c_bowl', ...at3(0.45, -0.18), 0, 0.8).add('c_metaljug', ...at3(0.7, 0.05), 0, 0.8);
      I.add('c_candles', ...at3(-0.78, -0.2), 0, 1); c.flame(...at3(-0.78, -0.2, top + 0.27), 0.03, 0.08, {});
      // frascos de colores (procedurales, chiquitos)
      for (let k = 0; k < 7; k++) b.cylinder(['fluo', 'green', 'red', 'glass'][k % 4], ...at3(-0.3 + k * 0.12, 0.25 + (k % 2) * 0.06, top + 0.07), 0.035, 0.04, 0.14, 8, { collide: false, noShadow: true });
      c.light(...at3(0, 0.6, Y + 1.4), 0x9fe8a8, 1.4, 4.5, { flicker: true, priority: 0.7 });
    }
    a = slot(1.25);
    if (a != null) { const [x, z] = against(a, 0.62); I.add('c_cabinet2', x, Y, z, face(a), 1, { shadow: true }); col(x, Y, z, 1.2, 1.18, 0.62, face(a)); ['c_vase_c', 'c_jug', 'c_vase_a'].forEach((type, k) => I.add(type, ...loc3(x, z, face(a), (k - 1) * 0.38, 0, Y + 1.18), r() * TAU, 0.6)); }
    a = slot(1.0);
    if (a != null) { const [x, z] = against(a, 0.55); I.add('c_chest', x, Y, z, face(a), 1, { shadow: true }); col(x, Y, z, 0.96, 0.62, 0.52, face(a)); I.add('c_books', x, Y + 0.62, z, face(a) + 0.3, 0.9); }
    // hierbas secas colgando de las vigas, en atados
    for (let k = 0; k < 5; k++) { const a2 = k * TAU / 8 + 0.2, [hx, hz] = P(a2, 2.2 + (k % 2) * 0.9); b.cylinder('hemp', hx, CEIL - 0.6, hz, 0.008, 0.008, 1.0, 4, { collide: false, noShadow: true }); I.add('c_branches', hx, CEIL - 1.1, hz, r() * TAU, 0.3, { rx: PI }); }
    // la carta del cielo sobre una mesa redonda en el medio, con un candelero
    I.add('c_roundtable', t.x, Y, t.z, 0.4, 1.2, { shadow: true }); col(t.x, Y, t.z, 1.0, 0.9, 1.0);
    if (HAS_DOM) { const m = new THREE.Mesh(new THREE.CircleGeometry(0.42, 28), new THREE.MeshStandardMaterial({ map: skyChartTex(), roughness: 0.95 })); m.rotation.x = -PI / 2; m.position.set(t.x, Y + 0.905, t.z); d.scene.add(m); }
    I.add('c_candlestick', t.x + 0.3, Y + 0.9, t.z - 0.1, 0, 1.2); c.flame(t.x + 0.3, Y + 0.9 + 0.27, t.z - 0.1, 0.03, 0.08, {});
    I.add('c_specs', t.x - 0.15, Y + 0.905, t.z + 0.12, 1.1, 1);
    scatter('c_book_a', 3, 1.5, 3.4, 1, 0, { rz: PI / 2 }); scatter('c_rat', 2, 2, 3.6);
  } else if (kind === 'guardia') {
    // la mesa de la guardia en el medio: dados, jarras, una vela casi consumida y tres banquitos
    I.add('c_roundtable', t.x, Y, t.z, 0, 1.25, { shadow: true }); col(t.x, Y, t.z, 1.0, 0.94, 1.0);
    const top = Y + 0.94;
    I.add('c_board', t.x - 0.1, top, t.z + 0.05, 0.5, 1).add('c_goblet_a', t.x + 0.3, top, t.z - 0.2, 0, 0.8).add('c_goblet_b', t.x - 0.32, top, t.z - 0.18, 0, 0.8);
    I.add('c_goblet_a', t.x + 0.22, top, t.z + 0.32, 0, 0.8, { rz: PI / 2 }).add('c_jug', t.x - 0.05, top, t.z - 0.35, 1, 0.9).add('c_plate', t.x + 0.05, top, t.z + 0.32, 0, 1);
    I.add('c_candles', t.x + 0.38, top, t.z + 0.08, 0, 0.9); c.flame(t.x + 0.38, top + 0.24, t.z + 0.08, 0.03, 0.08, {});
    for (let k = 0; k < 6; k++) { const a = r() * TAU, dd = r() * 0.3; b.box('bone', t.x + Math.cos(a) * dd, top + 0.012, t.z + Math.sin(a) * dd, 0.025, 0.025, 0.025, { yaw: r() * TAU, collide: false, noShadow: true }); } // dados
    for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.5, [sx, sz] = P(a, 0.95); I.add('c_stool2', sx, Y, sz, r() * TAU, 1, { shadow: true }); col(sx, Y, sz, 0.42, 0.44, 0.42); }
    // catres de paja contra el muro (una manta encima), barriles, cajones apilados y una tinaja de vino
    for (let k = 0; k < 2; k++) {
      const a = slot(1.0);
      if (a == null) break;
      const [x, z] = against(a, 0.55);
      I.add('c_haybale', x, Y, z, face(a) + PI / 2, 1.05, { shadow: true }); col(x, Y, z, 0.6, 0.43, 1.0, face(a));
      b.box('fabricBrown', x, Y + 0.45, z, 0.55, 0.04, 0.9, { yaw: face(a) + 0.1, collide: false, noShadow: true });
      straw(x, z, 30, 0.7);
    }
    let a = slot(0.9);
    if (a != null) { const [x, z] = against(a, 0.8); I.add('c_winebarrel', x, Y, z, face(a), 1, { shadow: true }); col(x, Y, z, 0.74, 0.87, 0.76, face(a)); I.add('c_metaljug', x, Y + 0.87, z, 0, 0.8); }
    a = slot(0.9);
    if (a != null) { const [x, z] = against(a, 0.45); for (let k = 0; k < 3; k++) I.add('c_crate', x, Y + k * 0.35, z, face(a) + (r() - 0.5) * 0.25, 1, { shadow: true }); col(x, Y, z, 0.82, 1.05, 0.4, face(a)); }
    a = slot(0.7);
    if (a != null) { const [x, z] = against(a, 0.62); I.add('c_barrel', x, Y, z, 0, 1, { shadow: true }); col(x, Y, z, 0.6, 0.95, 0.6); I.add('c_lantern', x, Y + 0.95, z, 0.5, 0.8); c.flame(x, Y + 1.25, z, 0.03, 0.07, {}); }
    a = slot(0.5);
    if (a != null) { const [x, z] = against(a, 0.2); I.add('c_broom', x, Y, z, face(a), 1, { rx: -0.18 }); const [ux, uz] = P(a + 0.12, RW - 0.4); I.add('c_bucket', ux, Y, uz, 0, 0.9); }
    // armas en el muro: escudos con espadas cruzadas (sobre el pasillo de la escalera también)
    for (const k of [0.9, 2.2, 3.4, 4.6]) {
      const aa = finish - k;
      if (!wallFree(aa, 0.3)) continue;
      const [x, z] = P(aa, RW - 0.06);
      I.add('c_shield', x, Y + 1.55, z, face(aa), 0.75);
      for (const [type, ang] of [['c_estoc', 0.7], ['c_saber', -0.7]]) { const [wx, wz] = P(aa, RW - 0.03); I.add(type, wx, Y + 1.45, wz, face(aa), 1, { rz: ang }); }
    }
    scatter('c_firewood', 3, 1.6, 3.3); scatter('c_rat', 1, 2.5, 3.6);
    stain(t.x + 0.5, t.z - 0.4, 1.3, '60,10,20', 91); // vino volcado
  } else if (kind === 'calabozo') {
    // colgados encadenados al muro, huesos y calaveras amontonados, paja podrida, baldes y la rejilla con sangre
    for (let k = 0; k < 2; k++) {
      const a = slot(0.8);
      if (a == null) break;
      const [x, z] = P(a, RW - 0.32);
      I.add('c_skel_hang', x, Y + 0.55, z, face(a) + PI, 1);
      for (const s of [-1, 1]) { const [cx, cz] = P(a + s * 0.07, RW - 0.08); for (let j = 0; j < 7; j++) b.box('iron', cx, Y + 2.85 - j * 0.11, cz, 0.03, 0.09, 0.012, { yaw: face(a) + (j % 2) * PI / 2, collide: false, noShadow: true }); b.box('iron', cx, Y + 2.95, cz, 0.12, 0.06, 0.1, { yaw: face(a), collide: false }); }
      straw(x, z, 40, 0.8);
    }
    let a = slot(1.1);
    if (a != null) { const [x, z] = against(a, 1.0); I.add('c_bones', x, Y, z, face(a), 1); I.add('c_skull', x + 0.2, Y + 0.08, z - 0.1, r() * TAU, 1).add('c_skull', x - 0.25, Y + 0.05, z + 0.12, r() * TAU, 1); }
    a = slot(0.6);
    if (a != null) { const [x, z] = against(a, 0.36); I.add('c_bucket', x, Y, z, 0, 1, { shadow: true }); col(x, Y, z, 0.36, 0.55, 0.36); }
    a = slot(1.0);
    if (a != null) { const [x, z] = against(a, 0.55); I.add('c_haybale', x, Y, z, face(a) + PI / 2, 1, { rz: 0.05, shadow: true }); col(x, Y, z, 0.55, 0.42, 0.95, face(a)); straw(x, z, 40, 0.9); }
    // la rejilla del medio con la mancha que corre hacia ella
    b.cylinder('iron', t.x, Y + 0.01, t.z, 0.38, 0.38, 0.02, 16, { collide: false, noShadow: true });
    for (let k = -3; k <= 3; k++) b.box('black', t.x + k * 0.09, Y + 0.022, t.z, 0.04, 0.005, 0.62 * Math.sqrt(1 - (k / 4) ** 2), { collide: false, noShadow: true });
    stain(t.x + 0.2, t.z + 0.1, 2.2, '58,4,6', 33); stain(t.x - 0.6, t.z + 0.7, 1.2, '50,4,6', 71);
    scatter('c_bones', 2, 1.6, 3.2, 0.6); scatter('c_skull', 3, 1.4, 3.4); scatter('c_rat', 3, 1.5, 3.8); scatter('c_candles', 4, 3.4, 3.9);
    for (let k = 0; k < 4; k++) { const aa = r() * TAU; if (floorFree(aa)) { const [x, z] = P(aa, 3.7); c.flame(x, Y + 0.22, z, 0.025, 0.07, {}); } }
    c.light(t.x, Y + 0.6, t.z, 0xff4a30, 1.8, 5, { flicker: true, priority: 0.8 });
  } else {
    // armería: bastidores con armas paradas, cajones, balas de cañón, la piedra de afilar y escudos en el muro
    for (let k = 0; k < 2; k++) {
      const a = slot(1.3);
      if (a == null) break;
      const [x, z] = against(a, 0.45), yaw = face(a), cx = Math.cos(yaw), sx = Math.sin(yaw);
      b.box('woodDark', x, Y + 0.25, z, 1.3, 0.08, 0.42, { yaw, collide: false }); b.box('woodDark', x, Y + 1.25, z, 1.3, 0.06, 0.2, { yaw, collide: false });
      for (const s of [-0.62, 0.62]) b.box('woodDark', x + s * cx, Y + 0.7, z - s * sx, 0.07, 1.4, 0.4, { yaw, collide: false });
      col(x, Y, z, 1.3, 1.4, 0.45, yaw);
      const kinds = ['c_estoc', 'c_warhammer', 'c_mace', 'c_saber', 'c_estoc', 'c_warhammer'];
      for (let j = 0; j < 6; j++) { const lx = -0.5 + j * 0.2; I.add(kinds[(j + k) % kinds.length], x + lx * cx, Y + 0.29, z - lx * sx, yaw, 1, { rx: -0.12 }); }
    }
    let a = slot(0.9);
    if (a != null) { const [x, z] = against(a, 0.42); for (let k = 0; k < 2; k++) I.add('c_crate', x, Y + k * 0.35, z, face(a) + (r() - 0.5) * 0.2, 1, { shadow: true }); col(x, Y, z, 0.82, 0.7, 0.4, face(a)); }
    a = slot(1.0);
    if (a != null) { const [x, z] = against(a, 0.55); I.add('c_chest', x, Y, z, face(a), 1, { shadow: true }); col(x, Y, z, 0.96, 0.62, 0.52, face(a)); }
    a = slot(0.9);
    if (a != null) { const [x, z] = against(a, 0.8); I.add('c_barrel_a', x, Y, z, 0, 1, { shadow: true }); col(x, Y, z, 0.76, 0.92, 0.76); }
    a = slot(1.8);
    if (a != null) { const [x, z] = against(a, 0.9); I.add('c_staves', x, Y, z, face(a), 1); }
    // pirámide de balas de cañón
    { const aa = slot(0.7); if (aa != null) { const [bx, bz] = against(aa, 0.6); const sg = []; for (let lv = 0; lv < 3; lv++) for (let i = 0; i < 3 - lv; i++) for (let j = 0; j < 3 - lv; j++) { const g = new THREE.SphereGeometry(0.1, 10, 8); g.translate(bx + (i - (2 - lv) / 2) * 0.2, Y + 0.1 + lv * 0.16, bz + (j - (2 - lv) / 2) * 0.2); sg.push(g); } for (const g of sg) b.geo('iron', g); col(bx, Y, bz, 0.6, 0.45, 0.6); } }
    // la piedra de afilar en el medio
    b.box('woodDark', t.x, Y + 0.35, t.z, 0.9, 0.08, 0.35, { collide: false }); for (const s of [-0.38, 0.38]) b.box('woodDark', t.x + s, Y + 0.17, t.z, 0.07, 0.34, 0.3, { collide: false });
    b.cylinder('stone', t.x, Y + 0.68, t.z, 0.32, 0.32, 0.1, 18, { rz: PI / 2, collide: false }); b.cylinder('iron', t.x, Y + 0.68, t.z, 0.025, 0.025, 0.6, 6, { rz: PI / 2, collide: false, noShadow: true });
    col(t.x, Y, t.z, 0.9, 1.0, 0.5);
    I.add('c_hatchet', t.x + 0.3, Y + 0.39, t.z + 0.05, 0.4, 1, { rz: PI / 2 });
    for (const k of [0.8, 2.0, 3.2, 4.4]) { const aa = finish - k; if (!wallFree(aa, 0.25)) continue; const [x, z] = P(aa, RW - 0.06); I.add('c_shield', x, Y + 1.6, z, face(aa), 0.75); }
    scatter('c_firewood', 2, 1.5, 3.2);
    stain(t.x + 0.9, t.z + 0.3, 1.2, '20,16,10', 55); // aceite de engrasar
  }
  if (strawG.length) for (const g of strawG) b.geo('hay', g);
  b.finish(d.scene);
  I.flush();
}
