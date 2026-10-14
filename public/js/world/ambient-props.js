// Mugre, objetos y detalles de calle repartidos por el mapa: que ningún lugar se sienta recién estrenado. Cada zona
// tiene su carácter (el callejón con bolsas, cajones y carteles pegados; el estacionamiento con manchas de aceite y
// conos; el galpón con cubiertas, tachos y herramientas; el bar y el cine con afiches y cosas tiradas...). Dónde va
// cada cosa lo decide la física (rayo hacia el piso: tiene que haber piso parejo, y alrededor tiene que estar libre;
// rayo hacia la pared: se pega de espaldas a ella). Todo lo repetido se fusiona por material (pocos draw calls) y los
// afiches y manchas son calcomanías con textura generada por código. Corre una vez, unos cuadros después de armar el mundo.
import * as THREE from 'three';
import { G, rng } from '../core/G.js';
import { Builder } from './builder.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const HAS_DOM = typeof document !== 'undefined';
const PI = Math.PI, TAU = PI * 2;

// ---------------------------------------------------------------- texturas de calcomanías
const TEX = new Map();
function canvasTex(key, w, h, draw) {
  if (TEX.has(key) || !HAS_DOM) return TEX.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  TEX.set(key, t);
  return t;
}
const mkr = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
function paper(g, w, h, r, base) { // papel viejo: color, manchas y rotos
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '60,40,20' : '255,250,230'},${r() * 0.12})`; g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 14, 0, TAU); g.fill(); }
}
const POSTERS = [
  { id: 'fest', bg: '#1a0a2e', draw(g, w, h, r) { g.fillStyle = '#ff3a8c'; g.font = `bold ${w * 0.2}px Impact, sans-serif`; g.textAlign = 'center'; g.fillText('DESMA', w / 2, h * 0.26); g.fillText('DRE', w / 2, h * 0.44); g.fillStyle = '#3affd8'; g.font = `bold ${w * 0.1}px Arial`; g.fillText('FEST', w / 2, h * 0.56); g.fillStyle = '#fff'; g.font = `${w * 0.06}px Arial`; g.fillText('SÁBADO · TODA LA NOCHE', w / 2, h * 0.7); g.fillText('ENTRADA LIBRE (O NO)', w / 2, h * 0.78); for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(${r() * 360},90%,60%)`; g.beginPath(); g.arc(r() * w, h * 0.9 + r() * 14, 5 + r() * 9, 0, TAU); g.fill(); } } },
  { id: 'wanted', bg: '#cdb98a', draw(g, w, h) { g.fillStyle = '#2a1c10'; g.textAlign = 'center'; g.font = `bold ${w * 0.17}px Georgia`; g.fillText('SE BUSCA', w / 2, h * 0.16); g.fillStyle = '#6a5a40'; g.fillRect(w * 0.2, h * 0.22, w * 0.6, h * 0.42); g.fillStyle = '#2a1c10'; g.beginPath(); g.arc(w / 2, h * 0.38, w * 0.13, 0, TAU); g.fill(); g.fillRect(w * 0.38, h * 0.48, w * 0.24, h * 0.1); g.font = `${w * 0.075}px Georgia`; g.fillText('EL DEL CORTACÉSPED', w / 2, h * 0.74); g.fillText('ROBÓ LA ÚLTIMA BIRRA', w / 2, h * 0.82); g.font = `bold ${w * 0.1}px Georgia`; g.fillText('$ 500', w / 2, h * 0.93); } },
  { id: 'lost', bg: '#e8e2c8', draw(g, w, h) { g.fillStyle = '#c02020'; g.font = `bold ${w * 0.2}px Arial`; g.textAlign = 'center'; g.fillText('¡PERDIDO!', w / 2, h * 0.17); g.fillStyle = '#1a1a1a'; g.beginPath(); g.ellipse(w / 2, h * 0.43, w * 0.2, w * 0.17, 0, 0, TAU); g.fill(); g.beginPath(); g.moveTo(w * 0.32, h * 0.33); g.lineTo(w * 0.34, h * 0.23); g.lineTo(w * 0.4, h * 0.3); g.moveTo(w * 0.68, h * 0.33); g.lineTo(w * 0.66, h * 0.23); g.lineTo(w * 0.6, h * 0.3); g.fill(); g.fillStyle = '#e8e2c8'; for (const dx of [-0.07, 0.07]) { g.beginPath(); g.arc(w * (0.5 + dx), h * 0.42, w * 0.03, 0, TAU); g.fill(); } g.fillStyle = '#1a1a1a'; g.font = `${w * 0.075}px Arial`; g.fillText('GATO NEGRO, RESPONDE A "SATANÁS"', w / 2, h * 0.7); g.fillText('SI LO VEN, NO SE ACERQUEN', w / 2, h * 0.78); g.font = `bold ${w * 0.09}px Arial`; g.fillText('TEL: 555-0666', w / 2, h * 0.9); } },
  { id: 'beer', bg: '#f2c230', draw(g, w, h) { g.fillStyle = '#a01010'; g.font = `bold ${w * 0.3}px Impact, sans-serif`; g.textAlign = 'center'; g.fillText('2x1', w / 2, h * 0.34); g.fillStyle = '#1a1a1a'; g.font = `bold ${w * 0.15}px Impact, sans-serif`; g.fillText('BIRRA', w / 2, h * 0.52); g.font = `${w * 0.075}px Arial`; g.fillText('TODOS LOS JUEVES', w / 2, h * 0.64); g.fillText('(SI TE ACORDÁS)', w / 2, h * 0.72); g.fillStyle = '#7a4a08'; g.fillRect(w * 0.28, h * 0.78, w * 0.14, h * 0.17); g.fillRect(w * 0.58, h * 0.78, w * 0.14, h * 0.17); g.fillStyle = '#fff'; g.fillRect(w * 0.28, h * 0.78, w * 0.14, h * 0.035); g.fillRect(w * 0.58, h * 0.78, w * 0.14, h * 0.035); } },
  { id: 'cine', bg: '#14101c', draw(g, w, h, r) { g.fillStyle = '#e8c860'; g.font = `bold ${w * 0.12}px Georgia`; g.textAlign = 'center'; g.fillText('CINE', w / 2, h * 0.14); g.fillText('GRAN DESMADRE', w / 2, h * 0.24); g.fillStyle = '#3a2a48'; g.fillRect(w * 0.12, h * 0.3, w * 0.76, h * 0.42); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.25})`; g.fillRect(w * 0.12 + r() * w * 0.76, h * 0.3 + r() * h * 0.42, 2, 2); } g.fillStyle = '#c02a2a'; g.font = `bold ${w * 0.11}px Impact, sans-serif`; g.fillText('LA NOCHE DE', w / 2, h * 0.52); g.fillText('LOS CORTACÉSPEDES', w / 2, h * 0.62); g.fillStyle = '#e8e0d0'; g.font = `${w * 0.06}px Arial`; g.fillText('PROHIBIDA PARA MENORES Y PARA VIVOS', w / 2, h * 0.82); g.fillText('ESTRENO · FUNCIÓN ÚNICA', w / 2, h * 0.9); } },
  { id: 'nofumar', bg: '#e8e8e0', draw(g, w, h) { g.strokeStyle = '#c02020'; g.lineWidth = w * 0.05; g.beginPath(); g.arc(w / 2, h * 0.36, w * 0.28, 0, TAU); g.moveTo(w * 0.3, h * 0.2); g.lineTo(w * 0.7, h * 0.52); g.stroke(); g.fillStyle = '#1a1a1a'; g.fillRect(w * 0.32, h * 0.34, w * 0.34, h * 0.04); g.fillStyle = '#e08020'; g.fillRect(w * 0.6, h * 0.34, w * 0.06, h * 0.04); g.fillStyle = '#c02020'; g.font = `bold ${w * 0.14}px Arial`; g.textAlign = 'center'; g.fillText('NO FUMAR', w / 2, h * 0.8); g.fillStyle = '#1a1a1a'; g.font = `${w * 0.06}px Arial`; g.fillText('(EXCEPTO EN EL COFFEESHOP)', w / 2, h * 0.9); } },
  { id: 'band', bg: '#0e1a14', draw(g, w, h, r) { g.fillStyle = '#7aff4a'; g.font = `bold ${w * 0.13}px Impact, sans-serif`; g.textAlign = 'center'; g.fillText('LOS ÚLTIMOS', w / 2, h * 0.2); g.fillText('CORTADORES', w / 2, h * 0.34); for (let i = 0; i < 6; i++) { g.strokeStyle = `rgba(122,255,74,${0.2 + r() * 0.5})`; g.lineWidth = 3; g.beginPath(); g.moveTo(0, h * (0.45 + i * 0.06)); for (let x = 0; x <= w; x += 12) g.lineTo(x, h * (0.45 + i * 0.06) + Math.sin(x * 0.07 + i) * 10); g.stroke(); } g.fillStyle = '#fff'; g.font = `${w * 0.07}px Arial`; g.fillText('EN VIVO · VIERNES · EL BÚNKER', w / 2, h * 0.88); } },
];
function poster(i, set) {
  const P = set ? POSTERS[set[i % set.length]] : POSTERS[i % POSTERS.length];
  return canvasTex('poster' + P.id + (set ? 's' : ''), 256, 384, (g, w, h) => { const r = mkr(i * 71 + 5); paper(g, w, h, r, P.bg); P.draw(g, w, h, r); for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`; g.fillRect(r() * w, 0, 1 + r() * 3, h); } g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2); g.fillStyle = 'rgba(210,200,170,0.35)'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); });
}
function graffiti(i) { // etiquetas de aerosol con goteo
  const words = ['DESMA', 'OK', '666', 'LUZ', 'PUNK', 'NADA', '¡BASTA!', 'CORTA', 'RATA'];
  return canvasTex('tag' + (i % words.length), 256, 128, (g, w, h) => {
    const r = mkr(i * 131 + 9); g.clearRect(0, 0, w, h);
    const col = ['#ff3a8c', '#3affd8', '#ffd83a', '#7a4aff', '#ff6a3a'][i % 5];
    g.font = `bold ${h * 0.62}px Impact, sans-serif`; g.textAlign = 'center'; g.lineWidth = 7; g.strokeStyle = '#0a0a0a'; g.strokeText(words[i % words.length], w / 2, h * 0.68); g.fillStyle = col; g.fillText(words[i % words.length], w / 2, h * 0.68);
    for (let k = 0; k < 7; k++) { const x = w * 0.2 + r() * w * 0.6, len = 10 + r() * 40; g.fillStyle = col; g.fillRect(x, h * 0.7, 3, len); g.beginPath(); g.arc(x + 1.5, h * 0.7 + len, 3, 0, TAU); g.fill(); }
  });
}
// mancha de aceite: centro casi negro y moteado que se desvanece en el borde, con un brillo tornasolado apenas visible
function oilTex() {
  return canvasTex('oil', 256, 256, (g, w, h) => {
    const r = mkr(5);
    for (let i = 0; i < 14; i++) { const cx = 128 + (r() - 0.5) * 90, cy = 128 + (r() - 0.5) * 90, rr = 20 + r() * 70; const gr = g.createRadialGradient(cx, cy, 2, cx, cy, rr); gr.addColorStop(0, `rgba(8,8,10,${0.22 + r() * 0.25})`); gr.addColorStop(0.7, `rgba(10,10,12,${0.08 + r() * 0.1})`); gr.addColorStop(1, 'rgba(10,10,12,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, rr, rr * (0.6 + r() * 0.4), r() * 3, 0, TAU); g.fill(); }
    for (let i = 0; i < 5; i++) { const a = r() * TAU, rr = 40 + r() * 50; g.strokeStyle = `hsla(${200 + r() * 140},60%,55%,0.05)`; g.lineWidth = 3 + r() * 6; g.beginPath(); g.ellipse(128, 128, rr, rr * 0.75, a, 0, TAU); g.stroke(); }
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.12})`; g.fillRect(r() * w, r() * h, 2, 2); }
  });
}
// hojas secas: hojitas con punta y nervadura, marrones y oliva apagados, algunas enteras y otras rotas
function leavesTex() {
  return canvasTex('leaves', 256, 256, (g, w, h) => {
    const r = mkr(11), cols = ['#5e3a1a', '#6b4720', '#4d3216', '#5a5226', '#73502a', '#3e2a14', '#6a5a30'];
    for (let i = 0; i < 70; i++) {
      const s = 5 + r() * 9;
      g.save(); g.translate(20 + r() * (w - 40), 20 + r() * (h - 40)); g.rotate(r() * TAU);
      g.fillStyle = cols[Math.floor(r() * cols.length)]; g.globalAlpha = 0.65 + r() * 0.35;
      g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(-s * 0.2, -s * 0.55, s, 0); g.quadraticCurveTo(-s * 0.2, s * 0.55, -s, 0); g.fill();
      g.strokeStyle = 'rgba(30,18,8,0.5)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-s * 1.3, 0); g.lineTo(s * 0.9, 0); g.stroke();
      if (r() < 0.3) { g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(r() * s - s / 2, (r() - 0.5) * s * 0.4, s * 0.3, 0, TAU); g.fill(); g.globalCompositeOperation = 'source-over'; }
      g.restore();
    }
  });
}
function puddleTex() {
  return canvasTex('puddle', 128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(52,66,86,0.8)'); gr.addColorStop(0.7, 'rgba(30,40,56,0.62)'); gr.addColorStop(1, 'rgba(18,24,34,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(64, 64, 60, 46, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(190,210,235,0.16)'; g.beginPath(); g.ellipse(52, 56, 22, 9, -0.3, 0, TAU); g.fill(); });
}
// Las calcomanías se juntan por textura y se fusionan en una sola malla cada una (cientos de afiches, manchas y hojas: pocas
// llamadas de dibujo). La opacidad y las opciones del material son las de la primera de cada grupo.
const BATCH = new Map();
const DUMMY = new THREE.Object3D();
function decal(scene, tex, x, y, z, w, h, nx, ny, nz, rot = 0, opacity = 1, op = {}) {
  if (!tex) return;
  const g = new THREE.PlaneGeometry(w, h);
  DUMMY.position.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
  DUMMY.rotation.set(0, 0, 0);
  if (ny > 0.5) { DUMMY.rotation.x = -PI / 2; DUMMY.rotation.z = rot; } else DUMMY.rotation.y = Math.atan2(nx, nz);
  DUMMY.updateMatrix(); g.applyMatrix4(DUMMY.matrix);
  const key = tex.uuid + '|' + opacity + '|' + JSON.stringify(op);
  let e = BATCH.get(key);
  if (!e) BATCH.set(key, e = { tex, opacity, op, geos: [] });
  e.geos.push(g);
}
function flushDecals(scene) {
  for (const e of BATCH.values()) {
    const merged = mergeGeometries(e.geos, false);
    for (const g of e.geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    // con luz (de noche las hojas y los afiches no brillan solos); solo las vitrinas iluminadas (toneMapped: false) no
    const lit = e.op.toneMapped !== false;
    const props = { map: e.tex, transparent: true, opacity: e.opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, ...e.op };
    const m = new THREE.Mesh(merged, lit ? new THREE.MeshStandardMaterial({ roughness: e.tex === TEX.get('puddle') ? 0.08 : 0.92, metalness: 0, ...props }) : new THREE.MeshBasicMaterial(props));
    m.receiveShadow = lit;
    m.renderOrder = 2; m.matrixAutoUpdate = false; m.userData.static = true;
    scene.add(m);
  }
  BATCH.clear();
}

// ---------------------------------------------------------------- sondeos con la física
const NOT_ME = (c) => G.phys.info(c)?.kind !== 'me';
function groundAt(x, z, y0 = 3) {
  const h = G.phys.raycast(x, y0, z, 0, -1, 0, y0 + 1, undefined, null, NOT_ME);
  return h && h.ny > 0.9 ? h : null;
}
function freeAround(x, y, z, r) {
  for (let a = 0; a < 6.3; a += 1.05) { const h = G.phys.raycast(x, y + 0.45, z, Math.sin(a), 0, Math.cos(a), r, undefined, null, NOT_ME); if (h) return false; }
  return true;
}
// Lo que ocupa cada cosa (medias medidas x, z y alto). Antes solo se tiraban seis rayos desde el centro: un banco de
// 1.7 m quedaba con la punta metida en el mostrador del puesto de manzanas, en una silla o en una pared
const FOOT = {
  bench: [0.9, 0.36, 0.95], benchRoad: [0.9, 0.36, 0.95], bin: [0.3, 0.3, 0.95], hydrant: [0.2, 0.2, 0.85], mailbox: [0.28, 0.2, 1.4],
  rock: [0.55, 0.55, 0.6], bush: [0.75, 0.75, 1.0], flowers: [0.6, 0.6, 0.4], logs: [0.95, 0.35, 0.5], crates: [0.45, 0.45, 1.1],
  barrels: [0.5, 0.5, 1.0], bags: [0.5, 0.5, 0.7], tires: [0.4, 0.4, 0.9], cone: [0.2, 0.2, 0.65], litter: [0.8, 0.8, 0.15],
};
let RESERVED = null; // puntos de uso (X), asientos y puestos: ahí no se tira nada
function reserved(world) {
  if (RESERVED) return RESERVED;
  RESERVED = [];
  for (const list of [world.interact, world.castle?.interact, world.club?.interact]) for (const it of list || []) if (it?.p) RESERVED.push([it.p[0], it.p[2], (it.r || 1.5) * 0.7 + 0.4]);
  for (const st of world.seats || []) RESERVED.push([st.x, st.z, 0.9]);
  return RESERVED;
}
function fits(world, kind, x, y, z, yaw, pad = 0.1) {
  const f = FOOT[kind];
  if (!f) return true;
  for (const [rx, rz, rr] of reserved(world)) if ((x - rx) ** 2 + (z - rz) ** 2 < (rr + Math.max(f[0], f[1])) ** 2) return false;
  // la caja del objeto (con 10 cm de aire alrededor), apenas levantada del piso: no puede tocar nada
  return !G.phys.overlapBox?.(x, y + 0.07 + f[2] / 2, z, f[0] + pad, f[2] / 2, f[1] + pad, yaw, undefined, NOT_ME);
}
// una pared cerca (a menos de maxD) en alguna de las cuatro direcciones: { nx, nz, d, x, z } con la normal hacia afuera
function wallNear(x, y, z, maxD) {
  let best = null;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const h = G.phys.raycast(x, y + 1.2, z, dx, 0, dz, maxD, undefined, null, NOT_ME);
    if (h && Math.abs(h.ny) < 0.3 && (!best || h.dist < best.d)) best = { nx: -dx, nz: -dz, d: h.dist, x: h.x, z: h.z };
  }
  return best;
}

// ---------------------------------------------------------------- los objetos (cada uno devuelve cuánto lugar ocupa)
function trashBags(b, x, y, z, rnd) {
  const n = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const g = new THREE.SphereGeometry(0.26 + rnd() * 0.1, 8, 6), p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const s = 1 + 0.15 * Math.sin(p.getX(k) * 21 + p.getZ(k) * 17); p.setXYZ(k, p.getX(k) * s, p.getY(k) * (0.8 + 0.15 * s), p.getZ(k) * s); }
    g.translate(x + (rnd() - 0.5) * 0.7, y + 0.22 + (i === 2 ? 0.25 : 0), z + (rnd() - 0.5) * 0.7);
    b.geo(rnd() < 0.7 ? 'black' : 'darkgray', g);
    const knot = new THREE.ConeGeometry(0.05, 0.12, 5); knot.translate(x + (rnd() - 0.5) * 0.6, y + 0.52, z + (rnd() - 0.5) * 0.6); b.geo('black', knot);
  }
  return 0.9;
}
function crateStack(b, x, y, z, yaw, rnd) {
  const c = Math.cos(yaw), sn = Math.sin(yaw), n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const s = 0.5 + rnd() * 0.16, o = (i - (n - 1) / 2) * 0.58, px = x + c * o, pz = z - sn * o, yw = yaw + (rnd() - 0.5) * 0.4;
    b.box('woodDark', px, y + s / 2, pz, s, s, s, { yaw: yw, collide: true });
    for (const k of [-1, 1]) b.box('oldWood', px, y + s / 2 + k * s * 0.42, pz, s + 0.02, 0.05, s + 0.02, { yaw: yw, collide: false, noShadow: true });
    if (i === 1 && n === 3) b.box('woodDark', px, y + s * 1.5, pz, s * 0.9, s * 0.9, s * 0.9, { yaw: yw + 0.3, collide: true });
  }
  return 1.4;
}
function barrelGroup(b, x, y, z, rnd, rust = true) {
  const n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) { const px = x + (i % 2) * 0.62 - 0.3, pz = z + Math.floor(i / 2) * 0.6; b.cylinder(rust ? 'rust' : 'metal', px, y + 0.45, pz, 0.28, 0.3, 0.9, 12, { collide: true }); for (const yy of [0.18, 0.45, 0.72]) b.cylinder('iron', px, y + yy, pz, 0.31, 0.31, 0.035, 12, { collide: false, noShadow: true }); }
  return 1.2;
}
function tireStack(b, x, y, z, rnd) {
  const n = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) { const g = new THREE.TorusGeometry(0.27, 0.11, 8, 16); g.rotateX(PI / 2); g.translate(x + (rnd() - 0.5) * 0.05, y + 0.11 + i * 0.2, z + (rnd() - 0.5) * 0.05); b.geo('black', g); }
  G.phys.cylinder(x, y + (0.2 * n + 0.1) / 2, z, (0.2 * n + 0.1) / 2, 0.36, { mat: 'wood' });
  return 0.8;
}
function cone(b, x, y, z, rnd) {
  const g = new THREE.ConeGeometry(0.14, 0.62, 10); g.translate(x, y + 0.31, z); b.geo('orange', g);
  G.phys.cylinder(x, y + 0.3, z, 0.3, 0.13, { mat: 'wood' });
  b.cylinder('white', x, y + 0.33, z, 0.08, 0.1, 0.1, 10, { collide: false, noShadow: true });
  b.box('black', x, y + 0.02, z, 0.36, 0.04, 0.36, { collide: false, noShadow: true });
  return 0.5;
}
function bench(b, x, y, z, yaw) { // el respaldo queda del lado -z local; yaw = hacia dónde mira
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  b.box('oldWood', x, y + 0.45, z, 1.7, 0.07, 0.5, { yaw, collide: true });
  b.box('oldWood', x - sn * 0.22, y + 0.8, z - c * 0.22, 1.7, 0.4, 0.07, { yaw, collide: false, noShadow: true });
  for (const k of [-0.7, 0.7]) b.box('iron', x + c * k, y + 0.22, z - sn * k, 0.07, 0.44, 0.46, { yaw, collide: false, noShadow: true });
  return 1.4;
}
function trashBin(b, x, y, z) {
  b.cylinder('darkgray', x, y + 0.42, z, 0.27, 0.23, 0.84, 10, { collide: true });
  b.cylinder('iron', x, y + 0.87, z, 0.29, 0.29, 0.05, 10, { collide: false, noShadow: true });
  for (const yy of [0.2, 0.55]) b.cylinder('iron', x, y + yy, z, 0.275, 0.275, 0.025, 10, { collide: false, noShadow: true });
  b.cylinder('black', x + 0.05, y + 0.92, z, 0.1, 0.1, 0.06, 6, { collide: false, noShadow: true });
  return 0.7;
}
function hydrant(b, x, y, z) {
  b.cylinder('red', x, y + 0.36, z, 0.1, 0.12, 0.72, 10, { collide: true });
  const cap = new THREE.SphereGeometry(0.115, 10, 6, 0, TAU, 0, PI / 2); cap.translate(x, y + 0.72, z); b.geo('red', cap);
  b.cylinder('chrome', x, y + 0.8, z, 0.03, 0.03, 0.06, 6, { collide: false, noShadow: true });
  b.cylinder('chrome', x, y + 0.5, z, 0.05, 0.05, 0.34, 8, { collide: false, noShadow: true, rz: PI / 2 });
  b.cylinder('red', x, y + 0.05, z, 0.15, 0.15, 0.1, 10, { collide: false, noShadow: true });
  return 0.6;
}
function mailbox(b, x, y, z, yaw) {
  b.cylinder('darkgray', x, y + 0.55, z, 0.04, 0.04, 1.1, 6, { collide: true });
  b.box('fabricBlue', x, y + 1.2, z, 0.5, 0.3, 0.34, { yaw, collide: false });
  b.box('white', x + Math.sin(yaw) * 0.18, y + 1.2, z + Math.cos(yaw) * 0.18, 0.28, 0.04, 0.02, { yaw, collide: false, noShadow: true });
  return 0.6;
}
function rock(b, x, y, z, rnd, big = false) {
  const s = (big ? 0.5 : 0.25) + rnd() * (big ? 0.5 : 0.3);
  let g = mergeVertices(new THREE.IcosahedronGeometry(s, 2)); const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) { const v = 1 + 0.22 * Math.sin(p.getX(k) * 9 + p.getZ(k) * 7 + x) + 0.1 * Math.cos(p.getY(k) * 13); p.setXYZ(k, p.getX(k) * v * (1.1 + rnd() * 0.3), p.getY(k) * v * 0.7, p.getZ(k) * v); }
  g.computeVertexNormals(); g.translate(x, y + s * 0.3, z);
  b.geo('gray', g);
  if (big || rnd() < 0.4) { const m = new THREE.SphereGeometry(s * 0.8, 8, 4, 0, TAU, 0, PI / 2); m.scale(1, 0.4, 1); m.translate(x + (rnd() - 0.5) * s * 0.4, y + s * 0.78, z + (rnd() - 0.5) * s * 0.4); b.geo('moss', m); }
  if (big) G.phys.cylinder(x, y + s * 0.5, z, s * 0.5, s * 0.9, { mat: 'rock' });
  return s * 2;
}
function flowers(b, x, y, z, rnd) {
  const col = ['yellow', 'cream', 'pink', 'red'][Math.floor(rnd() * 5)];
  for (let i = 0; i < 12; i++) { const px = x + (rnd() - 0.5) * 1.1, pz = z + (rnd() - 0.5) * 1.1, h = 0.18 + rnd() * 0.18; b.cylinder('green', px, y + h / 2, pz, 0.004, 0.006, h, 3, { collide: false, noShadow: true }); const f = new THREE.SphereGeometry(0.03 + rnd() * 0.02, 5, 4); f.translate(px, y + h, pz); b.geo(col, f); }
  return 1;
}
function bush(b, x, y, z, rnd) {
  const n = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) { const g = new THREE.IcosahedronGeometry(0.3 + rnd() * 0.25, 1); g.translate(x + (rnd() - 0.5) * 0.9, y + 0.3 + rnd() * 0.3, z + (rnd() - 0.5) * 0.9); b.geo('hedge', g); }
  G.phys.cylinder(x, y + 0.45, z, 0.45, 0.65, { mat: 'wood' });
  return 1.4;
}
function logPile(b, x, y, z, yaw, rnd) {
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) { const g = new THREE.CylinderGeometry(0.1, 0.1, 1.3 + rnd() * 0.5, 7); g.rotateZ(PI / 2); g.rotateY(yaw + (rnd() - 0.5) * 0.2); g.translate(x, y + 0.1 + Math.floor(i / 2) * 0.17, z + (i % 2) * 0.2 - (i > 1 ? 0.1 : 0) + (rnd() - 0.5) * 0.02); b.geo('bark', g); }
  return 1.6;
}
function paperLitter(b, x, y, z, rnd) {
  for (let i = 0; i < 2 + Math.floor(rnd() * 3); i++) { b.box(['linen', 'dustSheet', 'cream', 'darkgray'][Math.floor(rnd() * 4)], x + (rnd() - 0.5) * 1.6, y + 0.006, z + (rnd() - 0.5) * 1.6, 0.14 + rnd() * 0.1, 0.004, 0.1 + rnd() * 0.12, { yaw: rnd() * TAU, collide: false, noShadow: true }); }
  for (let i = 0; i < 2; i++) b.cylinder('red', x + (rnd() - 0.5) * 1.4, y + 0.04, z + (rnd() - 0.5) * 1.4, 0.035, 0.03, 0.08, 8, { collide: false, noShadow: true, rz: PI / 2, yaw: rnd() * TAU }); // latitas
  return 0.2;
}

// ---------------------------------------------------------------- zonas
// rect = [x0, z0, x1, z1]; items: [kind, cuántos]; mode: 'open' (campo abierto), 'wall' (pegado a la pared)
const ZONES = [
  { id: 'callejon', rect: [96, -19.6, 122.6, -12.4], items: [['bags', 5, 'wall'], ['crates', 3, 'wall'], ['barrels', 2, 'wall'], ['litter', 8, 'open'], ['puddle', 5, 'open'], ['leaves', 5, 'open'], ['poster', 9, 'wallv'], ['tag', 7, 'wallv']] },
  { id: 'estacionamiento', rect: [96, 19, 122.6, 43.5], items: [['oil', 14, 'open'], ['cone', 4, 'wall'], ['puddle', 6, 'open'], ['leaves', 6, 'open'], ['litter', 8, 'open'], ['bags', 2, 'wall'], ['poster', 3, 'wallv']] },
  { id: 'bar_afuera', rect: [93, -44, 124.6, -42], items: [['bench', 2, 'wall'], ['litter', 3, 'open'], ['puddle', 3, 'open'], ['poster', 6, 'wallv'], ['tag', 3, 'wallv']] },
  { id: 'bar_dentro', posters: [0, 3, 6, 1, 5, 2], rect: [96, -41, 122, -21], items: [['poster', 9, 'wallv'], ['crates', 2, 'wall'], ['barrels', 2, 'wall'], ['litter', 6, 'open'], ['bags', 1, 'wall']] },
  { id: 'cine_dentro', posters: [4, 4, 5, 6, 1], rect: [96, -11, 122, 15], items: [['poster', 10, 'wallv'], ['litter', 14, 'open'], ['bags', 2, 'wall']] },
  { id: 'cine_afuera', posters: [4, 6, 0, 2], rect: [93, -13, 124.5, 17], items: [['bench', 2, 'wall'], ['poster', 6, 'wallv'], ['tag', 4, 'wallv'], ['litter', 5, 'open'], ['puddle', 4, 'open'], ['leaves', 4, 'open']] },
  { id: 'galpon', rect: [-101, -21, -87, -7], items: [['tires', 5, 'wall'], ['barrels', 4, 'wall'], ['crates', 3, 'wall'], ['oil', 8, 'open'], ['litter', 5, 'open'], ['poster', 4, 'wallv']] },
  { id: 'galpon_afuera', rect: [-106, -26, -82, -3], items: [['cone', 3, 'wall'], ['oil', 6, 'open'], ['leaves', 6, 'open'], ['puddle', 4, 'open'], ['litter', 6, 'open'], ['tires', 3, 'wall'], ['barrels', 2, 'wall']] },
  { id: 'pasto', rect: [-68, -48, 68, 56], items: [['rock', 16, 'open'], ['bush', 12, 'open'], ['flowers', 22, 'open'], ['logs', 3, 'open']] },
  { id: 'entrada', rect: [-34, -78, 34, -52], items: [['rock', 8, 'open'], ['bush', 6, 'open'], ['flowers', 12, 'open'], ['leaves', 12, 'open'], ['puddle', 8, 'open'], ['bench', 3, 'open'], ['litter', 6, 'open']] },
  { id: 'castillo_afuera', rect: [-56, -140, 56, -80], items: [['rock', 10, 'open'], ['bush', 6, 'open'], ['leaves', 10, 'open']] },
  { id: 'ruta_vereda', rect: [92.3, -118, 94.4, 118], items: [['bin', 14, 'open'], ['hydrant', 7, 'open'], ['benchRoad', 11, 'open'], ['mailbox', 5, 'open'], ['litter', 24, 'open'], ['leaves', 10, 'open'], ['puddle', 8, 'open']] },
  { id: 'ruta_calzada', rect: [82.4, -118, 89.6, 118], items: [['puddle', 18, 'open'], ['oil', 12, 'open'], ['leaves', 10, 'open'], ['litter', 8, 'open']] },
  { id: 'autocine', rect: [-19, 62, 19, 77], items: [['litter', 8, 'open'], ['puddle', 3, 'open'], ['leaves', 4, 'open']] },
  { id: 'cancha', rect: [-34, 12, 34, 58], items: [['litter', 10, 'open'], ['bench', 4, 'open'], ['cone', 6, 'open'], ['leaves', 6, 'open']] },
];

function dressZone(world, zone, rnd) {
  const b = new Builder(world.phys);
  const [x0, z0, x1, z1] = zone.rect;
  for (const [kind, count, mode] of zone.items) {
    let placed = 0, tries = 0;
    while (placed < count && tries++ < count * 14) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      const gh = groundAt(x, z); if (!gh || Math.abs(gh.y) > 0.3) continue;
      const y = gh.y;
      if (mode === 'wallv') { // afiche o etiqueta pegado en una pared vertical a la altura de la vista
        const w = wallNear(x, 0, z, 2.6); if (!w) continue;
        const hh = G.phys.raycast(x, 1.7, z, -w.nx, 0, -w.nz, 2.8, undefined, null, NOT_ME);
        if (!hh || Math.abs(hh.dist - w.d) > 0.06) continue; // pared pareja en esa altura (no un hueco o una ventana)
        const dw = kind === 'poster' ? 0.7 + rnd() * 0.35 : 1.2 + rnd() * 0.8, hw = dw / 2 + 0.1;
        let flat = true;
        for (const [ox, oy] of [[hw, 0.6], [-hw, 0.6], [hw, -0.5], [-hw, -0.5]]) { const q = G.phys.raycast(hh.x + w.nx * 0.3 + w.nz * ox, 1.5 + oy, hh.z + w.nz * 0.3 - w.nx * ox, -w.nx, 0, -w.nz, 1, undefined, null, NOT_ME); if (!q || Math.abs(q.dist - 0.3) > 0.07) { flat = false; break; } }
        if (!flat) continue;
        if (kind === 'poster') { const s = dw; decal(world.scene, poster(Math.floor(rnd() * 20), zone.posters), hh.x, 1.55 + (rnd() - 0.5) * 0.5, hh.z, s, s * 1.5, w.nx, 0, w.nz, 0, 0.95); }
        else decal(world.scene, graffiti(Math.floor(rnd() * 20)), hh.x, 1.0 + rnd() * 0.9, hh.z, dw, dw * 0.5, w.nx, 0, w.nz, 0, 0.95);
        placed++; continue;
      }
      if (mode === 'wall') {
        const w = wallNear(x, y, z, 1.4); if (!w || w.d < 0.5) continue;
        const gx = w.x + w.nx * 0.55, gz = w.z + w.nz * 0.55;
        const g2 = groundAt(gx, gz); if (!g2 || Math.abs(g2.y - y) > 0.2 || !freeAround(gx, g2.y, gz, 0.55)) continue;
        const yaw = Math.atan2(w.nx, w.nz) + (rnd() - 0.5) * 0.5;
        if (!fits(world, kind, gx + w.nx * 0.08, g2.y, gz + w.nz * 0.08, kind === 'bench' ? Math.atan2(w.nx, w.nz) : yaw, 0.02)) continue;
        if (kind === 'bags') trashBags(b, gx, g2.y, gz, rnd);
        else if (kind === 'crates') crateStack(b, gx, g2.y, gz, yaw, rnd);
        else if (kind === 'barrels') barrelGroup(b, gx, g2.y, gz, rnd);
        else if (kind === 'tires') tireStack(b, gx, g2.y, gz, rnd);
        else if (kind === 'cone') { cone(b, gx, g2.y, gz, rnd); if (rnd() < 0.6) cone(b, gx + w.nz * 0.4, g2.y, gz - w.nx * 0.4, rnd); } // contra la pared, de a uno o dos (no en el medio del playón)
        else if (kind === 'bench') bench(b, gx, g2.y, gz, Math.atan2(w.nx, w.nz));
        placed++; continue;
      }
      // campo abierto
      if (!freeAround(x, y, z, kind === 'bush' ? 1.0 : 0.6)) continue;
      const yaw = rnd() * TAU;
      if (!fits(world, kind, x, y, z, kind === 'benchRoad' || kind === 'mailbox' ? -PI / 2 : yaw)) continue;
      if (kind === 'oil') decal(world.scene, oilTex(), x, y, z, 0.8 + rnd() * 1.6, 0.8 + rnd() * 1.4, 0, 1, 0, rnd() * TAU, 0.85);
      else if (kind === 'puddle') decal(world.scene, puddleTex(), x, y, z, 1.0 + rnd() * 2.2, 0.8 + rnd() * 1.4, 0, 1, 0, rnd() * TAU, 0.9, { depthTest: true });
      else if (kind === 'leaves') decal(world.scene, leavesTex(), x, y, z, 1.4 + rnd() * 1.6, 1.4 + rnd() * 1.6, 0, 1, 0, rnd() * TAU, 0.95);
      else if (kind === 'litter') paperLitter(b, x, y, z, rnd);
      else if (kind === 'cone') cone(b, x, y, z, rnd);
      else if (kind === 'rock') rock(b, x, y, z, rnd, rnd() < 0.3);
      else if (kind === 'bush') bush(b, x, y, z, rnd);
      else if (kind === 'flowers') flowers(b, x, y, z, rnd);
      else if (kind === 'logs') logPile(b, x, y, z, yaw, rnd);
      else if (kind === 'bench') bench(b, x, y, z, yaw);
      else if (kind === 'benchRoad') bench(b, x, y, z, -PI / 2);
      else if (kind === 'bin') trashBin(b, x, y, z);
      else if (kind === 'hydrant') hydrant(b, x, y, z);
      else if (kind === 'mailbox') mailbox(b, x, y, z, -PI / 2);
      else if (kind === 'bags') trashBags(b, x, y, z, rnd);
      else if (kind === 'crates') crateStack(b, x, y, z, yaw, rnd);
      else if (kind === 'barrels') barrelGroup(b, x, y, z, rnd);
      placed++;
    }
  }
  b.finish(world.scene);
}

// el cine: apliques en las paredes, carteles de SALIDA que brillan en la oscuridad y pliegues en las cortinas de la pantalla
function cineDetails(world) {
  const b = new Builder(world.phys), Z0 = -12, Z1 = 16;
  for (let x = 105.5; x < 121; x += 3) for (const [z, nz] of [[Z0 + 0.2, 1], [Z1 - 0.2, -1]]) {
    b.box('bronze', x, 2.35, z + nz * 0.08, 0.14, 0.5, 0.1, { collide: false, noShadow: true });
    b.box('lamp', x, 2.35, z + nz * 0.15, 0.1, 0.34, 0.06, { collide: false, noShadow: true });
    b.box('lamp', x, 2.92, z + nz * 0.13, 0.2, 0.05, 0.1, { collide: false, noShadow: true });
  }
  for (const side of [-1, 1]) for (let i = 0; i < 6; i++) b.box('leatherRed', 122.1, 4.1, 2 + side * (13 / 2 + 1.2) + (i - 2.5) * 0.28, 0.14, 7.9, 0.2, { collide: false, noShadow: true });
  b.box('leatherRed', 122.2, 8.0, 2, 0.5, 0.5, 17, { collide: false, noShadow: true }); // la cenefa de arriba
  b.finish(world.scene);
  const tex = canvasTex('exit', 256, 96, (g, w, h) => { g.fillStyle = '#04200c'; g.fillRect(0, 0, w, h); g.fillStyle = '#3dff7a'; g.font = `bold ${h * 0.55}px Arial`; g.textAlign = 'center'; g.fillText('SALIDA', w * 0.4, h * 0.68); g.beginPath(); g.moveTo(w * 0.8, h * 0.25); g.lineTo(w * 0.95, h * 0.5); g.lineTo(w * 0.8, h * 0.75); g.lineTo(w * 0.82, h * 0.55); g.lineTo(w * 0.7, h * 0.55); g.lineTo(w * 0.7, h * 0.45); g.lineTo(w * 0.82, h * 0.45); g.fill(); });
  if (tex) for (const [x, y, z, ry] of [[95.2, 3.45, 14, Math.PI / 2], [122.6, 6.3, -9, -Math.PI / 2], [122.6, 6.3, 13, -Math.PI / 2]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.375), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.position.set(x, y, z); m.rotation.y = ry; world.scene.add(m);
  }
}

// las fachadas del bar y del cine que dan a la ruta: zócalo, pilastras, cornisa, vitrinas con afiches y ventanas encendidas
function facades(world) {
  const b = new Builder(world.phys), X = 94.8;
  // cine
  b.box('darkgray', X, 0.45, 2, 0.12, 0.9, 28.2, { collide: false, noShadow: true });
  b.box('cream', X, 7.75, 2, 0.34, 0.3, 28.8, { collide: false });
  b.box('cream', X, 7.3, 2, 0.2, 0.12, 28.4, { collide: false, noShadow: true });
  for (const z of [-11.85, 15.85, -4.2, 8.2]) { b.box('cream', X, 4, z, 0.26, 8, 0.5, { collide: false }); b.box('cream', X, 0.2, z, 0.34, 0.4, 0.64, { collide: false, noShadow: true }); b.box('cream', X, 7.6, z, 0.34, 0.3, 0.64, { collide: false, noShadow: true }); }
  for (const [z, pi] of [[-8, 4], [-6.3, 1], [10.2, 5], [12, 6]]) { // vitrinas de afiches con luz propia
    b.box('black', X - 0.02, 1.9, z, 0.1, 2.1, 1.4, { collide: false, noShadow: true });
    b.box('lamp', X - 0.07, 3.0, z, 0.04, 0.06, 1.2, { collide: false, noShadow: true });
    decal(world.scene, poster(pi), X - 0.08, 1.85, z, 1.2, 1.8, -1, 0, 0, 0, 1, { toneMapped: false });
  }
  // bar
  b.box('darkgray', X, 0.5, -31, 0.12, 1.0, 22, { collide: false, noShadow: true });
  b.box('woodDark', X, 5.3, -31, 0.34, 0.3, 22.8, { collide: false });
  for (const z of [-41.85, -20.15]) b.box('woodDark', X, 2.7, z, 0.26, 5.4, 0.5, { collide: false });
  for (const z of [-37.5, -24.5]) {
    b.box('woodDark', X, 1.95, z, 0.14, 1.7, 3.0, { collide: false, noShadow: true });
    b.box('winGlow', X - 0.05, 1.95, z, 0.04, 1.4, 2.7, { collide: false, noShadow: true });
    for (const k of [-0.45, 0.45]) b.box('woodDark', X - 0.08, 1.95, z + k * 1.5, 0.05, 1.4, 0.06, { collide: false, noShadow: true });
    b.box('woodDark', X - 0.08, 1.95, z, 0.05, 0.06, 2.7, { collide: false, noShadow: true });
    b.box('stone', X - 0.1, 1.05, z, 0.22, 0.1, 3.2, { collide: false, noShadow: true });
  }
  for (const z of [-37.5, -24.5]) decal(world.scene, graffiti(z < -30 ? 3 : 8), X - 0.09, 0.6, z, 1.6, 0.8, -1, 0, 0, 0, 0.9);
  b.finish(world.scene);
}

// el autocine: postes con parlante para cada lugar, igual que los de verdad (colgados de la ventanilla)
function autocine(world, rnd) {
  const b = new Builder(world.phys);
  for (const z of [64.5, 69, 73.5]) for (let x = -15; x <= 15; x += 5) {
    const gh = groundAt(x, z); if (!gh || Math.abs(gh.y) > 0.3) continue;
    b.cylinder('iron', x, gh.y + 0.65, z, 0.025, 0.03, 1.3, 6, { collide: true });
    b.box('darkgray', x, gh.y + 1.2, z + 0.12, 0.26, 0.32, 0.14, { collide: false, noShadow: true });
    b.box('black', x, gh.y + 1.2, z + 0.2, 0.2, 0.24, 0.02, { collide: false, noShadow: true });
    b.box('iron', x, gh.y + 0.12, z, 0.3, 0.05, 0.3, { collide: false, noShadow: true }); // la base
    b.cylinder('metal', x, gh.y + 1.32, z + 0.12, 0.012, 0.012, 0.3, 4, { collide: false, noShadow: true, rx: PI / 2 });
  }
  b.finish(world.scene);
}

export function dressAmbient(world) {
  let frames = 0, done = false;
  const rnd = rng(60606);
  const prev = world.update?.bind(world);
  world.update = (...a) => {
    prev?.(...a);
    if (done) return;
    // ya adentro (con los objetos sueltos de la sala cargados: sillas, mesas...), así nada cae encima de ellos
    if (!G.inGame || !G.phys?.world || ++frames < 90) return;
    done = true;
    for (const z of ZONES) { try { dressZone(world, z, rnd); } catch (e) { console.warn('ambiente', z.id, e); } }
    try { cineDetails(world); } catch (e) { console.warn('ambiente cine', e); }
    try { autocine(world, rnd); } catch (e) { console.warn('ambiente autocine', e); }
    try { facades(world); } catch (e) { console.warn('ambiente fachadas', e); }
    try { flushDecals(world.scene); } catch (e) { console.warn('ambiente calcomanías', e); }
  };
}
