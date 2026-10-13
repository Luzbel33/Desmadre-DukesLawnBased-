// Pool en el bar (bola 8). La física y las reglas están en shared/pool.js; el servidor simula cada tiro y acá se
// repite la misma simulación para verlo (las bolas ruedan, chocan, entran) y al final se corrige con el servidor.
//  - X en la mesa: sumarse (de a uno se practica; con dos, partida). Si te toca, X apunta: la cámara va detrás de
//    la blanca, el mouse gira el taco (Shift: fino; arriba/abajo: la altura de la cámara), mantener el click carga
//    la fuerza y al soltar tira. Click derecho cancela la carga, Esc deja de apuntar.
//  - La línea de puntería muestra dónde va a pegar (la bola fantasma) y para dónde sale la bola que toca.
//  - Los demás ven el taco del que apunta (evento 'poolaim') y al cuerpo agachado sobre la mesa (gesto 'pool').
import * as THREE from 'three';
import { G, clamp } from '../core/G.js';
import { POOL_TABLE } from '../shared/mapdata.js';
import { R, TABLE, POCKETS, STEP, step, strike, moving, GROUP_NAME } from '../shared/pool.js';

const HAS_DOM = typeof document !== 'undefined';
const COLORS = ['#f4f1e6', '#f2c21b', '#1f4fbf', '#d12a2a', '#5b2a8c', '#f07a1a', '#1d7a3a', '#7a1f1f', '#111111'];
const colorOf = (n) => COLORS[n > 8 ? n - 8 : n];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), Q1 = new THREE.Quaternion();
const clone = (balls) => balls.map((b) => ({ ...b }));

function ballTexture(n) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  const c = colorOf(n);
  g.fillStyle = n > 8 ? '#f4f1e6' : c; g.fillRect(0, 0, 256, 128);
  if (n > 8) { g.fillStyle = c; g.fillRect(0, 34, 256, 60); } // la raya
  if (n > 0) for (const u of [64, 192]) { // el número, de los dos lados
    g.fillStyle = '#f4f1e6'; g.beginPath(); g.ellipse(u, 64, 22, 24, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.font = 'bold 28px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), u, 66);
  } else { g.fillStyle = '#c02020'; g.beginPath(); g.arc(64, 64, 5, 0, Math.PI * 2); g.fill(); } // el puntito de la blanca
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class PoolGame {
  constructor({ scene, getLocal, getNet, setMode, getMode, teleport, bigMessage }) {
    Object.assign(this, { scene, getLocal, getNet, setMode, getMode, teleport, bigMessage });
    this.players = [0, 0]; this.g = { cur: 0, grp: [null, null], win: null, solo: true, msg: '' }; this.n = 0;
    this.balls = null; this.replay = null;
    this.aim = null; // { ang, pull, charging, camH }
    this.remoteAim = null; // { id, ang, pull, t }
  }

  // ---------------------------------------------------------------- armado
  build() {
    if (!HAS_DOM) return this;
    const T = this.group = new THREE.Group();
    T.position.fromArray(POOL_TABLE.c); T.rotation.y = POOL_TABLE.yaw; T.name = 'pool';
    this.scene.add(T);
    const geo = new THREE.SphereGeometry(R, 24, 16);
    this.meshes = Array.from({ length: 16 }, (_, n) => {
      const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: ballTexture(n), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 }));
      m.castShadow = true; m.visible = false;
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      T.add(m);
      return m;
    });
    // el taco: punta de cuero, caña de arce y la culata oscura (a lo largo de +z: la punta adelante)
    const cue = this.cue = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.011, 0.95, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8d2a4, roughness: 0.45 }));
    shaft.position.z = -0.475;
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.015, 0.5, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a1a10, roughness: 0.35, metalness: 0.1 }));
    butt.position.z = -1.2;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0065, 0.012, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a4a8a, roughness: 0.9 }));
    tip.position.z = 0.002;
    cue.add(shaft, butt, tip); cue.visible = false;
    for (const m of [shaft, butt, tip]) m.castShadow = true;
    T.add(cue);
    // la línea de puntería, la bola fantasma y para dónde sale la otra
    const lineMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.03, gapSize: 0.02, transparent: true, opacity: 0.75 });
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), lineMat);
    this.line2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8 }));
    this.ghost = new THREE.Mesh(new THREE.RingGeometry(R * 0.86, R, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    for (const o of [this.line, this.line2, this.ghost]) { o.visible = false; o.renderOrder = 3; T.add(o); }
    // las bocas de las troneras (negras, con el borde de cuero), sobre el paño
    const hole = new THREE.MeshBasicMaterial({ color: 0x050505 }), lip = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6 });
    for (const [px, pz] of POCKETS) {
      const h = new THREE.Mesh(new THREE.CircleGeometry(0.058, 20).rotateX(-Math.PI / 2), hole); h.position.set(px, 0.0015, pz);
      const r = new THREE.Mesh(new THREE.RingGeometry(0.058, 0.068, 20).rotateX(-Math.PI / 2), lip); r.position.set(px, 0.0016, pz);
      T.add(h, r);
    }
    // luz de mesa de pool: dos tubos colgando (falsos: emisivos) y una luz real chica
    const shade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 1.5), new THREE.MeshStandardMaterial({ color: 0x1d4a2a, roughness: 0.5, metalness: 0.3 }));
    shade.position.y = 1.05; T.add(shade);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 1.4), new THREE.MeshBasicMaterial({ color: 0xfff2c8 }));
    bulb.position.y = 0.985; T.add(bulb);
    for (const z of [-0.6, 0.6]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 3, 4), new THREE.MeshBasicMaterial({ color: 0x111111 })); w.position.set(0, 2.6, z); T.add(w); }
    const l = new THREE.PointLight(0xfff0c8, 5, 4.5, 1.6); l.position.set(0, 0.9, 0); T.add(l);
    return this;
  }

  // ---------------------------------------------------------------- red
  sync(m) {
    if (!m || !Array.isArray(m.balls) || m.balls.length !== 16) return;
    const prevWin = this.g.win, wasMyTurn = this.myTurn();
    this.players = m.players || [0, 0]; this.g = m.g || this.g; this.n = m.n | 0;
    if (m.shot && Array.isArray(m.shot.before)) {
      // a repetir el tiro: misma simulación que el servidor desde la misma posición
      const balls = clone(m.shot.before);
      strike(balls, m.shot.ang, m.shot.pow);
      this.replay = { balls, final: m.balls, acc: 0, t: 0, ev: [], seen: 0, by: m.shot.by, pow: m.shot.pow, ang: m.shot.ang, strikeT: 0.18 };
      if (m.shot.by !== G.myId) this.remoteAim = { id: m.shot.by, ang: m.shot.ang, pull: 0, t: 0.25, shoot: true };
      G.sfx?.trigger('hit', this._world(balls[0]), 0.25 + m.shot.pow * 0.4, { full: 2, max: 14, rate: 1.9 });
    } else if (!this.replay) this.balls = clone(m.balls);
    else this.replay.final = m.balls;
    if (!this.balls) this.balls = clone(m.balls);
    if (this.mine() < 0 && this.aim) this.stopAim();
    if (this.mine() >= 0 && this.g.win != null && prevWin == null && !this.replay) this._result();
    this._pendingResult = this.mine() >= 0 && this.g.win != null && prevWin == null;
    if (!wasMyTurn && this.myTurn() && !this.replay && this.mine() >= 0 && !this.g.solo) G.sfx?.trigger('ui-ok', null, 0.4);
    this._hud();
  }
  aimFrom(m) { // el taco de otro
    if (m.id === G.myId || this.replay) return;
    this.remoteAim = m.on ? { id: m.id, ang: +m.ang || 0, pull: +m.pull || 0, t: 1.2 } : null;
  }
  mine() { return this.players.indexOf(G.myId); }
  myTurn() { const i = this.mine(); return i >= 0 && this.g.win == null && (this.g.solo || this.g.cur === i); }

  // X en la mesa: sumarse; si ya estás y te toca, apuntar
  use() {
    const i = this.mine();
    if (i < 0) {
      if (this.players.every(Boolean)) { G.hud?.notify('🎱 La mesa está ocupada: esperá que terminen.', 2500); return; }
      this.getNet()?.send({ t: 'pool', a: 'join' }); G.sfx?.trigger('ui-select', null, 0.5); return;
    }
    if (this.g.win != null) { this.getNet()?.send({ t: 'pool', a: 'rack' }); return; }
    if (this.replay) return;
    if (!this.myTurn()) { G.hud?.notify(`🎱 Le toca a ${esc(G.players.get(this.players[this.g.cur])?.name || 'el otro')}.`, 2000); return; }
    this.startAim();
  }
  leave() { this.stopAim(); this.getNet()?.send({ t: 'pool', a: 'leave' }); }

  // ---------------------------------------------------------------- apuntar y tirar
  startAim() {
    if (!this.balls?.[0]?.on) return;
    const c = this.balls[0];
    // de entrada apunta a la bola más cercana que se puede tocar
    let best = null, bd = Infinity;
    for (const b of this.balls) { if (!b.on || !b.n) continue; const d = (b.x - c.x) ** 2 + (b.z - c.z) ** 2; if (d < bd) { bd = d; best = b; } }
    this.aim = { ang: best ? Math.atan2(best.x - c.x, best.z - c.z) : 0, pull: 0, charging: false, camH: 0.3, placedAng: null, sendT: 0 };
    this.setMode('pool');
    this._placeBody(true);
    this._hud();
  }
  stopAim() {
    if (!this.aim) return;
    this.aim = null;
    for (const o of [this.cue, this.line, this.line2, this.ghost]) if (o) o.visible = false;
    this.getNet()?.send({ t: 'pool', a: 'aim', ang: 0, on: 0 });
    const L = this.getLocal(); if (L?.emote === 'pool') L.setEmote(null);
    if (this.getMode?.() === 'pool') this.setMode('game');
    this._hud();
  }
  // mouse (con el puntero capturado): dx gira, dy la altura de la cámara
  input(dx, dy, fine) {
    if (!this.aim) return;
    this.aim.ang -= dx * (fine ? 0.0004 : 0.0028);
    this.aim.camH = clamp(this.aim.camH + dy * 0.002, 0.12, 1.1);
  }
  press(down) {
    if (!this.aim) return;
    if (down) { this.aim.charging = true; this.aim.pull = 0; this.aim.dir = 1; return; }
    if (!this.aim.charging) return;
    const pow = this.aim.pull;
    this.aim.charging = false;
    if (pow < 0.03) { this.aim.pull = 0; return; }
    this.getNet()?.send({ t: 'pool', a: 'shot', ang: this.aim.ang, pow });
    this.lastShot = { ang: this.aim.ang, pow };
    this.stopAim();
  }
  cancelCharge() { if (this.aim) { this.aim.charging = false; this.aim.pull = 0; } }

  // el cuerpo detrás de la blanca, afuera de la mesa, agachado sobre el taco
  _placeBody(force) {
    const L = this.getLocal(), a = this.aim;
    if (!L || !a || !this.balls) return;
    if (!force && a.placedAng !== null && Math.abs(a.ang - a.placedAng) < 0.25) return;
    a.placedAng = a.ang;
    const c = this.balls[0], dx = -Math.sin(a.ang), dz = -Math.cos(a.ang);
    // hasta el borde de la mesa (de madera: ±0.75 x ±1.35) y un poco más
    let t = Infinity;
    if (dx) t = Math.min(t, ((dx > 0 ? 0.75 : -0.75) - c.x) / dx);
    if (dz) t = Math.min(t, ((dz > 0 ? 1.35 : -1.35) - c.z) / dz);
    const p = this.group.localToWorld(V1.set(c.x + dx * (t + 0.32), 0, c.z + dz * (t + 0.32)));
    p.y = 0;
    const yaw = Math.atan2(-dx, -dz) + this.group.rotation.y;
    this.teleport(p.clone(), yaw);
    L.setEmote('pool');
  }

  // ---------------------------------------------------------------- por cuadro
  update(dt) {
    if (!this.meshes) return;
    // te fuiste lejos de la mesa: dejás de jugar
    const L = this.getLocal();
    if (L && this.mine() >= 0 && !this.aim && L.pos.distanceTo(this.group.position) > 9) this.leave();
    // el tiro que se está viendo
    const R0 = this.replay;
    if (R0) {
      if (R0.strikeT > 0) R0.strikeT -= dt;
      else {
        R0.acc += dt;
        let n = 0;
        while (R0.acc >= STEP && n < 600) { step(R0.balls, R0.ev, R0.t); R0.t += STEP; R0.acc -= STEP; n++; }
        this._sounds(R0);
        this.balls = R0.balls;
        if (!moving(R0.balls)) {
          this.balls = clone(R0.final);
          this.replay = null;
          if (this.g.msg && this.mine() >= 0) G.hud?.notify(`🎱 ${esc(this.g.msg)}`, 2400);
          if (this._pendingResult) { this._pendingResult = false; this._result(); }
          this._hud();
        }
      }
    }
    // las bolas: posición y la rotación al rodar
    if (this.balls) for (const b of this.balls) {
      const m = this.meshes[b.n];
      if (!b.on) { if (m.visible && !(this.replay && m.position.y > -0.08)) m.visible = false; else if (m.visible) m.position.y -= dt * 0.6; continue; }
      const nx = b.x, nz = b.z, dx = nx - m.position.x, dz = nz - m.position.z, d = Math.sqrt(dx * dx + dz * dz);
      if (m.visible && d > 1e-6 && d < 0.5) { Q1.setFromAxisAngle(V1.set(dz / d, 0, -dx / d), d / R); m.quaternion.premultiply(Q1); }
      m.position.set(nx, R, nz); m.visible = true;
    }
    // apuntando
    const a = this.aim;
    if (a) {
      if (a.charging) a.pull = clamp(a.pull + dt * 0.85, 0, 1);
      this._placeBody(false);
      this._drawAim(a.ang, a.pull);
      a.sendT -= dt;
      if (a.sendT <= 0) { a.sendT = 0.12; this.getNet()?.send({ t: 'pool', a: 'aim', ang: a.ang, pull: a.pull, on: 1 }); }
      this._hudPower(a.pull, a.charging);
    } else if (this.remoteAim) {
      const r = this.remoteAim;
      r.t -= dt;
      if (r.t <= 0 || !this.balls?.[0]?.on) { this.remoteAim = null; this.cue.visible = false; }
      else this._drawCue(r.ang, r.shoot ? Math.max(0, r.t / 0.25) * 0.4 - 0.05 : r.pull);
    } else if (this.replay && this.replay.by === G.myId && this.replay.strikeT > 0) this._drawCue(this.replay.ang, -0.05);
    else if (this.cue.visible) this.cue.visible = false;
  }
  _world(b) { return this.group.localToWorld(V2.set(b.x, R, b.z)); }
  _sounds(R0) {
    for (; R0.seen < R0.ev.length; R0.seen++) {
      const e = R0.ev[R0.seen];
      if (e.k === 'hit') G.sfx?.trigger('hit', this._world(R0.balls[e.a]), clamp(e.s / 3, 0.08, 0.7), { full: 2, max: 14, rate: 2.1 + Math.random() * 0.3 });
      else if (e.k === 'rail') G.sfx?.trigger('wood', this._world(R0.balls[e.i]), clamp(e.s / 4, 0.05, 0.35), { full: 2, max: 12, rate: 0.7 });
      else if (e.k === 'pocket') {
        G.sfx?.trigger('wood', this._world(R0.balls[e.i]), 0.5, { full: 2, max: 14, rate: 0.45 });
        if (this.mine() >= 0 && e.i !== 0) G.sfx?.trigger('ui-ok', null, 0.25);
      }
    }
  }
  _drawCue(ang, pull) {
    const c = this.balls?.[0];
    if (!c?.on) { this.cue.visible = false; return; }
    const sx = Math.sin(ang), sz = Math.cos(ang), back = R + 0.012 + pull * 0.28;
    this.cue.position.set(c.x - sx * back, R + 0.035 + pull * 0.02, c.z - sz * back);
    this.cue.rotation.set(0.07, ang, 0, 'YXZ'); // apenas levantada atrás (como se tira de verdad)
    this.cue.visible = true;
  }
  // línea hasta la primera bola o banda; bola fantasma donde le pega; para dónde sale la otra
  _drawAim(ang, pull) {
    const c = this.balls[0], sx = Math.sin(ang), sz = Math.cos(ang);
    this._drawCue(ang, pull);
    let best = Infinity, hit = null;
    for (const b of this.balls) {
      if (!b.on || !b.n) continue;
      // rayo contra un círculo de radio 2R alrededor de la otra bola
      const ox = b.x - c.x, oz = b.z - c.z, proj = ox * sx + oz * sz;
      if (proj <= 0) continue;
      const perp2 = ox * ox + oz * oz - proj * proj, rr = 4 * R * R;
      if (perp2 > rr) continue;
      const t = proj - Math.sqrt(rr - perp2);
      if (t < best) { best = t; hit = b; }
    }
    // banda
    let tr = Infinity;
    if (sx) tr = Math.min(tr, ((sx > 0 ? TABLE.W : -TABLE.W) - c.x) / sx);
    if (sz) tr = Math.min(tr, ((sz > 0 ? TABLE.L : -TABLE.L) - c.z) / sz);
    const t = Math.min(best, tr), ex = c.x + sx * t, ez = c.z + sz * t;
    const pos = this.line.geometry.attributes.position;
    pos.setXYZ(0, c.x, R * 0.3, c.z); pos.setXYZ(1, ex, R * 0.3, ez); pos.needsUpdate = true;
    this.line.computeLineDistances(); this.line.visible = true;
    this.ghost.position.set(ex, 0.002, ez); this.ghost.visible = true;
    if (hit && best <= tr) {
      const nx = hit.x - ex, nz = hit.z - ez, d = Math.sqrt(nx * nx + nz * nz) || 1;
      const p2 = this.line2.geometry.attributes.position;
      p2.setXYZ(0, hit.x, R * 0.3, hit.z); p2.setXYZ(1, hit.x + (nx / d) * 0.28, R * 0.3, hit.z + (nz / d) * 0.28); p2.needsUpdate = true;
      this.line2.material.color.set(this._legalTarget(hit.n) ? 0x8aff9a : 0xff7a5a);
      this.line2.visible = true;
    } else this.line2.visible = false;
  }
  _legalTarget(n) {
    const i = this.mine(), grp = i >= 0 ? this.g.grp[i] : null;
    if (this.g.solo || !grp) return n !== 8;
    const left = this.balls.some((b) => b.on && b.n !== 0 && b.n !== 8 && (b.n < 8 ? 's' : 't') === grp);
    return left ? (n < 8 ? 's' : 't') === grp && n !== 8 : n === 8;
  }

  // ---------------------------------------------------------------- cámara del que apunta
  cameraPose(camera, dt) {
    const a = this.aim;
    if (!a || !this.balls?.[0]?.on) return false;
    const c = this.balls[0], sx = Math.sin(a.ang), sz = Math.cos(a.ang);
    const dist = 0.45 + a.camH * 0.9;
    const eye = this.group.localToWorld(V1.set(c.x - sx * dist, a.camH, c.z - sz * dist));
    const look = this.group.localToWorld(V2.set(c.x + sx * 0.35, 0, c.z + sz * 0.35));
    if (!this.camP) this.camP = eye.clone(); else this.camP.lerp(eye, 1 - Math.exp(-14 * dt));
    camera.position.copy(this.camP); camera.lookAt(look);
    return true;
  }

  // ---------------------------------------------------------------- cartelito (arriba a la izquierda, solo si estás en la mesa)
  _result() {
    const i = this.mine();
    if (i < 0 || this.g.win == null) return;
    if (this.g.solo) this.bigMessage?.('🎱', this.g.msg || '¡Mesa limpia!', 2200);
    else this.bigMessage?.('🎱', this.g.win === i ? '¡Ganaste el pool!' : 'Perdiste el pool', 2400);
    G.sfx?.trigger(this.g.win === i ? 'ui-ok' : 'ui-err', null, 0.8);
  }
  _hudPower(p, on) {
    const el = document.getElementById('pool-pow');
    if (el) { el.style.opacity = on || p > 0 ? '1' : '0.35'; el.firstChild.style.width = Math.round(p * 100) + '%'; el.firstChild.style.background = p > 0.8 ? '#ff5a3a' : p > 0.5 ? '#ffc23a' : '#8aff9a'; }
  }
  _hud() {
    if (!HAS_DOM) return;
    let el = document.getElementById('pool-hud');
    const i = this.mine();
    if (i < 0) { if (el) el.classList.add('hidden'); return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'pool-hud'; document.body.appendChild(el);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        G.sfx?.trigger('ui-select', null, 0.4);
        if (b.dataset.a === 'rack') this.getNet()?.send({ t: 'pool', a: 'rack' });
        else if (b.dataset.a === 'leave') this.leave();
      });
    }
    el.classList.remove('hidden');
    const g = this.g, other = this.players[1 - i], rival = other ? G.players?.get(other)?.name || '?' : null;
    const grp = g.grp[i] ? ` (${GROUP_NAME[g.grp[i]]})` : '';
    let msg;
    if (g.win != null) msg = g.solo ? (g.msg || '¡Mesa limpia!') : g.win === i ? `🎉 ¡Ganaste! ${esc(g.msg)}` : `Perdiste. ${esc(g.msg)}`;
    else if (this.replay) msg = 'Ruedan…';
    else if (this.aim) msg = 'Mantené el click para cargar, soltá para tirar';
    else if (this.myTurn()) msg = `<b>Te toca${grp}</b> · X para apuntar`;
    else msg = `Le toca a ${esc(rival)}`;
    // las que te quedan
    const mineGrp = g.grp[i];
    const dots = this.balls ? this.balls.filter((b) => b.n && b.n !== 8 && (!mineGrp || (b.n < 8 ? 's' : 't') === mineGrp)).map((b) => `<span class="pb${b.on ? '' : ' in'}${b.n > 8 ? ' st' : ''}" style="--c:${colorOf(b.n)}">${b.n}</span>`).join('') : '';
    const btns = [];
    if (g.win != null || g.solo) btns.push(`<button type="button" data-a="rack">${g.win != null ? '🔄 Otra' : '🔄 Armar de nuevo'}</button>`);
    btns.push('<button type="button" data-a="leave">Dejar la mesa</button>');
    el.innerHTML = `<div class="ttl">🎱 Pool${rival ? ` contra ${esc(rival)}` : ' · practicando'}</div><div class="st">${msg}</div><div class="balls">${dots}</div>${this.aim ? '<div id="pool-pow"><i></i></div>' : ''}<div class="bt">${btns.join('')}</div>`;
  }
}
