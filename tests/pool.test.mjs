import test from 'node:test';
import assert from 'node:assert/strict';
import { rack, simulate, judge, R, TABLE, POCKETS } from '../public/js/shared/pool.js';

const clone = (b) => b.map((x) => ({ ...x }));
test('pool: el triángulo armado sin solaparse, el saque se para solo y la simulación es la misma siempre', () => {
  const b = rack(7);
  for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) assert.ok(Math.hypot(b[i].x - b[j].x, b[i].z - b[j].z) >= 2 * R - 1e-9, `${i}-${j}`);
  assert.equal(new Set(b.map((x) => x.n)).size, 16);
  const a1 = clone(b), a2 = clone(b);
  const r1 = simulate(a1, 0.01, 1), r2 = simulate(a2, 0.01, 1);
  assert.deepEqual(a1, a2, 'determinista');
  assert.equal(r1.ev.length, r2.ev.length);
  assert.ok(r1.t > 1 && r1.t < 25, 'se para: ' + r1.t);
  assert.ok(r1.ev.some((e) => e.k === 'hit' && e.a === 0), 'la blanca le pega al triángulo');
  for (const x of a1) if (x.on) assert.ok(Math.abs(x.x) <= TABLE.W + 1e-9 && Math.abs(x.z) <= TABLE.L + 1e-9);
});

test('pool: una bola derecho a la tronera entra; reglas de la 8, faltas y grupos', () => {
  const balls = rack(1).map((b) => ({ ...b, on: b.n === 0 || b.n === 3 }));
  // la 3 delante de la tronera de la esquina, la blanca atrás en la misma línea
  const [px, pz] = POCKETS[5];
  Object.assign(balls[3], { x: px - 0.25, z: pz - 0.25 }); Object.assign(balls[0], { x: px - 0.6, z: pz - 0.6 });
  const { ev } = simulate(balls, Math.atan2(1, 1), 0.5);
  assert.ok(ev.some((e) => e.k === 'pocket' && e.i === 3), 'la metió');
  // mesa abierta: la que mete define el grupo y sigue tirando
  let g = judge({ cur: 0, grp: [null, null], win: null }, balls, ev);
  assert.deepEqual(g.grp, ['s', 't']); assert.equal(g.cur, 0);
  // meter la blanca: falta, la blanca vuelve, cambia el turno
  const b2 = rack(2);
  b2[0].on = false;
  g = judge({ cur: 0, grp: ['s', 't'], win: null }, b2, [{ k: 'hit', a: 0, b: 1 }, { k: 'pocket', i: 0 }]);
  assert.equal(g.cur, 1); assert.ok(b2[0].on); assert.match(g.msg, /blanca/);
  // la 8 antes de tiempo: pierde
  g = judge({ cur: 1, grp: ['s', 't'], win: null }, rack(3), [{ k: 'hit', a: 0, b: 9 }, { k: 'pocket', i: 8 }]);
  assert.equal(g.win, 0);
  // la 8 con el grupo limpio: gana
  const b4 = rack(4).map((b) => ({ ...b, on: b.n === 0 || b.n < 8 }));
  b4[8].on = false;
  g = judge({ cur: 1, grp: ['s', 't'], win: null }, b4, [{ k: 'hit', a: 0, b: 8 }, { k: 'pocket', i: 8 }]);
  assert.equal(g.win, 1);
});

test('pool en la sala: sumarse, turnos, el tiro lo simula el servidor y el que entra ve la mesa', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const { Room } = await import('../server/room.js');
  const { PROTOCOL, POOL_TABLE } = await import('../public/js/shared/mapdata.js');
  const { rack: rk, simulate: sim } = await import('../public/js/shared/pool.js');
  const room = new Room('test-pool', fs.mkdtempSync(path.join(os.tmpdir(), 'desmadre-')));
  const ws = () => ({ sent: [], ip: '10.8.0.' + Math.floor(Math.random() * 200), bufferedAmount: 0, lastSeen: Date.now(), handlers: {}, on(e, f) { this.handlers[e] = f; }, send(d) { if (typeof d === 'string') this.sent.push(JSON.parse(d)); }, close() {}, ping() {} });
  const say = (w, o) => w.handlers.message(JSON.stringify(o), false);
  const a = ws(), b = ws();
  room.accept(a); say(a, { t: 'join', v: PROTOCOL, name: 'Ana', look: {} });
  room.accept(b); say(b, { t: 'join', v: PROTOCOL, name: 'Beto', look: {} });
  const near = { p: [POOL_TABLE.c[0] + 1, 0, POOL_TABLE.c[2]], y: 0 };
  say(a, { t: 'pool', a: 'join' });
  assert.equal(room.pool.players[0], 0, 'lejos no se suma');
  say(a, { t: 'st', s: near }); say(b, { t: 'st', s: near });
  say(a, { t: 'pool', a: 'join' });
  assert.ok(room.pool.g.solo);
  say(b, { t: 'pool', a: 'join' });
  assert.deepEqual(room.pool.players, [1, 2]); assert.equal(room.pool.g.solo, false);
  say(b, { t: 'pool', a: 'shot', ang: 0, pow: 1 });
  assert.equal(room.pool.n, 0, 'no es su turno');
  const before = room.pool.balls.map((x) => ({ ...x }));
  say(a, { t: 'pool', a: 'shot', ang: 0.01, pow: 1 });
  assert.equal(room.pool.n, 1);
  const msg = b.sent.filter((m) => m.t === 'pool').pop();
  assert.deepEqual(msg.shot.before, before);
  const replay = msg.shot.before.map((x) => ({ ...x })); sim(replay, msg.shot.ang, msg.shot.pow);
  for (const x of replay) if (x.n !== 0) assert.deepEqual([x.x, x.z, x.on], [msg.balls[x.n].x, msg.balls[x.n].z, msg.balls[x.n].on], 'el cliente ve lo mismo');
  const late = ws(); room.accept(late); say(late, { t: 'join', v: PROTOCOL, name: 'Tardío', look: {} });
  assert.equal(late.sent.find((m) => m.t === 'welcome').pool.n, 1);
  say(b, { t: 'pool', a: 'leave' });
  assert.ok(room.pool.g.solo, 'solo queda practicando');
  void rk;
});
