// Las paredes y los rincones del torreón con alma: tapices tejidos, trofeos (las máscaras de animales de las bailarinas
// sobre placas de roble), espadas cruzadas con escudo, candeleros, chorreados de humedad y bultos en los rincones.
// Dónde va cada cosa lo decide la física: se tira un rayo contra la pared desde adentro del cuarto, y solo se cuelga
// donde hay pared lisa (nunca sobre una puerta, una ventana, un estante o un mueble). Corre una vez, ya con el mundo
// físico listo (unos cuadros después de armar el castillo).
import * as THREE from 'three';
import { G } from '../core/G.js';
import { Builder, getMat } from './builder.js';
import { whenAsset, assetModel } from '../game/assets.js';
import { rng } from '../core/G.js';

const HAS_DOM = typeof document !== 'undefined';
const PI = Math.PI, TAU = PI * 2;
const F0 = 3.5, U0 = 10.3;

// cuartos: rect = [x0, z0, x1, z1] (caras interiores), base = piso, h = hasta dónde sube la pared útil
const ROOMS = [
  { id: 'salon', rect: [-7.7, -116.4, 7.7, -104.6], base: F0, themes: ['moon', 'skull', 'stag'], trophies: ['c_mask_lion', 'c_mask_bull'], tap: 3, arms: 2, trophy: 2, sconce: 6, grime: 4, clutter: 3 },
  { id: 'retratos', rect: [-7.7, -125.6, 7.7, -117.2], base: F0, themes: ['skull', 'moon'], trophies: ['c_mask_cat'], tap: 2, arms: 0, trophy: 1, sconce: 4, grime: 4, clutter: 3 },
  { id: 'comedor', rect: [-23.6, -114.8, -8.4, -104.4], base: F0, themes: ['stag', 'castle', 'hunt'], trophies: ['c_mask_bull', 'c_mask_horse', 'c_mask_pig'], tap: 3, arms: 2, trophy: 3, sconce: 5, grime: 4, clutter: 4 },
  { id: 'cocina', rect: [-23.6, -125.6, -8.4, -115.2], base: F0, themes: ['hunt'], trophies: ['c_mask_pig', 'c_mask_rabbit'], tap: 0, arms: 0, trophy: 2, sconce: 4, grime: 6, clutter: 6 },
  { id: 'biblioteca', rect: [8.4, -114.8, 23.6, -104.4], base: F0, themes: ['moon', 'castle'], trophies: ['c_mask_cat', 'c_mask_lion'], tap: 2, arms: 0, trophy: 2, sconce: 5, grime: 4, clutter: 4 },
  { id: 'secreto', rect: [8.4, -125.6, 20.2, -115.4], base: F0, themes: ['skull'], trophies: ['c_mask_bull'], tap: 1, arms: 1, trophy: 1, sconce: 3, grime: 4, clutter: 5 },
  { id: 'cripta', rect: [8.6, -125.6, 23.6, -104.4], base: 0, themes: ['skull'], trophies: [], tap: 0, arms: 0, trophy: 0, sconce: 5, grime: 8, clutter: 8, crypt: true },
  { id: 'condes', rect: [-23.6, -125.6, -8.4, -115.4], base: U0, themes: ['stag', 'moon', 'castle'], trophies: ['c_mask_horse', 'c_mask_lion'], tap: 3, arms: 1, trophy: 2, sconce: 4, grime: 3, clutter: 3 },
  { id: 'carto', rect: [-23.6, -114.6, -8.4, -104.4], base: U0, themes: ['moon', 'castle'], trophies: ['c_mask_cat'], tap: 2, arms: 0, trophy: 1, sconce: 4, grime: 3, clutter: 3 },
  { id: 'botica', rect: [8.4, -125.6, 23.6, -115.4], base: U0, themes: ['skull', 'hunt'], trophies: ['c_mask_rabbit', 'c_mask_cat'], tap: 1, arms: 0, trophy: 2, sconce: 4, grime: 5, clutter: 5 },
  { id: 'armeria', rect: [8.4, -114.6, 23.6, -104.4], base: U0, themes: ['hunt', 'stag'], trophies: ['c_mask_bull', 'c_mask_pig'], tap: 2, arms: 4, trophy: 2, sconce: 4, grime: 3, clutter: 4 },
  { id: 'archivo', rect: [-7.5, -125.6, 7.5, -117.4], base: U0, themes: ['moon', 'skull'], trophies: ['c_mask_lion'], tap: 2, arms: 0, trophy: 1, sconce: 3, grime: 3, clutter: 3 },
];

// ---------------------------------------------------------------- texturas
function weave(g, W, H, r) { // trama de tela y desgaste
  for (let y = 0; y < H; y += 3) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`; g.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 3) { g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.03})`; g.fillRect(x, 0, 1, H); }
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '200,180,140'},${r() * 0.1})`; g.beginPath(); g.arc(r() * W, r() * H, 1 + r() * 6, 0, TAU); g.fill(); }
}
const TAPS = new Map();
function tapestry(kind) {
  if (TAPS.has(kind) || !HAS_DOM) return TAPS.get(kind);
  const W = 256, H = 448, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  let s = kind.length * 977 + 13; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const bg = { stag: ['#1f3a2a', '#2e5a3e'], moon: ['#1a2342', '#2a3a6a'], skull: ['#4a0f18', '#7a1a26'], castle: ['#5a3d1a', '#8a6228'], hunt: ['#3a1a14', '#6a2a1e'] }[kind];
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, bg[1]); gr.addColorStop(1, bg[0]);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#c9a85a'; g.lineWidth = 8; g.strokeRect(14, 14, W - 28, H - 28 - 30); g.lineWidth = 2; g.strokeRect(26, 26, W - 52, H - 52 - 30);
  g.fillStyle = '#c9a85a'; g.strokeStyle = '#c9a85a';
  const cx = W / 2, cy = (H - 30) / 2;
  if (kind === 'moon') {
    g.beginPath(); g.arc(cx, cy - 20, 62, 0, TAU); g.fill(); g.fillStyle = bg[0]; g.beginPath(); g.arc(cx + 24, cy - 28, 54, 0, TAU); g.fill();
    g.fillStyle = '#c9a85a'; for (let i = 0; i < 26; i++) { const x = 40 + r() * (W - 80), y = 44 + r() * (H - 130), q = 1.5 + r() * 3; g.beginPath(); g.moveTo(x, y - q * 2); g.lineTo(x + q * 0.6, y - q * 0.6); g.lineTo(x + q * 2, y); g.lineTo(x + q * 0.6, y + q * 0.6); g.lineTo(x, y + q * 2); g.lineTo(x - q * 0.6, y + q * 0.6); g.lineTo(x - q * 2, y); g.lineTo(x - q * 0.6, y - q * 0.6); g.fill(); }
    g.font = 'bold 18px Georgia'; g.textAlign = 'center'; g.fillText('NOX AETERNA', cx, H - 70);
  } else if (kind === 'skull') {
    g.beginPath(); g.ellipse(cx, cy - 36, 58, 64, 0, 0, TAU); g.fill(); g.fillRect(cx - 34, cy + 20, 68, 44);
    g.fillStyle = bg[0]; for (const dx of [-24, 24]) { g.beginPath(); g.ellipse(cx + dx, cy - 36, 15, 19, 0, 0, TAU); g.fill(); } g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx - 9, cy + 12); g.lineTo(cx + 9, cy + 12); g.fill();
    g.fillStyle = '#c9a85a'; for (let k = -3; k <= 3; k++) g.fillRect(cx + k * 9 - 3, cy + 40, 6, 22);
    g.strokeStyle = '#c9a85a'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx - 90, cy + 90); g.lineTo(cx + 90, cy + 150); g.moveTo(cx + 90, cy + 90); g.lineTo(cx - 90, cy + 150); g.stroke();
  } else if (kind === 'stag') {
    g.lineWidth = 7; g.lineCap = 'round'; // ciervo estilizado: cuerpo, cuello, cabeza y la cornamenta
    g.beginPath(); g.ellipse(cx, cy + 30, 62, 34, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(cx + 40, cy + 20); g.lineTo(cx + 62, cy - 40); g.lineTo(cx + 84, cy - 52); g.lineTo(cx + 70, cy - 24); g.lineTo(cx + 56, cy + 24); g.fill();
    for (const [x0, x1] of [[-44, -52], [-18, -22], [22, 26], [46, 52]]) { g.beginPath(); g.moveTo(cx + x0, cy + 50); g.lineTo(cx + x1, cy + 108); g.stroke(); }
    g.beginPath(); g.moveTo(cx + 76, cy - 56); for (const [dx, dy] of [[-4, -50], [-24, -86], [8, -70], [-4, -100], [22, -84], [10, -112]]) g.lineTo(cx + 76 + dx, cy - 56 + dy); g.stroke();
    g.font = 'italic 17px Georgia'; g.textAlign = 'center'; g.fillText('VENATIO', cx, H - 70);
  } else if (kind === 'castle') {
    g.fillRect(cx - 50, cy - 30, 100, 110); for (const dx of [-50, -20, 10, 40]) g.fillRect(cx + dx, cy - 52, 20, 24);
    g.fillStyle = bg[0]; g.beginPath(); g.arc(cx, cy + 80, 26, PI, 0); g.fillRect(cx - 26, cy + 80, 52, 0); g.fill(); for (const dx of [-30, 30]) g.fillRect(cx + dx - 5, cy - 4, 10, 26);
    g.fillStyle = '#c9a85a'; for (const dx of [-62, 62]) { g.fillRect(cx + dx - 14, cy - 8, 28, 88); g.beginPath(); g.moveTo(cx + dx - 18, cy - 8); g.lineTo(cx + dx, cy - 40); g.lineTo(cx + dx + 18, cy - 8); g.fill(); }
  } else { // hunt: dos perros cruzando un bosque de líneas
    g.lineWidth = 5; g.lineCap = 'round';
    for (let k = 0; k < 7; k++) { const x = 40 + k * 28; g.beginPath(); g.moveTo(x, 70); g.lineTo(x, cy + 70); g.stroke(); g.beginPath(); g.moveTo(x, 90 + (k % 2) * 18); g.lineTo(x - 18, 130 + (k % 2) * 18); g.moveTo(x, 90 + (k % 2) * 18); g.lineTo(x + 18, 130 + (k % 2) * 18); g.stroke(); }
    g.fillStyle = '#0e0504'; for (const [x, y, f] of [[cx - 30, cy + 78, 1], [cx + 34, cy + 120, -1]]) { g.save(); g.translate(x, y); g.scale(f, 1); g.beginPath(); g.ellipse(0, 0, 40, 18, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(38, -14, 14, 10, 0.3, 0, TAU); g.fill(); g.fillRect(-30, 8, 8, 28); g.fillRect(-4, 8, 8, 28); g.fillRect(22, 8, 8, 28); g.fillRect(-14, 8, 8, 28); g.beginPath(); g.moveTo(-40, -2); g.lineTo(-64, -22); g.lineTo(-40, -8); g.fill(); g.restore(); }
  }
  weave(g, W, H, r);
  // el flequillo de abajo (hilos colgando) con alfa
  const id = g.getImageData(0, 0, W, H);
  for (let x = 0; x < W; x++) for (let y = H - 30; y < H; y++) { const i = (y * W + x) * 4; const k = (x % 6 < 3) ? 1 : 0; if (!k || y > H - 30 + 10 + (x % 5) * 3) id.data[i + 3] = 0; else if (y > H - 30) { id.data[i] = 201; id.data[i + 1] = 168; id.data[i + 2] = 90; id.data[i + 3] = 255; } }
  g.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, side: THREE.DoubleSide, alphaTest: 0.4 });
  TAPS.set(kind, m);
  return m;
}
let GRIME = null;
function grimeMat() {
  if (GRIME || !HAS_DOM) return GRIME;
  const W = 128, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  let s = 3; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 7; i++) { const x = 10 + r() * (W - 20), w = 3 + r() * 10, len = 80 + r() * 160, a = 0.12 + r() * 0.2; const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, `rgba(10,8,6,${a})`); gr.addColorStop(1, 'rgba(10,8,6,0)'); g.fillStyle = gr; g.fillRect(x, 0, w, len); }
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(20,30,18,${r() * 0.08})`; g.beginPath(); g.arc(r() * W, r() * H * 0.5, 2 + r() * 8, 0, TAU); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  GRIME = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  return GRIME;
}

// ---------------------------------------------------------------- piezas
function addTapestry(d, p, kind, rnd) {
  const m = tapestry(kind); if (!m) return;
  const w = 1.25 + rnd() * 0.4, h = 2.1 + rnd() * 0.5;
  const g = new THREE.PlaneGeometry(w, h, 10, 12), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const u = pos.getX(i) / w, v = pos.getY(i) / h + 0.5; pos.setZ(i, 0.05 + Math.sin(u * 14 + 0.7) * 0.03 * (1 - v * 0.7) + (1 - v) * 0.03); }
  g.computeVertexNormals();
  const grp = new THREE.Group(); grp.position.set(p.x + p.nx * 0.03, p.y, p.z + p.nz * 0.03); grp.rotation.y = Math.atan2(p.nx, p.nz);
  const cloth = new THREE.Mesh(g, m); cloth.position.y = -h / 2 - 0.12; cloth.castShadow = true; grp.add(cloth);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, w + 0.3, 8), getMat('iron')); rod.rotation.z = PI / 2; rod.position.set(0, -0.06, 0.04); grp.add(rod);
  for (const sx of [-1, 1]) { const kn = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), getMat('gold')); kn.position.set(sx * (w / 2 + 0.16), -0.06, 0.04); grp.add(kn); }
  d.scene.add(grp);
}
function addTrophy(d, p, type) {
  const grp = new THREE.Group(); grp.position.set(p.x + p.nx * 0.02, p.y, p.z + p.nz * 0.02); grp.rotation.y = Math.atan2(p.nx, p.nz);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 28), getMat('oldWood')); plate.rotation.x = PI / 2; plate.position.z = 0.035; plate.castShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.025, 8, 32), getMat('iron')); rim.position.z = 0.07;
  grp.add(plate, rim);
  for (let k = 0; k < 6; k++) { const a = k * PI / 3 + 0.3, n = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), getMat('iron')); n.position.set(Math.cos(a) * 0.31, Math.sin(a) * 0.31, 0.075); grp.add(n); }
  d.scene.add(grp);
  whenAsset(type, () => {
    const m = assetModel(type); if (!m) return;
    m.scale.setScalar(1.15); m.position.set(0, -0.3, 0.1);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (o.material?.color) { o.material = o.material.clone(); o.material.color.multiplyScalar(1.5); } } });
    grp.add(m);
  });
}
// espada(s) cruzadas sobre un escudo
function addArms(d, p, rnd) {
  const grp = new THREE.Group(); grp.position.set(p.x + p.nx * 0.03, p.y, p.z + p.nz * 0.03); grp.rotation.y = Math.atan2(p.nx, p.nz);
  d.scene.add(grp);
  const add = (type, rz, z, s, dy = 0) => whenAsset(type, () => {
    const m = assetModel(type); if (!m) return;
    const b = new THREE.Box3().setFromObject(m), h = b.max.y - b.min.y;
    const wrap = new THREE.Group(); m.scale.multiplyScalar(s); m.position.y = -h * s / 2; m.rotation.y = Math.PI; wrap.add(m);
    wrap.rotation.z = rz; wrap.position.set(0, dy, z);
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    grp.add(wrap);
  });
  add('c_shield', 0, 0.04, 0.95);
  const sw = rnd() < 0.5 ? ['c_estoc', 'c_saber'] : ['c_saber', 'c_estoc'];
  add(sw[0], 0.8, 0.15, 1, 0); add(sw[1], -0.8, 0.17, 1, 0);
}
function addSconce(d, b, p, lit, rnd) {
  const x = p.x + p.nx * 0.1, z = p.z + p.nz * 0.1, y = p.y;
  b.box('iron', p.x + p.nx * 0.04, y, p.z + p.nz * 0.04, 0.12, 0.34, 0.06, { yaw: Math.atan2(p.nx, p.nz), collide: false, noShadow: true });
  b.cylinder('iron', x + p.nx * 0.08, y + 0.14, z + p.nz * 0.08, 0.075, 0.045, 0.05, 8, { collide: false, noShadow: true });
  b.cylinder('wax', x + p.nx * 0.08, y + 0.25, z + p.nz * 0.08, 0.028, 0.032, 0.18 + rnd() * 0.08, 8, { collide: false, noShadow: true });
  if (lit) {
    d.c.flame(x + p.nx * 0.08, y + 0.4, z + p.nz * 0.08, 0.035, 0.1, { intensity: 0.9 });
    if (rnd() < 0.5) d.c.light(x + p.nx * 0.3, y + 0.4, z + p.nz * 0.3, 0xffb060, 2.4, 6.5, { flicker: true, priority: 0.7 });
  }
}
function addGrime(d, p, rnd) {
  const m = grimeMat(); if (!m) return;
  const w = 1.1 + rnd() * 1.3, h = 2.0 + rnd() * 1.4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.position.set(p.x + p.nx * 0.012, p.y - h / 2 + 0.6, p.z + p.nz * 0.012); mesh.rotation.y = Math.atan2(p.nx, p.nz); mesh.renderOrder = 2;
  d.scene.add(mesh);
}

// ---------------------------------------------------------------- dónde: rayos contra las paredes
// candidatos a lo largo del perímetro del cuarto, desde adentro hacia la pared: ok si hay pared lisa a la distancia
// esperada en tres alturas (no hay hueco, mueble, estante ni cosa colgando)
function wallSpots(room, rnd) {
  const [x0, z0, x1, z1] = room.rect, out = [], inset = 0.7;
  const sides = [
    { nx: 0, nz: 1, a: [x0, z0], b: [x1, z0], at: (t) => [x0 + (x1 - x0) * t, z0 + inset] }, // pared norte (mira a +z)
    { nx: 0, nz: -1, at: (t) => [x0 + (x1 - x0) * t, z1 - inset] },
    { nx: 1, nz: 0, at: (t) => [x0 + inset, z0 + (z1 - z0) * t] },
    { nx: -1, nz: 0, at: (t) => [x1 - inset, z0 + (z1 - z0) * t] },
  ];
  const base = room.base;
  for (const s of sides) {
    for (let t = 0.04; t < 0.97; t += 0.035) {
      const [px, pz] = s.at(t);
      let ok = true, hit = null;
      for (const dy of (room.crypt ? [0.5, 1.4, 2.3] : [0.6, 1.6, 2.6, 3.4])) {
        const h = G.phys.raycast(px, base + dy, pz, -s.nx, 0, -s.nz, 1.6, undefined, null, (c) => G.phys.info(c)?.kind !== 'me');
        if (!h || h.dist < inset - 0.12 || h.dist > inset + 0.2) { ok = false; break; }
        hit = h;
      }
      if (ok && hit) out.push({ x: hit.x, z: hit.z, nx: s.nx, nz: s.nz, t });
    }
  }
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
const farFrom = (spots, used, x, z, r) => !used.some((u) => Math.hypot(u.x - x, u.z - z) < r);

function dressRoom(d, room, rnd) {
  const spots = wallSpots(room, rnd), used = [], b = new Builder(d.phys), base = room.base, crypt = room.crypt;
  const take = (r, y) => { for (let i = 0; i < spots.length; i++) { const s = spots[i]; if (farFrom(spots, used, s.x, s.z, r)) { spots.splice(i, 1); used.push(s); return { ...s, y: base + y }; } } return null; };
  for (let i = 0; i < room.tap; i++) { const p = take(2.4, crypt ? 2.4 : 3.3); if (p) addTapestry(d, p, room.themes[Math.floor(rnd() * room.themes.length)], rnd); }
  for (let i = 0; i < room.arms; i++) { const p = take(2.1, 2.7); if (p) addArms(d, p, rnd); }
  for (let i = 0; i < room.trophy; i++) { const p = take(1.7, 2.5); if (p) addTrophy(d, p, room.trophies[i % room.trophies.length]); }
  for (let i = 0; i < room.sconce; i++) { const p = take(1.6, 2.1 + rnd() * 0.3); if (p) addSconce(d, b, p, i % 2 === 0, rnd); }
  for (let i = 0; i < room.grime; i++) { const p = take(1.2, 3.6); if (p) addGrime(d, p, rnd); }
  // bultos en los rincones y contra las paredes (solo donde el piso al lado de la pared está libre)
  const floorSpots = [];
  const [x0, z0, x1, z1] = room.rect;
  for (const [cx, cz] of [[x0 + 0.5, z0 + 0.5], [x1 - 0.5, z0 + 0.5], [x0 + 0.5, z1 - 0.5], [x1 - 0.5, z1 - 0.5]]) floorSpots.push([cx, cz]);
  for (let k = 0; k < 14; k++) { const t = rnd(); const side = Math.floor(rnd() * 4); floorSpots.push(side === 0 ? [x0 + (x1 - x0) * t, z0 + 0.5] : side === 1 ? [x0 + (x1 - x0) * t, z1 - 0.5] : side === 2 ? [x0 + 0.5, z0 + (z1 - z0) * t] : [x1 - 0.5, z0 + (z1 - z0) * t]); }
  let placed = 0;
  const kinds = crypt ? ['bones', 'skull', 'bones', 'rubble', 'web'] : room.id === 'cocina' ? ['sack', 'crate', 'barrel', 'sack', 'basket', 'bones'] : ['books', 'crate', 'sack', 'barrel', 'bones', 'rubble'];
  for (const [fx, fz] of floorSpots) {
    if (placed >= room.clutter) break;
    // el piso tiene que estar libre en un metro a la redonda (rayos horizontales cortos) y haber piso debajo
    let free = !used.some((u) => Math.hypot(u.x - fx, u.z - fz) < 0.9);
    for (const a of [0, 1.57, 3.14, 4.71]) { if (!free) break; const h = G.phys.raycast(fx, base + 0.5, fz, Math.sin(a), 0, Math.cos(a), 0.55, undefined, null, (c) => G.phys.info(c)?.kind !== 'me'); if (h) free = false; }
    if (!free) continue;
    const gh = G.phys.raycast(fx, base + 1.5, fz, 0, -1, 0, 2.2, undefined, null, (c) => G.phys.info(c)?.kind !== 'me');
    if (!gh || Math.abs(gh.y - base) > 0.35) continue;
    used.push({ x: fx, z: fz });
    const y = gh.y, kind = kinds[placed % kinds.length], yaw = rnd() * TAU;
    placed++;
    if (kind === 'barrel') { b.cylinder('woodDark', fx, y + 0.45, fz, 0.32, 0.36, 0.9, 10, { collide: true }); b.cylinder('iron', fx, y + 0.3, fz, 0.37, 0.37, 0.04, 10, { collide: false }); b.cylinder('iron', fx, y + 0.62, fz, 0.37, 0.37, 0.04, 10, { collide: false }); }
    else if (kind === 'crate') { b.box('woodDark', fx, y + 0.2, fz, 0.5, 0.4, 0.5, { yaw, collide: true }); b.box('oldWood', fx + 0.05, y + 0.52, fz, 0.38, 0.24, 0.38, { yaw: yaw + 0.5, collide: false }); }
    else if (kind === 'sack') { const sk = new THREE.LatheGeometry([[0, 0], [0.2, 0.01], [0.28, 0.1], [0.3, 0.22], [0.26, 0.36], [0.17, 0.46], [0.1, 0.5], [0.12, 0.55], [0.05, 0.6], [0, 0.58]].map(([r, yy]) => new THREE.Vector2(r, yy)), 10); sk.translate(fx, y, fz); b.geo('hemp', sk); d.phys.cylinder(fx, y + 0.28, fz, 0.28, 0.28, { mat: 'wood' }); }
    else if (kind === 'books') { for (let i = 0; i < 4; i++) b.box(['red', 'leatherBlack', 'fabricBrown', 'fabricBlue'][i], fx + (rnd() - 0.5) * 0.1, y + 0.03 + i * 0.06, fz + (rnd() - 0.5) * 0.1, 0.3 - i * 0.02, 0.055, 0.22, { yaw: yaw + i * 0.4, collide: false, noShadow: true }); }
    else if (kind === 'rubble') { for (let i = 0; i < 6; i++) { const rb = new THREE.IcosahedronGeometry(0.06 + rnd() * 0.1, 0); rb.translate(fx + (rnd() - 0.5) * 0.7, y + 0.06, fz + (rnd() - 0.5) * 0.7); b.geo('castleStone', rb); } }
    else if (kind === 'web') { b.box('white', fx, y + 0.012, fz, 0.6, 0.01, 0.6, { yaw, collide: false, noShadow: true }); }
    else if (kind === 'basket') { whenAsset('c_basket1', () => { const m = assetModel('c_basket1'); if (m) { m.position.set(fx, y, fz); m.rotation.y = yaw; d.scene.add(m); } }); }
    else if (kind === 'bones') whenAsset('c_bones', () => { const m = assetModel('c_bones'); if (m) { m.position.set(fx, y, fz); m.rotation.y = yaw; m.scale.setScalar(0.8); d.scene.add(m); } });
    else if (kind === 'skull') whenAsset('c_skull', () => { const m = assetModel('c_skull'); if (m) { m.position.set(fx, y, fz); m.rotation.y = yaw; d.scene.add(m); } });
  }
  b.finish(d.scene);
}

export function dressWalls(d) {
  let frames = 0, done = false;
  const rnd = rng(7007);
  d.anim.push(() => {
    if (done) return;
    if (++frames < 90 || !G.phys?.world) return; // el mundo físico ya sabe de las paredes
    done = true;
    for (const room of ROOMS) { try { dressRoom(d, room, rnd); } catch (e) { console.warn('paredes', room.id, e); } }
  });
}
