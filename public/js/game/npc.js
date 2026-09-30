// Personajes no jugadores del Búnker (portero, DJ, bartender, bailarinas, la gente de la pista).
// Usan el mismo cuerpo que los jugadores (HumanCharacter con el animador procedural): caminan, bailan con los gestos,
// hablan con un globo arriba de la cabeza y miran a quien se les acerca. Lo que hace cada uno lo decide su "rol" (una
// función por cuadro); acá solo el cuerpo, el globo y el mirar.
import * as THREE from 'three';
import { G, clamp } from '../core/G.js';
import { HumanCharacter, humansReady, loadHuman, MODELS } from '../char/human.js';
import { voiceFor, voiceRate, vocalName } from '../audio/vocals.js';
import { Ragdoll, PART } from './ragdoll.js';
import { GR } from '../core/physics.js';
import { goreFor, branchOf } from './gore.js';
import { EquipmentView } from './equipment.js';

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
    // muerte y vuelta: tirado un rato, desaparece y reaparece entero en su lugar
    this.home = { pos: pos.clone(), yaw };
    this.dead = false; this.deadT = 0;
    this.respawnSecs = 25;
    this.lost = 0; // miembros que perdió (bits de parte)
    this.onRespawn = null;
    this.item = 0; // en la mano (modelo de equipment.js: 1 birra, 2 faso, 8 poción, 9 choripán...)
    this.equip = null;
    this.crouch = false;
    this.prop = null; // algo que no es de equipment (la pala del sepulturero): Object3D pegado a la mano derecha
  }

  // quejido / grito / muerte con la voz de su modelo (cada NPC la suya: el número sale del nombre)
  vocal(kind) {
    if (this.lost & (1 << PART.HEAD)) return;
    const now = performance.now();
    if (now - (this._vocT || 0) < (kind === 'hurt' ? 350 : 120)) return;
    this._vocT = now;
    let id = 0; for (const ch of this.name) id = (id * 31 + ch.charCodeAt(0)) | 0;
    const voice = voiceFor(MODELS[this.look.model], id);
    G.sfx?.trigger(vocalName(kind, voice), V1.copy(this.pos).setY(this.pos.y + 1.5), kind === 'hurt' ? 0.75 : 0.95, { rate: voiceRate(id), full: 3, max: 30, slot: 'npc' + this.name });
  }

  // pierde un miembro (con su chorro); sin pierna no se levanta más: se desangra y reaparece
  loseLimb(part, vel = V2.set(0, 2, 0)) {
    if (!this.char || part <= PART.TORSO) return;
    const par = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9][part];
    if ((this.lost & (1 << part)) || (par > 0 && (this.lost & (1 << par)))) return;
    this._ensureRag();
    this.lost |= 1 << part;
    try { G.gore?.sever(this.char, part, { vel: vel.clone() }); } catch (e) { console.warn(e); }
    this.rag?.detachBranch(part, branchOf(part));
    if (part === PART.HEAD) { this.die(vel); return; }
    this.vocal('scream');
    if (part >= PART.THIGH_L) { if (!this.down) this.knockout(V1.copy(vel).multiplyScalar(0.3), 6); }
    else this.say(['¡MI BRAZO!', '¡AAAAH!', '¡La puta madre!'][Math.floor(Math.random() * 3)], 2);
  }
  _popHead(vel) {
    if (!this.char || this.lost & (1 << PART.HEAD)) return;
    this._ensureRag();
    this.lost |= 1 << PART.HEAD;
    try { G.gore?.explodeHead(this.char, { vel: vel.clone() }); } catch (e) { console.warn(e); }
    this.rag?.detachBranch(PART.HEAD, branchOf(PART.HEAD));
    this.die(vel);
  }
  die(vel = V2.set(0, 0.5, 0)) {
    if (this.dead) return;
    this.vocal('death');
    this.dead = true; this.deadT = 0;
    if (this.bubble) this.bubble.style.display = 'none';
    this.bubbleT = 0;
    if (!this.down) this.knockout(vel.clone(), 1e9);
    else this.down = 1e9;
  }
  // una explosión (k: 0 lejos .. 1 encima)
  blastGore(k, vel) {
    if (!this.char) return;
    this.hp -= k * 130;
    if (k > 0.9 && Math.random() < 0.4) { this._popHead(vel); return; }
    const limbs = [4, 6, 8, 10, 3, 5, 7, 9];
    const n = Math.random() < k - 0.25 ? (k > 0.75 ? 2 : 1) : 0;
    for (let j = 0; j < n; j++) this.loseLimb(limbs[(Math.random() * limbs.length) | 0], V1.copy(vel).add(V2.set(Math.random() - 0.5, 1, Math.random() - 0.5)));
    if (this.hp < -40) this.die(vel);
  }
  respawn() {
    this.rag?.destroy(); this.rag = null;
    this.char?.root.removeFromParent();
    this.char?.dispose?.();
    this.char = null;
    this.pos.copy(this.home.pos); this.yaw = this.baseYaw = this.home.yaw;
    this.hp = 100; this.lost = 0; this.dead = false; this.deadT = 0; this.down = 0;
    this.action = null; this.emote = null; this.speed = 0; this.data = {};
    for (const k of Object.values(this.snap)) k.set(0, 0);
    this.onRespawn?.(this);
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
  punch(speed, point, dir, mass = 1, byPlayer = true, kind = 'blunt') {
    if (!this.char || this.dead) return;
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
    try { this.char.wound(part, this.char.worldToPart(part, point, V2), kind === 'bullet' ? 'cut' : 'blunt', Math.min(1, s * 0.8), null, (Math.random() * 1e6) | 0); } catch { /* */ }
    this.hp -= s * (part === PART.HEAD ? 28 : 16) * (kind === 'bullet' ? 2.2 : 1);
    this.onHurt?.(this, s, point, byPlayer);
    if (s > 0.25) this.vocal(s > 1 || kind === 'bullet' ? 'scream' : 'hurt');
    // gore: un tiro puede reventar la cabeza o arrancar un brazo/una pierna (no siempre: si no, es una picadora)
    if (kind !== 'blunt' && Math.random() < 0.55) {
      const g = goreFor(part, (speed / 8) * Math.sqrt(mass), kind, 'remote');
      const vel = V1.copy(dir).multiplyScalar(2 + s * 2).setY(1.2);
      if (g.headPop) { this._popHead(vel); return; }
      if (g.sever >= 0) this.loseLimb(g.sever, vel);
    }
    if (this.hp < -60) { this.die(V1.copy(dir).multiplyScalar(3).setY(1)); return; }
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
    if (!show) {
      if (this.bubble) this.bubble.style.display = 'none';
      if (this.equip?.group) this.equip.group.visible = false;
      if (this.prop) this.prop.visible = false;
      return;
    }
    if (this.equip?.group) this.equip.group.visible = true;
    if (this.dead) {
      // muerto: tirado; al rato se va y vuelve entero
      this.deadT += dt;
      if (this.equip) this.equip.dispose();
      if (this.prop) this.prop.visible = false;
      if (this.rag?.alive) this.char.applyWorldTransforms(this.rag.read());
      this.char.update(dt);
      if (this.deadT > this.respawnSecs) this.respawn();
      return;
    }
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
      if (this.down <= 0) {
        // sin una pierna no se levanta: se queda y se desangra
        if (this.lost & ((1 << PART.THIGH_L) | (1 << PART.SHIN_L) | (1 << PART.THIGH_R) | (1 << PART.SHIN_R))) this.die();
        else this._getUp();
      }
    } else {
      ch.root.position.copy(this.pos);
      ch.root.rotation.set(0, this.yaw, 0);
      ch.animate({ speed: this.speed, grounded: true, sit: this.sit, table: this.table, crouch: this.crouch, aimPitch: this.aimPitch, headYaw: this.headYaw, emote: this.emote, emoteT: this.emoteT, action: this.action, actionT: this.actionT, held: this.item || this.prop ? 'item' : null }, dt);
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
    // lo que tiene en la mano
    const hand = this.item && !this.dead && !(this.lost & ((1 << PART.UARM_R) | (1 << PART.FARM_R))) ? this.item : 0;
    if (hand || this.equip) {
      if (!this.equip) this.equip = new EquipmentView(this.scene);
      this.equip.update(ch, hand, this.yaw, this.action === 'drink' ? 'drink' : this.action, this.actionT, !this.visible || this.down > 0);
    }
    if (this.prop) {
      ch.root.updateWorldMatrix(true, true);
      ch.handR.getWorldPosition(this.prop.position);
      this.prop.rotation.set(this.action === 'swing' ? -0.8 + Math.sin(this.actionT * 5) * 0.6 : 0.3, this.yaw, 0, 'YXZ');
      this.prop.visible = this.visible && !this.down;
    }
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
    this.equip?.dispose();
    this.prop?.removeFromParent();
    this.rag?.destroy();
    this.char?.root.removeFromParent();
    this.char?.dispose?.();
    this.bubble?.remove();
  }
}
