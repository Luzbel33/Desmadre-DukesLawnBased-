import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, legal, apply, status, isLegal, bestMove, sq } from '../public/js/shared/chess.js';

// FEN -> estado (solo para las pruebas)
function fen(s) {
  const [rows, turn, castle, ep, half] = s.split(' ');
  const b = Array(64).fill('.');
  rows.split('/').forEach((row, k) => { let f = 0; for (const ch of row) { if (/\d/.test(ch)) f += +ch; else b[(7 - k) * 8 + f++] = ch; } });
  return { b: b.join(''), turn, castle: castle === '-' ? '' : castle, ep: ep === '-' ? -1 : sq('abcdefgh'.indexOf(ep[0]), +ep[1] - 1), half: +half || 0 };
}
const perft = (st, d) => (d === 0 ? 1 : legal(st).reduce((n, m) => n + perft(apply(st, m).st, d - 1), 0));

test('ajedrez: perft de la posición inicial y de Kiwipete (enroques, al paso, coronación, jaques)', () => {
  assert.equal(perft(initial(), 1), 20);
  assert.equal(perft(initial(), 2), 400);
  assert.equal(perft(initial(), 3), 8902);
  const kiwi = fen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0');
  assert.equal(perft(kiwi, 1), 48);
  assert.equal(perft(kiwi, 2), 2039);
  const pos3 = fen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0');
  assert.equal(perft(pos3, 3), 2812);
  const pos4 = fen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0');
  assert.equal(perft(pos4, 2), 264);
});

test('ajedrez: mate del pastor, ahogado, jugadas ilegales y la IA come lo que le dejan', () => {
  let st = initial();
  for (const [f, t] of [['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7']]) {
    const m = { f: sq('abcdefgh'.indexOf(f[0]), +f[1] - 1), t: sq('abcdefgh'.indexOf(t[0]), +t[1] - 1) };
    assert.ok(isLegal(st, m), f + t);
    st = apply(st, m).st;
  }
  assert.deepEqual(status(st), { check: true, over: true, result: 'w', why: 'mate' });
  assert.equal(status(fen('7k/5Q2/6K1/8/8/8/8/8 b - - 0')).why, 'ahogado');
  assert.ok(!isLegal(initial(), { f: sq(4, 1), t: sq(4, 4) }), 'el peón no salta tres');
  // la dama negra colgada: el Conde se la come
  const hang = fen('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0');
  const m = bestMove(hang, 3, () => 0);
  assert.deepEqual([m.f, m.t], [sq(3, 1), sq(3, 4)]);
  const t0 = Date.now(); bestMove(initial(), 3); assert.ok(Date.now() - t0 < 1500, 'piensa rápido: ' + (Date.now() - t0) + ' ms');
});

test('ajedrez en la sala: sentarse, turnos, jugadas ilegales, el Conde, mate y levantarse', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const { Room } = await import('../server/room.js');
  const { PROTOCOL, CHESS_BOARDS } = await import('../public/js/shared/mapdata.js');
  const room = new Room('test-chess', fs.mkdtempSync(path.join(os.tmpdir(), 'desmadre-')));
  const ws = () => ({ sent: [], ip: '10.9.0.' + Math.floor(Math.random() * 200), bufferedAmount: 0, lastSeen: Date.now(), handlers: {}, on(e, f) { this.handlers[e] = f; }, send(d) { if (typeof d === 'string') this.sent.push(JSON.parse(d)); }, close() {}, ping() {} });
  const say = (w, o) => w.handlers.message(JSON.stringify(o), false);
  const a = ws(), b = ws();
  room.accept(a); say(a, { t: 'join', v: PROTOCOL, name: 'Ana', look: {} });
  room.accept(b); say(b, { t: 'join', v: PROTOCOL, name: 'Beto', look: {} });
  const B = CHESS_BOARDS[1], near = { p: [B.c[0], B.c[1] - 0.8, B.c[2] - 1], y: 0 };
  // lejos de la mesa no se sienta
  say(a, { t: 'chess', b: B.id, a: 'sit', c: 'w' });
  assert.equal(room.chess.get(B.id).seats.w, 0);
  say(a, { t: 'st', s: near }); say(b, { t: 'st', s: near });
  say(a, { t: 'chess', b: B.id, a: 'sit', c: 'w' });
  say(b, { t: 'chess', b: B.id, a: 'sit', c: 'w' });
  assert.equal(room.chess.get(B.id).seats.w, 1, 'una silla, uno');
  say(b, { t: 'chess', b: B.id, a: 'sit', c: 'b' });
  const mv = (w, f, t) => say(w, { t: 'chess', b: B.id, a: 'move', m: [sq('abcdefgh'.indexOf(f[0]), +f[1] - 1), sq('abcdefgh'.indexOf(t[0]), +t[1] - 1)] });
  mv(b, 'e7', 'e5'); // no es su turno
  assert.equal(room.chess.get(B.id).n, 0);
  mv(a, 'e2', 'e5'); // ilegal
  assert.equal(room.chess.get(B.id).n, 0);
  for (const [w, f, t] of [[a, 'f2', 'f3'], [b, 'e7', 'e5'], [a, 'g2', 'g4'], [b, 'd8', 'h4']]) mv(w, f, t);
  const c = room.chess.get(B.id);
  assert.deepEqual(c.res, { r: 'b', why: 'jaque mate' }, 'mate del loco');
  assert.ok(a.sent.some((m) => m.t === 'sys' && /Beto le ganó a Ana/.test(m.m)));
  // revancha contra el Conde: Beto se levanta, Ana juega con la IA (sus jugadas las valida el servidor igual)
  say(b, { t: 'chess', b: B.id, a: 'leave' });
  say(a, { t: 'chess', b: B.id, a: 'ai', on: 1 });
  assert.equal(c.ai, 'b'); assert.equal(c.n, 0);
  mv(a, 'e2', 'e4');
  say(a, { t: 'chess', b: B.id, a: 'move', ai: 1, m: [sq(4, 6), sq(4, 4)] });
  assert.equal(c.n, 2, 'la jugada del Conde la manda el que juega con él');
  say(a, { t: 'chess', b: B.id, a: 'move', ai: 1, m: [sq(3, 6), sq(3, 4)] });
  assert.equal(c.n, 2, 'pero solo en el turno del Conde');
  // el que entra después ve la partida
  const late = ws(); room.accept(late); say(late, { t: 'join', v: PROTOCOL, name: 'Tardío', look: {} });
  assert.equal(late.sent.find((m) => m.t === 'welcome').chess.find((x) => x.b === B.id).n, 2);
  // levantarse a mitad: pierde
  say(a, { t: 'chess', b: B.id, a: 'leave' });
  assert.equal(c.res.r, 'b'); assert.equal(c.ai, null);
});
