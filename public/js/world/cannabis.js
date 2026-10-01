// Planta de cannabis procedural (la sala de cultivo y las macetas del coffeeshop del Búnker).
// Una sola geometría para las hojas (cuadrados con la hoja palmeada de 7 folíolos dibujada en canvas, con recorte) y otra
// para tallo y cogollos: se instancian todas las plantas con dos llamadas de dibujo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const HAS_DOM = typeof document !== 'undefined';
let _kit = null;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// hoja palmeada: 7 folíolos lanceolados y aserrados que salen del mismo punto (abajo al centro)
function leafTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  const bx = 128, by = 238;
  const fol = [[0, 1], [-0.5, 0.86], [0.5, 0.86], [-1.0, 0.64], [1.0, 0.64], [-1.45, 0.36], [1.45, 0.36]];
  for (const [ang, len] of fol) {
    const L = 205 * len, W = 30 * (0.55 + len * 0.45);
    g.save(); g.translate(bx, by); g.rotate(ang * 0.55);
    // contorno aserrado: dientes a lo largo de los dos bordes
    g.beginPath(); g.moveTo(0, 0);
    const n = 16;
    for (let side = -1; side <= 1; side += 2) {
      const pts = [];
      for (let i = 1; i <= n; i++) {
        const t = i / n, w = Math.sin(Math.PI * Math.pow(t, 0.8)) * W * (1 - t * 0.15);
        const tooth = i % 2 ? 1.18 : 0.9;
        pts.push([side * w * tooth, -L * t]);
      }
      if (side < 0) for (const p of pts) g.lineTo(p[0], p[1]);
      else for (const p of pts.reverse()) g.lineTo(p[0], p[1]);
      if (side < 0) g.lineTo(0, -L);
    }
    g.closePath();
    const gr = g.createLinearGradient(0, 0, 0, -L);
    gr.addColorStop(0, '#356f2a'); gr.addColorStop(0.5, '#4f9838'); gr.addColorStop(1, '#78bd52');
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(160,210,120,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -L * 0.92); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// cogollo: verde claro escarchado con pelitos naranjas
function budTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#7f9f52'; g.fillRect(0, 0, 64, 64);
  const r = rng(7);
  for (let i = 0; i < 220; i++) { g.fillStyle = r() < 0.5 ? 'rgba(220,235,200,0.55)' : 'rgba(70,100,40,0.5)'; g.fillRect(r() * 64, r() * 64, 1.5, 1.5); }
  g.strokeStyle = 'rgba(214,120,40,0.9)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const x = r() * 64, y = r() * 64; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 7, y + (r() - 0.5) * 7); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// geometrías y materiales compartidos (planta de 1.15 m; se escala por instancia)
export function cannabisKit() {
  if (_kit) return _kit;
  const r = rng(420);
  const leaves = [], wood = [];
  const H = 1.15, nodes = 8;
  const stem = new THREE.CylinderGeometry(0.012, 0.024, H, 6); stem.translate(0, H / 2, 0); wood.push(stem);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  for (let i = 0; i < nodes; i++) {
    const t = i / (nodes - 1), y = 0.1 + t * (H - 0.24);
    const size = 0.62 * (1 - t * 0.55) + 0.1;
    // tres hojas por nudo, en espiral (ángulo de oro): la planta se ve tupida desde cualquier lado
    for (const k of [0, 1, 2]) {
      const yaw = i * 2.4 + k * (Math.PI * 2 / 3) + (r() - 0.5) * 0.4;
      const leaf = new THREE.PlaneGeometry(size, size);
      leaf.translate(0, size / 2, 0); // la base de la hoja en el tallo
      // casi horizontal, hacia afuera, un poco caída en las de abajo
      e.set(-Math.PI / 2 + 0.2 + t * 0.5, yaw, (r() - 0.5) * 0.3, 'YXZ');
      leaf.applyMatrix4(m.compose(p.set(0, y, 0), q.setFromEuler(e), s));
      leaves.push(leaf);
      // pecíolo: palito del tallo a la hoja
      const pet = new THREE.CylinderGeometry(0.004, 0.006, size * 0.35, 4);
      pet.translate(0, size * 0.175, 0);
      pet.applyMatrix4(m.compose(p.set(0, y, 0), q.setFromEuler(e.set(-Math.PI / 2 + 0.6, yaw, 0, 'YXZ')), s));
      wood.push(pet);
    }
    // cogollos laterales en los nudos de arriba
    if (t > 0.45) {
      for (let k = 0; k < 2; k++) {
        const a = r() * Math.PI * 2, b = new THREE.IcosahedronGeometry(0.03 + t * 0.012, 0);
        b.scale(1, 1.5, 1); b.translate(Math.cos(a) * 0.05, y + 0.03, Math.sin(a) * 0.05);
        wood.push(b);
      }
    }
  }
  // la cola de arriba: cogollos apilados
  for (let k = 0; k < 7; k++) {
    const b = new THREE.IcosahedronGeometry(0.045 - k * 0.003, 0);
    b.scale(1, 1.4, 1); b.translate((r() - 0.5) * 0.03, H - 0.16 + k * 0.035, (r() - 0.5) * 0.03);
    wood.push(b);
  }
  const strip = (g) => { for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n); return g.index ? g.toNonIndexed() : g; };
  const leafGeo = mergeGeometries(leaves.map(strip));
  const woodGeo = mergeGeometries(wood.map(strip));
  const leafMat = new THREE.MeshStandardMaterial({ map: HAS_DOM ? leafTexture() : null, color: HAS_DOM ? 0xffffff : 0x4f9838, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.65 });
  const woodMat = new THREE.MeshStandardMaterial({ map: HAS_DOM ? budTexture() : null, color: HAS_DOM ? 0xffffff : 0x7f9f52, roughness: 0.6 });
  _kit = { leafGeo, woodGeo, leafMat, woodMat };
  return _kit;
}

// muchas plantas: matrices = Matrix4[] (posición del pie, giro y tamaño). Devuelve las dos mallas instanciadas.
export function plantField(parent, matrices) {
  const k = cannabisKit();
  const out = [];
  for (const [geo, mat] of [[k.leafGeo, k.leafMat], [k.woodGeo, k.woodMat]]) {
    const im = new THREE.InstancedMesh(geo, mat, matrices.length);
    matrices.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.computeBoundingSphere();
    im.castShadow = false; im.receiveShadow = true;
    parent.add(im);
    out.push(im);
  }
  return out;
}
