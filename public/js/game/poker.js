// Póker en la mesa del bar: cartas y fichas en 3D, etiquetas por asiento y panel de acciones.
// Toda la lógica vive en el servidor (server/poker.js); acá solo se muestra y se mandan acciones.
import * as THREE from 'three';
import { G, hashStr } from '../core/G.js';
import { HumanCharacter } from '../char/human.js';

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
const CW = 128, CH = 180;
const CARD_W = 0.11, CARD_H = 0.154;
const FELT_CLEARANCE = 0.012;

let ATLAS = null;
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
      round(px + 3, py + 3, CW - 6, CH - 6, 12);
      x.fillStyle = '#fbf8ef';
      x.fill();
      x.strokeStyle = '#c9c1ad';
      x.lineWidth = 2;
      x.stroke();
      x.fillStyle = red ? '#c21d2c' : '#15161a';
      x.textAlign = 'center';
      x.font = 'bold 34px Georgia, serif';
      const rt = RANK_TXT[r] || r;
      x.fillText(rt, px + 22, py + 38);
      x.font = '28px Georgia, serif';
      x.fillText(SUIT_CH[s], px + 22, py + 66);
      x.save();
      x.translate(px + CW - 22, py + CH - 38);
      x.rotate(Math.PI);
      x.font = 'bold 34px Georgia, serif';
      x.fillText(rt, 0, 0);
      x.font = '28px Georgia, serif';
      x.fillText(SUIT_CH[s], 0, 28);
      x.restore();
      x.font = (/[JQK]/.test(r) ? 'bold 62px' : '72px') + ' Georgia, serif';
      x.fillText(/[JQK]/.test(r) ? r + SUIT_CH[s] : SUIT_CH[s], px + CW / 2, py + CH / 2 + 24);
    }
  }
  // dorso
  const py = 4 * CH;
  for (let ri = 0; ri < 13; ri++) {
    const px = ri * CW;
    round(px + 3, py + 3, CW - 6, CH - 6, 12);
    x.fillStyle = '#6d1420';
    x.fill();
    x.strokeStyle = '#f2e6c8';
    x.lineWidth = 4;
    round(px + 12, py + 12, CW - 24, CH - 24, 8);
    x.stroke();
    x.strokeStyle = 'rgba(242,230,200,0.35)';
    x.lineWidth = 1.5;
    for (let k = -CH; k < CW; k += 12) { x.beginPath(); x.moveTo(px + 12 + k, py + 12); x.lineTo(px + 12 + k + CH, py + CH - 12); x.stroke(); }
    x.fillStyle = '#f2e6c8';
    x.font = 'bold 22px Georgia, serif';
    x.textAlign = 'center';
    x.fillText('DUQUE', px + CW / 2, py + CH / 2 + 8);
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

function makeCard() {
  const g = new THREE.PlaneGeometry(CARD_W, CARD_H);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: atlas().tex, roughness: 0.55, side: THREE.DoubleSide }));
  m.castShadow = false;
  m.receiveShadow = true;
  setCardFace(m, null);
  return m;
}
function setCardFace(mesh, card) {
  const [ci, ri] = cardUV(card);
  const uv = mesh.geometry.attributes.uv;
  const u0 = ci / 13, u1 = (ci + 1) / 13;
  const v1 = 1 - ri / 5, v0 = 1 - (ri + 1) / 5;
  // PlaneGeometry: (0,1) (1,1) (0,0) (1,0)
  uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
  mesh.userData.card = card;
}

// Carta como imagen para el panel HTML
function cardCanvas(card, scale = 1) {
  const c = document.createElement('canvas');
  c.width = CW * scale;
  c.height = CH * scale;
  const [ci, ri] = cardUV(card);
  c.getContext('2d').drawImage(atlas().canvas, ci * CW, ri * CH, CW, CH, 0, 0, c.width, c.height);
  c.className = 'pk-card';
  return c;
}

const CHIP_COLORS = [0xf2f2ee, 0xc8312b, 0x2a5bd7, 0x2f8f3a, 0x151515];

export class PokerView {
  constructor({ scene, net, tables, seats, onSit, onLeave, onAct, onWin }) {
    this.onWin = onWin; // ({ amount, hand }) gané una mano
    this.scene = scene;
    this.net = net;
    this.table = tables.find((t) => t.id === 'bar') || tables[0];
    this.seats = seats.filter((s) => s.poker).sort((a, b) => a.seatIndex - b.seatIndex);
    this.onSit = onSit;
    this.onLeave = onLeave;
    this.onAct = onAct; // gesto de la mano en la mesa (pasar, pagar, subir, tirarse)
    this.st = null;
    this.myCards = [];
    this.mySeat = -1;
    this.pendingSeat = null;
    this.group = new THREE.Group();
    scene.add(this.group);
    // cartas comunitarias
    this.board = [];
    for (let i = 0; i < 5; i++) {
      const m = makeCard();
      m.visible = false;
      this.group.add(m);
      this.board.push(m);
    }
    // cartas de cada asiento
    this.hole = this.seats.map(() => [makeCard(), makeCard()]);
    for (const pair of this.hole) for (const m of pair) { m.visible = false; this.group.add(m); }
    // fichas (instanciadas)
    const chipGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.006, 16);
    this.chips = new THREE.InstancedMesh(chipGeo, new THREE.MeshStandardMaterial({ roughness: 0.4 }), 900);
    this.chips.count = 0;
    this.chips.castShadow = true;
    this.chips.receiveShadow = true;
    this.chips.frustumCulled = false;
    this.chips.setColorAt(0, new THREE.Color());
    this.group.add(this.chips);
    // botón de dealer
    this.dealerBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 20), new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.4 }));
    this.dealerBtn.visible = false;
    this.group.add(this.dealerBtn);
    // etiquetas
    this.labels = this.seats.map(() => {
      const el = document.createElement('div');
      el.className = 'pk-label hidden';
      document.getElementById('overlay').appendChild(el);
      return el;
    });
    this.panel = document.getElementById('poker');
    this.bots = new Map(); // asiento -> { name, char, emote, emoteT } parroquianos sentados
    this._bindUI();
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

  _botEmote(i, e, secs = 1.6) {
    const b = this.bots.get(i);
    if (b) { b.emote = e; b.emoteT = 0; b.emoteEnd = secs; }
  }

  // posición en la mesa hacia el asiento i (t: 0 centro .. 1 borde)
  _toward(i, t, out = new THREE.Vector3()) {
    const s = this.seats[i];
    const c = this.table.center;
    return out.set(c.x + (s.x - c.x) * t, c.y + FELT_CLEARANCE, c.z + (s.z - c.z) * t);
  }

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
    this.onLeave?.();
    this._render();
  }
  act(act, amt = 0) {
    const me = this.st?.seats[this.mySeat];
    if (!me || this.st.turn !== this.mySeat || me.folded || me.allin || !['preflop', 'flop', 'turn', 'river'].includes(this.st.phase)) return;
    this.net.send({ t: 'pk', a: 'act', act, amt });
    G.sfx?.trigger(act === 'fold' ? 'card-shove' : act === 'check' ? 'ui' : 'chip-lay');
    this.onAct?.(act);
  }

  applyState(st) {
    const prev = this.st;
    this.st = st;
    const myIdx = st.seats.findIndex((s) => s && s.pid === G.myId);
    if (myIdx >= 0 && this.mySeat < 0) {
      this.mySeat = myIdx;
      const seat = this.seats[myIdx];
      this.pendingSeat = null;
      this.onSit?.(seat);
    } else if (myIdx < 0 && this.mySeat >= 0) {
      this.mySeat = -1;
      this.onLeave?.();
    }
    // El reparto privado llega antes del estado público: conservar las cartas de esta mano.
    if (prev && st.handNo !== prev.handNo && this._cardsHand !== st.handNo) this.myCards = [];
    // gané la mano (una sola vez por mano)
    if (st.phase === 'showdown' && st.result && st.handNo !== this._wonHand) {
      this._wonHand = st.handNo;
      const mine = st.result.find((r) => st.seats[r.seat]?.pid === G.myId);
      if (mine) this.onWin?.(mine);
      for (const r of st.result) this._botEmote(r.seat, 'clap', 2);
    }
    this._syncBots();
    this._render();
  }
  setCards(m) {
    if (m.hand < (this.st?.handNo || 0)) return;
    this._cardsHand = m.hand;
    this.myCards = m.cards || [];
    this._render();
  }
  event(m) {
    const pos = this.table.center;
    if (m.seat >= 0) {
      if (m.e === 'fold') this._botEmote(m.seat, 'facepalm', 1.2);
      else if (m.e === 'raise' || m.e === 'bet' || m.e === 'allin') this._botEmote(m.seat, 'point', 1.1);
    }
    switch (m.e) {
      case 'deal': G.sfx?.trigger('shuffle', pos, 0.8); setTimeout(() => G.sfx?.trigger('card-deal', pos, 0.8), 400); break;
      case 'board': G.sfx?.trigger('card-flip', pos, 0.9); break;
      case 'fold': G.sfx?.trigger('card-shove', pos, 0.7); break;
      case 'check': G.sfx?.trigger('ui', pos, 0.4); break;
      case 'call': case 'bet': case 'raise': case 'allin': G.sfx?.trigger('chips', pos, 0.8); break;
      case 'win': G.sfx?.trigger('chips-win', pos, 1); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- 3D + UI
  _render() {
    const st = this.st;
    if (!st) return;
    // comunitarias
    for (let i = 0; i < 5; i++) {
      const m = this.board[i];
      const card = st.board[i];
      m.visible = !!card;
      if (card) {
        setCardFace(m, card);
        const c = this.table.center;
        m.position.set(c.x + (i - 2) * (CARD_W + 0.018), c.y + FELT_CLEARANCE, c.z);
        m.rotation.set(0, 0, 0);
      }
    }
    // cartas de cada jugador
    for (let i = 0; i < this.seats.length; i++) {
      const s = st.seats[i];
      const pair = this.hole[i];
      const show = s && (s.hasCards || s.shown);
      for (let k = 0; k < 2; k++) {
        const m = pair[k];
        m.visible = !!show;
        if (!show) continue;
        const mine = i === this.mySeat && this.myCards.length;
        const face = s.shown ? s.shown[k] : null;
        setCardFace(m, face || null);
        const p = this._toward(i, 0.54, m.position);
        const seat = this.seats[i];
        const yaw = seat.yaw;
        p.x += Math.cos(yaw) * (k - 0.5) * (CARD_W * 0.8);
        p.z -= Math.sin(yaw) * (k - 0.5) * (CARD_W * 0.8);
        p.y += 0.002 + k * 0.001;
        m.rotation.set(0, yaw + (k - 0.5) * 0.15, 0);
        // las mías, apenas levantadas para "espiarlas" (solo yo veo el frente en el panel)
        if (mine && !face) m.position.y += 0.003;
      }
    }
    // fichas
    const mtx = new THREE.Matrix4();
    const col = new THREE.Color();
    let n = 0;
    const stack = (base, amount, spread = 0) => {
      let left = amount;
      const denoms = [500, 100, 25, 5, 1];
      let x = 0;
      for (let d = 0; d < denoms.length && n < 880; d++) {
        const cnt = Math.min(20, Math.floor(left / denoms[d]));
        left -= cnt * denoms[d];
        for (let k = 0; k < cnt && n < 880; k++) {
          mtx.makeTranslation(base.x + x * 0.042 + spread * Math.sin(k), base.y + 0.004 + k * 0.0062, base.z);
          this.chips.setMatrixAt(n, mtx);
          this.chips.setColorAt(n, col.setHex(CHIP_COLORS[d]));
          n++;
        }
        if (cnt) x++;
      }
    };
    for (let i = 0; i < this.seats.length; i++) {
      const s = st.seats[i];
      if (!s) continue;
      stack(this._toward(i, 0.86, new THREE.Vector3()), Math.min(s.chips, 6000));
      if (s.bet) stack(this._toward(i, 0.42, new THREE.Vector3()), s.bet);
    }
    if (st.pot) stack(new THREE.Vector3(this.table.center.x - 0.05, this.table.center.y, this.table.center.z + 0.14), Math.min(st.pot, 8000), 0.004);
    this.chips.count = n;
    this.chips.instanceMatrix.needsUpdate = true;
    if (this.chips.instanceColor) this.chips.instanceColor.needsUpdate = true;
    // dealer
    this.dealerBtn.visible = st.dealer >= 0 && !!st.seats[st.dealer];
    if (this.dealerBtn.visible) {
      const p = this._toward(st.dealer, 0.7, this.dealerBtn.position);
      p.x += 0.12;
      p.y += 0.006;
    }
    this._renderPanel();
  }

  _renderPanel() {
    const st = this.st;
    const P = this.panel;
    if (!P) return;
    const seated = this.mySeat >= 0;
    P.classList.toggle('hidden', !seated);
    if (!seated || !st) return;
    const me = st.seats[this.mySeat];
    const $ = (id) => document.getElementById(id);
    $('pk-info').textContent = st.phase === 'idle'
      ? (st.nextAt ? 'Arranca la próxima mano...' : 'Esperando jugadores (mínimo 2)')
      : `Mano #${st.handNo} · Ciegas ${st.bb / 2}/${st.bb} · Pozo ${st.pot}`;
    const cards = $('pk-cards');
    cards.innerHTML = '';
    for (const c of this.myCards) cards.appendChild(cardCanvas(c, 0.75));
    const board = $('pk-board');
    board.innerHTML = '';
    for (const c of st.board) board.appendChild(cardCanvas(c, 0.65));
    const myTurn = st.turn === this.mySeat && me && !me.folded && !me.allin && ['preflop', 'flop', 'turn', 'river'].includes(st.phase);
    const toCall = me ? Math.max(0, st.currentBet - me.bet) : 0;
    $('pk-actions').classList.toggle('disabled', !myTurn);
    for (const control of $('pk-actions').querySelectorAll('button, input')) control.disabled = !myTurn;
    $('pk-call').textContent = toCall > 0 ? `Pagar ${Math.min(toCall, me?.chips || 0)}` : 'Pasar';
    const minT = Math.min((me?.bet || 0) + (me?.chips || 0), st.currentBet + st.minRaise);
    const maxT = (me?.bet || 0) + (me?.chips || 0);
    const canRaise = myTurn && maxT > st.currentBet;
    for (const id of ['pk-raise', 'pk-amount', 'pk-half', 'pk-pot']) $(id).disabled = !canRaise;
    const slider = $('pk-amount');
    slider.min = minT;
    slider.max = maxT;
    if (this._amountHand !== st.handNo || this._amountTurn !== st.turn || +slider.value < minT || +slider.value > maxT) slider.value = minT;
    this._amountHand = st.handNo;
    this._amountTurn = st.turn;
    $('pk-raise').textContent = st.currentBet > 0 ? `Subir a ${slider.value}` : `Apostar ${slider.value}`;
    $('pk-status').textContent = !me ? '' : me.chips <= 0 && !me.inHand ? 'Te quedaste sin fichas' : me.sitOut ? 'Estás afuera (tiempo agotado)' : myTurn ? '¡Te toca!' : st.turn >= 0 && st.seats[st.turn] ? `Juega ${st.seats[st.turn].name}` : '';
    $('pk-rebuy').classList.toggle('hidden', !(me && me.chips <= 0 && !me.inHand));
    $('pk-sitin').classList.toggle('hidden', !(me && me.sitOut));
    const res = $('pk-result');
    if (st.result && st.phase === 'showdown') {
      res.textContent = st.result.map((r) => `🏆 ${r.name} +${r.amount}${r.hand ? ' · ' + r.hand : ''}`).join('   ');
      res.classList.remove('hidden');
    } else res.classList.add('hidden');
    if (myTurn && !this._wasMyTurn) G.sfx?.trigger('ui-select', null, 0.7);
    this._wasMyTurn = myTurn;
  }

  _bindUI() {
    const $ = (id) => document.getElementById(id);
    if (!$('pk-fold')) return;
    $('pk-fold').onclick = () => this.act('fold');
    $('pk-call').onclick = () => {
      const me = this.st?.seats[this.mySeat];
      const toCall = me ? this.st.currentBet - me.bet : 0;
      this.act(toCall > 0 ? 'call' : 'check');
    };
    $('pk-raise').onclick = () => this.act('raise', +$('pk-amount').value);
    $('pk-amount').oninput = () => this._renderPanel();
    $('pk-half').onclick = () => { $('pk-amount').value = Math.round((this.st?.currentBet || 0) + (this.st?.pot || 0) / 2); this._renderPanel(); };
    $('pk-pot').onclick = () => { $('pk-amount').value = Math.round((this.st?.currentBet || 0) + (this.st?.pot || 0)); this._renderPanel(); };
    $('pk-allin').onclick = () => this.act('allin');
    $('pk-leave').onclick = () => this.leave();
    $('pk-rebuy').onclick = () => this.net.send({ t: 'pk', a: 'rebuy' });
    $('pk-sitin').onclick = () => this.net.send({ t: 'pk', a: 'sitin' });
  }

  // ---------------------------------------------------------------- por frame
  update(camera, dt = 1 / 60) {
    const st = this.st;
    const W = innerWidth, H = innerHeight;
    // parroquianos: sentados, mirando la mesa (y al que habla), con gestos cuando juegan
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
    const near = camera.position.distanceTo(this.table.center) < 9;
    const v = new THREE.Vector3();
    for (let i = 0; i < this.seats.length; i++) {
      const el = this.labels[i];
      const s = st?.seats[i];
      if (!s || !near) { el.classList.add('hidden'); continue; }
      const seat = this.seats[i];
      v.set(seat.x, 1.72, seat.z).project(camera);
      if (v.z > 1 || v.z < -1) { el.classList.add('hidden'); continue; }
      el.classList.remove('hidden');
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * W}px, ${(-v.y * 0.5 + 0.5) * H}px) translate(-50%, -100%)`;
      const turn = st.turn === i;
      el.classList.toggle('turn', turn);
      el.classList.toggle('folded', !!s.folded);
      const last = st.last && st.last.seat === i ? ({ fold: 'TIRA', check: 'PASA', call: 'PAGA', raise: 'SUBE', bet: 'APUESTA', allin: 'ALL-IN' })[st.last.act] : '';
      const timer = turn && st.deadline ? Math.max(0, Math.ceil((st.deadline - (G.net?.now() || Date.now())) / 1000)) : '';
      el.innerHTML = `<b>${escape(s.name)}${st.dealer === i ? ' <i>D</i>' : ''}</b><span>${s.bot ? 'parroquiano · ' : ''}${s.chips} fichas${s.bet ? ' · apuesta ' + s.bet : ''}</span>${s.allin ? '<em>ALL-IN</em>' : last ? `<em>${last}</em>` : ''}${timer !== '' ? `<small>${timer}s</small>` : ''}`;
    }
  }

  // Cámara estilo RDR2: desde tus ojos mirando la mesa. Abajo se ven tus manos y tus cartas, al medio el pozo
  // y las cartas comunitarias, arriba los rivales.
  cameraPose(camera, dt) {
    if (this.mySeat < 0) return false;
    const seat = this.seats[this.mySeat];
    const c = this.table.center;
    const fx = Math.sin(seat.yaw), fz = Math.cos(seat.yaw);
    const eye = new THREE.Vector3(seat.x + fx * 0.12, seat.y + 1.12, seat.z + fz * 0.12);
    const k = 1 - Math.exp(-6 * dt);
    camera.position.lerp(eye, k);
    this._look = this._look || c.clone();
    this._look.lerp(c, k);
    camera.lookAt(this._look);
    return true;
  }
}

function escape(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}
