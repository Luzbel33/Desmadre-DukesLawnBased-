// Ajedrez jugable en las mesas del castillo (shared/mapdata.js CHESS_BOARDS). Las reglas están en shared/chess.js y
// el servidor valida cada jugada (server/room.js onChess). Las piezas son las del juego de ajedrez del castillo,
// separadas en Blender (assets/blender/chess/split_chess.py -> chess_pieces.glb).
//  - Sentarse en la silla de un color (X) = jugar con ese color. La cámara se pone arriba del tablero, de tu lado,
//    y se mueve con el mouse: click en una pieza tuya, click en la casilla (se marcan las jugadas posibles).
//  - Si no hay rival: el Conde (la IA, piensa en un Worker); la jugada la manda tu cliente y el servidor la valida.
//  - Los demás ven la partida en 3D (las piezas se deslizan, el caballo salta, las comidas van al costado).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { G, clamp } from '../core/G.js';
import { CHESS_BOARDS } from '../shared/mapdata.js';
import { initial, legal, apply, inCheck, fileOf, rankOf } from '../shared/chess.js';

const HAS_DOM = typeof document !== 'undefined';
const S = 0.0553; // lado de una casilla (el tablero del castillo)
const URL_GLB = 'assets/props/castle/chess_pieces.glb';
const smooth = (x) => x * x * (3 - 2 * x);
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
const COLOR_NAME = { w: 'blancas', b: 'negras' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// centro de la casilla i en el espacio del tablero: las blancas del lado -z y, mirando desde ahí, la columna "a" a la
// izquierda (que es +x: la cámara mira hacia +z)
const local = (i, out = new THREE.Vector3()) => out.set((3.5 - fileOf(i)) * S, 0, (rankOf(i) - 3.5) * S);

export class ChessGame {
  constructor({ scene, getLocal, getNet, onSit, onLeave, bigMessage }) {
    Object.assign(this, { scene, getLocal, getNet, onSit, onLeave, bigMessage });
    this.boards = new Map();
    this.my = null; // { b, col } si estoy jugando
    this.sel = -1; this.hover = -1;
    this.anims = [];
    this.lib = null;
    this.ray = new THREE.Raycaster();
    this.thinking = false;
    this.camP = null;
  }

  // ---------------------------------------------------------------- armado
  build(seats = []) {
    for (const def of CHESS_BOARDS) {
      const group = new THREE.Group();
      group.position.fromArray(def.c); group.rotation.y = def.yaw; group.name = 'chess-' + def.id;
      const marks = new THREE.Group(); group.add(marks);
      this.scene?.add(group);
      const B = { def, group, marks, st: initial(), seats: { w: 0, b: 0 }, ai: null, last: null, res: null, n: 0, pieces: new Map(), grave: [], seat: {} };
      // las sillas de cada color (si ya hay una silla del castillo ahí, se usa esa)
      for (const col of ['w', 'b']) {
        const sd = def.seats[col];
        let s = seats.find((o) => Math.hypot(o.x - sd.x, o.z - sd.z) < 0.45 && Math.abs(o.y - sd.y) < 0.35);
        if (!s) { s = { x: sd.x, y: sd.y, z: sd.z, yaw: sd.yaw }; seats.push(s); }
        s.yaw = sd.yaw; s.chess = { b: def.id, c: col };
        B.seat[col] = s;
      }
      this.boards.set(def.id, B);
    }
    if (HAS_DOM) {
      new GLTFLoader().load(URL_GLB, (g) => {
        this.lib = {};
        g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; this.lib[o.name] = o; } });
        for (const B of this.boards.values()) {
          if (this.lib.board) { const b = this.lib.board.clone(); b.receiveShadow = true; B.group.add(b); }
          this._place(B);
        }
      }, undefined, (e) => console.warn('ajedrez', e));
      this._marksInit();
    }
    return this;
  }
  _piece(c) {
    const key = (c === c.toUpperCase() ? 'w_' : 'b_') + c.toLowerCase();
    const src = this.lib?.[key];
    return src ? src.clone() : null;
  }
  // todas las piezas en su lugar (sin animar): al entrar, al empezar otra partida
  _place(B) {
    for (const m of B.pieces.values()) B.group.remove(m);
    for (const m of B.grave) B.group.remove(m);
    B.pieces.clear(); B.grave = [];
    if (!this.lib) return;
    for (let i = 0; i < 64; i++) {
      const c = B.st.b[i];
      if (c === '.') continue;
      const m = this._piece(c);
      if (!m) continue;
      local(i, m.position);
      B.group.add(m); B.pieces.set(i, m);
    }
    this._marks(B);
  }

  // ---------------------------------------------------------------- red
  sync(m) {
    const B = this.boards.get(m?.b);
    if (!B || !m.st || typeof m.st.b !== 'string' || m.st.b.length !== 64) return;
    const prev = B.st, prevN = B.n, prevRes = B.res;
    Object.assign(B, { st: m.st, seats: m.seats || { w: 0, b: 0 }, ai: m.ai || null, last: m.last || null, res: m.res || null, n: m.n | 0 });
    if (this.lib) {
      if (B.n === prevN + 1 && B.last) this._animate(B, prev, B.last);
      else if (B.st.b !== prev.b || B.n !== prevN) this._place(B);
    }
    const me = G.myId, col = B.seats.w === me ? 'w' : B.seats.b === me ? 'b' : null;
    if (col && this.my?.b !== m.b) { this.my = { b: m.b, col }; this.sel = -1; this.camP = null; this.onSit?.(B.seat[col]); }
    else if (!col && this.my?.b === m.b) { this.my = null; this.onLeave?.(); }
    if (this.my?.b === m.b) {
      if (B.n !== prevN) this.sel = -1;
      if (B.res && !prevRes) {
        const r = B.res, won = r.r === this.my.col;
        G.sfx?.trigger(won ? 'ui-ok' : 'ui-err', null, 0.8);
        this.bigMessage?.('♟️', r.r === 'draw' ? `Tablas (${r.why})` : won ? `¡Ganaste! (${r.why})` : `Perdiste (${r.why})`, 2600);
      } else if (B.n === prevN + 1 && !B.res && inCheck(B.st)) G.sfx?.trigger('ui-err', null, 0.35);
    }
    this._marks(B);
    if (this.my?.b === m.b) this._hud();
  }
  syncAll(list) { for (const m of list || []) this.sync(m); }
  send(a, extra = {}) { if (this.my) this.getNet()?.send({ t: 'chess', b: this.my.b, a, ...extra }); }

  // ¿esa silla ya está ocupada (por alguien o por el Conde)?
  taken(seat) {
    const B = this.boards.get(seat?.chess?.b);
    if (!B) return false;
    const c = seat.chess.c;
    return !!B.seats[c] || B.ai === c;
  }
  sit(seat) {
    if (!seat?.chess) return;
    this.getNet()?.send({ t: 'chess', b: seat.chess.b, a: 'sit', c: seat.chess.c });
  }
  leave() {
    if (!this.my) return;
    this.send('leave');
    this.my = null; this.sel = -1; this._hud();
    this.onLeave?.();
  }

  // ---------------------------------------------------------------- jugar
  // pointer: coordenadas normalizadas de la pantalla (-1..1); click: soltar el botón
  pointer(nx, ny, camera, click) {
    if (!this.my) return;
    const B = this.boards.get(this.my.b);
    this.ray.setFromCamera(V1.set(nx, ny, 0), camera);
    const plane = new THREE.Plane(V2.set(0, 1, 0), -B.group.position.y);
    const hit = this.ray.ray.intersectPlane(plane, new THREE.Vector3());
    let i = -1;
    if (hit) {
      B.group.worldToLocal(hit);
      const f = Math.floor(4 - hit.x / S), r = Math.floor(hit.z / S + 4);
      if (f >= 0 && f < 8 && r >= 0 && r < 8) i = r * 8 + f;
    }
    if (i !== this.hover) { this.hover = i; this._marks(B); }
    if (click) this._click(B, i);
  }
  _myTurn(B) { return this.my && !B.res && B.st.turn === this.my.col && (B.seats.w || B.ai === 'w') && (B.seats.b || B.ai === 'b'); }
  _click(B, i) {
    if (i < 0) { this.sel = -1; this._marks(B); return; }
    if (!this._myTurn(B) || this.anims.length) { G.sfx?.trigger('ui-err', null, 0.3); return; }
    const c = B.st.b[i], mine = c !== '.' && (c === c.toUpperCase() ? 'w' : 'b') === this.my.col;
    if (this.sel >= 0 && !mine) {
      const m = legal(B.st).find((x) => x.f === this.sel && x.t === i && (!x.p || x.p === 'q'));
      if (m) { this.send('move', { m: [m.f, m.t, m.p || 0] }); this.sel = -1; this._marks(B); return; }
      G.sfx?.trigger('ui-err', null, 0.3);
      return;
    }
    this.sel = mine && this.sel !== i ? i : -1;
    if (this.sel >= 0) G.sfx?.trigger('ui-select', null, 0.4);
    this._marks(B);
  }

  // el Conde: cuando le toca, piensa en el Worker y el que juega con él manda la jugada (el servidor la valida)
  _ai(B) {
    if (this.thinking || !this.my || this.my.b !== B.def.id || B.res || B.ai !== B.st.turn || this.anims.length) return;
    this.thinking = true;
    const n = B.n, t0 = performance.now();
    const done = (m) => {
      const wait = Math.max(0, 700 + Math.random() * 600 - (performance.now() - t0)); // que parezca que piensa
      setTimeout(() => {
        this.thinking = false;
        if (m && B.n === n && this.my?.b === B.def.id && !B.res) this.send('move', { ai: 1, m: [m.f, m.t, m.p || 0] });
      }, wait);
    };
    try {
      if (!this.worker) {
        this.worker = new Worker(new URL('./chess-worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => { const cb = this._cb; this._cb = null; cb?.(e.data?.m || null); };
        this.worker.onerror = () => { const cb = this._cb; this._cb = null; this.worker = null; cb?.(null); };
      }
      this._cb = done;
      this.worker.postMessage({ id: n, st: B.st, depth: 3 });
    } catch { this.thinking = false; }
    this._hud();
  }

  // ---------------------------------------------------------------- animación de las jugadas
  _animate(B, prev, mv) {
    let info;
    try { info = apply(prev, mv).info; } catch { this._place(B); return; }
    const piece = B.pieces.get(mv.f);
    if (!piece) { this._place(B); return; }
    const knight = prev.b[mv.f].toLowerCase() === 'n';
    if (info.cap) {
      const cm = B.pieces.get(info.capAt);
      B.pieces.delete(info.capAt);
      if (cm) {
        // la comida va al costado del tablero, del lado de quien la comió
        const k = B.grave.length, side = prev.turn === 'w' ? -1 : 1;
        const to = new THREE.Vector3(side * (0.3 + (k % 2) * 0.035), 0, -side * (0.2 - Math.floor(k / 2) * 0.034));
        B.grave.push(cm);
        this.anims.push({ mesh: cm, from: cm.position.clone(), to, t: -0.2, dur: 0.45, arc: 0.08 });
      }
    }
    B.pieces.delete(mv.f); B.pieces.set(mv.t, piece);
    this.anims.push({ mesh: piece, from: piece.position.clone(), to: local(mv.t), t: 0, dur: knight ? 0.42 : 0.3, arc: knight ? 0.07 : 0.018, B, promo: info.promo, at: mv.t, clack: true });
    if (info.castle) {
      const rook = B.pieces.get(info.castle.f);
      if (rook) { B.pieces.delete(info.castle.f); B.pieces.set(info.castle.t, rook); this.anims.push({ mesh: rook, from: rook.position.clone(), to: local(info.castle.t), t: -0.15, dur: 0.3, arc: 0.04, clack: true }); }
    }
  }
  update(dt) {
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = clamp(a.t / a.dur, 0, 1), e = smooth(k);
      a.mesh.position.lerpVectors(a.from, a.to, e);
      a.mesh.position.y = Math.sin(k * Math.PI) * a.arc;
      if (k < 1) continue;
      this.anims.splice(i, 1);
      if (a.clack) G.sfx?.trigger('wood', a.mesh.getWorldPosition(V1), 0.22, { full: 1.5, max: 9, rate: 1.6 + Math.random() * 0.3 });
      if (a.promo && a.B) { // coronó: el peón se vuelve dama
        const nm = this._piece(a.promo);
        if (nm) { nm.position.copy(a.mesh.position); a.B.group.remove(a.mesh); a.B.group.add(nm); a.B.pieces.set(a.at, nm); }
      }
    }
    if (this.my) {
      const B = this.boards.get(this.my.b);
      if (B) { this._ai(B); if (this.selMark) this.selMark.material.opacity = 0.45 + Math.sin((G.time || 0) * 6) * 0.15; }
    }
  }

  // ---------------------------------------------------------------- cámara del que juega
  cameraPose(camera, dt) {
    if (!this.my) return false;
    const B = this.boards.get(this.my.b);
    const side = this.my.col === 'w' ? -1 : 1;
    const eye = B.group.localToWorld(V1.set(0, 0.5, side * 0.4));
    const look = B.group.localToWorld(V2.set(0, 0, -side * 0.02));
    if (!this.camP) this.camP = camera.position.clone();
    this.camP.lerp(eye, 1 - Math.exp(-8 * dt));
    camera.position.copy(this.camP);
    camera.lookAt(look);
    return true;
  }

  // ---------------------------------------------------------------- marcas en el tablero
  _marksInit() {
    const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
    this.M = { last: mat(0xffd84a, 0.28), check: mat(0xff2a1a, 0.55), sel: mat(0xffe08a, 0.5), dot: mat(0x5aff7a, 0.6), ring: mat(0xff7a3a, 0.65), hover: mat(0xffffff, 0.18) };
    this.G = { sq: new THREE.PlaneGeometry(S * 0.94, S * 0.94).rotateX(-Math.PI / 2), dot: new THREE.CircleGeometry(S * 0.15, 16).rotateX(-Math.PI / 2), ring: new THREE.RingGeometry(S * 0.36, S * 0.46, 24).rotateX(-Math.PI / 2) };
  }
  _marks(B) {
    if (!this.M) return;
    B.marks.clear(); this.selMark = null;
    const add = (geo, mat, i, y = 0.0009) => { const m = new THREE.Mesh(geo, mat); local(i, m.position).y = y; m.renderOrder = 2; B.marks.add(m); return m; };
    if (B.last) { add(this.G.sq, this.M.last, B.last.f); add(this.G.sq, this.M.last, B.last.t); }
    if (!B.res && inCheck(B.st)) { const k = B.st.b.indexOf(B.st.turn === 'w' ? 'K' : 'k'); if (k >= 0) add(this.G.sq, this.M.check, k, 0.001); }
    if (this.my?.b !== B.def.id) return;
    if (this.hover >= 0 && this._myTurn(B)) add(this.G.sq, this.M.hover, this.hover, 0.0011);
    if (this.sel >= 0) {
      this.selMark = add(this.G.sq, this.M.sel, this.sel, 0.0012);
      for (const m of legal(B.st)) if (m.f === this.sel && (!m.p || m.p === 'q')) add(B.st.b[m.t] !== '.' ? this.G.ring : this.G.dot, B.st.b[m.t] !== '.' ? this.M.ring : this.M.dot, m.t, 0.0014);
    }
  }

  // ---------------------------------------------------------------- el cartelito del que juega (arriba a la izquierda)
  _hud() {
    if (!HAS_DOM) return;
    let el = document.getElementById('chess-hud');
    if (!this.my) { if (el) el.classList.add('hidden'); return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'chess-hud'; document.body.appendChild(el);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        G.sfx?.trigger('ui-select', null, 0.4);
        const a = b.dataset.a;
        if (a === 'ai') this.send('ai', { on: 1 }); else if (a === 'noai') this.send('ai', { on: 0 });
        else if (a === 'resign') { if (confirm('¿Te rendís?')) this.send('resign'); }
        else if (a === 'reset') this.send('reset'); else if (a === 'leave') this.leave();
      });
    }
    el.classList.remove('hidden');
    const B = this.boards.get(this.my.b), col = this.my.col, other = col === 'w' ? 'b' : 'w';
    const rival = B.ai === other ? 'el Conde 🧛' : G.players?.get(B.seats[other])?.name || null;
    let msg;
    if (B.res) msg = B.res.r === 'draw' ? `Tablas (${B.res.why})` : B.res.r === col ? `🎉 ¡Ganaste! (${B.res.why})` : `Perdiste (${B.res.why})`;
    else if (!rival) msg = 'Esperando rival… o jugá contra el Conde';
    else if (B.st.turn === col) msg = `<b>Te toca</b>${inCheck(B.st) ? ' — <span class="chk">¡JAQUE!</span>' : ''}`;
    else msg = B.ai === other ? 'El Conde piensa…' : `Le toca a ${esc(rival)}`;
    const btn = (a, t, cls = '') => `<button type="button" data-a="${a}" class="${cls}">${t}</button>`;
    const btns = [];
    if (!rival && !B.res) btns.push(btn('ai', '🧛 Jugar contra el Conde'));
    if (!B.res && B.n && rival) btns.push(btn('resign', '🏳️ Rendirse'));
    if (B.res || (B.ai && B.n)) btns.push(btn('reset', '🔄 Otra'));
    if (B.ai === other && !B.n) btns.push(btn('noai', 'Sin el Conde'));
    btns.push(btn('leave', 'Levantarse · Esc'));
    el.innerHTML = `<div class="ttl">♟️ Ajedrez · jugás con ${COLOR_NAME[col]}${rival ? ` contra ${esc(rival)}` : ''}</div><div class="st">${msg}</div><div class="bt">${btns.join('')}</div>`;
  }
}
