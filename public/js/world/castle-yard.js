// La vida de los patios del castillo: la huerta, el cementerio, la plaza de armas (el patio de adelante) y el
// interior de las torres. Todo se arma con las geometrías fusionadas del castillo y los modelos que ya hay
// (Decor.place / Decor.instances); lo que se mueve (manos del cementerio, luciérnagas, vapor de la fragua) cuelga de
// decor.anim. Hecho para que cada lugar tenga cosas distintas que mirar, con colisiones y sin nada flotando.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder } from './builder.js';
import { assetBounds, assetModel, whenAsset } from '../game/assets.js';
import { yawCollider } from '../game/placement.js';
import { dressTowerTop } from './tower-tops.js';
import { buildPuddles } from '../fx/puddles.js';
import { skeletonForearm } from './skeleton-hand.js';

const HAS_DOM = typeof document !== 'undefined';
const PI = Math.PI, TAU = PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const smooth = (x) => x * x * (3 - 2 * x);

// Keep grave markers and mounds out of the mausoleum footprint.
export function mausoleumPlot(x, z) { return x > 38.7 && x < 44.5 && z > -115.5 && z < -110.0; }

// ruido barato y repetible (para bordes y terrones que no se vean prolijos)
function noise2(x, z, s = 1) {
  const n = Math.sin(x * 12.9898 * s + z * 78.233 * s) * 43758.5453;
  return n - Math.floor(n);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const a = noise2(xi, zi), b = noise2(xi + 1, zi), c = noise2(xi, zi + 1), d = noise2(xi + 1, zi + 1);
  const u = smooth(xf), v = smooth(zf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// orienta una malla indexada para que sus caras miren hacia arriba (si no, el piso la descarta por mirar de espaldas)
function faceUp(g) {
  const p = g.attributes.position, ix = g.index.array;
  let up = 0;
  for (let i = 0; i < Math.min(ix.length, 300); i += 3) {
    const ax = p.getX(ix[i]), ay = p.getY(ix[i]), az = p.getZ(ix[i]);
    const ux = p.getX(ix[i + 1]) - ax, uy = p.getY(ix[i + 1]) - ay, uz = p.getZ(ix[i + 1]) - az;
    const vx = p.getX(ix[i + 2]) - ax, vy = p.getY(ix[i + 2]) - ay, vz = p.getZ(ix[i + 2]) - az;
    up += uz * vx - ux * vz; // componente y de u x v
  }
  if (up < 0) for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}

// tierra de verdad: color pardo con terrones, piedritas y raíces finas, y relieve (bump) para que la luz la marque.
let SOIL = null;
function soilMat() {
  if (SOIL || !HAS_DOM) return SOIL;
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), bump = document.createElement('canvas'); bump.width = bump.height = N;
  const gb = bump.getContext('2d');
  g.fillStyle = '#3b2819'; g.fillRect(0, 0, N, N); gb.fillStyle = '#808080'; gb.fillRect(0, 0, N, N);
  let s = 77; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 2600; i++) { // terrones: manchas más claras y oscuras
    const x = r() * N, y = r() * N, rad = 1 + r() * 4.5, l = r();
    g.fillStyle = l < 0.45 ? `rgba(20,12,6,${0.25 + r() * 0.3})` : l < 0.8 ? `rgba(92,62,38,${0.18 + r() * 0.3})` : `rgba(130,110,90,${0.12 + r() * 0.2})`;
    g.beginPath(); g.ellipse(x, y, rad, rad * (0.6 + r() * 0.5), r() * 3, 0, Math.PI * 2); g.fill();
    gb.fillStyle = `rgba(${l < 0.45 ? 40 : 230},${l < 0.45 ? 40 : 230},${l < 0.45 ? 40 : 230},0.5)`; gb.beginPath(); gb.ellipse(x, y, rad, rad * 0.8, r() * 3, 0, Math.PI * 2); gb.fill();
  }
  for (let i = 0; i < 90; i++) { // raicillas y paja
    g.strokeStyle = `rgba(${150 + r() * 50},${120 + r() * 40},60,${0.25 + r() * 0.3})`; g.lineWidth = 0.6 + r();
    const x = r() * N, y = r() * N; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (r() - 0.5) * 20, y + (r() - 0.5) * 20, x + (r() - 0.5) * 30, y + (r() - 0.5) * 30); g.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  const tb = new THREE.CanvasTexture(bump); tb.wrapS = tb.wrapT = THREE.RepeatWrapping;
  SOIL = new THREE.MeshStandardMaterial({ map: t, bumpMap: tb, bumpScale: 2.2, roughness: 0.92, metalness: 0 });
  return SOIL;
}
// tela rayada con trama, manchas de humedad y desgaste (toldos, banderines); scallop: el borde festoneado va en el alfa
const FABRICS = new Map();
function fabric(c1, c2, stripes = 8, scallop = false) {
  const key = c1 + c2 + stripes + scallop;
  if (FABRICS.has(key) || !HAS_DOM) return FABRICS.get(key);
  const W = 256, H = 128, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const sw = W / stripes;
  for (let i = 0; i < stripes; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(i * sw, 0, sw + 1, H); }
  let s = 31; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,240,210'},${r() * 0.08})`; g.fillRect(r() * W, r() * H, 1 + r() * 14, 1); g.fillRect(r() * W, r() * H, 1, 1 + r() * 8); }
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(20,24,18,${0.05 + r() * 0.08})`; g.beginPath(); g.ellipse(r() * W, r() * H, 6 + r() * 20, 4 + r() * 12, r() * 3, 0, 6.3); g.fill(); } // humedad / moho
  if (scallop) { // el festón: semicírculos que cuelgan abajo y recorte alfa
    const a = document.createElement('canvas'); a.width = W; a.height = H; const ga = a.getContext('2d');
    ga.fillStyle = '#fff'; ga.fillRect(0, 0, W, H * 0.6);
    for (let i = 0; i < stripes; i++) { ga.beginPath(); ga.arc(i * sw + sw / 2, H * 0.6, sw / 2, 0, Math.PI); ga.fill(); }
    const id = g.getImageData(0, 0, W, H), ad = ga.getImageData(0, 0, W, H);
    for (let i = 0; i < id.data.length; i += 4) id.data[i + 3] = ad.data[i] > 128 ? 255 : 0;
    g.putImageData(id, 0, 0);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, side: THREE.DoubleSide, alphaTest: scallop ? 0.5 : 0 });
  FABRICS.set(key, m);
  return m;
}
// un toldo: tela con caída (se comba entre los postes) y un festón colgando adelante
function awning(d, cx, cy, cz, w, dpt, yaw, c1, c2) {
  if (!HAS_DOM) return;
  const g = new THREE.PlaneGeometry(w, dpt, 14, 6), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / w * 2, v = p.getY(i) / dpt * 2; // -1..1
    p.setZ(i, -(1 - u * u) * 0.12 - (1 - v) * 0.05 * 0 + Math.sin(u * 5 + v) * 0.012);
  }
  g.rotateX(-Math.PI / 2 + 0.3); g.computeVertexNormals();
  const m = new THREE.Mesh(g, fabric(c1, c2, 10)); m.position.set(0, 0, 0);
  const val = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.28, 1, 1), fabric(c1, c2, 10, true));
  val.position.set(0, -dpt / 2 * Math.sin(0.3) - 0.1, dpt / 2 * Math.cos(0.3));
  const grp = new THREE.Group(); grp.add(m, val); grp.position.set(cx, cy, cz); grp.rotation.y = yaw; grp.traverse((o) => { o.castShadow = true; });
  d.scene.add(grp);
  return grp;
}
// las mallas de tierra de un área se juntan y se agregan de una (una sola malla por área)
function soilFlush(d, geos) {
  if (!geos.length || !HAS_DOM) return null;
  for (const g of geos) { for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
  const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  if (!merged) return null;
  const m = new THREE.Mesh(merged, soilMat()); m.receiveShadow = true; m.castShadow = true; d.scene.add(m);
  return m;
}

// ---------------------------------------------------------------- piezas genéricas
// un montículo de tierra orgánico (óvalo con terrones), centrado en (x, z), largo l en su eje yaw
const put = (b, key, g) => (Array.isArray(b) ? b.push(g) : b.geo(key, g));
function mound(b, x, z, yaw, l, w, h, key = 'mud') {
  const g = new THREE.SphereGeometry(1, 18, 9, 0, TAU, 0, PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
    const k = 1 + 0.12 * Math.sin(px * 9 + pz * 7) + 0.08 * Math.cos(px * 15 - pz * 11);
    p.setXYZ(i, px * w * 0.5 * k, py * h * (0.8 + 0.4 * vnoise(px * 4 + x, pz * 4 + z)), pz * l * 0.5 * k);
  }
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 2.2, uv.getY(i) * l * 1.2); // el relieve de la tierra a escala real
  g.rotateY(yaw); g.translate(x, 0.02, z); g.computeVertexNormals();
  put(b, key, g);
}
// terrones sueltos (una sola malla fusionada)
function clods(b, cx, cz, rx, rz, n, rnd, key = 'mud') {
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const s = 0.035 + rnd() * 0.07;
    g.scale(s * (1 + rnd() * 0.6), s * (0.6 + rnd() * 0.4), s * (1 + rnd() * 0.6));
    g.rotateY(rnd() * TAU);
    g.translate(cx + (rnd() - 0.5) * rx, s * 0.35, cz + (rnd() - 0.5) * rz);
    put(b, key, g);
  }
}
// una cinta que sigue puntos [x, z] (caminos de tierra pisada, charcos largos): bordes irregulares, sin cuadrados
function ribbon(pts, width, y, jitter = 0.18, seg = 6) {
  const pos = [], uv = [], idx = [];
  let len = 0;
  const L = [0];
  for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(len); }
  const N = Math.max(2, Math.ceil(len / 0.5));
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * len;
    let k = 1; while (k < L.length - 1 && L[k] < t) k++;
    const a = pts[k - 1], c = pts[k], f = (t - L[k - 1]) / Math.max(1e-6, L[k] - L[k - 1]);
    const x = a[0] + (c[0] - a[0]) * f, z = a[1] + (c[1] - a[1]) * f;
    const dx = c[0] - a[0], dz = c[1] - a[1], dl = Math.hypot(dx, dz) || 1, nx = -dz / dl, nz = dx / dl;
    const taper = Math.min(1, i / 3, (N - i) / 3);
    for (let j = 0; j <= seg; j++) {
      const v = j / seg * 2 - 1;
      const w = (width / 2) * (1 + (vnoise(x * 1.7, z * 1.7 + j * 5) - 0.5) * jitter * 2) * Math.max(0.05, taper);
      pos.push(x + nx * v * w, y + (1 - v * v) * 0.004, z + nz * v * w);
      uv.push(j / seg * width * 0.5, t * 0.5);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, c = a + seg + 1;
    idx.push(a, c, a + 1, a + 1, c, c + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return faceUp(g);
}
// una reja de hierro (barrotes con punta de lanza) entre dos puntos
function ironFence(b, x0, z0, x1, z1, h = 0.95, gap = 0.2) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / gap)), yaw = Math.atan2(x1 - x0, z1 - z0);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    b.cylinder('iron', x, h / 2, z, 0.011, 0.013, h, 5, { collide: false, noShadow: true });
    const tip = new THREE.ConeGeometry(0.026, 0.1, 4); tip.translate(x, h + 0.04, z); b.geo('iron', tip);
  }
  for (const y of [0.22, h - 0.16]) b.box('iron', (x0 + x1) / 2, y, (z0 + z1) / 2, 0.025, 0.03, len, { yaw, collide: false, noShadow: true });
}
function fenceRect(b, x, z, w, l, phys, gapAt = null) {
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - l / 2, z1 = z + l / 2;
  ironFence(b, x0, z0, x1, z0); ironFence(b, x0, z1, x1, z1);
  ironFence(b, x0, z0, x0, z1); ironFence(b, x1, z0, x1, z1);
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) b.box('keepStone', px, 0.55, pz, 0.14, 1.1, 0.14, { collide: false });
  // la reja choca (una caja fina por lado)
  phys?.box(x, 0.45, z0, w / 2, 0.45, 0.03, 0, { paint: false }); phys?.box(x, 0.45, z1, w / 2, 0.45, 0.03, 0, { paint: false });
  phys?.box(x0, 0.45, z, 0.03, 0.45, l / 2, 0, { paint: false }); phys?.box(x1, 0.45, z, 0.03, 0.45, l / 2, 0, { paint: false });
}
// brillo suave (luciérnaga, espíritu, chispa de fragua): sprite aditivo
let GLOW_TEX = null;
function glowTex() {
  if (GLOW_TEX || !HAS_DOM) return GLOW_TEX;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  GLOW_TEX = new THREE.CanvasTexture(cv);
  return GLOW_TEX;
}
function glow(scene, x, y, z, size, color, op = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.position.set(x, y, z); s.scale.setScalar(size); scene.add(s);
  return s;
}
// apoya un modelo en y por su caja real y (opcional) le pone colisión
function ground(d, type, x, y, z, yaw, scale, { solid = true, mat = 'wood', shrink = 1 } = {}) {
  d.place(type, x, y, z, yaw, scale, { onReady: (m) => {
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m);
    m.position.y += y - box.min.y; m.updateMatrix(); m.updateMatrixWorld(true);
    if (solid) {
      const bounds = assetBounds(type);
      if (!bounds) return;
      const { center, half } = yawCollider(bounds, m.position, yaw, scale, shrink);
      d.phys.box(center.x, center.y, center.z, half.x, half.y, half.z, yaw, { paint: false, mat });
    }
  } });
}

// enredadera que trepa por un muro: hebras que zigzaguean hacia arriba con hojas (cuadraditos oscuros) a ambos lados.
// (x, z): pie del tramo; (nx, nz): hacia dónde mira el muro (afuera de la pared); w: ancho del parche; h: alto
function ivy(b, x, z, nx, nz, w, h, rnd, n = 5, y0 = 0) {
  const tx = -nz, tz = nx; // a lo largo del muro
  for (let s = 0; s < n; s++) {
    let u = (rnd() - 0.5) * w, y = y0 + rnd() * 0.3;
    const top = y0 + h * (0.45 + rnd() * 0.55);
    const pts = [];
    while (y < top) {
      pts.push(new THREE.Vector3(x + tx * u + nx * 0.03, y, z + tz * u + nz * 0.03));
      y += 0.25 + rnd() * 0.2; u += (rnd() - 0.5) * 0.4;
      u = Math.max(-w / 2, Math.min(w / 2, u));
    }
    if (pts.length < 3) continue;
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, 0.011, 4);
    b.geo('moss', tube);
    // hojas: dos por tramo, ladeadas y de tamaño distinto
    for (let i = 0; i < pts.length; i++) for (let k = 0; k < 2; k++) {
      const p = pts[i], sz = 0.08 + rnd() * 0.08;
      const leaf = new THREE.PlaneGeometry(sz, sz * 1.1);
      leaf.rotateZ((rnd() - 0.5) * 1.6); leaf.rotateY(Math.atan2(nx, nz) + (rnd() - 0.5) * 0.9);
      leaf.translate(p.x + tx * (k ? 0.07 : -0.07) + nx * 0.05, p.y + (rnd() - 0.5) * 0.12, p.z + tz * (k ? 0.07 : -0.07) + nz * 0.05);
      b.geo(rnd() < 0.3 ? 'moss' : 'green', leaf);
    }
  }
}
// monumentos de cementerio hechos de piezas (cada uno distinto): cruz celta, columna rota con hiedra, sarcófago con
// la tapa corrida, urna sobre pedestal, banco de piedra y un ataúd de madera medio enterrado
function monuments(d, b, rnd) {
  // cruz celta
  { const x = 31.4, z = -126.4;
    b.box('keepStone', x, 0.25, z, 0.9, 0.5, 0.9, { collide: true }); b.box('castleStone', x, 0.6, z, 0.6, 0.2, 0.6, { collide: false });
    b.box('keepStone', x, 1.7, z, 0.24, 2.2, 0.2, { collide: true }); b.box('keepStone', x, 2.1, z, 1.1, 0.22, 0.2, { collide: false });
    const ring = new THREE.TorusGeometry(0.42, 0.06, 6, 20); ring.translate(x, 2.1, z); b.geo('keepStone', ring); }
  // columna rota con la hiedra
  { const x = 36.6, z = -125.3;
    b.cylinder('castleStone', x, 0.9, z, 0.3, 0.34, 1.8, 10, { collide: true }); b.cylinder('keepStone', x, 0.12, z, 0.46, 0.5, 0.24, 10, { collide: false });
    const top = new THREE.CylinderGeometry(0.28, 0.3, 0.5, 8); top.rotateZ(0.9); top.translate(x + 0.55, 0.22, z + 0.35); b.geo('castleStone', top);
    for (let k = 0; k < 4; k++) { const rb = new THREE.IcosahedronGeometry(0.1 + rnd() * 0.08, 0); rb.translate(x + (rnd() - 0.5) * 1.6, 0.08, z + (rnd() - 0.5) * 1.4); b.geo('castleStone', rb); } }
  // sarcófago con la tapa corrida
  { const x = 27.7, z = -106.7;
    b.box('keepStone', x, 0.45, z, 1.1, 0.9, 2.3, { collide: true });
    b.box('castleStone', x + 0.14, 1.0, z + 0.18, 1.24, 0.14, 2.3, { yaw: 0.14, collide: false });
    b.box('black', x - 0.5, 0.92, z - 0.95, 0.16, 0.04, 0.6, { collide: false, noShadow: true }); }
  // urna sobre pedestal (con paño de piedra)
  { const x = 40.5, z = -106.4;
    b.box('keepStone', x, 0.55, z, 0.6, 1.1, 0.6, { collide: true }); b.box('castleStone', x, 1.15, z, 0.76, 0.1, 0.76, { collide: false });
    const urn = new THREE.LatheGeometry([[0, 0], [0.18, 0.02], [0.28, 0.2], [0.26, 0.4], [0.17, 0.56], [0.2, 0.62], [0.16, 0.66], [0, 0.66]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
    urn.translate(x, 1.2, z); b.geo('castleStone', urn); }
  // banco de piedra
  { const x = 35.4, z = -113.8;
    b.box('castleStone', x, 0.45, z, 1.9, 0.12, 0.5, { collide: true }); for (const dx of [-0.8, 0.8]) b.box('keepStone', x + dx, 0.22, z, 0.2, 0.44, 0.5, { collide: false }); }
  // ataúd de madera medio enterrado, con la tapa torcida
  { const x = 32.2, z = -108.3;
    b.box('woodDark', x, 0.12, z, 0.7, 0.28, 1.9, { yaw: 0.3, rx: 0.12, collide: true });
    b.box('oldWood', x + 0.08, 0.3, z - 0.1, 0.68, 0.06, 1.2, { yaw: 0.5, rx: -0.1, collide: false }); }
}

// ================================================================ HUERTA
// los surcos: camellones de tierra de verdad (más altos al medio, bordes comidos, terrones) en vez de cajas negras
export function soilRow(d, x, z0, z1) {
  const sg = [], rnd = d.r;
  const nz = Math.round((z1 - z0) / 0.4), nx = 10, pos = [], uv = [], idx = [];
  for (let i = 0; i <= nz; i++) {
    const z = z0 + (z1 - z0) * (i / nz);
    const wob = (vnoise(x * 0.7, z * 0.5) - 0.5) * 0.5; // el surco serpentea un poco
    const wid = 0.85 + vnoise(x + 3, z * 0.6) * 0.45;
    const taper = Math.min(1, i / 4, (nz - i) / 4);
    for (let j = 0; j <= nx; j++) {
      const v = j / nx * 2 - 1;
      const edge = 1 - v * v;
      const h = Math.max(0, edge) * (0.17 + vnoise(x * 2 + j, z * 3) * 0.1) * Math.max(0.1, taper);
      pos.push(x + wob + v * wid * Math.max(0.2, taper) * (1 + (noise2(i, j) - 0.5) * 0.25), 0.012 + h, z);
      uv.push(j / nx * 1.4, i * 0.3);
    }
  }
  for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) { const a = i * (nx + 1) + j, c = a + nx + 1; idx.push(a, a + 1, c, a + 1, c + 1, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); faceUp(g);
  sg.push(g);
  clods(sg, x, (z0 + z1) / 2, 2.2, z1 - z0, 40, rnd);
  soilFlush(d, sg);
}

function huerta(d) {
  const b = new Builder(d.phys), rnd = d.r, sg = [];
  // camino de tierra pisada desde el portón (norte del patio) hasta el espantapájaros
  sg.push(ribbon([[-34, -103.5], [-33.6, -107], [-35.5, -111], [-34.2, -115], [-35.4, -119], [-34.8, -122]], 1.5, 0.016, 0.3));
  // un montón de compost al fondo con huesos y una pala clavada
  mound(b, -27.4, -127.4, 0.5, 3.2, 2.4, 0.9, 'moss');
  mound(sg, -28.4, -126.6, 1.2, 2.0, 1.5, 0.6);
  clods(b, -27.4, -127.4, 3.4, 2.4, 22, rnd, 'moss');
  b.box('woodDark', -28.2, 0.7, -126, 0.05, 1.4, 0.04, { rx: 0.25, collide: false });
  b.box('iron', -28.2, 0.12, -126.25, 0.22, 0.28, 0.02, { rx: 0.25, collide: false });
  // estacas con hilo a los costados de los surcos (donde se marcaba cada fila)
  for (const rx of [-41.2, -38.1, -35.0, -31.9, -28.8]) {
    for (const z of [-106.2, -126.4]) {
      b.cylinder('woodDark', rx + 1.0, 0.45, z, 0.025, 0.03, 0.9, 5, { collide: false, noShadow: true });
    }
    b.box('hemp', rx + 1.0, 0.7, -116.3, 0.008, 0.008, 20.2, { collide: false, noShadow: true });
  }
  // un maizal muerto en la esquina: tallos quebrados y hojas secas
  for (let i = 0; i < 150; i++) {
    const x = -42.4 + rnd() * 3.4, z = -121.6 + rnd() * 5.2, h = 1.2 + rnd() * 1.1, lean = (rnd() - 0.5) * 0.5, yaw = rnd() * TAU;
    const stem = new THREE.CylinderGeometry(0.008, 0.02, h, 4);
    stem.translate(0, h / 2, 0); stem.rotateZ(lean); stem.rotateY(yaw); stem.translate(x, 0, z);
    b.geo('hay', stem);
    for (let k = 0; k < 2; k++) {
      const leaf = new THREE.PlaneGeometry(0.07, 0.6 + rnd() * 0.3, 1, 3);
      leaf.translate(0, 0.3, 0); leaf.rotateZ(0.9 + rnd() * 0.6); leaf.rotateY(yaw + k * PI + rnd());
      leaf.translate(x + Math.sin(lean) * h * 0.4, h * (0.4 + rnd() * 0.4), z);
      b.geo('hay', leaf);
    }
  }
  // Keep the stalks and their collision together, away from the tower entrance.
  d.phys.box(-40.7, 0.9, -119, 1.8, 0.9, 2.6, 0, { paint: false });
  for (const [x, z, nx, nz, w, h] of [[-34, -129.55, 0, 1, 9, 4.5], [-43.55, -118, 1, 0, 8, 4], [-43.55, -108, 1, 0, 4, 3], [-30, -103.35, 0, -1, 5, 3.4], [-39, -103.35, 0, -1, 4, 3.4]]) ivy(b, x, z, nx, nz, w, h, rnd, 6);
  // cercado de madera rota sobre la pared del este, con huecos
  for (let z = -128; z < -105; z += 0.9) {
    if (rnd() < 0.18) continue;
    const h = 0.8 + rnd() * 0.45;
    b.box('woodDark', -25.6, h / 2, z, 0.09, h, 0.12, { collide: false, noShadow: true, rz: (rnd() - 0.5) * 0.2 });
  }
  b.box('woodDark', -25.6, 0.5, -117, 0.06, 0.07, 22, { collide: false, noShadow: true });
  soilFlush(d, sg);
  b.finish(d.scene);
  // modelos: cajas con calabazas podridas, barriles, canastos, baldes y fardos
  ground(d, 'c_barrel_a', -26.6, 0, -105.8, 0.4, 1);
  ground(d, 'c_barrel_b', -27.6, 0, -105.4, 1.1, 1);
  ground(d, 'c_crate', -29.4, 0, -105.7, 0.2, 0.9);
  ground(d, 'c_crate', -29.2, 0.5, -105.6, 0.7, 0.8);
  ground(d, 'c_basket1', -31, 0, -105.6, 0.8, 1, { solid: false });
  ground(d, 'c_bucket2', -42.2, 0, -105.9, 0.3, 1, { solid: false });
  ground(d, 'c_stump', -26.6, 0, -122.6, 0.6, 0.6);
  d._hay([[-42.4 + 1, -110, 1.6], [-42.4 + 1, -111.5, 1.55]]);
  // dos cuervos más sobre las estacas y un farol bajo en el camino
  d.candleCluster(-34.1, 0.02, -105.3, 4, 0.25, 1.2);
  d.torch(-25.3, 2.6, -112, -1, 0, 4, 9);
  d.torch(-42.7, 2.6, -121, 1, 0, 4, 9);
  // luciérnagas moribundas sobre los surcos (se mueven en eso: anim)
  if (HAS_DOM) {
    const flies = Array.from({ length: 9 }, (_, i) => ({ s: glow(d.scene, 0, 0, 0, 0.18, 0xc8ff7a, 0.8), x: -41 + rnd() * 14, z: -126 + rnd() * 20, y: 0.6 + rnd() * 0.9, p: rnd() * 10 }));
    d.anim.push((t) => { for (const f of flies) { f.s.position.set(f.x + Math.sin(t * 0.5 + f.p) * 0.8, f.y + Math.sin(t * 1.3 + f.p * 2) * 0.2, f.z + Math.cos(t * 0.4 + f.p) * 0.8); f.s.material.opacity = 0.35 + 0.45 * Math.max(0, Math.sin(t * 2.1 + f.p * 3)); } });
  }
}

// ================================================================ CEMENTERIO
function cementerio(d) {
  const b = new Builder(d.phys), rnd = d.r, sg = [];
  // los caminos de tierra entre filas (pisados, con charcos) y el que sale del portón
  b.geo('gravel', ribbon([[33.5, -103.6], [33.7, -108], [33.2, -112], [33.5, -117], [33.6, -122], [36, -127]], 1.9, 0.014, 0.2));
  b.geo('gravel', ribbon([[26.5, -111.7], [31, -111.2], [36, -112], [42, -111.4]], 1.2, 0.014, 0.25));
  b.geo('gravel', ribbon([[26.5, -121.5], [31, -121.9], [36, -121.5], [42, -122]], 1.2, 0.014, 0.25));
  // cada tumba con su montículo largo de tierra (hecho con la forma real de un entierro) y flores secas
  for (let row = 0; row < 4; row++) for (let k = 0; k < 5; k++) {
    const x = 27.8 + k * 3.3, z = -109 - row * 5;
    if (Math.abs(x - 33.5) < 1.5 && Math.abs(z + 117) < 3) continue;
    if (mausoleumPlot(x, z)) continue;
    mound(sg, x + (rnd() - 0.5) * 0.4, z + 1.35, (rnd() - 0.5) * 0.3, 1.9, 0.95, 0.24);
    clods(sg, x, z + 1.3, 1.1, 2, 9, rnd);
    if (rnd() < 0.55) {
      const fx = x + (rnd() - 0.5) * 0.7, fz = z + 0.55;
      const col = ['red', 'pink', 'yellow', 'white'][Math.floor(rnd() * 4)];
      for (let f = 0; f < 5; f++) {
        const s = new THREE.SphereGeometry(0.035, 6, 4); s.translate(fx + (rnd() - 0.5) * 0.25, 0.1 + rnd() * 0.12, fz + (rnd() - 0.5) * 0.2); b.geo(col, s);
        b.cylinder('moss', fx + (f - 2) * 0.04, 0.05, fz, 0.004, 0.004, 0.1, 3, { collide: false, noShadow: true });
      }
    }
  }
  // reja de hierro alrededor de dos tumbas de familia
  monuments(d, b, rnd);
  // hiedra en las murallas de adentro (norte, este, y los dos lados de la separación con el patio)
  for (const [x, z, nx, nz, w, h] of [[34, -129.45, 0, 1, 8, 4.5], [27, -129.45, 0, 1, 4, 3.5], [43.55, -122, -1, 0, 7, 4], [43.55, -112, -1, 0, 4, 3], [30, -103.1, 0, -1, 5, 3], [39, -103.1, 0, -1, 4, 3.5], [25.05, -123, 1, 0, 6, 4], [25.05, -116, 1, 0, 3, 5]]) ivy(b, x, z, nx, nz, w, h, rnd, 6);
  fenceRect(b, 29.5, -114, 3.2, 2.6, d.phys);
  fenceRect(b, 39.2, -119.8, 3.6, 2.8, d.phys);
  // Mausoleum: a closed family vault, set against the eastern wall.
  {
    const mx = 41.2, mz = -112.5, W = 4.6, D = 3.6;
    b.box('castleStone', mx, 0.12, mz, D + 0.8, 0.24, W + 0.8, { collide: true });
    b.box('castleStone', mx, 0.34, mz, D + 0.3, 0.2, W + 0.3);
    b.box('keepStone', mx + 0.15, 1.9, mz - W / 2 + 0.2, D - 0.3, 3.2, 0.4); // paredes
    b.box('keepStone', mx + 0.15, 1.9, mz + W / 2 - 0.2, D - 0.3, 3.2, 0.4);
    b.box('keepStone', mx + D / 2 - 0.3, 1.9, mz, 0.4, 3.2, W);
    b.box('castleStone', mx + 0.15, 3.65, mz, D - 0.1, 0.3, W + 0.2); // techo
    const roof = new THREE.CylinderGeometry(0.01, 2.8, 1.1, 4, 1); roof.rotateY(PI / 4); roof.scale(1, 1, 0.95); roof.translate(mx + 0.15, 4.3, mz); b.geo('keepStone', roof);
    for (const zz of [-1.8, 1.8]) { b.cylinder('castleStone', mx - D / 2 + 0.25, 1.9, mz + zz, 0.2, 0.22, 3.0, 10, { collide: true }); b.box('keepStone', mx - D / 2 + 0.25, 0.46, mz + zz, 0.6, 0.12, 0.6, { collide: false }); b.box('keepStone', mx - D / 2 + 0.25, 3.35, mz + zz, 0.55, 0.18, 0.55, { collide: false }); }
    b.box('keepStone', mx - D / 2 + 0.25, 3.62, mz, 0.55, 0.28, W + 0.2, { collide: false });
    const front = mx - D / 2 + 0.25;
    for (const side of [-1, 1]) b.box('keepStone', front + 0.12, 1.83, mz + side * 1.38, 0.34, 2.9, 0.85, { collide: true });
    b.box('black', front + 0.08, 1.7, mz, 0.08, 2.48, 1.85, { collide: false, noShadow: true });
    // Two inset iron leaves, with visible frames and a collider matching the closed gate.
    for (const side of [-1, 1]) {
      const cz = mz + side * 0.46;
      for (const offset of [-0.42, 0.42]) b.box('iron', front - 0.03, 1.7, cz + offset, 0.08, 2.48, 0.07, { collide: false });
      for (const yy of [0.5, 1.32, 2.75, 2.91]) b.box('iron', front - 0.03, yy, cz, 0.08, 0.07, 0.88, { collide: false });
      for (const offset of [-0.28, -0.14, 0, 0.14, 0.28]) b.box('iron', front - 0.025, 1.7, cz + offset, 0.05, 2.4, 0.025, { collide: false, noShadow: true });
      b.box('bronze', front - 0.085, 1.43, mz + side * 0.11, 0.06, 0.13, 0.05, { collide: false });
    }
    b.box('keepStone', front + 0.12, 3.14, mz, 0.38, 0.35, 2.05, { collide: false });
    b.box('bronze', front - 0.085, 3.14, mz, 0.05, 0.22, 0.04, { collide: false, noShadow: true });
    b.box('bronze', front - 0.085, 3.17, mz, 0.05, 0.04, 0.16, { collide: false, noShadow: true });
    d.phys.box(front, 1.7, mz, 0.06, 1.24, 0.93, 0, { paint: false, mat: 'metal' });
    d.c.light(front - 0.7, 2.2, mz, 0xffbe82, 4.0, 6, { flicker: true, priority: 0.8 });
  }
  // tumbas hundidas / lápidas caídas / una cruz torcida suelta
  for (const [x, z, yaw] of [[30.8, -126.5, 0.3], [34.6, -125.2, -0.4], [26.8, -124.2, 1.1]]) {
    b.box('keepStone', x, 0.12, z, 0.5, 0.2, 0.9, { yaw, rx: 0.15, collide: true });
    b.box('castleStone', x + 0.5, 0.1, z + 0.3, 0.8, 0.12, 0.45, { yaw: yaw + 0.5, rz: 0.1, collide: false });
  }
  b.box('keepStone', 36.5, 0.14, -107.5, 0.2, 1.1, 0.16, { rx: 1.35, yaw: 0.5, collide: true });
  b.box('keepStone', 36.1, 0.14, -107.7, 0.7, 0.14, 0.16, { rx: 1.35, yaw: 0.5, collide: false });
  // postes con farol (luz verdosa) y una estaca con calavera
  for (const [x, z] of [[31.2, -106], [36.2, -116.4], [29.2, -121], [42, -126]]) {
    b.cylinder('iron', x, 1.2, z, 0.035, 0.05, 2.4, 6, { collide: true });
    b.box('iron', x + 0.18, 2.3, z, 0.4, 0.03, 0.03, { collide: false });
    d.c.flame(x + 0.36, 2.1, z, 0.06, 0.16, { intensity: 0.9 });
    // farol: base, cuatro montantes, vidrio (cilindro de seis lados que brilla), techito cónico y argolla
    b.cylinder('iron', x + 0.36, 2.0, z, 0.07, 0.08, 0.04, 6, { collide: false });
    for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; b.cylinder('iron', x + 0.36 + Math.cos(a) * 0.075, 2.14, z + Math.sin(a) * 0.075, 0.006, 0.006, 0.26, 4, { collide: false, noShadow: true }); }
    b.cylinder('winGlow', x + 0.36, 2.14, z, 0.062, 0.062, 0.24, 6, { collide: false, noShadow: true });
    const cap = new THREE.ConeGeometry(0.1, 0.1, 6); cap.translate(x + 0.36, 2.31, z); b.geo('iron', cap);
    b.cylinder('iron', x + 0.36, 2.37, z, 0.012, 0.012, 0.06, 4, { collide: false, noShadow: true });
    d.c.light(x + 0.3, 2.1, z, 0xffb060, 2.4, 6.5, { flicker: true, priority: 0.7 });
  }
  // la entrada de la cripta (puerta de hierro en la muralla del torreón): luz cálida y antorchas adentro para que se vea
  // qué hay del otro lado cuando se abre, y una alfombra de tierra pisada hasta el umbral
  sg.push(ribbon([[30, -108.4], [27.5, -108.4], [25.4, -108.4]], 2.2, 0.016, 0.15));
  d.c.light(21.5, 1.9, -108.4, 0xff9a50, 9, 12, { flicker: true, priority: 1.4 }).room = 0; // sin cuarto: se ve desde el cementerio, a través de la reja
  d.c.flame(23.0, 1.7, -106.9, 0.07, 0.2, { intensity: 0.9 }); d.c.flame(23.0, 1.7, -109.9, 0.07, 0.2, { intensity: 0.9 });
  // un brasero justo detrás de la reja: es lo que se ve brillar entre los barrotes
  b.cylinder('iron', 21.6, 0.5, -108.4, 0.04, 0.07, 1.0, 6, { collide: false, noShadow: true });
  b.cylinder('iron', 21.6, 1.06, -108.4, 0.3, 0.14, 0.18, 10, { collide: false, noShadow: true });
  b.cylinder('ember', 21.6, 1.14, -108.4, 0.24, 0.24, 0.03, 10, { collide: false, noShadow: true });
  d.c.flame(21.6, 1.15, -108.4, 0.22, 0.55, { intensity: 1.2 });
  b.box('iron', 23.0, 1.45, -106.9, 0.1, 0.4, 0.1, { collide: false }); b.box('iron', 23.0, 1.45, -109.9, 0.1, 0.4, 0.1, { collide: false });
  soilFlush(d, sg);
  b.finish(d.scene);
  // modelos: huesos, calaveras, raíces que rompen la tierra, tocones y ramas secas
  ground(d, 'c_bones', 28.4, 0, -127.3, 0.8, 1, { solid: false });
  ground(d, 'c_skull', 35.8, 0, -108.6, 2.2, 1, { solid: false });
  ground(d, 'c_skull', 27.6, 0, -118.3, 0.4, 0.9, { solid: false });
  ground(d, 'c_roots1', 41.0, 0, -125.2, 0.5, 0.4, { solid: false });
  ground(d, 'c_roots2', 27.2, 0, -127.0, 2.1, 0.7, { solid: false });
  ground(d, 'c_stump', 42.0, 0, -106.2, 0.7, 0.55);
  ground(d, 'c_branches', 30.2, 0, -105.4, 1.2, 1.2, { solid: false });
  ground(d, 'c_branches', 38.4, 0, -122.4, 2.6, 1, { solid: false });
  d.candleCluster(34, 0.02, -117, 5, 0.3, 1.4); // a los pies de la estatua
  d.candleCluster(29.5, 0.02, -112.4, 3, 0.2, 0);
  d.candleCluster(39.2, 0.02, -118.2, 4, 0.25, 0);
  d.candleCluster(37.8, 0.02, -106, 3, 0.2, 0);
  d.torch(43.4, 2.8, -105.5, -1, 0, 4, 9);
  d.torch(43.4, 2.8, -127.5, -1, 0, 4, 9);
  d.torch(25.4, 2.8, -126, 1, 0, 4, 9);
  if (!HAS_DOM) return;
  // A few hands emerge from actual grave mounds, using the same baked skeleton as the rest of the castle.
  const hands = [];
  whenAsset('c_skel_hang', () => {
    const model = assetModel('c_skel_hang'), forearm = model && skeletonForearm(model);
    if (!forearm) return;
    for (const [x, z] of [[27.8, -117.65], [37.7, -112.65], [31.1, -122.65]]) {
      const g = new THREE.Group(), mesh = new THREE.Mesh(forearm.geometry, forearm.material);
      mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); g.name = 'cemetery-hand';
      g.position.set(x, -0.52, z); g.rotation.y = rnd() * TAU;
      d.scene.add(g);
      hands.push({ g, t0: rnd() * 40, period: 22 + rnd() * 20 });
    }
  });
  d.anim.push((t) => {
    for (const h of hands) {
      const ph = ((t + h.t0) % h.period) / h.period; // asoma un rato corto de cada ciclo
      const up = ph < 0.14 ? smooth(ph / 0.14) : ph < 0.26 ? 1 : ph < 0.34 ? 1 - smooth((ph - 0.26) / 0.08) : 0;
      h.g.position.y = -0.52 + up * 0.6;
      h.g.rotation.z = Math.sin(t * 2.2 + h.t0) * 0.08 * up; // la mano tantea
    }
  });
  // espíritus: luces azuladas que flotan despacio sobre las tumbas
  const wisps = Array.from({ length: 11 }, () => ({ s: glow(d.scene, 0, 0, 0, 0.5, 0x7ab8ff, 0.6), x: 27 + rnd() * 15, z: -128 + rnd() * 22, y: 0.7 + rnd() * 1.4, p: rnd() * 20, sp: 0.15 + rnd() * 0.2 }));
  d.anim.push((t) => {
    for (const w of wisps) {
      w.s.position.set(w.x + Math.sin(t * w.sp + w.p) * 2.2, w.y + Math.sin(t * 0.7 + w.p) * 0.35, w.z + Math.cos(t * w.sp * 0.8 + w.p) * 2.2);
      w.s.material.opacity = 0.18 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.9 + w.p * 2));
    }
  });
}

// ================================================================ PLAZA DE ARMAS (el patio de adelante)
function patio(d) {
  const b = new Builder(d.phys), rnd = d.r, c = d.c;
  // charcos de lluvia en el empedrado (fx/puddles.js: agua que refleja, borde mojado y las gotas)
  buildPuddles(d.scene, [[-8, -90, 1.6], [7, -95, 1.2], [14, -88, 2.0], [-20, -83, 1.4], [26, -99, 1.5], [-3, -98.5, 1.0], [3.5, -86, 1.3], [38, -85, 1.7], [-12.5, -101, 1.1], [20, -92, 1.0], [-30, -82, 1.3], [10, -81.5, 1.2], [41, -93, 1.1]]
    .map(([x, z, s]) => ({ x, y: 0.055, z, rx: s * 1.3, rz: s * 0.85, rot: rnd() * PI })));
  // el herrero (contra la muralla este): fragua con brasas, yunque, tina de agua, fuelle y mesa de armas
  {
    // Keep the forge clear of the guard tower's inward-facing doorway.
    const fx = 42.1, fz = -87.4;
    b.box('keepStone', fx, 0.6, fz, 1.5, 1.2, 2.2);
    b.box('keepStone', fx + 0.5, 1.9, fz, 0.6, 2.2, 1.6, { collide: false });
    b.box('ember', fx - 0.1, 1.23, fz, 1.1, 0.05, 1.5, { collide: false, noShadow: true });
    b.box('black', fx - 0.16, 1.6, fz, 0.04, 0.7, 1.3, { collide: false, noShadow: true });
    c.fire3d(fx - 0.1, 1.25, fz, 0.45, 0.65, 0.7, { intensity: 1 });
    c.light(fx - 0.6, 1.6, fz, 0xff7a30, 5, 9, { flicker: true, priority: 1.2 });
    d.world.embers?.add(fx - 0.1, 1.5, fz, 8, { radius: 0.3, height: 1.2, strength: 0.6 });
    // yunque
    b.box('iron', fx - 2.0, 0.55, fz + 0.2, 0.34, 0.14, 0.7, { collide: false });
    b.cylinder('woodDark', fx - 2.0, 0.24, fz + 0.2, 0.2, 0.26, 0.48, 8, { collide: true });
    b.box('iron', fx - 2.0, 0.65, fz + 0.2, 0.2, 0.1, 0.55, { collide: false });
    // tina de agua para templar
    b.cylinder('woodDark', fx - 1.3, 0.35, fz - 1.4, 0.4, 0.34, 0.7, 12, { collide: true });
    b.cylinder('water', fx - 1.3, 0.66, fz - 1.4, 0.34, 0.34, 0.02, 12, { collide: false, noShadow: true });
    // mesa con herramientas y armas colgadas del muro
    b.box('woodDark', fx - 0.4, 0.8, fz + 1.7, 0.7, 0.07, 1.3);
    for (const [dx, dz] of [[-0.3, -0.55], [0.3, -0.55], [-0.3, 0.55], [0.3, 0.55]]) b.box('woodDark', fx - 0.4 + dx, 0.38, fz + 1.7 + dz, 0.07, 0.76, 0.07, { collide: false });
    for (let i = 0; i < 6; i++) b.box('iron', fx + 1.0, 1.7 + (i % 3) * 0.28, fz - 0.9 + i * 0.36, 0.03, 0.05, 0.25, { rx: 0.2 * (i % 2 ? 1 : -1), collide: false, noShadow: true });
    // humo caliente de la fragua
    d.world.smoke?.add(fx + 0.5, 3.2, fz, 8, { radius: 0.3, height: 1.8, opacity: 0.12, speed: 0.2 });
  }
  // el campo de práctica (junto a la horca): muñecos de paja, blancos de tiro y un estante de armas
  const dummy = (x, z, yaw) => {
    b.cylinder('woodDark', x, 0.9, z, 0.05, 0.06, 1.8, 6, { collide: true });
    b.box('woodDark', x, 1.3, z, 0.09, 0.09, 0.9, { yaw, collide: false });
    const torso = new THREE.CylinderGeometry(0.2, 0.17, 0.62, 8); torso.translate(x, 1.1, z); b.geo('hay', torso);
    const head = new THREE.SphereGeometry(0.15, 8, 6); head.translate(x, 1.62, z); b.geo('hay', head);
    b.box('leather', x, 1.5, z, 0.42, 0.07, 0.3, { yaw, collide: false });
    b.box('iron', x, 1.75, z, 0.24, 0.2, 0.24, { collide: false, noShadow: true }); // un casco viejo
    b.box('keepStone', x, 0.04, z, 0.9, 0.08, 0.9, { collide: false });
  };
  dummy(33.5, -96.6, 0.2); dummy(36.2, -96.0, -0.3); dummy(38.8, -96.8, 0.1);
  const target = (x, z, yaw) => {
    b.box('woodDark', x - 0.5, 0.6, z, 0.07, 1.2, 0.07, { collide: false }); b.box('woodDark', x + 0.5, 0.6, z, 0.07, 1.2, 0.07, { collide: false });
    if (HAS_DOM) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g2 = cv.getContext('2d');
      for (const [rr, col] of [[62, '#b89458'], [48, '#e8e2d0'], [34, '#9a2a24'], [20, '#e8e2d0'], [8, '#9a2a24']]) { g2.fillStyle = col; g2.beginPath(); g2.arc(64, 64, rr, 0, 6.3); g2.fill(); }
      g2.strokeStyle = 'rgba(60,40,20,0.5)'; g2.lineWidth = 2; for (let k = 0; k < 8; k++) { g2.beginPath(); g2.moveTo(64, 64); g2.lineTo(64 + Math.cos(k * 0.785) * 62, 64 + Math.sin(k * 0.785) * 62); g2.stroke(); }
      for (let k = 0; k < 120; k++) { g2.fillStyle = `rgba(30,20,10,${Math.random() * 0.3})`; g2.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 24), [new THREE.MeshStandardMaterial({ color: 0x6a5232, roughness: 1 }), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 })]);
      disc.rotation.x = PI / 2; disc.position.set(x, 1.35, z); disc.castShadow = true; d.scene.add(disc);
      // tres flechas clavadas
      for (const [ax, ay] of [[0.12, 0.05], [-0.2, 0.18], [0.05, -0.22]]) { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.55, 4), new THREE.MeshStandardMaterial({ color: 0x8a7050 })); sh.rotation.x = PI / 2; sh.position.set(x + ax, 1.35 + ay, z + 0.3); d.scene.add(sh); const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.1), new THREE.MeshStandardMaterial({ color: 0x9a2a24, side: THREE.DoubleSide })); fl.position.set(x + ax, 1.35 + ay, z + 0.52); d.scene.add(fl); }
    }
    d.phys.box(x, 1.0, z, 0.55, 1.0, 0.1, 0, { paint: false });
  };
  target(31.5, -85.8, 0); target(34.5, -85.8, 0); target(37.5, -85.8, 0);
  // estante de armas: las armas paradas en su base, apoyadas en un travesaño
  b.box('woodDark', 29.2, 0.1, -96.4, 2.6, 0.16, 0.5, { collide: true });
  b.box('woodDark', 29.2, 0.95, -96.62, 2.6, 0.07, 0.07, { collide: false });
  for (const dx of [-1.25, 1.25]) b.box('woodDark', 29.2 + dx, 0.55, -96.62, 0.09, 1.1, 0.09, { collide: false });
  // cañón del muro y pila de balas
  // barriles y cajas apilados contra la muralla este y un par de carretillas
  b.finish(d.scene);
  ground(d, 'c_cannon', 41.5, 0, -90, -PI / 2, 1.1);
  for (let i = 0; i < 6; i++) { const sp = new THREE.SphereGeometry(0.1, 8, 6); }
  ground(d, 'c_barrel_a', 42.2, 0, -94.4, 0.2, 1); ground(d, 'c_barrel_b', 42.0, 0, -95.5, 1.2, 1); ground(d, 'c_winebarrel', 40.9, 0, -95, 0, 0.9);
  ground(d, 'c_crate', 42.2, 0, -98.2, 0.1, 1); ground(d, 'c_crate', 42.1, 0.62, -98.1, 0.6, 0.85); ground(d, 'c_crate', 41.2, 0, -98.4, 1.0, 0.9);
  ground(d, 'c_basket2', 41, 0, -92.4, 0.2, 1, { solid: false });
  ground(d, 'c_estoc', 28.4, 0.18, -96.5, 0.1, 1, { solid: false }); ground(d, 'c_saber', 28.75, 0.18, -96.4, 0.1, 1, { solid: false });
  ground(d, 'c_mace', 29.15, 0.18, -96.4, 0, 1.2, { solid: false }); ground(d, 'c_warhammer', 29.5, 0.18, -96.4, 0.2, 1.2, { solid: false });
  ground(d, 'c_shield', 30.0, 0.18, -96.55, 0.15, 0.9, { solid: false });
  // el bebedero de los caballos y el poste para atarlos, frente al galpón del este
  // mercado de la muralla oeste (puestos con toldo): fruta, ollas y velas
  const stall = (x, z, yaw, cloth) => {
    const sx = Math.sin(yaw), sz = Math.cos(yaw), px = (l, u) => [x + sz * l + sx * u, z - sx * l + sz * u];
    for (const lx of [-1.5, 1.5]) for (const u of [-0.7, 0.7]) { const [qx, qz] = px(lx, u); b.cylinder('woodDark', qx, 1.25, qz, 0.05, 0.06, 2.5, 6, { collide: lx === 1.5 && u === 0.7 || true }); }
    const [mx, mz] = px(0, 0);
    b.box('woodDark', mx, 0.85, mz, 3.2, 0.08, 0.7, { yaw: yaw + PI / 2 * 0 });
    b.box('woodDark', mx, 0.42, mz, 3.0, 0.1, 0.55, { collide: false, yaw });
    // toldo de tela rayada (con caída y festón)
    awning(d, mx, 2.5, mz, 3.5, 2.0, yaw + PI / 2, cloth[0], cloth[1]);
    // farolito colgando con su llama
    const [lx, lz] = px(0.6, 0.55);
    b.cylinder('iron', lx, 2.3, lz, 0.006, 0.006, 0.45, 4, { collide: false, noShadow: true });
    c.flame(lx, 2.02, lz, 0.05, 0.12, { intensity: 0.9 });
    b.box('iron', lx, 1.96, lz, 0.13, 0.04, 0.13, { collide: false });
    c.light(lx, 2.0, lz, 0xffb060, 2.6, 7, { flicker: true, priority: 0.8 });
    return { px, mx, mz };
  };
  const s1 = stall(-43.2 + 0.2, -86, PI / 2, ['#8a2230', '#d8c9a8']); // contra la muralla oeste (la plaza al este)
  const s2 = stall(-43.2 + 0.2, -92.4, PI / 2, ['#2c5a3a', '#cdbf96']);
  void s1; void s2;
  b.finish(d.scene);
  for (const [z, off] of [[-86, 0], [-92.4, 0]]) {
    ground(d, 'c_basket1', -43 + 0.4, 0.89, z - 0.8, 0.3, 1, { solid: false }); ground(d, 'c_apple', -43 + 0.4, 0.89, z - 0.8, 0, 1, { solid: false });
    ground(d, 'c_pots', -43 + 0.4, 0.89, z + 0.2, 0.5, 0.9, { solid: false }); ground(d, 'c_onion', -43 + 0.5, 0.89, z + 0.9, 0.5, 1.2, { solid: false });
    ground(d, 'c_pear', -43 + 0.5, 0.89, z - 0.2, 0.2, 1.3, { solid: false }); ground(d, 'c_lemon', -43 + 0.55, 0.89, z + 0.5, 0, 1.4, { solid: false });
  }
  // fuente seca del medio con la estatua del gárgola: una pila redonda y un surtidor de piedra (a un costado del camino)
  {
    const fx = -12, fz = -93, fb = new Builder(d.phys);
    fb.cylinder('castleStone', fx, 0.3, fz, 2.0, 2.1, 0.6, 20, { collide: true });
    fb.cylinder('water', fx, 0.5, fz, 1.78, 1.78, 0.02, 20, { collide: false, noShadow: true });
    fb.cylinder('keepStone', fx, 0.9, fz, 0.3, 0.4, 0.8, 10, { collide: true });
    fb.cylinder('keepStone', fx, 1.55, fz, 0.7, 0.35, 0.18, 12, { collide: false });
    fb.cylinder('keepStone', fx, 1.9, fz, 0.18, 0.22, 0.6, 8, { collide: false });
    const top = new THREE.SphereGeometry(0.26, 10, 8); top.translate(fx, 2.3, fz); fb.geo('keepStone', top);
    for (let i = 0; i < 4; i++) { const a = i * PI / 2 + 0.4; fb.box('keepStone', fx + Math.sin(a) * 2.05, 0.7, fz + Math.cos(a) * 2.05, 0.36, 0.2, 0.36, { collide: false }); }
    fb.finish(d.scene);
    c.light(fx, 1.9, fz, 0x6a90ff, 1.8, 6, { priority: 0.6 });
  }
  // banderines cruzados sobre la plaza (cuerda con triángulos de tela, se mecen con el viento)
  if (HAS_DOM) {
    const strings = [[[-20, 8, -88], [-4, 7.6, -96]], [[4, 7.6, -96], [20, 8, -88]], [[-20, 8, -98], [-4, 7.4, -92]]];
    const colors = [0x7a1a22, 0x1a3a6a, 0x2a2a2a, 0x8a6a1a];
    const flags = [];
    for (const [a, c2] of strings) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...c2);
      const len = A.distanceTo(B), n = Math.floor(len / 0.9);
      const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(A.clone().lerp(B, t).add(new THREE.Vector3(0, -Math.sin(t * PI) * 0.7, 0))); }
      b.geo?.call(b, 'hemp', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012, 4));
      for (let i = 1; i < n; i++) {
        const t = i / n, p = A.clone().lerp(B, t); p.y -= Math.sin(t * PI) * 0.7;
        const tri = new THREE.BufferGeometry();
        tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, -0.42, 0], 3)); tri.computeVertexNormals();
        const m = new THREE.Mesh(tri, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.9, side: THREE.DoubleSide }));
        m.position.copy(p); m.rotation.y = Math.atan2(B.z - A.z, B.x - A.x) * -1 + PI / 2; m.castShadow = false; d.scene.add(m); flags.push({ m, p: i * 1.3 });
      }
    }
    b.finish(d.scene);
    d.anim.push((t) => { for (const f of flags) f.m.rotation.x = Math.sin(t * 1.6 + f.p) * 0.18; });
  }
  // los dos mástiles donde se atan los banderines
  const mb = new Builder(d.phys);
  for (const [x, z] of [[-20, -88], [20, -88], [-20, -98], [-4, -96], [4, -96]]) mb.cylinder('woodDark', x, 4, z, 0.07, 0.11, 8, 8, { collide: true });
  mb.finish(d.scene);
}

// ================================================================ TORRES
// cada torre de esquina tiene un cuarto distinto en la planta baja y en la terraza de arriba (nivel 11)
function torres(d) {
  const c = d.c, rnd = d.r;
  const T = [
    { x: -45, z: -131, kind: 'calabozo' }, { x: 45, z: -131, kind: 'armeria' },
    { x: -45, z: -79, kind: 'alquimia' }, { x: 45, z: -79, kind: 'guardia' },
  ];
  for (const t of c.towerRooms || []) {
    const def = T.find((q) => Math.abs(q.x - t.x) < 1 && Math.abs(q.z - t.z) < 1);
    if (!def || !t.corner) continue;
    towerRoom(d, t, def.kind, rnd);
    dressTowerTop(d, t, def.kind); // la parte de arriba (nivel 11): world/tower-tops.js
  }
}
// ubica algo contra el muro de la torre, en el ángulo a (0 = +z, hacia el centro apunta hacia adentro) y a distancia r del centro
const at = (t, a, r) => [t.x + Math.sin(a) * r, t.z + Math.cos(a) * r];
function towerRoom(d, t, kind, rnd) {
  const c = d.c, b = new Builder(d.phys), R = 4.05, inward = t.inward;
  const arcFree = (a) => Math.abs(Math.atan2(Math.sin(a - inward), Math.cos(a - inward))) > 0.5; // el hueco de la puerta queda libre
  const spots = []; // ángulos disponibles contra el muro
  for (let i = 0; i < 20; i++) { const a = i * TAU / 20; if (arcFree(a)) spots.push(a); }
  const wall = (a, key, w, h, dpt, y = h / 2, o = {}) => { const [x, z] = at(t, a, R - dpt / 2 + 0.05); b.box(key, x, y, z, w, h, dpt, { yaw: a, ...o }); };
  const barrel = (a, r = 0.32) => { const [x, z] = at(t, a, R - r); b.cylinder('woodDark', x, 0.45, z, r * 0.9, r, 0.9, 10, { collide: true }); b.cylinder('iron', x, 0.3, z, r * 1.02, r * 1.02, 0.04, 10, { collide: false }); b.cylinder('iron', x, 0.62, z, r * 1.02, r * 1.02, 0.04, 10, { collide: false }); };
  const torch = (a, y = 2.3) => { const [x, z] = at(t, a, R + 0.05); c.flame(x, y + 0.2, z, 0.07, 0.2, { intensity: 0.9 }); b.box('iron', x, y, z, 0.1, 0.4, 0.1, { collide: false }); };
  const place = (type, a, r, y, yawOff, s, o) => { const [x, z] = at(t, a, r); ground(d, type, x, y, z, a + PI + yawOff, s, o); };
  // la luz del cuarto (cada torre con su color: se nota qué es sin cartel) y un resplandor bajo la escalera
  const tint = { calabozo: 0xff6a4a, armeria: 0xffa860, alquimia: 0x7affa0, guardia: 0xffc27a }[kind];
  { const [lx, lz] = at(t, inward + PI, 1.2); c.light(lx, 1.9, lz, tint, 6.5, 10, { flicker: true, priority: 1.3 }); }
  { const [lx, lz] = at(t, inward + PI / 2, 3.6); c.light(lx, 0.9, lz, tint, 2.6, 6, { priority: 1 }); }
  if (kind === 'calabozo') {
    // celdas con rejas, cadenas, el potro de tortura y huesos
    // Keep the tall bars under the raised side of the spiral, away from its first steps.
    for (const a of [inward - 0.9, inward - 1.9]) { // dos celdas contra el muro
      const [x, z] = at(t, a, R - 0.8);
      // The full skeleton fits on the cot, with its long axis along the wall.
      b.box('keepStone', x, 0.3, z, 1.8, 0.6, 1.45, { yaw: a, collide: true });
      for (let k = -3; k <= 3; k++) { const [bx, bz] = at(t, a + k * 0.125, R - 1.58); b.cylinder('iron', bx, 1.1, bz, 0.016, 0.016, 2.2, 5, { collide: false }); }
      ground(d, 'c_skel_lie', x, 0.6, z, a + PI / 2, 0.9, { solid: false });
    }
    const [rx, rz] = at(t, inward + PI, 1.6); // el potro, cerca del pilar
    b.box('woodDark', rx, 0.5, rz, 0.8, 0.12, 2.0, { yaw: inward, collide: true });
    for (const s of [-1, 1]) b.box('woodDark', rx + Math.sin(inward + PI / 2) * 0.5 * s, 0.25, rz + Math.cos(inward + PI / 2) * 0.5 * s, 0.1, 0.5, 1.9, { yaw: inward, collide: false });
    b.cylinder('woodDark', rx + Math.sin(inward) * 1.0, 0.7, rz + Math.cos(inward) * 1.0, 0.09, 0.09, 0.5, 8, { rz: PI / 2, yaw: inward, collide: false });
    for (const a of [inward + 0.7, inward - 0.7, inward - 1.3]) { // cadenas colgando del muro
      const [x, z] = at(t, a, R + 0.02);
      for (let k = 0; k < 6; k++) b.box('iron', x, 2.6 - k * 0.2, z, 0.05, 0.14, 0.05, { yaw: a, collide: false, noShadow: true });
      b.box('iron', x, 1.9, z, 0.2, 0.05, 0.1, { yaw: a, collide: false });
    }
    { const [bx, bz] = at(t, inward + 1.1, 3.3); ground(d, 'c_bones', bx, 0.1, bz, 0.5, 1, { solid: false }); }
    { const [bx, bz] = at(t, inward - 0.4, 3.5); ground(d, 'c_skull', bx, 0.1, bz, 0, 1, { solid: false }); }
    barrel(inward + 3.1); barrel(inward - 3.0);
    for (const a of [inward + 1.0, inward - 1.0, inward + PI]) torch(a);
    // mancha de sangre en el piso, bajo el potro
    const blood = new THREE.CircleGeometry(0.9, 16); blood.rotateX(-PI / 2); blood.translate(rx, 0.12, rz);
    if (HAS_DOM) d.scene.add(new THREE.Mesh(blood, new THREE.MeshBasicMaterial({ color: 0x3a0606, transparent: true, opacity: 0.65, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
  } else if (kind === 'armeria') {
    for (const a of [inward + 0.9, inward - 0.9]) { // estantes con lanzas y escudos
      const [x, z] = at(t, a, R - 0.3);
      b.box('woodDark', x, 0.9, z, 1.3, 0.06, 0.5, { yaw: a, collide: false }); b.box('woodDark', x, 1.5, z, 1.3, 0.06, 0.5, { yaw: a, collide: false });
      for (const s of [-0.62, 0.62]) b.box('woodDark', x + Math.cos(a) * s, 0.9, z - Math.sin(a) * s, 0.08, 1.8, 0.5, { yaw: a, collide: true });
      for (let k = -2; k <= 2; k++) { const [lx, lz] = at(t, a + k * 0.07, R - 0.5); b.cylinder('woodDark', lx, 1.1, lz, 0.015, 0.018, 2.3, 5, { collide: false, noShadow: true }); const tip = new THREE.ConeGeometry(0.03, 0.18, 4); tip.translate(lx, 2.3, lz); b.geo('iron', tip); }
    }
    barrel(inward + 3.0); barrel(inward - 3.0); barrel(inward + 2.75, 0.28);
    // pila de balas de cañón al pie del muro
    for (let i = 0; i < 10; i++) { const a = inward + PI + (i % 4) * 0.06 - 0.1, r = R - 0.4 - Math.floor(i / 4) * 0.08, [x, z] = at(t, a, r); const s = new THREE.SphereGeometry(0.1, 10, 8); s.translate(x, 0.1 + Math.floor(i / 4) * 0.17, z); b.geo('iron', s); }
    place('c_shield', inward + 1.5, R - 0.05, 1.7, 0, 1, { solid: false });
    place('c_shield', inward - 1.5, R - 0.05, 1.7, 0, 1, { solid: false });
    for (const a of [inward + 0.6, inward - 0.6]) torch(a, 2.4);
  } else if (kind === 'alquimia') {
    // mesas de trabajo con frascos, un caldero que burbujea, estantes con libros y un esqueleto de estudio
    const [tx, tz] = at(t, inward + PI, 1.5);
    b.box('woodDark', tx, 0.85, tz, 1.8, 0.08, 0.8, { yaw: inward, collide: true });
    for (const dx of [-0.8, 0.8]) b.box('woodDark', tx + Math.cos(inward) * dx, 0.42, tz - Math.sin(inward) * dx, 0.08, 0.84, 0.7, { yaw: inward, collide: false });
    const a0 = inward - 2.9, [cx, cz] = at(t, a0, 3.2);
    b.cylinder('ember', cx, 0.09, cz, 0.36, 0.3, 0.14, 12, { collide: true }); // brasas debajo
    d.world.embers?.add(cx, 0.2, cz, 6, { radius: 0.3, height: 0.8, strength: 0.5 });
    c.light(cx, 0.9, cz, 0x6aff6a, 2.4, 5.5, { flicker: true, priority: 0.9 });
    d.place('c_cauldron', cx, 0.16, cz, a0 + 0.4, 0.7, { still: false, onReady: (m) => {
      d.phys.cylinder(cx, 0.45, cz, 0.45, 0.4, { mat: 'metal' });
      m.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (/liquid/i.test(o.name) && o.material) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0x3aff40); d.anim.push((tt) => { o.material.emissiveIntensity = 1.0 + Math.sin(tt * 3 + cx) * 0.3; }); } } });
    } });
    for (const a of [inward + 0.9, inward - 0.9]) { // estantes
      const [x, z] = at(t, a, R - 0.25);
      b.box('woodDark', x, 1.0, z, 1.4, 0.05, 0.4, { yaw: a, collide: false }); b.box('woodDark', x, 1.6, z, 1.4, 0.05, 0.4, { yaw: a, collide: false }); b.box('woodDark', x, 2.2, z, 1.4, 0.05, 0.4, { yaw: a, collide: false });
      for (const s of [-0.68, 0.68]) b.box('woodDark', x + Math.cos(a) * s, 1.1, z - Math.sin(a) * s, 0.06, 2.3, 0.4, { yaw: a, collide: true });
      for (let k = 0; k < 6; k++) { const col = ['green', 'red', 'fluo', 'glass'][k % 4]; const [bx, bz] = at(t, a + (k - 2.5) * 0.06, R - 0.25); b.cylinder(col, bx, 1.1 + (k % 3) * 0.6, bz, 0.05, 0.06, 0.2, 8, { collide: false, noShadow: true }); }
    }
    ground(d, 'c_microscope', tx - Math.cos(inward) * 0.45, 0.89, tz + Math.sin(inward) * 0.45, inward, 1, { solid: false });
    ground(d, 'c_books', tx + Math.cos(inward) * 0.4, 0.89, tz - Math.sin(inward) * 0.4, inward, 1, { solid: false });
    { const [bx, bz] = at(t, inward - 2.2, 3.4); ground(d, 'c_skel_sit', bx, 0.1, bz, inward - 2.2 + PI, 0.9, { solid: false }); }
    for (const a of [inward + 1.5, inward - 1.5]) torch(a);
  } else if (kind === 'guardia') {
    // The other side is the foot of the spiral staircase; leave its approach clear.
    for (const a of [inward - 1.6]) {
      const [x, z] = at(t, a, R - 0.55);
      b.box('woodDark', x, 0.42, z, 0.9, 0.08, 1.9, { yaw: a, collide: true }); b.box('woodDark', x, 1.25, z, 0.9, 0.08, 1.9, { yaw: a, collide: true });
      for (const s of [-0.43, 0.43]) for (const e of [-0.92, 0.92]) b.box('woodDark', x + Math.cos(a) * s + Math.sin(a) * e, 0.7, z - Math.sin(a) * s + Math.cos(a) * e, 0.07, 1.4, 0.07, { collide: false });
      b.box('hay', x, 0.52, z, 0.8, 0.1, 1.7, { yaw: a, collide: false }); b.box('fabricBrown', x, 1.35, z, 0.8, 0.08, 1.6, { yaw: a, collide: false });
    }
    const [tx, tz] = at(t, inward + PI, 1.6);
    b.box('woodDark', tx, 0.78, tz, 1.1, 0.07, 0.7, { yaw: inward, collide: true });
    for (const [dx, dz] of [[-0.45, -0.28], [0.45, -0.28], [-0.45, 0.28], [0.45, 0.28]]) b.box('woodDark', tx + dx, 0.38, tz + dz, 0.06, 0.76, 0.06, { yaw: inward, collide: false });
    for (const o of [-0.7, 0.7]) { const [sx, sz] = [tx + Math.sin(inward + PI / 2) * o, tz + Math.cos(inward + PI / 2) * o]; b.cylinder('woodDark', sx, 0.22, sz, 0.18, 0.2, 0.44, 8, { collide: true }); }
    d.candleCluster(tx + Math.cos(inward) * 0.36, 0.82, tz - Math.sin(inward) * 0.36, 3, 0.1, 1.6);
    ground(d, 'c_chess', tx, 0.82, tz, inward, 0.55, { solid: false });
    const [cx, cz] = at(t, inward + 2.7, R - 0.35);
    b.box('woodDark', cx, 0.3, cz, 1.0, 0.6, 0.55, { yaw: inward + 2.7, collide: true }); b.box('iron', cx, 0.62, cz, 1.02, 0.05, 0.57, { yaw: inward + 2.7, collide: false });
    barrel(inward - 2.9);
    for (const a of [inward + 0.8, inward - 0.8]) torch(a);
  }
  b.finish(d.scene);
}
// ================================================================ FACHADA DEL TORREÓN
// decales de lluvia, musgo y escudo; portal con frontón sobre la puerta, postigos entreabiertos, enredaderas y
// gárgolas bajo la cornisa. La cara de adelante está en z = -103 (mira al sur, hacia la plaza).
function decalTex(kind) {
  const W = 128, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  let s = 91; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  if (kind === 'streak') { // chorreado de lluvia: tiras oscuras que se afinan hacia abajo
    for (let i = 0; i < 9; i++) { const x = 14 + r() * (W - 28), w = 3 + r() * 9, len = 90 + r() * 150, a = 0.14 + r() * 0.2; const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, `rgba(8,12,10,${a})`); gr.addColorStop(1, 'rgba(8,12,10,0)'); g.fillStyle = gr; g.fillRect(x, 0, w, len); }
  } else if (kind === 'moss') { // musgo y humedad que sube desde el piso
    for (let i = 0; i < 1400; i++) { const x = r() * W, y = H - r() * r() * H * 0.9; g.fillStyle = `rgba(${28 + r() * 30},${60 + r() * 50},${24 + r() * 20},${0.1 + r() * 0.3})`; g.beginPath(); g.arc(x, y, 1 + r() * 4, 0, 6.3); g.fill(); }
  } else if (kind === 'arms') { // escudo del Conde: calavera y espadas cruzadas sobre rojo, lema
    cv.width = 256; cv.height = 256; g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#2a0a0e'; g.beginPath(); g.moveTo(40, 30); g.lineTo(216, 30); g.lineTo(216, 130); g.quadraticCurveTo(216, 210, 128, 236); g.quadraticCurveTo(40, 210, 40, 130); g.closePath(); g.fill();
    g.strokeStyle = '#b8955a'; g.lineWidth = 9; g.stroke();
    g.strokeStyle = '#c8c0b0'; g.lineWidth = 9; g.beginPath(); g.moveTo(70, 70); g.lineTo(186, 180); g.moveTo(186, 70); g.lineTo(70, 180); g.stroke();
    g.fillStyle = '#e8e2d0'; g.beginPath(); g.ellipse(128, 112, 34, 38, 0, 0, 6.3); g.fill(); g.fillRect(110, 140, 36, 20);
    g.fillStyle = '#1a0608'; for (const dx of [-14, 14]) { g.beginPath(); g.ellipse(128 + dx, 108, 9, 11, 0, 0, 6.3); g.fill(); } g.beginPath(); g.moveTo(128, 122); g.lineTo(121, 136); g.lineTo(135, 136); g.fill();
    g.fillStyle = '#b8955a'; g.font = 'bold 22px Georgia'; g.textAlign = 'center'; g.fillText('NUNC EST BIBENDUM', 128, 28 + 0);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.18})`; g.fillRect(r() * 256, r() * 256, 2, 2); }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function facade(d) {
  const b = new Builder(d.phys), rnd = d.r, Z = -102.92, F0 = 3.5;
  const decal = (tex, x, y, z, w, h, rotY = 0, op = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: true }));
    m.position.set(x, y, z); m.rotation.y = rotY; m.renderOrder = 2; d.scene.add(m);
  };
  if (HAS_DOM) {
    const streak = decalTex('streak'), moss = decalTex('moss');
    // chorreado bajo cada ventana y musgo en el zócalo
    for (const x of [-20.5, -12.5, -5, 5, 12.5, 20.5]) decal(streak, x, x === -5 || x === 5 ? 9.2 : 3.5 + 3.4, Z + 0.01, 1.9, 3.8, 0, 0.9);
    for (const x of [-22, -16, -9, 9, 16, 22]) decal(moss, x, 1.05, Z + 0.015, 6.2, 2.0, 0, 0.9);
    // el escudo sobre la puerta (en el frontón)
    decal(decalTex('arms'), 0, 10.6, Z + 0.62, 1.8, 1.8, 0, 1);
  }
  // portal: dos pilastras, dintel y frontón triangular con el escudo en el tímpano
  for (const sx of [-1, 1]) {
    b.box('castleStone', sx * 2.45, (F0 + 9.6) / 2, Z + 0.2, 0.7, 9.6 - F0 + 0.2, 0.6, { collide: false });
    b.box('keepStone', sx * 2.45, F0 + 0.18, Z + 0.25, 1.0, 0.36, 0.8, { collide: false });
    b.box('keepStone', sx * 2.45, 9.7, Z + 0.25, 0.95, 0.3, 0.75, { collide: false });
    b.box('keepStone', sx * 3.5, 6.2, Z + 0.1, 0.28, 3.4, 0.3, { collide: false }); // jambas de las ventanas altas, con relieve
  }
  b.box('castleStone', 0, 9.2, Z + 0.2, 5.6, 0.5, 0.65, { collide: false });
  const gable = new THREE.Shape(); gable.moveTo(-3.1, 0); gable.lineTo(3.1, 0); gable.lineTo(0, 1.9); gable.lineTo(-3.1, 0);
  const gg = new THREE.ExtrudeGeometry(gable, { depth: 0.5, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 });
  gg.translate(0, 9.45, Z + 0.1); b.geo('castleStone', gg);
  b.box('keepStone', 0, 9.62, Z + 0.62, 5.0, 0.12, 0.1, { collide: false });
  // dos faroles de hierro (cada uno con su luz) pegados a las pilastras
  for (const sx of [-1, 1]) { b.box('iron', sx * 3.0, 5.2, Z + 0.55, 0.05, 0.9, 0.05, { collide: false }); b.box('iron', sx * 3.0, 5.65, Z + 0.78, 0.04, 0.04, 0.5, { collide: false }); b.cylinder('winGlow', sx * 3.0, 5.4, Z + 1.02, 0.09, 0.09, 0.3, 6, { collide: false, noShadow: true }); d.c.flame(sx * 3.0, 5.4, Z + 1.02, 0.05, 0.14, { intensity: 0.9 }); d.c.light(sx * 3.0, 5.4, Z + 1.3, 0xffa855, 3.4, 8, { flicker: true, priority: 1 }); }
  // postigos entreabiertos en las ventanas bajas (hojas de madera con vetas, un poco torcidas)
  for (const cx of [-20.5, -12.5, 12.5, 20.5]) for (const s of [-1, 1]) {
    const hinge = cx + s * 0.78, ang = s * (0.95 + rnd() * 0.5);
    const w = 0.78, h = 3.45;
    const geo = new THREE.BoxGeometry(w, h, 0.07);
    geo.translate(s * w / 2, 0, 0); geo.rotateY(ang); geo.translate(hinge, 6.8, Z + 0.08);
    b.geo('woodDark', geo);
    const hb = new THREE.BoxGeometry(w * 0.9, 0.08, 0.1); hb.translate(s * w / 2, 0.9, 0); hb.rotateY(ang); hb.translate(hinge, 6.8, Z + 0.1); b.geo('iron', hb);
    const hb2 = hb.clone(); hb2.translate(0, 0, 0); hb2.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -1.8, 0)); b.geo('iron', hb2);
  }
  // macetas con plantas secas en los alféizares de las ventanas altas del salón
  for (const x of [-5, 5]) { b.box('terracotta', x, 4.9, Z + 0.5, 1.1, 0.34, 0.34, { collide: false }); for (let k = 0; k < 7; k++) b.cylinder('moss', x + (k - 3) * 0.14, 5.25, Z + 0.5, 0.01, 0.02, 0.35 + rnd() * 0.25, 4, { collide: false, rz: (rnd() - 0.5) * 0.9, noShadow: true }); }
  // enredaderas que trepan por las esquinas y el zócalo del frente
  for (const [x, w, h] of [[-23.5, 3.2, 11], [-17.6, 2.2, 6.5], [-9.2, 1.6, 4.5], [9.2, 1.6, 4.5], [17.6, 2.2, 6.5], [23.5, 3.2, 11], [-13.5, 1.8, 3.4], [14, 1.8, 3.8]]) ivy(b, x, Z + 0.02, 0, 1, w, h, rnd, 5, 3.4);
  b.finish(d.scene);
  // gárgolas (cabezas de bronce/piedra) bajo la cornisa, cada una escupiendo hacia adelante
  for (const [type, x] of [['c_lionhead', -16.5], ['c_bullhead', -8.5], ['c_horsehead', 8.5], ['c_lionhead', 16.5]]) {
    d.place(type, x, 15.2, Z + 0.35, 0, 1.0, { onReady: (m) => { m.traverse((o) => { if (o.isMesh) o.castShadow = true; }); } });
  }
}

// ================================================================ entrada
export function dressYard(d) {
  try { facade(d); } catch (e) { console.warn('fachada', e); }
  try { huerta(d); } catch (e) { console.warn('huerta', e); }
  try { cementerio(d); } catch (e) { console.warn('cementerio', e); }
  try { patio(d); } catch (e) { console.warn('patio', e); }
  // las torres se visten cuando el castillo ya las armó (castle.towerRooms)
  try { torres(d); } catch (e) { console.warn('torres', e); }
}
void assetBounds; void whenAsset; void UP;
