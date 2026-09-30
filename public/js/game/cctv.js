// Cámaras de seguridad: repartidas por el mapa (afuera, cámaras de circuito cerrado con su lucecita roja; en el
// castillo, OJOS de verdad, con venas, que siguen al que pasa cerca y parpadean). En el Búnker, la sala de monitores:
// una pared de seis pantallas que van rotando las vistas, y en el escritorio (X) se mira una a pantalla completa
// (A/D o click cambian de cámara, Esc sale).
// Rendimiento: las pantallas se dibujan solo si estás cerca de la pared, de a una por cuadro (cada una ~4 veces por
// segundo), chiquitas y sin recalcular sombras.
import * as THREE from 'three';
import { G } from '../core/G.js';

const HAS_DOM = typeof document !== 'undefined';
const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const Q1 = new THREE.Quaternion();

// eye: ojo del castillo (si no, cámara común). p: dónde está; look: adónde apunta de reposo
export const CAMS = [
  { id: 'porton', name: 'PORTÓN', p: [5.6, 5.2, -74.4], look: [0, 0.5, -60] },
  { id: 'feria', name: 'LA FERIA', p: [-7.6, 5.2, -74.4], look: [-22, 0.5, -62] },
  { id: 'taberna', name: 'LA TABERNA', p: [31, 4.6, -77.7], look: [22, 0.8, -62] },
  { id: 'fogon', name: 'EL FOGÓN', p: [-14.3, 4.2, -102.6], look: [-27, 0.6, -91], eye: true },
  { id: 'cementerio', name: 'CEMENTERIO', p: [26.4, 4.2, -129.3], look: [35, 0.6, -115], eye: true },
  { id: 'huerta', name: 'LA HUERTA', p: [-26.4, 4.2, -129.3], look: [-36, 0.6, -114], eye: true },
  { id: 'patio', name: 'PATIO', p: [25.7, 5, -102.5], look: [28, 0.6, -88], eye: true },
  { id: 'cripta', name: 'LA CRIPTA', p: [22.9, 2.3, -124.2], look: [13, 0.4, -112], eye: true },
  { id: 'bar', name: 'BAR CORTACÉSPED', p: [96.2, 3.6, -41.3], look: [106, 0.6, -30] },
  { id: 'cancha', name: 'LA CANCHA', p: [-31.5, 6.5, 17.5], look: [0, 0, 35], pole: true },
  { id: 'galpon', name: 'EL GALPÓN', p: [-86.5, 4.5, -21.5], look: [-94, 0.5, -14] },
  { id: 'pista', name: 'BÚNKER · PISTA', p: [-22.5, 6.2, -476.5], look: [0, 0.5, -460] },
];

function eyeTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  // esclerótica amarillenta con venas rojas que salen del iris (proyección equirectangular: el iris en u = 0.75)
  g.fillStyle = '#e8dcc8'; g.fillRect(0, 0, 256, 128);
  const ix = 192, iy = 64;
  g.strokeStyle = 'rgba(160,10,10,0.75)';
  for (let i = 0; i < 46; i++) {
    let x = ix + (Math.random() - 0.5) * 30, y = iy + (Math.random() - 0.5) * 30;
    g.lineWidth = 0.6 + Math.random() * 1.4;
    g.beginPath(); g.moveTo(x, y);
    const a = Math.random() * Math.PI * 2;
    for (let k = 0; k < 8; k++) { x += Math.cos(a + (Math.random() - 0.5)) * 9; y += Math.sin(a + (Math.random() - 0.5)) * 6; g.lineTo(x, y); }
    g.stroke();
  }
  const ir = g.createRadialGradient(ix, iy, 2, ix, iy, 22);
  ir.addColorStop(0, '#000'); ir.addColorStop(0.35, '#000'); ir.addColorStop(0.4, '#a36a10'); ir.addColorStop(0.85, '#5a2a05'); ir.addColorStop(1, '#2a1002');
  g.fillStyle = ir; g.beginPath(); g.ellipse(ix, iy, 22, 22, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Cctv {
  constructor({ scene, renderer, world, getLocal }) {
    this.getLocal = getLocal;
    this.scene = scene;
    this.renderer = renderer;
    this.world = world;
    this.cams = CAMS.map((c) => ({ ...c, pos: new THREE.Vector3(...c.p), rest: new THREE.Vector3(...c.look), aim: new THREE.Vector3(...c.look), node: null }));
    this.screens = [];
    this.feedCam = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 160);
    this.slot = 0;
    this.rot = 0;
    this.frame = 0;
  }

  build() {
    if (!HAS_DOM) return this;
    const eyeMat = new THREE.MeshStandardMaterial({ map: eyeTexture(), roughness: 0.18 });
    const flesh = new THREE.MeshStandardMaterial({ color: 0x6a2a2a, roughness: 0.55 });
    const lid = new THREE.MeshStandardMaterial({ color: 0x8a4a42, roughness: 0.7, side: THREE.DoubleSide });
    const body = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.5, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x151518, roughness: 0.4, metalness: 0.4 });
    this.led = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1010, emissiveIntensity: 2 });
    for (const c of this.cams) {
      const g = new THREE.Group();
      g.position.copy(c.pos);
      if (c.eye) {
        // un ojo del tamaño de una cabeza, en una cuenca de carne pegada a la piedra, con párpados que parpadean
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), flesh); socket.scale.set(1.15, 1.05, 0.5); socket.position.z = -0.14; g.add(socket);
        // el iris de la textura queda hacia -Z de la esfera: se da vuelta para que mire adonde apunta el grupo (+Z)
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), eyeMat); ball.rotation.y = Math.PI; g.add(ball);
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.235, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), lid);
        const bot = top.clone(); bot.rotation.x = Math.PI;
        g.add(top, bot);
        // venas que se meten en la pared
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const pts = [new THREE.Vector3(Math.cos(a) * 0.25, Math.sin(a) * 0.22, -0.05), new THREE.Vector3(Math.cos(a) * 0.45, Math.sin(a) * 0.4, -0.12), new THREE.Vector3(Math.cos(a + 0.3) * 0.62, Math.sin(a + 0.3) * 0.55, -0.2)];
          g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.02, 5), flesh));
        }
        c.ball = ball; c.lids = [top, bot]; c.blink = 2 + Math.random() * 4;
      } else {
        // cámara de circuito cerrado: brazo a la pared, cuerpo, visera, lente y la lucecita
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.38), body); b.position.z = 0.1; g.add(b);
        const hood = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.44), body); hood.position.set(0, 0.085, 0.12); g.add(hood);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 16), dark); lens.rotation.x = Math.PI / 2; lens.position.z = 0.31; g.add(lens);
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), this.led); l.position.set(0.05, -0.04, 0.3); g.add(l);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), dark); arm.rotation.x = Math.PI / 2; arm.position.z = -0.15; g.add(arm);
        c.ball = g;
      }
      g.lookAt(c.rest);
      this.scene.add(g);
      if (c.pole) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, c.pos.y, 8), dark);
        pole.position.set(c.pos.x - 0.05, c.pos.y / 2, c.pos.z - 0.05);
        this.scene.add(pole);
        G.phys?.cylinder(pole.position.x, c.pos.y / 2, pole.position.z, c.pos.y / 2, 0.08, { mat: 'metal' });
      }
      c.node = g;
    }
    this._buildWall();
    return this;
  }

  // la pared de monitores del Búnker (sala de control): 3 x 2 pantallas
  _buildWall() {
    const A = this.world.club?.anchors?.monitors;
    if (!A) return;
    const mat = (rt, label) => new THREE.ShaderMaterial({
      uniforms: { tFeed: { value: rt.texture }, tLabel: { value: label }, uT: { value: 0 }, uOn: { value: 0 } },
      toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tFeed, tLabel; uniform float uT, uOn; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec3 c = texture2D(tFeed, vUv).rgb;
          float l = dot(c, vec3(0.3, 0.59, 0.11));
          l = pow(clamp(l * 2.6, 0.0, 1.0), 0.75);            // visión nocturna: todo más claro, en verde
          vec3 col = vec3(0.55, 1.0, 0.6) * l;
          col += (h(floor(vUv * vec2(240.0, 135.0)) + floor(uT * 24.0)) - 0.5) * 0.12;
          col *= 0.86 + 0.14 * sin(vUv.y * 420.0 + uT * 18.0);
          col *= smoothstep(0.95, 0.4, length(vUv - 0.5));
          col = mix(vec3(h(vUv * 300.0 + uT) * 0.4), col, uOn);   // sin señal: estática
          vec4 lb = texture2D(tLabel, vUv);
          col = mix(col, lb.rgb, lb.a);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
      const rt = new THREE.WebGLRenderTarget(256, 144, { colorSpace: THREE.SRGBColorSpace });
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 144;
      const label = new THREE.CanvasTexture(cv);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.81), mat(rt, label));
      m.position.set(A.x + 0.13, A.y + 0.5 - r * 0.95, A.z + 1.5 - k * 1.5);
      m.rotation.y = Math.PI / 2;
      this.world.club.group.add(m);
      this.screens.push({ m, rt, cv, label, cam: -1 });
    }
    this.wallPos = A.clone();
    this._assign();
  }
  _assign() {
    // cada 12 s la pared pasa a las cámaras siguientes
    for (let i = 0; i < this.screens.length; i++) {
      const s = this.screens[i];
      s.cam = (this.rot * this.screens.length + i) % this.cams.length;
      const g = s.cv.getContext('2d');
      g.clearRect(0, 0, 256, 144);
      g.font = 'bold 15px monospace'; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(4, 4, 150, 20);
      g.fillStyle = '#b8ffb0'; g.fillText(`CAM ${String(s.cam + 1).padStart(2, '0')} ${this.cams[s.cam].name}`, 8, 19);
      s.label.needsUpdate = true;
    }
  }

  // pone una cámara (de las del mapa) en la pose de la cámara de seguridad i
  pose(i, cam, t = 0) {
    const c = this.cams[((i % this.cams.length) + this.cams.length) % this.cams.length];
    cam.position.copy(c.pos);
    // se corre un poquito hacia adelante (que no se vea el propio ojo/cuerpo) y hace un paneo lento
    V1.copy(c.aim).sub(c.pos).normalize();
    cam.position.addScaledVector(V1, 0.35);
    V2.copy(c.aim).add(V1.set(Math.sin(t * 0.25) * 1.5, 0, Math.cos(t * 0.21) * 1.0));
    cam.lookAt(V2);
    return c;
  }

  update(dt, camera) {
    if (!HAS_DOM || !this.cams[0].node) return;
    this.frame++;
    const t = G.time || 0;
    this.led.emissiveIntensity = Math.sin(t * 3) > 0 ? 2.2 : 0.2;
    // los ojos miran al jugador más cercano (hasta 18 m); si no hay nadie, recorren el lugar
    const people = [];
    const me = this.getLocal?.();
    if (me && !me.dead && !me.inv) people.push(me.pos);
    for (const p of G.players?.values?.() || []) if (p.pos && !p.inv && !p.invisible) people.push(p.pos);
    for (const c of this.cams) {
      if (!c.eye || !c.node) continue;
      if (camera && camera.position.distanceToSquared(c.pos) > 3600) continue;
      let best = null, bd = 18 * 18;
      for (const p of people) { if (!p) continue; const d = c.pos.distanceToSquared(p); if (d < bd) { bd = d; best = p; } }
      if (best) V1.set(best.x, best.y + 1.5, best.z); else V1.copy(c.rest).add(V2.set(Math.sin(t * 0.4 + c.pos.x) * 4, 0, Math.cos(t * 0.33 + c.pos.z) * 3));
      c.aim.lerp(V1, Math.min(1, dt * (best ? 3 : 0.8)));
      c.node.lookAt(c.aim);
      // parpadeo
      c.blink -= dt;
      const k = c.blink < 0 ? Math.max(0, 1 - Math.abs(c.blink + 0.08) / 0.08) : 0;
      if (c.blink < -0.16) c.blink = 2 + Math.random() * 5;
      // párpados: casquetes que se van para atrás al abrir (bien abierto si te está mirando) y se cierran al parpadear
      const open = (best ? 1.45 : 1.15) * (1 - k);
      c.lids[0].rotation.x = -open;
      c.lids[1].rotation.x = Math.PI + open;
    }
    // pared de monitores: solo si estás cerca
    if (!this.screens.length || !camera || camera.position.distanceTo(this.wallPos) > 16) return;
    this._rotT = (this._rotT || 0) + dt;
    if (this._rotT > 12) { this._rotT = 0; this.rot++; this._assign(); }
    for (const s of this.screens) { s.m.material.uniforms.uT.value = t; }
    if (this.frame % 2) return;
    const s = this.screens[this.slot++ % this.screens.length];
    this.renderFeed(s.cam, s.rt);
    s.m.material.uniforms.uOn.value = 1;
  }
  renderFeed(i, rt) {
    const r = this.renderer;
    this.pose(i, this.feedCam, G.time || 0);
    const prev = r.getRenderTarget(), sh = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(rt);
    r.render(this.scene, this.feedCam);
    r.setRenderTarget(prev);
    r.shadowMap.autoUpdate = sh;
  }
}
