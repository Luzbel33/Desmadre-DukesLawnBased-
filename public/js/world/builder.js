// Ayudante para construir geometría estática: agrupa por material, fusiona y crea colliders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TEX } from './textures.js';
import { patchSurface, setSurfaceDisp } from './surface.js';

const MATS = new Map();

// Pisos decorativos finos (sin collider): la pintura del piso se apoya en su cara superior
const FLOORS = [];
export function floorTopAt(x, z) {
  let top = 0;
  for (const f of FLOORS) {
    const dx = x - f.x, dz = z - f.z;
    const lx = dx * f.c - dz * f.s, lz = dx * f.s + dz * f.c;
    if (Math.abs(lx) <= f.hx && Math.abs(lz) <= f.hz && f.top > top) top = f.top;
  }
  return top;
}

// Texturas PBR reales (Poly Haven, CC0) que reemplazan a las procedurales cuando terminan de cargar
// size: metros reales que cubre una repetición de la textura
const PBR = {
  brick: { id: 'brick_wall_001', tint: 0xf0e6e0, size: 3 },
  plaster: { id: 'painted_plaster_wall', tint: 0xf2e9dc, size: 2 },
  wood: { id: 'wood_floor_worn', tint: 0xffffff, size: 2 },
  woodDark: { id: 'brown_planks_03', tint: 0x9a7a62, size: 1 },
  carpet: { id: 'dirty_carpet', tint: 0xc05060, size: 0.6 },
  asphalt: { id: 'asphalt_02', tint: 0xffffff, size: 3 },
  concrete: { id: 'concrete_floor_01', tint: 0xffffff, size: 2 },
  gravel: { id: 'gravel_floor', tint: 0xffffff, size: 2.25 },
  paving: { id: 'cobblestone_floor_01', tint: 0xffffff, size: 1 },
  roof: { id: 'grey_roof_tiles', tint: 0xffffff, size: 3 },
  metal: { id: 'rusty_corrugated_iron', tint: 0xffffff, size: 2 },
  dirt: { id: 'dirt', tint: 0xffffff, size: 2 },
  stone: { id: 'stacked_stone_wall', tint: 0xffffff, size: 2 },
  // castillo del terror (rough: multiplica el mapa de rugosidad; < 1 = mojado por la lluvia)
  castleStone: { id: 'stone_wall_04', tint: 0xa4a7a2, size: 3.4, ao: 1, disp: 0.055, weather: [0.9, 0.8, 0.5, 0.8], wet: 0.5 },
  keepStone: { id: 'castle_wall_varriation', tint: 0x9c9c94, size: 3.2, ao: 1, disp: 0.05, weather: [0.8, 0.9, 0.35, 0.8], wet: 0.45 },
  slate: { id: 'roof_slates_03', tint: 0x9aa2ac, size: 2.4, rough: 0.7, ao: 1, disp: 0.025, weather: [0, 0.4, 0.35, 0.6], wet: 0.6 },
  cobble: { id: 'mossy_cobblestone', tint: 0x9a9a92, size: 2.6, rough: 0.55, ao: 1, disp: 0.04, weather: [0.4, 0, 0.7, 0.7], wet: 0.9 },
  mud: { id: 'brown_mud_leaves_01', tint: 0x8c7c6c, size: 3.2, rough: 0.75, ao: 1, disp: 0.035, weather: [0, 0, 0, 0.6], wet: 0.8 },
  flagstone: { id: 'monastery_stone_floor', tint: 0xa8a298, size: 2.8, ao: 1, disp: 0.022, weather: [0.25, 0, 0.1, 0.5], wet: 0 },
  oldWood: { id: 'old_wood_floor', tint: 0xa88c74, size: 2.4, ao: 1, disp: 0.008, weather: [0.2, 0, 0, 0.5], wet: 0 },
  moldy: { id: 'rough_plaster_brick_02', tint: 0x8e8478, size: 2.8, ao: 1, disp: 0.025, weather: [0.6, 0.6, 0.2, 0.7], wet: 0 },
  doorWood: { id: 'medieval_wood', tint: 0x9a8472, size: 1.8, ao: 1, disp: 0.012, weather: [0.2, 0.3, 0, 0.3], wet: 0.2 },
  velvet: { id: 'velour_velvet', tint: 0x9a1a24, size: 0.9 },
  cryptBrick: { id: 'mossy_brick', tint: 0x8c8c82, size: 2.2, ao: 1, disp: 0.03, weather: [0.6, 0.4, 0.6, 0.6], wet: 0 },
};
const loader = new THREE.TextureLoader();
// cargas en curso: la pantalla de carga espera a que terminen (si no, al entrar se ven las texturas provisorias)
const PENDING = [];
export function pbrReady() { return Promise.allSettled(PENDING); }
export function pbrMaps(id, repeatFrom = null, cb = null, extra = {}) {
  if (typeof document === 'undefined') return Promise.resolve({}); // Node (tests): sin imágenes
  const p = pbrMapsLoad(id, repeatFrom, cb, extra);
  PENDING.push(p);
  return p;
}
function pbrMapsLoad(id, repeatFrom, cb, extra) {
  const load = (kind, srgb) => new Promise((resolve) => {
    loader.load(`assets/tex/${id}_${kind}.jpg`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      if (repeatFrom) t.repeat.copy(repeatFrom);
      resolve(t);
    }, undefined, () => resolve(null));
  });
  const none = () => Promise.resolve(null);
  return Promise.all([load('color', true), load('normal', false), load('rough', false), extra.ao ? load('ao', false) : none(), extra.disp ? load('disp', false) : none()]).then(([map, normalMap, roughnessMap, aoMap, dispMap]) => {
    const r = { map, normalMap, roughnessMap, aoMap, dispMap };
    cb && cb(r);
    return r;
  });
}
function upgrade(m, key) {
  const d = PBR[key];
  if (!d) return;
  // las UV de las cajas están en "metros / tile": escalamos para que la textura cubra su tamaño real
  const rep = new THREE.Vector2(m.userData.tileU / d.size, m.userData.tileV / d.size);
  // relieve y desgaste desde el primer compilado (con la textura de relieve en blanco no corre nada)
  if (d.disp || d.weather) patchSurface(m, { pom: (d.disp || 0) / d.size, weather: d.weather, wet: d.wet ?? 0 });
  pbrMaps(d.id, rep, ({ map, normalMap, roughnessMap, aoMap, dispMap }) => {
    if (!map) return;
    m.map = map;
    if (normalMap) { m.normalMap = normalMap; m.normalScale.set(1, 1); }
    if (roughnessMap) { m.roughnessMap = roughnessMap; m.roughness = d.rough ?? 1; }
    if (aoMap) { m.aoMap = aoMap; m.aoMapIntensity = 1; }
    if (dispMap) setSurfaceDisp(m, dispMap);
    m.color.setHex(d.tint);
    m.needsUpdate = true;
  }, { ao: d.ao, disp: !!d.disp });
}

// Materiales con textura: la escala de UV es "metros por repetición".
const TEXMATS = {
  brick: { tex: 'brick', rough: 0.95, tile: 3 },
  plaster: { tex: 'plaster', rough: 0.95, tile: 3 },
  stone: { tex: 'stone', rough: 0.9, tile: 4 },
  wood: { tex: 'wood', rough: 0.75, tile: 3 },
  woodDark: { tex: 'woodDark', rough: 0.6, tile: 1.5 },
  tiles: { tex: 'tiles', rough: 0.5, tile: 2.4 },
  roof: { tex: 'roof', rough: 0.85, tile: 3 },
  metal: { tex: 'metal', rough: 0.6, metal: 0.4, tile: 3 },
  concrete: { tex: 'concrete', rough: 0.95, tile: 4 },
  carpet: { tex: 'carpet', rough: 1, tile: 2 },
  paving: { tex: 'paving', rough: 0.9, tile: 4 },
  felt: { tex: 'felt', rough: 1, tile: 1 },
  bark: { tex: 'bark', rough: 1, tile: 1.5 },
  hedge: { tex: 'hedge', rough: 1, tile: 2 },
  asphalt: { tex: 'asphalt', rough: 0.95, tile: 6 },
  gravel: { tex: 'gravel', rough: 1, tile: 4 },
  dirt: { tex: 'dirt', rough: 1, tile: 5 },
  facade: { tex: 'mansionFacade', rough: 0.9, tileU: 4, tileV: 14 },
  castleStone: { tex: 'stone', rough: 0.9, tile: 3.4 },
  keepStone: { tex: 'stone', rough: 0.9, tile: 3.2 },
  slate: { tex: 'roof', rough: 0.8, tile: 2.4 },
  cobble: { tex: 'paving', rough: 0.7, tile: 2.6 },
  mud: { tex: 'dirt', rough: 0.9, tile: 3.2 },
  flagstone: { tex: 'paving', rough: 0.85, tile: 2.8 },
  oldWood: { tex: 'wood', rough: 0.75, tile: 2.4 },
  moldy: { tex: 'plaster', rough: 0.95, tile: 3.2 },
  doorWood: { tex: 'woodDark', rough: 0.7, tile: 1.8 },
  velvet: { tex: 'carpet', rough: 1, tile: 0.9 },
  cryptBrick: { tex: 'brick', rough: 0.95, tile: 2.2 },
};
const COLORMATS = {
  white: { color: 0xd8d4ca, rough: 0.8 },
  cream: { color: 0xcdc3a8, rough: 0.85 },
  black: { color: 0x151515, rough: 0.7 },
  darkgray: { color: 0x2c2d31, rough: 0.8 },
  gray: { color: 0x7a7b80, rough: 0.8 },
  red: { color: 0x9c1c22, rough: 0.6 },
  green: { color: 0x2f6b3a, rough: 0.7 },
  gold: { color: 0xc9a13b, rough: 0.35, metal: 0.8 },
  chrome: { color: 0xd8dde2, rough: 0.2, metal: 1 },
  glass: { color: 0x1a2530, rough: 0.08, metal: 0.6 },
  rope: { color: 0xd23a3a, rough: 0.8 },
  ropeW: { color: 0xeeeeee, rough: 0.8 },
  ropeB: { color: 0x2a4bd0, rough: 0.8 },
  leather: { color: 0x5a2a1a, rough: 0.6 },
  leatherRed: { color: 0x8a1c24, rough: 0.55 },
  fabricBlue: { color: 0x2b4a7a, rough: 1 },
  fabricGreen: { color: 0x3b5b2a, rough: 1 },
  fabricBrown: { color: 0x6b4a2a, rough: 1 },
  water: { color: 0x3a6a80, rough: 0.05, metal: 0.3 },
  screenBlack: { color: 0x050505, rough: 0.9 },
  bulb: { color: 0xfff1c4, emissive: 0xffd58a, emissiveIntensity: 3 },
  neonPink: { color: 0xff3b6b, emissive: 0xff3b6b, emissiveIntensity: 4 },
  neonYellow: { color: 0xffd23b, emissive: 0xffd23b, emissiveIntensity: 4 },
  lamp: { color: 0xfff6d8, emissive: 0xffe0a0, emissiveIntensity: 2.5 },
  terracotta: { color: 0xa85a36, rough: 0.9 },
  bronze: { color: 0x8a6a3a, rough: 0.4, metal: 0.8 },
  pink: { color: 0xd98ba0, rough: 0.8 },
  yellow: { color: 0xe0b020, rough: 0.6 },
  orange: { color: 0xe06a1b, rough: 0.6 },
  // castillo del terror
  iron: { color: 0x2a2b30, rough: 0.5, metal: 0.85 },
  rust: { color: 0x4a3224, rough: 0.8, metal: 0.45 },
  bone: { color: 0xd4cab2, rough: 0.6 },
  wax: { color: 0xe8dcc0, rough: 0.5 },
  darkGlass: { color: 0x0a0d13, rough: 0.1, metal: 0.35 },
  winGlow: { color: 0x140a04, emissive: 0xff9a44, emissiveIntensity: 1.5 },
  winCold: { color: 0x080b12, rough: 0.15, metal: 0.3, emissive: 0x2c4468, emissiveIntensity: 0.18 },
  blackWood: { color: 0x221a14, rough: 0.8 },
  banner: { color: 0x4a0c12, rough: 0.95 },
  linen: { color: 0xb8b0a0, rough: 0.95 },
  moss: { color: 0x34421e, rough: 1 },
  ash: { color: 0x24201e, rough: 1 },
  ember: { color: 0x2a0c06, emissive: 0xff4a10, emissiveIntensity: 2.4 },
  hay: { color: 0x8a7440, rough: 1 },
  hemp: { color: 0x3a2c1e, rough: 1 }, // soga vieja y sucia
};

export function getMat(key) {
  if (MATS.has(key)) return MATS.get(key);
  let m;
  if (TEXMATS[key]) {
    const d = TEXMATS[key];
    m = new THREE.MeshStandardMaterial({ map: TEX[d.tex](), roughness: d.rough, metalness: d.metal || 0 });
    m.userData.tileU = d.tileU || d.tile;
    m.userData.tileV = d.tileV || d.tile;
    upgrade(m, key);
  } else if (COLORMATS[key]) {
    const d = COLORMATS[key];
    m = new THREE.MeshStandardMaterial({
      color: d.color, roughness: d.rough ?? 0.8, metalness: d.metal || 0,
      emissive: d.emissive || 0, emissiveIntensity: d.emissiveIntensity || 1,
    });
    m.userData.tileU = m.userData.tileV = 1;
  } else {
    m = new THREE.MeshStandardMaterial({ color: 0xff00ff });
    m.userData.tileU = m.userData.tileV = 1;
  }
  MATS.set(key, m);
  return m;
}

// Caja con UVs en metros (la textura se repite según el tamaño real)
export function boxGeo(sx, sy, sz, tileU = 1, tileV = tileU) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  // orden de caras: +x, -x, +y, -y, +z, -z (4 vértices cada una)
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tileU, uv.getY(i) * dims[f][1] / tileV);
    }
  }
  return g;
}

export class Builder {
  constructor(phys) {
    this.phys = phys;
    this.parts = new Map(); // matKey -> geometries[]
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
  }

  _push(key, geo) {
    if (!this.parts.has(key)) this.parts.set(key, []);
    // normalizamos atributos para poder fusionar
    for (const name of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    }
    if (!geo.attributes.uv) {
      const n = geo.attributes.position.count;
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (geo.index) geo = geo.toNonIndexed();
    this.parts.get(key).push(geo);
  }

  // Caja: centro (cx, cy, cz), tamaño (sx, sy, sz). opts: { yaw, rx, rz, collide, noShadow }
  box(key, cx, cy, cz, sx, sy, sz, opts = {}) {
    const mat = getMat(key);
    const g = boxGeo(sx, sy, sz, opts.tileU || mat.userData.tileU, opts.tileV || mat.userData.tileV);
    this.e.set(opts.rx || 0, opts.yaw || 0, opts.rz || 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m4.compose(new THREE.Vector3(cx, cy, cz), this.q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(this.m4);
    this._push(opts.noShadow ? key + '#ns' : key, g);
    if (opts.collide === false && !opts.rx && !opts.rz && sy <= 0.25 && cy + sy / 2 < 0.3 && sx * sz > 4) {
      const yaw = opts.yaw || 0;
      FLOORS.push({ x: cx, z: cz, hx: sx / 2, hz: sz / 2, top: cy + sy / 2, c: Math.cos(yaw), s: Math.sin(yaw) });
    }
    if (opts.collide !== false && this.phys) {
      if (opts.rx || opts.rz) {
        this.phys.box(cx, cy, cz, sx / 2, sy / 2, sz / 2, 0, { rot: { x: this.q.x, y: this.q.y, z: this.q.z, w: this.q.w }, mat: opts.pmat });
      } else {
        this.phys.box(cx, cy, cz, sx / 2, sy / 2, sz / 2, opts.yaw || 0, { mat: opts.pmat });
      }
    }
  }

  // Geometría arbitraria ya posicionada
  geo(key, geometry, matrix = null) {
    if (matrix) geometry.applyMatrix4(matrix);
    this._push(key, geometry);
  }

  cylinder(key, x, y, z, rTop, rBot, h, seg = 12, opts = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, !!opts.open);
    if (opts.uvScale) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * opts.uvScale[0], uv.getY(i) * opts.uvScale[1]);
    }
    this.e.set(opts.rx || 0, opts.yaw || 0, opts.rz || 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m4.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(this.m4);
    this._push(opts.noShadow ? key + '#ns' : key, g);
    if (opts.collide && this.phys) this.phys.cylinder(x, y, z, h / 2, Math.max(rTop, rBot), { mat: opts.pmat });
  }

  // Muro a lo largo de un segmento (x0,z0)->(x1,z1) con huecos [{from, to, bottom, top}] medidos desde el inicio
  wall(key, x0, z0, x1, z1, height, thick, holes = [], opts = {}) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz); // el muro corre sobre el eje local Z
    const ux = dx / len, uz = dz / len;
    const y0 = opts.y0 || 0;
    const segs = [];
    // partir en tramos macizos y tramos con hueco
    const hs = [...holes].sort((a, b) => a.from - b.from);
    let cur = 0;
    for (const h of hs) {
      if (h.from > cur) segs.push({ a: cur, b: h.from, bottom: 0, top: height });
      if (h.bottom > 0) segs.push({ a: h.from, b: h.to, bottom: 0, top: h.bottom });
      if (h.top < height) segs.push({ a: h.from, b: h.to, bottom: h.top, top: height });
      cur = h.to;
    }
    if (cur < len) segs.push({ a: cur, b: len, bottom: 0, top: height });
    for (const s of segs) {
      const l = s.b - s.a;
      if (l <= 0.001) continue;
      const mid = (s.a + s.b) / 2;
      const cx = x0 + ux * mid, cz = z0 + uz * mid;
      const h = s.top - s.bottom;
      this.box(key, cx, y0 + s.bottom + h / 2, cz, thick, h, l, { yaw, collide: opts.collide });
    }
  }

  finish(scene, opts = {}) {
    const meshes = [];
    for (const [key, geos] of this.parts) {
      const [mk, flag] = key.split('#');
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, getMat(mk));
      mesh.castShadow = flag !== 'ns' && opts.castShadow !== false;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      scene.add(mesh);
      meshes.push(mesh);
      for (const g of geos) g.dispose();
    }
    this.parts.clear();
    return meshes;
  }
}
