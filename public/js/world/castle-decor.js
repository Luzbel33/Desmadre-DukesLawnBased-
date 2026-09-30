// Decoración del castillo del terror: modelos (llegan en segundo plano), calabazas talladas con fuego adentro,
// velas, lápidas con epitafios, telarañas, retratos pintados por código, calaveras, árboles secos, niebla baja,
// murciélagos, cuervos y el espantapájaros. Todo lo repetido va instanciado.
import * as THREE from 'three';
import { G, rng } from '../core/G.js';
import { whenAsset, assetModel, instanceModel, artwork, placeModel } from '../game/assets.js';
import { Builder, getMat } from './builder.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CASTLE, CLUB } from '../shared/mapdata.js';
import { stainCastle } from './castle-stains.js';
import { dressCastle } from './castle-dress.js';
import { Corpse } from './castle-corpse.js';
import { Fair } from './fair.js';

const F0 = CASTLE.keep.floor;
const HAS_DOM = typeof document !== 'undefined';
const mergeGeos = (list) => mergeGeometries(list, false);
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
    // la explanada con vida: feria, taberna y fogata (la gente la pone game/villagers.js)
    this.fair = new Fair(this).build();
    this.c.fair = this.fair;
    this.anim.push((t) => this.fair.update(t));
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
    // Three arranged groups mark the threshold. Sizes and orientations are
    // authored around a focal lantern, leaving the walking route clear.
    for (const [x,z,s,lit,yaw] of [
      [-4.1,-72.6,.95,true,.3],[-4.95,-72.85,.57,false,1.4],[-4.35,-71.75,.4,false,2.2],
      [4.15,-70.9,.72,true,-.45],[4.85,-71.4,.48,false,.8],
      [-3.55,-61.7,.64,true,.15],[-4.15,-62.15,.37,false,2.4],
    ]) put(x,.07,z,s,lit,yaw,lit);
    for (const [x,z,i,s,lit] of [[-3.65,-96.43,2,.62,true],[-3.65,-96.76,3,.35,false],
      [3.65,-99.72,12,.53,true],[3.65,-100.05,13,.31,false],[-3.65,-101.87,18,.42,true]]) {
      put(x,(i+1)*3.5/20,z,s,lit,0.12*(x<0?1:-1));
    }
    // galpón del fogón: en las esquinas
    for (const [x, z, sc, lit] of [[-39.4, -85.3, 0.72, true], [-14.7, -85.1, 0.62, true], [-14.8, -99.8, 0.8, false], [-39.3, -99.8, 0.6, true]]) put(x, 0.05, z, sc, lit, Math.PI, lit);
    // huerta: un calabazar entero (surcos de barro con calabazas grandes y chicas)
    const rows = [];
    for (let row = 0; row < 5; row++) {
      const list = [];
      for (let k = 0; k < 7; k++) {
        const x = -41.2 + row * 3.1 + (r() - 0.5) * 0.6, z = -107 - k * 3.1 + (r() - 0.5) * 0.8;
        const lit = r() < 0.14;
        const s = 0.55 + r() * 0.55;
        put(x, 0.08, z, s, lit, null, lit && r() < 0.5);
        list.push([x, z, s]);
        // las chiquitas que recién crecen, al lado de la guía
        if (r() < 0.6) put(x + (r() - 0.5) * 1.2, 0.06, z - 1.2 - r() * 0.6, 0.18 + r() * 0.16);
      }
      rows.push(list);
      this.c.deco('mud', -41.2 + row * 3.1, 0.06, -116.3, 1.2, 0.12, 20, { mask: false, noShadow: true });
    }
    this._vines(rows);
    this.instances('c_pumpkin_a', plainA);
    this.instances('c_pumpkin_b', plainB);
    this.instances('c_jack', carved, { onReady: (ims) => {
      // el interior brilla (el modelo trae emisión en la cara interna); un poco más fuerte de noche
      for (const im of ims) { const m = im.material; if (m.emissive && m.emissiveIntensity) m.emissiveIntensity = 3.2; }
    } });
  }

  // guías del zapallo: un tallo que serpentea por el surco pasando por cada calabaza, con zarcillos y hojas grandes
  _vines(rows) {
    if (!HAS_DOM) return;
    const r = this.r, geos = [], leaves = [];
    for (const list of rows) {
      const pts = [];
      for (let i = 0; i < list.length; i++) {
        const [x, z, s] = list[i];
        pts.push(new THREE.Vector3(x - 0.35 * s, 0.1, z + 0.2), new THREE.Vector3(x + (r() - 0.5) * 0.9, 0.09, z - 1.5 + (r() - 0.5) * 0.5));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      geos.push(new THREE.TubeGeometry(curve, pts.length * 10, 0.022, 5, false));
      // zarcillos (rulitos) y hojas a lo largo
      const n = pts.length * 4;
      for (let i = 1; i < n; i++) {
        const p = curve.getPointAt(i / n), t = curve.getTangentAt(i / n);
        const side = r() < 0.5 ? -1 : 1;
        const lx = p.x + t.z * side * 0.18, lz = p.z - t.x * side * 0.18;
        leaves.push(this.mat4(lx, 0.07, lz, Math.atan2(t.x, t.z) + side * (0.8 + r() * 0.8), 1.6 + r() * 1.3, 1.2 + r() * 0.6));
        if (r() < 0.35) {
          const c = [];
          for (let k = 0; k <= 12; k++) { const a = k * 0.9, rr = 0.06 * (1 - k / 14); c.push(new THREE.Vector3(p.x + t.z * side * (0.05 + k * 0.012) + Math.cos(a) * rr, 0.1 + Math.sin(a) * rr * 0.6 + k * 0.004, p.z - t.x * side * (0.05 + k * 0.012) + Math.sin(a) * rr)); }
          geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(c), 16, 0.004, 3, false));
        }
      }
    }
    const g = mergeGeos(geos);
    if (g) {
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x3d5a22, roughness: 0.8 }));
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
    }
    this.instances('c_vineleaf', leaves, { shadow: false });
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
    for (const x of [-20.5, -12.5, 12.5]) this.candle(x - 0.3, 5.0, -104.2, 0.22, 0.03, 0);
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
      const mound = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI*2, 0, Math.PI/2);
      const mp = mound.attributes.position;
      for (let j=0;j<mp.count;j++) {
        const px=mp.getX(j), pz=mp.getZ(j);
        const k=1+0.055*Math.sin(px*13+pz*9);
        mp.setXYZ(j,px*.56*k,mp.getY(j)*(.12+.045*Math.cos(px*5+pz*7)),pz*1.02*k);
      }
      mound.rotateY(yaw); mound.translate(x,.045,z+1); mound.computeVertexNormals();
      b.geo('mud', mound);
    }
    // tumba abierta con la pala
    const pile=new THREE.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2);
    const pp=pile.attributes.position;
    for(let i=0;i<pp.count;i++) {
      const x=pp.getX(i),y=pp.getY(i),z=pp.getZ(i),j=1+.12*Math.sin(x*7+z*9);
      pp.setXYZ(i,x*.86*j,y*.46*j,z*.61*j);
    }
    pile.translate(40.2,.025,-127.2);pile.computeVertexNormals();b.geo('mud',pile);
    this.c.phys.box(40.2,.18,-127.2,.7,.18,.45,0);
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
  // Paños de lana hechos en Blender (assets/blender/artpass/banner.py): cuelgan de anillas en una vara con ménsulas y
  // traen sus pliegues; acá solo se mecen con el viento (nada en la vara, más en la cola). El cartel es de tablones con
  // "Castillo del Terror" tallado (sign.py), colgado de dos cadenas bajo la cornisa, entre los dos estandartes.
  _banners() {
    if (!HAS_DOM) return;
    const Z = -74.6; // cara del portón que da a la explanada
    const U = { uT: { value: 0 } };
    let swayReady = false;
    const sway = (m) => {
      m.traverse((o) => {
        if (!o.isMesh || !/banner_cloth/.test(o.material?.name || '') || swayReady) return;
        swayReady = true;
        const mat = o.material;
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.uT = U.uT;
          sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
            float bk = clamp(-position.y / 4.3, 0.0, 1.0);
            bk *= bk;
            transformed.z += (sin(uT * 1.3 + position.x * 1.7 + position.y * 0.8) * 0.05 + sin(uT * 2.9 + position.y * 2.3 + position.x) * 0.014) * bk;
            transformed.x += sin(uT * 0.9 + position.y * 0.6) * 0.03 * bk;`);
        };
        mat.customProgramCacheKey = () => 'banner-cloth-sway';
        mat.needsUpdate = true;
      });
    };
    // la vara de cada estandarte queda justo debajo de la cornisa del portón (y = 11.03)
    for (const s of [-1, 1]) {
      whenAsset('c_banner', () => {
        const m = assetModel('c_banner');
        if (!m) return;
        const k = 0.86;
        m.scale.setScalar(k);
        const top = new THREE.Box3().setFromObject(m).max.y; // punta de los remates de la vara
        m.position.set(s * 4.3, 10.93 - (top - 0.035 * k), Z);
        m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.scene.add(m);
        m.updateMatrixWorld(true);
        m.traverse((o) => { o.matrixAutoUpdate = false; });
        sway(m);
      });
    }
    this.anim.push((time) => { U.uT.value = time; });
    // cartel: las argollas de la pared a 10,85 m
    whenAsset('c_gate_sign', () => {
      const m = assetModel('c_gate_sign');
      if (!m) return;
      const top = new THREE.Box3().setFromObject(m).max.y;
      m.position.set(0, 10.85 - (top - 0.05), Z);
      this.scene.add(m);
      m.updateMatrixWorld(true);
      m.traverse((o) => { o.matrixAutoUpdate = false; });
    });
  }

  // vidrio del farol encendido: brilla cálido (lo toma el bloom) y no tapa la luz
  _glowLantern(m) {
    if (!this._lanternGlass) {
      this._lanternGlass = new THREE.MeshStandardMaterial({ color: 0x2a1808, emissive: 0xffa040, emissiveIntensity: 1.8, roughness: 0.3, transparent: true, opacity: 0.9, depthWrite: false });
    }
    m.traverse((o) => {
      if (o.isMesh && /glass/i.test(o.material?.name || '')) { o.material = this._lanternGlass; o.castShadow = false; }
    });
  }

  // ---------------------------------------------------------------- calaveras (cripta, cuarto secreto, cementerio)
  _skulls() {
    if (!HAS_DOM) return;
    const spots = [];
    const r = this.r;
    // montones en nichos de la cripta y del cuarto secreto
    for (const [x, y, z, n] of [[8.85, 0.12, -110, 9], [8.85, 0.12, -121.5, 7], [23.3, 0.12, -114.5, 6], [9.5, F0 + 0.1, -125.2, 5], [13.9, F0 + 1.14, -125.05, 3]]) {
      for (let i = 0; i < n; i++) spots.push([x + (r() - 0.5) * 0.5, y + (i > 4 ? 0.17 : 0) + r() * 0.03, z + (r() - 0.5) * 0.9, (r() - 0.5) * 1.5]);
    }
    for (const [x, z] of [[33, -109.2], [29.7, -125.5], [42.3, -113]]) spots.push([x, 0.1, z, r() * 3]);
    // calavera anatómica del pase de arte (antes: esferas pintadas); la base del modelo apoya en el piso
    this.instances('c_skull', spots.map(([x, y, z, yaw]) => this.mat4(x, y - 0.09, z, yaw + Math.PI / 2, 0.95 + r() * 0.1)));
    // cementerio y cripta: huesos sueltos, un esqueleto en la tumba abierta y otro sentado contra una lápida
    this.instances('c_bones', [this.mat4(9.2, 0.02, -110.1, 0.4, 0.8), this.mat4(23.0, 0.02, -114.9, 2.1, 0.7), this.mat4(41.6, 0.01, -121.2, 1.2, 1), this.mat4(28.4, 0.01, -127.6, 3, 0.9)]);
    whenAsset('c_skel_lie', () => placeModel(this.scene, 'c_skel_lie', 38.4, 0.02, -127.1, Math.PI / 2 + 0.15, 1));
    whenAsset('c_skel_sit', () => placeModel(this.scene, 'c_skel_sit', 42.9, 0, -117.2, -Math.PI / 2 - 0.2, 1));
    // jaula colgante (gibbet) de un poste con brazo, a la entrada del cementerio, con un esqueleto sentado adentro
    this._gibbet(25.8, -106.2, 0.4);
  }
  _gibbet(x, z, yaw) {
    const b = new Builder(this.phys);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    b.box('woodDark', x, 2.3, z, 0.22, 4.6, 0.22, { yaw });
    b.box('woodDark', x + c * 0.8, 4.35, z - s * 0.8, 1.9, 0.18, 0.18, { yaw, collide: false });
    b.box('woodDark', x + c * 0.35, 3.95, z - s * 0.35, 0.12, 0.9, 0.12, { yaw, rz: 0.8, collide: false });
    b.finish(this.scene);
    const hx = x + c * 1.55, hz = z - s * 1.55, top = 4.25;
    const g = new THREE.Group();
    g.position.set(hx, top, hz);
    this.scene.add(g);
    // el modelo: origen en el enganche de arriba, cuelga 3.15 m (1.2 de cadena y la jaula)
    whenAsset('c_gibbet', () => { const m = assetModel('c_gibbet'); if (m) { m.position.y = -3.17; g.add(m); } });
    whenAsset('c_skel_sit', () => { const m = assetModel('c_skel_sit'); if (m) { m.position.y = -3.1; m.scale.setScalar(0.82); m.rotation.y = 0.6; g.add(m); } });
    this.anim.push((t) => { g.rotation.set(Math.sin(t * 0.8) * 0.035, Math.sin(t * 0.23) * 0.25, Math.sin(t * 0.61) * 0.03); });
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
      // la tumba de la escalera al Búnker: hueca, con su tapa aparte (se corre; ver game/club.js)
      if (!big && x === CLUB.tomb.x && z === CLUB.tomb.z) continue;
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
    // patio: horca (modelo del pase de arte: tarima a 1.6 m, escalera al sur, lazo sobre la trampilla), fardos y el carro
    this._gallows(30, -90);
    this._hay([[22, -83.2, 0.1], [23.3, -83.3, -0.1], [22.6, -83.3, 0], [42.4 - 1, -99, 1.5], [-42.4 + 1, -84, 1.6]], [[22.6, -83.3, 0.05]]);
    // sentado ARRIBA de los fardos de abajo (a los costados del de arriba), no en el aire delante de ellos
    this.c.seats.push({ x: 21.8, y: 0.62, z: -83.45, yaw: Math.PI }, { x: 23.5, y: 0.62, z: -83.55, yaw: Math.PI });
    // carro de campo con las varas apoyadas en el piso (y calabazas en la caja)
    this._cart(16.2, -85.2, Math.PI);
    // mesas, sarcófagos, altar y demás: también hacen sombra con el fuego y el candelabro (luz heroica, capa 1)
    for (const m of b.finish(this.scene) || []) m.layers.enable(1);
    // caldero con brebaje verde que burbujea (y la luz verde)
    const cauldron = new THREE.LatheGeometry([[0, 0], [.36, .04], [.5, .3], [.46, .6], [.4, .66], [.37, .66], [.43, .58], [.46, .3], [.34, .09], [0, .09]].map(([r2, y]) => new THREE.Vector2(r2, y)), 32);
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
  // fardos de heno (modelo horneado); stack: los de arriba. Colisión: una caja por fardo
  _hay(list, stack = []) {
    const S = 1.4, W = 0.92 * S, D = 0.46 * S, H = 0.36 * S; // ~1.29 x 0.64 x 0.5 m
    const mats = [];
    for (const [x, z, yaw] of list) { mats.push(this.mat4(x, 0, z, yaw, S)); this.phys.box(x, H / 2, z, W / 2, H / 2, D / 2, yaw, { paint: false, mat: 'wood' }); }
    for (const [x, z, yaw] of stack) { mats.push(this.mat4(x, H, z, yaw, S)); this.phys.box(x, H * 1.5, z, W / 2, H / 2, D / 2, yaw, { paint: false, mat: 'wood' }); }
    this.instances('c_haybale', mats);
    return H;
  }
  _cart(x, z, yaw, pumpkins = true) {
    // origen del modelo: en el piso, al centro del eje; la caja va de -1 a 1.4 m (x local) y las varas hasta 3.6 m
    whenAsset('c_cart', () => { const m = placeModel(this.scene, 'c_cart', x, 0, z, yaw, 1); if (m) m.traverse((o) => { if (o.isMesh) o.layers.enable(1); }); });
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const [bx, bz] = at(0.2, 0);
    this.phys.box(bx, 0.6, bz, 1.2, 0.55, 0.95, yaw, { paint: false, mat: 'wood' });
    for (const sd of [-1, 1]) { const [wx, wz] = at(0, sd * 0.95); this.phys.cylinder(wx, 0.62, wz, 0.06, 0.62, { mat: 'wood' }); }
    if (!pumpkins) return;
    const cart = [];
    for (let i = 0; i < 7; i++) {
      const [px, pz] = at(-0.65 + (i % 4) * 0.55, (Math.floor(i / 4) - 0.5) * 0.6 + (this.r() - 0.5) * 0.1);
      cart.push(this.mat4(px, 0.92 + (i === 6 ? 0.25 : 0), pz, i * 1.3, 0.5 + this.r() * 0.12));
    }
    this.instances('c_pumpkin_b', cart);
  }
  _gallows(x, z) {
    whenAsset('c_gallows', () => { const m = placeModel(this.scene, 'c_gallows', x, -0.13, z, 0, 1); if (m) m.traverse((o) => { if (o.isMesh) o.layers.enable(1); }); });
    // tarima (x ±1.4, z -1.33..1.4, arriba a 1.6 m), escalera (x 0.25..0.85, sube de z 3.1 a 1.4) y los postes
    this.phys.box(x, 0.74, z + 0.035, 1.4, 0.74, 1.37, 0, { paint: false, mat: 'wood' });
    this.phys.wedge(x + 0.55, 0, z + 2.25, 0.8, 1.7, 1.48, Math.PI, { mat: 'wood' });
    this.phys.box(x - 1.25, 3.3, z + 1.2, 0.1, 1.8, 0.1, 0, { paint: false, mat: 'wood' });
    // el ahorcado: esqueleto colgando del lazo, por la trampilla abierta (se hamaca con el viento)
    const hang = new THREE.Group();
    hang.position.set(x + 0.5, 2.66, z - 0.95);
    this.scene.add(hang);
    whenAsset('c_skel_hang', () => { const m = assetModel('c_skel_hang'); if (!m) return; m.position.y = -1.56; hang.add(m); });
    this.anim.push((t) => { hang.rotation.set(Math.sin(t * 0.7) * 0.05, Math.sin(t * 0.31) * 0.6, Math.sin(t * 0.53 + 1) * 0.04); });
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
    // cuerpo: modelo del pase de arte (assets/blender/artpass/scarecrow.py): camisa leñadora rellena de paja, pantalón
    // de arpillera, cinto de soga; el poste con colisión
    whenAsset('c_scarecrow', () => placeModel(this.scene, 'c_scarecrow', x, 0, z, 0, 1));
    this.phys.cylinder(x, 1.35, z, 1.35, 0.08, { mat: 'wood' });
    const head = new THREE.Group();
    head.position.set(x, 2.1, z);
    whenAsset('c_jack', () => {
      const pm = assetModel('c_jack');
      if (!pm) return;
      pm.scale.setScalar(0.62);
      pm.position.y = -0.12;
      head.add(pm);
    });
    // sombrero de bruja caído (con la punta doblada), un poco ladeado
    whenAsset('c_scarecrow_hat', () => { const h = assetModel('c_scarecrow_hat'); if (!h) return; h.position.set(0.02, 0.26, 0); h.rotation.set(0.12, 0.5, -0.18); h.scale.setScalar(1.15); head.add(h); });
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
    if ((type === 'c_chair' || type === 'c_armchair') && y >= F0 - .05) this.c.seats.push({ x, y: y + (type === 'c_armchair' ? .48 : .46) * scale, z, yaw });
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
    this.place('c_facade', 0, 0, -103);
    this.place('c_gate_relief', 0, 0, -74.6);
    for (const x of [-5.6, 5.6]) this.place('c_brazier', x, 1.1, -95);
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
    for (const [x, z, nx] of [[-7.62, -104.25, 1], [7.62, -112.0, -1], [7.62, -115.2, -1], [-7.62, -116.0, 1]]) {
      (c.soot = c.soot || []).push([x - nx * 0.08, F0 + 2.1, z, nx, 0, 0]);
      c.b.box('iron', x + nx * 0.12, F0 + 2.05, z, 0.24, 0.05, 0.05, { collide: false });
      c.b.box('iron', x + nx * 0.05, F0 + 1.85, z, 0.05, 0.45, 0.05, { collide: false });
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
      [-7.65, F0 + 2.5, -109.3, Math.PI / 2, 0], [-7.65, F0 + 3.4, -111.9, Math.PI / 2, 1], [-7.65, F0 + 4.3, -114.5, Math.PI / 2, 4],
      [0, F0 + 9.3, -116.45, 0, 3],
      [-7.65, F0 + 1.7, -118.3, Math.PI / 2, 2], [-7.65, F0 + 1.7, -124.1, Math.PI / 2, 5], [7.65, F0 + 1.7, -120.1, -Math.PI / 2, 1], [7.65, F0 + 1.7, -123.6, -Math.PI / 2, 4],
      [0, F0 + 1.7, -125.75, 0, 0], [-5.6, F0 + 1.8, -117.15, Math.PI, 2],
      [-20.1, F0 + 2.1, -114.7, 0, 1],
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
      this.place('c_lantern', x, 4.25, z, this.r() * 3, 1, { onReady: (m) => this._glowLantern(m) });
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
    // faroles de camino (portón, cementerio, huerta): poste de hierro forjado con el farol colgado del brazo, que
    // apunta al camino; la llama y la luz van donde el modelo marca "flame" (assets/blender/artpass/lamp_post.py)
    for (const [x, z, yaw] of [[27.5, -113.5, 0], [40.5, -121.5, Math.PI], [-27.5, -113, 0], [-3.4, -62, 0], [3.4, -62, Math.PI], [-3.4, -71, 0], [3.4, -71, Math.PI]]) {
      this.place('c_lamppost', x, 0, z, yaw, 1, { onReady: (m) => this._glowLantern(m) });
      this.phys.box(x, 0.17, z, 0.22, 0.17, 0.22, 0, { paint: false });
      this.phys.box(x, 1.7, z, 0.05, 1.4, 0.05, 0, { paint: false });
      const fx = x + Math.cos(yaw) * 0.59, fz = z - Math.sin(yaw) * 0.59;
      this.c.flame(fx, 2.39, fz, 0.045, 0.1, {});
      this.c.light(fx, 2.5, fz, 0xffa050, 3.6, 10, { flicker: true, priority: 1.1 });
    }
    c.b.finish(this.scene);
    // --- aljibe: el balde colgando de la soga
    this.place('c_bucket', -21, 0.65, -66.5, 0.3, 1.1, { still: false, onReady: (m) => { this.models.bucket = m; } });
    this._flushCandles();
    if (this._hearthLogs) this.instances('c_firewood', this._hearthLogs, { onReady: (ims) => { for (const im of ims) { im.material = im.material.clone(); im.material.color?.multiplyScalar(0.35); } } });
  }

  _openGate(m) {
    // re-pivotear las hojas del portón de rejas sobre sus bisagras y dejarlas entreabiertas
    // Parent all auxiliary meshes (lock, latch, rings) to the correct leaf
    // before opening it. Moving only door meshes left the fittings in mid-air.
    m.updateMatrixWorld(true);
    const leavesForHardware=[];
    m.traverse(o=>{if(o.isMesh && /left_door|right_door/.test(o.name)) leavesForHardware.push(o);});
    const fittings=[];
    m.traverse(o=>{if(o.isMesh && !leavesForHardware.includes(o)) fittings.push(o);});
    for(const o of fittings){
      const p=new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      const leaf=leavesForHardware.reduce((best,candidate)=>{
        const c=new THREE.Box3().setFromObject(candidate).getCenter(new THREE.Vector3());
        const distance=Math.abs(c.x-p.x);
        return !best||distance<best.distance?{o:candidate,distance}:best;
      },null);
      leaf?.o.attach(o);
    }
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
    const paintings = ['aic-11.jpg','aic-15708.jpg','aic-95998.jpg','aic-94840.jpg','aic-88632.jpg',
      'aic-146701.jpg','aic-84709.jpg','aic-131407.jpg','aic-100829.jpg','portrait-artist.jpg','landscape.jpg'];
    const normal = artwork('assets/art/' + paintings[i % paintings.length]);
    const skull = tex(portraitCanvas(kind, i * 7 + 3, true));
    const mat = new THREE.MeshStandardMaterial({ map: normal, roughness: 0.88 });
    canvasMesh.material = mat;
    this.portraits.push({ mat, normal, skull, m });
  }

  update(t, dt) {
    const water = this.c.wellWater;
    if (water) { water.uniforms.uWaterTime.value = t; water.uniforms.uWaterImpact.value = water.pulseAt; }
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
