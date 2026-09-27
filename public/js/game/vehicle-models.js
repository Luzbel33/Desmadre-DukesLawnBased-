// Modelos de los vehículos (cortadora antigua, tractor clásico, carrito de golf) con materiales PBR:
// pintura laqueada, cromo, bronce, cuero, madera del volante y tablero con relojes. +Z es adelante.
// Estructura (la usa entities.js):
//   raíz -> body (carrocería: se balancea, rebota y vibra) -> mallas fusionadas por material + volante
//        -> ruedas traseras (userData.wheel) y pivotes delanteros (userData.steerPivot) con su rueda
//   raíz.userData = { body, steer (volante, gira en su Z local; +Y local = las 12), steerTilt, pivots, exhaust }
// Las piezas quietas se fusionan por material: cada vehículo son ~10 llamadas de dibujo, no 40-90.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PAINTS = new Map();
function paint(color) {
  if (!PAINTS.has(color)) {
    PAINTS.set(color, new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0.08, clearcoat: 0.65, clearcoatRoughness: 0.18 }));
  }
  return PAINTS.get(color);
}

// versión de doble cara de un material (cáscaras abiertas: guardabarros, respaldos)
const DBL = new Map();
function dbl(mat) {
  if (!DBL.has(mat)) { const m = mat.clone(); m.side = THREE.DoubleSide; DBL.set(mat, m); }
  return DBL.get(mat);
}

function canvasTex(w, h, draw, srgb = true) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let M = null;
function mats() {
  if (M) return M;
  const wood = canvasTex(256, 64, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5a2412'); g.addColorStop(0.5, '#7a3419'); g.addColorStop(1, '#4a1c0d');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      c.strokeStyle = `rgba(${20 + Math.random() * 30},${6 + Math.random() * 8},0,${0.25 + Math.random() * 0.3})`;
      c.lineWidth = 0.6 + Math.random() * 1.4;
      c.beginPath();
      const y = Math.random() * h;
      c.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.5);
      c.stroke();
    }
  });
  const gauge = (label, red) => canvasTex(128, 128, (c) => {
    c.fillStyle = '#f1e8d2'; c.beginPath(); c.arc(64, 64, 62, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#1b1b1b'; c.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      c.beginPath(); c.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); c.lineTo(64 + Math.cos(a) * (i % 5 ? 54 : 58), 64 + Math.sin(a) * (i % 5 ? 54 : 58)); c.stroke();
    }
    if (red) { c.strokeStyle = '#b3261e'; c.lineWidth = 5; c.beginPath(); c.arc(64, 64, 52, Math.PI * 1.95, Math.PI * 2.25); c.stroke(); }
    c.fillStyle = '#1b1b1b'; c.font = 'bold 15px Georgia'; c.textAlign = 'center'; c.fillText(label, 64, 96);
    c.strokeStyle = '#b3261e'; c.lineWidth = 3; c.beginPath(); c.moveTo(64, 64); c.lineTo(64 + Math.cos(Math.PI * 1.15) * 44, 64 + Math.sin(Math.PI * 1.15) * 44); c.stroke();
    c.fillStyle = '#222'; c.beginPath(); c.arc(64, 64, 6, 0, Math.PI * 2); c.fill();
  });
  const emblem = canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 58, 8, 64, 64, 64);
    g.addColorStop(0, '#ffe7a1'); g.addColorStop(0.6, '#c9973a'); g.addColorStop(1, '#6e4b12');
    c.fillStyle = g; c.beginPath(); c.arc(64, 64, 62, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#12301f'; c.beginPath(); c.arc(64, 64, 44, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e9c46a'; c.font = 'bold 56px Georgia'; c.textAlign = 'center'; c.fillText('D', 64, 84);
  });
  M = {
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.55, metalness: 0.2 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x5d6064, metalness: 0.8, roughness: 0.42 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 1, roughness: 0.08 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd3a043, metalness: 1, roughness: 0.22 }),
    cream: new THREE.MeshPhysicalMaterial({ color: 0xece2c8, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
    leather: new THREE.MeshPhysicalMaterial({ color: 0x7c1616, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
    wood: new THREE.MeshPhysicalMaterial({ map: wood, color: 0xffffff, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
    plank: new THREE.MeshStandardMaterial({ map: wood, color: 0xd6b48a, roughness: 0.75 }),
    deck: new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.55, metalness: 0.45 }),
    blade: new THREE.MeshStandardMaterial({ color: 0xc9c9c9, roughness: 0.25, metalness: 0.9 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe2a0, emissiveIntensity: 1.1, roughness: 0.15 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x6a0c0c, emissive: 0xff2010, emissiveIntensity: 0.6, roughness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xdfe9ee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }),
    tan: new THREE.MeshStandardMaterial({ color: 0xcdb892, roughness: 0.72 }),
    gauge1: new THREE.MeshStandardMaterial({ map: gauge('km/h', false), roughness: 0.3 }),
    gauge2: new THREE.MeshStandardMaterial({ map: gauge('RPM', true), roughness: 0.3 }),
    emblem: new THREE.MeshStandardMaterial({ map: emblem, metalness: 0.6, roughness: 0.3 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xe3b62b, roughness: 0.42, metalness: 0.25 }),
    grey: new THREE.MeshStandardMaterial({ color: 0x9a9da1, roughness: 0.45, metalness: 0.5 }),
  };
  return M;
}

// Caja redondeada: esquinas redondeadas vistas de arriba y cantos biselados arriba/abajo
const RB = new Map();
export function rbox(w, h, d, r = 0.06, bevel = 0.03) {
  const key = [w, h, d, r, bevel].join(',');
  if (RB.has(key)) return RB.get(key);
  const b = Math.max(0.002, Math.min(bevel, h / 2 - 0.002, w / 4, d / 4));
  const W = w - 2 * b, D = d - 2 * b;
  const rr = Math.max(0.002, Math.min(r, W / 2 - 0.001, D / 2 - 0.001));
  const x = W / 2 - rr, y = D / 2 - rr;
  const s = new THREE.Shape();
  s.moveTo(-x, -D / 2);
  s.lineTo(x, -D / 2); s.quadraticCurveTo(W / 2, -D / 2, W / 2, -y);
  s.lineTo(W / 2, y); s.quadraticCurveTo(W / 2, D / 2, x, D / 2);
  s.lineTo(-x, D / 2); s.quadraticCurveTo(-W / 2, D / 2, -W / 2, y);
  s.lineTo(-W / 2, -y); s.quadraticCurveTo(-W / 2, -D / 2, -x, -D / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, h - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 5 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -(h - 2 * b) / 2, 0);
  g.computeVertexNormals();
  RB.set(key, g);
  return g;
}

// Perfil lateral (en z, y) extruido a lo ancho (x) con bordes redondeados: capós y guardabarros
function sideShape(pts, width, bevel = 0.05) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) s.quadraticCurveTo(p[2], p[3], p[0], p[1]);
    else s.lineTo(p[0], p[1]);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 12 });
  // shape en (x=z_vehículo, y) -> extruida en z: rotar para que el ancho quede en x
  g.rotateY(-Math.PI / 2);
  g.translate((width - bevel * 2) / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

function part(g, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

// Rueda: cubierta con hombros redondeados + llanta + tapa (+ tacos de tractor), todo fusionado.
// Gira sobre su eje con rotation.x (el grupo ya viene girado con rotation.z = PI/2).
const TIRES = new Map();
function tireGeo(r, w) {
  const key = r + ',' + w;
  if (TIRES.has(key)) return TIRES.get(key);
  const ri = r * 0.62, sh = Math.min(w * 0.3, r * 0.22);
  const pts = [];
  pts.push(new THREE.Vector2(ri, -w / 2));
  pts.push(new THREE.Vector2(r - sh, -w / 2));
  for (let i = 1; i <= 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - sh + Math.cos(a) * sh, -w / 2 + sh + Math.sin(a) * sh));
  }
  for (let i = 0; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - sh + Math.cos(a) * sh, w / 2 - sh + Math.sin(a) * sh));
  }
  pts.push(new THREE.Vector2(ri, w / 2));
  const g = new THREE.LatheGeometry(pts, 32);
  TIRES.set(key, g);
  return g;
}
function wheel(parent, r, w, rimMat, x, y, z, lugs = 0, spokes = 0, sideHint = 0) {
  const m = mats();
  const wg = new THREE.Group();
  wg.position.set(x, y, z);
  wg.rotation.z = Math.PI / 2;
  wg.userData.wheel = true;
  wg.userData.r = r;
  const side = sideHint || (x < 0 ? -1 : 1);
  const rubber = [tireGeo(r, w)];
  // tacos en V (tractor) / dibujo de la cubierta
  for (let i = 0; i < lugs; i++) {
    const a = (i / lugs) * Math.PI * 2;
    for (const s of [-1, 1]) {
      const lug = new THREE.BoxGeometry(r * 0.1, w * 0.42, r * 0.12);
      lug.rotateZ(s * 0.55);
      lug.rotateY(-a);
      lug.translate(Math.cos(a) * r * 0.99, s * w * 0.22, Math.sin(a) * r * 0.99);
      rubber.push(lug);
    }
  }
  addMerged(wg, rubber, m.rubber);
  const rim = [new THREE.CylinderGeometry(r * 0.62, r * 0.62, w * 0.8, 24)];
  // llanta con rayos o agujeros
  for (let i = 0; i < spokes; i++) {
    const sp = new THREE.BoxGeometry(r * 0.05, w * 0.1, r * 0.5);
    sp.rotateY((i / spokes) * Math.PI * 2);
    sp.translate(0, -side * w * 0.4, 0);
    rim.push(sp);
  }
  rim.push(new THREE.CylinderGeometry(r * 0.2, r * 0.24, 0.03, 16).translate(0, -side * w * 0.42, 0));
  addMerged(wg, rim, rimMat);
  parent.add(wg);
  return wg;
}

function addMerged(parent, geos, mat) {
  const g = mergeGeometries(geos.map(norm), false);
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Deja la geometría con position/normal/uv, sin índice (para poder fusionar de todo)
function norm(g) {
  let out = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(k)) out.deleteAttribute(k);
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  return out;
}

// Fusiona todas las mallas quietas de `group` (menos las que cuelgan de nodos marcados como dinámicos)
// en una malla por material. Devuelve el grupo con las mallas fusionadas.
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  const remove = [];
  group.traverse((o) => {
    if (!o.isMesh || o === group) return;
    let p = o.parent, dynamic = false;
    while (p && p !== group) { if (p.userData.dynamic) { dynamic = true; break; } p = p.parent; }
    if (dynamic || o.userData.dynamic) return;
    const g = norm(o.geometry).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const list = byMat.get(o.material) || [];
    list.push(g);
    byMat.set(o.material, list);
    remove.push(o);
  });
  for (const o of remove) o.removeFromParent();
  for (const [mat, geos] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
    mesh.castShadow = mat !== mats().glass;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

function lamp(g, x, y, z, r = 0.05, mat = null, back = false) {
  const m = mats();
  part(g, new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat || m.lamp, x, y, z, back ? -Math.PI / 2 : Math.PI / 2);
  part(g, new THREE.TorusGeometry(r * 1.02, r * 0.16, 8, 20), m.chrome, x, y, z + (back ? -0.004 : 0.004));
  // carcasa cromada de atrás
  part(g, new THREE.SphereGeometry(r * 1.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.chrome, x, y, z + (back ? 0.01 : -0.01), back ? Math.PI / 2 : -Math.PI / 2);
}

// Volante: aro de madera laqueada, 3 rayos cromados y cubo de bronce con el escudo.
// El grupo `steer` tiene el aro en su plano XY; +Y local apunta a las 12 (adelante-arriba).
function steeringWheel(body, cx, cy, cz, planeTilt, R, columnFrom) {
  const m = mats();
  const steer = new THREE.Group();
  steer.position.set(cx, cy, cz);
  // plano del volante inclinado planeTilt respecto de la horizontal; las 12 hacia adelante-arriba
  steer.rotation.x = Math.PI / 2 - planeTilt;
  steer.userData.dynamic = true;
  steer.userData.R = R;
  steer.userData.tilt = Math.PI / 2 - planeTilt;
  part(steer, new THREE.TorusGeometry(R, R * 0.12, 12, 40), m.wood);
  for (const a of [Math.PI / 2, Math.PI * 1.2, Math.PI * 1.8]) {
    const sp = part(steer, new THREE.CylinderGeometry(R * 0.035, R * 0.05, R * 0.95, 8), m.chrome, Math.cos(a) * R * 0.48, Math.sin(a) * R * 0.48, 0);
    sp.rotation.z = a - Math.PI / 2;
  }
  part(steer, new THREE.CylinderGeometry(R * 0.26, R * 0.3, R * 0.2, 20), m.brass, 0, 0, -R * 0.06, Math.PI / 2);
  part(steer, new THREE.CircleGeometry(R * 0.22, 24), m.emblem, 0, 0, -R * 0.17, 0, Math.PI, 0);
  mergeStatic(steer);
  body.add(steer);
  // columna de dirección
  const to = new THREE.Vector3(cx, cy, cz);
  const from = new THREE.Vector3(...columnFrom);
  const len = from.distanceTo(to);
  const col = part(body, new THREE.CylinderGeometry(0.022, 0.028, len, 10), m.black);
  col.position.copy(from).add(to).multiplyScalar(0.5);
  col.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return steer;
}

// Tablero con relojes (mira al conductor, levemente inclinado hacia atrás)
function dashboard(body, x, y, z, w, tiltBack, color) {
  const m = mats();
  const d = new THREE.Group();
  d.position.set(x, y, z);
  d.rotation.x = tiltBack;
  part(d, rbox(w, 0.2, 0.05, 0.03, 0.012), m.cream, 0, 0, 0);
  part(d, rbox(w + 0.04, 0.03, 0.08, 0.015, 0.01), color, 0, 0.11, 0.01);
  const gz = -0.03;
  for (const [gx, mat, rr] of [[-w * 0.3, m.gauge2, 0.045], [0, m.gauge1, 0.06], [w * 0.3, m.gauge2, 0.045]]) {
    part(d, new THREE.CircleGeometry(rr, 28), mat, gx, 0.01, gz, 0, Math.PI, 0);
    part(d, new THREE.TorusGeometry(rr, 0.008, 8, 28), m.chrome, gx, 0.01, gz - 0.002);
  }
  // perillas
  for (const gx of [-w * 0.42, w * 0.42]) part(d, new THREE.SphereGeometry(0.014, 10, 8), m.black, gx, -0.07, gz);
  body.add(d);
  return d;
}

function seat(g, y, z, w = 0.5, mat = null) {
  const m = mats();
  const sm = mat || m.leather;
  part(g, rbox(w, 0.11, 0.44, 0.1, 0.045), sm, 0, y, z);
  // respaldo curvo acolchado
  const back = new THREE.CylinderGeometry(w * 0.62, w * 0.62, 0.34, 20, 1, true, -0.85, 1.7);
  part(g, back, dbl(sm), 0, y + 0.2, z + w * 0.2, -0.18, Math.PI, 0);
  const inner = new THREE.CylinderGeometry(w * 0.58, w * 0.58, 0.3, 20, 1, true, -0.8, 1.6);
  part(g, inner, dbl(sm), 0, y + 0.2, z + w * 0.2, -0.18, Math.PI, 0);
  part(g, rbox(w * 0.9, 0.05, 0.1, 0.04, 0.02), m.chrome, 0, y + 0.37, z - w * 0.42 + 0.02, -0.18);
}

// guardabarros curvo (media caña) sobre una rueda
function fender(g, r, w, x, y, z, P) {
  const shell = new THREE.CylinderGeometry(r, r, w, 28, 1, true, -0.08, Math.PI + 0.16);
  part(g, shell, dbl(P), x, y, z, 0, 0, Math.PI / 2);
  const lip = new THREE.TorusGeometry(r, 0.018, 6, 28, Math.PI + 0.16);
  for (const s of [-1, 1]) part(g, lip, P, x + s * w / 2, y, z, 0, Math.PI / 2, -0.08);
}

function crate(g, x, y, z) {
  const m = mats();
  for (let i = 0; i < 3; i++) {
    part(g, new THREE.BoxGeometry(0.5, 0.05, 0.02), m.plank, x, y + 0.04 + i * 0.07, z + 0.16);
    part(g, new THREE.BoxGeometry(0.5, 0.05, 0.02), m.plank, x, y + 0.04 + i * 0.07, z - 0.16);
    part(g, new THREE.BoxGeometry(0.02, 0.05, 0.32), m.plank, x + 0.24, y + 0.04 + i * 0.07, z);
    part(g, new THREE.BoxGeometry(0.02, 0.05, 0.32), m.plank, x - 0.24, y + 0.04 + i * 0.07, z);
  }
  part(g, new THREE.BoxGeometry(0.5, 0.015, 0.34), m.plank, x, y, z);
  // una botella en el cajón
  const bottle = new THREE.LatheGeometry([[0, 0], [0.028, 0], [0.03, 0.02], [0.03, 0.16], [0.012, 0.22], [0.011, 0.27], [0, 0.27]].map(([r, h]) => new THREE.Vector2(r, h)), 14);
  part(g, bottle, new THREE.MeshPhysicalMaterial({ color: 0x2f5a2c, roughness: 0.1, clearcoat: 1 }), x + 0.12, y + 0.01, z + 0.05);
}

// ---------------------------------------------------------------- cortadora (tractorcito antiguo)
function mower(color) {
  const m = mats();
  const P = paint(color);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // chasis y plato de corte con la cuchilla
  part(body, new THREE.BoxGeometry(0.62, 0.07, 1.7), m.steel, 0, 0.3, 0.16);
  part(body, rbox(1.3, 0.13, 0.78, 0.34, 0.04), m.deck, 0, 0.2, 0.3);
  const chute = part(body, rbox(0.3, 0.12, 0.36, 0.05, 0.02), m.deck, -0.72, 0.2, 0.28, 0, 0, -0.28);
  void chute;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.018, 0.09), m.blade);
  blade.position.set(0, 0.125, 0.3);
  blade.name = 'blade';
  blade.userData.dynamic = true;
  body.add(blade);
  // capó redondeado (perfil lateral extruido)
  const hood = sideShape([
    [0.22, 0.42], [1.02, 0.42], [1.12, 0.62, 1.1, 0.46], [1.0, 0.78, 1.12, 0.76], [0.28, 0.84, 0.62, 0.84], [0.22, 0.74, 0.22, 0.84], [0.22, 0.42],
  ], 0.62, 0.06);
  part(body, hood, P);
  // franja cromada al medio del capó y adorno de bronce
  part(body, new THREE.BoxGeometry(0.03, 0.012, 0.74), m.chrome, 0, 0.86, 0.66, -0.08);
  part(body, new THREE.SphereGeometry(0.03, 12, 10), m.brass, 0, 0.84, 1.03);
  part(body, new THREE.ConeGeometry(0.018, 0.08, 10), m.brass, 0, 0.9, 1.02, -0.5);
  // parrilla crema con barras cromadas
  part(body, rbox(0.46, 0.3, 0.05, 0.1, 0.02), m.cream, 0, 0.6, 1.1, Math.PI / 2 - 0.25, 0, 0);
  for (let i = -4; i <= 4; i++) part(body, new THREE.BoxGeometry(0.012, 0.24, 0.02), m.chrome, i * 0.042, 0.6, 1.13, -0.25);
  part(body, new THREE.TorusGeometry(0.2, 0.012, 8, 30), m.chrome, 0, 0.6, 1.125, -0.25).scale.set(1.12, 0.72, 1);
  lamp(body, -0.25, 0.7, 1.05, 0.05);
  lamp(body, 0.25, 0.7, 1.05, 0.05);
  // tablero, columna y volante de madera
  part(body, rbox(0.22, 0.46, 0.2, 0.06, 0.03), P, 0, 0.78, 0.3);
  dashboard(body, 0, 1.04, 0.33, 0.44, 0.55, P);
  const steer = steeringWheel(body, 0, 1.24, 0.1, 0.78, 0.19, [0, 1.0, 0.32]);
  // pisaderas de goma
  for (const x of [-0.37, 0.37]) part(body, rbox(0.24, 0.04, 0.66, 0.05, 0.015), m.black, x, 0.44, 0.1);
  // guardabarros traseros, cola y asiento de cuero
  fender(body, 0.4, 0.3, 0.58, 0.32, -0.45, P);
  fender(body, 0.4, 0.3, -0.58, 0.32, -0.45, P);
  part(body, rbox(0.86, 0.18, 0.62, 0.14, 0.05), P, 0, 0.72, -0.5);
  part(body, new THREE.CylinderGeometry(0.1, 0.12, 0.16, 12), m.steel, 0, 0.84, -0.36);
  seat(body, 0.9, -0.36, 0.52);
  crate(body, 0, 0.82, -0.86);
  // escape vertical con tapa cromada
  part(body, new THREE.CylinderGeometry(0.028, 0.03, 0.2, 12), m.black, -0.22, 0.92, 0.5);
  part(body, new THREE.CylinderGeometry(0.036, 0.03, 0.05, 12), m.chrome, -0.22, 1.04, 0.5);
  lamp(body, -0.34, 0.74, -0.82, 0.03, m.tail, true);
  lamp(body, 0.34, 0.74, -0.82, 0.03, m.tail, true);
  mergeStatic(body);
  // ruedas: traseras grandes con dibujo, delanteras que doblan
  const rim = color === 0xe0b020 ? m.grey : m.cream;
  for (const s of [-1, 1]) wheel(root, 0.32, 0.22, rim, s * 0.6, 0.32, -0.45, 14, 6);
  const pivots = [];
  for (const s of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(s * 0.46, 0.19, 0.8);
    pv.userData.steerPivot = true;
    wheel(pv, 0.19, 0.13, rim, 0, 0, 0, 0, 5, s);
    root.add(pv);
    pivots.push(pv);
  }
  root.userData = { body, steer, pivots, exhaust: new THREE.Vector3(-0.22, 1.08, 0.5), seatZ: -0.36 };
  return root;
}

// ---------------------------------------------------------------- tractor clásico
function tractor(color) {
  const m = mats();
  const P = paint(color);
  const rim = color === 0x2d5a3c ? m.yellow : m.cream;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // bloque del motor, chasis y cárter
  part(body, new THREE.BoxGeometry(0.5, 0.36, 1.7), m.steel, 0, 0.62, 0.35);
  part(body, rbox(0.46, 0.3, 1.0, 0.08, 0.03), m.black, 0, 0.66, 0.66);
  // capó largo redondeado
  const hood = sideShape([
    [0.06, 0.78], [1.28, 0.78], [1.34, 1.05, 1.34, 0.86], [1.24, 1.2, 1.34, 1.2], [0.14, 1.24, 0.7, 1.26], [0.06, 1.12, 0.06, 1.24], [0.06, 0.78],
  ], 0.58, 0.07);
  part(body, hood, P);
  // rejillas laterales del motor
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) part(body, new THREE.BoxGeometry(0.012, 0.04, 0.6), m.black, s * 0.292, 0.86 + i * 0.065, 0.72);
  // parrilla vertical con marco de pintura, faros al costado
  part(body, rbox(0.5, 0.46, 0.08, 0.08, 0.02), P, 0, 1.0, 1.33, Math.PI / 2, 0, 0);
  part(body, rbox(0.4, 0.36, 0.04, 0.05, 0.01), m.black, 0, 1.0, 1.36, Math.PI / 2, 0, 0);
  for (let i = -5; i <= 5; i++) part(body, new THREE.BoxGeometry(0.012, 0.34, 0.02), m.chrome, i * 0.034, 1.0, 1.38);
  lamp(body, -0.3, 1.02, 1.28, 0.065);
  lamp(body, 0.3, 1.02, 1.28, 0.065);
  part(body, new THREE.CircleGeometry(0.06, 24), m.emblem, 0, 1.22, 1.35, -0.3, 0, 0);
  // escape vertical con aleta y toma de aire
  part(body, new THREE.CylinderGeometry(0.04, 0.045, 0.82, 14), m.black, 0.16, 1.62, 1.0);
  part(body, new THREE.CylinderGeometry(0.05, 0.04, 0.05, 14), m.chrome, 0.16, 2.04, 1.0);
  part(body, new THREE.CylinderGeometry(0.035, 0.035, 0.34, 12), m.black, -0.16, 1.4, 1.0);
  part(body, new THREE.SphereGeometry(0.05, 12, 8), m.chrome, -0.16, 1.59, 1.0);
  // puesto de manejo: tablero, columna, volante de madera
  part(body, rbox(0.52, 0.5, 0.2, 0.06, 0.03), P, 0, 1.18, 0.08);
  dashboard(body, 0, 1.42, 0.02, 0.44, 0.5, P);
  const steer = steeringWheel(body, 0, 1.62, -0.06, 0.78, 0.19, [0, 1.3, 0.12]);
  part(body, rbox(0.9, 0.08, 0.95, 0.1, 0.03), m.steel, 0, 0.98, -0.45);
  // asiento de chapa sobre un fleje
  part(body, new THREE.BoxGeometry(0.06, 0.04, 0.5), m.steel, 0, 1.16, -0.42, -0.35);
  part(body, rbox(0.46, 0.06, 0.4, 0.14, 0.02), m.black, 0, 1.3, -0.55);
  seat(body, 1.3, -0.55, 0.46, P);
  // guardabarros grandes sobre las ruedas traseras
  fender(body, 0.7, 0.42, 0.8, 0.62, -0.45, P);
  fender(body, 0.7, 0.42, -0.8, 0.62, -0.45, P);
  for (const s of [-1, 1]) part(body, rbox(0.34, 0.03, 0.9, 0.08, 0.01), P, s * 0.8, 1.33, -0.45);
  // enganche trasero y plato de corte debajo
  part(body, new THREE.BoxGeometry(0.1, 0.08, 0.5), m.steel, 0, 0.5, -1.05);
  part(body, rbox(1.4, 0.12, 0.72, 0.3, 0.04), m.deck, 0, 0.2, 0.35);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.018, 0.1), m.blade);
  blade.position.set(0, 0.12, 0.35);
  blade.name = 'blade';
  blade.userData.dynamic = true;
  body.add(blade);
  lamp(body, -0.62, 1.34, -0.95, 0.035, m.tail, true);
  lamp(body, 0.62, 1.34, -0.95, 0.035, m.tail, true);
  mergeStatic(body);
  for (const s of [-1, 1]) wheel(root, 0.62, 0.36, rim, s * 0.8, 0.62, -0.45, 20, 8);
  const pivots = [];
  for (const s of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(s * 0.46, 0.34, 1.05);
    pv.userData.steerPivot = true;
    wheel(pv, 0.34, 0.18, rim, 0, 0, 0, 0, 6, s);
    root.add(pv);
    pivots.push(pv);
  }
  root.userData = { body, steer, pivots, exhaust: new THREE.Vector3(0.16, 2.08, 1.0), seatZ: -0.55 };
  return root;
}

// ---------------------------------------------------------------- carrito de golf
function cart(color) {
  const m = mats();
  const P = paint(color);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  part(body, new THREE.BoxGeometry(1.1, 0.12, 2.3), m.steel, 0, 0.32, 0);
  part(body, rbox(1.3, 0.3, 2.5, 0.22, 0.06), P, 0, 0.52, 0);
  part(body, rbox(1.22, 0.42, 0.62, 0.26, 0.12), P, 0, 0.84, 1.0);
  lamp(body, -0.4, 0.86, 1.3, 0.05);
  lamp(body, 0.4, 0.86, 1.3, 0.05);
  part(body, rbox(1.25, 0.08, 0.3, 0.1, 0.03), m.black, 0, 0.42, 1.28);
  part(body, rbox(1.1, 0.12, 0.3, 0.05, 0.03), m.black, 0, 1.08, 0.66);
  dashboard(body, 0, 1.12, 0.52, 0.5, 0.35, P);
  const steer = steeringWheel(body, 0.28, 1.24, 0.38, 0.95, 0.17, [0.28, 1.05, 0.55]);
  part(body, rbox(1.16, 0.3, 0.55, 0.08, 0.04), P, 0, 0.8, -0.24);
  part(body, rbox(1.12, 0.12, 0.52, 0.1, 0.045), m.tan, 0, 1.0, -0.22);
  part(body, rbox(1.12, 0.44, 0.1, 0.08, 0.04), m.tan, 0, 1.28, -0.52, -0.12);
  part(body, rbox(1.36, 0.06, 1.8, 0.14, 0.02), paint(0xf4f2ea), 0, 2.02, 0.08);
  for (const [x, z] of [[-0.6, 0.78], [0.6, 0.78], [-0.6, -0.68], [0.6, -0.68]]) {
    part(body, new THREE.CylinderGeometry(0.025, 0.025, z > 0 ? 1.0 : 1.15, 10), m.chrome, x, z > 0 ? 1.5 : 1.44, z);
  }
  const ws = part(body, new THREE.PlaneGeometry(1.18, 0.72), m.glass, 0, 1.55, 0.8, -0.12);
  ws.castShadow = false;
  part(body, rbox(1.0, 0.1, 0.5, 0.06, 0.02), m.black, 0, 0.78, -1.0);
  lamp(body, -0.5, 0.6, -1.26, 0.035, m.tail, true);
  lamp(body, 0.5, 0.6, -1.26, 0.035, m.tail, true);
  mergeStatic(body);
  for (const s of [-1, 1]) wheel(root, 0.25, 0.18, m.chrome, s * 0.66, 0.25, -0.85, 0, 6);
  const pivots = [];
  for (const s of [-1, 1]) {
    const pv = new THREE.Group();
    pv.position.set(s * 0.66, 0.25, 0.85);
    pv.userData.steerPivot = true;
    wheel(pv, 0.25, 0.18, m.chrome, 0, 0, 0, 0, 6, s);
    root.add(pv);
    pivots.push(pv);
  }
  root.userData = { body, steer, pivots, exhaust: null, seatZ: -0.2 };
  return root;
}

export function buildVehicleModel(type, color) {
  if (type === 'tractor') return tractor(color);
  if (type === 'cart') return cart(color);
  return mower(color);
}
