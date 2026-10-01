// Personajes no jugadores del Búnker (portero, DJ, bartender, bailarinas, la gente de la pista).
// Usan el mismo cuerpo que los jugadores (HumanCharacter con el animador procedural): caminan, bailan con los gestos,
// hablan con un globo arriba de la cabeza y miran a quien se les acerca. Lo que hace cada uno lo decide su "rol" (una
// función por cuadro); acá solo el cuerpo, el globo y el mirar.
import * as THREE from 'three';
import { G, clamp } from '../core/G.js';
import { HumanCharacter, humansReady, loadHuman, loadMask, masksReady, MODELS } from '../char/human.js';
import { voiceFor, voiceRate, vocalName } from '../audio/vocals.js';
import { Ragdoll, PART } from './ragdoll.js';
import { GR, RAPIER, groups } from '../core/physics.js';
import { goreFor, branchOf } from './gore.js';
import { EquipmentView } from './equipment.js';
import { stepSound } from '../audio/surface.js';
import { startNpcDefense, stepNpcDefense } from './npc-defense.js';

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const V3 = new THREE.Vector3();
const V4 = new THREE.Vector3();
const V5 = new THREE.Vector3();
const V6 = new THREE.Vector3();
const M4 = new THREE.Matrix4();
// Movimiento con choques: los NPC que caminan (guardias, el que corre prendido fuego, el que pasea) no atraviesan
// paredes, autos ni jugadores. Un solo controlador de Rapier para todos (se usa de a uno).
// Grupos de la consulta: el miembro VEHICLE hace que la cápsula del jugador (que solo mira WORLD|VEHICLE) cuente.
const MOVE_GROUPS = groups(GR.VEHICLE | GR.PAWN, GR.WORLD | GR.ME | GR.PAWN | GR.VEHICLE);
let KCC = null;
const notNpc = (c) => G.phys.info(c)?.kind !== 'npc';
const Q1 = new THREE.Quaternion();
const E1 = new THREE.Euler();
const HAS_DOM = typeof document !== 'undefined';
const NPC_VIEW = {
  camera: null,
  position: new THREE.Vector3(),
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  forward: new THREE.Vector3(),
  tanX: 1,
  tanY: 1,
};
const NPC_LOAD_DISTANCE = 58;
const NPC_DRAW_DISTANCE = 52;

export function prepareNpcCulling(camera) {
  if (!camera) { NPC_VIEW.camera = null; return; }
  camera.updateWorldMatrix(true, false);
  NPC_VIEW.camera = camera;
  NPC_VIEW.position.setFromMatrixPosition(camera.matrixWorld);
  NPC_VIEW.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  NPC_VIEW.up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  NPC_VIEW.forward.setFromMatrixColumn(camera.matrixWorld, 2).negate().normalize();
  NPC_VIEW.tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  NPC_VIEW.tanX = NPC_VIEW.tanY * camera.aspect;
}

function npcInView(pos, heightK) {
  if (!NPC_VIEW.camera) return true;
  const x = pos.x - NPC_VIEW.position.x;
  const y = pos.y + 0.9 * heightK - NPC_VIEW.position.y;
  const z = pos.z - NPC_VIEW.position.z;
  const depth = x * NPC_VIEW.forward.x + y * NPC_VIEW.forward.y + z * NPC_VIEW.forward.z;
  const side = x * NPC_VIEW.right.x + y * NPC_VIEW.right.y + z * NPC_VIEW.right.z;
  const vertical = x * NPC_VIEW.up.x + y * NPC_VIEW.up.y + z * NPC_VIEW.up.z;
  const radius = 1.35 * heightK;
  return depth + radius > 0 && Math.abs(side) <= depth * NPC_VIEW.tanX + radius &&
    Math.abs(vertical) <= depth * NPC_VIEW.tanY + radius;
}

const CUT = new Set(['sword', 'machete', 'knife', 'axe', 'broken_bottle', 'hatchet', 'katana', 'saber', 'estoc']);
const PART_K = [0.9, 1, 1.7, 0.6, 0.5, 0.6, 0.5, 0.7, 0.55, 0.7, 0.55];
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
    if (!(this.down > 0)) this.knockout(vel.clone(), 1e9);
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
    this.hp = 100; this.lost = 0; this.dead = false; this.deadT = 0; this.down = 0; this.burnT = 0; this.hpShowT = 0; this.defense = null;
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

  // Un golpe (mano, pie, cabeza, arma en la mano, algo revoleado, un tiro, otro NPC).
  // speed m/s del impacto, dir hacia donde empuja, mass de lo que pega (1 mano, 6 pierna, el arma...),
  // kind: 'blunt' | 'cut' | 'bullet'; weapon: tipo de objeto (si era un arma: las de filo cortan)
  punch(speed, point, dir, mass = 1, byPlayer = true, kind = 'blunt', weapon = null) {
    if (!this.char || this.dead) return;
    if (weapon && CUT.has(weapon)) kind = 'cut';
    const now = performance.now();
    if (now - (this._hitCd || 0) < 90) return; // el mismo golpe no cuenta dos veces
    this._hitCd = now;
    const s = Math.min(2.2, (speed / 7) * Math.sqrt(Math.max(0.5, mass)));
    // la parte más cercana al punto
    let part = PART.TORSO, best = 1e9;
    if (this.rag?.alive) for (let i = 0; i < 11; i++) { if (this.lost & (1 << i)) continue; const t = this.rag.bodies[i].translation(); const d = V1.set(t.x, t.y, t.z).distanceToSquared(point); if (d < best) { best = d; part = i; } }
    else if (point.y > this.pos.y + 1.45 * this.heightK) part = PART.HEAD;
    // la cabeza (o el torso) acusa el golpe: resortes en el marco del cuerpo, y un paso para atrás
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    const fwd = dir.x * sn + dir.z * c, side = dir.x * c - dir.z * sn;
    const k = part === PART.HEAD ? this.snap.headV : this.snap.torsoV;
    k.x += -fwd * 11 * s; k.y += side * 9 * s;
    this.snap.torsoV.x += -fwd * 4 * s;
    if (!this.sit && !this.down) { this.pos.x += dir.x * 0.12 * s; this.pos.z += dir.z * 0.12 * s; }
    try { this.char.wound(part, this.char.worldToPart(part, point, V2), kind === 'blunt' ? 'blunt' : 'cut', Math.min(1.6, 0.3 + s * 0.7), null, (Math.random() * 1e6) | 0); } catch { /* */ }
    // el daño: como a los jugadores (cabeza x1.7, brazos y piernas menos), según qué pega
    const base = kind === 'bullet' ? 42 : kind === 'cut' ? 30 : mass >= 3 ? 22 : 14;
    const dmg = Math.round(s * base * PART_K[part]);
    this.hp -= dmg;
    this.hpShowT = 4;
    this._floatDmg(dmg, point, part === PART.HEAD);
    G.fx?.blood(point.clone(), V1.copy(dir).negate().add(V2.set(0, 0.6, 0)).normalize(), Math.min(1.4, 0.3 + s * 0.6));
    this.onHurt?.(this, s, point, byPlayer);
    // Choreographed masked dancers keep their existing role and model untouched.
    if (byPlayer && !this.onHurt && !MODELS[this.look?.model]?.mask) startNpcDefense(this, G.me);
    if (s > 0.2) this.vocal(s > 1 || kind !== 'blunt' ? 'scream' : 'hurt');
    const vel = V1.copy(dir).multiplyScalar(2 + s * 2.5).setY(1 + s * 0.6);
    // gore: filo o bala cortan; un mazazo brutal a la cabeza la revienta
    if (kind !== 'blunt' || (s > 1.6 && part === PART.HEAD && mass >= 3)) {
      const g = goreFor(part, s * 1.35, kind === 'blunt' ? 'blunt' : kind, byPlayer ? 'remote' : 'npc');
      if (g.headPop) { this._popHead(vel.clone()); return; }
      if (g.sever >= 0) this.loseLimb(g.sever, vel.clone());
    }
    if (this.hp <= 0) { this.die(vel.clone()); return; }
    // tumba: un golpe muy fuerte, una patada voladora, o si ya está hecho pelota
    if (!this.down && (s > 1.15 || (this.hp < 30 && s > 0.6))) this.knockout(vel.clone(), 2.5 + s);
  }
  // números de daño que suben (y la barra de vida arriba de la cabeza unos segundos)
  _floatDmg(n, point, crit) {
    if (!HAS_DOM || !G.camera) return;
    const el = document.createElement('div');
    el.className = 'dmgnum' + (crit ? ' crit' : '');
    el.textContent = '-' + n;
    document.getElementById('overlay')?.appendChild(el);
    const p = point.clone(), t0 = performance.now();
    const tick = () => {
      const t = (performance.now() - t0) / 900;
      if (t >= 1 || !G.camera) { el.remove(); return; }
      V2.copy(p).setY(p.y + 0.3 + t * 0.7).project(G.camera);
      if (V2.z > 1) el.style.display = 'none';
      else { el.style.display = ''; el.style.transform = `translate(${(V2.x * 0.5 + 0.5) * innerWidth}px, ${(-V2.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%) scale(${crit ? 1.4 : 1})`; el.style.opacity = String(1 - t * t); }
      requestAnimationFrame(tick);
    };
    tick();
  }
  // prendido fuego: corre en pánico gritando, pierde vida y se carboniza
  ignite(secs = 5, by = 0) {
    if (this.dead || !this.char) return;
    this.burnT = Math.max(this.burnT || 0, secs);
    this.burnBy = by;
    this.vocal('scream');
    // el que estaba sentado salta de la silla y sale corriendo
    if (this.sit) { this.sit = false; this.table = false; this.action = null; }
    if (!this.down) this.say(['¡ME QUEMO!', '¡AGUA! ¡AGUAAA!', '¡AAAAAAH!'][Math.floor(Math.random() * 3)], 2);
  }
  _burnStep(dt) {
    if (!(this.burnT > 0)) return;
    this.burnT -= dt;
    if (!this.dead) { this.hp -= 11 * dt; this.hpShowT = 2; }
    this.char.burnt = Math.min(1, (this.char.burnt || 0) + dt * 0.12);
    this.char.material?.color?.setScalar(1 - this.char.burnt * 0.75);
    this._fireAcc = (this._fireAcc || 0) + dt;
    if (this._fireAcc > 0.07 && this.visible) {
      this._fireAcc = 0;
      const hip = this.char.bones?.hip?.getWorldPosition(V2) || V2.copy(this.pos).setY(this.pos.y + 1);
      G.fx?.fire?.(V1.set(hip.x + (Math.random() - 0.5) * 0.4, hip.y - 0.3 + Math.random() * 1.1, hip.z + (Math.random() - 0.5) * 0.4));
    }
    if (!this.dead && this.hp <= 0) { this.die(V1.set(0, 0.5, 0)); return; }
    // pánico: corre para cualquier lado (si está parado)
    if (!this.dead && !this.down && !this.sit) {
      this.data.panic = (this.data.panic ?? 0) - dt;
      if (this.data.panic <= 0) { this.data.panic = 0.8 + Math.random(); this.data.panicYaw = Math.random() * Math.PI * 2; }
      this.baseYaw = this.data.panicYaw; this.yaw = this.baseYaw;
      this.pos.x += Math.sin(this.baseYaw) * 3.2 * dt; this.pos.z += Math.cos(this.baseYaw) * 3.2 * dt;
      this.speed = 3.2; this.emote = null;
    }
  }

  knockout(vel, secs = 5) {
    this.physical = true;
    this._ensureRag();
    if (!this.rag) return;
    this.down = secs;
    this.sit = false;
    this.action = null; this.emote = null;
    this.rag.setKinematic(false, vel);
    this.char.mode = 'rag';
  }

  _getUp() {
    const pt = this.rag.pelvis().translation();
    this.pos.set(pt.x, this.home.pos.y, pt.z);
    this.down = 0; // sin esto quedaba en -0.00x: "sigue tirado" para todo (sin cápsula, sin ragdoll al morir)
    this._pp?.copy(this.pos);
    this.rag.setKinematic(true);
    this.char.mode = 'anim';
    this.hp = Math.max(this.hp, 25); // se levanta golpeado (no con la vida llena)
    this.action = 'getup'; this.actionT = 0; this.actionEnd = 0.9;
    this.data.upT = G.time;
  }

  _build() {
    if (this.char) return true;
    const key = this.look.model;
    const mask = MODELS[key]?.mask;
    if (!humansReady(key)) { loadHuman(key); return false; } // se baja una vez (lo comparten todos los que lo usan)
    if (mask && !masksReady(mask)) { loadMask(mask); return false; }
    try {
      this.char = new HumanCharacter(this.look);
      this.char.root.name = 'npc:' + this.name;
      if (this.heightK !== 1) this.char.root.scale.setScalar(this.heightK);
      // los NPC no entran en las sombras de antorchas y velas (capa 1): son muchos y cada sombra de luz puntual los
      // dibuja seis veces; la del sol/luna la deciden los que los manejan (villagers.js: solo cerca)
      this.char.skinned?.layers.disable(1);
      this.scene.add(this.char.root);
    } catch (e) { console.warn('npc', this.name, e); this.char = null; }
    return !!this.char;
  }

  say(text, secs = 3.2) {
    if (!HAS_DOM) return;
    if (!this.bubble) {
      const el = document.createElement('div');
      el.className = 'tag3d npc';
      el.innerHTML = '<div class="bubble"></div><span class="name"></span><div class="hp" style="display:none"><i></i></div>';
      el.querySelector('.name').textContent = this.name;
      document.getElementById('overlay')?.appendChild(el);
      this.bubble = el;
    }
    const b = this.bubble.querySelector('.bubble');
    b.textContent = text;
    b.style.display = text ? '' : 'none';
    if (text) this.bubbleT = secs;
    this.talk = Math.min(secs, 0.25 + text.length * 0.06);
  }

  syncRagdollPosition() {
    if ((!this.dead && !(this.down > 0)) || !this.rag?.alive) return;
    const center = this.rag.bodies[PART.PELVIS]?.translation();
    if (center && [center.x, center.y, center.z].every(Number.isFinite)) this.pos.set(center.x, center.y, center.z);
  }

  update(dt, camera, show = true) {
    this.syncRagdollPosition();
    if ((this.down > 0 || this.dead) && this.rag?.alive && camera?.position.distanceToSquared(this.pos) < NPC_DRAW_DISTANCE * NPC_DRAW_DISTANCE) show = true;
    if (!show) {
      this.visible = false;
      if (this.rag && !this.down && !this.dead) { this.rag.destroy(); this.rag = null; }
      this.physical = this.down > 0 || this.dead;
      this._pawnStep(0, false);
      if (this.char) this.char.root.visible = false;
      if (this.bubble) this.bubble.style.display = 'none';
      if (this.equip?.group) this.equip.group.visible = false;
      if (this.prop) this.prop.visible = false;
      this._lampStep(false);
      return;
    }
    const distanceSq = camera ? camera.position.distanceToSquared(this.pos) : Infinity;
    if (!this.char && distanceSq > NPC_LOAD_DISTANCE * NPC_LOAD_DISTANCE) return;
    if (!this._build()) return;
    // cerca: cuerpo físico (se le puede pegar, lo tumban, lo revolean) y cápsula para chocarlo; lejos, nada
    const cd = Math.sqrt(distanceSq);
    const near = cd < 30;
    if (!near && this.rag && !this.down && !this.dead) { this.rag.destroy(); this.rag = null; }
    this.physical = near || this.down > 0 || this.dead;
    const renderVisible = distanceSq < NPC_DRAW_DISTANCE * NPC_DRAW_DISTANCE && npcInView(this.pos, this.heightK);
    this.visible = renderVisible;
    const simulate = renderVisible || near;
    const updatePose = renderVisible || near || this.down > 0 || this.dead;
    this._pawnStep(dt, near && !this.dead && !this.down && !this.sit);
    if (simulate) this._burnStep(dt);
    this.hpShowT = Math.max(0, (this.hpShowT || 0) - dt);
    this.char.root.visible = renderVisible;
    if (this.equip?.group) this.equip.group.visible = renderVisible;
    if (this.dead) {
      // muerto: tirado; al rato se va y vuelve entero
      this.deadT += dt;
      if (this.equip) this.equip.dispose();
      if (this.prop) this.prop.visible = false;
      this._lampStep(false);
      if (updatePose && this.rag?.alive) this.char.applyWorldTransforms(this.rag.read());
      if (updatePose) this.char.update(dt);
      if (this.deadT > this.respawnSecs) this.respawn();
      return;
    }
    // prendido fuego no hace caso a su rol: corre en pánico (ver _burnStep). Tirado, tampoco: antes el rol seguía
    // andando con el cuerpo en el piso y la posición "lógica" perseguía y pegaba sola (el guardia invisible)
    const moveX = this.pos.x, moveZ = this.pos.z;
    if (simulate && !(this.burnT > 0) && !(this.down > 0) && !stepNpcDefense(this, dt)) this.role?.(this, dt);
    if (simulate) this._resolveMove();
    if (simulate && !this.sit && !this.down && !this.dead && !(this.burnT > 0) && dt > 0) this.speed = Math.min(5, Math.hypot(this.pos.x - moveX, this.pos.z - moveZ) / dt);
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
    // pasos (según el piso), solo si está cerca
    if (this.speed > 0.3 && !this.sit && !this.down) {
      this._stepD = (this._stepD || 0) + this.speed * dt;
      if (this._stepD > (this.speed > 2.5 ? 1.2 : 0.85)) {
        this._stepD = 0;
        if (camera && camera.position.distanceToSquared(this.pos) < 400) {
          const [s, r, v] = stepSound(this.pos.x, this.pos.y, this.pos.z);
          G.sfx?.trigger(s, this.pos, 0.45 * v, { rate: r * (0.94 + Math.random() * 0.12), full: 2, max: 20 });
        }
      }
    }
    const ch = this.char;
    ch.root.position.copy(this.pos);
    ch.root.rotation.set(0, this.yaw, 0);
    ch.talk = this.talk > 0 ? 0.5 + 0.5 * Math.sin(G.time * 18) : 0;
    if (this.down > 0) {
      // tirado: el cuerpo es el ragdoll
      this.down -= dt;
      if (updatePose) ch.applyWorldTransforms(this.rag.read());
      if (this.down <= 0) {
        this.down = 0;
        // sin una pierna no se levanta: se queda y se desangra
        if (this.lost & ((1 << PART.THIGH_L) | (1 << PART.SHIN_L) | (1 << PART.THIGH_R) | (1 << PART.SHIN_R))) this.die();
        else this._getUp();
      }
    } else {
      if (updatePose) ch.animate({ speed: this.speed, grounded: true, sit: this.sit, table: this.table, crouch: this.crouch, aimPitch: this.aimPitch, headYaw: this.headYaw, emote: this.emote, emoteT: this.emoteT, action: this.action, actionT: this.actionT, held: this.item || (this.prop && !this.propHang) ? 'item' : null }, dt);
      if (this.propHang) ch.grip.r = 1; // el farol cuelga del puño cerrado, con el brazo suelto
      // resortes de los golpes (subamortiguados: la cabeza se va y vuelve)
      const S = this.snap, w = 22, z = 0.35;
      for (const [a, v] of [[S.head, S.headV], [S.torso, S.torsoV]]) {
        v.x += (-w * w * a.x - 2 * z * w * v.x) * dt; v.y += (-w * w * a.y - 2 * z * w * v.y) * dt;
        a.x += v.x * dt; a.y += v.y * dt;
      }
      if (updatePose && Math.abs(S.head.x) + Math.abs(S.head.y) + Math.abs(S.torso.x) > 1e-4) {
        ch.joints[2].quaternion.multiply(Q1.setFromEuler(E1.set(S.head.x, 0, S.head.y)));
        ch.joints[1].quaternion.multiply(Q1.setFromEuler(E1.set(S.torso.x, 0, S.torso.y * 0.5)));
      }
      if (this.physical) {
        this._ensureRag();
        if (this.rag?.alive) { ch.root.updateMatrixWorld(true); this.rag.follow(ch.readWorldTransforms(), dt); }
      }
    }
    if (!updatePose) {
      if (this.equip?.group) this.equip.group.visible = false;
      if (this.prop) this.prop.visible = false;
      if (this.bubble) this.bubble.style.display = 'none';
      this._lampStep(false);
      return;
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
      if (this.propHang) {
        // farol colgando del puño por la manija, derecho, con vaivén al caminar
        const sw = Math.min(1, this.speed || 0);
        this.prop.position.y -= this.propHang * 0.94;
        this.prop.rotation.set(Math.sin(G.time * 5.3) * 0.07 * sw, this.yaw, Math.sin(G.time * 4.1 + 1) * 0.08 * sw, 'YXZ');
      } else if (this.prop.userData.shovel) this._placeShovel(ch);
      else this.prop.rotation.set(Math.PI - 0.35, this.yaw, 0, 'YXZ');
      this.prop.visible = renderVisible && !this.down;
    }
    this._lampStep(!!this.prop?.visible);
    // globo (lo que dice) y la barra de vida cuando lo lastimaron
    if (this.hpShowT > 0 && !this.bubble) this.say('', 0);
    if (this.bubble) {
      this.bubbleT -= dt;
      const el = this.bubble;
      const bar = el.querySelector('.hp');
      bar.style.display = this.hpShowT > 0 ? '' : 'none';
      if (this.hpShowT > 0) bar.firstChild.style.width = Math.max(0, Math.min(100, this.hp)) + '%';
      el.querySelector('.bubble').style.display = this.bubbleT > 0 ? '' : 'none';
      if ((this.bubbleT <= 0 && this.hpShowT <= 0) || !camera) { el.style.display = 'none'; return; }
      V1.copy(this.pos); V1.y += 2.05 * this.heightK * ((ch.meta?.height || 1.8) / 1.8);
      const dist = camera.position.distanceTo(V1);
      V1.project(camera);
      if (V1.z > 1 || dist > 22) { el.style.display = 'none'; return; }
      el.style.display = '';
      const x = (V1.x * 0.5 + 0.5) * innerWidth, y = (-V1.y * 0.5 + 0.5) * innerHeight;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${clamp(1.12 - dist / 30, 0.6, 1)})`;
    }
  }

  // Lo que movió el rol (o el pánico del fuego) se pasa por el controlador: se desliza por paredes, autos y
  // jugadores en vez de atravesarlos. Los que tienen la posición armada a mano (bailarinas, sentados) no.
  _resolveMove() {
    if (!this.pawn || !this.pawn.isEnabled() || this.sit || this.noCollide || this.down > 0 || this.dead) return;
    const c = this.pawn.translation();
    const dx = this.pos.x - c.x, dz = this.pos.z - c.z, d2 = dx * dx + dz * dz;
    if (d2 < 1e-10 || d2 > 9) return; // quieto, o lo pusieron en otro lado de una (reaparecer, levantarse)
    if (!KCC) { KCC = G.phys.world.createCharacterController(0.02); KCC.setSlideEnabled?.(true); }
    KCC.computeColliderMovement(this.pawn, { x: dx, y: 0, z: dz }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, MOVE_GROUPS, notNpc);
    const m = KCC.computedMovement();
    this.pos.x = c.x + m.x; this.pos.z = c.z + m.z;
    this.blocked = Math.hypot(m.x - dx, m.z - dz) > 0.002;
    if (this.blocked && this.burnT > 0) this.data.panic = 0; // chocó corriendo prendido fuego: otra dirección
    const hk = this.heightK * ((this.char?.meta?.height || 1.8) / 1.8);
    this.pawnBody.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + 0.91 * hk, z: this.pos.z });
  }

  // La pala (el modelo viene parado: la punta de la hoja en el origen, el mango arriba en +Y, la hoja plana mirando a Z).
  // Cavando: el mango pasa por las dos manos, la izquierda en la empuñadura y la hoja hacia adelante. Si no, clavada
  // en la tierra a su derecha.
  _placeShovel(ch) {
    const P = this.prop, fwd = V3.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const up = V4;
    if (this.action === 'dig' && ch.handL) {
      // la inclinación la marca la fase (igual que la pose 'dig' de character.js): clavada casi vertical con la hoja
      // adelante, palanca, levantada casi horizontal girando al costado para tirar la tierra, y vuelta
      const ph = this.actionT % 2.2, sm = (x) => x * x * (3 - 2 * x), s = (a, b) => Math.min(1, Math.max(0, (ph - a) / (b - a)));
      const lever = sm(s(0.6, 1.0)) * (1 - sm(s(1.6, 2.1))), toss = sm(s(1.0, 1.3)) * (1 - sm(s(1.45, 1.9)));
      const tilt = 0.38 + lever * 0.55 + toss * 0.45, yaw = this.yaw + toss * 0.75;
      up.set(-Math.sin(yaw) * Math.sin(tilt), Math.cos(tilt), -Math.cos(yaw) * Math.sin(tilt));
      fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
      P.position.copy(ch.handL.getWorldPosition(V6)).addScaledVector(up, -(P.userData.grip || 0.95));
    } else {
      up.set(-fwd.x * 0.15, 1, -fwd.z * 0.15).normalize();
      const right = V5.set(-fwd.z, 0, fwd.x).multiplyScalar(-1);
      P.position.copy(this.pos).addScaledVector(right, 0.5).addScaledVector(fwd, 0.25);
      P.position.y = this.pos.y - 0.14;
    }
    // base: Y = mango, Z = la cara de la hoja hacia adelante (perpendicular al mango)
    const z = V6.copy(fwd).addScaledVector(up, -fwd.dot(up)).normalize();
    const x = V5.crossVectors(up, z).normalize();
    M4.makeBasis(x, up, z);
    P.quaternion.setFromRotationMatrix(M4);
  }

  // la luz y la llama del farol (si tiene): siguen al farol; apagadas si no se ve o está tirado
  _lampStep(on) {
    const W = this.lampWorld;
    if (!this.lamp || !W) return;
    this.lamp.visible = on;
    if (on) this.lamp.position.copy(this.prop.position).y += this.propHang * 0.42;
    if (this.lampFlame >= 0) {
      if (on) W.flames.move(this.lampFlame, this.lamp.position.x, this.lamp.position.y - 0.06, this.lamp.position.z);
      W.flames.set(this.lampFlame, on ? 1 : 0);
    }
  }

  // cápsula de movimiento (como la de otro jugador): mi controlador choca contra ella; lleva su velocidad
  _pawnStep(dt, on) {
    if (!G.phys) return;
    const hk = this.heightK * ((this.char?.meta?.height || 1.8) / 1.8);
    if (!this.pawn && on) {
      this.pawnBody = G.phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y + 0.91 * hk, this.pos.z));
      this.pawn = G.phys.world.createCollider(RAPIER.ColliderDesc.capsule(0.6 * hk, 0.26).setCollisionGroups(groups(GR.PAWN, GR.ME | GR.VEHICLE)), this.pawnBody);
      G.phys.tag(this.pawn, { kind: 'npc', ref: this });
      this.vel = new THREE.Vector3();
      this._pp = this.pos.clone();
    }
    if (!this.pawn) return;
    if (this.pawn.isEnabled() !== on) this.pawn.setEnabled(on);
    this.standing = on;
    if (dt > 0) { this.vel.set((this.pos.x - this._pp.x) / dt, 0, (this.pos.z - this._pp.z) / dt); this._pp.copy(this.pos); }
    if (on) {
      // recién vuelve a estar parado (se levantó, reapareció): la cápsula aparece donde está, sin arrastrarse
      if (!this._pawnOn) this.pawnBody.setTranslation({ x: this.pos.x, y: this.pos.y + 0.91 * hk, z: this.pos.z }, true);
      this.pawnBody.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + 0.91 * hk, z: this.pos.z });
    }
    this._pawnOn = on;
  }

  dispose() {
    this.equip?.dispose();
    if (this.pawn) { try { G.phys.untag(this.pawn); G.phys.world.removeRigidBody(this.pawnBody); } catch { /* */ } this.pawn = null; }
    this.prop?.removeFromParent();
    this.rag?.destroy();
    this.char?.root.removeFromParent();
    this.char?.dispose?.();
    this.bubble?.remove();
  }
}
