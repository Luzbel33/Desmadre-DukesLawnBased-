import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Room } from '../server/room.js';
import { PROTOCOL } from '../public/js/shared/mapdata.js';
import { START_MONEY, priceOf, RINGS } from '../public/js/shared/economy.js';

const ws = () => ({ sent: [], ip: '10.7.0.' + Math.floor(Math.random() * 200), bufferedAmount: 0, lastSeen: Date.now(), handlers: {}, on(e, f) { this.handlers[e] = f; }, send(d) { if (typeof d === 'string') this.sent.push(JSON.parse(d)); }, close() {}, ping() {} });
const say = (w, o) => w.handlers.message(JSON.stringify(o), false);
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'desmadre-'));

test('plata: billetera inicial, compra con precio, sin fondos y la plata vuelve al reconectar', () => {
  const room = new Room('test-money', mk());
  const a = ws(); room.accept(a); say(a, { t: 'join', v: PROTOCOL, name: 'Ana', look: {} });
  assert.equal(a.sent.find((m) => m.t === 'welcome').money, START_MONEY);
  say(a, { t: 'buy', id: 'beer' });
  assert.deepEqual(a.sent.filter((m) => m.t === 'bought').pop(), { t: 'bought', id: 'beer', ok: 1, price: priceOf('beer'), m: START_MONEY - priceOf('beer'), n: 0 });
  room.players.get(1).money = 3;
  room.players.get(1).buyT = 0;
  say(a, { t: 'buy', id: 'whisky' });
  assert.equal(a.sent.filter((m) => m.t === 'bought').pop().ok, 0, 'sin plata no se vende');
  room.players.get(1).buyT = 0;
  say(a, { t: 'buy', id: 'cosa-gratis' });
  assert.equal(a.sent.filter((m) => m.t === 'bought').pop().ok, 1, 'lo que no tiene precio es gratis');
  assert.equal(room.players.get(1).money, 3);
  a.handlers.close();
  const b = ws(); room.accept(b); say(b, { t: 'join', v: PROTOCOL, name: 'ana', look: {} });
  assert.equal(b.sent.find((m) => m.t === 'welcome').money, 3, 'la billetera es del nombre');
});

test('peleas: se abren apuestas con dos peleando, se cierran con los golpes y el pozo va al ganador', () => {
  const room = new Room('test-fight', mk());
  const [bar] = RINGS;
  const P = [];
  for (const n of ['Ana', 'Beto', 'Caro']) { const w = ws(); room.accept(w); say(w, { t: 'join', v: PROTOCOL, name: n, look: {} }); P.push(w); }
  const inRing = (i, hp = 100, s = 0) => say(P[i], { t: 'st', s: { p: [bar.c[0] + i * 0.5, 0, bar.c[1]], hp, s } });
  inRing(0); inRing(1); say(P[2], { t: 'st', s: { p: [60, 0, 0], hp: 100, s: 0 } });
  const f = room.fights.get('bar');
  room._fightT = 0; room._fightTick(Date.now());
  assert.equal(f.phase, 'open');
  assert.ok(P[2].sent.some((m) => m.t === 'fight' && m.phase === 'open'), 'todos se enteran');
  // Caro apuesta por Beto, Ana por ella misma; fondos insuficientes y montos inventados no valen
  say(P[2], { t: 'bet', ring: 'bar', a: 'place', on: 2, amt: 100 });
  say(P[2], { t: 'bet', ring: 'bar', a: 'place', on: 2, amt: 99999 });
  say(P[0], { t: 'bet', ring: 'bar', a: 'place', on: 1, amt: 50 });
  assert.equal(room.players.get(3).money, 200); assert.equal(room.players.get(1).money, 250);
  // empiezan los golpes: se cierran las apuestas
  inRing(1, 70);
  room._fightT = 0; room._fightTick(Date.now());
  assert.equal(f.phase, 'live');
  say(P[2], { t: 'bet', ring: 'bar', a: 'place', on: 2, amt: 10 });
  assert.equal(room.players.get(3).money, 200, 'con la pelea en marcha no se apuesta');
  // Beto cae KO: gana Ana
  inRing(1, 20, 2);
  room._fightT = 0; room._fightTick(Date.now());
  assert.equal(f.phase, 'idle');
  // pozo 150, todo al que apostó por Ana (ella): 150 + premio 60 + 10% del pozo
  assert.equal(room.players.get(1).money, 250 + 150 + 60 + 15);
  assert.equal(room.players.get(3).money, 200, 'Caro apostó por el perdedor');
  assert.ok(P[0].sent.some((m) => m.t === 'money' && m.d === 150));
});
