// Decoración del castillo del terror: modelos (llegan en segundo plano), calabazas talladas con fuego adentro,
// velas, lápidas con epitafios, telarañas, retratos pintados por código, calaveras, árboles secos, niebla baja,
// murciélagos, cuervos y el espantapájaros. Todo lo repetido va instanciado.
import * as THREE from 'three';
import { G, rng } from '../core/G.js';
import { whenAsset, assetModel, instanceModel } from '../game/assets.js';
import { Builder, getMat } from './builder.js';
import { CASTLE } from '../shared/mapdata.js';
import { stainCastle } from './castle-stains.js';
import { dressCastle } from './castle-dress.js';
import { Corpse } from './castle-corpse.js';

const F0 = CASTLE.keep.floor;
const HAS_DOM = typeof document !== 'undefined';
const V = new THREE.Vector3();
const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(cv, srgb = true) { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// ---------------------------------------------------------------- texturas pintadas por código
// Retratos de "la familia": fondo oscuro, figura pálida, ojos hundidos, barniz amarillento y craquelado.
function portraitCanvas(kind, seed, skull = false) {
  const r = rng(seed);
  const W = 512, H = 384, cv = canvas(W, H), c = cv.getContext('2d');
  const bg = c.createRadialGradient(W / 2, H * 0.4, 20, W / 2, H / 2, W * 0.7);
  bg.addColorStop(0, ['#3a2e1e', '#2a3322', '#2e2226', '#1e2530'][seed % 4]);
  bg.addColorStop(1, '#070605');
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.46;
  // ropa oscura con cuello
  c.fillStyle = ['#161212', '#1a1410', '#221018', '#101418'][kind % 4];
  c.beginPath(); c.ellipse(cx, H * 1.02, W * 0.34, H * 0.46, 0, Math.PI, 0); c.fill();
  c.fillStyle = '#d8d0c0';
  c.beginPath(); c.moveTo(cx - 40, H * 0.66); c.lineTo(cx, H * 0.78); c.lineTo(cx + 40, H * 0.66); c.lineTo(cx, H * 0.7); c.fill();
  // cuello y cara
  c.fillStyle = skull ? '#cfc6b0' : '#c9b8a2';
  c.fillRect(cx - 18, cy + 40, 36, 42);
  c.beginPath(); c.ellipse(cx, cy, 56, 72, 0, 0, Math.PI * 2); c.fill();
  // pelo
  c.fillStyle = kind === 2 ? '#6a6660' : ['#1a1410', '#2a1a10', '#0e0c0a', '#3a2a1a'][seed % 4];
  if (kind === 1 || kind === 3) { c.beginPath(); c.ellipse(cx, cy - 10, 70, 88, 0, Math.PI * 0.95, Math.PI * 2.05); c.fill(); c.fillRect(cx - 70, cy - 10, 18, 110); c.fillRect(cx + 52, cy - 10, 18, 110); }
  else { c.beginPath(); c.ellipse(cx, cy - 34, 60, 42, 0, Math.PI, 0); c.fill(); }
  if (kind === 3) { c.fillStyle = 'rgba(10,8,8,0.55)'; c.beginPath(); c.ellipse(cx, cy - 6, 78, 96, 0, Math.PI, 0); c.fill(); } // velo
  if (skull) {
    // calavera: cuencas, nariz, dientes
    c.fillStyle = '#0a0806';
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * 22, cy - 6, 16, 19, 0, 0, Math.PI * 2); c.fill(); }
    c.beginPath(); c.moveTo(cx, cy + 10); c.lineTo(cx - 8, cy + 26); c.lineTo(cx + 8, cy + 26); c.fill();
    c.fillStyle = '#e8e0cc'; for (let i = -3; i <= 3; i++) c.fillRect(cx + i * 7 - 3, cy + 38, 5, 12);
    c.fillStyle = 'rgba(160,0,0,0.9)'; for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * 22, cy - 6, 3, 0, Math.PI * 2); c.fill(); }
  } else {
    // ojos hundidos (sombras) con una chispa que parece mirar
    c.fillStyle = 'rgba(40,24,20,0.8)';
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * 21, cy - 8, 14, 9, 0, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = kind === 4 ? '#8a0c0c' : '#0e0a08';
    for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * 21, cy - 7, 4.5, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = 'rgba(255,240,220,0.7)'; for (const s of [-1, 1]) c.fillRect(cx + s * 21 + 1, cy - 9, 2, 2);
    c.strokeStyle = 'rgba(90,50,40,0.8)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx - 14, cy + 30); c.quadraticCurveTo(cx, cy + 26 + (kind === 4 ? -6 : 3), cx + 14, cy + 30); c.stroke();
    c.beginPath(); c.moveTo(cx, cy - 2); c.lineTo(cx - 4, cy + 16); c.lineTo(cx + 3, cy + 17); c.stroke();
    if (kind === 0 || kind === 4) { c.fillStyle = '#1a120c'; c.fillRect(cx - 20, cy + 22, 40, 5); } // bigote
  }
  // barniz, craquelado y viñeta
  c.fillStyle = 'rgba(120,90,30,0.18)'; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1;
  for (let i = 0; i < 90; i++) { let x = r() * W, y = r() * H; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; c.lineTo(x, y); } c.stroke(); }
  const vg = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
  return cv;
}

function cobwebCanvas() {
  const W = 256, cv = canvas(W, W), c = cv.getContext('2d');
  c.strokeStyle = 'rgba(235,235,230,0.85)'; c.lineWidth = 1.2;
  const r = rng(77);
  const rays = 11, ang = [];
  for (let i = 0; i < rays; i++) ang.push((i / (rays - 1)) * Math.PI / 2 + (r() - 0.5) * 0.06);
  for (const a of ang) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * W * 1.02, Math.sin(a) * W * 1.02); c.stroke(); }
  for (let k = 1; k < 13; k++) {
    const d = k * 19 + r() * 4;
    c.beginPath();
    ang.forEach((a, i) => {
      const dd = d * (0.94 + r() * 0.1);
      const x = Math.cos(a) * dd, y = Math.sin(a) * dd;
      if (i === 0) c.moveTo(x, y); else c.quadraticCurveTo(Math.cos(a - 0.07) * dd * 0.92, Math.sin(a - 0.07) * dd * 0.92, x, y);
    });
    c.stroke();
  }
  return cv;
}

function epitaphCanvas(lines) {
  const W = 256, H = 320, cv = canvas(W, H), c = cv.getContext('2d');
  c.fillStyle = '#6f6d66'; c.fillRect(0, 0, W, H);
  const r = rng(lines.join('').length * 13);
  for (let i = 0; i < 900; i++) { const g = 80 + r() * 50; c.fillStyle = `rgba(${g},${g},${g - 6},0.35)`; c.fillRect(r() * W, r() * H, 3, 3); }
  for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(52,70,34,${0.2 + r() * 0.3})`; c.beginPath(); c.ellipse(r() * W, H - r() * 90, 10 + r() * 30, 6 + r() * 14, 0, 0, Math.PI * 2); c.fill(); }
  c.textAlign = 'center';
  lines.forEach((t, i) => {
    const big = i === 0;
    c.font = `${big ? 'bold 34' : '19'}px Georgia, serif`;
    const y = (big ? 70 : 118) + (big ? 0 : (i - 1) * 27);
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillText(t, W / 2 + 1, y + 1);
    c.fillStyle = 'rgba(20,18,16,0.85)'; c.fillText(t, W / 2, y);
  });
  return cv;
}

function sigilCanvas() {
  const W = 256, H = 512, cv = canvas(W, H), c = cv.getContext('2d');
  c.fillStyle = '#4a0c12'; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; c.fillRect(Math.random() * W, Math.random() * H, 4, 12); }
  c.strokeStyle = '#b8902a'; c.lineWidth = 8; c.strokeRect(14, 14, W - 28, H - 80);
  // cuervo con las alas abiertas sobre una calavera
  c.fillStyle = '#0a0808';
  c.beginPath(); c.moveTo(128, 120); c.quadraticCurveTo(40, 90, 30, 170); c.quadraticCurveTo(80, 150, 110, 175); c.lineTo(128, 240); c.lineTo(146, 175);
  c.quadraticCurveTo(176, 150, 226, 170); c.quadraticCurveTo(216, 90, 128, 120); c.fill();
  c.beginPath(); c.arc(128, 118, 16, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d8ceb4'; c.beginPath(); c.ellipse(128, 300, 40, 44, 0, 0, Math.PI * 2); c.fill(); c.fillRect(108, 330, 40, 22);
  c.fillStyle = '#4a0c12'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(128 + s * 15, 296, 10, 12, 0, 0, Math.PI * 2); c.fill(); }
  c.beginPath(); c.moveTo(128, 310); c.lineTo(122, 322); c.lineTo(134, 322); c.fill();
  // borde de abajo roto (se recorta con alphaTest)
  c.globalCompositeOperation = 'destination-out';
  c.beginPath(); c.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) c.lineTo(x, H - 30 - Math.random() * 60);
  c.lineTo(W, H); c.fill();
  return cv;
}

function signCanvas() {
  const W = 1024, H = 256, cv = canvas(W, H), c = cv.getContext('2d');
  // tablón viejo
  c.fillStyle = '#3a2618'; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`; c.fillRect(0, Math.random() * H, W, 2 + Math.random() * 3); }
  c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, H / 2 - 2, W, 4);
  c.textAlign = 'center';
  let fs = 118;
  c.font = `bold ${fs}px "Times New Roman", Georgia, serif`;
  while (c.measureText('CASTILLO DEL TERROR').width > W - 70 && fs > 40) { fs -= 4; c.font = `bold ${fs}px "Times New Roman", Georgia, serif`; }
  c.fillStyle = '#0c0606'; c.fillText('CASTILLO DEL TERROR', W / 2 + 4, 128 + fs * 0.36);
  c.fillStyle = '#b01010'; c.fillText('CASTILLO DEL TERROR', W / 2, 124 + fs * 0.36);
  // chorreado de pintura
  c.fillStyle = '#9a0c0c';
  for (let i = 0; i < 22; i++) { const x = 70 + Math.random() * (W - 140), l = 12 + Math.random() * 60; c.fillRect(x, 150, 4, l); c.beginPath(); c.arc(x + 2, 150 + l, 4, 0, Math.PI * 2); c.fill(); }
  return cv;
}

function skullCanvas() {
  const W = 128, H = 64, cv = canvas(W, H), c = cv.getContext('2d');
  c.fillStyle = '#d6ccb2'; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 200; i++) { c.fillStyle = `rgba(90,70,40,${Math.random() * 0.2})`; c.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  const cx = W * 0.25; // frente
  c.fillStyle = '#120c08';
  for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * 7, 28, 5.5, 6, 0, 0, Math.PI * 2); c.fill(); }
  c.beginPath(); c.moveTo(cx, 34); c.lineTo(cx - 3, 41); c.lineTo(cx + 3, 41); c.fill();
  for (let i = -3; i <= 3; i++) c.fillRect(cx + i * 2.6 - 1, 46, 1.6, 5);
  return cv;
}

// ---------------------------------------------------------------- geometrías
export class Decor {
  constructor(castle) {
    this.c = castle;
    this.scene = castle.scene;
    this.phys = castle.phys;
    this.world = castle.world;
    this.r = rng(4040);
    this.anim = []; // (t, dt) => void
    this.portraits = []; // { mesh, normal, skull }
    this.models = {}; // referencias a modelos animados (reloj, mecedora, silla de ruedas, estantes...)
    this.scarecrow = null;
  }

  build() {
    this._pumpkins();
    this._candles();
    this._graves();
    this._cobwebs();
    this._banners();
    this._skulls();
    this._props();
    this._scarecrow();
    this._bats();
    this._crows();
    this._deadTrees();
    this._models();
    dressCastle(this); // muebles, vajilla, libros, alfombras y demás (castle-dress.js)
  }

  // ---------------------------------------------------------------- modelos repetidos (instanciados cuando llegan)
  instances(type, mats, { filter = null, shadow = true, onReady = null } = {}) {
    if (!mats.length) return;
    whenAsset(type, () => {
      const ims = instanceModel(this.scene, type, mats, null, filter) || [];
      for (const im of ims) {
        im.castShadow = shadow;
        if (shadow) im.layers.enable(1);
      }
      onReady?.(ims);
    });
  }
  mat4(x, y, z, yaw = 0, s = 1, sy = s) {
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(s, sy, s));
  }

  // ---------------------------------------------------------------- calabazas (modelos de Blender): lisas y talladas con fuego adentro
  _pumpkins() {
    const r = this.r;
    const plainA = [], plainB = [], carved = [];
    const put = (x, y, z, s, lit = false, yaw = null, light = false) => {
      const yw = yaw ?? r() * Math.PI * 2;
      if (!lit) { (r() < 0.55 ? plainA : plainB).push(this.mat4(x, y, z, yw, s, s * (0.92 + r() * 0.16))); return; }
      carved.push(this.mat4(x, y, z, yw, s));
      // la vela adentro (el piso interior del modelo está a ~0.11 m por metro de escala)
      this.c.flame(x, y + 0.1 * s, z, 0.22 * s, 0.34 * s, { intensity: 0.95 });
      if (light) this.c.light(x, y + 0.45 * s, z, 0xff8a30, 1.8, 5.5, { flicker: true, priority: 0.8 });
    };
    // camino al portón: calabazas talladas a los dos lados, mirando al camino
    for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) {
      const z = -59.5 - i * 2.8;
      put(sd * (3.1 + r() * 0.25), 0.03, z, 0.6 + r() * 0.15, true, sd > 0 ? -Math.PI / 2 : Math.PI / 2, i % 2 === 0);
    }
    // escalinata del torreón: una en cada tanto de escalones, mirando al patio
    for (let i = 2; i < 20; i += 4) for (const sd of [-1, 1]) {
      const z = -95.6 - (i + 0.5) * (6.6 / 20), y = (i + 1) * (3.5 / 20);
      put(sd * 3.65, y, z, 0.46, true, 0, false);
    }
    // galpón del fogón: en las esquinas
    for (const [x, z, sc, lit] of [[-39.4, -85.3, 0.72, true], [-14.7, -85.1, 0.62, true], [-14.8, -99.8, 0.8, false], [-39.3, -99.8, 0.6, true]]) put(x, 0.05, z, sc, lit, Math.PI, lit);
    // huerta: un calabazar entero (surcos de barro con calabazas grandes y chicas)
    for (let row = 0; row < 5; row++) {
      for (let k = 0; k < 7; k++) {
        const x = -41.2 + row * 3.1 + (r() - 0.5) * 0.6, z = -107 - k * 3.1 + (r() - 0.5) * 0.8;
        const lit = r() < 0.14;
        put(x, 0.08, z, 0.55 + r() * 0.55, lit, null, lit && r() < 0.5);
      }
      this.c.deco('mud', -41.2 + row * 3.1, 0.06, -116.3, 1.2, 0.12, 20, { mask: false, noShadow: true });
    }
    this.instances('c_pumpkin_a', plainA);
    this.instances('c_pumpkin_b', plainB);
    this.instances('c_jack', carved, { onReady: (ims) => {
      // el interior brilla (el modelo trae emisión en la cara interna); un poco más fuerte de noche
      for (const im of ims) { const m = im.material; if (m.emissive && m.emissiveIntensity) m.emissiveIntensity = 3.2; }
    } });
  }

  // ---------------------------------------------------------------- velas (modelos de Blender, instanciadas) con llama
  // variantes: alta 0.26 m, media 0.17 m, baja 0.09 m (radios 0.03 / 0.028 / 0.034)
  candle(x, y, z, h = 0.2, r = 0.03, light = 0) {
    const v = h >= 0.21 ? ['candle_tall', 0.26] : h >= 0.13 ? ['candle_mid', 0.17] : ['candle_short', 0.09];
    const sc = Math.max(0.7, Math.min(1.35, h / v[1]));
    const yaw = this.r() * Math.PI * 2;
    this._candleSets = this._candleSets || { candle_tall: [], candle_mid: [], candle_short: [] };
    this._candleSets[v[0]].push(this.mat4(x, y, z, yaw, sc));
    const top = v[1] * sc;
    this.c.flame(x, y + top + 0.004, z, 0.042 * sc, 0.1 * sc, { intensity: 0.95 });
    if (light) this.c.light(x, y + top + 0.15, z, 0xffb060, light, 4.5, { flicker: true, priority: 0.6 });
  }
  torch(x, y, z, nx, nz, light = 4, dist = 9) {
    const b = this.c.b;
    (this.c.soot = this.c.soot || []).push([x - nx * 0.25, y, z - nz * 0.25, nx, nz, 1]);
    b.box('iron', x - nx * 0.12, y - 0.32, z - nz * 0.12, nx ? 0.3 : 0.08, 0.08, nz ? 0.3 : 0.08, { mask: false });
    b.box('iron', x - nx * 0.24, y - 0.5, z - nz * 0.24, 0.06, 0.4, 0.06, { mask: false });
    const cup = new THREE.CylinderGeometry(0.11, 0.05, 0.2, 8);
    cup.translate(x, y, z);
    b.geo('iron', cup);
    this.c.fire3d(x, y + 0.04, z, 0.13, 0.13, 0.6, { speed: 1.3, intensity: 0.9 });
    this.world.embers?.add(x, y + 0.22, z, 4, { radius: 0.1, height: 1.2, strength: 0.5 });
    return this.c.light(x + nx * 0.35, y + 0.35, z + nz * 0.35, 0xff8a3a, light, dist, { flicker: true, priority: 1.2 });
  }
  candleCluster(x, y, z, n = 5, spread = 0.22, light = 1.2) {
    const r = this.r;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
      this.candle(x + Math.cos(a) * d, y, z + Math.sin(a) * d, 0.08 + r() * 0.24, 0.03, 0);
    }
    if (light) this.c.light(x, y + 0.45, z, 0xffae5a, light, 5.5, { flicker: true, priority: 0.7 });
  }
  _candles() {
    const y0 = F0;
    // salón: ramilletes en el piso, junto a la escalera y en el balcón
    this.candleCluster(-4.6, y0, -107.4, 7, 0.3, 1.6);
    this.candleCluster(6.8, y0, -104.9, 5, 0.25, 1.2);
    this.candleCluster(-6.8, 8.0, -115.6, 5, 0.25, 1.0);
    this.candleCluster(6.9, 8.0, -115.9, 4, 0.2, 0.8);
    // sala de los retratos: casi a oscuras (unas pocas velas que se apagan)
    this.galleryCandles = [];
    for (const [x, z] of [[-6.9, -117.7], [6.9, -125.2], [-6.8, -125.1]]) {
      const i0 = this.c.flames.length;
      this.candleCluster(x, y0, z, 4, 0.18, 0);
      this.galleryCandles.push({ flames: this.c.flames.slice(i0), light: this.c.light(x, y0 + 0.5, z, 0xffa050, 1.7, 6, { flicker: true, priority: 0.8 }) });
    }
    // cripta: ramilletes entre las columnas y sobre las tumbas
    for (const [x, z, n] of [[10.2, -106.2, 6], [18.3, -106.5, 4], [10, -124.8, 5], [14.2, -118.8, 7], [22.9, -105.4, 3]]) this.candleCluster(x, 0.06, z, n, 0.25, 1.4);
    for (const [x, z, nx] of [[12.85, -108.2, 1], [15.65, -112.4, -1], [12.85, -116.6, 1], [15.65, -120.8, -1]]) this.torch(x, 2.05, z, nx, 0, 5, 9);
    this.cryptGlow = this.c.light(14.2, 1.3, -114.5, 0x5affc0, 1.6, 5, { flicker: true, priority: 1 });
    // cuarto secreto: altar
    this.candleCluster(13, y0 + 1.05, -125.1, 6, 0.3, 1.3);
    // ventanas del torreón (vistas desde afuera, en los alféizares de adentro)
    for (const x of [-20.5, -12.5, 12.5]) this.candle(x - 0.3, y0 + 1.46, -104.5, 0.22, 0.03, 0);
    // cementerio: velas sobre las tumbas
    for (const [x, z] of [[29.2, -110.8], [33.9, -114.2], [38.6, -110.2], [30.4, -121.2], [37.2, -124.3]]) this.candleCluster(x, 0.04, z, 3, 0.15, 0);
    // fogón: sobre barriles
    this.candleCluster(-38.2, 0.95, -86.4, 3, 0.1, 0);
    this.candleCluster(-16.2, 0.95, -99.0, 3, 0.1, 0);
    // rebote de cada cuarto: una luz suave y alta (sin parpadeo) para que se lean las formas en la penumbra
    for (const [x, y, z, col, i, d] of [
      [-16, 8.6, -120.5, 0xc89060, 7, 15], [14.5, 8.6, -120.5, 0xa04838, 6, 14], [0, 8.6, -121.5, 0x8090b0, 5, 14],
      [16, 2.7, -115, 0xc07040, 5, 13], [-16, 8.8, -109.5, 0xc89060, 5, 15], [16, 8.8, -109.5, 0xc89060, 5, 15],
    ]) this.c.light(x, y, z, col, i, d, { priority: 0.9, decay: 1.6 });
  }
  _flushCandles() {
    const L = this._candleSets;
    if (!L) return;
    for (const [name, mats] of Object.entries(L)) {
      this.instances('c_candles', mats, { shadow: false, filter: (o) => o.name === name || o.name === name + '_wick' });
    }
  }

  // ---------------------------------------------------------------- cementerio: lápidas, cruces, epitafios, tumbas frescas
  _graves() {
    const b = new Builder(this.phys);
    const r = this.r;
    const EPI = [
      ['Q.E.P.D.', 'Acá yace el que', 'dijo "yo no le tengo', 'miedo a nada"'],
      ['JUANCHO', 'Se cortó el pasto', 'con la cara', '1987 - 2026'],
      ['R.I.P.', 'Murió como vivió:', 'debiendo plata'],
      ['AQUÍ YACE', 'el que entró solo', 'a la cripta'],
      ['DON EMILIO', 'Fue a buscar', 'la pelota', 'al castillo'],
      ['NO ABRIR', 'Ni aunque', 'golpeen'],
    ];
    const stones = [];
    let e = 0;
    for (let row = 0; row < 4; row++) for (let k = 0; k < 5; k++) {
      const x = 27.8 + k * 3.3 + (r() - 0.5) * 0.6, z = -109 - row * 5 + (r() - 0.5) * 0.8;
      if (Math.abs(x - 33.5) < 1.2 && Math.abs(z - -117) < 2.5) continue; // lugar de la estatua
      const kind = Math.floor(r() * 4), tilt = (r() - 0.5) * 0.18, yaw = (r() - 0.5) * 0.25;
      if (kind === 0 || kind === 1) {
        // lápida con remate redondo
        const s = new THREE.Shape();
        const w = 0.45 + r() * 0.2, h = 0.8 + r() * 0.5;
        s.moveTo(-w, 0); s.lineTo(-w, h); s.absarc(0, h, w, Math.PI, 0, true); s.lineTo(w, 0); s.lineTo(-w, 0);
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
        g.translate(0, 0, -0.08);
        g.scale(1, 1, 1);
        const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
        g.applyMatrix4(M.makeRotationFromEuler(new THREE.Euler(tilt, yaw, tilt * 0.5)).setPosition(x, -0.05, z));
        b.geo(kind ? 'keepStone' : 'castleStone', g);
        stones.push({ x, z, w, h, yaw, tilt, epi: e < EPI.length && kind === 0 ? EPI[e++] : null });
        this.phys.box(x, h * 0.5, z, w, h * 0.5 + w * 0.3, 0.1, yaw, { paint: false });
      } else if (kind === 2) {
        // cruz
        const h = 1.2 + r() * 0.5;
        b.box('keepStone', x, h / 2, z, 0.18, h, 0.14, { yaw, rx: tilt, collide: true });
        b.box('keepStone', x, h * 0.72, z, 0.8, 0.16, 0.14, { yaw, rx: tilt, collide: false });
      } else {
        // obelisco con base
        b.box('castleStone', x, 0.2, z, 0.8, 0.4, 0.8, { yaw });
        b.box('keepStone', x, 1.1, z, 0.42, 1.4, 0.42, { yaw });
        const cap = new THREE.ConeGeometry(0.34, 0.5, 4);
        cap.rotateY(Math.PI / 4 + yaw);
        cap.translate(x, 2.05, z);
        b.geo('keepStone', cap);
      }
      // tierra removida delante
      b.box('mud', x, 0.08, z + 1.0, 1.0, 0.16, 1.9, { yaw, collide: false, noShadow: true });
    }
    // tumba abierta con la pala
    b.box('mud', 40.2, 0.35, -127.2, 1.6, 0.7, 1.1, { collide: true });
    b.box('black', 38.4, 0.01, -127.2, 1.2, 0.02, 2.2, { collide: false, noShadow: true });
    this.anchors = this.anchors || {};
    this.c.anchors.openGrave = new THREE.Vector3(38.4, 0, -127.2);
    b.finish(this.scene);
    // epitafios: una cara pintada sobre la lápida
    if (HAS_DOM) {
      for (const s of stones) {
        if (!s.epi) continue;
        const t = tex(epitaphCanvas(s.epi));
        const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w * 1.8, s.w * 1.8 * 1.25), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
        m.position.set(0, s.h * 0.55, 0.115);
        const grp = new THREE.Group();
        grp.position.set(s.x, -0.05, s.z);
        grp.rotation.set(s.tilt, s.yaw, s.tilt * 0.5, 'XYZ');
        grp.add(m);
        this.scene.add(grp);
      }
    }
  }

  // ---------------------------------------------------------------- telarañas
  _cobwebs() {
    if (!HAS_DOM) return;
    const mat = new THREE.MeshBasicMaterial({ map: tex(cobwebCanvas()), transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, depthWrite: false, color: 0x8a8a86 });
    const spots = [
      // [x, y, z, yaw, tamaño] : esquinas superiores de los cuartos
      [-7.4, 9.4, -104.5, Math.PI / 4, 1.6], [7.4, 9.4, -104.5, -Math.PI / 4, 1.4], [-7.4, 15.8, -116.2, Math.PI * 0.75, 2.2],
      [-23.5, 9.6, -104.5, Math.PI / 4, 1.5], [-8.6, 9.6, -114.6, -Math.PI * 0.75, 1.3], [-23.5, 9.6, -125.5, Math.PI * 0.75, 1.7],
      [23.5, 9.6, -104.5, -Math.PI / 4, 1.5], [8.6, 9.6, -114.6, Math.PI * 0.75, 1.3],
      [-7.4, 9.6, -125.5, Math.PI * 0.75, 1.8], [7.4, 9.6, -125.5, -Math.PI * 0.75, 1.8], [7.4, 9.6, -117.4, -Math.PI / 4, 1.2],
      [8.6, 9.6, -125.5, Math.PI * 0.75, 1.6], [20.3, 9.6, -125.5, -Math.PI * 0.75, 1.4],
      [8.6, 2.9, -104.5, Math.PI / 4, 1.2], [23.5, 2.9, -104.5, -Math.PI / 4, 1.3], [8.6, 2.9, -125.5, Math.PI * 0.75, 1.4], [23.5, 2.9, -125.5, -Math.PI * 0.75, 1.2],
      [12.6, 2.9, -112.4, 0.3, 0.8], [16.6, 2.9, -116.6, 2.1, 0.9],
    ];
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0.5, -0.5, 0);
    const im = new THREE.InstancedMesh(g, mat, spots.length);
    spots.forEach(([x, y, z, yaw, s], i) => {
      Q.setFromEuler(new THREE.Euler(0.35, yaw, 0, 'YXZ'));
      im.setMatrixAt(i, M.compose(V.set(x, y, z), Q, S.set(s, s, s)));
    });
    im.renderOrder = 3;
    this.scene.add(im);
  }

  // ---------------------------------------------------------------- estandartes del portón y el cartel
  _banners() {
    if (!HAS_DOM) return;
    const t = tex(sigilCanvas());
    const mat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
    const U = { uT: { value: 0 } };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = U.uT;
      sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float k = (1.0 - uv.y);
        transformed.z += sin(uT * 2.3 + position.x * 2.0 + position.y * 1.4) * 0.14 * k * k + sin(uT * 5.1 + position.y * 3.0) * 0.03 * k;
        transformed.x += sin(uT * 1.7 + position.y) * 0.05 * k;`);
    };
    mat.customProgramCacheKey = () => 'banner-sway';
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.6, 6, 12), mat);
      m.position.set(s * 5.5, 10.4, -74.35);
      m.castShadow = true;
      this.scene.add(m);
      this.c.deco('iron', s * 5.5, 12.25, -74.4, 2.1, 0.08, 0.08, {});
    }
    this.anim.push((time) => { U.uT.value = time; });
    // cartel colgado sobre el arco
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshStandardMaterial({ map: tex(signCanvas()), roughness: 0.85 }));
    sign.position.set(0, 9.05, -74.42);
    this.scene.add(sign);
    for (const s of [-1, 1]) this.c.deco('iron', s * 1.9, 9.85, -74.45, 0.03, 0.6, 0.03, {});
  }

  // ---------------------------------------------------------------- calaveras (cripta, cuarto secreto, cementerio)
  _skulls() {
    if (!HAS_DOM) return;
    const mat = new THREE.MeshStandardMaterial({ map: tex(skullCanvas()), roughness: 0.6 });
    const g = new THREE.SphereGeometry(0.1, 14, 10);
    g.scale(0.85, 0.95, 1.1);
    const spots = [];
    const r = this.r;
    // montones en nichos de la cripta y del cuarto secreto
    for (const [x, y, z, n] of [[8.85, 0.12, -110, 9], [8.85, 0.12, -121.5, 7], [23.3, 0.12, -114.5, 6], [9.5, F0 + 0.1, -125.2, 5], [13.9, F0 + 1.14, -125.05, 3]]) {
      for (let i = 0; i < n; i++) spots.push([x + (r() - 0.5) * 0.5, y + (i > 4 ? 0.17 : 0) + r() * 0.03, z + (r() - 0.5) * 0.9, (r() - 0.5) * 1.5]);
    }
    for (const [x, z] of [[33, -109.2], [29.7, -125.5], [42.3, -113]]) spots.push([x, 0.1, z, r() * 3]);
    const im = new THREE.InstancedMesh(g, mat, spots.length);
    spots.forEach(([x, y, z, yaw], i) => { Q.setFromAxisAngle(UP, yaw + Math.PI / 2); im.setMatrixAt(i, M.compose(V.set(x, y, z), Q, S.set(1, 1, 1))); });
    im.castShadow = true;
    this.scene.add(im);
  }

  // ---------------------------------------------------------------- utilería procedural (tumbas de la cripta, cocina, patio)
  // cama de brasas: carbón negro con vetas que laten (en vez de un rectángulo naranja parejo)
  _emberBed() {
    const em = getMat('ember');
    if (em.userData.bed) return;
    em.userData.bed = true;
    const U = { uT: { value: 0 } };
    em.onBeforeCompile = (sh) => {
      sh.uniforms.uT = U.uT;
      sh.vertexShader = 'varying vec3 vEmW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vEmW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `uniform float uT;
        varying vec3 vEmW;
        float hE(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
        float vE(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hE(i), hE(i + vec2(1, 0)), f.x), mix(hE(i + vec2(0, 1)), hE(i + vec2(1, 1)), f.x), f.y); }
        ` + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float en = vE(vEmW.xz * 9.0 + vec2(uT * 0.13, -uT * 0.09)) * 0.6 + vE(vEmW.xz * 26.0 - uT * 0.25) * 0.4;
          float hot = smoothstep(0.42, 0.78, en) * (0.7 + 0.3 * sin(uT * 2.7 + en * 14.0));
          totalEmissiveRadiance *= hot * 1.8;
          diffuseColor.rgb = mix(vec3(0.02, 0.018, 0.016), diffuseColor.rgb, hot);`);
    };
    em.customProgramCacheKey = () => 'ember-bed';
    this.anim.push((t) => { U.uT.value = t; });
  }

  _props() {
    const b = new Builder(this.phys);
    this._emberBed();
    // cripta: sarcófagos en fila y el del Conde al medio
    for (const [x, z, big] of [[10.5, -109.5, 0], [10.5, -114.5, 0], [10.5, -119.5, 0], [14.2, -114.5, 1], [18.4, -110.2, 0], [18.4, -114.8, 0]]) {
      const w = big ? 1.3 : 1.0, l = big ? 2.6 : 2.2;
      b.box('keepStone', x, 0.45, z, w, 0.9, l);
      if (!big) { b.box('castleStone', x, 0.97, z, w + 0.14, 0.16, l + 0.14, { collide: false }); continue; }
      const lid = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.16, l + 0.14), getMat('castleStone'));
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.4), getMat('keepStone'));
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.12), getMat('keepStone'));
      c1.position.y = c2.position.y = 0.12; c2.position.z = -0.3;
      for (const o of [slab, c1, c2]) { o.castShadow = true; o.receiveShadow = true; lid.add(o); }
      lid.position.set(x, 0.97, z);
      lid.userData.x0 = x;
      this.scene.add(lid);
      this.models.tombLid = lid;
    }
    this.c.anchors.tombLid = new THREE.Vector3(14.2, 0.97, -114.5);
    // nichos en los muros de la cripta (con calaveras)
    for (const z of [-110, -121.5]) b.box('black', 8.35, 0.45, z, 0.1, 0.7, 1.4, { collide: false, noShadow: true });
    // cuarto secreto: altar y círculo en el piso
    b.box('keepStone', 13, F0 + 0.5, -125.1, 3.0, 1.0, 0.9);
    b.box('velvet', 13, F0 + 1.02, -125.1, 3.1, 0.04, 1.0, { collide: false });
    // cocina: hogar abierto (con el fuego adentro y el caldero encima), mesa de carnicero, estantes
    b.box('keepStone', -23.55, F0 + 1.4, -123.2, 0.5, 2.8, 3.4);
    for (const z of [-124.65, -121.75]) b.box('keepStone', -22.7, F0 + 0.9, z, 1.2, 1.8, 0.5);
    b.box('keepStone', -22.7, F0 + 2.3, -123.2, 1.2, 1.0, 3.4);
    b.box('keepStone', -22.55, F0 + 0.06, -123.2, 1.5, 0.12, 2.4, { collide: false });
    b.box('black', -23.28, F0 + 0.95, -123.2, 0.04, 1.7, 2.4, { collide: false, noShadow: true });
    b.box('woodDark', -16, F0 + 0.85, -121, 2.4, 0.12, 1.1);
    for (const [dx, dz] of [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]]) b.box('woodDark', -16 + dx, F0 + 0.4, -121 + dz, 0.12, 0.8, 0.12, { collide: false });
    // el cadáver de la mesa: un cuerpo de verdad (castle-corpse.js) que se incorpora cuando haunt.js gira la bisagra
    const hinge = new THREE.Object3D();
    this.models.sheetTorso = hinge;
    this.corpse = new Corpse(this, hinge);
    this.c.anchors.sheet = new THREE.Vector3(-16, F0 + 1.05, -121);
    for (const y of [1.2, 2.0]) b.box('woodDark', -23.5, F0 + y, -117.5, 0.4, 0.06, 2.4, { collide: false });
    // comedor: mesa larga con mantel, platos y copas; chimenea
    b.box('woodDark', -16, F0 + 0.78, -109.5, 7.2, 0.1, 1.5);
    for (const [dx, dz] of [[-3.3, -0.6], [3.3, -0.6], [-3.3, 0.6], [3.3, 0.6], [0, -0.6], [0, 0.6]]) b.box('woodDark', -16 + dx, F0 + 0.37, -109.5 + dz, 0.14, 0.74, 0.14, { collide: false });
    b.box('linen', -16, F0 + 0.84, -109.5, 7.3, 0.02, 1.62, { collide: false });
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
      b.cylinder('white', -18.75 + i * 1.1, F0 + 0.86, -109.5 + s * 0.45, 0.13, 0.11, 0.02, 14, {});
    }
    this._fireplace(b, -23.3, -109.5, Math.PI / 2);
    this._fireplace(b, 23.3, -111.5, -Math.PI / 2);
    // biblioteca: mesa de lectura
    b.box('woodDark', 17.5, F0 + 0.76, -108.5, 2.0, 0.08, 1.1);
    for (const [dx, dz] of [[-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45]]) b.box('woodDark', 17.5 + dx, F0 + 0.37, -108.5 + dz, 0.1, 0.74, 0.1, { collide: false });
    // patio: horca con la soga, fardos de heno y un carro de calabazas
    b.box('woodDark', 30, 0.25, -90, 3.2, 0.5, 3.2);
    b.box('woodDark', 29, 2.5, -90, 0.3, 5, 0.3);
    b.box('woodDark', 30.4, 4.9, -90, 3.0, 0.28, 0.28, { collide: false });
    b.box('woodDark', 29.6, 4.35, -90, 0.2, 1.1, 0.2, { rz: 0.75, collide: false });
    b.cylinder('hemp', 31.4, 4.1, -90, 0.02, 0.02, 1.5, 5, {});
    const noose = new THREE.TorusGeometry(0.2, 0.025, 6, 16);
    noose.translate(31.4, 3.15, -90);
    b.geo('hemp', noose);
    for (const [x, z, yaw] of [[22, -83.2, 0.1], [23.3, -83.3, -0.1], [22.6, -83.3, 0], [42.4 - 1, -99, 1.5], [-42.4 + 1, -84, 1.6]]) b.box('hay', x, 0.3, z, 1.2, 0.6, 0.7, { yaw });
    b.box('hay', 22.6, 0.9, -83.3, 1.2, 0.6, 0.7, { yaw: 0.05 });
    this.c.seats.push({ x: 22, y: 0.62, z: -84.1, yaw: Math.PI }, { x: 23.3, y: 0.62, z: -84.1, yaw: Math.PI });
    // carro
    b.box('woodDark', 16.5, 0.95, -85.2, 3.0, 0.12, 1.6);
    for (const s of [-1, 1]) b.box('woodDark', 16.5, 1.3, -85.2 + s * 0.8, 3.0, 0.6, 0.08, { collide: false });
    for (const [dx, dz] of [[-1.0, -0.95], [-1.0, 0.95]]) b.cylinder('woodDark', 16.5 + dx, 0.55, -85.2 + dz, 0.55, 0.55, 0.1, 14, { rx: Math.PI / 2 });
    b.box('woodDark', 18.6, 0.8, -85.2, 1.4, 0.08, 0.1, { rz: 0.4, collide: false });
    // mesas, sarcófagos, altar y demás: también hacen sombra con el fuego y el candelabro (luz heroica, capa 1)
    for (const m of b.finish(this.scene) || []) m.layers.enable(1);
    // calabazas en el carro
    const cart = [];
    for (let i = 0; i < 6; i++) cart.push(this.mat4(15.5 + (i % 3) * 0.8, 1.01, -85.6 + Math.floor(i / 3) * 0.8, i * 1.3, 0.62));
    this.instances('c_pumpkin_b', cart);
    // caldero con brebaje verde que burbujea (y la luz verde)
    const cauldron = new THREE.LatheGeometry([[0.05, 0], [0.4, 0.05], [0.5, 0.3], [0.46, 0.6], [0.4, 0.66]].map(([r2, y]) => new THREE.Vector2(r2, y)), 16);
    const cm = new THREE.Mesh(cauldron, getMat('iron'));
    cm.position.set(-22.7, F0 + 0.42, -123.2);
    this.scene.add(cm);
    const brew = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), new THREE.MeshStandardMaterial({ color: 0x0a2a08, emissive: 0x3aff40, emissiveIntensity: 1.3, roughness: 0.2 }));
    brew.rotation.x = -Math.PI / 2;
    brew.position.set(-22.7, F0 + 0.99, -123.2);
    this.scene.add(brew);
    this.c.light(-22.3, F0 + 1.3, -123.2, 0x5aff50, 3, 6, { flicker: true, priority: 1 });
    this.c.light(-21.4, F0 + 0.9, -123.2, 0xff7a30, 9, 11, { flicker: true, priority: 1.8, shadow: true, decay: 1.5 });
    this.c.fire3d(-22.8, F0 + 0.1, -123.2, 0.36, 0.7, 0.85, { intensity: 1.0 });
    {
      const cb = this.c.b;
      cb.cylinder('iron', -22.7, F0 + 1.45, -123.2, 0.012, 0.012, 0.7, 5, { collide: false });
      for (const s of [-1, 1]) cb.box('iron', -22.7, F0 + 1.13, -123.2 + s * 0.22, 0.02, 0.28, 0.02, { rx: s * 0.9, collide: false });
      cb.box('ember', -22.8, F0 + 0.135, -123.2, 0.6, 0.03, 1.2, { collide: false, noShadow: true });
      (this._hearthLogs = this._hearthLogs || []).push(
        this.mat4(-22.95, F0 + 0.18, -123.45, 0.3, 1.6, 1.4), this.mat4(-22.6, F0 + 0.18, -122.95, -0.4, 1.6, 1.4),
        this.mat4(-22.8, F0 + 0.29, -123.2, Math.PI / 2, 1.5, 1.3),
      );
    }
    this.world.embers?.add(-22.8, F0 + 0.3, -123.2, 10, { radius: 0.35, height: 1.2, strength: 0.7 });
    this.world.smoke?.add(-22.7, F0 + 0.8, -123.2, 8, { radius: 0.3, height: 1.2, opacity: 0.1, speed: 0.1 });
    this.anim.push((t) => { brew.material.emissiveIntensity = 1.1 + Math.sin(t * 3.1) * 0.25 + Math.sin(t * 7.3) * 0.1; });
  }
  _fireplace(b, x, z, yaw) {
    // hogar de piedra contra el muro, con fuego y luz
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const px = (d) => x + fx * d, pz = (d) => z + fz * d;
    const side = (s) => [x + Math.cos(yaw) * s, z - Math.sin(yaw) * s];
    for (const s of [-1, 1]) { const [sx, sz] = side(s * 1.05); b.box('keepStone', sx + fx * 0.25, F0 + 0.9, sz + fz * 0.25, 0.5, 1.8, 0.5, { yaw }); }
    b.box('keepStone', px(0.25), F0 + 1.95, pz(0.25), 2.8, 0.35, 0.8, { yaw });
    b.box('black', px(0.02), F0 + 0.9, pz(0.02), 1.6, 1.7, 0.1, { yaw, collide: false, noShadow: true });
    b.box('keepStone', px(0.35), F0 + 0.06, pz(0.35), 2.6, 0.12, 1.0, { yaw, collide: false });
    // leños cruzados y la cama de brasas (el fuego sale de algo)
    b.box('ember', px(0.3), F0 + 0.135, pz(0.3), 1.3, 0.03, 0.55, { yaw, collide: false, noShadow: true });
    (this._hearthLogs = this._hearthLogs || []).push(
      this.mat4(px(0.25) + Math.cos(yaw) * 0.25, F0 + 0.18, pz(0.25) - Math.sin(yaw) * 0.25, yaw + 0.25, 1.6, 1.4),
      this.mat4(px(0.35) - Math.cos(yaw) * 0.25, F0 + 0.18, pz(0.35) + Math.sin(yaw) * 0.25, yaw - 0.3, 1.6, 1.4),
      this.mat4(px(0.3), F0 + 0.3, pz(0.3), yaw + Math.PI / 2 + 0.1, 1.5, 1.3),
    );
    // el fuego ocupa el hueco: más ancho que profundo
    const along = Math.abs(fx) > 0.5;
    this.c.fire3d(px(0.3), F0 + 0.1, pz(0.3), along ? 0.3 : 0.62, along ? 0.62 : 0.3, 1.05, { intensity: 1.05 });
    this.world.embers?.add(px(0.3), F0 + 0.3, pz(0.3), 10, { radius: 0.25, height: 1.3, strength: 0.7 });
    this.c.light(px(0.9), F0 + 0.8, pz(0.9), 0xff7a30, 6, 9, { flicker: true, priority: 1.6, shadow: true });
    // repisa con velas
    const [ax, az] = side(-0.8), [bx, bz] = side(0.8);
    this.candle(ax + fx * 0.3, F0 + 2.12, az + fz * 0.3, 0.2, 0.03);
    this.candle(bx + fx * 0.3, F0 + 2.12, bz + fz * 0.3, 0.26, 0.03);
  }

  // ---------------------------------------------------------------- espantapájaros con cabeza de calabaza (que te sigue con la mirada)
  _scarecrow() {
    const x = -35.2, z = -121.5;
    const b = new Builder(this.phys);
    b.box('woodDark', x, 1.3, z, 0.14, 2.6, 0.14);
    b.box('woodDark', x, 1.9, z, 1.9, 0.1, 0.1, { collide: false });
    b.box('banner', x, 1.55, z, 0.7, 0.9, 0.34, { collide: false });
    for (const s of [-1, 1]) b.box('banner', x + s * 0.62, 1.82, z, 0.58, 0.22, 0.24, { collide: false, rz: s * 0.12 });
    b.box('hay', x, 1.02, z, 0.4, 0.18, 0.3, { collide: false });
    b.finish(this.scene);
    const head = new THREE.Group();
    head.position.set(x, 2.1, z);
    whenAsset('c_jack', () => {
      const pm = assetModel('c_jack');
      if (!pm) return;
      pm.scale.setScalar(0.62);
      pm.position.y = -0.12;
      head.add(pm);
    });
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 10), getMat('blackWood'));
    hat.position.y = 0.55;
    hat.rotation.z = 0.2;
    head.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.03, 16), getMat('blackWood'));
    brim.position.y = 0.34;
    head.add(brim);
    this.scene.add(head);
    this.c.flame(x, 2.05, z, 0.13, 0.2, {});
    this.scarecrow = { head, x, z, yaw: 0 };
    this.c.anchors.scarecrow = new THREE.Vector3(x, 0, z);
    this.anim.push((t, dt) => {
      // gira la cabeza, despacio, hacia el jugador más cercano (si está cerca)
      const me = G.me || G.world?._me;
      const p = me?.pos || me;
      if (!p) return;
      const dx = p.x - x, dz = p.z - z;
      const d = Math.hypot(dx, dz);
      const want = d < 14 ? Math.atan2(dx, dz) : 0;
      let da = want - this.scarecrow.yaw;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      this.scarecrow.yaw += da * Math.min(1, dt * (d < 14 ? 0.8 : 0.3));
      head.rotation.y = this.scarecrow.yaw;
    });
  }

  // ---------------------------------------------------------------- niebla baja (capas con ruido que se mueven)
  _fog() {
    const U = { uT: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, fog: false,
      vertexShader: /* glsl */ `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uT; varying vec3 vW;
        float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec2 p = vW.xz * 0.09 + vec2(uT * 0.03, uT * 0.017) + vW.y * 1.7;
          float n = vn(p) * 0.6 + vn(p * 2.3 - uT * 0.02) * 0.4;
          vec3 dv = vW - cameraPosition;
          float d = length(dv);
          // se ve de costado (rasante), casi nada mirando hacia abajo: no vela el piso
          float graze = pow(1.0 - abs(dv.y) / max(d, 1e-3), 4.0);
          float a = smoothstep(0.4, 0.85, n) * graze * smoothstep(3.0, 12.0, d) * (1.0 - smoothstep(70.0, 110.0, d)) * 0.3;
          gl_FragColor = vec4(vec3(0.2, 0.22, 0.26), a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const layers = [
      [0, 0.35, -104, 124, 70], [0, 0.8, -104, 124, 70],
      [0, 0.45, -66, 60, 22], [34, 0.6, -117, 18, 26], [-34, 0.5, -117, 18, 26], [16, 0.35, -114, 16, 22],
    ];
    for (const [x, y, z, w, d] of layers) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.renderOrder = 1;
      this.scene.add(m);
    }
    this.anim.push((t) => { U.uT.value = t; });
  }

  // ---------------------------------------------------------------- murciélagos (vuelan en círculos alrededor de las torres)
  _bats() {
    const N = 26;
    const g = new THREE.BufferGeometry();
    // cuerpo + dos alas (triángulos): la batida la hace el shader según |x|
    const pos = [
      0, 0, -0.1, 0.04, 0, 0.08, -0.04, 0, 0.08,
      0.03, 0, -0.06, 0.34, 0.02, 0.02, 0.03, 0, 0.07, 0.34, 0.02, 0.02, 0.22, 0, 0.12, 0.03, 0, 0.07,
      -0.03, 0, -0.06, -0.03, 0, 0.07, -0.34, 0.02, 0.02, -0.34, 0.02, 0.02, -0.03, 0, 0.07, -0.22, 0, 0.12,
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const seeds = new Float32Array(N * 4);
    const r = this.r;
    const centers = [[0, -121.4, 36, 9], [-45, -79, 22, 7], [45, -131, 24, 8], [8.6, -75.8, 18, 5]];
    for (let i = 0; i < N; i++) {
      const c = centers[i % centers.length];
      seeds.set([c[0], c[1], c[2] + r() * 6, c[3] * (0.6 + r() * 0.8) + (r() * 4 - 2) * 0.1], i * 4);
    }
    const ig = new THREE.InstancedBufferGeometry();
    ig.setAttribute('position', g.getAttribute('position'));
    ig.setAttribute('aC', new THREE.InstancedBufferAttribute(seeds, 4));
    const rs = new Float32Array(N); for (let i = 0; i < N; i++) rs[i] = r();
    ig.setAttribute('aR', new THREE.InstancedBufferAttribute(rs, 1));
    ig.instanceCount = N;
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 } }]),
      vertexShader: /* glsl */ `
        attribute vec4 aC; attribute float aR; uniform float uT;
        #include <fog_pars_vertex>
        void main() {
          float t = uT * (0.55 + aR * 0.5) + aR * 40.0;
          float rad = aC.w + sin(t * 0.7) * 1.5;
          vec3 c = vec3(aC.x + cos(t) * rad, aC.z + sin(t * 1.3) * 2.0 + sin(t * 3.1) * 0.4, aC.y + sin(t) * rad);
          vec3 fwd = normalize(vec3(-sin(t), 0.0, cos(t)));
          vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
          vec3 p = position;
          float flap = sin(uT * 22.0 + aR * 30.0);
          p.y += abs(p.x) * flap * 0.9;
          p *= 1.6;
          vec3 w = c + right * p.x + vec3(0.0, p.y, 0.0) + fwd * -p.z;
          vec4 mvPosition = viewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        void main() { gl_FragColor = vec4(0.015, 0.012, 0.014, 1.0);
          #include <fog_fragment>
        }`,
    });
    const bats = new THREE.Mesh(ig, mat);
    bats.frustumCulled = false;
    this.scene.add(bats);
    this.anim.push((t) => { mat.uniforms.uT.value = t; });
  }

  // ---------------------------------------------------------------- cuervos posados (cabeceo leve)
  _crows() {
    const g = new THREE.BufferGeometry();
    const body = new THREE.SphereGeometry(0.1, 8, 6); body.scale(0.8, 0.75, 1.6);
    const head = new THREE.SphereGeometry(0.06, 8, 6); head.translate(0, 0.07, 0.15);
    const beak = new THREE.ConeGeometry(0.022, 0.09, 5); beak.rotateX(Math.PI / 2); beak.translate(0, 0.065, 0.24);
    const tail = new THREE.BoxGeometry(0.1, 0.02, 0.16); tail.translate(0, -0.02, -0.2); tail.rotateX(-0.3);
    const parts = [body, head, beak, tail].map((p) => p.toNonIndexed());
    const merged = new Float32Array(parts.reduce((s, p) => s + p.attributes.position.count * 3, 0));
    let o = 0;
    for (const p of parts) { merged.set(p.attributes.position.array, o); o += p.attributes.position.count * 3; }
    g.setAttribute('position', new THREE.BufferAttribute(merged, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.45, metalness: 0.1 });
    const spots = [
      [-20, 11.35, -78.9, 0], [-13.4, 11.35, -78.9, 0.4], [25, 11.35, -78.9, -0.3], [44.9, 11.35, -100, 1.6], [-44.9, 11.35, -112, -1.6],
      [5.2, 14.05, -74.9, 0.2], [-2.2, 14.05, -74.9, -0.1], [31.5, 3.72, -103, 0.5], [35.5, 3.72, -103, -0.5], [26, 11.35, -130.9, 3.1],
      [-1.2, 25.3, -118.5, 0.2], [2.4, 25.3, -118.5, -0.4],
    ];
    const im = new THREE.InstancedMesh(g, mat, spots.length);
    spots.forEach(([x, y, z, yaw], i) => im.setMatrixAt(i, M.compose(V.set(x, y + 0.08, z), Q.setFromAxisAngle(UP, yaw), S.setScalar(1.25))));
    im.castShadow = true;
    this.scene.add(im);
    this.crows = { mesh: im, spots };
  }

  // ---------------------------------------------------------------- árboles secos (ez-tree sin hojas), en el castillo y alrededor
  _deadTrees() {
    if (!HAS_DOM) return;
    const r = this.r;
    const pts = [];
    const add = (x, z, s) => { pts.push({ x, z, s, rot: r() * Math.PI * 2, v: pts.length % 3 }); this.phys.cylinder(x, 2, z, 2, 0.3 * s, { mat: 'wood' }); };
    // adentro: cementerio y huerta
    add(40, -115, 1.0); add(28, -128, 0.8); add(-40.5, -127, 0.9); add(-28, -106.5, 0.7);
    // afuera de la muralla y en la explanada
    for (const [x, z, s] of [[-52, -86, 1.1], [-55, -104, 1.25], [-51, -125, 1.0], [53, -90, 1.15], [55, -112, 1.3], [50, -128, 0.95], [-30, -136.5, 0], [-24.5, -68.2, 1.05], [24, -71, 1.0], [-35, -72.5, 1.1], [36, -73.5, 0.95], [-14, -73.5, 0.75], [15, -74, 0.7]]) if (s) add(x, z, s);
    import('../../vendor/ez-tree/ez-tree.es.js').then(({ Tree }) => {
      const defs = [{ preset: 'Oak Medium', seed: 666, h: 9.5 }, { preset: 'Ash Medium', seed: 1313, h: 11 }, { preset: 'Oak Large', seed: 1717, h: 12.5 }];
      const bark = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 1 });
      defs.forEach((def, v) => {
        const t = new Tree();
        t.loadPreset(def.preset);
        t.options.seed = def.seed;
        t.options.leaves.count = 0;
        for (const k of Object.keys(t.options.branch.gnarliness)) t.options.branch.gnarliness[k] = Math.min(0.6, t.options.branch.gnarliness[k] * 2.4 + 0.08);
        for (const k of Object.keys(t.options.branch.twist)) t.options.branch.twist[k] = 0.12;
        t.generate();
        const map = t.branchesMesh.material.map || null;
        const mat = bark.clone();
        if (map) { mat.map = map; mat.color.setHex(0x5a5652); }
        if (t.branchesMesh.material.normalMap) mat.normalMap = t.branchesMesh.material.normalMap;
        t.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(t.branchesMesh);
        const k = def.h / Math.max(0.01, box.max.y - box.min.y);
        const mine = pts.filter((p) => p.v === v);
        if (!mine.length) return;
        const im = new THREE.InstancedMesh(t.branchesMesh.geometry, mat, mine.length);
        mine.forEach((p, i) => im.setMatrixAt(i, M.compose(V.set(p.x, 0, p.z), Q.setFromAxisAngle(UP, p.rot), S.setScalar(k * p.s))));
        im.castShadow = true; im.receiveShadow = true;
        im.computeBoundingSphere();
        this.scene.add(im);
      });
    }).catch((e) => console.warn('árboles secos', e));
  }

  // ---------------------------------------------------------------- modelos (llegan después: whenAsset)
  place(type, x, y, z, yaw = 0, scale = 1, { still = true, onReady = null } = {}) {
    whenAsset(type, () => {
      const m = assetModel(type);
      if (!m) return;
      m.position.set(x, y, z);
      m.rotation.y = yaw;
      m.scale.setScalar(scale);
      m.traverse((o) => { if (o.isMesh && o.castShadow) o.layers.enable(1); });
      this.scene.add(m);
      m.updateMatrixWorld(true);
      if (still) m.traverse((o) => { o.matrixAutoUpdate = false; });
      onReady?.(m);
    });
  }
  // puntas de llama de los candelabros (los modelos traen llamas quietas: se esconden y se ponen las nuestras)
  flamesOf(m, size = 1, light = 0) {
    m.updateMatrixWorld(true);
    const pts = [];
    m.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some((mm) => /flame/i.test(mm?.name || ''))) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
      o.visible = false;
    });
    // agrupar en llamas (celdas de 4 cm)
    const groups = [];
    for (const p of pts) {
      let g = groups.find((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.035 * Math.max(1, size));
      if (!g) { g = { x: p.x, z: p.z, y0: p.y, y1: p.y, n: 0 }; groups.push(g); }
      g.y0 = Math.min(g.y0, p.y); g.y1 = Math.max(g.y1, p.y); g.n++;
    }
    for (const g of groups) this.c.flame(g.x, g.y0, g.z, 0.05 * size, Math.max(0.07, (g.y1 - g.y0) * 1.3) * size, { intensity: 0.95 });
    if (light && groups.length) {
      const cx = groups.reduce((s, g) => s + g.x, 0) / groups.length, cz = groups.reduce((s, g) => s + g.z, 0) / groups.length;
      const cy = Math.max(...groups.map((g) => g.y1));
      return this.c.light(cx, cy + 0.2, cz, 0xffb060, light, 6.5, { flicker: true, priority: 1 });
    }
    return null;
  }

  _models() {
    const c = this.c;
    // --- salón
    this.place('c_chandelier', 0, 12.4, -110, 0, 1, { onReady: (m) => {
      const box = new THREE.Box3().setFromObject(m);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 16.2 - box.max.y, 6), getMat('iron'));
      chain.position.set(0, (box.max.y + 16.2) / 2, -110);
      this.scene.add(chain);
      this.models.chandelier = m;
      // velas del candelabro: anillo alrededor del eje, a la altura de los platillos
      const R = (box.max.x - box.min.x) * 0.42, yy = box.min.y + (box.max.y - box.min.y) * 0.38;
      this.chandelierFlames = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.chandelierFlames.push(c.flame(Math.cos(a) * R, yy, -110 + Math.sin(a) * R, 0.07, 0.13, {}));
      }
    } });
    this.chandelierLight = c.light(0, 12.2, -110, 0xffc080, 26, 24, { flicker: true, priority: 2.4, shadow: true, decay: 1.5 });
    // candeleros de pared en el salón: dan una luz útil y dibujan las paredes
    for (const [x, z, nx] of [[-7.62, -105.8, 1], [7.62, -108.6, -1], [7.62, -115.2, -1], [-7.62, -116.0, 1]]) {
      (c.soot = c.soot || []).push([x - nx * 0.08, F0 + 2.1, z, nx, 0, 0]);
      c.b.box('iron', x + nx * 0.12, F0 + 2.05, z, 0.24, 0.05, 0.05, {});
      c.b.box('iron', x + nx * 0.05, F0 + 1.85, z, 0.05, 0.45, 0.05, {});
      this.candle(x + nx * 0.24, F0 + 2.08, z, 0.2, 0.03, 0);
      c.light(x + nx * 0.45, F0 + 2.5, z, 0xffb060, 3.2, 8, { flicker: true, priority: 1.1 });
    }
    for (const [x, z] of [[-2.6, -104.9], [2.6, -104.9], [-4.6, -113.9]]) this.place('c_candelabra', x, F0, z, 0, 1, { onReady: (m) => this.flamesOf(m, 1, 2.2) });
    this.place('c_clock', 7.55, F0, -112.6, -Math.PI / 2, 1, { still: false, onReady: (m) => { this.models.clock = m; } });
    this.place('c_mirror', 7.68, F0 + 0.95, -106.3, -Math.PI / 2, 1, { onReady: (m) => {
      this.models.mirror = m;
      m.traverse((o) => {
        if (!o.isMesh) return;
        for (const mm of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!mm) continue;
          mm.envMapIntensity = 0.18;
          mm.color?.setRGB(0.42, 0.42, 0.4); // plata vieja, oscurecida
        }
      });
    } });
    for (const [x, s] of [[0.8, 1], [5.2, -1]]) {
      c.b.box('keepStone', x, F0 + 0.55, -116.1, 0.55, 1.1, 0.55, {});
      this.place('c_bust', x, F0 + 1.1, -116.1, 0, 1, { still: false, onReady: (m) => { (this.models.busts = this.models.busts || []).push(m); } });
    }
    c.b.finish(this.scene);
    // retratos: subiendo por la escalera, en la sala de los retratos, el comedor y la biblioteca
    const frames = [
      [-7.65, F0 + 2.5, -108.9, Math.PI / 2, 0], [-7.65, F0 + 3.4, -111.2, Math.PI / 2, 1], [-7.65, F0 + 4.3, -113.5, Math.PI / 2, 4],
      [0, F0 + 9.3, -116.45, 0, 3],
      [-7.65, F0 + 1.7, -119.2, Math.PI / 2, 2], [-7.65, F0 + 1.7, -124.1, Math.PI / 2, 5], [7.65, F0 + 1.7, -119.8, -Math.PI / 2, 1], [7.65, F0 + 1.7, -123.6, -Math.PI / 2, 4],
      [-3.9, F0 + 1.7, -125.75, 0, 0], [3.9, F0 + 1.7, -125.75, 0, 3], [-5.6, F0 + 1.8, -117.15, Math.PI, 2],
      [-16, F0 + 2.1, -104.25, Math.PI, 4], [-16, F0 + 2.1, -114.7, 0, 1], [23.75, F0 + 2.55, -111.5, -Math.PI / 2, 0],
    ];
    frames.forEach(([x, y, z, yaw, kind], i) => this.place('c_frame', x, y, z, yaw, 1, { onReady: (m) => this._portrait(m, kind, i) }));
    // --- comedor: sillas alrededor de la mesa, el sillón del anfitrión (vacío... por ahora)
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) this.place('c_chair', -18.75 + i * 1.1, F0, -109.5 + s * 1.05, s > 0 ? Math.PI : 0);
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) this.phys.box(-18.75 + i * 1.1, F0 + 0.45, -109.5 + s * 1.05, 0.22, 0.45, 0.22, 0, { paint: false });
    this.place('c_armchair', -20.4, F0, -109.5, Math.PI / 2, 1.15);
    this.phys.box(-20.4, F0 + 0.5, -109.5, 0.5, 0.5, 0.5, 0, { paint: false });
    c.anchors.hostSeat = new THREE.Vector3(-20.3, F0 + 0.55, -109.5);
    for (const x of [-18.2, -16, -13.8]) this.place('c_candelabra3', x, F0 + 0.85, -109.5, 0, 1, { onReady: (m) => { (this.diningFlames = this.diningFlames || []).push(m); this.flamesOf(m, 0.7, 0); } });
    this.diningLight = c.light(-16, F0 + 1.9, -109.5, 0xffb060, 4.5, 9, { flicker: true, priority: 1.4 });
    this.place('c_cabinet', -12.2, F0, -114.3, 0, 1, { still: false, onReady: (m) => { this.models.cabinet = m; } });
    this.phys.box(-12.2, F0 + 1.2, -114.3, 0.9, 1.2, 0.35, 0, { paint: false });
    // --- biblioteca: estantes (uno es la puerta secreta), sillones junto al fuego, mecedora
    for (const x of [10.6, 13.5, 19.5, 22.4]) { this.place('c_bookshelf', x, F0, -114.35, 0, 1); this.phys.box(x, F0 + 1.25, -114.35, 0.8, 1.25, 0.32, 0, { paint: false }); }
    this.place('c_bookshelf', 16.5, F0, -114.35, 0, 1, { still: false, onReady: (m) => { this.models.secretShelf = m; } });
    for (const z of [-105.9, -112.9]) { this.place('c_bookshelf', 8.65, F0, z, Math.PI / 2, 1); this.phys.box(8.65, F0 + 1.25, z, 0.32, 1.25, 0.8, 0, { paint: false }); }
    this.place('c_bookshelf', 16.5, F0, -104.55, Math.PI, 1);
    this.phys.box(16.5, F0 + 1.25, -104.55, 0.8, 1.25, 0.32, 0, { paint: false });
    const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
    this.place('c_armchair', 20.6, F0, -109.1, face(20.6, -109.1, 23.3, -111.5), 1);
    this.place('c_armchair', 20.4, F0, -113.6, face(20.4, -113.6, 23.3, -111.5), 1);
    this.phys.box(20.6, F0 + 0.5, -109.1, 0.45, 0.5, 0.45, 0, { paint: false });
    this.phys.box(20.4, F0 + 0.5, -113.6, 0.45, 0.5, 0.45, 0, { paint: false });
    this.place('c_rocking', 19.6, F0, -111.4, Math.PI / 2, 1, { still: false, onReady: (m) => { this.models.rocking = m; } });
    this.place('c_candelabra3', 17.5, F0 + 0.8, -108.5, 0, 1, { onReady: (m) => this.flamesOf(m, 0.7, 2.2) });
    // candeleros de pared entre las ventanas (dibujan los estantes)
    for (const [x, z, nz] of [[16.5, -104.45, -1]]) {
      (c.soot = c.soot || []).push([x, F0 + 2.1, -104.2, 0, nz, 0]);
      c.b.box('iron', x, F0 + 2.05, z + nz * 0.12, 0.05, 0.05, 0.24, {});
      this.candle(x, F0 + 2.08, z + nz * 0.24, 0.2, 0.03, 0);
      c.light(x, F0 + 2.5, z + nz * 0.5, 0xffb060, 2.6, 8, { flicker: true, priority: 1 });
    }
    for (const [x, z] of [[9.2, -109.5], [23.3, -107.2]]) this.candleCluster(x, F0, z, 4, 0.18, 1.2);
    // palanca del pasadizo: un candelabro de pared junto al estante
    c.b.box('iron', 18.2, F0 + 1.9, -114.62, 0.12, 0.3, 0.1, {});
    c.b.finish(this.scene);
    this.leverCandle = c.flame(18.2, F0 + 2.26, -114.4, 0.06, 0.12, {});
    this.candle(18.2, F0 + 2.05, -114.42, 0.2, 0.03);
    c.anchors.lever = new THREE.Vector3(18.2, F0 + 1.9, -114.4);
    // --- sala de los retratos: mecedora, silla de ruedas, espejo roto
    this.place('c_rocking', -4.4, F0, -123.4, 0.6, 1, { still: false, onReady: (m) => { this.models.rocking2 = m; } });
    this.place('c_wheelchair', 5.6, F0, -121.2, -Math.PI / 2, 1, { still: false, onReady: (m) => { this.models.wheelchair = m; } });
    // --- cuarto secreto: candelabros de pie a los lados del altar
    for (const x of [10.9, 15.1]) this.place('c_candelabra', x, F0, -124.9, 0, 1, { onReady: (m) => this.flamesOf(m, 1, 3.2) });
    // --- cuarto secreto: el cofre del Conde
    this.place('c_chest', 17.8, F0, -124.9, 0, 1, { still: false, onReady: (m) => { this.models.chest = m; } });
    this.phys.box(17.8, F0 + 0.3, -124.9, 0.5, 0.3, 0.28, 0, { paint: false });
    // --- cocina: velas sobre la mesa de carnicero y en el estante (la luz verde del caldero sola era un pozo)
    this.candleCluster(-15, F0 + 0.91, -121.35, 3, 0.1, 1.3);
    this.candleCluster(-23.4, F0 + 2.03, -117.9, 3, 0.12, 0.9);
    this.candleCluster(-9.6, F0 + 0.6, -125.1, 2, 0.1, 0.8);
    // --- cocina: barriles y cajones; ratas
    for (const [x, z] of [[-9.2, -116.2], [-9.8, -117.3], [-23, -115.9]]) { this.place('c_barrel', x, F0, z, this.r() * 3); this.phys.cylinder(x, F0 + 0.47, z, 0.47, 0.35); }
    for (const [x, z] of [[-9.5, -125.1], [-10.6, -125.1]]) { this.place('c_crate', x, F0, z, 0.2); this.phys.box(x, F0 + 0.3, z, 0.4, 0.3, 0.4, 0.2, { paint: false }); }
    this.rats = [];
    for (const [x, z, y] of [[-20, -118, F0], [12, -106, 0.06], [20, -124, 0.06]]) this.place('c_rat', x, y, z, 0, 1, { still: false, onReady: (m) => this.rats.push({ m, x0: x, z0: z, y, t: this.r() * 10 }) });
    // --- fogón: el anillo de piedras con leños carbonizados y brasas, troncos para sentarse y la leña apilada
    const fire = c.anchors.fire;
    if (fire) this.place('c_firepit', fire.x, 0.02, fire.z, 0.4, 1.02, { onReady: (m) => {
      m.traverse((o) => { if (o.isMesh && o.material?.emissive) { o.material.emissiveIntensity = 2.6; this.firepitMat = o.material; } });
    } });
    this.instances('c_logbench', (c.benches || []).map((bb) => this.mat4(bb.x, 0.03, bb.z, bb.yaw, 1)));
    if (c.woodpile) {
      const wp = [];
      for (let row = 0; row < 3; row++) for (let k = 0; k < 5 - row; k++) {
        wp.push(new THREE.Matrix4().compose(
          new THREE.Vector3(c.woodpile.x - 0.64 + k * 0.29 + row * 0.145, 0.07 + row * 0.13, c.woodpile.z + (this.r() - 0.5) * 0.08),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 + (this.r() - 0.5) * 0.12, 0)), new THREE.Vector3(1.6, 1.3, 1.3)));
      }
      this.instances('c_firewood', wp);
    }
    // --- patio / fogón
    for (const [x, z, yaw] of [[-21.5, -88.3, -Math.PI / 2 + 0.35], [-21.5, -96.7, -Math.PI / 2 - 0.35]]) {
      this.place('c_armchair', x, 0.05, z, yaw, 1.05);
      this.phys.box(x, 0.5, z, 0.45, 0.5, 0.45, yaw, { paint: false });
      this.c.seats.push({ x: x - 0.05, y: 0.5, z, yaw });
    }
    this.place('d_sofa', -19.2, 0.05, -92.5, -Math.PI / 2, 1);
    for (let k = -1; k <= 1; k++) this.c.seats.push({ x: -19.3, y: 0.52, z: -92.5 + k * 0.72, yaw: -Math.PI / 2 });
    this.phys.box(-19.1, 0.45, -92.5, 0.5, 0.45, 1.3, 0, { paint: false });
    for (const [x, z] of [[-34.2, -89.1], [-24.6, -89.1], [-34.2, -95.9], [-24.6, -95.9]]) {
      this.place('c_lantern', x, 4.25, z, this.r() * 3, 1, { onReady: () => {} });
      c.deco('iron', x, 5.0, z, 0.02, 1.1, 0.02, {});
      this.c.flame(x, 4.42, z, 0.05, 0.1, {});
      this.c.light(x, 4.5, z, 0xffb060, 2.4, 8, { flicker: true, priority: 1.2 });
    }
    for (const [x, z] of [[-38.2, -86.4], [-16.2, -99.0]]) { this.place('c_barrel', x, 0.05, z, this.r() * 3); this.phys.cylinder(x, 0.5, z, 0.47, 0.35); }
    // --- cementerio: estatua, reja, pala, faroles en postes
    this.place('c_statue', 33.5, 0.02, -117.5, 0, 1, { onReady: (m) => { this.models.statue = m; } });
    this.phys.box(33.5, 1.0, -117.5, 0.9, 1.0, 0.9, 0, { paint: false });
    this.place('c_iron_gate', 33.5, 0, -103, 0, 1, { still: false, onReady: (m) => this._openGate(m) });
    this.place('c_spade', 39.4, -0.25, -126.7, 0.4, 1, {});
    for (const [x, z] of [[27.5, -113.5], [40.5, -121.5], [-27.5, -113], [-3.4, -62], [3.4, -62], [-3.4, -71], [3.4, -71]]) {
      c.b.box('iron', x, 1.25, z, 0.08, 2.5, 0.08, {});
      c.b.box('iron', x + 0.3, 2.45, z, 0.6, 0.05, 0.05, { collide: false });
      this.place('c_lantern', x + 0.55, 1.95, z, 0, 1);
      this.c.flame(x + 0.55, 2.12, z, 0.05, 0.1, {});
      this.c.light(x + 0.55, 2.2, z, 0xffa050, 1.8, 7, { flicker: true, priority: 0.9 });
    }
    c.b.finish(this.scene);
    // --- aljibe: el balde colgando de la soga
    this.place('c_bucket', -21, 0.65, -66.5, 0.3, 1.1, { still: false, onReady: (m) => { this.models.bucket = m; } });
    this._flushCandles();
    if (this._hearthLogs) this.instances('c_firewood', this._hearthLogs, { onReady: (ims) => { for (const im of ims) { im.material = im.material.clone(); im.material.color?.multiplyScalar(0.35); } } });
  }

  _openGate(m) {
    // re-pivotear las hojas del portón de rejas sobre sus bisagras y dejarlas entreabiertas
    const box = new THREE.Box3().setFromObject(m);
    const half = (box.max.x - box.min.x) / 2;
    const leaves = [];
    m.traverse((o) => { if (o.isMesh && /left_door|right_door/.test(o.name)) leaves.push(o); });
    for (const o of leaves) {
      const s = /left/.test(o.name) ? -1 : 1;
      const hinge = new THREE.Vector3(m.position.x + s * half, 0, m.position.z);
      const pivot = new THREE.Group();
      pivot.position.copy(hinge);
      this.scene.add(pivot);
      pivot.attach(o);
      pivot.rotation.y = s * -1.1;
    }
  }

  _portrait(m, kind, i) {
    if (!HAS_DOM) return;
    let canvasMesh = null;
    m.traverse((o) => { if (o.isMesh && /canvas/i.test(o.material?.name || '')) canvasMesh = o; });
    if (!canvasMesh) return;
    const normal = tex(portraitCanvas(kind, i * 7 + 3));
    const skull = tex(portraitCanvas(kind, i * 7 + 3, true));
    const mat = new THREE.MeshStandardMaterial({ map: normal, roughness: 0.55 });
    canvasMesh.material = mat;
    this.portraits.push({ mat, normal, skull, m });
  }

  update(t, dt) {
    for (const a of this.anim) a(t, dt);
    this.corpse?.update(dt);
    // ratas: van y vienen a lo largo de la pared
    for (const r of this.rats || []) {
      r.t += dt;
      const k = (Math.sin(r.t * 0.5) + 1) / 2;
      const x = r.x0 + (k - 0.5) * 3.2;
      r.m.position.set(x, r.y, r.z0 + Math.sin(r.t * 1.3) * 0.15);
      r.m.rotation.y = Math.cos(r.t * 0.5) > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }
}

export function decorateCastle(castle) {
  const d = new Decor(castle);
  d.build();
  castle.decor = d;
  stainCastle(castle);
  castle.update = (dt) => d.update(G.time, dt);
  return d;
}
