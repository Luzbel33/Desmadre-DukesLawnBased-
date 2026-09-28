// Biblioteca de modelos 3D (Poly Haven CC0 y otros): se precargan y se clonan por tipo.
// Cada entrada se normaliza al tamaño físico del objeto (base en y=0, centrado en XZ).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// tipo -> { url, height (m) | width | length | scale, rotX/Y/Z, yOff, center (default true), tint }
export const MANIFEST = {};
const LIB = new Map();

export function registerManifest(entries) { Object.assign(MANIFEST, entries); }

function normalize(scene, e) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  let s = e.scale || 1;
  if (e.height) s = e.height / Math.max(1e-4, size.y);
  else if (e.width) s = e.width / Math.max(1e-4, Math.max(size.x, size.z));
  else if (e.length) s = e.length / Math.max(1e-4, Math.max(size.x, size.y, size.z));
  const center = box.getCenter(new THREE.Vector3());
  const wrap = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(scene);
  // center:false conserva el origen del modelo en XZ (mangos de herramientas, sartén, etc.)
  if (e.center === false) scene.position.set(0, -box.min.y, 0);
  else scene.position.set(-center.x, -box.min.y, -center.z);
  inner.scale.setScalar(s);
  if (e.rotX) inner.rotation.x = e.rotX;
  if (e.rotY) inner.rotation.y = e.rotY;
  if (e.rotZ) inner.rotation.z = e.rotZ;
  inner.position.y = e.yOff || 0;
  wrap.add(inner);
  wrap.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = e.shadow !== false;
    o.receiveShadow = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (e.roughness !== undefined) m.roughness = e.roughness;
      // la transmisión (vidrio real) fuerza un render extra de toda la escena: la cambiamos por transparencia común
      if (m.transmission > 0) {
        m.transmission = 0;
        m.transparent = true;
        m.opacity = Math.min(m.opacity, 0.55);
        m.roughness = Math.min(m.roughness, 0.12);
        m.depthWrite = false;
        // vidrio de botella: más opaco y del color pedido (verde oscuro por defecto en las botellas)
        if (e.glass !== undefined) {
          m.color.setHex(e.glass);
          m.opacity = e.glassOpacity ?? 0.86;
          m.userData.glass = true;
        }
      }
      if (e.tint) m.color.multiply(new THREE.Color(e.tint));
      if (m.map) m.map.anisotropy = 4;
      // los modelos de Poly Haven vienen doubleSided; de un solo lado es más barato y evita acné de sombras
      if (e.single !== false && !m.transparent && m.alphaTest === 0) m.side = THREE.FrontSide;
    }
  });
  return wrap;
}

export async function preloadAssets(onProgress) {
  const loader = new GLTFLoader();
  const keys = Object.keys(MANIFEST);
  let done = 0;
  await Promise.all(keys.map(async (k) => {
    const e = MANIFEST[k];
    try {
      const gltf = await loader.loadAsync(e.url);
      LIB.set(k, normalize(gltf.scene, e));
    } catch (err) {
      console.warn('No se pudo cargar el modelo', k, e.url, err?.message || err);
    }
    done++;
    onProgress && onProgress(done, keys.length);
  }));
}

export function hasAsset(type) { return LIB.has(type); }

// Modelos que no hacen falta para arrancar (los del castillo): se cargan en segundo plano después de construir
// el mundo; whenAsset(tipo, fn) corre fn apenas el modelo está (o enseguida si ya estaba).
const WAIT = new Map();
export function whenAsset(type, fn) {
  if (LIB.has(type)) { fn(); return; }
  if (!WAIT.has(type)) WAIT.set(type, []);
  WAIT.get(type).push(fn);
}
export function loadAssetsLater(entries) {
  registerManifest(entries);
  if (typeof document === 'undefined') return Promise.resolve(); // Node (tests): sin modelos
  const loader = new GLTFLoader();
  return Promise.all(Object.keys(entries).map(async (k) => {
    try {
      const gltf = await loader.loadAsync(entries[k].url);
      LIB.set(k, normalize(gltf.scene, entries[k]));
    } catch (err) {
      console.warn('No se pudo cargar el modelo', k, entries[k].url, err?.message || err);
    }
    const w = WAIT.get(k);
    WAIT.delete(k);
    if (w && LIB.has(k)) for (const fn of w) { try { fn(); } catch (e) { console.warn('modelo', k, e); } }
  }));
}

// Clon del modelo (comparte geometría y materiales)
export function assetModel(type) {
  const src = LIB.get(type);
  if (!src) return null;
  const m = src.clone(true);
  m.userData.asset = type; // lo usa el descarte por distancia/zona (world/culler.js)
  return m;
}

// Clon con materiales propios (para teñir o pintar sin afectar a los demás)
export function assetModelUnique(type) {
  const m = assetModel(type);
  if (!m) return null;
  m.traverse((o) => {
    if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((x) => x.clone()) : o.material.clone();
  });
  return m;
}

// Muchas copias de un modelo con pocas llamadas de dibujo (una por sub-malla). matrices: Matrix4[]
export function instanceModel(scene, type, matrices, glassTints = null, filter = null) {
  const src = LIB.get(type);
  if (!src || !matrices.length) return null;
  src.updateMatrixWorld(true);
  const out = [];
  const M = new THREE.Matrix4();
  src.traverse((o) => {
    if (!o.isMesh) return;
    if (filter && !filter(o)) return;
    const im = new THREE.InstancedMesh(o.geometry, o.material, matrices.length);
    for (let i = 0; i < matrices.length; i++) im.setMatrixAt(i, M.multiplyMatrices(matrices[i], o.matrixWorld));
    // variedad de colores solo en el vidrio (etiquetas y corchos quedan igual)
    if (glassTints && o.material.userData?.glass) for (let i = 0; i < matrices.length; i++) im.setColorAt(i, glassTints[i % glassTints.length]);
    im.castShadow = o.castShadow;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    scene.add(im);
    out.push(im);
  });
  return out;
}

// Instancia estática en el mundo (no se mueve: sin recalcular matrices cada frame)
export function placeModel(scene, type, x, y, z, yaw = 0, scale = 1) {
  const m = assetModel(type);
  if (!m) return null;
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  if (typeof scale === 'number') m.scale.setScalar(scale);
  else m.scale.set(scale[0], scale[1], scale[2]);
  scene.add(m);
  m.updateMatrixWorld(true);
  m.traverse((o) => { o.matrixAutoUpdate = false; });
  return m;
}
