// Personajes no jugadores del Búnker (portero, DJ, bartender, bailarinas, la gente de la pista).
// Usan el mismo cuerpo que los jugadores (HumanCharacter con el animador procedural): caminan, bailan con los gestos,
// hablan con un globo arriba de la cabeza y miran a quien se les acerca. Lo que hace cada uno lo decide su "rol" (una
// función por cuadro); acá solo el cuerpo, el globo y el mirar.
import * as THREE from 'three';
import { G, clamp } from '../core/G.js';
import { HumanCharacter, humansReady, loadHuman } from '../char/human.js';
import { Ragdoll, PART } from './ragdoll.js';
import { GR } from '../core/physics.js';

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const Q1 = new THREE.Quaternion();
const E1 = new THREE.Euler();
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
    // cuerpo físico (opcional): un ragdoll que sigue la animación; los golpes de los jugadores le llegan como a la
    // bolsa de boxeo (kind 'bag' -> punch) y uno fuerte lo tumba (ragdoll de verdad) hasta que se levanta
    this.physical = false;
    this.rag = null;
    this.down = 0; // segundos que le quedan tirado
    this.hp = 100;
    this.snap = { head: new THREE.Vector2(), headV: new THREE.Vector2(), torso: new THREE.Vector2(), torsoV: new THREE.Vector2() };
    this.onHurt = null; // (npc, s, point, byPlayer) => void
  }

  _ensureRag() {
    if (this.rag || !this.physical || !G.phys || !this.char) return;
    this.rag = new Ragdoll(G.phys, this.char.meta, {
      kinematic: true, member: GR.REMOTE, filter: GR.WORLD | GR.PROP | GR.RAGDOLL | GR.REMOTE | GR.VEHICLE,
      tag: { kind: 'bag', ref: this },
    });
    this.char.root.updateMatrixWorld(true);
    this.rag.build(this.char.readWorldTransforms());
  }

  // un golpe (de un jugador: la mano o el pie tocó uno de sus cuerpos; o de otro NPC): speed m/s, dir hacia donde empuja
  punch(speed, point, dir, mass = 1, byPlayer = true) {
    if (!this.char) return;
    const s = Math.min(1.6, (speed / 8) * Math.sqrt(mass));
    // la parte más cercana al punto
    let part = PART.TORSO, best = 1e9;
    if (this.rag?.alive) for (let i = 0; i < 11; i++) { const t = this.rag.bodies[i].translation(); const d = V1.set(t.x, t.y, t.z).distanceToSquared(point); if (d < best) { best = d; part = i; } }
    else if (point.y > this.pos.y + 1.45 * this.heightK) part = PART.HEAD;
    // la cabeza (o el torso) acusa el golpe: resortes en el marco del cuerpo
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    const fwd = dir.x * sn + dir.z * c, side = dir.x * c - dir.z * sn;
    const k = part === PART.HEAD ? this.snap.headV : this.snap.torsoV;
    k.x += -fwd * 9 * s; k.y += side * 7 * s;
    this.snap.torsoV.x += -fwd * 3 * s;
    try { this.char.wound(part, this.char.worldToPart(part, point, V2), 'blunt', Math.min(1, s * 0.8), null, (Math.random() * 1e6) | 0); } catch { /* */ }
    this.hp -= s * (part === PART.HEAD ? 28 : 16);
    this.onHurt?.(this, s, point, byPlayer);
    if ((this.hp <= 0 || s > 1.25) && !this.down) this.knockout(V1.copy(dir).multiplyScalar(2 + s * 3).setY(1 + s));
  }

  knockout(vel, secs = 5) {
    this._ensureRag();
    if (!this.rag) return;
    this.down = secs;
    this.action = null; this.emote = null;
    this.rag.setKinematic(false, vel);
    this.char.mode = 'rag';
  }

  _getUp() {
    const pt = this.rag.pelvis().translation();
    this.pos.set(pt.x, this.pos.y, pt.z);
    this.rag.setKinematic(true);
    this.char.mode = 'anim';
    this.hp = 100;
    this.action = 'getup'; this.actionT = 0; this.actionEnd = 0.9;
  }

  _build() {
    if (this.char) return true;
    const key = this.look.model;
    if (!humansReady(key)) { loadHuman(key); return false; } // se baja una vez (lo comparten todos los que lo usan)
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
    ch.talk = this.talk > 0 ? 0.5 + 0.5 * Math.sin(G.time * 18) : 0;
    if (this.down > 0) {
      // tirado: el cuerpo es el ragdoll
      this.down -= dt;
      ch.applyWorldTransforms(this.rag.read());
      if (this.down <= 0) this._getUp();
    } else {
      ch.root.position.copy(this.pos);
      ch.root.rotation.set(0, this.yaw, 0);
      ch.animate({ speed: this.speed, grounded: true, sit: this.sit, table: this.table, aimPitch: this.aimPitch, headYaw: this.headYaw, emote: this.emote, emoteT: this.emoteT, action: this.action, actionT: this.actionT }, dt);
      // resortes de los golpes (subamortiguados: la cabeza se va y vuelve)
      const S = this.snap, w = 22, z = 0.35;
      for (const [a, v] of [[S.head, S.headV], [S.torso, S.torsoV]]) {
        v.x += (-w * w * a.x - 2 * z * w * v.x) * dt; v.y += (-w * w * a.y - 2 * z * w * v.y) * dt;
        a.x += v.x * dt; a.y += v.y * dt;
      }
      if (Math.abs(S.head.x) + Math.abs(S.head.y) + Math.abs(S.torso.x) > 1e-4) {
        ch.joints[2].quaternion.multiply(Q1.setFromEuler(E1.set(S.head.x, 0, S.head.y)));
        ch.joints[1].quaternion.multiply(Q1.setFromEuler(E1.set(S.torso.x, 0, S.torso.y * 0.5)));
      }
      if (this.physical) {
        this._ensureRag();
        if (this.rag?.alive) { ch.root.updateMatrixWorld(true); this.rag.follow(ch.readWorldTransforms(), dt); }
      }
    }
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
    this.rag?.destroy();
    this.char?.root.removeFromParent();
    this.char?.dispose?.();
    this.bubble?.remove();
  }
}
