// Personajes no jugadores del Búnker (portero, DJ, bartender, bailarinas, la gente de la pista).
// Usan el mismo cuerpo que los jugadores (HumanCharacter con el animador procedural): caminan, bailan con los gestos,
// hablan con un globo arriba de la cabeza y miran a quien se les acerca. Lo que hace cada uno lo decide su "rol" (una
// función por cuadro); acá solo el cuerpo, el globo y el mirar.
import * as THREE from 'three';
import { G, clamp } from '../core/G.js';
import { HumanCharacter, humansReady } from '../char/human.js';

const V1 = new THREE.Vector3();
const HAS_DOM = typeof document !== 'undefined';

function angleDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

export class Npc {
  constructor(scene, { name = '', look = {}, pos, yaw = 0, role = null, height = 1 } = {}) {
    this.scene = scene;
    this.name = name;
    this.look = look;
    this.pos = pos.clone();
    this.yaw = yaw;
    this.baseYaw = yaw;
    this.role = role;
    this.heightK = height;
    this.char = null;
    this.emote = null; this.emoteT = 0;
    this.headYaw = 0; this.aimPitch = 0;
    this.speed = 0;
    this.sit = false; this.table = false;
    this.action = null; this.actionT = 0;
    this.talk = 0;
    this.bubble = null; this.bubbleT = 0;
    this.lookAt = null; // Vector3 a quien mira
    this.visible = true;
    this.data = {}; // estado del rol
  }

  _build() {
    if (this.char || !humansReady()) return !!this.char;
    try {
      this.char = new HumanCharacter(this.look);
      this.char.root.name = 'npc:' + this.name;
      if (this.heightK !== 1) this.char.root.scale.setScalar(this.heightK);
      this.scene.add(this.char.root);
    } catch (e) { console.warn('npc', this.name, e); this.char = null; }
    return !!this.char;
  }

  say(text, secs = 3.2) {
    if (!HAS_DOM) return;
    if (!this.bubble) {
      const el = document.createElement('div');
      el.className = 'tag3d npc';
      el.innerHTML = '<div class="bubble"></div><span class="name"></span>';
      el.querySelector('.name').textContent = this.name;
      document.getElementById('overlay')?.appendChild(el);
      this.bubble = el;
    }
    const b = this.bubble.querySelector('.bubble');
    b.textContent = text;
    b.style.display = '';
    this.bubbleT = secs;
    this.talk = Math.min(secs, 0.25 + text.length * 0.06);
  }

  update(dt, camera, show = true) {
    if (!this._build()) return;
    this.visible = show;
    this.char.root.visible = show;
    if (!show) { if (this.bubble) this.bubble.style.display = 'none'; return; }
    this.role?.(this, dt);
    // mirar a alguien: la cabeza primero, el cuerpo si hace falta
    let want = this.baseYaw, hy = 0;
    if (this.lookAt) {
      const a = Math.atan2(this.lookAt.x - this.pos.x, this.lookAt.z - this.pos.z);
      const d = angleDiff(this.baseYaw, a);
      if (Math.abs(d) > 0.9) want = this.baseYaw + d - Math.sign(d) * 0.9;
      hy = clamp(angleDiff(want, a), -1.1, 1.1);
    }
    if (!this.sit) this.yaw += angleDiff(this.yaw, want) * Math.min(1, dt * 3);
    this.headYaw += (hy - this.headYaw) * Math.min(1, dt * 4);
    if (this.emote) this.emoteT += dt;
    if (this.action) { this.actionT += dt; if (this.actionT > (this.actionEnd || 1.6)) this.action = null; }
    this.talk = Math.max(0, this.talk - dt);
    const ch = this.char;
    ch.root.position.copy(this.pos);
    ch.root.rotation.set(0, this.yaw, 0);
    ch.talk = this.talk > 0 ? 0.5 + 0.5 * Math.sin(G.time * 18) : 0;
    ch.animate({ speed: this.speed, grounded: true, sit: this.sit, table: this.table, aimPitch: this.aimPitch, headYaw: this.headYaw, emote: this.emote, emoteT: this.emoteT, action: this.action, actionT: this.actionT }, dt);
    ch.update(dt);
    // globo
    if (this.bubble) {
      this.bubbleT -= dt;
      const el = this.bubble;
      if (this.bubbleT <= 0 || !camera) { el.style.display = 'none'; return; }
      V1.copy(this.pos); V1.y += 2.05 * this.heightK * ((ch.meta?.height || 1.8) / 1.8);
      const dist = camera.position.distanceTo(V1);
      V1.project(camera);
      if (V1.z > 1 || dist > 22) { el.style.display = 'none'; return; }
      el.style.display = '';
      const x = (V1.x * 0.5 + 0.5) * innerWidth, y = (-V1.y * 0.5 + 0.5) * innerHeight;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${clamp(1.12 - dist / 30, 0.6, 1)})`;
    }
  }

  dispose() {
    this.char?.root.removeFromParent();
    this.char?.dispose?.();
    this.bubble?.remove();
  }
}
