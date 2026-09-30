// Sustos, apariciones e interacciones del Castillo del Terror.
// - Disparadores por zona (al entrar a un cuarto): portazo en el torreón, el anfitrión fantasma del comedor,
//   la sala de los retratos a oscuras (silla de ruedas que cruza sola), el espejo, el balcón.
// - Cosas que se usan con X: el candelabro que abre el pasadizo secreto, la campana, el reloj, el cofre del Conde,
//   la tapa del sarcófago, la sábana de la cocina, la reja de la cripta, el aljibe, tirar un leño al fuego.
// - Con cada relámpago los retratos son calaveras; en el cementerio, la dama de blanco aparece un poco más cerca.
// Lo que cambia el estado del mundo (puertas, campana, fuego) se avisa a los demás ('ev' 'haunt'); los sustos
// se ven en grupo: los que están cerca del lugar ven lo mismo.
import * as THREE from 'three';
import { G, clamp, lerp } from '../core/G.js';
import { HumanCharacter } from '../char/human.js';
import { CASTLE, INTERACT } from '../shared/mapdata.js';
import { whenAsset, assetModel } from './assets.js';
import { getMat } from '../world/builder.js';

const F0 = CASTLE.keep.floor;
const KZ1 = CASTLE.keep.z1;
const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const HAS_DOM = typeof document !== 'undefined';

// ---------------------------------------------------------------- material de fantasma (piel translúcida que brilla en el borde)
function ghostMaterial(map, color) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uAlpha: { value: 0 }, uT: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      varying vec3 vN; varying vec3 vV; varying vec2 vUv2; varying float vY;
      void main() {
        vUv2 = uv;
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vN = normalize(transformedNormal);
        vV = -mvPosition.xyz;
        vY = (modelMatrix * vec4(transformed, 1.0)).y;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uAlpha, uT; uniform vec3 uColor;
      varying vec3 vN; varying vec3 vV; varying vec2 vUv2; varying float vY;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float lum = dot(texture2D(uMap, vUv2).rgb, vec3(0.299, 0.587, 0.114));
        float scan = 0.88 + 0.12 * sin(vY * 38.0 + uT * 7.0);
        float n = fract(sin(dot(floor(gl_FragCoord.xy * 0.5) + floor(uT * 24.0), vec2(12.9898, 78.233))) * 43758.5453);
        vec3 col = uColor * (0.2 + lum * 1.2) + uColor * fres * 1.9;
        float a = clamp(uAlpha * (0.22 + fres * 0.95 + lum * 0.4) * scan * (0.82 + 0.18 * n), 0.0, 1.0);
        gl_FragColor = vec4(col * a, 1.0);
      }`,
  });
}

// Fantasma: un cuerpo humano de verdad (mismo esqueleto que los jugadores) con piel de fantasma
class Ghost {
  constructor(scene, model, color) {
    this.char = new HumanCharacter({ model }, {});
    this.mat = ghostMaterial(this.char.material.map || null, color);
    this.char.skinned.material = this.mat;
    this.char.skinned.castShadow = false;
    this.char.root.visible = false;
    scene.add(this.char.root);
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.alpha = 0;
    this.target = 0;
    this.mode = 'off'; // off | stand | sit | rush | rise
    this.t = 0;
    this.speed = 0;
    this.pose = {};
    this.onDone = null;
  }
  show(pos, yaw, mode = 'stand', alpha = 1) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.mode = mode;
    this.t = 0;
    this.target = alpha;
    this.char.root.visible = true;
  }
  hide(fast = false) {
    this.target = 0;
    if (fast) this.alpha = Math.min(this.alpha, 0.15);
  }
  rush(to, speed = 11) {
    this.mode = 'rush';
    this.rushTo = to.clone();
    this.speed = speed;
    this.t = 0;
    this.target = 1.2;
  }
  get visible() { return this.char.root.visible; }
  update(dt, time) {
    if (!this.char.root.visible) return;
    this.t += dt;
    this.alpha += (this.target - this.alpha) * Math.min(1, dt * (this.target > this.alpha ? 5 : 7));
    if (this.target === 0 && this.alpha < 0.02) { this.char.root.visible = false; this.mode = 'off'; this.alpha = 0; return; }
    let bob = Math.sin(time * 1.7) * 0.05 + 0.06;
    if (this.mode === 'rush' && this.rushTo) {
      V1.copy(this.rushTo).sub(this.pos);
      const d = V1.length();
      this.yaw = Math.atan2(V1.x, V1.z);
      if (d < 0.9) { this.hide(true); this.onDone?.(); this.onDone = null; }
      else this.pos.addScaledVector(V1.normalize(), Math.min(d, this.speed * dt));
      bob = 0;
    }
    if (this.mode === 'rise') bob = -1.6 + Math.min(1, this.t / 1.6) * 1.6;
    this.char.root.position.set(this.pos.x, this.pos.y + (this.mode === 'sit' ? 0 : bob), this.pos.z);
    this.char.root.rotation.y = this.yaw;
    this.char.animate({ speed: 0, grounded: true, sit: this.mode === 'sit', aimPitch: this.pose.pitch || 0, headYaw: this.pose.headYaw || 0 }, dt);
    const J = this.char.joints;
    const E = new THREE.Euler();
    const q = new THREE.Quaternion();
    const add = (i, x, y, z) => J[i].quaternion.multiply(q.setFromEuler(E.set(x, y, z)));
    if (this.mode === 'rush') {
      // brazos hacia adelante, la cabeza echada hacia atrás (grita)
      add(3, -1.35, 0, 0.25); add(5, -1.35, 0, -0.25); add(4, -0.2, 0, 0); add(6, -0.2, 0, 0); add(2, -0.35, 0, 0);
      add(7, 0.35, 0, 0); add(9, 0.2, 0, 0); add(8, 0.5, 0, 0); add(10, 0.6, 0, 0);
    } else if (this.mode !== 'sit') {
      // colgando: brazos caídos y separados, cabeza ladeada, pies en punta (flota)
      add(3, 0, 0, -0.18); add(5, 0, 0, 0.18); add(2, 0.18, 0.1, 0.32 + Math.sin(time * 0.9) * 0.05);
      add(8, 0.35, 0, 0); add(10, 0.3, 0, 0);
    } else {
      add(2, 0.12, this.pose.look || 0, 0.12);
    }
    this.char.update(dt);
    this.mat.uniforms.uAlpha.value = this.alpha * (0.85 + 0.15 * Math.sin(time * 23.0) * Math.sin(time * 7.1));
    this.mat.uniforms.uT.value = time;
  }
}

// ---------------------------------------------------------------- espectro (mortaja hecha en Blender con simulación de tela)
// Tela pálida que se transparenta, brilla en el borde, flamea y se deshace en niebla abajo; la cara es un hueco
// negro con dos ojos que brillan. Misma interfaz que Ghost (show / hide / rush / onDone).
function wraithMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0.62, 0.7, 0.8) }, uRush: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uT, uRush;
      varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vP;
      void main() {
        vec3 p = position;
        float low = clamp(1.0 - (p.y - 0.25) / 1.4, 0.0, 1.0);
        float w = sin(uT * 2.1 + p.y * 3.7 + p.x * 2.0) * 0.045 + sin(uT * 3.7 + p.x * 5.0 + p.z * 4.0) * 0.02;
        p.x += w * low * low;
        p.z += (sin(uT * 1.7 + p.y * 2.9) * 0.05 + uRush * 0.25) * low * low;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = -mv.xyz;
        vY = position.y;
        vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uT, uAlpha; uniform vec3 uColor;
      varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vP;
      float hh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float vn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hh(i), hh(i + vec3(1, 0, 0)), f.x), mix(hh(i + vec3(0, 1, 0)), hh(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(hh(i + vec3(0, 0, 1)), hh(i + vec3(1, 0, 1)), f.x), mix(hh(i + vec3(0, 1, 1)), hh(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
        float n = vn(vP * 7.0 + vec3(0.0, -uT * 0.6, 0.0)) * 0.6 + vn(vP * 17.0 + uT * 0.3) * 0.4;
        // se deshace en niebla abajo, con bordes comidos
        float fadeLow = smoothstep(0.25, 0.95, vY + (n - 0.5) * 0.35);
        float a = uAlpha * fadeLow * (0.38 + fres * 0.6) * (0.85 + 0.15 * sin(uT * 19.0 + vY * 3.0));
        if (a < 0.004) discard;
        vec3 col = uColor * (0.28 + 0.5 * n) + uColor * fres * 1.3;
        gl_FragColor = vec4(col, a);
      }`,
  });
}
class Wraith {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this.mat = wraithMaterial();
    this.voidMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.8, 3.4), transparent: true, opacity: 0 });
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.alpha = 0;
    this.target = 0;
    this.mode = 'off';
    this.t = 0;
    this.pose = {};
    this.onDone = null;
    whenAsset('c_wraith', () => {
      const m = assetModel('c_wraith');
      if (!m) return;
      m.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.renderOrder = 9;
        if (/void/.test(o.name)) o.material = this.voidMat;
        else if (/eye/.test(o.name)) o.material = this.eyeMat;
        else o.material = this.mat;
      });
      this.root.add(m);
    });
  }
  show(pos, yaw, mode = 'stand', alpha = 1) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.mode = mode;
    this.t = 0;
    this.target = alpha;
    this.root.visible = true;
  }
  hide(fast = false) {
    this.target = 0;
    if (fast) this.alpha = Math.min(this.alpha, 0.1);
  }
  rush(to, speed = 11) {
    this.mode = 'rush';
    this.rushTo = to.clone();
    this.speed = speed;
    this.t = 0;
    this.target = 1;
  }
  get visible() { return this.root.visible; }
  update(dt, time) {
    if (!this.root.visible) return;
    this.t += dt;
    this.alpha += (this.target - this.alpha) * Math.min(1, dt * (this.target > this.alpha ? 4 : 7));
    if (this.target === 0 && this.alpha < 0.02) { this.root.visible = false; this.mode = 'off'; this.alpha = 0; return; }
    let bob = Math.sin(time * 1.3) * 0.08 + 0.12;
    let scale = 1;
    const cam = G.camera;
    if (this.mode === 'rush' && this.rushTo && cam) {
      // se tira encima: termina cara a cara (medio metro delante de la cámara) un instante y desaparece
      const face = V2.copy(cam.position);
      const fwd = cam.getWorldDirection(V1).setY(0).normalize();
      face.addScaledVector(fwd, 0.55).setY(cam.position.y - 1.62);
      const d = face.distanceTo(this.pos);
      this.yaw = Math.atan2(cam.position.x - this.pos.x, cam.position.z - this.pos.z);
      if (d < 0.35) {
        this.mode = 'face';
        this.t = 0;
      } else this.pos.addScaledVector(V1.copy(face).sub(this.pos).normalize(), Math.min(d, this.speed * dt));
      bob = 0.05;
    } else if (this.mode === 'face' && cam) {
      const fwd = cam.getWorldDirection(V1).setY(0).normalize();
      this.pos.copy(cam.position).addScaledVector(fwd, 0.5).setY(cam.position.y - 1.62);
      this.yaw = Math.atan2(-fwd.x, -fwd.z);
      scale = 1.05 + this.t * 0.4;
      bob = 0;
      if (this.t > 0.28) { this.hide(true); this.onDone?.(); this.onDone = null; }
    } else if (this.mode === 'rise') {
      bob = -1.4 + Math.min(1, this.t / 1.8) * 1.4;
    } else if (this.mode === 'sit') {
      bob = -0.42;
    }
    this.root.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.root.rotation.y = this.yaw;
    this.root.scale.setScalar(scale);
    const a = this.alpha * (0.9 + 0.1 * Math.sin(time * 21.0) * Math.sin(time * 5.3)) * (this.mode === 'face' ? 1.7 : 1);
    this.mat.uniforms.uAlpha.value = a;
    this.mat.uniforms.uT.value = time;
    this.mat.uniforms.uRush.value = this.mode === 'rush' ? 1 : 0;
    this.voidMat.opacity = Math.min(1, a * 1.6);
    this.eyeMat.opacity = Math.min(1, a * 1.8);
  }
}

// ---------------------------------------------------------------- disparadores por zona
const ZONES = {
  hall: [-7.7, F0 - 0.5, -116.5, 7.7, 9, -104.8],
  dining: [-23.8, F0 - 0.5, -114.7, -8.3, 9, -104.2],
  gallery: [-7.7, F0 - 0.5, -125.8, 7.7, 9, -117.1],
  kitchen: [-23.8, F0 - 0.5, -125.8, -8.3, 9, -115.3],
  library: [8.3, F0 - 0.5, -114.7, 23.8, 9, -104.2],
  secret: [8.3, F0 - 0.5, -125.8, 20.4, 9, -115.3],
  crypt: [8.3, -0.5, -125.8, 23.8, 3.1, -104.2],
  balcony: [-7.7, 7.6, -116.5, 7.7, 11, -114.2],
  graveyard: [25, -0.5, -130, 43.6, 6, -103.2],
  eastcourt: [4, -0.5, -103, 43.6, 6, -80.5],
};
const inBox = (p, b) => p.x > b[0] && p.x < b[3] && p.y > b[1] && p.y < b[4] && p.z > b[2] && p.z < b[5];

export class Haunt {
  constructor(world, { onScare = null } = {}) {
    this.world = world;
    this.castle = world.castle;
    this.decor = world.castle?.decor;
    this.scene = world.scene;
    this.onScare = onScare;
    this.cool = {}; // cooldowns por susto (segundos de juego)
    this.inside = {};
    this.lastScare = -99;
    this.busy = new Set();
    this.doors = {};
    this.fireBoost = 0;
    this.heart = 0; // latidos (0..1): suben en los sustos y en la cripta
    this.flameBase = new Map();
    this.lady = { stage: 0, t: -99 };
    this._buildGhosts();
    this._buildDoors();
    this._buildInteract();
    this._buildWindowLights();
    this._buildOverlay();
    this._projectorBeam();
    if (world.storm) world.storm.onStrike = (s) => this._onStrike(s);
  }

  _buildGhosts() {
    try {
      this.lady = Object.assign(this.lady, { g: new Ghost(this.scene, 'claudia', 0x9fc8ff) });
      this.count = new Wraith(this.scene);
    } catch (e) {
      console.warn('fantasmas', e);
    }
  }

  // ---------------------------------------------------------------- puertas que se mueven
  _buildDoors() {
    const phys = this.world.phys;
    const c = this.castle;
    // puerta del torreón (modelo de Poly Haven con dos hojas): arranca abierta hacia adentro
    const keep = { open: 1, target: 1, leaves: [], collider: phys.box(0, F0 + 2.6, KZ1 - 0.6, 1.8, 2.6, 0.12, 0, { paint: false }) };
    keep.collider.setEnabled(false);
    this.doors.keep = keep;
    whenAsset('c_door', () => {
      const m = assetModel('c_door');
      if (!m) return;
      m.position.set(0, F0, KZ1 - 0.35);
      this.scene.add(m);
      m.traverse((o) => {
        if (!o.isMesh) return;
        if (/door_left/.test(o.name)) keep.leaves.push({ o, s: 1 });
        if (/door_right/.test(o.name)) keep.leaves.push({ o, s: -1 });
      });
      this._setDoor(keep);
    });
    // puerta de la sala de los retratos (hoja de madera del castillo)
    const gd = c.doors.gallery;
    gd.collider = phys.box(3, F0 + 1.6, -116.8, 1.2, 1.6, 0.1, 0, { paint: false });
    gd.collider.setEnabled(false);
    gd.target = 1;
    this.doors.gallery = gd;
    // estante-puerta del pasadizo (gira sobre su borde este)
    this.doors.secret = { open: 0, target: 0, pivot: null, collider: c.secretCollider };
    whenAsset('c_bookshelf', () => {
      const tryWrap = () => {
        const m = this.decor?.models.secretShelf;
        if (!m) { setTimeout(tryWrap, 200); return; }
        const pivot = new THREE.Group();
        pivot.position.set(17.33, F0, -114.7);
        this.scene.add(pivot);
        m.traverse((o) => { o.matrixAutoUpdate = true; });
        pivot.attach(m);
        this.doors.secret.pivot = pivot;
      };
      tryWrap();
    });
    // reja de la cripta
    this.doors.crypt = { open: 0, target: 0, pivot: c.cryptGate.pivot, collider: c.cryptGate.collider };
  }
  _setDoor(d) {
    const a = d.open;
    if (d.leaves) for (const { o, s } of d.leaves) o.rotation.set(0, s * 1.38 * a, 0);
  }

  // ---------------------------------------------------------------- puntos de "X"
  _buildInteract() {
    const list = [
      { id: 'h_lever', ev: 'lever', p: [18.2, F0 + 1, -113.9], r: 1.5, label: 'Tirar del candelabro' },
      { id: 'h_bell', ev: 'bell', p: [4.5, F0 + 1, -113.6], r: 1.6, label: 'Tirar de la soga de la campana' },
      { id: 'h_clock', ev: 'clock', p: [6.9, F0 + 1, -112.6], r: 1.4, label: 'Darle cuerda al reloj' },
      { id: 'h_chest', ev: 'chest', p: [17.8, F0 + 1, -124.1], r: 1.5, label: 'Abrir el cofre del Conde' },
      { id: 'h_tomb', ev: 'tomb', p: [14.2, 1.0, -112.9], r: 1.8, label: 'Correr la tapa del sarcófago' },
      { id: 'h_sheet', ev: 'sheet', p: [-16, F0 + 1, -120.1], r: 1.6, label: 'Levantar la sábana' },
      { id: 'h_crypt', ev: 'cryptgate', p: [23.4, 1.0, -108.4], r: 1.8, label: 'Empujar la reja' },
      { id: 'h_log', ev: 'log', p: [CASTLE.fire[0], 1.0, CASTLE.fire[1]], r: 2.3, label: 'Tirar un leño al fuego' },
    ];
    for (const it of list) INTERACT.push({ ...it, k: 'haunt' });
    // la soga de la campana cuelga en el salón
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 11.4, 6), getMat('hemp'));
    rope.position.set(4.5, F0 + 1.1 + 5.7, -113.6);
    this.scene.add(rope);
    this.bellRope = rope;
  }

  // luces frías en algunas ventanas: el relámpago entra por ahí
  _buildWindowLights() {
    const c = this.castle;
    this.winLights = [];
    for (const [x, y, z] of [[-5, 8, -105.2], [5, 8, -105.2], [-12.5, 6.8, -105.2], [12.5, 6.8, -105.2], [-4, 6.8, -125], [4, 6.8, -125], [-22.6, 6.8, -112.8]]) {
      const l = c.light(x, y, z, 0xb8ccff, 0, 13, { priority: 2.5 });
      l.base = 0;
      this.winLights.push(l);
    }
  }

  _buildOverlay() {
    if (!HAS_DOM) return;
    const d = document.createElement('div');
    Object.assign(d.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '5', opacity: '0',
      background: 'radial-gradient(ellipse at center, rgba(210,230,255,0.55) 0%, rgba(120,150,200,0.35) 45%, rgba(0,0,0,0.85) 100%)',
      transition: 'opacity 60ms linear',
    });
    document.body.appendChild(d);
    this.overlay = d;
    this.overlayK = 0;
  }

  // haz del proyector del fogón (se ve cuando hay algo en la pantalla)
  _projectorBeam() {
    const c = this.castle;
    const a = c.anchors.projector, s = c.anchors.screen;
    if (!a || !s) return;
    const len = a.distanceTo(s);
    const g = new THREE.CylinderGeometry(2.2, 0.06, len, 16, 1, true);
    g.translate(0, len / 2, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `uniform float uT, uA; varying vec2 vUv; varying vec3 vW;
        void main() {
          float dust = 0.6 + 0.4 * sin(vW.y * 9.0 + uT * 1.3) * sin(vW.z * 7.0 - uT * 0.9);
          float a = uA * 0.05 * (1.0 - vUv.y * 0.5) * dust;
          gl_FragColor = vec4(vec3(0.8, 0.85, 1.0) * a, 1.0);
        }`,
    });
    const m = new THREE.Mesh(g, mat);
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), V1.copy(s).sub(a).normalize());
    m.visible = false;
    m.renderOrder = 7;
    this.scene.add(m);
    this.beam = m;
  }

  // ---------------------------------------------------------------- utilidades de luz: apagar/prender un cuarto
  _roomFlames(box) {
    const F = this.world.flames, out = [];
    if (!F) return out;
    for (const i of this.castle.flames) {
      if (i < 0) continue;
      const x = F.pos[i * 4], y = F.pos[i * 4 + 1], z = F.pos[i * 4 + 2];
      if (x > box[0] && x < box[3] && y > box[1] - 0.5 && y < box[4] && z > box[2] && z < box[5]) out.push(i);
    }
    return out;
  }
  _roomLights(box) {
    return this.castle.lights.filter((l) => { const p = l.position; return p.x > box[0] && p.x < box[3] && p.y > box[1] - 0.5 && p.y < box[4] && p.z > box[2] && p.z < box[5] && !this.winLights.includes(l); });
  }
  // apaga las velas de un cuarto de a una (desde `from`), en `dur` segundos; after: vuelve a prender
  _lightsOut(box, { from = null, dur = 1.6, back = 3, keep = 0 } = {}) {
    const F = this.world.flames;
    const flames = this._roomFlames(box);
    const lights = this._roomLights(box);
    if (from) flames.sort((a, b) => Math.hypot(F.pos[a * 4] - from.x, F.pos[a * 4 + 2] - from.z) - Math.hypot(F.pos[b * 4] - from.x, F.pos[b * 4 + 2] - from.z));
    flames.forEach((i, k) => {
      if (!this.flameBase.has(i)) this.flameBase.set(i, F.get(i));
      setTimeout(() => { F.set(i, 0); if (Math.random() < 0.3) G.sfx?.trigger('ghost-breath', V1.set(F.pos[i * 4], F.pos[i * 4 + 1], F.pos[i * 4 + 2]), 0.25, { full: 2, max: 14 }); }, (k / Math.max(1, flames.length)) * dur * 1000);
    });
    for (const l of lights) l.dim = keep;
    setTimeout(() => { for (const l of lights) if (l.dim !== undefined && l.base !== undefined) l.intensity = l.base * keep; }, dur * 1000);
    if (back > 0) setTimeout(() => this._lightsOn(flames, lights), (dur + back) * 1000);
    return { flames, lights };
  }
  _lightsOn(flames, lights) {
    const F = this.world.flames;
    for (const i of flames) F.set(i, this.flameBase.get(i) ?? 1);
    for (const l of lights) { l.dim = 1; if (l.base !== undefined) l.intensity = l.base; }
  }

  // ---------------------------------------------------------------- sustos
  _can(id, cd) {
    const t = G.time;
    if ((this.cool[id] ?? -1e9) + cd > t) return false;
    if (t - this.lastScare < 7) return false;
    this.cool[id] = t;
    this.lastScare = t;
    return true;
  }
  _scare(k = 1) {
    this.heart = Math.max(this.heart, 0.9 * k);
    this.overlayK = Math.max(this.overlayK, 0.7 * k);
    this.onScare?.(k);
  }
  _near(p, r = 26) {
    const me = G.me?.pos;
    return !!me && Math.hypot(me.x - p.x, me.y - p.y, me.z - p.z) < r;
  }
  _send(e, extra = {}) { G.net?.send({ t: 'ev', k: 'haunt', e, ...extra }); }

  // eventos compartidos (los arranca uno, los ven todos los que están cerca)
  play(e, remote = false, m = {}) {
    const c = this.castle, sfx = G.sfx;
    switch (e) {
      case 'slam': { // portazo del torreón: las dos hojas se cierran de golpe; la puerta queda trabada unos segundos
        const d = this.doors.keep;
        d.target = 0; d.speed = 9;
        d.collider.setEnabled(true);
        setTimeout(() => sfx?.trigger('door-slam', V1.set(0, F0 + 2, KZ1), 1, { full: 4, max: 60 }), 110);
        setTimeout(() => { this._lightsOut(ZONES.hall, { dur: 0.5, back: 2.2, keep: 0.25 }); }, 150);
        setTimeout(() => { d.target = 1; d.speed = 0.7; sfx?.trigger('door-creak', V1.set(0, F0 + 2, KZ1), 0.8, { full: 3, max: 30 }); }, 4600);
        setTimeout(() => d.collider.setEnabled(false), 5200);
        if (this._near(c.anchors.hall, 20)) this._scare(0.6);
        break;
      }
      case 'dining': { // el anfitrión: se apagan las velas, al volver la luz está sentado a la cabecera... y se te tira encima
        const host = c.anchors.hostSeat;
        this._lightsOut(ZONES.dining, { from: new THREE.Vector3(-8, 0, -109.5), dur: 1.6, back: 1.3, keep: 0.05 });
        sfx?.trigger('whisper', host, 0.7, { full: 3, max: 18 });
        setTimeout(() => {
          const g = this.count;
          if (!g) return;
          g.show(V1.set(host.x + 0.05, F0, host.z), Math.PI / 2, 'sit', 0.9);
          g.pose.look = 0;
          sfx?.trigger('ghost-moan', host, 0.8, { full: 3, max: 20 });
          setTimeout(() => { g.pose.look = -0.6; }, 1200);
          setTimeout(() => {
            if (!this._near(host, 16)) { g.hide(); return; }
            g.mode = 'stand';
            g.pos.y = F0;
            g.rush(G.camera.position.clone().setY(F0 + 0.1), 13);
            g.onDone = () => this._jumpscare();
            sfx?.trigger('ghost-scream', g.pos, 1, { full: 4, max: 30 });
          }, 2600);
        }, 2900);
        break;
      }
      case 'gallery': { // la sala de los retratos: portazo, oscuridad, silla de ruedas, susurros; después vuelve todo
        const gd = this.doors.gallery;
        gd.target = 0; gd.speed = 8;
        gd.collider.setEnabled(true);
        setTimeout(() => sfx?.trigger('door-slam', V1.set(3, F0 + 1.5, -116.8), 0.9, { full: 3, max: 40 }), 140);
        this._lightsOut(ZONES.gallery, { dur: 2.4, back: 6.5, keep: 0 });
        this.heart = Math.max(this.heart, 0.7);
        setTimeout(() => this._wheelchair(), 1800);
        setTimeout(() => sfx?.trigger('whisper', V1.set(-5, F0 + 1.6, -124), 0.8, { full: 2, max: 16 }), 3200);
        setTimeout(() => {
          // la dama cruza al fondo, en la oscuridad
          const g = this.lady.g;
          if (g && this._near(c.anchors.gallery, 14)) {
            g.show(V1.set(-6.5, F0, -124.8), Math.PI / 2, 'stand', 0.75);
            const walk = setInterval(() => { g.pos.x += 0.09; if (g.pos.x > 6) { clearInterval(walk); g.hide(); } }, 16);
          }
        }, 4200);
        setTimeout(() => { gd.target = 1; gd.speed = 0.9; sfx?.trigger('door-creak', V1.set(3, F0 + 1.5, -116.8), 0.7, { full: 3, max: 25 }); }, 9000);
        setTimeout(() => gd.collider.setEnabled(false), 9800);
        break;
      }
      case 'mirror': {
        // una cara en el espejo, detrás tuyo
        this._mirrorFace();
        break;
      }
      case 'balcony': {
        const g = this.count;
        if (!g) break;
        g.show(V1.set(1.5, 8.0, -115.2), 0, 'stand', 0.85);
        sfx?.trigger('ghost-breath', V1, 0.6, { full: 4, max: 24 });
        setTimeout(() => g.hide(), 1800);
        break;
      }
      case 'lever': { // el candelabro: el estante gira y abre el pasadizo
        const d = this.doors.secret;
        d.target = 1; d.speed = 0.55;
        d.collider?.setEnabled(false);
        sfx?.trigger('stone-grind', V1.set(16.5, F0 + 1.2, -114.7), 0.9, { full: 3, max: 26 });
        clearTimeout(this._secretT);
        this._secretT = setTimeout(() => {
          d.target = 0; d.speed = 0.45;
          sfx?.trigger('stone-grind', V1.set(16.5, F0 + 1.2, -114.7), 0.75, { full: 3, max: 26 });
          setTimeout(() => d.collider?.setEnabled(true), 2600);
        }, 26000);
        break;
      }
      case 'bell': { // la campana del campanario: la escucha todo el mapa
        const b = c.anchors.bell;
        for (let k = 0; k < 3; k++) setTimeout(() => sfx?.trigger('bell', b, 1, { full: 40, max: 320 }), k * 2600);
        setTimeout(() => sfx?.trigger('crow', V1.set(0, 25, -121), 0.9, { full: 10, max: 90 }), 900);
        this.bellT = G.time;
        break;
      }
      case 'clock': { // el reloj se vuelve loco: las agujas giran, campanadas, las velas tiemblan
        this.clockSpin = 6;
        const p = V1.set(7.3, F0 + 1.8, -112.6);
        for (let k = 0; k < 6; k++) setTimeout(() => sfx?.trigger('clock-chime', p, 0.9, { full: 3, max: 34 }), 400 + k * 900);
        this._lightsOut(ZONES.hall, { dur: 0.3, back: 5.6, keep: 0.35 });
        break;
      }
      case 'chest': { // el cofre del Conde: se abre con un brillo dorado... y el Conde aparece atrás
        this.chestOpen = 1;
        sfx?.trigger('door-creak', V1.set(17.8, F0 + 0.5, -124.9), 0.8, { full: 2, max: 16 });
        setTimeout(() => sfx?.trigger('coins', V1.set(17.8, F0 + 0.5, -124.9), 0.9, { full: 2, max: 16 }), 500);
        if (!remote) {
          G.hudMessage?.('EL TESORO DEL CONDE', 'Encontraste el cofre del pasadizo. Mejor no darse vuelta...');
          setTimeout(() => {
            const g = this.count;
            const cam = G.camera;
            if (!g || !cam) return;
            cam.getWorldDirection(V2);
            g.show(V1.copy(G.me.pos).addScaledVector(V2.setY(0).normalize(), -1.6).setY(F0), Math.atan2(V2.x, V2.z), 'stand', 1);
            sfx?.trigger('ghost-breath', g.pos, 0.9, { full: 2, max: 12 });
            setTimeout(() => g.hide(), 2600);
          }, 3500);
        }
        setTimeout(() => { this.chestOpen = 0; }, 20000);
        break;
      }
      case 'tomb': { // la tapa del sarcófago del Conde se corre y él se levanta
        this.tombOpen = 1;
        const p = c.anchors.cryptTomb;
        sfx?.trigger('stone-grind', V1.set(p.x, 1, p.z), 1, { full: 3, max: 28 });
        this._lightsOut(ZONES.crypt, { from: p, dur: 2.2, back: 4.5, keep: 0.08 });
        this.heart = 1;
        setTimeout(() => {
          const g = this.count;
          if (!g) return;
          g.show(V1.set(p.x, 0.95, p.z), Math.PI, 'rise', 1);
          sfx?.trigger('ghost-moan', V1.set(p.x, 1.5, p.z), 1, { full: 3, max: 24 });
          setTimeout(() => {
            if (!this._near(p, 14)) { g.hide(); return; }
            g.mode = 'stand';
            g.pos.y = 0.05;
            g.rush(G.camera.position.clone().setY(0.1), 12);
            g.onDone = () => this._jumpscare();
            sfx?.trigger('ghost-scream', g.pos, 1, { full: 4, max: 30 });
          }, 2600);
        }, 1500);
        setTimeout(() => { this.tombOpen = 0; }, 16000);
        break;
      }
      case 'sheet': { // lo que había bajo la sábana se sienta
        this.sheetUp = 1;
        const p = c.anchors.sheet;
        sfx?.trigger('ghost-moan', p, 0.9, { full: 2, max: 20 });
        if (this._near(p, 6)) this._scare(0.8);
        setTimeout(() => { this.sheetUp = 0; }, 4200);
        break;
      }
      case 'cryptgate': {
        const d = this.doors.crypt;
        d.target = 1; d.speed = 1.2;
        d.collider.setEnabled(false);
        sfx?.trigger('gate-creak', V1.set(24.4, 1.2, -108.4), 0.9, { full: 3, max: 30 });
        clearTimeout(this._cryptT);
        this._cryptT = setTimeout(() => { d.target = 0; d.speed = 1; sfx?.trigger('gate-creak', V1.set(24.4, 1.2, -108.4), 0.8, { full: 3, max: 30 }); setTimeout(() => d.collider.setEnabled(true), 1400); }, 20000);
        break;
      }
      case 'log': { // un leño al fuego: llamarada, chispas y más luz un rato
        this.fireBoost = 1;
        const f = c.anchors.fire;
        sfx?.trigger('fire-flare', V1.set(f.x, 0.8, f.z), 0.9, { full: 3, max: 26 });
        break;
      }
      case 'well': { // el aljibe: eco del fondo... a veces contesta alguien
        const w = c.anchors.well;
        if (c.wellWater) c.wellWater.pulseAt = G.time + 1.4;
        const seed = m.s ?? Math.random();
        setTimeout(() => sfx?.trigger('splash', V1.set(w.x, 0.2, w.z), 0.6, { full: 2, max: 14 }), 1400);
        if (seed < 0.35) setTimeout(() => sfx?.trigger('whisper', V1.set(w.x, 0.3, w.z), 0.9, { full: 2, max: 12 }), 2600);
        else if (seed < 0.5 && !remote) setTimeout(() => { sfx?.trigger('ghost-scream', V1.set(w.x, 0.5, w.z), 0.9, { full: 2, max: 16 }); this._scare(1); }, 2400);
        break;
      }
    }
  }
  _jumpscare() {
    G.sfx?.trigger('stinger', null, 1);
    this._scare(1.1);
  }

  // silla de ruedas que cruza sola la sala de los retratos
  _wheelchair() {
    const m = this.decor?.models.wheelchair;
    if (!m) return;
    const z0 = m.position.z, t0 = G.time;
    G.sfx?.trigger('door-creak', m.position, 0.7, { full: 2, max: 18, rate: 0.6 });
    const step = () => {
      const k = (G.time - t0) / 3.2;
      m.position.z = lerp(z0, -116.8, clamp(k, 0, 1));
      m.rotation.y = Math.sin(k * 9) * 0.04;
      m.updateMatrixWorld(true);
      if (k < 1) requestAnimationFrame(step);
      else setTimeout(() => { m.position.z = z0; m.rotation.y = -Math.PI / 2; m.updateMatrixWorld(true); }, 9000);
    };
    step();
  }

  _mirrorFace() {
    const mm = this.decor?.models.mirror;
    if (!mm) return;
    if (!this._face) {
      const g = new THREE.CircleGeometry(0.26, 20);
      const mat = new THREE.MeshBasicMaterial({ color: 0xd8e6ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      if (HAS_DOM) {
        const cv = document.createElement('canvas'); cv.width = cv.height = 128;
        const x = cv.getContext('2d');
        const gr = x.createRadialGradient(64, 60, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(220,235,255,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
        x.fillStyle = '#000'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(64 + s * 18, 56, 9, 12, 0, 0, Math.PI * 2); x.fill(); }
        x.beginPath(); x.ellipse(64, 92, 10, 16, 0, 0, Math.PI * 2); x.fill();
        mat.map = new THREE.CanvasTexture(cv);
      }
      this._face = new THREE.Mesh(g, mat);
      this._face.position.set(7.64, F0 + 1.95, -106.3);
      this._face.rotation.y = -Math.PI / 2;
      this.scene.add(this._face);
    }
    const f = this._face;
    f.material.opacity = 0.95;
    G.sfx?.trigger('stinger', null, 0.8);
    this._scare(0.8);
    setTimeout(() => { f.material.opacity = 0; }, 260);
  }

  // relámpago: los retratos son calaveras; en el cementerio la dama se acerca
  _onStrike(s) {
    const me = G.me?.pos;
    if (!me) return;
    if (!(inBox(me, ZONES.graveyard) || inBox(me, ZONES.eastcourt))) return;
    const L = this.lady;
    if (!L.g || G.time - L.t < 6) return;
    if (L.stage === 0 && Math.random() > 0.55) return;
    if (G.time - L.t > 60) L.stage = 0;
    L.t = G.time;
    L.stage++;
    const cam = G.camera;
    cam.getWorldDirection(V2).setY(0).normalize();
    const dist = [0, 13, 8, 3.5][Math.min(3, L.stage)];
    const p = V1.copy(me).addScaledVector(V2, dist);
    p.x = clamp(p.x, 25.5, 43); p.z = clamp(p.z, -129, -81);
    L.g.show(p.setY(0), Math.atan2(me.x - p.x, me.z - p.z), 'stand', 0);
    L.flashOnly = true;
    if (L.stage >= 3) {
      setTimeout(() => {
        L.flashOnly = false;
        L.g.target = 1;
        L.g.rush(G.camera.position.clone().setY(0.1), 14);
        L.g.onDone = () => this._jumpscare();
        G.sfx?.trigger('ghost-scream', L.g.pos, 1, { full: 4, max: 30 });
        L.stage = 0;
      }, 700);
    }
  }

  // X sobre un punto del castillo
  use(it) {
    const e = it.ev;
    const cds = { lever: 4, bell: 20, clock: 25, chest: 25, tomb: 40, sheet: 15, cryptgate: 3, log: 5, well: 6 };
    const t = G.time;
    if ((this.cool['use:' + e] ?? -1e9) + (cds[e] || 5) > t) {
      G.sfx?.trigger('ui-err', null, 0.4);
      return;
    }
    this.cool['use:' + e] = t;
    const s = Math.random();
    this.play(e, false, { s });
    this._send(e, { s });
  }

  // un evento que arrancó otro jugador
  remote(m) {
    const e = String(m.e || '');
    const ok = ['slam', 'dining', 'gallery', 'balcony', 'lever', 'bell', 'clock', 'chest', 'tomb', 'sheet', 'cryptgate', 'log', 'well'];
    if (!ok.includes(e)) return;
    // los sustos solo se muestran a los que están cerca; lo que cambia el mundo, a todos
    const world = ['lever', 'bell', 'clock', 'cryptgate', 'log', 'slam'];
    const anchors = { dining: this.castle.anchors.dining, gallery: this.castle.anchors.gallery, balcony: this.castle.anchors.hall, chest: this.castle.anchors.secret, tomb: this.castle.anchors.crypt, sheet: this.castle.anchors.kitchen, well: this.castle.anchors.well };
    if (!world.includes(e) && anchors[e] && !this._near(anchors[e], 22)) return;
    this.play(e, true, m);
  }

  // ---------------------------------------------------------------- cada cuadro
  update(dt) {
    const t = G.time;
    const me = G.me?.pos;
    const storm = this.world.storm;
    // disparadores por zona del jugador local
    if (me && G.inGame) {
      for (const [id, box] of Object.entries(ZONES)) {
        const now = inBox(me, box);
        const was = !!this.inside[id];
        this.inside[id] = now;
        if (now && !was) this._enter(id);
      }
      // espejo: parado frente a él, mirándolo
      if (this.inside.hall && Math.hypot(me.x - 6.2, me.z - -106.3) < 2.2 && G.camera) {
        G.camera.getWorldDirection(V2);
        if (V2.x > 0.7 && this._can('mirror', 150)) this.play('mirror');
      }
      // balcón: mirando hacia arriba desde el salón
      if (this.inside.hall && !this.inside.balcony && G.camera && me.z > -112 && Math.random() < dt * 0.25) {
        G.camera.getWorldDirection(V2);
        V1.set(1.5, 9, -115.2).sub(G.camera.position).normalize();
        if (V2.dot(V1) > 0.93 && this._can('balcony', 110)) { this.play('balcony'); this._send('balcony'); }
      }
      // en el balcón golpean detrás de las puertas clausuradas
      if (this.inside.balcony && Math.random() < dt / 14) {
        const p = this.castle.anchors.upperDoors;
        for (let k = 0; k < 3; k++) setTimeout(() => G.sfx?.trigger('knock', p, 0.9, { full: 2, max: 20 }), k * 330);
      }
    }
    // puertas
    for (const d of Object.values(this.doors)) {
      const sp = d.speed || 1.5;
      if (d.open !== d.target) {
        d.open += clamp(d.target - d.open, -sp * dt, sp * dt);
        if (d.leaves) this._setDoor(d);
        if (d.pivot) {
          if (d === this.doors.keep) continue;
          if (d === this.doors.gallery) d.pivot.rotation.y = -Math.PI / 2 * 0.92 * d.open;
          else if (d === this.doors.secret) d.pivot.rotation.y = 1.35 * d.open;
          else if (d === this.doors.crypt) d.pivot.rotation.y = -1.45 * d.open;
        }
      }
    }
    // fantasmas
    const ladyG = this.lady.g;
    if (ladyG && this.lady.flashOnly && ladyG.visible) ladyG.target = storm ? clamp(storm.flashRaw * 3, 0, 1) : 0;
    ladyG?.update(dt, t);
    this.count?.update(dt, t);
    // retratos: calaveras mientras dura el destello
    const fl = storm ? storm.flashRaw : 0;
    const skull = fl > 0.18;
    if (skull !== this._skull) {
      this._skull = skull;
      for (const p of this.decor?.portraits || []) { p.mat.map = skull ? p.skull : p.normal; }
    }
    // ventanas: el relámpago las ilumina desde afuera y entra por ellas
    if (this.castle.windowsCold) this.castle.windowsCold.emissiveIntensity = 0.25 + fl * 2.2;
    for (const l of this.winLights) l.intensity = fl * 16;
    // fuego del fogón (llamarada al tirar un leño)
    this.fireBoost = Math.max(0, this.fireBoost - dt / 6);
    const fire = this.castle.fire;
    if (fire && this.world.flames) {
      const k = 1 + this.fireBoost * 0.9;
      for (const f of fire.flames) this.world.flames.scale(f.i, f.w * (1 + this.fireBoost * 0.5), f.h * k);
      if (fire.vol >= 0) this.world.fires?.scale(fire.vol, k);
      if (fire.embers) this.world.embers.set(fire.embers, 1 + this.fireBoost * 1.5, 5.5 + this.fireBoost * 3);
      fire.light.base = 16 * (1 + this.fireBoost * 0.8);
      const fb = this._fb || (this._fb = this.world.flicker.find((f) => f.light === fire.light));
      if (fb) fb.base = fire.light.base;
    }
    // reloj: agujas con la hora real (y cuando se vuelve loco, giran)
    const clock = this.decor?.models.clock;
    if (clock) {
      if (!this._hands) {
        this._hands = {};
        clock.traverse((o) => { if (/minute_hand/.test(o.name)) this._hands.m = o; if (/houd_hand|hour_hand/.test(o.name)) this._hands.h = o; });
      }
      const d = new Date();
      let mins = d.getMinutes() + d.getSeconds() / 60, hrs = (d.getHours() % 12) + mins / 60;
      if (this.clockSpin > 0) { this.clockSpin -= dt; this._spin = (this._spin || 0) + dt * 14; mins += this._spin * 9; hrs -= this._spin; }
      if (this._hands.m) this._hands.m.rotation.set(0, 0, -(mins / 60) * Math.PI * 2);
      if (this._hands.h) this._hands.h.rotation.set(0, 0, -(hrs / 12) * Math.PI * 2);
    }
    // mecedoras: se hamacan solas (más cuando hay alguien cerca)
    for (const [key, anchor] of [['rocking', this.castle.anchors.library], ['rocking2', this.castle.anchors.gallery]]) {
      const m = this.decor?.models[key];
      if (!m) continue;
      const near = me ? clamp(1 - Math.hypot(me.x - m.position.x, me.z - m.position.z) / 9, 0, 1) : 0;
      m.rotation.x = Math.sin(t * 1.9 + (key === 'rocking' ? 0 : 2)) * (0.05 + near * 0.12);
      if (near > 0.3 && Math.random() < dt * 0.35) G.sfx?.trigger('creak', m.position, 0.35, { full: 2, max: 12 });
    }
    // bustos: te siguen con la mirada
    for (const b of this.decor?.models.busts || []) {
      if (!me) break;
      const want = Math.atan2(me.x - b.position.x, me.z - b.position.z);
      const d = Math.hypot(me.x - b.position.x, me.z - b.position.z);
      if (d < 9) { let da = want - b.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); b.rotation.y += da * Math.min(1, dt * 0.6); }
    }
    // cofre: la tapa se abre (y brilla)
    const chest = this.decor?.models.chest;
    if (chest) {
      if (!this._lid) chest.traverse((o) => { if (/lid/.test(o.name)) this._lid = o; });
      if (this._lid) this._lid.rotation.x += ((this.chestOpen ? -1.2 : 0) - this._lid.rotation.x) * Math.min(1, dt * 3);
    }
    // sarcófago: la tapa se corre
    const lid = this.decor?.models.tombLid;
    if (lid) lid.position.x += ((this.tombOpen ? 1.1 : 0) + lid.userData.x0 - lid.position.x) * Math.min(1, dt * 1.2);
    // sábana: se sienta
    const sh = this.decor?.models.sheetTorso;
    if (sh) sh.rotation.z += ((this.sheetUp ? 1.15 : 0) - sh.rotation.z) * Math.min(1, dt * (this.sheetUp ? 5 : 1.5));
    // haz del proyector: prendido si la pantalla del fogón tiene algo
    if (this.beam) {
      const on = !!G.media?.screens?.get?.('fogon')?.control?.state?.cur;
      this.beam.visible = on;
      this.beam.material.uniforms.uT.value = t;
      this.beam.material.uniforms.uA.value = on ? 1 : 0;
    }
    // la campana se hamaca después de tocar
    // latidos y destello de pantalla
    const inCrypt = !!this.inside.crypt;
    this.heart = Math.max(inCrypt ? 0.45 : 0, this.heart - dt * 0.12);
    this.overlayK = Math.max(0, this.overlayK - dt * 2.5);
    if (this.overlay) this.overlay.style.opacity = this.overlayK.toFixed(3);
    // campanada de medianoche: cada 10 minutos (hora del servidor) el campanario da 12 campanadas
    const now = (G.net?.now?.() ?? Date.now()) / 1000;
    const slot = Math.floor(now / 600);
    if (this._mid === undefined) this._mid = slot;
    if (slot !== this._mid) {
      this._mid = slot;
      const b = this.castle.anchors.bell;
      for (let k = 0; k < 12; k++) setTimeout(() => G.sfx?.trigger('bell', b, 0.85, { full: 40, max: 320 }), k * 2400);
    }
  }

  _enter(id) {
    const c = this.castle;
    if (id === 'hall' && this.doors.keep.open > 0.9 && G.me.pos.z < KZ1 - 2 && this._can('slam', 95)) { this.play('slam'); this._send('slam'); }
    if (id === 'dining' && this._can('dining', 140)) { this.play('dining'); this._send('dining'); }
    if (id === 'gallery' && this._can('gallery', 120)) { this.play('gallery'); this._send('gallery'); }
    if (id === 'secret' && this._can('secret', 90)) { G.sfx?.trigger('ghost-breath', c.anchors.secret, 0.7, { full: 3, max: 16 }); this.heart = Math.max(this.heart, 0.5); }
    if (id === 'crypt' && this._can('crypt', 80)) { G.sfx?.trigger('whisper', c.anchors.crypt, 0.6, { full: 4, max: 20 }); }
  }

  // loops de ambiente: fuego, latidos, zumbido del torreón, tic-tac del reloj, lluvia en el aljibe
  ambience(dt, sfx) {
    const c = this.castle;
    const f = c.anchors.fire;
    if (f) sfx._loop('fogon-fire', 'fire', 0.55 * (1 + this.fireBoost * 0.6), { x: f.x, y: 0.8, z: f.z }, { bus: 'ambient', full: 3, max: 24 });
    for (const [k, x, z] of [['fp1', -22.6, -109.5], ['fp2', 22.6, -111.5]]) sfx._loop(k, 'fire', 0.3, { x, y: F0 + 0.8, z }, { bus: 'ambient', full: 2, max: 12 });
    const io = this.world.storm?.indoor || 0;
    const inKeep = G.me && (this.inside.hall || this.inside.dining || this.inside.gallery || this.inside.kitchen || this.inside.library || this.inside.secret || this.inside.crypt || this.inside.balcony);
    sfx._loop('keep-drone', 'drone', inKeep ? 0.32 * Math.max(0.5, io) : 0, null, { bus: 'ambient' });
    sfx._loop('heart', 'heartbeat', this.heart * 0.55, null, { bus: 'sfx', rate: 0.9 + this.heart * 0.5 });
    sfx._loop('clock-tick', 'clock-tick', 0.25, { x: 7.3, y: F0 + 1.5, z: -112.6 }, { bus: 'ambient', full: 1.5, max: 11 });
    sfx._loop('musicbox', 'musicbox', 0.28, { x: -5.6, y: F0 + 1.0, z: -124.6 }, { bus: 'ambient', full: 1.5, max: 13 });
    // música por zona y reverberación (piedra adentro, eco en la cripta)
    const st = this.world.storm, s = st ? st.s : 0, me = G.me?.pos;
    let track = null, lvl = 0.5, verb = 0.03;
    if (me && s > 0.25) {
      const nearFire = f && Math.hypot(me.x - f.x, me.z - f.z) < 10;
      const screenOn = !!G.media?.screens?.get?.('fogon')?.control?.state?.cur;
      if (this.inside.crypt) { track = 'cripta'; verb = 0.5; }
      else if (inKeep) { track = 'torreon'; verb = 0.3; }
      else if (nearFire) { track = screenOn ? null : 'fogon'; lvl = 0.42; verb = 0.07; }
      else if (this.inside.graveyard) { track = 'cementerio'; verb = 0.1; }
      else { track = 'patio'; lvl = 0.36; verb = 0.12; }
      if (this.heart > 0.55 && track !== 'fogon') { track = 'tension'; lvl = 0.55; }
      lvl *= Math.min(1, (s - 0.25) / 0.4);
    }
    sfx.music?.update(dt, track, lvl);
    sfx.reverbLevel = verb;
  }
}
