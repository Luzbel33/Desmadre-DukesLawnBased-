// Póker Texas Hold'em (no limit) autoritativo en el servidor.
// Estado público para todos + cartas privadas solo para cada jugador sentado.
import crypto from 'node:crypto';

const RANKS = '23456789TJQKA';
const SUITS = 'shdc';
export const START_CHIPS = 2000;
const SB = 10;
const BB = 20;
const TURN_MS = 25000;
const NEXT_HAND_MS = 6500;
const RUNOUT_MS = 1400;
// Parroquianos del bar: se sientan si en la mesa hay un solo humano (así se puede jugar solo)
const BOT_NAMES = ['Tito', 'La Chola', 'El Ruso', 'Doña Rosa', 'Pocho', 'El Turco', 'Coco', 'La Negra'];
const BOT_THINK = [1100, 2600]; // ms que piensa un parroquiano antes de jugar

function newDeck() {
  const d = [];
  for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  // Fisher-Yates con crypto
  for (let i = d.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ------------------------------------------------------------------ evaluador de manos
const rv = (c) => RANKS.indexOf(c[0]) + 2;
function eval5(cards) {
  const v = cards.map(rv).sort((a, b) => b - a);
  const suits = cards.map((c) => c[1]);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(v)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (v[0] - v[4] === 4) straightHigh = v[0];
    else if (v[0] === 14 && v[1] === 5 && v[4] === 2) straightHigh = 5; // A-2-3-4-5
  }
  const counts = new Map();
  for (const x of v) counts.set(x, (counts.get(x) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const byGroup = groups.flatMap(([r, n]) => Array(n).fill(r));
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...v];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, ...byGroup];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...byGroup];
  if (groups[0][1] === 2) return [1, ...byGroup];
  return [0, ...v];
}
function cmp(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}
export function bestHand(seven) {
  let best = null, bestCards = null;
  const n = seven.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const five = seven.filter((_, i) => i !== a && i !== b);
    const s = eval5(five);
    if (!best || cmp(s, best) > 0) { best = s; bestCards = five; }
  }
  return { score: best, cards: bestCards };
}
const HAND_NAMES = ['Carta alta', 'Par', 'Doble par', 'Trío', 'Escalera', 'Color', 'Full', 'Póker', 'Escalera de color'];
export function handName(score) {
  if (score[0] === 8 && score[1] === 14) return 'Escalera real';
  return HAND_NAMES[score[0]];
}

// ------------------------------------------------------------------ mesa
export class PokerTable {
  constructor(id, nSeats, hooks) {
    this.id = id;
    this.seats = new Array(nSeats).fill(null);
    this.hooks = hooks; // { broadcast(obj), sendTo(pid, obj), sys(msg) }
    this.phase = 'idle';
    this.board = [];
    this.deck = [];
    this.dealer = -1;
    this.turn = -1;
    this.currentBet = 0;
    this.minRaise = BB;
    this.handNo = 0;
    this.deadline = 0;
    this.nextAt = 0;
    this.runoutAt = 0;
    this.result = null;
    this.lastAction = null;
  }

  seatOf(pid) { return this.seats.findIndex((s) => s && s.pid === pid); }
  active() { return this.seats.map((s, i) => (s && s.inHand ? i : -1)).filter((i) => i >= 0); }
  contenders() { return this.seats.map((s, i) => (s && s.inHand && !s.folded ? i : -1)).filter((i) => i >= 0); }

  sit(pid, name, seat, bot = false) {
    if (this.seatOf(pid) >= 0) return false;
    if (seat < 0 || seat >= this.seats.length || this.seats[seat]) return false;
    this.seats[seat] = { pid, name, bot, chips: START_CHIPS, bet: 0, total: 0, folded: false, allin: false, acted: false, inHand: false, cards: [], shown: null, timeouts: 0, sitOut: false };
    this.hooks.sys(bot ? `🃏 ${name} (parroquiano) se sienta a jugar.` : `🃏 ${name} se sentó a la mesa de póker.`);
    if (!bot) this._fillBots();
    this._maybeStart();
    this._publish();
    return true;
  }

  leave(pid) {
    const i = this.seatOf(pid);
    if (i < 0) return;
    const s = this.seats[i];
    if (s.inHand && !s.folded && this.phase !== 'idle' && this.phase !== 'showdown') {
      s.folded = true;
      if (this.turn === i) this._advance();
    }
    s.leaving = true;
    if (!s.inHand || this.phase === 'idle' || this.phase === 'showdown') this.seats[i] = null;
    if (!s.bot) this._fillBots();
    this._checkOnlyOne();
    this._publish();
  }

  // ------------------------------------------------------------------ parroquianos (bots)
  // Con un humano se sientan dos; con dos, uno; con tres o más, se van (entre manos).
  _fillBots() {
    const humans = this.seats.filter((s) => s && !s.bot && !s.leaving).length;
    const bots = this.seats.map((s, i) => (s && s.bot && !s.leaving ? i : -1)).filter((i) => i >= 0);
    const want = humans === 0 ? 0 : humans === 1 ? 2 : humans === 2 ? 1 : 0;
    for (let k = bots.length; k > want; k--) this.leave(this.seats[bots[k - 1]].pid);
    for (let k = bots.length; k < want; k++) {
      const free = this.seats.findIndex((s) => !s);
      if (free < 0) break;
      const used = new Set(this.seats.filter(Boolean).map((s) => s.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) || 'Parroquiano';
      let pid = -1;
      while (this.seatOf(pid) >= 0) pid--;
      this.sit(pid, name, free, true);
    }
  }

  // Qué tan buena es la mano (0 = basura, 1 = imbatible): Chen antes del flop; categoría + proyectos después
  _strength(cards, board) {
    const r = cards.map(rv).sort((a, b) => b - a);
    if (board.length === 0) {
      const hi = (x) => (x === 14 ? 10 : x === 13 ? 8 : x === 12 ? 7 : x === 11 ? 6 : x / 2);
      let chen = hi(r[0]);
      if (r[0] === r[1]) chen = Math.max(chen * 2, 5);
      if (cards[0][1] === cards[1][1]) chen += 2;
      const gap = r[0] - r[1] - 1;
      if (r[0] !== r[1]) chen -= gap <= 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
      if (r[0] !== r[1] && gap <= 1 && r[0] < 12) chen += 1;
      return Math.max(0, Math.min(1, (chen + 1) / 21));
    }
    const { score } = bestHand([...cards, ...board]);
    const base = [0.14, 0.4, 0.62, 0.74, 0.82, 0.87, 0.93, 0.98, 1][score[0]];
    let s = base;
    if (score[0] === 1) s += (score[1] - 8) * 0.018; // par alto vale más
    if (score[0] === 0) s += (score[1] - 10) * 0.012;
    // proyecto de color: 4 del mismo palo con cartas por salir
    if (board.length < 5) {
      const suits = {};
      for (const c of [...cards, ...board]) suits[c[1]] = (suits[c[1]] || 0) + 1;
      if (Object.values(suits).some((n) => n === 4) && score[0] < 5) s += 0.14;
    }
    return Math.max(0, Math.min(1, s));
  }

  _botAct(i) {
    const s = this.seats[i];
    if (!s) return;
    const toCall = this.currentBet - s.bet;
    const pot = this.seats.reduce((a, x) => a + (x && x.inHand ? x.total : 0), 0);
    const st = this._strength(s.cards, this.board);
    const r = Math.random();
    const odds = toCall / Math.max(1, pot + toCall);
    const size = (k) => this.currentBet + Math.max(this.minRaise, Math.round((pot * k) / 10) * 10);
    if (toCall > 0) {
      if (st < odds * 1.1 && r > 0.12) return this.action(s.pid, 'fold');
      if (st > 0.8 && r < 0.55) return this.action(s.pid, 'raise', size(0.7 + Math.random() * 0.5));
      if (st < 0.3 && toCall > s.chips * 0.4 && r > 0.2) return this.action(s.pid, 'fold');
      return this.action(s.pid, 'call');
    }
    if ((st > 0.62 && r < 0.6) || r < 0.07) return this.action(s.pid, 'bet', size(0.45 + Math.random() * 0.4));
    return this.action(s.pid, 'check');
  }

  rebuy(pid) {
    const i = this.seatOf(pid);
    if (i < 0) return;
    const s = this.seats[i];
    if (s.chips > 0 || s.inHand) return;
    s.chips = START_CHIPS;
    this.hooks.sys(`🃏 ${s.name} recompró fichas.`);
    this._maybeStart();
    this._publish();
  }

  _maybeStart() {
    if (this.phase !== 'idle' || this.nextAt) return;
    const ready = this.seats.filter((s) => s && s.chips > 0 && !s.sitOut && !s.leaving);
    if (ready.length >= 2) this.nextAt = Date.now() + 3000;
  }

  _nextSeat(from, pred) {
    const n = this.seats.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      if (pred(this.seats[i], i)) return i;
    }
    return -1;
  }

  _startHand() {
    this.nextAt = 0;
    // limpiar asientos que se fueron
    for (let i = 0; i < this.seats.length; i++) if (this.seats[i]?.leaving) this.seats[i] = null;
    this._fillBots();
    // un parroquiano fundido saca más plata de la billetera
    for (const s of this.seats) {
      if (s?.bot && s.chips <= 0) { s.chips = START_CHIPS; this.hooks.sys(`🃏 ${s.name} saca más plata de la billetera.`); }
    }
    const players = this.seats.filter((s) => s && s.chips > 0 && !s.sitOut);
    if (players.length < 2) { this.phase = 'idle'; this._publish(); return; }
    this.handNo++;
    this.deck = newDeck();
    this.board = [];
    this.result = null;
    this.lastAction = null;
    for (const s of this.seats) {
      if (!s) continue;
      s.bet = 0; s.total = 0; s.folded = false; s.allin = false; s.acted = false; s.cards = []; s.shown = null;
      s.inHand = s.chips > 0 && !s.sitOut;
    }
    this.dealer = this._nextSeat(this.dealer, (s) => s && s.inHand);
    const inHand = this.active();
    const heads = inHand.length === 2;
    const sb = heads ? this.dealer : this._nextSeat(this.dealer, (s) => s && s.inHand);
    const bb = this._nextSeat(sb, (s) => s && s.inHand);
    this._post(sb, SB);
    this._post(bb, BB);
    this.currentBet = BB;
    this.minRaise = BB;
    for (let r = 0; r < 2; r++) for (const i of inHand) this.seats[i].cards.push(this.deck.pop());
    for (const i of inHand) this.hooks.sendTo(this.seats[i].pid, { t: 'pkc', table: this.id, cards: this.seats[i].cards, hand: this.handNo });
    this.phase = 'preflop';
    this.turn = this._nextSeat(bb, (s) => s && s.inHand && !s.folded && !s.allin);
    this.deadline = Date.now() + TURN_MS;
    this.hooks.broadcast({ t: 'pke', table: this.id, e: 'deal' });
    this._publish();
  }

  _post(i, amt) {
    const s = this.seats[i];
    const a = Math.min(amt, s.chips);
    s.chips -= a; s.bet += a; s.total += a;
    if (s.chips === 0) s.allin = true;
  }

  action(pid, act, amount = 0) {
    const i = this.seatOf(pid);
    if (i < 0 || i !== this.turn || !['preflop', 'flop', 'turn', 'river'].includes(this.phase)) return;
    const s = this.seats[i];
    const toCall = this.currentBet - s.bet;
    s.timeouts = 0;
    switch (act) {
      case 'fold':
        s.folded = true;
        break;
      case 'check':
        if (toCall > 0) return;
        break;
      case 'call': {
        if (toCall <= 0) break;
        this._post(i, toCall);
        break;
      }
      case 'raise':
      case 'bet': {
        // amount = apuesta total de la ronda a la que sube
        let target = Math.floor(+amount || 0);
        const maxTarget = s.bet + s.chips;
        const minTarget = this.currentBet + this.minRaise;
        if (target >= maxTarget) target = maxTarget; // all-in
        else if (target < minTarget) return;
        const raiseBy = target - this.currentBet;
        this._post(i, target - s.bet);
        if (target > this.currentBet) {
          if (raiseBy >= this.minRaise) this.minRaise = raiseBy;
          this.currentBet = target;
          for (const j of this.contenders()) if (j !== i && !this.seats[j].allin) this.seats[j].acted = false;
        }
        break;
      }
      case 'allin': {
        const target = s.bet + s.chips;
        const raiseBy = target - this.currentBet;
        this._post(i, s.chips);
        if (target > this.currentBet) {
          if (raiseBy >= this.minRaise) this.minRaise = raiseBy;
          this.currentBet = target;
          for (const j of this.contenders()) if (j !== i && !this.seats[j].allin) this.seats[j].acted = false;
        }
        break;
      }
      default:
        return;
    }
    s.acted = true;
    this.lastAction = { seat: i, act, amount: s.bet };
    this.hooks.broadcast({ t: 'pke', table: this.id, e: act, seat: i, amount: s.bet });
    this._advance();
  }

  _roundDone() {
    const live = this.contenders().filter((j) => !this.seats[j].allin);
    return live.every((j) => this.seats[j].acted && this.seats[j].bet === this.currentBet);
  }

  _checkOnlyOne() {
    if (!['preflop', 'flop', 'turn', 'river'].includes(this.phase)) return false;
    const c = this.contenders();
    if (c.length === 1) { this._award(c); return true; }
    return false;
  }

  _advance() {
    if (this._checkOnlyOne()) return;
    if (this._roundDone()) return this._nextStreet();
    this.turn = this._nextSeat(this.turn, (s) => s && s.inHand && !s.folded && !s.allin && (!s.acted || s.bet < this.currentBet));
    if (this.turn < 0) return this._nextStreet();
    this.deadline = Date.now() + TURN_MS;
    this._publish();
  }

  _nextStreet() {
    for (const s of this.seats) if (s) { s.bet = 0; s.acted = false; }
    this.currentBet = 0;
    this.minRaise = BB;
    const next = { preflop: 'flop', flop: 'turn', turn: 'river', river: 'showdown' }[this.phase];
    if (next === 'showdown') return this._showdown();
    this.phase = next;
    this.deck.pop(); // quemar
    if (next === 'flop') this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    else this.board.push(this.deck.pop());
    this.hooks.broadcast({ t: 'pke', table: this.id, e: 'board' });
    const canAct = this.contenders().filter((j) => !this.seats[j].allin);
    if (canAct.length < 2) {
      // todos all-in: se reparten las cartas que faltan con pausa dramática
      this.turn = -1;
      this.runoutAt = Date.now() + RUNOUT_MS;
      this._publish();
      return;
    }
    this.turn = this._nextSeat(this.dealer, (s) => s && s.inHand && !s.folded && !s.allin);
    this.deadline = Date.now() + TURN_MS;
    this._publish();
  }

  _showdown() {
    this.phase = 'showdown';
    this.turn = -1;
    const c = this.contenders();
    for (const i of c) this.seats[i].shown = this.seats[i].cards;
    this._award(c, true);
  }

  // Reparte el pozo (con pozos laterales)
  _award(contenders, showdown = false) {
    const all = this.seats.map((s, i) => (s && s.inHand ? i : -1)).filter((i) => i >= 0);
    const scores = new Map();
    if (showdown) for (const i of contenders) scores.set(i, bestHand([...this.seats[i].cards, ...this.board]));
    const levels = [...new Set(all.map((i) => this.seats[i].total).filter((v) => v > 0))].sort((a, b) => a - b);
    let prev = 0;
    const winners = new Map();
    let orphan = 0;
    let lastBest = null;
    if (contenders.length === 1) {
      // todos se fueron al mazo: el que queda se lleva todo
      const pot = all.reduce((a, i) => a + this.seats[i].total, 0);
      this.seats[contenders[0]].chips += pot;
      winners.set(contenders[0], pot);
      levels.length = 0;
    }
    for (const lv of levels) {
      let pot = 0;
      for (const i of all) pot += Math.max(0, Math.min(this.seats[i].total, lv) - prev);
      const eligible = contenders.filter((i) => this.seats[i].total >= lv);
      prev = lv;
      if (!pot) continue;
      if (!eligible.length) { orphan += pot; continue; }
      let best = [];
      if (showdown && eligible.length > 1) {
        let top = null;
        for (const i of eligible) {
          const sc = scores.get(i).score;
          if (!top || cmp(sc, top) > 0) { top = sc; best = [i]; } else if (cmp(sc, top) === 0) best.push(i);
        }
      } else best = eligible;
      lastBest = best;
      const share = Math.floor(pot / best.length);
      let rem = pot - share * best.length;
      for (const i of best) {
        const add = share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
        this.seats[i].chips += add;
        winners.set(i, (winners.get(i) || 0) + add);
      }
    }
    if (orphan && lastBest) {
      const share = Math.floor(orphan / lastBest.length);
      for (const i of lastBest) { this.seats[i].chips += share; winners.set(i, (winners.get(i) || 0) + share); }
    }
    this.phase = 'showdown';
    this.turn = -1;
    this.result = [...winners.entries()].map(([i, amt]) => ({
      seat: i, name: this.seats[i].name, amount: amt,
      hand: showdown && scores.get(i) ? handName(scores.get(i).score) : null,
      best: showdown && scores.get(i) ? scores.get(i).cards : null,
    }));
    for (const r of this.result) this.hooks.sys(`🏆 ${r.name} gana ${r.amount} fichas${r.hand ? ' con ' + r.hand : ''}.`);
    this.hooks.broadcast({ t: 'pke', table: this.id, e: 'win' });
    for (const s of this.seats) if (s) { s.bet = 0; s.inHand = s.inHand && !s.leaving; }
    this.nextAt = Date.now() + NEXT_HAND_MS;
    this._publish();
  }

  tick(now) {
    if (this.runoutAt && now >= this.runoutAt) {
      this.runoutAt = 0;
      this._nextStreet();
      return;
    }
    if (this.nextAt && now >= this.nextAt) {
      this.nextAt = 0;
      for (let i = 0; i < this.seats.length; i++) if (this.seats[i]?.leaving) this.seats[i] = null;
      this.phase = 'idle';
      const ready = this.seats.filter((s) => s && s.chips > 0 && !s.sitOut);
      if (ready.length >= 2) this._startHand();
      else this._publish();
      return;
    }
    // turno de un parroquiano: piensa un toque y juega
    const cur = this.turn >= 0 ? this.seats[this.turn] : null;
    if (cur?.bot && ['preflop', 'flop', 'turn', 'river'].includes(this.phase)) {
      if (!this.botAt) this.botAt = now + BOT_THINK[0] + Math.random() * (BOT_THINK[1] - BOT_THINK[0]);
      else if (now >= this.botAt) {
        this.botAt = 0;
        const i = this.turn;
        this._botAct(i);
        // si la jugada no era válida, paga o pasa
        if (this.turn === i && this.seats[i] === cur) this.action(cur.pid, this.currentBet > cur.bet ? 'call' : 'check');
      }
      return;
    }
    this.botAt = 0;
    if (this.turn >= 0 && this.deadline && now > this.deadline) {
      const s = this.seats[this.turn];
      if (!s) { this._advance(); return; }
      s.timeouts++;
      if (s.timeouts >= 2) s.sitOut = true;
      this.action(s.pid, this.currentBet > s.bet ? 'fold' : 'check');
    }
  }

  sitIn(pid) {
    const i = this.seatOf(pid);
    if (i < 0) return;
    this.seats[i].sitOut = false;
    this.seats[i].timeouts = 0;
    this._maybeStart();
    this._publish();
  }

  publicState() {
    const pot = this.seats.reduce((a, s) => a + (s && s.inHand ? s.total : 0), 0);
    return {
      id: this.id,
      phase: this.phase,
      board: this.board,
      pot: this.phase === 'showdown' ? 0 : pot,
      dealer: this.dealer,
      turn: this.turn,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      deadline: this.deadline,
      nextAt: this.nextAt,
      handNo: this.handNo,
      result: this.result,
      last: this.lastAction,
      bb: BB,
      seats: this.seats.map((s) => (s ? {
        pid: s.pid, name: s.name, bot: !!s.bot, chips: s.chips, bet: s.bet, folded: s.folded, allin: s.allin,
        inHand: s.inHand, sitOut: s.sitOut, shown: s.shown, hasCards: s.cards.length > 0 && !s.folded,
      } : null)),
    };
  }

  _publish() {
    this.hooks.broadcast({ t: 'pk', st: this.publicState() });
  }
}
