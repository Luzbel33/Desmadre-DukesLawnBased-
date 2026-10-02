// El Búnker grande: las alas nuevas alrededor del club (medidas en CLUB.wings, mapdata.js).
//  - Norte (detrás del escenario): el Coffeeshop "Ámsterdam" con la sala de cultivo al lado (se ve por un ventanal),
//    El Infierno en el medio (dos pisos: pista de lava con una isla de caños y un balcón en U) y la sala VIP de los caños.
//  - Este (atrás de la jaula): el Arsenal, un búnker militar: las pistolas y las granadas se agarran acá.
// Optimización: la estructura (muros, pisos, techos, puertas) es una sola malla por material en el grupo del club; lo de
// adentro de cada sala va en su propio grupo con sus mallas fusionadas y solo se dibuja (y se anima) si la cámara está
// en esa sala o en una pegada por una puerta (SEES). Los modelos repetidos van instanciados y se cargan recién cuando
// alguien se acerca al Búnker (BUNKER_MANIFEST). Las luces son virtuales (pool) y saben en qué sala están.
import * as THREE from 'three';
import { rng } from '../core/G.js';
import { Builder, getMat, defineMat } from './builder.js';
import { CLUB } from '../shared/mapdata.js';
import { whenAsset, assetModel, instanceModel } from '../game/assets.js';
import { plantField } from './cannabis.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { G } from '../core/G.js';

const HAS_DOM = typeof document !== 'undefined';
const W = CLUB.wings, H = CLUB.hall, WT = 0.4;
// número de sala: las centenas son el "edificio" para el pool de luces (las de otro edificio casi no compiten). El café y
// la sala de cultivo comparten edificio (se ven por el ventanal); cada una de las demás es el suyo.
export const WING_ROOM = { cafe: 1001, grow: 1002, hell: 1101, vip: 1201, arsenal: 1301, psico: 1401, maze: 1402 };
// qué alas se dibujan según la sala de la cámara (la propia y las que se ven por una puerta)
const SEES = {
  904: ['cafe', 'vip', 'arsenal', 'psico'],
  1001: ['cafe', 'grow', 'hell'], 1002: ['grow', 'cafe'], 1101: ['hell', 'cafe', 'vip'], 1201: ['vip', 'hell'], 1301: ['arsenal'],
  1401: ['psico', 'maze'], 1402: ['maze', 'psico'],
};
// puertas desde el club (huecos en sus muros; ver Club._hall)
export const HALL_DOORS = {
  north: [[-15.7, -13.3, 0, 3], [13.3, 15.7, 0, 3]], // coffeeshop y VIP (en x)
  east: [[-476.2, -473.8, 0, 3]], // arsenal (en z)
  west: [[-472.2, -469.8, 0, 3]], // sala psicodélica (en z)
};
export const MIRROR_LAYER = 7; // lo que se ve en los espejos del laberinto (CubeCamera)
const V3 = new THREE.Vector3(), V4 = new THREE.Vector3();
// espejo deformante (Reflector con las coordenadas de la reflexión torcidas): 0 ondas, 1 panza, 2 estirado
const FUNHOUSE = {
  name: 'Funhouse',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uT: { value: 0 }, uMode: { value: 0 } },
  vertexShader: `
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec2 vP;
    void main(){ vUv = textureMatrix * vec4(position, 1.0); vP = uv - 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform vec3 color; uniform sampler2D tDiffuse; uniform float uT, uMode; varying vec4 vUv; varying vec2 vP;
    void main(){
      vec2 uv = vUv.xy / vUv.w;
      if (uMode < 0.5) uv.x += sin(vP.y * 11.0 + uT * 1.7) * 0.03 + sin(vP.y * 23.0 - uT) * 0.008;
      else if (uMode < 1.5) { float r = length(vP * vec2(1.4, 1.0)); uv -= vP * 0.22 * smoothstep(0.55, 0.0, r); }
      else { uv.y += vP.y * 0.18 * (1.0 - abs(vP.x) * 2.0); uv.x += sin(vP.y * 5.0) * 0.015; }
      vec3 c = texture2D(tDiffuse, uv).rgb * color;
      float edge = smoothstep(0.5, 0.46, max(abs(vP.x), abs(vP.y)));
      gl_FragColor = vec4(c * edge, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
const DOOR_Z = -492; // puertas laterales del Infierno (coffeeshop y VIP)

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function ctex(cv, srgb = true) { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const mat4 = (x, y, z, yaw = 0, s = 1, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, yaw, rz, 'YXZ')), new THREE.Vector3(s, s, s));

// materiales propios del Búnker grande
function mats() {
  if (getMat.__wings) return;
  getMat.__wings = true;
  defineMat('mylar', new THREE.MeshStandardMaterial({ color: 0xc9ced4, metalness: 0.92, roughness: 0.32 }));
  defineMat('growLed', new THREE.MeshStandardMaterial({ color: 0xff60f0, emissive: 0xff30e0, emissiveIntensity: 3.2 }));
  defineMat('basalt', new THREE.MeshStandardMaterial({ color: 0x17110f, roughness: 0.9 }));
  defineMat('lavaRock', new THREE.MeshStandardMaterial({ color: 0x2a0f08, emissive: 0xff3a0a, emissiveIntensity: 0.35, roughness: 0.85 }));
  defineMat('olive', new THREE.MeshStandardMaterial({ color: 0x4a5230, roughness: 0.8 }));
  defineMat('warmBulb', new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc070, emissiveIntensity: 2.6 }));
  defineMat('bongGlass', new THREE.MeshStandardMaterial({ color: 0x5fd8c8, metalness: 0.2, roughness: 0.08, transparent: true, opacity: 0.55, depthWrite: false }));
  for (const [k, col] of [['shroomPink', 0xff3cc8], ['shroomCyan', 0x30e8ff], ['shroomLime', 0x9cff30]]) defineMat(k, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, roughness: 0.4 }));
  defineMat('shroomStem', new THREE.MeshStandardMaterial({ color: 0xefe4cc, emissive: 0x403020, roughness: 0.7 }));
  defineMat('windowGlass', new THREE.MeshStandardMaterial({ color: 0x8090a0, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }));
}

export class ClubWings {
  constructor(club) {
    this.c = club;
    this.rand = rng(4242);
    this.wings = new Map(); // id -> { group, anim: [] }
    this.lastRoom = 0;
    this.anchors = club.anchors;
    this.anchors.npcSeats = []; // sillones de la gente del Búnker (no se ofrecen a los jugadores)
  }

  build() {
    mats();
    const c = this.c;
    for (const [k, r] of Object.entries(WING_ROOM)) { const w = W[k]; c.room(w.x0, 0, w.z0, w.x1, w.h, w.z1, r); }
    this._shell();
    this._wing('cafe', () => this._cafe());
    this._wing('grow', () => this._grow());
    this._wing('hell', () => this._hell());
    this._wing('vip', () => this._vip());
    this._wing('arsenal', () => this._arsenal());
    this._wing('psico', () => this._psico());
    this._wing('maze', () => this._maze());
    this._mirrorLayers();
    return this;
  }

  // ---------------------------------------------------------------- armado de un ala (grupo propio)
  _wing(id, fn) {
    const c = this.c, g = new THREE.Group();
    g.name = 'bunker-' + id; g.visible = false;
    c.group.add(g);
    const b0 = c.b, g0 = c.group, a0 = c.anim;
    c.b = new Builder(c.phys); c.group = g; c.anim = [];
    this._models = new Map();
    this._id = id;
    try { fn(); } finally {
      for (const m of c.b.finish(g)) m.userData.club = true;
      this.wings.set(id, { group: g, anim: c.anim });
      this._flushModels(g);
      c.b = b0; c.group = g0; c.anim = a0;
    }
  }
  // modelos del ala: uno solo se clona; varios del mismo tipo van instanciados (una llamada de dibujo por sub-malla)
  model(type, x, y, z, yaw = 0, s = 1, rx = 0, rz = 0) {
    if (!this._models.has(type)) this._models.set(type, []);
    this._models.get(type).push(mat4(x, y, z, yaw, s, rx, rz));
  }
  modelM(type, m) {
    if (!this._models.has(type)) this._models.set(type, []);
    this._models.get(type).push(m);
  }
  _flushModels(g) {
    for (const [type, list] of this._models) {
      whenAsset(type, () => {
        if (list.length === 1) {
          const m = assetModel(type);
          if (!m) return;
          list[0].decompose(m.position, m.quaternion, m.scale);
          g.add(m);
        } else instanceModel(g, type, list);
      });
    }
    this._models = null;
  }

  // asiento: de un jugador o (npc) de la gente del Búnker
  seat(x, y, z, yaw, npc = false) {
    if (npc) this.anchors.npcSeats.push({ wing: this._id, x, y, z, yaw });
    else this.c.seat(x, y, z, yaw);
  }
  // atajos al club (muros, cajas, luces, carteles)
  box(...a) { this.c.box(...a); }
  deco(...a) { this.c.deco(...a); }
  cyl(...a) { this.c.cyl(...a); }
  light(...a) { return this.c.light(...a); }
  fire(...a) { this.c.fire(...a); }
  mesh(...a) { return this.c.mesh(...a); }
  neon(text, o, w, h, x, y, z, yaw = 0) { if (HAS_DOM) this.mesh(new THREE.PlaneGeometry(w, h), this.c.neon(text, o), x, y, z, { yaw }); }
  sign(draw, cw, ch, w, h, x, y, z, yaw = 0) { if (HAS_DOM) return this.mesh(new THREE.PlaneGeometry(w, h), this.c.printSign(draw, cw, ch), x, y, z, { yaw }); return null; }

  // ---------------------------------------------------------------- estructura (siempre en el grupo del club)
  _shell() {
    const c = this.c, cf = W.cafe, gr = W.grow, hl = W.hell, vp = W.vip, ar = W.arsenal;
    // pisos (el suelo físico es el plano del mundo) y techos
    c.deco('oldWood', (cf.x0 + cf.x1) / 2, 0.02, (cf.z0 + cf.z1) / 2, cf.x1 - cf.x0, 0.04, cf.z1 - cf.z0);
    c.deco('bunkerConcrete', (gr.x0 + gr.x1) / 2, 0.02, (gr.z0 + gr.z1) / 2, gr.x1 - gr.x0, 0.04, gr.z1 - gr.z0);
    c.deco('velvet', (vp.x0 + vp.x1) / 2, 0.02, (vp.z0 + vp.z1) / 2, vp.x1 - vp.x0, 0.04, vp.z1 - vp.z0);
    c.deco('bunkerConcrete', (ar.x0 + ar.x1) / 2, 0.02, (ar.z0 + ar.z1) / 2, ar.x1 - ar.x0, 0.04, ar.z1 - ar.z0);
    c.deco('basalt', 0, 0.01, (hl.z0 + hl.z1) / 2, hl.x1 - hl.x0, 0.02, hl.z1 - hl.z0);
    c.deco('woodDark', (cf.x0 + cf.x1) / 2, cf.h + 0.15, (cf.z0 + cf.z1) / 2, cf.x1 - cf.x0 + 0.4, 0.3, cf.z1 - cf.z0 + 0.4);
    c.deco('white', (gr.x0 + gr.x1) / 2, gr.h + 0.15, (gr.z0 + gr.z1) / 2, gr.x1 - gr.x0 + 0.4, 0.3, gr.z1 - gr.z0 + 0.4);
    c.deco('black', (vp.x0 + vp.x1) / 2, vp.h + 0.15, (vp.z0 + vp.z1) / 2, vp.x1 - vp.x0 + 0.4, 0.3, vp.z1 - vp.z0 + 0.4);
    c.deco('bunkerConcrete', (ar.x0 + ar.x1) / 2, ar.h + 0.15, (ar.z0 + ar.z1) / 2, ar.x1 - ar.x0 + 0.4, 0.3, ar.z1 - ar.z0 + 0.4);
    c.deco('black', 0, hl.h + 0.15, (hl.z0 + hl.z1) / 2, hl.x1 - hl.x0 + 0.8, 0.3, hl.z1 - hl.z0 + 0.8);
    // muros (los compartidos se hacen una sola vez)
    c.wallX('bunkerBrick', -56.4, -24.4, -478.2, 5); // sur de cultivo y coffeeshop (afuera del club)
    c.wallX('bunkerConcrete', 24.4, 46.4, -478.2, 5.3); // sur de la VIP = norte del arsenal
    c.wallX('bunkerBrick', -56.4, -12.2, -500.2, cf.h + 0.3); // norte de cultivo y coffeeshop
    c.wallX('bunkerBrick', 12.2, 36.4, -500.2, vp.h + 0.3); // norte de la VIP
    c.wallZ('bunkerBrick', gr.x0 - WT / 2, -478.4, -500.4, gr.h + 0.3); // oeste de cultivo
    c.wallZ('bunkerBrick', vp.x1 + WT / 2, -478.4, -500.4, vp.h + 0.3); // este de la VIP
    // El Infierno: piedra, muy alto; puertas a los costados (coffeeshop y VIP) y la parte alta del muro del club
    const hd = [[DOOR_Z - 1.2, DOOR_Z + 1.2, 0, 3]];
    c.wallZ('keepStone', -12, -478.4, hl.z0 - 0.4, hl.h + 0.3, hd);
    c.wallZ('keepStone', 12, -478.4, hl.z0 - 0.4, hl.h + 0.3, hd);
    c.wallX('keepStone', -12.2, 12.2, hl.z0 - 0.2, hl.h + 0.3);
    c.wallX('keepStone', -12.2, 12.2, -478.2, hl.h + 0.3 - H.h, [], H.h);
    // coffeeshop | cultivo: murito, ventanal y puerta
    c.wallZ('bunkerBrick', -36, -478.4, -500.0, cf.h, [[-495.2, -492.8, 0, 2.6], [-492.2, -479.6, 0.95, 3.5]]);
    if (HAS_DOM) {
      const glass = getMat('windowGlass');
      const pane = this.c.mesh(new THREE.PlaneGeometry(12.6, 2.55), glass, -36, 2.225, -485.9, { yaw: Math.PI / 2 });
      pane.renderOrder = 2; pane.castShadow = false;
    }
    c.phys.box(-36, 2.225, -485.9, 0.05, 1.275, 6.3, 0, { paint: false, mat: 'glass' });
    for (let k = 0; k <= 6; k++) c.deco('blackWood', -36, 2.225, -479.6 - k * 2.1, 0.12, 2.6, 0.08); // parteluces
    // arsenal: este y sur
    c.wallZ('bunkerConcrete', ar.x1 + WT / 2, ar.z1 + 0.4, -478.4, ar.h + 0.3);
    c.wallX('bunkerConcrete', ar.x0, ar.x1 + 0.4, ar.z1 + 0.2, ar.h + 0.3);
    this._doors();
    this._westShell();
  }

  // marcos y carteles de las puertas que salen del club
  _doors() {
    const c = this.c;
    // coffeeshop (noroeste): marco de madera y neón verde
    for (const s of [-1, 1]) c.deco('woodDark', -14.5 + s * 1.27, 1.55, -477.92, 0.14, 3.1, 0.16);
    c.deco('woodDark', -14.5, 3.07, -477.92, 2.68, 0.16, 0.16);
    this.neon('COFFEESHOP', { font: 'Bangers', px: 120, color: '#58ff6a' }, 3.4, 0.85, -14.5, 3.75, -477.9);
    // VIP (noreste): marco dorado y neón rosa
    for (const s of [-1, 1]) c.deco('gold', 14.5 + s * 1.27, 1.55, -477.92, 0.1, 3.1, 0.12);
    c.deco('gold', 14.5, 3.07, -477.92, 2.64, 0.12, 0.12);
    this.neon('VIP', { font: 'Metal Mania', px: 170, color: '#ff3cb4', w: 512 }, 1.7, 0.85, 14.5, 3.75, -477.9);
    // arsenal (este): franjas de peligro y cartel militar
    if (HAS_DOM) {
      const hz = this._hazardMat(3);
      for (const s of [-1, 1]) this.c.mesh(new THREE.BoxGeometry(0.06, 3.1, 0.22), hz, 23.97, 1.55, -475 + s * 1.31);
      this.c.mesh(new THREE.BoxGeometry(0.06, 0.22, 2.84), hz, 23.97, 3.1, -475);
    }
    this.sign((g, w, h) => {
      g.fillStyle = '#2f3524'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#d8b020'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#e8e2c8'; g.font = 'bold 92px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('ARSENAL', w / 2, h * 0.42);
      g.font = 'bold 34px "Courier New", monospace'; g.fillStyle = '#d8b020'; g.fillText('ZONA MILITAR · NIVEL -666', w / 2, h * 0.78);
    }, 512, 200, 2.6, 1.0, 23.96, 3.85, -475, -Math.PI / 2);
  }
  _hazardMat(rep = 2) {
    const cv = canvas(256, 64), g = cv.getContext('2d');
    g.fillStyle = '#d8b020'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#141414';
    for (let x = -64; x < 320; x += 48) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 24, 64); g.lineTo(x + 88, 0); g.lineTo(x + 64, 0); g.fill(); }
    const t = ctex(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  }

  // ---------------------------------------------------------------- Coffeeshop "Ámsterdam"
  _cafe() {
    const r = this.rand, cf = W.cafe, zN = cf.z0;
    // zócalo de madera en los muros y vigas en el techo
    for (const [x, z, sx, sz] of [[(cf.x0 + cf.x1) / 2 + 6, zN + 0.06, cf.x1 - cf.x0 - 12, 0.06], [cf.x1 - 0.23, -484.6, 0.06, 12], [cf.x1 - 0.23, -497.5, 0.06, 4.5]]) this.deco('woodDark', x, 0.55, z, sx, 1.1, sz);
    for (let k = 0; k < 6; k++) this.deco('blackWood', (cf.x0 + cf.x1) / 2, cf.h - 0.12, -480.5 - k * 3.8, cf.x1 - cf.x0, 0.22, 0.18);
    // paredes de yeso cálido arriba del zócalo (el ladrillo negro del búnker se comía la luz)
    const up = (cf.h - 1.1) / 2 + 1.1, hh = cf.h - 1.1;
    this.deco('plaster', (cf.x0 + cf.x1) / 2, up, cf.z0 + 0.03, cf.x1 - cf.x0, hh, 0.02);
    this.deco('plaster', -30.2, up, cf.z1 - 0.03, 11.6, hh, 0.02);
    this.deco('plaster', -20.1, up, cf.z1 - 0.03, 8.6, hh, 0.02);
    this.deco('plaster', cf.x1 - 0.22, up, -484.6, 0.02, hh, 12.2);
    this.deco('plaster', cf.x1 - 0.22, up, -497.5, 0.02, hh, 4.6);
    for (const [x, z, sx, sz] of [[-30.2, cf.z1 - 0.06, 11.6, 0.06], [-20.1, cf.z1 - 0.06, 8.6, 0.06]]) this.deco('woodDark', x, 0.55, z, sx, 1.1, sz);
    // el mostrador (contra el muro norte) y los estantes con frascos
    const x0 = -30, x1 = -18, zc = zN + 1.85;
    this.box('woodDark', (x0 + x1) / 2, 0.52, zc, x1 - x0, 1.04, 0.8);
    this.deco('blackTile', (x0 + x1) / 2, 1.07, zc, x1 - x0 + 0.1, 0.06, 0.95);
    this.deco('neonGreen', (x0 + x1) / 2, 0.08, zc + 0.41, x1 - x0, 0.03, 0.02);
    for (let k = 0; k < 3; k++) {
      const y = 1.35 + k * 0.5;
      this.deco('woodDark', (x0 + x1) / 2, y, zN + 0.22, x1 - x0, 0.05, 0.4);
      for (let i = 0; i < 16; i++) {
        const x = x0 + 0.4 + i * ((x1 - x0 - 0.8) / 15);
        this.cyl('glass', x, y + 0.13, zN + 0.22, 0.07, 0.07, 0.22, 10);
        this.cyl(['green', 'fabricGreen', 'moss'][(i + k) % 3], x, y + 0.08, zN + 0.22, 0.055, 0.055, 0.1, 8);
        this.cyl('gold', x, y + 0.25, zN + 0.22, 0.072, 0.072, 0.025, 10);
      }
    }
    // pizarrón con el menú
    this.sign((g, w, h) => {
      g.fillStyle = '#1b2219'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6b4a2a'; g.lineWidth = 18; g.strokeRect(0, 0, w, h);
      g.fillStyle = '#f2efe0'; g.textAlign = 'center'; g.font = 'bold 54px "Comic Sans MS", Rubik, sans-serif'; g.fillText('MENÚ DEL DIABLO', w / 2, 70);
      g.font = '34px "Comic Sans MS", Rubik, sans-serif'; g.textAlign = 'left';
      const items = [['Faso', 'clásico'], ['Blunt', 'gordo y lento'], ['Habano', 'de capo'], ['Pipa', 'con tabaco'], ['Bong', 'para valientes'], ['Brownie', 'pega tarde']];
      items.forEach(([a, b], i) => { const y = 130 + i * 46; g.fillStyle = ['#7dff6a', '#ffe066', '#ff7b5c'][i % 3]; g.fillText('• ' + a, 50, y); g.fillStyle = '#c8c4b0'; g.fillText(b, 330, y); g.fillText('gratis', w - 170, y); });
    }, 1024, 420, 4.4, 1.8, (x0 + x1) / 2, 3.25, zN + 0.03);
    // máquina de café y la gente que atiende
    this.model('b_coffeecart', -15.6, 0, zN + 0.62);
    this.anchors.budtender = new THREE.Vector3(-24, 0, zN + 0.95);
    this.c.use('club_cafe', [-24, 1.1, zc + 0.6], 2.6, 'Pedir en el coffeeshop', { e: 'cafe' });
    // banquetas frente al mostrador (se sientan jugadores)
    for (let k = 0; k < 6; k++) {
      const x = x0 + 1.1 + k * 1.95;
      this.model('d_metal_stool', x, 0, zc + 0.85, 0);
      this.seat(x, 0.82, zc + 0.85, Math.PI);
    }
    // rincón de almohadones con alfombra, mesita baja y narguile (al lado de la máquina de café)
    this._hookahCorner(-17.2, -494.6);
    // living: sillones, mesas ratonas, sillones individuales, almohadones y plantas
    const tables = [[-31.5, -484], [-24.5, -486.5], [-19, -483], [-25, -492.5], [-19.5, -490.5]];
    for (const [x, z] of tables) {
      this.model('b_ctable', x, 0, z, r() * 3);
      this.model('b_snake', x + 0.15, 0.49, z - 0.1, r() * 6);
      this.c.phys.cylinder(x, 0.25, z, 0.25, 0.62, { paint: false }); // la mesa choca
      this.model('b_pendant', x, cf.h - 0.95, z);
      this.light(x, cf.h - 1.5, z, 0xffc888, 14, 10, { priority: 1.1, decay: 1.4 });
    }
    [[-23.4, -485.1, -2.4], [-25.9, -487.6, 0.8], [-17.8, -482.2, -2.2], [-24, -491.3, -2.6], [-26.2, -493.4, 0.6], [-20.8, -489.6, 2.3], [-18.3, -491.6, -0.6]].forEach(([x, z, yaw], i) => {
      this.model('b_lounge', x, 0, z, yaw);
      this.seat(x, 0.47, z, yaw, i % 3 === 0);
    });
    // sillones grandes: frente al ventanal de la sala de cultivo y contra el muro del club
    for (const [x, z, yaw] of [[-29.6, -483.5, -Math.PI / 2], [-20.5, -479.05, Math.PI], [-12.75, -486.5, -Math.PI / 2]]) {
      this.model('b_sofa', x, 0, z, yaw);
      this.model('b_pillows', x + Math.sin(yaw) * 0.12, 0.42, z + Math.cos(yaw) * 0.12, yaw);
      for (const k of [-0.85, 0, 0.85]) this.c.seat(x + Math.cos(yaw) * k + Math.sin(yaw) * 0.1, 0.48, z - Math.sin(yaw) * k + Math.cos(yaw) * 0.1, yaw);
    }
    // estantes de cubos con bongs y pipas (de vidrio) y frascos
    for (const x of [-34.6, -33.4]) this.model('b_cube', x, 0, zN + 0.62, Math.PI / 2);
    for (let i = 0; i < 6; i++) this._bong(-35.2 + (i % 2) * 1.2 + 0.2, [0.03, 0.55, 1.08][i % 3] + 0.03, zN + 0.62);
    // plantas de verdad en macetas (las de la sala de cultivo, más chicas) y el cartel con la hoja
    const pots = [[-35.2, -480], [-12.9, -481.2], [-35.2, -498.8], [-12.9, -495.5]];
    for (const [x, z] of pots) { this.cyl('terracotta', x, 0.22, z, 0.3, 0.24, 0.44, 14, { collide: true }); this.cyl('dirt', x, 0.43, z, 0.27, 0.27, 0.02, 12); }
    plantField(this.c.group, pots.map(([x, z]) => mat4(x, 0.44, z, r() * 6, 0.95 + r() * 0.2)));
    if (HAS_DOM) this.mesh(new THREE.PlaneGeometry(1.7, 1.7), this._leafNeon(), cf.x1 - 0.24, 2.6, -484.6, { yaw: -Math.PI / 2 });
    this.neon('Ámsterdam', { font: 'Metal Mania', px: 110, color: '#ffd23b' }, 3.2, 0.8, cf.x1 - 0.24, 2.6, -488.4, -Math.PI / 2);
    // guirnalda de lamparitas rasta en zigzag por el techo (una sola malla instanciada, sin luces de verdad)
    if (HAS_DOM) {
      const pts = [];
      for (let k = 0; k < 4; k++) {
        const z = -480.5 - k * 5, za = z - 2.5;
        for (let i = 0; i <= 22; i++) { const t = i / 22, x = cf.x0 + 1 + t * (cf.x1 - cf.x0 - 2); pts.push([x, cf.h - 0.45 - Math.sin(t * Math.PI * 5) ** 2 * 0.35, i % 2 ? za : z]); }
      }
      const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), pts.length);
      const cols = [new THREE.Color(3, 0.3, 0.2), new THREE.Color(3, 2.4, 0.2), new THREE.Color(0.3, 2.6, 0.4)];
      pts.forEach(([x, y, z], i) => { im.setMatrixAt(i, mat4(x, y, z)); im.setColorAt(i, cols[i % 3]); });
      im.computeBoundingSphere();
      this.c.group.add(im);
    }
    // carteles
    this.sign((g, w, h) => {
      g.fillStyle = '#f4ead0'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c0392b'; g.font = 'bold 64px Bangers, Rubik, sans-serif'; g.textAlign = 'center'; g.fillText('PROHIBIDO', w / 2, 120);
      g.fillStyle = '#222'; g.fillText('NO FUMAR', w / 2, 200);
      g.font = '28px Rubik, sans-serif'; g.fillText('La gerencia', w / 2, 270);
    }, 400, 320, 0.9, 0.72, -20, 1.9, -478.36, Math.PI);
    this.sign((g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff5a2a'); gr.addColorStop(0.5, '#ffd23b'); gr.addColorStop(1, '#2fae4a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#111'; g.font = 'bold 70px Bangers, Rubik, sans-serif'; g.textAlign = 'center';
      g.fillText('KEEP CALM', w / 2, 120); g.fillText('AND', w / 2, 200); g.fillText('ROLL ONE', w / 2, 280);
    }, 400, 340, 0.85, 0.72, -30.5, 1.9, -478.36, Math.PI);
    this.light(-24, 2.8, zN + 2.5, 0xfff0d0, 12, 10, { priority: 1.2, decay: 1.3 });
    for (const [x, z] of [[-30, -485], [-18, -486], [-24, -494]]) this.light(x, 2.6, z, 0xffd8a8, 16, 22, { priority: 1.0, decay: 1.0 });
    this.light(-34, 2.2, -490, 0x78ff60, 2.5, 7, { priority: 1 });
    // humito de los que fuman
    const fog = this.c.fog;
    if (fog) for (const [x, z] of [[-29, -483.5], [-24.5, -488], [-19, -486]]) fog.add(x, 1.0, z, 4, { radius: 1.8, height: 1.6, opacity: 0.05, speed: 0.04 });
  }
  _hookahCorner(x, z) {
    const r = this.rand;
    this.deco('carpet', x, 0.05, z, 4.2, 0.02, 3.2);
    this.cyl('blackWood', x, 0.16, z, 0.55, 0.55, 0.06, 18, { collide: true });
    for (const dy of [0.08, 0.04]) this.cyl('blackWood', x, dy, z, 0.07, 0.07, 0.1, 8);
    // narguile: base de vidrio, columna, cazoleta con brasa y la manguera
    this.cyl('bongGlass', x, 0.3, z, 0.11, 0.08, 0.2, 14);
    this.cyl('gold', x, 0.55, z, 0.02, 0.03, 0.32, 10);
    this.cyl('gold', x, 0.72, z, 0.09, 0.05, 0.03, 12);
    this.cyl('terracotta', x, 0.76, z, 0.05, 0.035, 0.06, 10);
    this.deco('ember', x, 0.795, z, 0.07, 0.01, 0.07);
    const hose = new THREE.CatmullRomCurve3([new THREE.Vector3(x + 0.03, 0.5, z), new THREE.Vector3(x + 0.35, 0.3, z + 0.1), new THREE.Vector3(x + 0.7, 0.12, z + 0.35), new THREE.Vector3(x + 0.95, 0.2, z + 0.55)]);
    this.c.b.geo('leatherBlack', new THREE.TubeGeometry(hose, 16, 0.012, 6));
    // almohadones alrededor (se sientan jugadores)
    const cols = ['shroomPink', 'velvet', 'fabricGreen', 'yellow', 'fabricBlue', 'orange'];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + 0.3, px = x + Math.sin(a) * 1.25, pz = z + Math.cos(a) * 1.0;
      const g = new THREE.SphereGeometry(0.42, 14, 8); g.scale(1, 0.38, 1);
      this.c.b.geo(cols[k], g, mat4(px, 0.14, pz, r() * 3));
      this.seat(px, 0.3, pz, Math.atan2(x - px, z - pz));
    }
    const fog = this.c.fog;
    if (fog) fog.add(x, 0.9, z, 4, { radius: 0.5, height: 1.8, opacity: 0.07, speed: 0.06 });
  }
  _bong(x, y, z) {
    this.cyl('bongGlass', x, y + 0.16, z, 0.035, 0.035, 0.32, 10);
    this.cyl('bongGlass', x, y + 0.05, z, 0.07, 0.075, 0.1, 12);
    this.cyl('steel', x + 0.05, y + 0.1, z, 0.008, 0.008, 0.12, 6, { rz: -0.8 });
    this.cyl('steel', x + 0.09, y + 0.15, z, 0.018, 0.01, 0.03, 8);
  }
  _leafNeon() {
    const cv = canvas(256, 256), g = cv.getContext('2d');
    g.translate(128, 236);
    const fol = [[0, 1], [-0.5, 0.86], [0.5, 0.86], [-1.0, 0.64], [1.0, 0.64], [-1.45, 0.36], [1.45, 0.36]];
    for (const [blur, lw, a] of [[24, 9, 0.8], [10, 5, 1], [0, 2.5, 1]]) {
      g.shadowColor = '#40ff60'; g.shadowBlur = blur; g.strokeStyle = blur ? '#40ff60' : '#eaffea'; g.lineWidth = lw; g.globalAlpha = a;
      for (const [ang, len] of fol) {
        g.save(); g.rotate(ang * 0.55); g.beginPath(); g.moveTo(0, 0);
        const L = 200 * len, Wd = 20 * (0.55 + len * 0.45);
        g.quadraticCurveTo(-Wd * 1.6, -L * 0.5, 0, -L); g.quadraticCurveTo(Wd * 1.6, -L * 0.5, 0, 0);
        g.stroke(); g.restore();
      }
    }
    const m = new THREE.MeshBasicMaterial({ map: ctex(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    m.color.setScalar(2);
    return m;
  }

  // ---------------------------------------------------------------- sala de cultivo
  _grow() {
    const r = this.rand, gr = W.grow;
    // paredes forradas de mylar (devuelven el violeta de las lámparas)
    this.deco('mylar', gr.x0 + 0.03, gr.h / 2, (gr.z0 + gr.z1) / 2, 0.02, gr.h, gr.z1 - gr.z0);
    this.deco('mylar', (gr.x0 + gr.x1) / 2, gr.h / 2, gr.z0 + 0.03, gr.x1 - gr.x0, gr.h, 0.02);
    this.deco('mylar', (gr.x0 + gr.x1) / 2, gr.h / 2, gr.z1 - 0.03, gr.x1 - gr.x0, gr.h, 0.02);
    // cuatro filas de canteros con plantas, cada una con su barra de LED colgando
    const rows = [-52.5, -48.5, -44.5, -40.5], plants = [];
    for (const x of rows) {
      for (let k = 0; k < 10; k++) {
        const z = -480.8 - k * 1.55;
        this.modelM('b_planter', mat4(x, 0, z, Math.PI / 2));
        for (const o of [-0.32, 0.32]) plants.push(mat4(x + (r() - 0.5) * 0.12, 0.42, z + o, r() * 6, 0.85 + r() * 0.35));
      }
      this.c.phys.box(x, 0.22, -487.8, 0.25, 0.22, 7.6, 0, { paint: false }); // los canteros chocan como un bloque
      this.deco('steel', x, 2.55, -487.8, 0.32, 0.05, 15.4);
      this.deco('growLed', x, 2.52, -487.8, 0.24, 0.02, 15.2);
      for (const z of [-481, -494.6]) this.cyl('iron', x, (2.55 + gr.h) / 2, z, 0.008, 0.008, gr.h - 2.55, 4);
      this.light(x, 2.2, -484, 0xffc8ee, 9, 8, { priority: 1.1, decay: 1.3 });
      this.light(x, 2.2, -492, 0xffc8ee, 9, 8, { priority: 1.1, decay: 1.3 });
    }
    plantField(this.c.group, plants);
    this.c.use('club_bud', [-46.5, 1.0, -486], 3.5, 'Cortar un cogollo', { e: 'give', item: 'smoke' });
    // mesa de trabajo del fondo: almácigos, regadera, bolsas de tierra, manguera, ventiladores y caños
    this.deco('steel', -47, 0.45, -498.6, 5, 0.06, 1.2);
    for (const dx of [-2.4, 2.4]) for (const dz of [-0.5, 0.5]) this.deco('steel', -47 + dx, 0.21, -498.6 + dz, 0.06, 0.42, 0.06);
    this.c.phys.box(-47, 0.24, -498.6, 2.5, 0.24, 0.6, 0, { paint: false, mat: 'metal' });
    const seeds = [];
    for (let i = 0; i < 6; i++) { const x = -49 + i * 0.75; this.model('b_tray', x, 0.48, -498.6, 0); for (let j = 0; j < 4; j++) seeds.push(mat4(x + ((j % 2) - 0.5) * 0.11, 0.5, -498.6 + (Math.floor(j / 2) - 0.5) * 0.11, r() * 6, 0.12 + r() * 0.05)); }
    plantField(this.c.group, seeds);
    this.model('b_wcan', -44.2, 0.48, -498.4, 2.2);
    this.model('b_compost', -54.6, 0, -498.8, 0.2);
    this.model('b_hose', -55.85, 0.9, -490, Math.PI / 2);
    for (const z of [-482, -496]) this._fan(gr.x0 + 0.35, 2.9, z, Math.PI / 2);
    for (const x of [-54.4, -38.2]) this.cyl('steel', x, gr.h - 0.35, -489.2, 0.22, 0.22, 21, 14, { rx: Math.PI / 2 });
    this.light(-47, 3.6, -498, 0xe8f4ff, 4, 7, { priority: 1 });
    this.anchors.gardener = new THREE.Vector3(-47, 0, -497.2);
    this.sign((g, w, h) => {
      g.fillStyle = '#111'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff40e0'; g.font = 'bold 60px "Courier New", monospace'; g.textAlign = 'center';
      g.fillText('HUERTA DEL DIABLO', w / 2, 80); g.fillStyle = '#ccc'; g.font = '30px "Courier New", monospace'; g.fillText('no tocar las nenas (bueno, una)', w / 2, 140);
    }, 700, 180, 2.6, 0.67, -47, 3.3, gr.z0 + 0.06);
    const fog = this.c.fog;
    if (fog) fog.add(-46, 1.4, -488, 6, { radius: 6, height: 1.2, opacity: 0.035, speed: 0.03 });
  }
  _fan(x, y, z, yaw) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.015, 6, 24), getMat('steel'));
    g.add(cage);
    const blades = new THREE.Group();
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.01), getMat('gray')); b.position.x = 0.16; const p = new THREE.Group(); p.rotation.z = k * Math.PI / 2; p.add(b); blades.add(p); }
    g.add(blades);
    this.c.group.add(g);
    this.c.anim.push((t) => { blades.rotation.z = t * 14; g.rotation.y = yaw + Math.sin(t * 0.4) * 0.5; });
  }

  // ---------------------------------------------------------------- El Infierno
  _hell() {
    const hl = W.hell, D = hl.deck, r = this.rand;
    if (HAS_DOM) this._lavaFloor(hl);
    // balcón en U a 4.5 m: oeste, este y sur (losas que se pisan)
    const decks = [[-10.2, -491.7, 3.2, 26.6], [10.2, -491.7, 3.2, 26.6], [0, -480.2, 17.2, 3.6]];
    for (const [x, z, sx, sz] of decks) this.box('keepStone', x, D - 0.175, z, sx, 0.35, sz);
    // tira de neón roja debajo del borde de cada balcón
    for (const sx of [-1, 1]) this.deco('neonRed', sx * 8.62, D - 0.37, -493.5, 0.04, 0.03, 23);
    this.deco('neonRed', 0, D - 0.37, -481.98, 17.2, 0.03, 0.04);
    // barandas (con collider) en los bordes que dan al vacío
    this._rail(-8.6, -505, -8.6, -482);
    this._rail(8.6, -505, 8.6, -482);
    this._rail(-8.6, -482, 8.6, -482);
    this._rail(-9.4, -505, -8.6, -505);
    this._rail(9.4, -505, 8.6, -505);
    // escaleras (escalones macizos y una rampa invisible para caminar) contra los muros, suben hacia el sur
    for (const sx of [-1, 1]) {
      const xa = sx * 10.6, z0 = -516, z1 = -505, n = 18, rise = D / n, run = (z1 - z0) / n;
      for (let i = 0; i < n; i++) { const y = (i + 1) * rise; this.deco('keepStone', xa, y / 2, z0 + (i + 0.5) * run, 2.4, y, run + 0.01); }
      const L = Math.hypot(D, z1 - z0), ang = Math.atan2(D, z1 - z0);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-ang, 0, 0));
      this.c.phys.box(xa, D / 2 - 0.1, (z0 + z1) / 2, 1.2, 0.1, L / 2, 0, { rot: { x: q.x, y: q.y, z: q.z, w: q.w }, mat: 'stone' });
      // pasamanos de hierro del lado de la pista
      for (let i = 0; i <= 6; i++) { const t = i / 6; this.cyl('iron', sx * 9.42, t * D + 0.55, z0 + t * (z1 - z0), 0.025, 0.025, 1.1, 6); }
      const hr = this.mesh(new THREE.BoxGeometry(0.06, 0.06, L), getMat('iron'), sx * 9.42, D / 2 + 1.1, (z0 + z1) / 2, { rx: ang });
      hr.castShadow = false;
    }
    // sillones en el balcón mirando a la pista
    for (const sx of [-1, 1]) for (const z of [-486.5, -492.5, -498.5]) {
      const x = sx * 11.25, yaw = -sx * Math.PI / 2;
      this.model('b_sofa', x, D, z, yaw);
      for (const k of [-0.85, 0, 0.85]) this.seat(x - sx * 0.1, D + 0.48, z + k * sx, yaw, sx < 0 && z === -492.5 && k === 0);
      this.cyl('blackTile', x - sx * 1.35, D + 0.25, z, 0.35, 0.35, 0.5, 14, { collide: true });
      this.cyl('ember', x - sx * 1.35, D + 0.51, z, 0.12, 0.12, 0.02, 10);
    }
    for (const x of [-4.5, 4.5]) { this.model('b_sofa', x, D, -478.95, Math.PI); for (const k of [-0.85, 0, 0.85]) this.c.seat(x + k, D + 0.48, -479.05, Math.PI); }
    // la isla del medio: tarima de piedra, foso de lava alrededor con su cordón, puente y tres caños
    const ic = new THREE.Vector3(0, 0, -500), IR = 3.6, MR = 5.4;
    this.cyl('keepStone', ic.x, 0.35, ic.z, IR, IR + 0.12, 0.7, 40, { collide: true });
    if (HAS_DOM) {
      const ring = this.mesh(new THREE.TorusGeometry(IR + 0.05, 0.03, 6, 64), getMat('neonRed'), ic.x, 0.72, ic.z, { rx: Math.PI / 2 });
      ring.castShadow = false;
      this._lavaMoat(ic, IR + 0.1, MR);
    }
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2, x = ic.x + Math.sin(a) * (MR + 0.15), z = ic.z + Math.cos(a) * (MR + 0.15);
      if (Math.abs(Math.sin(a) * (MR + 0.15)) < 1.1 && Math.cos(a) > 0) continue; // el hueco del puente (al sur)
      this.box('lavaRock', x, 0.22, z, 1.2, 0.44, 0.45, { yaw: a });
    }
    this.box('keepStone', 0, 0.35, ic.z + IR + 1.0, 1.8, 0.7, 2.4);
    for (let k = 0; k < 3; k++) this.box('keepStone', 0, (k + 1) * 0.7 / 6, ic.z + IR + 2.35 + (2 - k) * 0.3, 1.8, (k + 1) * 0.7 / 3, 0.3);
    const poles = [];
    for (let k = 0; k < 3; k++) {
      const a = k * (Math.PI * 2 / 3) + Math.PI / 6, x = ic.x + Math.sin(a) * 1.7, z = ic.z + Math.cos(a) * 1.7;
      this.cyl('chrome', x, (0.7 + 7.2) / 2, z, 0.045, 0.045, 7.2 - 0.7, 12);
      this.c.phys.cylinder(x, (0.7 + 7.2) / 2, z, (7.2 - 0.7) / 2, 0.05, { mat: 'metal' });
      poles.push(new THREE.Vector3(x, 0.7, z));
    }
    this.anchors.hellPoles = poles;
    if (HAS_DOM) { const truss = this.mesh(new THREE.TorusGeometry(1.7, 0.08, 8, 40), getMat('iron'), ic.x, 7.2, ic.z, { rx: Math.PI / 2 }); truss.castShadow = false; }
    this.cyl('iron', ic.x, (7.2 + hl.h) / 2, ic.z, 0.03, 0.03, hl.h - 7.2, 4);
    this.c.party.push(this.light(ic.x, 6.6, ic.z, 0xff2a6a, 20, 16, { priority: 2.2, decay: 1.3 }));
    this.world().embers?.add(ic.x, 0.15, ic.z, 70, { radius: MR, height: 7, strength: 0.9, speed: 0.5 });
    for (const a of [Math.PI * 0.75, -Math.PI * 0.25]) this.light(ic.x + Math.sin(a) * 4.5, 0.8, ic.z + Math.cos(a) * 4.5, 0xff4a10, 14, 14, { flicker: true, priority: 1.4, decay: 1.2 });
    // columnas con braseros
    for (const [x, z] of [[-6.4, -488], [6.4, -488], [-6.4, -511], [6.4, -511]]) {
      this.cyl('keepStone', x, hl.h / 2, z, 0.62, 0.7, hl.h, 16, { collide: true });
      this.cyl('iron', x, 3.1, z, 0.95, 0.75, 0.25, 16);
      this.deco('ember', x, 3.24, z, 1.1, 0.04, 1.1);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; this.fire(x + Math.sin(a) * 0.78, 3.25, z + Math.cos(a) * 0.78, 0.18, 0.18, 0.7, 1.1); }
      this.light(x, 4.1, z, 0xff7a2a, 14, 17, { flicker: true, priority: 1.6, decay: 1.2 });
    }
    // la boca del Infierno: escenario del DJ al norte con cuernos, ojos y fauces
    this._mouth(hl);
    // jaulas colgando con esqueletos
    for (const [x, z, y] of [[-3.8, -488.5, 7.4], [3.6, -512, 8], [-4, -512.5, 8.6]]) {
      this.cyl('iron', x, y + 1.7, z, 0.45, 0.45, 0.06, 12);
      this.cyl('iron', x, y - 0.02, z, 0.45, 0.45, 0.06, 12);
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; this.cyl('iron', x + Math.cos(a) * 0.44, y + 0.85, z + Math.sin(a) * 0.44, 0.012, 0.012, 1.7, 4); }
      this.cyl('iron', x, (y + 1.73 + hl.h) / 2, z, 0.015, 0.015, hl.h - y - 1.73, 4);
      this.model('c_skel_sit', x, y + 0.03, z, r() * 6);
    }
    // carteles
    this.neon('EL INFIERNO', { font: 'Metal Mania', px: 150, color: '#ff3a10' }, 7, 1.75, 0, 9.2, -478.62, Math.PI);
    this.neon('abandonen toda esperanza', { font: 'Metal Mania', px: 70, color: '#ff8a40' }, 5.2, 0.65, 0, 8.05, -478.62, Math.PI);
    const fog = this.c.fog;
    if (fog) { for (const [x, z] of [[0, -506], [-4, -494], [4, -494], [0, -516]]) fog.add(x, 0.3, z, 6, { radius: 3.5, height: 1.1, opacity: 0.06, speed: 0.04 }); }
    this.anchors.hellDj = new THREE.Vector3(0, 1.2, hl.z0 + 1.6);
    this.anchors.hellFloor = new THREE.Vector3(0, 0, -509);
  }
  world() { return this.c.world; }
  _rail(x0, z0, x1, z1) {
    const D = W.hell.deck, len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const n = Math.max(1, Math.round(len / 1.4));
    for (let i = 0; i <= n; i++) { const t = i / n; this.cyl('iron', x0 + (x1 - x0) * t, D + 0.55, z0 + (z1 - z0) * t, 0.025, 0.025, 1.1, 6); }
    this.deco('iron', mx, D + 1.1, mz, 0.06, 0.06, len, { yaw });
    this.deco('iron', mx, D + 0.55, mz, 0.03, 0.03, len, { yaw });
    this.c.phys.box(mx, D + 0.6, mz, 0.04, 0.6, len / 2, yaw, { paint: false, mat: 'metal' });
  }
  _mouth(hl) {
    const z0 = hl.z0, sh = 1.2;
    this.box('keepStone', 0, sh / 2, z0 + 3, 12, sh, 6);
    for (let k = 0; k < 4; k++) this.box('keepStone', 0, (k + 1) * sh / 8, z0 + 6.15 + (3 - k) * 0.3, 3, (k + 1) * sh / 4, 0.3);
    this.deco('neonRed', 0, sh + 0.01, z0 + 5.98, 12, 0.03, 0.04);
    // cabina del DJ
    this.box('leatherBlack', 0, sh + 0.55, z0 + 2.6, 3.4, 1.1, 1.0);
    this.deco('neonRed', 0, sh + 0.55, z0 + 3.11, 3.4, 0.04, 0.02);
    for (const s of [-1, 1]) { this.cyl('black', s * 0.85, sh + 1.12, z0 + 2.6, 0.2, 0.2, 0.03, 20); this.deco('darkgray', s * 0.85, sh + 1.11, z0 + 2.6, 0.5, 0.02, 0.5); }
    // fauces: arco de neón con colmillos, ojos rojos y dos cuernos enormes de hueso
    if (HAS_DOM) {
      const arch = this.mesh(new THREE.TorusGeometry(5.2, 0.12, 8, 48, Math.PI), getMat('neonRed'), 0, sh, z0 + 0.35);
      arch.castShadow = false;
    }
    for (let k = 0; k < 11; k++) {
      const a = Math.PI * (0.08 + k * 0.084), x = Math.cos(a) * 5.0, y = sh + Math.sin(a) * 5.0, len = 0.5 + (k % 2) * 0.35;
      this.cyl('bone', x, y - len / 2 - 0.1, z0 + 0.5, 0.14, 0.0, len, 8);
    }
    for (const s of [-1, 1]) {
      this.deco('redLamp', s * 2.6, 8.6, z0 + 0.1, 1.5, 0.55, 0.05);
      // cuerno: segmentos que se afinan y se curvan hacia arriba y afuera
      let x = s * 4.3, y = 7.4, ang = 0;
      for (let k = 0; k < 9; k++) {
        const rr = 0.55 * (1 - k / 10), len = 0.6;
        ang += 0.16;
        const rz = -s * (0.9 - ang);
        this.cyl('bone', x, y, z0 + 0.6, rr * 0.86, rr, len, 12, { rz });
        x += -Math.sin(rz) * len * 0.92; y += Math.cos(rz) * len * 0.92;
      }
      this.fire(s * 5.4, sh, z0 + 5.2, 0.25, 0.25, 1.2, 1.4);
      this.cyl('iron', s * 5.4, sh / 2, z0 + 5.2, 0.3, 0.38, sh, 12);
      this.light(s * 5.4, sh + 1.6, z0 + 5.2, 0xff5a1a, 12, 14, { flicker: true, priority: 1.8, decay: 1.2 });
    }
    this.c.party.push(this.light(0, 7.5, (hl.z0 + hl.z1) / 2, 0xff2010, 18, 30, { priority: 1.9, decay: 1.0 }));
  }
  // piso de basalto con grietas de lava que laten con la música (sin luces: emisivo puro)
  _lavaFloor(hl) {
    const u = { uT: { value: 0 }, uBeat: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */ `
        uniform float uT, uBeat; varying vec2 vP;
        vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
        void main(){
          vec2 p = vP * 0.55;
          vec2 i = floor(p), f = fract(p);
          float d1 = 9.0, d2 = 9.0; vec2 id = vec2(0.0);
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y)), o = h2(i + g);
            float d = length(g + o - f);
            if (d < d1) { d2 = d1; d1 = d; id = i + g; } else if (d < d2) d2 = d;
          }
          float edge = d2 - d1;
          float crack = 1.0 - smoothstep(0.0, 0.09, edge);
          float cell = h2(id).x;
          float pulse = 0.55 + 0.45 * sin(uT * 1.7 + cell * 6.28) ;
          float kick = 0.75 + 0.25 * exp(-fract(uBeat) * 4.0);
          vec3 rock = vec3(0.035, 0.026, 0.022) * (0.75 + 0.5 * cell);
          vec3 lava = mix(vec3(1.0, 0.18, 0.02), vec3(1.0, 0.65, 0.15), crack * crack);
          gl_FragColor = vec4(rock + lava * crack * pulse * kick * 2.2, 1.0);
        }`,
    });
    const m = this.mesh(new THREE.PlaneGeometry(hl.x1 - hl.x0, hl.z1 - hl.z0), mat, 0, 0.025, (hl.z0 + hl.z1) / 2, { rx: -Math.PI / 2 });
    m.receiveShadow = false;
    this.c.anim.push((t, dt, B) => { u.uT.value = t % 1000; u.uBeat.value = B.beat % 1024; });
  }
  _lavaMoat(c, r0, r1) {
    const u = { uT: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: u, toneMapped: false,
      vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */ `
        uniform float uT; varying vec2 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          vec2 p = vP * 1.3; float t = uT * 0.25;
          float v = n(p + vec2(t, -t * 0.6)) * 0.6 + n(p * 2.3 - vec2(t * 1.3, t)) * 0.3 + n(p * 5.0 + t) * 0.1;
          vec3 col = mix(vec3(0.6, 0.05, 0.0), vec3(1.0, 0.55, 0.08), smoothstep(0.35, 0.8, v));
          col = mix(col, vec3(0.08, 0.02, 0.01), smoothstep(0.62, 0.95, n(p * 0.7 - t * 0.2)) * 0.8);
          gl_FragColor = vec4(col * 2.4, 1.0);
        }`,
    });
    const m = this.mesh(new THREE.RingGeometry(r0, r1, 56, 1), mat, c.x, 0.04, c.z, { rx: -Math.PI / 2 });
    m.receiveShadow = false; m.castShadow = false;
    this.c.anim.push((t) => { u.uT.value = t % 1000; });
    this.anchors.lava = { x: c.x, z: c.z, r0, r1 };
  }

  // ---------------------------------------------------------------- sala VIP de los caños
  _vip() {
    const vp = W.vip;
    // paredes de terciopelo con guarda dorada
    for (const [x, z, sx, sz] of [[(vp.x0 + vp.x1) / 2, vp.z0 + 0.05, vp.x1 - vp.x0, 0.05], [vp.x1 - 0.05, (vp.z0 + vp.z1) / 2, 0.05, vp.z1 - vp.z0]]) {
      this.deco('velvet', x, 1.4, z, sx, 2.8, sz);
      this.deco('gold', x, 2.83, z, sx, 0.06, sz);
    }
    this.deco('velvet', 30.2, 1.4, vp.z1 - 0.05, 11.6, 2.8, 0.05);
    this.deco('velvet', 12.25, 1.4, -496.6, 0.05, 2.8, 6.8);
    this.deco('velvet', 12.25, 1.4, -485, 0.05, 2.8, 11.4);
    // tres tarimas redondas con caño, aro de neón abajo y un foco cada una
    const poles = [];
    for (const [x, z] of [[18, -487.5], [30, -487.5], [24, -494.8]]) {
      this.cyl('blackTile', x, 0.24, z, 1.1, 1.2, 0.48, 28, { collide: true });
      if (HAS_DOM) { const ring = this.mesh(new THREE.TorusGeometry(1.16, 0.025, 6, 48), getMat('neonPink'), x, 0.08, z, { rx: Math.PI / 2 }); ring.castShadow = false; }
      this.cyl('chrome', x, (0.48 + vp.h) / 2, z, 0.045, 0.045, vp.h - 0.48, 12);
      this.c.phys.cylinder(x, (0.48 + vp.h) / 2, z, (vp.h - 0.48) / 2, 0.05, { mat: 'metal' });
      poles.push(new THREE.Vector3(x, 0.48, z));
      this.c.party.push(this.light(x, 3.6, z + 0.8, 0xff3cb4, 13, 9, { priority: 1.7, decay: 1.3 }));
    }
    this.anchors.vipPoles = poles;
    // reservados: sillones mirando a las tarimas, mesitas con balde de champán
    [[35.4, -484.5, -Math.PI / 2], [35.4, -491, -Math.PI / 2], [18, -499.45, 0], [30, -499.45, 0], [12.8, -494, Math.PI / 2]].forEach(([x, z, yaw], i) => {
      this.model('b_sofa', x, 0, z, yaw);
      for (const k of [-0.85, 0, 0.85]) this.seat(x + Math.cos(yaw) * k + Math.sin(yaw) * 0.1, 0.48, z - Math.sin(yaw) * k + Math.cos(yaw) * 0.1, yaw, i === 0 && k === 0);
      const tx = x + Math.sin(yaw) * 1.4, tz = z + Math.cos(yaw) * 1.4;
      this.cyl('blackTile', tx, 0.25, tz, 0.4, 0.4, 0.5, 16, { collide: true });
      this.cyl('chrome', tx, 0.62, tz, 0.11, 0.09, 0.22, 12);
      this.cyl('darkGlass', tx + 0.02, 0.78, tz, 0.035, 0.04, 0.28, 8);
    });
    this.neon('VIP', { font: 'Metal Mania', px: 170, color: '#ff3cb4', w: 512 }, 2.4, 1.2, 24, 3.85, vp.z0 + 0.08);
    this.neon('mirar no cuesta nada', { font: 'Rubik', px: 52, color: '#ffb0e0', h: 128 }, 3.2, 0.4, 24, 3.0, vp.z0 + 0.08);
    this.light(24, 3.6, -484, 0xb050ff, 14, 22, { priority: 1.3, decay: 1.0 });
    this.light(32, 2.8, -496, 0xffb080, 9, 14, { priority: 1.1, decay: 1.1 });
    for (const z of [-482, -488, -494, -499]) this.deco('neonPink', vp.x1 - 0.07, 1.9, z, 0.03, 1.8, 0.04);
    for (const x of [15, 21, 27, 33]) this.deco('neonPink', x, 1.9, vp.z0 + 0.08, 0.04, 1.8, 0.03);
    this.deco('neonPurple', (vp.x0 + vp.x1) / 2, vp.h - 0.05, vp.z0 + 0.1, vp.x1 - vp.x0, 0.04, 0.04);
    this.deco('neonPurple', vp.x1 - 0.1, vp.h - 0.05, (vp.z0 + vp.z1) / 2, 0.04, 0.04, vp.z1 - vp.z0);
    this.light(34, 2.6, -486, 0xff70b0, 10, 12, { priority: 1.1, decay: 1.1 });
    this.light(18, 3.4, -482, 0xffc090, 8, 12, { priority: 1.0, decay: 1.1 });
    this.anchors.vipDoor = new THREE.Vector3(15.8, 0, -480.2);
  }

  // ---------------------------------------------------------------- el Arsenal (búnker militar)
  _arsenal() {
    const ar = W.arsenal, r = this.rand;
    // líneas pintadas en el piso, caños y cables por el techo
    for (const [x, z, sx, sz] of [[31.5, -469.5, 8, 0.12], [31.5, -460.5, 8, 0.12], [27.5, -465, 0.12, 9], [35.5, -465, 0.12, 9], [38.6, -466.5, 0.14, 19]]) this.deco('hazard', x, 0.045, z, sx, 0.01, sz);
    for (const x of [26, 26.35]) this.cyl('rust', x, ar.h - 0.18, (ar.z0 + ar.z1) / 2, 0.06, 0.06, ar.z1 - ar.z0, 8, { rx: Math.PI / 2 });
    this.cyl('black', 45.7, ar.h - 0.25, (ar.z0 + ar.z1) / 2, 0.03, 0.03, ar.z1 - ar.z0, 6, { rx: Math.PI / 2 });
    // estanterías con fusiles y cajas de munición contra el muro norte
    const rifles = [], ammo = [];
    for (let i = 0; i < 4; i++) {
      const x = 28.5 + i * 1.05;
      this.model('b_rack', x, 0, ar.z0 + 0.35, 0);
      for (const y of [0.42, 0.95]) rifles.push(mat4(x, y + 0.04, ar.z0 + 0.4, 0, 0.72, 0, 0));
      for (const y of [1.45, 1.92]) for (let k = 0; k < 3; k++) ammo.push(mat4(x - 0.28 + k * 0.28, y, ar.z0 + 0.38, Math.PI / 2));
    }
    for (const m of rifles) this.modelM('b_rifle', m);
    for (const m of ammo) this.modelM('b_ammo', m);
    // fusiles parados en un armero de pared (al lado de la entrada)
    this.deco('blackWood', 25.0, 1.1, -470.5, 0.12, 0.08, 3.2);
    this.deco('blackWood', 25.0, 0.12, -470.5, 0.5, 0.08, 3.2);
    for (let k = 0; k < 6; k++) this.model('b_rifle', 24.95, 0.62, -471.9 + k * 0.55, Math.PI / 2, 1, 0, Math.PI / 2);
    // banco de trabajo con las pistolas (acá se agarran)
    const bx = 35.8, bz = ar.z0 + 0.55;
    this.box('blackWood', bx, 0.45, bz, 5, 0.9, 1.0);
    this.deco('steel', bx, 0.92, bz, 5.1, 0.04, 1.1);
    this.deco('blackWood', bx, 2.05, ar.z0 + 0.05, 5, 1.6, 0.08);
    for (const y of [1.55, 1.95, 2.35]) this.modelM('b_rifle', mat4(bx, y, ar.z0 + 0.14, 0, 1));
    for (let k = 0; k < 3; k++) this.model('b_pistols', bx - 1.6 + k * 1.6, 0.94, bz + 0.05, (r() - 0.5) * 0.3);
    this.model('b_medbox', bx + 2.1, 0.94, bz, 0.3);
    this.c.use('club_pistol', [bx, 1.1, bz + 0.9], 2.2, 'Agarrar una pistola', { e: 'give', item: 'pistol' });
    this.anchors.sarge = new THREE.Vector3(37.4, 0, -457.6);
    this._range();
    // emplazamiento de bolsas de arena con la red de camuflaje y el reflector; el cajón abierto de granadas
    const sx = 31.5, sz = -465;
    this._sandbags(sx, sz);
    this.model('b_searchlight', sx, 0.6, sz + 3, -2.2);
    this.model('b_crate_old', sx + 0.2, 0, sz - 2.2, 0.08);
    for (let k = 0; k < 8; k++) this.modelM('b_stickgren', mat4(sx - 0.4 + (k % 4) * 0.13, 0.24, sz - 2.0 + Math.floor(k / 4) * 0.2, 0, 1, Math.PI / 2, 0.2));
    this.c.use('club_nade', [sx + 0.2, 0.9, sz - 1.4], 1.8, 'Agarrar una granada', { e: 'give', item: 'grenade' });
    // cajones apilados, bidones, botiquines y estantes contra el muro sur
    for (const [x, y, z, yaw] of [[30, 0, -456.7, 0], [31.4, 0, -456.7, 0], [30.7, 0.464, -456.7, 0.05], [43.6, 0, -457, 0], [43.6, 0.464, -457, -0.04]]) this.model('b_crate_wood', x, y, z, yaw);
    for (const [x, z] of [[27.5, -456.6], [27.9, -456.7], [41.2, -456.6]]) this.model('b_jerrycan', x, 0, z, r() * 0.4);
    for (const x of [37.6, 38.3]) this.model('b_shelf_steel', x, 0, -456.5, Math.PI);
    // escritorio con la radio, máscaras de gas colgadas, tablero eléctrico, apliques y tubos
    this.box('blackWood', 27.5, 0.4, -459.2, 1.6, 0.8, 0.9);
    this.deco('olive', 27.5, 0.82, -459.2, 1.7, 0.04, 1.0);
    this.model('b_radio', 27.4, 0.84, -459.25, Math.PI);
    for (let k = 0; k < 4; k++) this.model('b_gasmask', 32.8 + k * 0.55, 0.85, -456.2, Math.PI);
    this.model('b_powerbox', 26.6, 1.3, ar.z0 + 0.25, 0);
    for (const [x, z] of [[29, -472], [41, -472], [29, -461], [41, -461]]) { this.model('b_fluo', x, ar.h - 0.04, z, 0); this.light(x, ar.h - 0.6, z, 0xdfeeff, 11, 12, { priority: 1.05, decay: 1.2 }); }
    // baliza de alarma que gira (roja) arriba de la entrada
    this.cyl('redLamp', 24.65, 3.35, -475, 0.09, 0.09, 0.16, 12);
    const beacon = this.light(25.6, 3.2, -475, 0xff1a10, 0, 9, { priority: 1.3 });
    if (HAS_DOM) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      cone.geometry.translate(0, -1.7, 0); cone.rotation.z = Math.PI / 2;
      const pivot = new THREE.Group(); pivot.position.set(24.65, 3.35, -475); pivot.add(cone); this.c.group.add(pivot);
      this.c.anim.push((t) => { pivot.rotation.y = t * 4; beacon.intensity = 4 + 3 * Math.max(0, Math.cos(t * 4)); });
    }
    this.sign((g, w, h) => {
      g.fillStyle = '#c9c4b2'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(160,20,20,0.9)'; g.font = 'bold 120px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('ARSENAL', w / 2, h * 0.38);
      g.fillStyle = '#222'; g.font = 'bold 40px "Courier New", monospace'; g.fillText('LO QUE SE LLEVA, SE DEVUELVE (MENTIRA)', w / 2, h * 0.78);
    }, 1024, 260, 5.2, 1.3, 36.6, 3.0, ar.z0 + 0.05);
    this.sign((g, w, h) => {
      g.fillStyle = '#f2f0e6'; g.fillRect(0, 0, w, h); g.fillStyle = '#b01010'; g.beginPath(); g.arc(w / 2, 120, 90, 0, 7); g.lineWidth = 22; g.strokeStyle = '#b01010'; g.stroke();
      g.beginPath(); g.moveTo(w / 2 - 64, 56); g.lineTo(w / 2 + 64, 184); g.stroke();
      g.fillStyle = '#222'; g.font = 'bold 40px Rubik, sans-serif'; g.textAlign = 'center'; g.fillText('PROHIBIDO FUMAR', w / 2, 270);
      g.font = '22px Rubik, sans-serif'; g.fillText('(el coffeeshop queda en la otra punta)', w / 2, 305);
    }, 400, 330, 0.75, 0.62, ar.x1 - 0.05, 1.9, -460, -Math.PI / 2);
    // olor a pólvora: un poco de humo de reflector
    const fog = this.c.fog;
    if (fog) fog.add(35, 2.4, -466, 4, { radius: 5, height: 0.6, opacity: 0.03, speed: 0.02 });
  }
  // polígono de tiro: mostrador en la línea de tiro, cuatro calles con separadores y blancos de papel al fondo. Los
  // blancos se balancean con cada tiro, te dicen el puntaje y les quedan los agujeros (bunker-items.js: kind 'target').
  _range() {
    const ar = W.arsenal, x0 = 38.9, x1 = ar.x1, lanes = [-473.5, -469.5, -465.5, -461.5];
    this.box('blackWood', x0 + 0.3, 0.5, -466.5, 0.6, 1.0, 18.5);
    this.deco('steel', x0 + 0.3, 1.02, -466.5, 0.7, 0.04, 18.6);
    for (const z of [-475.5, -471.5, -467.5, -463.5, -459.5]) { this.box('bunkerConcrete', x0 + 2.2, 1.1, z, 3.2, 2.2, 0.12, { noShadow: true }); this.deco('hazard', x0 + 0.62, 1.04, z, 0.05, 0.05, 0.3); }
    this.box('dirt', x1 - 0.5, 0.6, -466.5, 0.9, 1.2, 18.6, { rz: 0.35 }); // talud de tierra atrás de los blancos
    this.sign((g, w, h) => {
      g.fillStyle = '#2f3524'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8b020'; g.font = 'bold 80px "Courier New", monospace'; g.textAlign = 'center';
      g.fillText('POLÍGONO', w / 2, 95); g.font = 'bold 30px "Courier New", monospace'; g.fillStyle = '#e8e2c8'; g.fillText('agarrá una pistola y tirale al papel', w / 2, 150);
    }, 700, 190, 3.2, 0.87, x1 - 0.05, 3.25, -466.5, -Math.PI / 2);
    if (!HAS_DOM) return;
    this.targets = [];
    for (const z of lanes) {
      const cv = canvas(256, 384), g = cv.getContext('2d');
      const draw = () => {
        g.fillStyle = '#efe6cf'; g.fillRect(0, 0, 256, 384);
        g.fillStyle = '#20242a'; g.beginPath(); g.ellipse(128, 92, 46, 54, 0, 0, 7); g.fill();
        g.beginPath(); g.moveTo(40, 384); g.quadraticCurveTo(44, 168, 128, 160); g.quadraticCurveTo(212, 168, 216, 384); g.fill();
        g.strokeStyle = '#efe6cf'; g.lineWidth = 3;
        for (const [rr, y] of [[20, 230], [45, 230], [70, 230], [16, 92], [34, 92]]) { g.beginPath(); g.arc(128, y, rr, 0, 7); g.stroke(); }
        g.fillStyle = '#c0392b'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('10', 128, 238);
      };
      draw();
      const tex = ctex(cv);
      const t = { z, cv, g, tex, draw, holes: 0, swing: 0, v: 0 };
      const pivot = new THREE.Group(); pivot.position.set(x1 - 1.3, 2.05, z);
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.93), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
      paper.position.y = -0.55; paper.rotation.y = -Math.PI / 2; paper.castShadow = true;
      pivot.add(paper);
      this.c.group.add(pivot);
      for (const s of [-1, 1]) this.cyl('iron', x1 - 1.3, 2.25, z + s * 0.38, 0.012, 0.012, 0.5, 4);
      this.deco('iron', x1 - 1.3, 2.5, z, 0.04, 0.04, 0.9);
      t.pivot = pivot; t.paper = paper;
      // el blanco tiene su collider (las balas le pegan); bunker-items.js le avisa con hit()
      const col = this.c.phys.box(x1 - 1.3, 1.5, z, 0.02, 0.47, 0.31, 0, { paint: false, mat: 'wood' });
      t.hit = (point) => this._targetHit(t, point);
      this.c.phys.tag(col, { kind: 'target', ref: t, mat: 'wood' });
      this.targets.push(t);
    }
    this.c.anim.push((tt, dt) => {
      for (const t of this.targets) {
        if (Math.abs(t.swing) < 1e-4 && Math.abs(t.v) < 1e-4) continue;
        t.v += (-40 * t.swing - 3 * t.v) * dt; t.swing += t.v * dt;
        t.pivot.rotation.z = t.swing;
      }
    });
    this.light(x1 - 2.2, 3.2, -466.5, 0xfff0d8, 10, 12, { priority: 1.1, decay: 1.2 });
  }
  _targetHit(t, point) {
    // dónde le pegó, en el papel (u: de izquierda a derecha mirando desde la línea de tiro, v: de arriba abajo)
    const local = t.paper.worldToLocal(point.clone());
    const u = THREE.MathUtils.clamp(local.x / 0.62 + 0.5, 0, 1), v = THREE.MathUtils.clamp(0.5 - local.y / 0.93, 0, 1);
    const px = u * 256, py = v * 384;
    const d = Math.min(Math.hypot(px - 128, py - 230) / 70, Math.hypot(px - 128, py - 92) / 34 * 1.2);
    const pts = d < 0.3 ? 10 : d < 0.65 ? 8 : d < 1 ? 5 : 1;
    if (t.holes > 40) { t.draw(); t.holes = 0; }
    t.g.fillStyle = '#111'; t.g.beginPath(); t.g.arc(px, py, 4, 0, 7); t.g.fill();
    t.g.strokeStyle = 'rgba(80,60,40,0.6)'; t.g.lineWidth = 1.5; t.g.stroke();
    t.holes++; t.tex.needsUpdate = true;
    t.v += 2.2;
    G.hud?.notify(pts === 10 ? '🎯 <b>¡CENTRO!</b> 10' : `🎯 ${pts}`, 900);
  }

  // bolsas de arena (instanciadas) en U alrededor de (x, z), con la red de camuflaje encima
  _sandbags(x, z) {
    const list = [];
    const put = (px, pz, yaw, layers) => { for (let l = 0; l < layers; l++) list.push(mat4(px, 0.1 + l * 0.19, pz, yaw + (this.rand() - 0.5) * 0.15, 1, (this.rand() - 0.5) * 0.06, (this.rand() - 0.5) * 0.06)); };
    for (let i = 0; i < 8; i++) put(x - 2.8 + i * 0.8, z + 3.0, 0, 3);
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) put(x + s * 3.2, z - 2.0 + i * 0.8, Math.PI / 2, 3);
    if (HAS_DOM) {
      const cv = canvas(128, 64), g = cv.getContext('2d');
      g.fillStyle = '#8c7b56'; g.fillRect(0, 0, 128, 64);
      g.strokeStyle = 'rgba(60,48,30,0.35)'; g.lineWidth = 1;
      for (let k = 0; k < 128; k += 3) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 64); g.stroke(); }
      for (let k = 0; k < 64; k += 3) { g.beginPath(); g.moveTo(0, k); g.lineTo(128, k); g.stroke(); }
      const geo = new THREE.SphereGeometry(1, 12, 8); geo.scale(0.4, 0.11, 0.21);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: ctex(cv), roughness: 1 }), list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true;
      this.c.group.add(im);
      // red de camuflaje colgando de cuatro postes
      const cam = canvas(256, 256), cg = cam.getContext('2d');
      cg.clearRect(0, 0, 256, 256);
      const rr = rng(77), cols = ['#3d4a2a', '#5a5a34', '#2c3320', '#6b6440'];
      for (let k = 0; k < 90; k++) { cg.fillStyle = cols[k % 4]; cg.beginPath(); cg.ellipse(rr() * 256, rr() * 256, 8 + rr() * 22, 6 + rr() * 14, rr() * 3, 0, 7); cg.fill(); }
      const tex = ctex(cam); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 2);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 6.6, 8, 8), new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }));
      const pos = net.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { const px = pos.getX(i), py = pos.getY(i); pos.setZ(i, -0.35 * Math.cos(px / 7.4 * Math.PI) * Math.cos(py / 6.6 * Math.PI)); }
      net.geometry.computeVertexNormals();
      net.position.set(x, 2.55, z); net.rotation.x = -Math.PI / 2; net.castShadow = false;
      this.c.group.add(net);
    }
    for (const [px, pz] of [[x - 3.4, z - 3], [x + 3.4, z - 3], [x - 3.4, z + 3.2], [x + 3.4, z + 3.2]]) this.cyl('blackWood', px, 1.25, pz, 0.04, 0.04, 2.5, 6);
    // colliders: tres muretes bajos
    this.c.phys.box(x, 0.3, z + 3.0, 3.2, 0.3, 0.2, 0, { mat: 'sand' });
    for (const s of [-1, 1]) this.c.phys.box(x + s * 3.2, 0.3, z, 0.2, 0.3, 2.4, 0, { mat: 'sand' });
  }

  // ---------------------------------------------------------------- ala oeste: estructura (sala psicodélica + laberinto)
  _westShell() {
    const c = this.c, ps = W.psico, mz = W.maze;
    c.deco('black', (ps.x0 + ps.x1) / 2, 0.015, (ps.z0 + ps.z1) / 2, ps.x1 - ps.x0, 0.03, ps.z1 - ps.z0);
    c.deco('blackTile', (mz.x0 + mz.x1) / 2, 0.02, (mz.z0 + mz.z1) / 2, mz.x1 - mz.x0, 0.04, mz.z1 - mz.z0);
    c.deco('black', (ps.x0 + ps.x1) / 2, ps.h + 0.15, (ps.z0 + ps.z1) / 2, ps.x1 - ps.x0 + 0.4, 0.3, ps.z1 - ps.z0 + 0.4);
    c.deco('black', (mz.x0 + mz.x1) / 2, mz.h + 0.15, (mz.z0 + mz.z1) / 2, mz.x1 - mz.x0 + 0.4, 0.3, mz.z1 - mz.z0 + 0.4);
    c.wallZ('bunkerBrick', ps.x0 - WT / 2, mz.z1 + 0.4, ps.z0 - 0.4, ps.h + 0.3); // oeste de las dos
    c.wallX('bunkerBrick', mz.x0 - WT, mz.x1, mz.z1 + 0.2, mz.h + 0.3); // sur del laberinto
    c.wallX('bunkerBrick', ps.x0, ps.x1, ps.z1, ps.h + 0.3, [[-37.2, -34.8, 0, 2.8]]); // entre las dos, con puerta
    // la puerta desde el club (lado del club): neón que respira
    this.neon('LA MENTE', { font: 'Metal Mania', px: 130, color: '#c050ff' }, 2.8, 0.7, H.x0 + 0.03, 3.75, -471, Math.PI / 2);
    for (const s of [-1, 1]) c.deco('neonPurple', H.x0 + 0.03, 1.5, -471 + s * 1.26, 0.04, 3.0, 0.05);
    c.deco('neonPurple', H.x0 + 0.03, 3.02, -471, 0.04, 0.05, 2.56);
  }

  // ---------------------------------------------------------------- sala psicodélica
  _psico() {
    const ps = W.psico, r = this.rand;
    // piso, techo y paredes con el mismo shader: caleidoscopio y espiral op-art que laten con la música
    if (HAS_DOM) {
      const mat = this._psyMat();
      const w = ps.x1 - ps.x0, d = ps.z1 - ps.z0, cx = (ps.x0 + ps.x1) / 2, cz = (ps.z0 + ps.z1) / 2;
      const planes = [
        [w, d, cx, 0.035, cz, 0, -Math.PI / 2], [w, d, cx, ps.h - 0.01, cz, 0, Math.PI / 2],
        [w, ps.h, cx, ps.h / 2, ps.z0 + 0.02, 0, 0], [d, ps.h, ps.x0 + 0.02, ps.h / 2, cz, Math.PI / 2, 0],
        [-37.2 - ps.x0, ps.h, (ps.x0 - 37.2) / 2, ps.h / 2, ps.z1 - 0.02, Math.PI, 0],
        [ps.x1 + 34.8, ps.h, (ps.x1 - 34.8) / 2, ps.h / 2, ps.z1 - 0.02, Math.PI, 0],
        [2.4, ps.h - 2.8, -36, 2.8 + (ps.h - 2.8) / 2, ps.z1 - 0.02, Math.PI, 0],
        [-471 - 1.2 - ps.z0, ps.h, ps.x1 - 0.02, ps.h / 2, (ps.z0 - 472.2) / 2, -Math.PI / 2, 0],
        [ps.z1 - (-469.8), ps.h, ps.x1 - 0.02, ps.h / 2, (ps.z1 - 469.8) / 2, -Math.PI / 2, 0],
        [2.4, ps.h - 3, ps.x1 - 0.02, 3 + (ps.h - 3) / 2, -471, -Math.PI / 2, 0],
      ];
      for (const [pw, ph, x, y, z, yaw, rx] of planes) { const m = this.mesh(new THREE.PlaneGeometry(Math.abs(pw), ph), mat, x, y, z, { yaw, rx }); m.receiveShadow = false; m.castShadow = false; }
    }
    // hongos gigantes que brillan (los sombreros son emisivos)
    const caps = [['shroomPink'], ['shroomCyan'], ['shroomLime']];
    const shrooms = [[-45.5, -475.5, 3.2, 1.6], [-43, -467.5, 2.2, 1.1], [-31, -476, 2.6, 1.3], [-27.5, -466.5, 1.6, 0.8], [-39.5, -475.8, 1.2, 0.7], [-33.5, -466.2, 1.0, 0.6]];
    shrooms.forEach(([x, z, h, rr], i) => {
      const cap = caps[i % 3][0];
      this.cyl('shroomStem', x, h / 2, z, rr * 0.22, rr * 0.3, h, 14, { collide: true });
      const g = new THREE.SphereGeometry(rr, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.62, 1);
      this.c.b.geo(cap, g, mat4(x, h - 0.05, z, r() * 6));
      const under = new THREE.CircleGeometry(rr * 0.98, 24); under.rotateX(Math.PI / 2);
      this.c.b.geo('shroomStem', under, mat4(x, h - 0.04, z));
      for (let k = 0; k < 7; k++) { const a = r() * Math.PI * 2, e = 0.35 + r() * 0.5, s = new THREE.SphereGeometry(rr * 0.09, 8, 6); s.scale(1, 0.4, 1); this.c.b.geo('white', s, mat4(x + Math.cos(a) * Math.sin(e) * rr, h - 0.05 + Math.cos(e) * rr * 0.62, z + Math.sin(a) * Math.sin(e) * rr)); }
    });
    // ojos que flotan y te siguen con la mirada
    if (HAS_DOM) {
      const tex = this._eyeTex(), eyes = [];
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, emissive: 0x221111, emissiveMap: tex, emissiveIntensity: 0.6 });
      for (const [x, y, z, s] of [[-38, 3.2, -469], [-30, 2.6, -472.5], [-44, 2.4, -470], [-26.5, 3.4, -475.5], [-35, 3.9, -476]]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.32 * (s || 1), 24, 16), mat);
        e.position.set(x, y, z); e.castShadow = false; this.c.group.add(e); eyes.push({ e, y, ph: r() * 6 });
      }
      this.c.anim.push((t) => { const cam = G.camera?.position; for (const o of eyes) { o.e.position.y = o.y + Math.sin(t * 0.8 + o.ph) * 0.25; if (cam) o.e.lookAt(cam); } });
    }
    // lámparas de lava sobre mesitas bajas y puf para tirarse
    if (HAS_DOM) {
      const lava = this._lavaLampMat();
      for (const [x, z] of [[-41, -467], [-29.5, -469.5], [-36, -476.6], [-46.8, -466]]) {
        this.cyl('blackTile', x, 0.2, z, 0.35, 0.35, 0.4, 14, { collide: true });
        this.cyl('gold', x, 0.48, z, 0.09, 0.12, 0.16, 12);
        const m = this.mesh(new THREE.CylinderGeometry(0.075, 0.11, 0.5, 16), lava, x, 0.81, z); m.castShadow = false;
        this.cyl('gold', x, 1.1, z, 0.04, 0.075, 0.08, 12);
        this.light(x, 1.0, z, 0xff50a0, 2.2, 4, { priority: 0.9 });
      }
    }
    for (const [x, z, col] of [[-40, -469.6, 'shroomPink'], [-38.6, -468.2, 'shroomCyan'], [-31, -470.8, 'shroomLime'], [-29.2, -472.4, 'shroomPink'], [-44.5, -472.2, 'shroomCyan'], [-33, -474, 'shroomLime']]) {
      const g = new THREE.SphereGeometry(0.62, 18, 10); g.scale(1, 0.55, 1);
      this.c.b.geo(col, g, mat4(x, 0.3, z));
      this.seat(x, 0.42, z, r() * 6);
    }
    // espejo infinito en la pared oeste y espiral hipnótica en la norte
    if (HAS_DOM) {
      this.deco('chrome', ps.x0 + 0.08, 2.2, -471, 0.1, 2.5, 3.6);
      this.mesh(new THREE.PlaneGeometry(3.3, 2.2), this._infinityMat(), ps.x0 + 0.14, 2.2, -471, { yaw: Math.PI / 2 });
      this.mesh(new THREE.CircleGeometry(1.5, 48), this._spiralMat(), -36, 2.6, ps.z0 + 0.06);
    }
    this.neon('volá alto', { font: 'Metal Mania', px: 110, color: '#30e8ff' }, 3.2, 0.8, -36, 4.45, ps.z0 + 0.07);
    // La Chamana: atiende en un puesto con telas, velas y frascos (sus cosas pegan distinto: game/club.js _drug)
    this.anchors.shaman = new THREE.Vector3(-30.5, 0, ps.z0 + 1.35);
    this.box('blackWood', -30.5, 0.45, ps.z0 + 2.2, 2.4, 0.9, 0.7);
    this.deco('velvet', -30.5, 0.92, ps.z0 + 2.2, 2.5, 0.03, 0.8);
    for (let k = 0; k < 6; k++) { this.cyl('bongGlass', -31.5 + k * 0.4, 1.04, ps.z0 + 2.2, 0.05, 0.05, 0.18, 10); this.cyl(['shroomPink', 'shroomCyan', 'shroomLime'][k % 3], -31.5 + k * 0.4, 0.99, ps.z0 + 2.2, 0.042, 0.042, 0.07, 8); }
    for (let k = 0; k < 4; k++) { const cx = -31.9 + k * 0.9; this.cyl('wax', cx, 1.0, ps.z0 + 2.45, 0.025, 0.03, 0.14, 8); this.world().flames?.add(cx, 1.09, ps.z0 + 2.45, 0.02, 0.05); }
    this.c.use('club_shaman', [-30.5, 1.0, ps.z0 + 2.7], 2.2, 'Hablar con La Chamana', { e: 'shaman' });
    this.light(-41, 3.6, -471, 0x8a3cff, 10, 16, { priority: 1.2, decay: 1.0 });
    this.light(-30, 3.6, -471, 0xff3cc8, 9, 15, { priority: 1.2, decay: 1.0 });
    const fog = this.c.fog;
    if (fog) fog.add(-36, 0.4, -471, 8, { radius: 7, height: 0.8, opacity: 0.05, speed: 0.03 });
  }
  _psyMat() {
    const u = { uT: { value: 0 }, uBeat: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: u, side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */ `
        uniform float uT, uBeat; varying vec3 vW; varying vec3 vN;
        vec3 pal(float t){ return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }
        void main(){
          vec3 n = abs(vN);
          vec2 p = n.y > 0.5 ? vW.xz : (n.x > 0.5 ? vW.zy : vW.xy);
          vec2 q = fract(p / 4.0) - 0.5;
          float r = length(q), a = atan(q.y, q.x);
          float k = 6.0, s = 6.2831 / k; a = abs(mod(a, s) - s * 0.5);
          vec2 kq = r * vec2(cos(a), sin(a));
          float v = sin(kq.x * 26.0 - uT * 2.0) + sin(kq.y * 30.0 + uT * 1.3) + sin(r * 34.0 - uT * 3.0);
          float beat = exp(-fract(uBeat) * 3.0);
          vec3 col = pal(v * 0.12 + uT * 0.05 + r * 0.8 + floor(p.x / 4.0) * 0.13);
          float sp = sin(a * k + log(r + 0.02) * 9.0 - uT * 3.0);
          col *= 0.35 + 0.65 * smoothstep(-0.25, 0.25, sp);
          gl_FragColor = vec4(col * (0.55 + 0.35 * beat), 1.0);
        }`,
    });
    this.c.anim.push((t, dt, B) => { u.uT.value = t % 1000; u.uBeat.value = B.beat % 1024; });
    return m;
  }
  _eyeTex() {
    const cv = canvas(512, 256), g = cv.getContext('2d');
    g.fillStyle = '#f2eee6'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = 'rgba(190,30,30,0.6)'; g.lineWidth = 1.5;
    const rr = rng(13);
    for (let k = 0; k < 40; k++) { let x = 128 + (rr() - 0.5) * 300, y = 128 + (rr() - 0.5) * 220; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (128 - x) * 0.15 + (rr() - 0.5) * 14; y += (128 - y) * 0.15 + (rr() - 0.5) * 14; g.lineTo(x, y); } g.stroke(); }
    const ir = g.createRadialGradient(128, 128, 6, 128, 128, 48);
    ir.addColorStop(0, '#2a1400'); ir.addColorStop(0.35, '#7a3cff'); ir.addColorStop(0.75, '#30e8ff'); ir.addColorStop(1, '#103040');
    g.fillStyle = ir; g.beginPath(); g.arc(128, 128, 48, 0, 7); g.fill();
    g.fillStyle = '#050505'; g.beginPath(); g.arc(128, 128, 20, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(116, 116, 7, 0, 7); g.fill();
    return ctex(cv);
  }
  _lavaLampMat() {
    const u = { uT: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: u, toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uT; varying vec2 vUv;
        void main(){
          float y = vUv.y, x = vUv.x * 6.2831;
          float b = 0.0;
          for (int i = 0; i < 4; i++) { float fi = float(i); float c = fract(uT * (0.05 + fi * 0.017) + fi * 0.27); c = 0.5 + 0.45 * sin(c * 6.2831); b += 0.018 / (pow(y - c, 2.0) + 0.012 + 0.01 * sin(x * (1.0 + fi) + uT)); }
          vec3 liquid = vec3(0.35, 0.05, 0.25), wax = vec3(1.0, 0.35, 0.55);
          gl_FragColor = vec4(mix(liquid, wax, smoothstep(0.7, 1.1, b)) * 1.6, 1.0);
        }`,
    });
    this.c.anim.push((t) => { u.uT.value = t % 1000; });
    return m;
  }
  _infinityMat() {
    const u = { uT: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: u, toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uT; varying vec2 vUv;
        vec3 pal(float t){ return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }
        void main(){
          vec2 p = (vUv - 0.5) * vec2(1.5, 1.0) * 2.0;
          float m = max(abs(p.x) / 1.5, abs(p.y));
          float d = log(max(m, 0.002)) / log(0.8) + uT * 0.6;
          float line = smoothstep(0.12, 0.0, abs(fract(d) - 0.5) - 0.38);
          float fade = pow(0.88, floor(log(max(m, 0.002)) / log(0.8)));
          vec3 col = pal(floor(d) * 0.13 + uT * 0.05) * line * fade * 2.4;
          gl_FragColor = vec4(col + vec3(0.01, 0.005, 0.02), 1.0);
        }`,
    });
    this.c.anim.push((t) => { u.uT.value = t % 1000; });
    return m;
  }
  _spiralMat() {
    const u = { uT: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform float uT; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; float r = length(p), a = atan(p.y, p.x);
          float s = sin(a * 3.0 + r * 40.0 - uT * 5.0);
          float v = smoothstep(-0.1, 0.1, s);
          gl_FragColor = vec4(vec3(v * 0.9 + 0.05), 1.0);
        }`,
    });
    this.c.anim.push((t) => { u.uT.value = t % 1000; });
    return m;
  }

  // ---------------------------------------------------------------- laberinto de espejos
  _maze() {
    const mz = W.maze, cols = 9, rows = 5, cw = (mz.x1 - mz.x0) / cols, ch = (mz.z1 - mz.z0) / rows, wh = 3.0;
    // espejos de las paredes: reflejan un cubo que se renderiza a baja resolución y solo con alguien adentro
    if (HAS_DOM) {
      this.cubeRT = new THREE.WebGLCubeRenderTarget(128);
      this.cubeCam = new THREE.CubeCamera(0.1, 30, this.cubeRT);
      this.cubeCam.position.set((mz.x0 + mz.x1) / 2, 1.6, (mz.z0 + mz.z1) / 2);
      this.cubeCam.layers.set(MIRROR_LAYER);
      this.c.group.add(this.cubeCam);
      defineMat('mazeMirror', new THREE.MeshStandardMaterial({ color: 0xd8e4ee, metalness: 1, roughness: 0.04, envMap: this.cubeRT.texture, envMapIntensity: 1.25, normalMap: this._waveNormal(), normalScale: new THREE.Vector2(0.35, 0.35) }));
    } else defineMat('mazeMirror', new THREE.MeshStandardMaterial({ color: 0xd8e4ee, metalness: 1, roughness: 0.04 }));
    // laberinto: búsqueda en profundidad con semilla (siempre el mismo), entrada al norte en el medio, y unos atajos
    const rr = rng(1979), east = [], south = [];
    for (let i = 0; i < cols; i++) { east.push(new Array(rows).fill(true)); south.push(new Array(rows).fill(true)); }
    const seen = new Set(), stack = [[4, 0]]; seen.add('4,0');
    while (stack.length) {
      const [i, j] = stack[stack.length - 1];
      const nb = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < cols && b < rows && !seen.has(a + ',' + b));
      if (!nb.length) { stack.pop(); continue; }
      const [a, b] = nb[Math.floor(rr() * nb.length)];
      if (a !== i) east[Math.min(a, i)][j] = false; else south[i][Math.min(b, j)] = false;
      seen.add(a + ',' + b); stack.push([a, b]);
    }
    for (let k = 0; k < 6; k++) { const i = Math.floor(rr() * (cols - 1)), j = Math.floor(rr() * rows); east[i][j] = false; }
    const panel = (x, z, len, alongX) => {
      this.box('mazeMirror', x, wh / 2, z, alongX ? len + 0.1 : 0.1, wh, alongX ? 0.1 : len + 0.1, { noShadow: true });
      this.deco('neonCyan', x, wh + 0.02, z, alongX ? len : 0.05, 0.04, alongX ? 0.05 : len);
    };
    for (let i = 0; i < cols - 1; i++) for (let j = 0; j < rows; j++) if (east[i][j]) panel(mz.x0 + (i + 1) * cw, mz.z0 + (j + 0.5) * ch, ch, false);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows - 1; j++) if (south[i][j]) panel(mz.x0 + (i + 0.5) * cw, mz.z0 + (j + 1) * ch, cw, true);
    // forro espejado en las paredes del borde
    this.deco('mazeMirror', mz.x0 + 0.04, wh / 2, (mz.z0 + mz.z1) / 2, 0.04, wh, mz.z1 - mz.z0);
    this.deco('mazeMirror', mz.x1 - 0.04, wh / 2, (mz.z0 + mz.z1) / 2, 0.04, wh, mz.z1 - mz.z0);
    this.deco('mazeMirror', (mz.x0 - 37.2) / 2, wh / 2, mz.z0 + 0.04, -37.2 - mz.x0, wh, 0.04);
    this.deco('mazeMirror', (mz.x1 - 34.8) / 2, wh / 2, mz.z0 + 0.04, mz.x1 + 34.8, wh, 0.04);
    this.deco('mazeMirror', (mz.x0 + mz.x1) / 2, wh / 2, mz.z1 - 0.04, mz.x1 - mz.x0, wh, 0.04);
    // al fondo, tres espejos deformantes de verdad (te ves con panza, finito u ondulado): solo uno se renderiza a la vez
    this.funhouse = [];
    if (HAS_DOM) {
      [1, 4, 7].forEach((i, k) => {
        const x = mz.x0 + (i + 0.5) * cw, z = mz.z1 - 0.07;
        this.deco('gold', x, 1.55, z + 0.01, 2.0, 2.9, 0.04);
        const m = new Reflector(new THREE.PlaneGeometry(1.8, 2.7), { textureWidth: 512, textureHeight: 768, clipBias: 0.003, color: 0xe8eef4, multisample: 0, shader: FUNHOUSE });
        m.position.set(x, 1.55, z - 0.02); m.rotation.y = Math.PI;
        m.material.uniforms.uMode.value = k;
        m.visible = false;
        // en primera persona tu cabeza está oculta: en el espejo se tiene que ver
        const orig = m.onBeforeRender;
        m.onBeforeRender = (r, s, cam) => { const ch2 = G.me?.char, hv = ch2?.headVisible; if (ch2 && !hv) ch2.setVisibleHead(true); orig.call(m, r, s, cam); if (ch2 && !hv) ch2.setVisibleHead(false); };
        this.c.group.add(m);
        this.funhouse.push(m);
      });
    }
    // piso de damero (de feria) y una grilla de paneles de luz en el techo que los espejos multiplican
    if (HAS_DOM) {
      const cv = canvas(64, 64), g = cv.getContext('2d');
      g.fillStyle = '#e8e8ec'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#0b0b10'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
      const tx = ctex(cv); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.magFilter = THREE.NearestFilter;
      const chk = defineMat('checker', new THREE.MeshStandardMaterial({ map: tx, roughness: 0.18, metalness: 0.1 }));
      chk.userData.tileU = chk.userData.tileV = 1.2;
      this.deco('checker', (mz.x0 + mz.x1) / 2, 0.045, (mz.z0 + mz.z1) / 2, mz.x1 - mz.x0, 0.01, mz.z1 - mz.z0);
    }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) this.deco('fluo', mz.x0 + (i + 0.5) * (mz.x1 - mz.x0) / 6, mz.h - 0.02, mz.z0 + (j + 0.5) * (mz.z1 - mz.z0) / 3, 0.9, 0.03, 0.9);
    this.sign((g, w, h) => {
      g.fillStyle = '#0a0a10'; g.fillRect(0, 0, w, h); g.fillStyle = '#30e8ff'; g.font = 'bold 54px "Courier New", monospace'; g.textAlign = 'center';
      g.fillText('← SALIDA', w / 2, 70); g.font = '28px "Courier New", monospace'; g.fillStyle = '#ff3cc8'; g.fillText('(o no)', w / 2, 115);
    }, 400, 140, 1.1, 0.38, mz.x0 + 0.1, 2.6, -452, Math.PI / 2);
    this.light(-42, wh + 0.3, -457, 0xdff0ff, 14, 16, { priority: 1.2, decay: 1.0 });
    this.light(-30, wh + 0.3, -455, 0xdff0ff, 14, 16, { priority: 1.2, decay: 1.0 });
    this.light(-42, wh, -453, 0xff3cc8, 6, 10, { priority: 1.0, decay: 1.1 });
    this.light(-30, wh, -461, 0x30e8ff, 6, 10, { priority: 1.0, decay: 1.1 });
  }
  _waveNormal() {
    const cv = canvas(128, 128), g = cv.getContext('2d'), img = g.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const nx = Math.sin(x / 128 * Math.PI * 4) * 0.5 + Math.sin((x + y) / 128 * Math.PI * 2) * 0.25, ny = Math.cos(y / 128 * Math.PI * 2) * 0.35;
      const i = (y * 128 + x) * 4; img.data[i] = 128 + nx * 120; img.data[i + 1] = 128 + ny * 120; img.data[i + 2] = 230; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = ctex(cv, false); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  // con la cámara en el laberinto: el cubo de los espejos se actualiza de a ratos y se prende el espejo deformante más
  // cercano que se esté mirando (los otros quedan como espejo común)
  _mirrors(t, camRoom) {
    const cam = G.camera, inMaze = camRoom === WING_ROOM.maze;
    // el laberinto es quieto: el cubo se rehace al entrar y después cada 3 s (a la gente la muestran los deformantes)
    if (!inMaze) this._cubeT = -9;
    if (this.cubeCam && inMaze && G.renderer && t - (this._cubeT ?? -9) > 3) {
      this._cubeT = t;
      // sin el cielo de fondo (el Búnker está bajo tierra: en los espejos se veían nubes)
      // (la niebla se deja: sacarla recompilaría los materiales)
      const bg = G.scene.background;
      G.scene.background = null;
      this.cubeCam.update(G.renderer, G.scene);
      G.scene.background = bg;
    }
    let best = null, bd = 11;
    if (inMaze && cam) {
      const fwd = cam.getWorldDirection(V3);
      for (const m of this.funhouse) { const d = cam.position.distanceTo(m.position); if (d < bd && V4.subVectors(m.position, cam.position).dot(fwd) > 0) { bd = d; best = m; } }
    }
    for (const m of this.funhouse) { m.visible = m === best; if (m === best) m.material.uniforms.uT.value = t % 1000; }
  }
  // capas: lo del laberinto y la sala psicodélica se ve en los espejos
  _mirrorLayers() {
    const mirror = getMat('mazeMirror');
    for (const id of ['maze', 'psico']) this.wings.get(id)?.group.traverse((o) => { if (o.material !== mirror && !this.funhouse.includes(o)) o.layers.enable(MIRROR_LAYER); });
  }

  // ---------------------------------------------------------------- cada cuadro (lo llama Club.update cerca del Búnker)
  update(t, dt, B, camRoom) {
    if (camRoom) this.lastRoom = camRoom; // en el marco de una puerta (fuera de toda sala) se mantiene lo de antes
    const see = SEES[this.lastRoom] || [];
    // la sala psicodélica pega un poco (colores que laten en la pantalla) aunque no hayas tomado nada
    const psy = this.lastRoom === WING_ROOM.psico ? 0.55 : this.lastRoom === WING_ROOM.maze ? 0.2 : 0;
    this.psy = (this.psy || 0) + (psy - (this.psy || 0)) * Math.min(1, dt * 1.2);
    this._mirrors(t, this.lastRoom);
    for (const [id, w] of this.wings) {
      const on = see.includes(id);
      if (w.group.visible !== on) w.group.visible = on;
      if (on) for (const a of w.anim) a(t, dt, B);
    }
  }
}
