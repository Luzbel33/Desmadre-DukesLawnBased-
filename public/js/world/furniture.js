// Muebles y objetos estáticos del mapa (a partir de FURNITURE en mapdata).
import * as THREE from 'three';
import { readableSign } from './readable-sign.js';
import { textTexture } from './textures.js';
import { placeModel, hasAsset, instanceModel } from '../game/assets.js';
import { rbox } from '../game/vehicle-models.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Transforma un punto local (x, z) según yaw y posición
function tp(f, lx, lz) {
  const s = Math.sin(f.r), c = Math.cos(f.r);
  return [f.p[0] + lx * c + lz * s, f.p[2] - lx * s + lz * c];
}

// Paño de póker: fibra con ruido fino, línea de apuestas y el nombre del bar (tapa del cilindro: UV radial)
let FELT = null;
function feltTexture() {
  if (FELT || typeof document === 'undefined') return FELT;
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = '#b9c9bd';
  c.fillRect(0, 0, S, S);
  const img = c.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  c.putImageData(img, 0, 0);
  // viñeta suave hacia el borde (el paño se ve gastado donde apoyan los brazos)
  const g = c.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  c.strokeStyle = 'rgba(255,236,170,0.45)';
  c.lineWidth = 3;
  c.beginPath();
  c.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2);
  c.stroke();
  // el paño es una elipse 1.25 x 0.75: el texto se dibuja angosto para que no quede estirado
  const text = (t, y, font) => { c.save(); c.translate(S / 2, y); c.scale(0.6, 1); c.font = font; c.fillText(t, 0, 0); c.restore(); };
  c.fillStyle = 'rgba(255,236,170,0.38)';
  c.textAlign = 'center';
  text('EL CORTACÉSPED', S / 2 + 82, 'bold 34px Georgia, serif');
  text('— TEXAS HOLD\'EM —', S / 2 - 70, '20px Georgia, serif');
  FELT = new THREE.CanvasTexture(cv);
  FELT.colorSpace = THREE.SRGBColorSpace;
  FELT.anisotropy = 8;
  return FELT;
}

export function buildFurniture(list, b, scene, out) {
  for (const f of list) {
    const fn = BUILD[f.k];
    if (fn) fn(f, b, scene, out);
  }
  flushInstanced(scene);
}

// ---------------------------------------------------------------- muebles repetidos (una llamada de dibujo por material)
const INST = new Map(); // tipo -> { parts: [{geo, mat}], mats: Matrix4[] }
function instanced(type, factory, x, y, z, yaw) {
  if (!INST.has(type)) INST.set(type, { parts: factory(), mats: [] });
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  INST.get(type).mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
}
function flushInstanced(scene) {
  for (const { parts, mats } of INST.values()) {
    for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      scene.add(im);
    }
  }
  INST.clear();
}
// arma geometrías por material a partir de piezas [geo, material, x, y, z, rx]
function mergeParts(pieces) {
  const byMat = new Map();
  for (const [geo, mat, x, y, z, rx = 0] of pieces) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(g);
  }
  return [...byMat.entries()].map(([mat, geos]) => ({ mat, geo: mergeGeometries(geos) }));
}
function cinemaSeatParts() {
  const leather = new THREE.MeshPhysicalMaterial({ color: 0x7a1519, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color(0xff6a6a), sheenRoughness: 0.5 });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.45 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.4, metalness: 0.8 });
  return mergeParts([
    [rbox(0.54, 0.15, 0.5, 0.08, 0.05), leather, 0, 0.43, 0.03],
    [rbox(0.54, 0.74, 0.13, 0.08, 0.05), leather, 0, 0.83, -0.25, -0.12],
    [rbox(0.5, 0.08, 0.06, 0.03, 0.02), plastic, 0, 1.2, -0.3, -0.12],
    ...[-1, 1].flatMap((s) => [
      [rbox(0.075, 0.06, 0.52, 0.03, 0.02), plastic, s * 0.32, 0.66, 0.0],
      [new THREE.BoxGeometry(0.05, 0.3, 0.07), plastic, s * 0.32, 0.5, -0.1],
      [new THREE.TorusGeometry(0.035, 0.009, 6, 16), plastic, s * 0.32, 0.695, 0.2, Math.PI / 2],
      [new THREE.BoxGeometry(0.05, 0.36, 0.34), metal, s * 0.32, 0.18, -0.08],
    ]),
  ]);
}

function lbox(b, f, key, lx, y, lz, sx, sy, sz, opts = {}) {
  const [x, z] = tp(f, lx, lz);
  b.box(key, x, y, z, sx, sy, sz, { yaw: f.r + (opts.yaw || 0), ...opts, yaw: f.r + (opts.yaw || 0) });
}
function lcyl(b, f, key, lx, y, lz, r0, r1, h, seg = 12, opts = {}) {
  const [x, z] = tp(f, lx, lz);
  b.cylinder(key, x, y, z, r0, r1, h, seg, opts);
}
// Modelo 3D en coordenadas locales del mueble (si está cargado)
function lmodel(scene, f, type, lx, y, lz, yaw = 0, scale = 1) {
  const [x, z] = tp(f, lx, lz);
  return placeModel(scene, type, x, y, z, f.r + yaw, scale);
}
function seats(f, out, n, spacing, lz, height = 0.48) {
  for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * spacing;
    const [x, z] = tp(f, lx, lz);
    out.seats.push({ x, y: height, z, yaw: f.r, id: out.seats.length });
  }
}

// Agua animada (normales procedurales que se desplazan)
export const WATER_T = { value: 0 };
let WATER_NM = null;
function waterNormals() {
  if (WATER_NM) return WATER_NM;
  const N = 256;
  const h = new Float32Array(N * N);
  // alturas: suma de ondas + ruido suave (repite en los bordes)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x / N) * Math.PI * 2, v = (y / N) * Math.PI * 2;
      h[y * N + x] = Math.sin(u * 3 + Math.sin(v * 2) * 1.5) * 0.5 + Math.sin(v * 5 + u * 2) * 0.3 + Math.sin((u + v) * 7) * 0.15 + Math.sin(u * 11 - v * 9) * 0.08;
    }
  }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
      const dy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      const nx = -dx * 2.2, ny = -dy * 2.2, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const o = (y * N + x) * 4;
      data[o] = (nx / l * 0.5 + 0.5) * 255; data[o + 1] = (ny / l * 0.5 + 0.5) * 255; data[o + 2] = (nz / l * 0.5 + 0.5) * 255; data[o + 3] = 255;
    }
  }
  WATER_NM = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  WATER_NM.wrapS = WATER_NM.wrapT = THREE.RepeatWrapping;
  WATER_NM.generateMipmaps = true;
  WATER_NM.minFilter = THREE.LinearMipmapLinearFilter;
  WATER_NM.magFilter = THREE.LinearFilter;
  WATER_NM.needsUpdate = true;
  return WATER_NM;
}
function waterMaterial(repeat = 2) {
  const nm = waterNormals().clone();
  nm.repeat.set(repeat, repeat);
  nm.needsUpdate = true;
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x21505a, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.86,
    normalMap: nm, normalScale: new THREE.Vector2(0.28, 0.28), clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.2,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWaterT = WATER_T;
    sh.fragmentShader = 'uniform float uWaterT;' + String.fromCharCode(10) + sh.fragmentShader.replace(
      'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
      `vec3 mapN = normalize( ( texture2D( normalMap, vNormalMapUv + uWaterT * vec2( 0.021, 0.013 ) ).xyz * 2.0 - 1.0 )
        + ( texture2D( normalMap, vNormalMapUv * 1.63 - uWaterT * vec2( 0.017, 0.029 ) ).xyz * 2.0 - 1.0 ) );`,
    );
  };
  m.customProgramCacheKey = () => 'water-anim';
  return m;
}
function curtainMaterial() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(200,225,235,0.07)';
  c.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 128, w = 0.6 + Math.random() * 2.2;
    const g = c.createLinearGradient(0, 0, 0, 256);
    const a = 0.18 + Math.random() * 0.42;
    g.addColorStop(0, `rgba(235,248,255,${a})`); g.addColorStop(0.5, `rgba(200,230,245,${a * 0.6})`); g.addColorStop(1, `rgba(235,248,255,${a})`);
    c.fillStyle = g;
    c.fillRect(x, 0, w, 256);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaMap: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.1, color: 0xd8eef6 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWaterT = WATER_T;
    sh.vertexShader = 'uniform float uWaterT;' + String.fromCharCode(10) + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_MAP
        vMapUv.y += uWaterT * 1.6;
      #endif
      #ifdef USE_ALPHAMAP
        vAlphaMapUv.y += uWaterT * 1.6;
      #endif`);
  };
  m.customProgramCacheKey = () => 'water-curtain';
  return m;
}

const BUILD = {
  counter(f, b) {
    const L = f.len || 10;
    lbox(b, f, 'woodDark', 0, 0.52, 0, L, 1.04, 0.65);
    lbox(b, f, 'wood', 0, 1.08, 0.05, L + 0.2, 0.08, 0.9, { collide: false });
    lbox(b, f, 'gold', 0, 0.2, 0.45, L, 0.05, 0.05, { collide: false });
    // canillas de cerveza
    for (let i = -2; i <= 2; i++) {
      lcyl(b, f, 'chrome', i * 0.5, 1.3, -0.15, 0.03, 0.03, 0.4, 8);
      lbox(b, f, 'black', i * 0.5, 1.52, -0.15, 0.06, 0.08, 0.06, { collide: false });
    }
  },
  shelf(f, b, scene) {
    const L = f.len || 10;
    lbox(b, f, 'woodDark', 0, 1.8, 0.05, L, 3.2, 0.1, { collide: false });
    for (const y of [1.3, 1.9, 2.5]) lbox(b, f, 'wood', 0, y, 0.2, L, 0.05, 0.3, { collide: false });
    // botellas decorativas: modelo real instanciado (si cargó)
    if (hasAsset('d_bottle_lod')) {
      const mats = [];
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      for (const y of [1.3, 1.9, 2.5]) {
        for (let x = -L / 2 + 0.2; x < L / 2 - 0.15; x += 0.19 + Math.random() * 0.12) {
          if (Math.random() < 0.12) continue; // huecos: ya se tomaron algunas
          const [wx, wz] = tp(f, x, 0.2 + (Math.random() - 0.5) * 0.06);
          const s = 0.85 + Math.random() * 0.3;
          q.setFromAxisAngle(up, Math.random() * Math.PI * 2);
          mats.push(new THREE.Matrix4().compose(new THREE.Vector3(wx, y + 0.025, wz), q, new THREE.Vector3(s, s, s)));
        }
      }
      // vidrios: verde, ámbar, marrón, transparente, azul (en orden aleatorio)
      const pal = [0x2a5a2c, 0x7a4a14, 0x4a2a10, 0xc8d8d0, 0x23405a, 0x2a5a2c, 0x7a4a14];
      const tints = mats.map(() => new THREE.Color(pal[Math.floor(Math.random() * pal.length)]));
      instanceModel(scene, 'd_bottle_lod', mats, tints);
      return;
    }
    const geo = new THREE.CylinderGeometry(0.04, 0.045, 0.3, 8);
    const cols = [0x2a5b1f, 0x5a3212, 0xc8d8e0, 0x7a1f2b, 0xd0a040, 0x1f3a6a];
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.1 });
    const n = Math.floor(L / 0.16) * 3;
    const im = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let k = 0;
    for (const y of [1.3, 1.9, 2.5]) {
      for (let x = -L / 2 + 0.15; x < L / 2 - 0.1 && k < n; x += 0.16) {
        const [wx, wz] = tp(f, x, 0.2);
        const s = 0.8 + Math.random() * 0.5;
        m.makeScale(1, s, 1);
        m.setPosition(wx, y + 0.15 * s + 0.03, wz);
        im.setMatrixAt(k, m);
        im.setColorAt(k, c.setHex(cols[Math.floor(Math.random() * cols.length)]));
        k++;
      }
    }
    im.count = k;
    im.castShadow = false;
    scene.add(im);
  },
  bartable(f, b, scene) {
    if (lmodel(scene, f, 'd_bartable', 0, 0, 0)) {
      const [x, z] = tp(f, 0, 0);
      b.phys.cylinder(x, 0.4, z, 0.4, 0.56, { mat: 'wood' });
      if (hasAsset('d_cigs') && Math.random() < 0.7) lmodel(scene, f, 'd_cigs', 0.18, 0.8, -0.2, Math.random() * 6);
      return;
    }
    lcyl(b, f, 'woodDark', 0, 0.92, 0, 0.55, 0.55, 0.06, 20, { collide: false });
    lcyl(b, f, 'black', 0, 0.46, 0, 0.06, 0.06, 0.9, 8, { collide: false });
    lcyl(b, f, 'black', 0, 0.03, 0, 0.3, 0.3, 0.06, 12, { collide: false });
    const [x, z] = tp(f, 0, 0);
    b.phys.cylinder(x, 0.475, z, 0.475, 0.55);
  },
  pooltable(f, b) {
    // superficie de juego a 0.9 m, 2.6 x 1.4
    lbox(b, f, 'felt', 0, 0.85, 0, 1.3, 0.1, 2.5, { collide: false });
    lbox(b, f, 'woodDark', 0, 0.55, 0, 1.5, 0.5, 2.7, { collide: false });
    b.phys.box(...(() => { const [x, z] = tp(f, 0, 0); return [x, 0.45, z]; })(), 0.75, 0.45, 1.35, f.r, { mat: 'wood', paint: false });
    // bandas
    for (const s of [-1, 1]) {
      lbox(b, f, 'woodDark', s * 0.72, 0.95, 0, 0.14, 0.1, 2.7);
      lbox(b, f, 'woodDark', 0, 0.95, s * 1.32, 1.58, 0.1, 0.14);
    }
    for (const [x, z] of [[-0.62, -1.22], [0.62, -1.22], [-0.66, 0], [0.66, 0], [-0.62, 1.22], [0.62, 1.22]]) {
      lcyl(b, f, 'black', x, 0.905, z, 0.06, 0.06, 0.02, 10, { collide: false });
    }
    for (const [x, z] of [[-0.6, -1.2], [0.6, -1.2], [-0.6, 1.2], [0.6, 1.2]]) lbox(b, f, 'woodDark', x, 0.3, z, 0.15, 0.6, 0.15, { collide: false });
  },
  // Mesa de póker ovalada (paño verde, baranda de cuero) con 6 sillas
  pokertable(f, b, scene, out) {
    const cx = f.p[0], cz = f.p[2];
    const RX = 1.3, RZ = 0.8;
    // paño con textura y el logo del bar apenas marcado
    const feltMat = new THREE.MeshStandardMaterial({ color: 0x1d7a45, roughness: 1, map: feltTexture() });
    const felt = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.05, 64), [new THREE.MeshStandardMaterial({ color: 0x0f4a2a, roughness: 1 }), feltMat, feltMat]);
    felt.scale.set(RX - 0.05, 1, RZ - 0.05);
    felt.position.set(cx, 0.8, cz);
    felt.receiveShadow = true;
    scene.add(felt);
    // baranda de cuero acolchada: un tubo de grosor parejo sobre la elipse (el toro escalado se deformaba)
    const pts = [];
    for (let i = 0; i < 96; i++) { const a = (i / 96) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * RX, 0, Math.sin(a) * RZ)); }
    const railGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, 0.062, 12, true);
    railGeo.scale(1, 0.72, 1);
    const rail = new THREE.Mesh(railGeo, new THREE.MeshPhysicalMaterial({ color: 0x2b1510, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color(0x6a3a2a) }));
    rail.position.set(cx, 0.835, cz);
    rail.castShadow = true;
    rail.receiveShadow = true;
    scene.add(rail);
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 48), new THREE.MeshStandardMaterial({ color: 0x4a2a16, roughness: 0.55 }));
    wood.scale.set(RX + 0.05, 1, RZ + 0.05);
    wood.position.set(cx, 0.73, cz);
    wood.castShadow = true;
    scene.add(wood);
    b.cylinder('woodDark', cx, 0.36, cz, 0.18, 0.28, 0.72, 16, { collide: false });
    b.box('woodDark', cx, 0.04, cz, 1.4, 0.08, 0.7, { collide: false });
    b.phys.cylinder(cx, 0.42, cz, 0.42, 1.0, { mat: 'wood' });
    b.phys.box(cx, 0.42, cz, RX * 0.85, 0.42, RZ * 0.85, 0, { mat: 'wood', paint: false });
    // luz cálida sobre la mesa
    const l = new THREE.PointLight(0xffc27a, 6.5, 7, 1.7); // (más fuerte quemaba las sillas y los naipes)
    l.position.set(cx, 2.6, cz);
    scene.add(l);
    out.lights.push(l);
    if (placeModel(scene, 'd_hanging_lamp', cx, 2.72, cz, 0)) {
      // cable hasta el techo del bar
      b.cylinder('black', cx, 4.55, cz, 0.006, 0.006, 0.9, 4, { collide: false, noShadow: true });
    } else {
      const shade = new THREE.ConeGeometry(0.5, 0.3, 24, 1, true);
      shade.translate(cx, 2.85, cz);
      b.geo('darkgray', shade);
      lcyl(b, f, 'bulb', 0, 2.72, 0, 0.1, 0.1, 0.08, 10, { collide: false, noShadow: true });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const ex = Math.sin(a) * RX, ez = Math.cos(a) * RZ;
      const n = new THREE.Vector2(Math.sin(a) / RX, Math.cos(a) / RZ).normalize();
      const x = cx + ex + n.x * 0.55, z = cz + ez + n.y * 0.55;
      const yaw = Math.atan2(cx - x, cz - z);
      const cf = { p: [x, 0, z], r: yaw };
      // silla
      if (placeModel(scene, 'd_chair_wood', x, 0, z, yaw)) {
        out.seats.push({ x, y: 0.5, z, yaw, id: out.seats.length, poker: true, seatIndex: i, table: 'bar', center: [cx, 0.82, cz] });
        continue;
      }
      lbox(b, cf, 'woodDark', 0, 0.46, -0.02, 0.48, 0.06, 0.46, { collide: false });
      lbox(b, cf, 'leatherRed', 0, 0.5, -0.02, 0.44, 0.04, 0.42, { collide: false, noShadow: true });
      lbox(b, cf, 'woodDark', 0, 0.8, -0.24, 0.46, 0.62, 0.05, { collide: false });
      for (const [px, pz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.17], [0.2, 0.17]]) lbox(b, cf, 'woodDark', px, 0.22, pz, 0.05, 0.44, 0.05, { collide: false });
      out.seats.push({ x, y: 0.5, z, yaw, id: out.seats.length, poker: true, seatIndex: i, table: 'bar', center: [cx, 0.82, cz] });
    }
    out.pokerTables = out.pokerTables || [];
    // Altura real de la cara superior del cilindro del paño (0.8 + 0.05 / 2).
    out.pokerTables.push({ id: 'bar', center: new THREE.Vector3(cx, 0.825, cz), rx: RX, rz: RZ });
  },
  jukebox(f, b, scene, out) {
    // rockola retro (tipo Wurlitzer): gabinete laqueado con arco, tubos de luz que cambian de color,
    // vitrina con discos, botonera cromada y parlante
    const g = new THREE.Group();
    g.position.set(f.p[0], 0, f.p[2]);
    g.rotation.y = f.r;
    const wood = new THREE.MeshPhysicalMaterial({ color: 0x5a2410, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 1, roughness: 0.12 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6 });
    const tube = new THREE.MeshStandardMaterial({ color: 0x331a10, emissive: 0xff5a1a, emissiveIntensity: 1.35, roughness: 0.3 });
    const tube2 = tube.clone();
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
      m.castShadow = shadow; m.receiveShadow = true;
      g.add(m);
      return m;
    };
    // silueta: rectángulo con arco arriba, extruida
    const W = 1.0, H0 = 1.0, R = W / 2;
    const sh = new THREE.Shape();
    sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(W / 2, H0);
    sh.absarc(0, H0, R, 0, Math.PI, false);
    sh.lineTo(-W / 2, 0);
    const body = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 24 });
    body.translate(0, 0, -0.28);
    add(body, wood, 0, 0.02, 0);
    // tubos de luz: dos columnas y el arco
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.045, 0.045, H0 - 0.12, 16), s < 0 ? tube : tube2, s * (W / 2 - 0.02), 0.08 + (H0 - 0.12) / 2, 0.26, 0, 0, 0, false);
    add(new THREE.TorusGeometry(R - 0.02, 0.045, 12, 40, Math.PI), tube, 0, H0 - 0.04, 0.26, 0, 0, 0, false);
    // vitrina con discos (textura dibujada) y marco cromado
    let disc = null;
    if (typeof document !== 'undefined') {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
      const c = cv.getContext('2d');
      const gr = c.createRadialGradient(128, 150, 20, 128, 150, 180);
      gr.addColorStop(0, '#fff2c8'); gr.addColorStop(1, '#8a3a18');
      c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 9; i++) { // discos en fila, de canto
        const x = 30 + i * 25;
        c.fillStyle = '#111'; c.beginPath(); c.ellipse(x, 150, 8, 60, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = ['#d33', '#fc3', '#39f', '#3c6'][i % 4]; c.beginPath(); c.ellipse(x, 150, 3, 16, 0, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = 'bold 30px Georgia'; c.textAlign = 'center'; c.fillText('ROCKOLA', 128, 52);
      disc = new THREE.CanvasTexture(cv); disc.colorSpace = THREE.SRGBColorSpace;
    }
    const win = new THREE.MeshStandardMaterial({ map: disc, color: 0xffffff, emissive: 0xffffff, emissiveMap: disc, emissiveIntensity: 0.55, roughness: 0.1 });
    const winGeo = new THREE.CircleGeometry(0.36, 32, 0, Math.PI);
    add(new THREE.PlaneGeometry(0.72, 0.26), win, 0, 0.9, 0.255, 0, 0, 0, false).material = win;
    add(winGeo, win, 0, 1.03, 0.255, 0, 0, 0, false);
    add(new THREE.TorusGeometry(0.37, 0.018, 8, 32, Math.PI), chrome, 0, 1.03, 0.26);
    // botonera y ranura de monedas
    add(new THREE.BoxGeometry(0.72, 0.1, 0.06), dark, 0, 0.7, 0.25);
    for (let i = 0; i < 10; i++) add(new THREE.BoxGeometry(0.05, 0.035, 0.03), i % 2 ? chrome : new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe0a0, emissiveIntensity: 0.6 }), -0.3 + i * 0.066, 0.7, 0.285, 0, 0, 0, false);
    // parlante con rejilla
    add(new THREE.CircleGeometry(0.27, 32), dark, 0, 0.36, 0.256);
    for (let i = -4; i <= 4; i++) add(new THREE.BoxGeometry(0.5 - Math.abs(i) * 0.03, 0.012, 0.012), chrome, 0, 0.36 + i * 0.055, 0.265, 0, 0, 0, false);
    add(new THREE.TorusGeometry(0.28, 0.016, 8, 32), chrome, 0, 0.36, 0.262);
    // zócalo
    add(new THREE.BoxGeometry(W + 0.06, 0.06, 0.58), chrome, 0, 0.03, -0.02);
    scene.add(g);
    g.updateMatrixWorld(true);
    const [cx, cz] = tp(f, 0, 0);
    b.phys.box(cx, 0.75, cz, 0.52, 0.75, 0.3, f.r, { mat: 'wood', paint: false });
    const [x, z] = tp(f, 0, 0.6);
    const l = new THREE.PointLight(0xff4fa0, 5, 6, 1.8);
    l.position.set(x, 1.2, z);
    scene.add(l);
    out.lights.push(l);
    // colores que van rotando (como las rockolas de verdad)
    const c1 = new THREE.Color(), c2 = new THREE.Color();
    out.anim?.push((t) => {
      c1.setHSL((t * 0.05) % 1, 0.9, 0.55);
      c2.setHSL((t * 0.05 + 0.33) % 1, 0.9, 0.55);
      tube.emissive.copy(c1);
      tube2.emissive.copy(c2);
      l.color.copy(c1).lerp(c2, 0.5);
    });
  },
  bong(f, b, scene) {
    lbox(b, f, 'woodDark', 0, 0.35, 0, 0.6, 0.7, 0.6);
    const glass = new THREE.MeshStandardMaterial({ color: 0x3fd07a, roughness: 0.05, transparent: true, opacity: 0.55 });
    const [x, z] = tp(f, 0, 0);
    const g1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.14, 0.6, 16), glass);
    g1.position.set(x, 1.0, z);
    const g2 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), glass);
    g2.position.set(x, 0.82, z);
    const g3 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.22, 8), glass);
    g3.position.set(x + 0.1, 0.9, z);
    g3.rotation.z = -0.7;
    scene.add(g1, g2, g3);
  },
  couch(f, b, scene, out) {
    const n = f.seats || 3;
    if (lmodel(scene, f, f.dirty ? 'd_sofa_leather' : 'd_sofa', 0, 0, 0)) {
      const [x, z] = tp(f, 0, 0);
      b.phys.box(x, 0.25, z, 0.95, 0.25, 0.4, f.r, { mat: 'wood', paint: false });
      const [bx, bz] = tp(f, 0, -0.3);
      b.phys.box(bx, 0.55, bz, 0.95, 0.3, 0.12, f.r, { mat: 'wood', paint: false });
      seats(f, out, n, 0.6, 0.08, 0.5);
      return;
    }
    const L = n * 0.75 + 0.3;
    const key = f.dirty ? 'fabricBrown' : n === 3 ? 'fabricBlue' : 'fabricGreen';
    lbox(b, f, key, 0, 0.22, 0, L, 0.44, 0.9);
    lbox(b, f, key, 0, 0.7, -0.38, L, 0.6, 0.18, { collide: false });
    lbox(b, f, key, -L / 2 + 0.1, 0.55, 0, 0.2, 0.3, 0.9, { collide: false });
    lbox(b, f, key, L / 2 - 0.1, 0.55, 0, 0.2, 0.3, 0.9, { collide: false });
    for (let i = 0; i < n; i++) lbox(b, f, key, (i - (n - 1) / 2) * 0.75, 0.5, 0.05, 0.7, 0.12, 0.7, { collide: false });
    seats(f, out, n, 0.75, 0.1, 0.52);
  },
  lowtable(f, b, scene) {
    // mesita ratona: mesa redonda de madera más baja
    if (lmodel(scene, f, 'd_table_small', 0, 0, 0, 0, [1.15, 0.6, 1.15])) {
      const [x, z] = tp(f, 0, 0);
      b.phys.cylinder(x, 0.23, z, 0.23, 0.46, { mat: 'wood' });
      return;
    }
    lbox(b, f, 'wood', 0, 0.42, 0, 1.3, 0.06, 0.7);
    for (const [x, z] of [[-0.55, -0.28], [0.55, -0.28], [-0.55, 0.28], [0.55, 0.28]]) lbox(b, f, 'woodDark', x, 0.2, z, 0.06, 0.4, 0.06, { collide: false });
  },
  bench(f, b, scene, out) {
    const L = f.len || 3;
    if (hasAsset('d_bench')) {
      // bancos de madera pintada uno al lado del otro (1.165 m cada uno)
      const n = Math.max(1, Math.round(L / 1.2));
      const w = L / n;
      for (let i = 0; i < n; i++) lmodel(scene, f, 'd_bench', (i - (n - 1) / 2) * w, 0, 0, 0, [w / 1.165, 1, 1]);
      const [x, z] = tp(f, 0, 0);
      b.phys.box(x, 0.23, z, L / 2, 0.23, 0.24, f.r, { mat: 'wood', paint: false });
      seats(f, out, f.seats || 2, L / (f.seats || 2), 0.02, 0.5);
      return;
    }
    for (let i = 0; i < 3; i++) lbox(b, f, 'wood', 0, 0.45, -0.15 + i * 0.16, L, 0.05, 0.12, { collide: false });
    lbox(b, f, 'wood', 0, 0.75, -0.3, L, 0.12, 0.05, { collide: false });
    for (const x of [-L / 2 + 0.2, L / 2 - 0.2]) lbox(b, f, 'black', x, 0.22, 0, 0.08, 0.45, 0.45, { collide: false });
    const [x, z] = tp(f, 0, 0);
    b.phys.box(x, 0.24, z, L / 2, 0.24, 0.25, f.r);
    seats(f, out, f.seats || 2, L / (f.seats || 2), 0.02, 0.5);
  },
  weaponrack(f, b) {
    lbox(b, f, 'woodDark', 0, 2.0, 0.28, 4.8, 1.6, 0.1, { collide: false });
    lbox(b, f, 'wood', 0, 0.87, -0.35, 4.8, 0.06, 0.8);
    for (const x of [-2.2, 0, 2.2]) lbox(b, f, 'woodDark', x, 0.42, -0.35, 0.08, 0.84, 0.7, { collide: false });
  },
  ringposts(f, b) {
    const S = (f.size || 9) / 2;
    const cols = ['rope', 'ropeB', 'rope', 'ropeB'];
    const corners = [[-S, -S], [S, -S], [S, S], [-S, S]];
    corners.forEach(([lx, lz], i) => {
      lcyl(b, f, cols[i], lx, 0.8, lz, 0.1, 0.12, 1.6, 10, { collide: true });
    });
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const len = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(bx - ax, bz - az);
      for (const [y, k] of [[0.5, 'rope'], [0.9, 'ropeW'], [1.3, 'ropeB']]) {
        const [x, z] = tp(f, mx, mz);
        b.cylinder(k, x, y, z, 0.025, 0.025, len, 6, { rx: Math.PI / 2, yaw: yaw + f.r, collide: false });
      }
    }
  },
  lamp_bar(f, b) {
    lcyl(b, f, 'black', 0, f.p[1] - 0.4, 0, 0.01, 0.01, 0.8, 4, { collide: false });
    const shade = new THREE.ConeGeometry(0.45, 0.35, 16, 1, true);
    shade.translate(f.p[0], f.p[1] - 0.9, f.p[2]);
    b.geo('darkgray', shade);
    lcyl(b, f, 'bulb', 0, f.p[1] - 1.02, 0, 0.1, 0.1, 0.1, 8, { collide: false, noShadow: true });
  },
  neon(f, b, scene, out) {
    const col = f.color || '#ff3b6b';
    const tex = textTexture(f.text, { w: 512, h: 192, size: 150, color: '#fff', glow: col, font: '"Brush Script MT", "Segoe Script", cursive' });
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.97),
      new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(col).multiplyScalar(2.2), transparent: true, depthWrite: false, toneMapped: false }),
    );
    m.position.set(f.p[0] - 0.25, f.p[1], f.p[2]);
    m.rotation.y = f.r;
    scene.add(m);
    const l = new THREE.PointLight(new THREE.Color(col), 4, 7, 1.8);
    l.position.set(f.p[0] - 1, f.p[1], f.p[2]);
    scene.add(l);
    out.lights.push(l);
    out.flicker.push({ mesh: m, light: l, base: 4, seed: Math.random() * 100 });
  },
  cineseat(f, b, scene, out) {
    if (typeof document !== 'undefined') {
      instanced('cineseat', cinemaSeatParts, f.p[0], f.p[1], f.p[2], f.r);
      const [x, z] = tp(f, 0, -0.05);
      b.phys.box(x, 0.3, z, 0.34, 0.3, 0.3, f.r, { paint: false });
      seats(f, out, 1, 0, 0.02, 0.46);
      return;
    }
    lbox(b, f, 'leatherRed', 0, 0.35, 0, 0.62, 0.18, 0.55, { collide: false });
    lbox(b, f, 'leatherRed', 0, 0.72, -0.26, 0.62, 0.7, 0.1, { collide: false });
    lbox(b, f, 'black', -0.33, 0.45, 0, 0.06, 0.5, 0.55, { collide: false });
    lbox(b, f, 'black', 0.33, 0.45, 0, 0.06, 0.5, 0.55, { collide: false });
    const [x, z] = tp(f, 0, -0.05);
    b.phys.box(x, 0.3, z, 0.34, 0.3, 0.3, f.r, { paint: false });
    seats(f, out, 1, 0, 0.02, 0.46);
  },
  candybar(f, b, scene) {
    const L = f.len || 4;
    lbox(b, f, 'red', 0, 0.5, 0, L, 1.0, 0.7);
    lbox(b, f, 'chrome', 0, 1.03, 0, L + 0.1, 0.06, 0.8, { collide: false });
    lbox(b, f, 'glass', -L / 2 + 0.6, 1.4, 0, 0.8, 0.7, 0.6, { collide: false });
    lbox(b, f, 'yellow', -L / 2 + 0.6, 1.2, 0, 0.7, 0.2, 0.5, { collide: false });
    const t = textTexture('POCHOCLOS', { w: 512, h: 128, size: 90, color: '#ffd23b', bg: '#a01818' });
    const m = readableSign(t, 2.4, .6);
    m.name = 'cinema-popcorn-sign';
    const [x, z] = tp(f, 0, 0);
    m.position.set(x, 2.3, z);
    m.rotation.y = f.r;
    scene.add(m);
  },
  dumpster(f, b) {
    lbox(b, f, 'dumpsterMetal', 0, 0.78, 0, 2.2, 1.2, 1.2);
    lbox(b, f, 'darkgray', 0, 1.43, -0.03, 2.25, 0.08, 1.25, { collide: false, rx: -0.05 });
    for (const z of [-0.62, 0.62]) {
      for (const y of [0.22, 1.33]) lbox(b, f, 'dumpsterMetal', 0, y, z, 2.24, 0.065, 0.055, { collide: false });
      for (const x of [-0.75, -0.25, 0.25, 0.75]) lbox(b, f, 'dumpsterMetal', x, 0.77, z, 0.035, 1.1, 0.045, { collide: false });
    }
    for (const x of [-0.86, 0.86]) for (const z of [-0.43, 0.43]) lcyl(b, f, 'black', x, 0.12, z, 0.12, 0.12, 0.065, 10, { rx: Math.PI / 2, collide: false });
    for (const x of [-0.6, 0.6]) lbox(b, f, 'darkgray', x, 1.5, 0.1, 0.32, 0.055, 0.055, { collide: false });
  },
  barrel_fire(f, b, scene, out) {
    if (lmodel(scene, f, 'd_barrel_stove', 0, 0, 0)) {
      const [x, z] = tp(f, 0, 0);
      b.phys.cylinder(x, 0.47, z, 0.47, 0.3, { mat: 'metal' });
    } else lcyl(b, f, 'metal', 0, 0.45, 0, 0.3, 0.3, 0.9, 14, { collide: true });
    const l = new THREE.PointLight(0xff7a2a, 8, 9, 1.6);
    l.position.set(f.p[0], 1.4, f.p[2]);
    scene.add(l);
    out.lights.push(l);
    out.flicker.push({ light: l, base: 8, seed: Math.random() * 100, fire: true });
    out.emitters.push({ kind: 'fire', x: f.p[0], y: 0.95, z: f.p[2], rate: 14 });
  },
  car(f, b, scene) {
    const col = new THREE.MeshStandardMaterial({ color: f.color || 0x3a6ea5, roughness: 0.35, metalness: 0.5 });
    const [x, z] = tp(f, 0, 0);
    if (placeModel(scene, 'd_covered_car', x, 0, z, f.r)) {
      b.phys.box(x, 0.65, z, 0.9, 0.65, 2.2, f.r, { mat: 'metal', paint: false });
      return;
    }
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4.2), col);
    body.position.y = 0.65;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), col);
    cab.position.set(0, 1.28, -0.2);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.45, 2.0), new THREE.MeshStandardMaterial({ color: 0x1a2530, roughness: 0.1, metalness: 0.6 }));
    win.position.set(0, 1.3, -0.2);
    g.add(body, cab, win);
    const wg = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 16);
    wg.rotateZ(Math.PI / 2);
    const wm = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    for (const [wx, wz] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) {
      const w = new THREE.Mesh(wg, wm);
      w.position.set(wx, 0.34, wz);
      g.add(w);
    }
    for (const s of [-0.6, 0.6]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffcc, emissiveIntensity: 0.5 }));
      hl.position.set(s, 0.75, 2.11);
      g.add(hl);
    }
    g.position.set(x, 0, z);
    g.rotation.y = f.r;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    b.phys.box(x, 0.8, z, 0.9, 0.8, 2.1, f.r, { mat: 'metal', paint: false });
  },
  paredon(f, b) {
    lbox(b, f, 'concrete', 0, (f.h || 3) / 2, 0, f.len || 10, f.h || 3, 0.3);
    lbox(b, f, 'concrete', 0, (f.h || 3) + 0.08, 0, (f.len || 10) + 0.2, 0.16, 0.42, { collide: false });
  },
  billboard(f, b, scene) {
    const w = f.w || 12, h = f.h || 5;
    for (const lx of [-w / 3, w / 3]) lbox(b, f, 'darkgray', lx, 3.5, 0.3, 0.35, 7, 0.35);
    lbox(b, f, 'darkgray', 0, 6, 0.2, w + 0.4, h + 0.4, 0.3, { collide: false });
    // A real framed sign, with rear structural rails instead of a blank slab.
    for (const y of [6-h*.35,6,6+h*.35]) lbox(b,f,'metal',0,y,.015,w,.08,.08,{collide:false});
    const [x,z]=tp(f,0,.365);
    const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=640;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#243b3b';ctx.fillRect(0,0,1536,640);
    ctx.strokeStyle='#c6aa76';ctx.lineWidth=8;ctx.strokeRect(24,24,1488,592);
    ctx.textAlign='center';ctx.fillStyle='#eee3ca';ctx.font='bold 180px Georgia';ctx.fillText('DESMADRE',768,265);
    ctx.font='64px Georgia';ctx.fillText('ESTA NOCHE · AUTOCINE',768,400);
    ctx.font='40px Georgia';ctx.fillText('ENTRADA LIBRE',768,505);
    for(let i=0;i<2400;i++) {
      const x=(i*593)%1536,y=(i*227)%640;
      ctx.fillStyle=i%3?'rgba(9,20,20,.08)':'rgba(238,227,202,.08)';ctx.fillRect(x,y,2+i%4,1+i%3);
    }
    const poster=new THREE.CanvasTexture(canvas);poster.colorSpace=THREE.SRGBColorSpace;poster.anisotropy=4;
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:poster,roughness:.93}));
    panel.position.set(x,6,z);panel.rotation.y=f.r;scene.add(panel);
    lbox(b, f, 'darkgray', 0, 3.3, -0.4, w, 0.08, 0.9, { collide: false });
  },
  cooler(f, b, scene) {
    lbox(b, f, 'red', 0, 0.28, 0, 0.8, 0.56, 0.5);
    lbox(b, f, 'white', 0, 0.6, 0, 0.84, 0.1, 0.54, { collide: false });
  },
  grill(f, b, scene, out) {
    lbox(b, f, 'brick', 0, 0.45, 0, 2.2, 0.9, 1.0);
    lbox(b, f, 'black', 0, 0.93, 0.05, 1.9, 0.04, 0.8, { collide: false });
    lbox(b, f, 'brick', 0, 1.6, -0.45, 2.2, 1.4, 0.2);
    lbox(b, f, 'brick', 0, 2.6, -0.3, 0.6, 1.2, 0.5);
    lbox(b, f, 'orange', 0, 0.91, 0.05, 1.7, 0.02, 0.7, { collide: false, noShadow: true });
    out.emitters.push({ kind: 'grill', x: f.p[0], y: 1.0, z: f.p[2], rate: 6 });
    // chorizos en la parrilla
    for (let i = 0; i < 5; i++) {
      const [x, z] = tp(f, -0.6 + i * 0.3, 0.1);
      b.cylinder('terracotta', x, 0.98, z, 0.035, 0.035, 0.26, 6, { rx: Math.PI / 2, yaw: f.r, collide: false });
    }
  },
  fountain(f, b, scene, out) {
    const R = f.r2 || 4.2;
    const [cx, cz] = [f.p[0], f.p[2]];
    // borde (anillo de cajas con collider) y piso interno
    const n = 24;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.sin(a) * (R - 0.2), z = cz + Math.cos(a) * (R - 0.2);
      b.box('stone', x, 0.35, z, 0.45, 0.7, (2 * Math.PI * R) / n + 0.08, { yaw: a + Math.PI / 2 });
    }
    b.box('stone', cx, 0.12, cz, R * 1.6, 0.25, R * 1.6, { collide: true });
    const water = new THREE.Mesh(new THREE.CircleGeometry(R - 0.35, 48), waterMaterial(3));
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, 0.55, cz);
    water.receiveShadow = true;
    scene.add(water);
    // agua en el plato de arriba y cortina que cae al estanque
    const top = new THREE.Mesh(new THREE.CircleGeometry(1.28, 32), waterMaterial(1));
    top.rotation.x = -Math.PI / 2;
    top.position.set(cx, 1.88, cz);
    scene.add(top);
    if (typeof document !== 'undefined') {
      const curtain = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.62, 1.3, 48, 1, true), curtainMaterial());
      curtain.position.set(cx, 1.22, cz);
      curtain.renderOrder = 2;
      scene.add(curtain);
    }
    out.emitters.push({ kind: 'fountain', x: cx, y: 3.62, z: cz, rate: 55, r: 0.12, up: 1.9 });
    b.cylinder('stone', cx, 1.1, cz, 0.35, 0.5, 2.2, 12, { collide: true });
    b.cylinder('stone', cx, 1.75, cz, 1.4, 0.9, 0.3, 16, { collide: false });
    b.cylinder('stone', cx, 2.6, cz, 0.18, 0.25, 1.4, 10, { collide: false });
    b.cylinder('stone', cx, 3.3, cz, 0.6, 0.3, 0.2, 12, { collide: false });
    const u = new THREE.SphereGeometry(0.25, 12, 8);
    u.translate(cx, 3.55, cz);
    b.geo('gold', u);
  },
  autocine() {},
  lamp_bar(f, b, scene, out) {
    // lámpara industrial colgando del techo (el modelo cuelga 1.34 m desde su origen)
    // el modelo mide 1.36 m con el cable: su base queda 1.26 m por debajo del techo (f.p[1])
    if (!placeModel(scene, 'd_hanging_lamp', f.p[0], f.p[1] - 1.26, f.p[2], f.r) || f.nolight) return;
    const l = new THREE.PointLight(0xffc98a, 9, 11, 1.6);
    l.position.set(f.p[0], f.p[1] - 1.32, f.p[2]);
    scene.add(l);
    out.lights.push(l);
  },
  decor(f, b, scene, out) {
    // modelo decorativo genérico: { m, s, col: [hx, hy, hz] | { r, h } , light }
    if (!placeModel(scene, f.m, f.p[0], f.p[1], f.p[2], f.r, f.s || 1)) return;
    if (f.col) {
      if (Array.isArray(f.col)) b.phys.box(f.p[0], f.p[1] + f.col[1], f.p[2], f.col[0], f.col[1], f.col[2], f.r, { paint: false });
      else b.phys.cylinder(f.p[0], f.p[1] + f.col.h / 2, f.p[2], f.col.h / 2, f.col.r);
    }
    if (f.light) {
      const [lx, ly, lz] = f.light.at || [0, 1, 0];
      const [wx, wz] = tp(f, lx, lz);
      const l = new THREE.PointLight(f.light.color || 0xffc98a, f.light.i || 6, f.light.d || 9, 1.7);
      l.position.set(wx, f.p[1] + ly, wz);
      scene.add(l);
      out.lights.push(l);
      if (f.light.flicker) out.flicker.push({ light: l, base: f.light.i || 6, seed: Math.random() * 100, fire: true });
    }
    if (f.fire) out.emitters.push({ kind: 'fire', x: f.p[0], y: f.p[1] + f.fire, z: f.p[2], rate: 12 });
  },
  fuelpump(f, b) {
    lbox(b, f, 'red', 0, 0.9, 0, 0.7, 1.8, 0.5);
    lbox(b, f, 'white', 0, 1.3, 0.26, 0.5, 0.4, 0.02, { collide: false });
    lbox(b, f, 'black', 0.4, 1.0, 0, 0.1, 0.1, 0.1, { collide: false });
  },
  workbench(f, b) {
    const L = f.len || 4;
    lbox(b, f, 'wood', 0, 0.9, 0, L, 0.08, 0.8);
    for (const x of [-L / 2 + 0.1, L / 2 - 0.1]) lbox(b, f, 'darkgray', x, 0.45, 0, 0.08, 0.9, 0.7, { collide: false });
    lbox(b, f, 'darkgray', 0, 1.8, -0.38, L, 1.6, 0.05, { collide: false });
    for (let i = 0; i < 6; i++) lbox(b, f, i % 2 ? 'red' : 'chrome', -L / 2 + 0.5 + i * 0.6, 1.8, -0.33, 0.08, 0.5, 0.04, { collide: false });
  },
  ramp(f, b) {
    const w = f.w || 4, l = f.l || 6, h = f.h || 1.5;
    // cuña: sube hacia +Z local
    const shape = new THREE.Shape();
    shape.moveTo(-l / 2, 0);
    shape.lineTo(l / 2, 0);
    shape.lineTo(l / 2, h);
    shape.lineTo(-l / 2, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    // la forma está en XY; la giramos para que el largo quede en Z y el ancho en X
    g.translate(0, 0, -w / 2);
    g.rotateY(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.3, uv.getY(i) * 0.3);
    const m = new THREE.Matrix4().makeRotationY(f.r).setPosition(f.p[0], 0, f.p[2]);
    b.geo('wood', g, m);
    b.phys.wedge(f.p[0], 0, f.p[2], w, l, h, f.r, { mat: 'wood' });
  },
};
