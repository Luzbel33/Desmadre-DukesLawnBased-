// Póker en la mesa del bar, como en la vida real (la idea del póker de Red Dead Redemption 2): sentado en primera
// persona, todo pasa SOBRE LA MESA. El que reparte tira las cartas, las comunitarias se dan vuelta de a una, las
// fichas van a la apuesta, de ahí al pozo y el pozo al que gana. Tus cartas están frente a vos (solo vos las
// ves). Se juega con el teclado, sin botones: Espacio pasa o iguala, R sube (la rueda elige cuánto), F mantenida
// te retirás, Tab mantenida muestra las jugadas, X te levantás. El mouse mira alrededor de la mesa.
// Toda la lógica vive en el servidor (server/poker.js); acá se muestra y se mandan las acciones.
import * as THREE from 'three';
import { G, hashStr } from '../core/G.js';
import { HumanCharacter } from '../char/human.js';
import { bestHand, describeHand, RANKING } from '../shared/poker-rules.js';

// Parroquianos (bots del servidor): cómo se ve cada uno
const BOT_LOOKS = {
  Tito: { model: 'eric', hat: 'boina', hatColor: '#2b2b2b' },
  'La Chola': { model: 'claudia', hat: 'none', glasses: 'sun' },
  'El Ruso': { model: 'eric', hat: 'beanie', hatColor: '#3b4f8a' },
  'Doña Rosa': { model: 'carla', glasses: 'nerd' },
  Pocho: { model: 'eric', hat: 'cap', hatColor: '#c8312b' },
  'El Turco': { model: 'eric', hat: 'cowboy', hatColor: '#6b4a2a' },
  Coco: { model: 'claudia', hat: 'cap', hatColor: '#2f8f3a' },
  'La Negra': { model: 'carla', hat: 'boina', hatColor: '#7a1f2b' },
};
const MODELS3 = ['eric', 'carla', 'claudia'];

const RANKS = '23456789TJQKA';
const SUITS = 'shdc';
const SUIT_CH = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_TXT = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
const CW = 160, CH = 224; // píxeles por carta en la textura
const CARD_W = 0.105, CARD_H = 0.147; // un poco más grandes que las reales: se leen desde la silla
const FELT = 0.012; // altura sobre el paño
const BOARD_SCALE = 1.4;
const LIVE = ['preflop', 'flop', 'turn', 'river'];
const ACT_TXT = { fold: 'Se retira', check: 'Pasa', call: 'Iguala', bet: 'Apuesta', raise: 'Sube', allin: '¡Va con todo!' };

// ---------------------------------------------------------------- texturas: naipes
let ATLAS = null;
const PIPS = {
  2: [[0.5, 0.22], [0.5, 0.78]],
  3: [[0.5, 0.22], [0.5, 0.5], [0.5, 0.78]],
  4: [[0.32, 0.22], [0.68, 0.22], [0.32, 0.78], [0.68, 0.78]],
  5: [[0.32, 0.22], [0.68, 0.22], [0.5, 0.5], [0.32, 0.78], [0.68, 0.78]],
  6: [[0.32, 0.22], [0.68, 0.22], [0.32, 0.5], [0.68, 0.5], [0.32, 0.78], [0.68, 0.78]],
  7: [[0.32, 0.22], [0.68, 0.22], [0.5, 0.36], [0.32, 0.5], [0.68, 0.5], [0.32, 0.78], [0.68, 0.78]],
  8: [[0.32, 0.22], [0.68, 0.22], [0.5, 0.36], [0.32, 0.5], [0.68, 0.5], [0.5, 0.64], [0.32, 0.78], [0.68, 0.78]],
  9: [[0.32, 0.2], [0.68, 0.2], [0.32, 0.4], [0.68, 0.4], [0.5, 0.5], [0.32, 0.6], [0.68, 0.6], [0.32, 0.8], [0.68, 0.8]],
  10: [[0.32, 0.2], [0.68, 0.2], [0.5, 0.3], [0.32, 0.4], [0.68, 0.4], [0.32, 0.6], [0.68, 0.6], [0.5, 0.7], [0.32, 0.8], [0.68, 0.8]],
};
function atlas() {
  if (ATLAS) return ATLAS;
  const c = document.createElement('canvas');
  c.width = CW * 13;
  c.height = CH * 5;
  const x = c.getContext('2d');
  const round = (px, py, w, h, r) => { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); };
  for (let si = 0; si < 4; si++) {
    for (let ri = 0; ri < 13; ri++) {
      const px = ri * CW, py = si * CH;
      const s = SUITS[si], r = RANKS[ri];
      const red = s === 'h' || s === 'd';
      const ink = red ? '#b8182a' : '#16171b';
      round(px + 3, py + 3, CW - 6, CH - 6, 14);
      x.fillStyle = '#fbf8f0';
      x.fill();
      x.strokeStyle = '#cfc6b1';
      x.lineWidth = 2;
      x.stroke();
      const rt = RANK_TXT[r] || r;
      x.fillStyle = ink;
      x.textAlign = 'center';
      x.textBaseline = 'alphabetic';
      // índices grandes en las esquinas (lo que se lee desde lejos)
      const corner = () => {
        x.font = `bold ${rt.length > 1 ? 40 : 48}px Georgia, serif`;
        x.fillText(rt, 30, 52);
        x.font = '38px Georgia, serif';
        x.fillText(SUIT_CH[s], 30, 90);
      };
      x.save(); x.translate(px, py); corner(); x.restore();
      x.save(); x.translate(px + CW, py + CH); x.rotate(Math.PI); corner(); x.restore();
      const n = RANKS.indexOf(r) + 2;
      if (n <= 10) {
        // pintas como en un mazo de verdad
        x.font = '40px Georgia, serif';
        for (const [u, v] of PIPS[n]) {
          x.save();
          x.translate(px + u * CW, py + v * CH + 14);
          if (v > 0.55) { x.translate(0, -28); x.rotate(Math.PI); }
          x.fillText(SUIT_CH[s], 0, 0);
          x.restore();
        }
      } else if (n === 14) {
        x.font = '96px Georgia, serif';
        x.fillText(SUIT_CH[s], px + CW / 2, py + CH / 2 + 32);
      } else {
        // figuras: marco dorado con la letra y el palo
        x.strokeStyle = '#c9a441';
        x.lineWidth = 3;
        round(px + 36, py + 40, CW - 72, CH - 80, 8);
        x.stroke();
        x.fillStyle = red ? 'rgba(184,24,42,0.08)' : 'rgba(22,23,27,0.07)';
        x.fill();
        x.fillStyle = ink;
        x.font = 'bold 68px Georgia, serif';
        x.fillText(r, px + CW / 2, py + CH / 2 + 10);
        x.font = '40px Georgia, serif';
        x.fillText(SUIT_CH[s], px + CW / 2, py + CH / 2 + 52);
      }
    }
  }
  // dorso: bordó con reticulado y el nombre del juego
  const py = 4 * CH;
  for (let ri = 0; ri < 13; ri++) {
    const px = ri * CW;
    round(px + 3, py + 3, CW - 6, CH - 6, 14);
    x.fillStyle = '#6d1420';
    x.fill();
    x.save();
    round(px + 13, py + 13, CW - 26, CH - 26, 9);
    x.clip();
    x.strokeStyle = 'rgba(242,230,200,0.3)';
    x.lineWidth = 1.5;
    for (let k = -CH; k < CW + CH; k += 11) {
      x.beginPath(); x.moveTo(px + k, py); x.lineTo(px + k + CH, py + CH); x.stroke();
      x.beginPath(); x.moveTo(px + k + CH, py); x.lineTo(px + k, py + CH); x.stroke();
    }
    x.restore();
    x.strokeStyle = '#f2e6c8';
    x.lineWidth = 4;
    round(px + 13, py + 13, CW - 26, CH - 26, 9);
    x.stroke();
    x.fillStyle = '#6d1420';
    x.beginPath(); x.ellipse(px + CW / 2, py + CH / 2, 52, 26, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#f2e6c8'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#f2e6c8';
    x.font = 'bold 17px Georgia, serif';
    x.textAlign = 'center';
    x.fillText('DESMADRE', px + CW / 2, py + CH / 2 + 6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  ATLAS = { canvas: c, tex };
  return ATLAS;
}
function cardUV(card) {
  if (!card) return [0, 4];
  return [RANKS.indexOf(card[0]), SUITS.indexOf(card[1])];
}
function setUV(geo, card) {
  const [ci, ri] = cardUV(card);
  const uv = geo.attributes.uv;
  const u0 = ci / 13, u1 = (ci + 1) / 13, v1 = 1 - ri / 5, v0 = 1 - (ri + 1) / 5;
  uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}
// Naipe de dos caras: el frente mira para arriba (+Y local) y el dorso para abajo. Boca abajo = girado 180°.
function makeCard() {
  // un toque más oscuro que el blanco puro: bajo la lámpara el blanco se quemaba (brillo)
  const mat = new THREE.MeshStandardMaterial({ map: atlas().tex, color: 0xd9d3c4, roughness: 0.72 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H).rotateX(-Math.PI / 2), mat);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H).rotateX(Math.PI / 2), mat);
  front.position.y = 0.0006;
  back.position.y = -0.0006;
  setUV(back.geometry, null);
  setUV(front.geometry, null);
  for (const m of [front, back]) { m.receiveShadow = true; m.castShadow = false; }
  const g = new THREE.Group();
  g.add(front, back);
  g.visible = false;
  g.userData = { front, face: undefined, anim: null, up: false };
  return g;
}
function setFace(card, face) {
  if (card.userData.face === face) return;
  card.userData.face = face;
  setUV(card.userData.front.geometry, face || null);
}
// Naipe como imagen (para la tabla de jugadas)
function cardCanvas(card, w = 46) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round(w * CH / CW);
  const [ci, ri] = cardUV(card);
  c.getContext('2d').drawImage(atlas().canvas, ci * CW, ri * CH, CW, CH, 0, 0, c.width, c.height);
  c.className = 'pk-mini';
  return c;
}

// ---------------------------------------------------------------- texturas: fichas
const DENOMS = [500, 100, 25, 5, 1];
const DENOM_COL = [0x5b2a86, 0x17171a, 0x23803a, 0xb82a25, 0xf1efe8];
function chipSpotsTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const x = c.getContext('2d');
  x.clearRect(0, 0, S, S);
  x.fillStyle = '#ffffff';
  x.strokeStyle = '#ffffff';
  // tapa: 6 marcas en el borde y un anillo fino (el resto transparente: se ve el color de la ficha)
  x.save();
  x.translate(S / 2, S / 2);
  for (let k = 0; k < 6; k++) {
    x.rotate(Math.PI / 3);
    x.fillRect(-7, -S / 2 + 2, 14, 18);
  }
  x.lineWidth = 3;
  x.beginPath(); x.arc(0, 0, S * 0.3, 0, Math.PI * 2); x.stroke();
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function chipEdgeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 8;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 8);
  x.fillStyle = '#ffffff';
  for (let k = 0; k < 6; k++) x.fillRect(k * 128 / 6 + 4, 0, 10, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const CHIP_R = 0.02, CHIP_H = 0.0062;
// Fichas instanciadas: el cuerpo lleva el color de cada valor; encima, las marcas blancas del borde
function chipMeshes(max) {
  const body = new THREE.InstancedMesh(new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 20), new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.02 }), max);
  const spotsTop = chipSpotsTexture(), spotsEdge = chipEdgeTexture();
  const dec = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(CHIP_R * 1.004, CHIP_R * 1.004, CHIP_H * 1.02, 20),
    [
      new THREE.MeshStandardMaterial({ map: spotsEdge, transparent: true, alphaTest: 0.5, roughness: 0.45 }),
      new THREE.MeshStandardMaterial({ map: spotsTop, transparent: true, alphaTest: 0.5, roughness: 0.45 }),
      new THREE.MeshStandardMaterial({ map: spotsTop, transparent: true, alphaTest: 0.5, roughness: 0.45 }),
    ],
    max,
  );
  for (const m of [body, dec]) { m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
  body.setColorAt(0, new THREE.Color());
  return { body, dec, max };
}

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const Q1 = new THREE.Quaternion();
const Q2 = new THREE.Quaternion();
const E1 = new THREE.Euler();
const M1 = new THREE.Matrix4();
const COL = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const fmt = (n) => Math.round(n).toLocaleString('es-AR');

export class PokerView {
  constructor({ scene, net, tables, seats, onSit, onLeave, onAct, onWin }) {
    this.onWin = onWin; // ({ amount, hand }) gané una mano
    this.scene = scene;
    this.net = net;
    this.table = tables.find((t) => t.id === 'bar') || tables[0];
    this.rx = (this.table?.rx || 1.3) - 0.05;
    this.rz = (this.table?.rz || 0.8) - 0.05;
    this.seats = seats.filter((s) => s.poker).sort((a, b) => a.seatIndex - b.seatIndex);
    this.onSit = onSit;
    this.onLeave = onLeave;
    this.onAct = onAct; // gesto de la mano en la mesa (pasar, pagar, subir, tirarse)
    this.st = null;
    this.myCards = [];
    this.mySeat = -1;
    this.pendingSeat = null;
    this.group = new THREE.Group();
    this.group.name = 'poker';
    scene.add(this.group);
    // naipes: 5 comunitarias + 2 por asiento
    this.board = [];
    for (let i = 0; i < 5; i++) { const m = makeCard(); this.group.add(m); this.board.push(m); }
    this.hole = this.seats.map(() => [makeCard(), makeCard()]);
    for (const pair of this.hole) for (const m of pair) this.group.add(m);
    // mazo al lado del que reparte
    this.deck = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, 0.018, CARD_H), [
      new THREE.MeshStandardMaterial({ color: 0xece5d2, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0xece5d2, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: atlas().tex, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0xece5d2 }),
      new THREE.MeshStandardMaterial({ color: 0xece5d2, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0xece5d2, roughness: 0.8 }),
    ]);
    { const uv = this.deck.geometry.attributes.uv; for (let k = 8; k < 12; k++) { const u = uv.getX(k), v = uv.getY(k); uv.setXY(k, u / 13, v / 5); } } // arriba: el dorso
    this.deck.castShadow = true;
    this.deck.visible = false;
    this.group.add(this.deck);
    // fichas: las que están quietas (pilas, apuestas, pozo) y las que vuelan
    this.chips = chipMeshes(1100);
    this.fly = chipMeshes(160);
    this.group.add(this.chips.body, this.chips.dec, this.fly.body, this.fly.dec);
    this.flights = []; // { n, from, to, t, dur, land() }
    // lo que se ve (va detrás del estado mientras vuelan las fichas)
    this.disp = { stack: this.seats.map(() => 0), bet: this.seats.map(() => 0), pot: 0 };
    // botón del que reparte
    this.dealerBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 24), [
      new THREE.MeshStandardMaterial({ color: 0xd9d2bd, roughness: 0.5 }), this._dealerTopMat(), this._dealerTopMat(),
    ]);
    this.dealerBtn.castShadow = true;
    this.dealerBtn.visible = false;
    this.group.add(this.dealerBtn);
    this.dealerPos = new THREE.Vector3();
    // carteles sobre cada jugador (nombre, fichas y lo último que hizo)
    this.labels = this.seats.map(() => {
      const el = document.createElement('div');
      el.className = 'pk-label hidden';
      document.getElementById('overlay')?.appendChild(el);
      return el;
    });
    this.said = this.seats.map(() => ({ txt: '', t: 0 }));
    this.bots = new Map(); // asiento -> { name, char, emote, emoteT }
    // mirar alrededor (mouse) y control de la apuesta
    this.look = { yaw: 0, pitch: 0 };
    this.betting = null; // { amount } mientras elegís cuánto subir
    this.foldHold = 0;
    this.helpHeld = false;
    this.banner = null;
    this._ui();
  }

  _dealerTopMat() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#f4efe2'; x.beginPath(); x.arc(32, 32, 31, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1b1b1b'; x.font = 'bold 36px Georgia, serif'; x.textAlign = 'center'; x.fillText('D', 32, 45);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
  }

  // ---------------------------------------------------------------- lugares sobre la mesa
  // punto del paño en dirección al asiento i, `inset` metros hacia adentro desde el borde; `lat` al costado
  // (+ = a la derecha de ese jugador)
  _spot(i, inset, lat = 0, out = new THREE.Vector3()) {
    const s = this.seats[i], c = this.table.center;
    let dx = s.x - c.x, dz = s.z - c.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const re = 1 / Math.sqrt((dx / this.rx) ** 2 + (dz / this.rz) ** 2);
    const r = Math.max(0.05, re - inset);
    // derecha del jugador (mira al centro: -d)
    const rx = dz, rz = -dx;
    return out.set(c.x + dx * r - rx * lat, c.y + FELT, c.z + dz * r - rz * lat);
  }
  // las cartas del medio van más grandes: se tienen que leer desde cualquier silla
  _boardSlot(k, out = new THREE.Vector3()) {
    const c = this.table.center;
    return out.set(c.x + (k - 2) * (CARD_W * BOARD_SCALE + 0.022), c.y + FELT, c.z - 0.07);
  }
  _potSpot(out = new THREE.Vector3()) {
    const c = this.table.center;
    return out.set(c.x, c.y + FELT, c.z + 0.2);
  }
  _deckSpot(out = new THREE.Vector3()) {
    const d = this.st?.dealer >= 0 && this.seats[this.st.dealer] ? this.st.dealer : 0;
    return this._spot(d, 0.34, -0.2, out);
  }
  _seatYaw(i) { return this.seats[i]?.yaw || 0; }

  isSeated() { return this.mySeat >= 0; }

  // ---------------------------------------------------------------- red
  sit(seat) {
    if (this.mySeat >= 0) return;
    const occ = this.st?.seats?.[seat.seatIndex];
    if (occ) { G.sfx?.trigger('ui-err'); return; }
    this.pendingSeat = seat;
    this.net.send({ t: 'pk', a: 'sit', seat: seat.seatIndex });
  }
  leave() {
    if (this.mySeat < 0 && !this.pendingSeat) return;
    this.net.send({ t: 'pk', a: 'leave' });
    this.mySeat = -1;
    this.pendingSeat = null;
    this.myCards = [];
    this.betting = null;
    this.onLeave?.();
    this._layout();
    this._hud();
  }
  act(act, amt = 0) {
    const me = this.st?.seats[this.mySeat];
    if (!me || this.st.turn !== this.mySeat || me.folded || me.allin || !LIVE.includes(this.st.phase)) return false;
    this.net.send({ t: 'pk', a: 'act', act, amt });
    this.betting = null;
    this.onAct?.(act);
    return true;
  }

  applyState(st) {
    const prev = this.st;
    this.st = st;
    const myIdx = st.seats.findIndex((s) => s && s.pid === G.myId);
    if (myIdx >= 0 && this.mySeat < 0) {
      this.mySeat = myIdx;
      const seat = this.seats[myIdx];
      this.pendingSeat = null;
      this.look.yaw = 0; this.look.pitch = 0;
      this.onSit?.(seat);
    } else if (myIdx < 0 && this.mySeat >= 0) {
      this.mySeat = -1;
      this.betting = null;
      this.onLeave?.();
    }
    // El reparto privado llega antes del estado público: conservar las cartas de esta mano.
    if (prev && st.handNo !== prev.handNo && this._cardsHand !== st.handNo) this.myCards = [];
    this._chipFlow(prev, st);
    // resultado de la mano (una sola vez)
    if (st.phase === 'showdown' && st.result && st.handNo !== this._wonHand) {
      this._wonHand = st.handNo;
      const mine = st.result.find((r) => st.seats[r.seat]?.pid === G.myId);
      if (mine) this.onWin?.(mine);
      for (const r of st.result) this._botEmote(r.seat, 'clap', 2);
      const r0 = st.result[0];
      if (r0) {
        const who = st.seats[r0.seat]?.pid === G.myId ? 'Ganaste' : `${r0.name} gana`;
        const more = st.result.length > 1 ? ` (se reparte entre ${st.result.length})` : '';
        this.banner = { txt: `${who} ${fmt(st.result.reduce((a, r) => a + r.amount, 0))}${r0.desc ? ' con ' + r0.desc : ''}${more}`, t: 4.2, win: !!mine };
      }
    }
    if (prev && st.turn === this.mySeat && prev.turn !== this.mySeat && this.mySeat >= 0) G.sfx?.trigger('ui-select', null, 0.7);
    if (st.turn !== this.mySeat) this.betting = null;
    this._syncBots();
    this._layout();
    this._hud();
  }
  setCards(m) {
    if (m.hand < (this.st?.handNo || 0)) return;
    this._cardsHand = m.hand;
    this.myCards = m.cards || [];
    this._layout();
    this._hud();
  }
  event(m) {
    const pos = this.table.center;
    if (m.seat >= 0) {
      if (m.e === 'fold') this._botEmote(m.seat, 'facepalm', 1.2);
      else if (m.e === 'raise' || m.e === 'bet' || m.e === 'allin') this._botEmote(m.seat, 'point', 1.1);
      const s = this.st?.seats?.[m.seat];
      const amt = m.amount || 0;
      let txt = ACT_TXT[m.e] || '';
      if (m.e === 'call') txt = `Iguala ${fmt(amt)}`;
      else if (m.e === 'bet') txt = `Apuesta ${fmt(amt)}`;
      else if (m.e === 'raise') txt = `Sube a ${fmt(amt)}`;
      if (txt && (s || m.e === 'fold')) this.said[m.seat] = { txt, t: 2.6, act: m.e };
    }
    switch (m.e) {
      case 'deal': G.sfx?.trigger('shuffle', pos, 0.8); break;
      case 'board': break; // suena cuando se da vuelta cada carta
      case 'fold': G.sfx?.trigger('card-shove', pos, 0.7); break;
      case 'check': G.sfx?.trigger('ui', pos, 0.35); break;
      case 'call': case 'bet': case 'raise': case 'allin': G.sfx?.trigger('chips', pos, 0.8); break;
      case 'win': break; // suena cuando llegan las fichas
      default: break;
    }
  }

  _botEmote(i, e, secs = 1.6) {
    const b = this.bots.get(i);
    if (b) { b.emote = e; b.emoteT = 0; b.emoteEnd = secs; }
  }

  // Parroquianos: aparecen sentados en su silla cuando el servidor los sienta, se van cuando se levantan
  _syncBots() {
    const st = this.st;
    for (let i = 0; i < this.seats.length; i++) {
      const s = st?.seats[i];
      const cur = this.bots.get(i);
      if (s?.bot && cur?.name === s.name) continue;
      if (cur) { cur.char.root.removeFromParent(); cur.char.dispose?.(); this.bots.delete(i); }
      if (!s?.bot) continue;
      const look = { model: MODELS3[hashStr(s.name) % 3], hat: 'none', glasses: 'none', ...(BOT_LOOKS[s.name] || {}) };
      try {
        const char = new HumanCharacter(look);
        char.root.name = 'parroquiano';
        this.scene.add(char.root);
        this.bots.set(i, { name: s.name, char, emote: null, emoteT: 0 });
      } catch (e) { console.warn('parroquiano', e); }
    }
  }

  // ---------------------------------------------------------------- fichas: lo que se mueve entre pilas
  // Cuando el estado cambia, las fichas vuelan: de la pila del jugador a su apuesta, de las apuestas al pozo,
  // del pozo al que ganó. Lo que se ve se actualiza cuando aterrizan.
  _chipFlow(prev, st) {
    const D = this.disp;
    const n = this.seats.length;
    const newHand = !prev || prev.handNo !== st.handNo;
    const bets = st.seats.map((s) => (s ? s.bet : 0));
    const stacks = st.seats.map((s) => (s ? s.chips : 0));
    if (!prev) { for (let i = 0; i < n; i++) { D.stack[i] = stacks[i]; D.bet[i] = bets[i]; } D.pot = st.pot; return; }
    // apuestas que crecieron: de la pila a la apuesta
    let collect = false;
    for (let i = 0; i < n; i++) {
      const was = prev.seats[i] ? prev.seats[i].bet : 0;
      if (!newHand && bets[i] > was) this._flight(i, 'stack', i, 'bet', bets[i] - was);
      else if (newHand && bets[i] > 0) this._flight(i, 'stack', i, 'bet', bets[i]); // ciegas
      if (!newHand && bets[i] < was) collect = true;
    }
    // cambio de calle (o fin de la mano): las apuestas van al pozo
    if (collect || (prev.phase !== st.phase && (st.phase === 'showdown' || LIVE.includes(st.phase)))) {
      for (let i = 0; i < n; i++) if (D.bet[i] > 0 && bets[i] === 0) this._flight(i, 'bet', -1, 'pot', D.bet[i]);
    }
    // se repartió el pozo: al/los que ganaron
    if (st.phase === 'showdown' && st.result && st.handNo !== this._paidHand) {
      this._paidHand = st.handNo;
      setTimeout(() => {
        for (const r of st.result) this._flight(-1, 'pot', r.seat, 'stack', r.amount, () => G.sfx?.trigger('chips-win', this.table.center, 1));
      }, 700);
    }
    // jugadores que se sentaron/levantaron o recompraron: sin animación
    for (let i = 0; i < n; i++) {
      if (!st.seats[i]) { D.stack[i] = 0; D.bet[i] = 0; continue; }
      if (!prev.seats[i] || prev.seats[i].pid !== st.seats[i].pid || (st.seats[i].chips > (prev.seats[i].chips || 0) && !st.result)) D.stack[i] = stacks[i];
    }
    this._chipTarget = { stacks, bets, pot: st.pot };
  }

  _anchor(i, kind, out) {
    if (kind === 'pot') return this._potSpot(out);
    if (kind === 'bet') return this._spot(i, 0.46, 0.02, out);
    return this._spot(i, 0.15, 0.13, out); // pila
  }

  _flight(fromI, fromKind, toI, toKind, amount, onLand = null) {
    if (!(amount > 0)) return;
    const D = this.disp;
    const take = (i, kind, a) => { if (kind === 'pot') D.pot = Math.max(0, D.pot - a); else if (kind === 'bet') D.bet[i] = Math.max(0, D.bet[i] - a); else D.stack[i] = Math.max(0, D.stack[i] - a); };
    const give = (i, kind, a) => { if (kind === 'pot') D.pot += a; else if (kind === 'bet') D.bet[i] += a; else D.stack[i] += a; };
    take(fromI, fromKind, amount);
    const from = this._anchor(fromI, fromKind, new THREE.Vector3());
    const to = this._anchor(toI, toKind, new THREE.Vector3());
    const chips = Math.max(1, Math.min(9, Math.round(Math.log2(amount / 5 + 1) * 1.6)));
    const denom = DENOMS.find((d) => amount >= d * 2) || 1;
    this.flights.push({
      n: chips, color: DENOM_COL[DENOMS.indexOf(denom)], from, to, t: 0, dur: 0.45 + Math.random() * 0.08,
      land: () => { give(toI, toKind, amount); onLand?.(); },
    });
  }

  // ---------------------------------------------------------------- lo que se ve sobre la mesa
  _layout() {
    const st = this.st;
    if (!st) return;
    const handNew = this._layoutHand !== st.handNo;
    this._layoutHand = st.handNo;
    const deck = this._deckSpot(V1);
    this.deck.visible = LIVE.includes(st.phase) || (st.phase === 'showdown' && !!st.result);
    this.deck.position.set(deck.x, deck.y + 0.009, deck.z);
    this.deck.rotation.set(0, this._seatYaw(st.dealer >= 0 ? st.dealer : 0) + 0.3, 0);
    // comunitarias: salen del mazo boca abajo, van a su lugar y se dan vuelta
    for (let k = 0; k < 5; k++) {
      const m = this.board[k];
      const card = st.board[k];
      if (!card) { if (m.visible) this._hide(m); continue; }
      const to = this._boardSlot(k, new THREE.Vector3());
      const yaw = ((hashStr(card) % 7) - 3) * 0.01;
      this._place(m, card, to, yaw, true, handNew, k < 3 ? 0.14 * k : 0, BOARD_SCALE);
    }
    // cartas de cada jugador
    for (let i = 0; i < this.seats.length; i++) {
      const s = st.seats[i];
      const pair = this.hole[i];
      const show = s && (s.hasCards || s.shown) && s.inHand;
      for (let k = 0; k < 2; k++) {
        const m = pair[k];
        if (!show) { if (m.visible) this._hide(m, s?.folded ? this.table.center : null); continue; }
        const mine = i === this.mySeat && this.myCards.length === 2;
        const face = s.shown ? s.shown[k] : mine ? this.myCards[k] : null;
        const to = this._spot(i, mine ? 0.27 : 0.3, (k - 0.5) * (CARD_W * (mine ? 1.2 : 0.9)), new THREE.Vector3());
        to.y += k * 0.001;
        const yaw = this._seatYaw(i) + Math.PI + (k - 0.5) * (mine ? 0.12 : 0.2);
        this._place(m, face, to, yaw, !!face, handNew, (k * this.seats.length + ((i - (st.dealer + 1) + 60) % this.seats.length)) * 0.1, mine ? 1.22 : 1);
      }
    }
    // botón del que reparte
    this.dealerBtn.visible = st.dealer >= 0 && !!st.seats[st.dealer];
    if (this.dealerBtn.visible) this._spot(st.dealer, 0.2, -0.24, this.dealerPos);
  }

  // Pone un naipe: si recién aparece, sale del mazo; si cambia de cara, se da vuelta en el lugar
  _place(m, face, to, yaw, up, fresh, delay = 0, scale = 1) {
    const d = m.userData;
    const deck = this._deckSpot(V2);
    void fresh;
    const q = Q1.setFromEuler(E1.set(0, yaw, up ? 0 : Math.PI));
    if (!m.visible) {
      m.visible = true;
      setFace(m, face);
      m.position.copy(deck).setY(deck.y + 0.02);
      m.quaternion.setFromEuler(E1.set(0, yaw + 0.8, Math.PI));
      m.scale.setScalar(scale);
      d.anim = { from: m.position.clone(), fromQ: m.quaternion.clone(), to: to.clone(), toQ: q.clone(), t: -delay, dur: 0.32, arc: 0.07, flipAt: up ? 0.55 : 2, sound: 'card-deal' };
      return;
    }
    setFace(m, face);
    m.scale.setScalar(scale);
    const moved = m.position.distanceTo(to) > 0.003 || !d.anim && Math.abs(m.quaternion.angleTo(q)) > 0.05;
    if (moved && (!d.anim || d.anim.to.distanceTo(to) > 0.003 || d.anim.toQ.angleTo(q) > 0.05)) {
      d.anim = { from: m.position.clone(), fromQ: m.quaternion.clone(), to: to.clone(), toQ: q.clone(), t: 0, dur: 0.3, arc: 0.03, flipAt: 2, sound: up && d.up === false ? 'card-flip' : null };
    }
    d.up = up;
  }
  _hide(m, toward = null) {
    const d = m.userData;
    if (toward && !d.hiding) {
      // tiradas: se van boca abajo hacia el medio y desaparecen
      d.hiding = true;
      d.anim = { from: m.position.clone(), fromQ: m.quaternion.clone(), to: V1.copy(toward).setY(m.position.y), toQ: Q1.copy(m.quaternion).multiply(Q2.setFromAxisAngle(V2.set(0, 0, 1), Math.PI)), t: 0, dur: 0.35, arc: 0.04, flipAt: 2, done: () => { m.visible = false; d.hiding = false; setFace(m, null); } };
      d.anim.to = d.anim.to.clone();
      d.anim.toQ = d.anim.toQ.clone();
      return;
    }
    if (d.hiding) return;
    m.visible = false;
    d.anim = null;
    setFace(m, null);
  }

  _stepCards(dt) {
    for (const m of [...this.board, ...this.hole.flat()]) {
      const a = m.userData.anim;
      if (!a || !m.visible) continue;
      a.t += dt;
      if (a.t < 0) continue;
      if (a.sound && !a.played) { a.played = true; G.sfx?.trigger(a.sound, a.to, 0.55); }
      const k = clamp(a.t / a.dur, 0, 1), e = ease(k);
      m.position.lerpVectors(a.from, a.to, e);
      m.position.y += Math.sin(Math.PI * k) * a.arc;
      m.quaternion.slerpQuaternions(a.fromQ, a.toQ, e);
      if (k >= 1) {
        m.position.copy(a.to);
        m.quaternion.copy(a.toQ);
        const done = a.done;
        // boca arriba al llegar: se da vuelta (medio giro sobre el eje largo)
        if (a.flipAt < 2) {
          const q = a.toQ.clone();
          m.userData.anim = { from: a.to.clone(), fromQ: q.clone().multiply(Q2.setFromAxisAngle(V2.set(0, 0, 1), Math.PI)), to: a.to.clone(), toQ: q, t: 0, dur: 0.26, arc: 0.035, flipAt: 2, sound: 'card-flip' };
          m.quaternion.copy(m.userData.anim.fromQ);
        } else m.userData.anim = null;
        done?.();
      }
    }
  }

  // Pilas de fichas (por valor, una al lado de la otra) + las que vuelan
  _drawChips(dt) {
    const B = this.chips, D = this.disp;
    let n = 0;
    const put = (mesh, dec, idx, x, y, z, rot, color) => {
      M1.makeRotationY(rot).setPosition(x, y, z);
      mesh.setMatrixAt(idx, M1);
      dec.setMatrixAt(idx, M1);
      mesh.setColorAt(idx, COL.setHex(color));
    };
    const stack = (base, amount, facing, max = 16) => {
      let left = Math.round(amount);
      let col = 0;
      const rx = Math.cos(facing), rz = -Math.sin(facing);
      for (let d = 0; d < DENOMS.length && left > 0 && n < B.max - 20; d++) {
        // las de 500 solo para lo que no entra en las chicas (una pila de 2.000 son fichas de 100 y 25, no 4 de 500)
        const reserve = DENOMS[d] === 500 ? Math.min(left, max * 100 + 400) : 0;
        const cnt = Math.min(max, Math.floor((left - reserve) / DENOMS[d]));
        if (cnt <= 0) continue;
        left -= cnt * DENOMS[d];
        const ox = (col % 3) * 0.043 - 0.043, oz = Math.floor(col / 3) * 0.043;
        for (let k = 0; k < cnt && n < B.max - 20; k++) {
          const jitter = ((k * 7919 + d * 131) % 7 - 3) * 0.0006;
          put(B.body, B.dec, n++, base.x + rx * ox + jitter, base.y + CHIP_H / 2 + k * CHIP_H, base.z + rz * ox + oz * 0.2 + jitter, k * 0.7 + d, DENOM_COL[d]);
        }
        col++;
      }
    };
    const st = this.st;
    for (let i = 0; i < this.seats.length; i++) {
      if (!st?.seats[i]) continue;
      const yaw = this._seatYaw(i);
      if (D.stack[i] > 0) stack(this._anchor(i, 'stack', V1), Math.min(D.stack[i], 40000), yaw);
      if (D.bet[i] > 0) stack(this._anchor(i, 'bet', V1), D.bet[i], yaw, 12);
    }
    if (D.pot > 0) stack(this._potSpot(V1), Math.min(D.pot, 60000), 0, 14);
    B.body.count = B.dec.count = n;
    B.body.instanceMatrix.needsUpdate = B.dec.instanceMatrix.needsUpdate = true;
    if (B.body.instanceColor) B.body.instanceColor.needsUpdate = true;
    // las que vuelan: en arco, una detrás de la otra
    const F = this.fly;
    let f = 0;
    for (let j = this.flights.length - 1; j >= 0; j--) {
      const fl = this.flights[j];
      fl.t += dt;
      for (let c = 0; c < fl.n && f < F.max; c++) {
        const k = clamp((fl.t - c * 0.035) / fl.dur, 0, 1);
        if (k <= 0) continue;
        const e = ease(k);
        const x = fl.from.x + (fl.to.x - fl.from.x) * e, z = fl.from.z + (fl.to.z - fl.from.z) * e;
        const y = fl.from.y + (fl.to.y - fl.from.y) * e + Math.sin(Math.PI * k) * 0.08 + CHIP_H / 2 + c * 0.001;
        put(F.body, F.dec, f++, x, y, z, k * 6 + c, fl.color);
      }
      if (fl.t > fl.dur + fl.n * 0.035) {
        this.flights.splice(j, 1);
        fl.land();
        G.sfx?.trigger('chip-lay', fl.to, 0.45);
      }
    }
    F.body.count = F.dec.count = f;
    F.body.instanceMatrix.needsUpdate = F.dec.instanceMatrix.needsUpdate = true;
    if (F.body.instanceColor) F.body.instanceColor.needsUpdate = true;
    // sin nada en el aire, lo que se ve tiene que coincidir con el estado (por si se perdió algún evento)
    if (!this.flights.length && this._chipTarget && !this._payPending()) {
      const T = this._chipTarget;
      for (let i = 0; i < this.seats.length; i++) { D.stack[i] = T.stacks[i]; D.bet[i] = T.bets[i]; }
      D.pot = T.pot;
    }
  }
  _payPending() { return this.st?.phase === 'showdown' && this.st.result && this._paidHand === this.st.handNo && this.disp.pot > 0; }

  // ---------------------------------------------------------------- teclado (lo llama main.js en modo póker)
  // Devuelve true si la tecla era del póker
  key(e, down) {
    if (this.mySeat < 0) return false;
    const st = this.st, me = st?.seats[this.mySeat];
    const myTurn = !!(me && st.turn === this.mySeat && !me.folded && !me.allin && LIVE.includes(st.phase));
    const code = e.code;
    if (code === 'Tab') { this.helpHeld = down; this._hud(); return true; }
    if (!down) {
      if (code === 'KeyF') { this.foldHold = 0; this._hud(); }
      return code === 'KeyF';
    }
    if (e.repeat) return ['Space', 'KeyR', 'KeyF', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(code);
    // sin fichas / afuera por tardar
    if (me && me.chips <= 0 && !me.inHand && code === 'KeyR') { this.net.send({ t: 'pk', a: 'rebuy' }); return true; }
    if (me && me.sitOut && code === 'Space') { this.net.send({ t: 'pk', a: 'sitin' }); return true; }
    if (this.betting) {
      const b = this._betRange();
      if (code === 'Escape' || code === 'Backspace') { this.betting = null; this._hud(); return true; }
      if (code === 'KeyR' || code === 'Enter' || code === 'NumpadEnter' || code === 'Space') { this._confirmBet(); return true; }
      if (code === 'ArrowUp' || code === 'KeyW') { this._stepBet(1); return true; }
      if (code === 'ArrowDown' || code === 'KeyS') { this._stepBet(-1); return true; }
      const presets = { Digit1: b.min, Digit2: this._potFrac(0.5), Digit3: this._potFrac(1), Digit4: b.max };
      if (presets[code] !== undefined) { this.betting.amount = clamp(presets[code], b.min, b.max); G.sfx?.trigger('chip-lay', null, 0.3); this._hud(); return true; }
      return false;
    }
    if (!myTurn) return ['Space', 'KeyR', 'KeyF'].includes(code);
    const toCall = st.currentBet - me.bet;
    if (code === 'Space') { this.act(toCall > 0 ? 'call' : 'check'); return true; }
    if (code === 'KeyR') {
      const b = this._betRange();
      if (b.max <= st.currentBet) { this.act('call'); return true; } // no alcanza para subir: iguala con todo
      this.betting = { amount: b.min };
      G.sfx?.trigger('ui', null, 0.4);
      this._hud();
      return true;
    }
    if (code === 'KeyF') { if (!this.foldHold) this.foldHold = 0.0001; this._hud(); return true; }
    return false;
  }
  // Rueda del mouse mientras elegís la apuesta
  wheel(w) {
    if (!this.betting || !w) return;
    this._stepBet(-Math.sign(w));
  }
  _betRange() {
    const st = this.st, me = st?.seats[this.mySeat];
    const max = (me?.bet || 0) + (me?.chips || 0);
    const min = Math.min(max, st.currentBet + st.minRaise);
    return { min, max };
  }
  _potFrac(f) {
    const st = this.st, me = st.seats[this.mySeat];
    const toCall = st.currentBet - me.bet;
    // subir "medio pozo": igualar y agregar la mitad del pozo que queda después de igualar
    return Math.round((st.currentBet + (st.pot + toCall) * f) / 5) * 5;
  }
  _stepBet(dir) {
    const b = this._betRange();
    const a = this.betting.amount;
    const step = a < 200 ? 10 : a < 1000 ? 50 : a < 5000 ? 100 : 500;
    this.betting.amount = clamp(a + dir * step, b.min, b.max);
    G.sfx?.trigger('chip-lay', null, 0.2);
    this._hud();
  }
  _confirmBet() {
    const b = this._betRange();
    const amt = clamp(this.betting.amount, b.min, b.max);
    if (amt >= b.max) this.act('allin');
    else this.act(this.st.currentBet > 0 ? 'raise' : 'bet', amt);
  }

  // ---------------------------------------------------------------- HUD mínimo (lo demás está en la mesa)
  _ui() {
    const P = document.getElementById('poker');
    if (!P) return;
    P.innerHTML = `
      <div id="pk-banner" class="hidden"></div>
      <div id="pk-line"></div>
      <div id="pk-bet" class="hidden"><small>Subir a</small><b></b><div class="bar"><i></i></div><div class="hint"></div></div>
      <div id="pk-keys"></div>
      <div id="pk-help" class="hidden"><h3>Jugadas, de la mejor a la peor</h3><div class="rows"></div>
        <p>Formás tu jugada con tus 2 cartas y las 5 del medio (las mejores 5 de las 7). Si nadie iguala tu apuesta, ganás sin mostrar.</p></div>`;
    const rows = P.querySelector('#pk-help .rows');
    for (const r of RANKING) {
      const row = document.createElement('div');
      row.className = 'row';
      const cards = document.createElement('span');
      cards.className = 'cards';
      for (const c of r.ex) cards.appendChild(cardCanvas(c, 30));
      row.innerHTML = `<b>${r.name}</b><small>${r.desc}</small>`;
      row.prepend(cards);
      rows.appendChild(row);
    }
    this.panel = P;
  }

  _hud() {
    const P = this.panel;
    if (!P) return;
    const st = this.st;
    const seated = this.mySeat >= 0;
    P.classList.toggle('hidden', !seated);
    if (!seated || !st) return;
    const me = st.seats[this.mySeat];
    const $ = (id) => P.querySelector('#' + id);
    const myTurn = !!(me && st.turn === this.mySeat && !me.folded && !me.allin && LIVE.includes(st.phase));
    const toCall = me ? Math.max(0, st.currentBet - me.bet) : 0;
    // línea de abajo: pozo, tus fichas, lo que tenés
    let mine = '';
    if (this.myCards.length === 2 && me?.inHand && !me.folded) {
      const cards = [...this.myCards, ...st.board];
      mine = cards.length >= 5 ? describeHand(bestHand(cards).score) : preflopText(this.myCards);
    }
    const parts = [];
    if (st.pot > 0) parts.push(`<span>Pozo <b>${fmt(st.pot)}</b></span>`);
    if (me) parts.push(`<span>Tus fichas <b>${fmt(me.chips)}</b></span>`);
    if (mine) parts.push(`<span>Tenés: <b class="hand">${mine}</b></span>`);
    if (!LIVE.includes(st.phase) && st.phase !== 'showdown') parts.push(`<span class="dim">${st.nextAt ? 'Se reparte en un toque…' : 'Esperando que se siente alguien más'}</span>`);
    else if (!myTurn && st.turn >= 0 && st.seats[st.turn]) parts.push(`<span class="dim">Juega ${escape(st.seats[st.turn].name)}…</span>`);
    $('pk-line').innerHTML = parts.join('');
    // teclas (como en RDR2: pocas y claras, abajo a la derecha)
    const K = (k, t, cls = '') => `<div class="k ${cls}"><kbd>${k}</kbd><span>${t}</span></div>`;
    let keys = '';
    if (me && me.chips <= 0 && !me.inHand) keys += K('R', 'Recomprar 2.000 fichas', 'main');
    else if (me?.sitOut) keys += K('Espacio', 'Volver a jugar', 'main');
    else if (myTurn && !this.betting) {
      const b = this._betRange();
      keys += K('Espacio', toCall > 0 ? `Igualar ${fmt(Math.min(toCall, me.chips))}` : 'Pasar', 'main');
      if (b.max > st.currentBet) keys += K('R', st.currentBet > 0 ? 'Subir' : 'Apostar');
      const f = clamp(this.foldHold / 0.45, 0, 1);
      keys += `<div class="k fold${f > 0 ? ' holding' : ''}"><kbd>F</kbd><span>${toCall > 0 ? 'Retirarse' : 'Retirarse (podés pasar gratis)'}</span><i style="width:${Math.round(f * 100)}%"></i></div>`;
      const left = st.deadline ? Math.max(0, Math.ceil((st.deadline - (G.net?.now?.() || Date.now())) / 1000)) : 0;
      if (left) keys += `<div class="timer">${left} s</div>`;
    }
    keys += `<div class="sub">${K('Tab', 'Ver jugadas')}${K('X', 'Levantarse')}</div>`;
    $('pk-keys').innerHTML = keys;
    $('pk-keys').classList.toggle('turn', myTurn);
    // elegir cuánto subir
    const bet = $('pk-bet');
    bet.classList.toggle('hidden', !this.betting);
    if (this.betting) {
      const b = this._betRange();
      const a = clamp(this.betting.amount, b.min, b.max);
      bet.querySelector('small').textContent = a >= b.max ? '¡Con todo!' : st.currentBet > 0 ? 'Subir a' : 'Apostar';
      bet.querySelector('b').textContent = fmt(a);
      bet.querySelector('.bar i').style.width = `${b.max > b.min ? Math.round(((a - b.min) / (b.max - b.min)) * 100) : 100}%`;
      bet.querySelector('.hint').innerHTML = '<kbd>Rueda</kbd>/<kbd>↑↓</kbd> monto · <kbd>1</kbd> mínimo · <kbd>2</kbd> medio pozo · <kbd>3</kbd> pozo · <kbd>4</kbd> todo · <kbd>R</kbd> confirmar · <kbd>Esc</kbd> volver';
    }
    $('pk-help').classList.toggle('hidden', !this.helpHeld);
  }

  // ---------------------------------------------------------------- por frame
  update(camera, dt = 1 / 60) {
    const st = this.st;
    const W = innerWidth, H = innerHeight;
    // retirarse: hay que mantener F (no se tira la mano por un toque sin querer)
    if (this.foldHold > 0) {
      this.foldHold += dt;
      if (this.foldHold >= 0.45) { this.foldHold = 0; this.act('fold'); }
      this._hud();
    }
    // el reloj del turno y el cartel del resultado
    if (this.mySeat >= 0 && st && ((st.turn === this.mySeat && (G.frame % 20) === 0) || this.banner)) this._hud();
    if (this.banner) {
      this.banner.t -= dt;
      const el = this.panel?.querySelector('#pk-banner');
      if (el) {
        el.textContent = this.banner.txt;
        el.classList.toggle('hidden', this.banner.t <= 0 || this.mySeat < 0);
        el.classList.toggle('win', !!this.banner.win);
      }
      if (this.banner.t <= 0) this.banner = null;
    }
    this._stepCards(dt);
    this._drawChips(dt);
    // el botón del que reparte se desliza a su lugar
    if (this.dealerBtn.visible) {
      const p = this.dealerBtn.position;
      if (p.lengthSq() < 1e-6) p.copy(this.dealerPos);
      p.lerp(this.dealerPos, 1 - Math.exp(-6 * dt));
      p.y = this.dealerPos.y + 0.005;
    }
    // resaltado de las cartas ganadoras
    const best = st?.phase === 'showdown' && st.result?.[0]?.best ? new Set(st.result.flatMap((r) => r.best || [])) : null;
    for (const m of [...this.board, ...this.hole.flat()]) {
      const lift = best && m.visible && m.userData.face && best.has(m.userData.face) ? 0.012 : 0;
      m.userData.front.position.y = 0.0006 + lift;
      m.userData.front.material.emissive?.setHex(lift ? 0x2a2208 : 0x000000);
    }
    // parroquianos: sentados, mirando la mesa (y al que juega), con gestos cuando juegan
    for (const [i, b] of this.bots) {
      const seat = this.seats[i];
      if (!seat) continue;
      const root = b.char.root;
      root.position.set(seat.x, seat.y - 0.46, seat.z);
      root.rotation.set(0, seat.yaw, 0);
      if (b.emote) { b.emoteT += dt; if (b.emoteT > (b.emoteEnd || 1.5)) b.emote = null; }
      const turn = st?.turn;
      let headYaw = Math.sin(G.time * 0.4 + i) * 0.25;
      if (turn >= 0 && turn !== i && this.seats[turn]) {
        const t = this.seats[turn];
        const want = Math.atan2(t.x - seat.x, t.z - seat.z);
        headYaw = Math.max(-1, Math.min(1, ((want - seat.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
      }
      b.headYaw = (b.headYaw || 0) + (headYaw - (b.headYaw || 0)) * Math.min(1, dt * 3);
      b.char.animate({ speed: 0, grounded: true, sit: true, table: true, tableArms: !b.emote, aimPitch: -0.3, headYaw: b.headYaw, emote: b.emote, emoteT: b.emoteT }, dt);
      b.char.update(dt);
    }
    // carteles: nombre y fichas de cada uno; el que juega, resaltado; lo que acaba de hacer, un momento
    const near = camera.position.distanceTo(this.table.center) < 9;
    for (let i = 0; i < this.seats.length; i++) {
      const el = this.labels[i];
      const s = st?.seats[i];
      const said = this.said[i];
      if (said.t > 0) said.t -= dt;
      if (!s || !near || i === this.mySeat) { el.classList.add('hidden'); continue; }
      const seat = this.seats[i];
      V1.set(seat.x, seat.y + 1.3, seat.z).project(camera);
      if (V1.z > 1 || V1.z < -1) { el.classList.add('hidden'); continue; }
      el.classList.remove('hidden');
      el.style.transform = `translate(${(V1.x * 0.5 + 0.5) * W}px, ${(-V1.y * 0.5 + 0.5) * H}px) translate(-50%, -100%)`;
      const turn = st.turn === i && LIVE.includes(st.phase);
      el.classList.toggle('turn', turn);
      el.classList.toggle('folded', !!s.folded || !s.inHand);
      const left = turn && st.deadline ? Math.max(0, Math.ceil((st.deadline - (G.net?.now?.() || Date.now())) / 1000)) : 0;
      const html = `<b>${escape(s.name)}</b><span>${fmt(s.chips)}</span>${said.t > 0 ? `<em class="a-${said.act}">${said.txt}</em>` : s.allin ? '<em class="a-allin">Con todo</em>' : ''}${turn ? `<small>${left ? left + ' s' : 'pensando…'}</small>` : ''}`;
      if (el._html !== html) { el.innerHTML = html; el._html = html; }
    }
  }

  // Mirar alrededor con el mouse (sentado: la cabeza gira, el cuerpo no)
  lookAround(dx, dy) {
    this.look.yaw = clamp(this.look.yaw - dx * 0.0022, -1.25, 1.25);
    this.look.pitch = clamp(this.look.pitch - dy * 0.0022, -0.55, 0.45);
  }

  // Cámara en tus ojos: la mesa adelante (tus cartas abajo, el pozo y las comunitarias al medio, los rivales
  // enfrente); el mouse gira la cabeza para mirar a los demás
  cameraPose(camera, dt) {
    if (this.mySeat < 0) return false;
    const seat = this.seats[this.mySeat];
    const c = this.table.center;
    const fx = Math.sin(seat.yaw), fz = Math.cos(seat.yaw);
    const eye = V1.set(seat.x + fx * 0.14, seat.y + 1.1, seat.z + fz * 0.14);
    const k = 1 - Math.exp(-8 * dt);
    camera.position.lerp(eye, k);
    // dirección base: hacia el centro de la mesa, un poco más cerca de mí (se ven bien mis cartas)
    const base = V2.set(c.x - fx * 0.25 - camera.position.x, c.y - camera.position.y, c.z - fz * 0.25 - camera.position.z).normalize();
    const yaw0 = Math.atan2(base.x, base.z), pitch0 = Math.asin(clamp(base.y, -1, 1));
    const yaw = yaw0 + this.look.yaw, pitch = clamp(pitch0 + this.look.pitch, -1.3, 0.6);
    this._lookDir = this._lookDir || new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    this._lookDir.lerp(V2.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)), 1 - Math.exp(-14 * dt)).normalize();
    camera.lookAt(V2.copy(camera.position).add(this._lookDir));
    return true;
  }
}

// Antes del flop: "Par de ochos", "As y rey del mismo palo", "Diez y seis"
const RN = { 2: 'dos', 3: 'tres', 4: 'cuatro', 5: 'cinco', 6: 'seis', 7: 'siete', 8: 'ocho', 9: 'nueve', 10: 'diez', 11: 'jota', 12: 'reina', 13: 'rey', 14: 'as' };
function preflopText([a, b]) {
  const va = RANKS.indexOf(a[0]) + 2, vb = RANKS.indexOf(b[0]) + 2;
  if (va === vb) return describeHand([1, va]);
  const [hi, lo] = va > vb ? [va, vb] : [vb, va];
  const t = `${RN[hi][0].toUpperCase()}${RN[hi].slice(1)} y ${RN[lo]}`;
  return a[1] === b[1] ? `${t} del mismo palo` : t;
}

function escape(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}
