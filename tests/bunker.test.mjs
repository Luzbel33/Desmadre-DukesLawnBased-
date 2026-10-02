import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUB, inClub } from '../public/js/shared/mapdata.js';
import { HALL_DOORS } from '../public/js/world/club-wings.js';

const rooms = Object.entries(CLUB.wings).map(([id, r]) => ({ id, ...r }));
const hall = { id: 'hall', ...CLUB.hall };

test('las alas del Búnker no se pisan entre ellas ni con el club', () => {
  const all = [...rooms, hall];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    assert.ok(ox <= 0.01 || oz <= 0.01, `${a.id} y ${b.id} se superponen`);
  }
});

test('todo el Búnker grande es caminable (dentro de la zona del club)', () => {
  for (const r of rooms) for (const [x, z] of [[r.x0 + 0.5, r.z0 + 0.5], [r.x1 - 0.5, r.z1 - 0.5], [r.x0 + 0.5, r.z1 - 0.5], [r.x1 - 0.5, r.z0 + 0.5]]) assert.ok(inClub(x, z), `${r.id} queda afuera en ${x},${z}`);
});

test('las puertas del club caen dentro de la sala a la que llevan', () => {
  const at = (x, z) => rooms.find((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)?.id;
  const north = HALL_DOORS.north.map(([a, b]) => at((a + b) / 2, CLUB.hall.z0 - 1));
  assert.deepEqual(north, ['cafe', 'vip']);
  const east = HALL_DOORS.east.map(([a, b]) => at(CLUB.hall.x1 + 1, (a + b) / 2));
  assert.deepEqual(east, ['arsenal']);
  const west = HALL_DOORS.west.map(([a, b]) => at(CLUB.hall.x0 - 1, (a + b) / 2));
  assert.deepEqual(west, ['psico']);
  for (const [a, b, y0, y1] of [...HALL_DOORS.north, ...HALL_DOORS.east, ...HALL_DOORS.west]) { assert.ok(Math.abs(b - a) >= 2.2, 'puerta muy angosta'); assert.ok(y0 === 0 && y1 >= 2.5, 'puerta muy baja'); }
});

test('el baile de caño y el de jaula son continuos: sin saltos de pose ni de lugar, tampoco al volver a empezar', async () => {
  const { polePose, polePlace, gogoPose } = await import('../public/js/char/pole-dance.js');
  const step = 126 / 60 / 60; // un cuadro a 60 fps, en tiempos
  const read = (fn, b) => { const J = {}; let y = 0; fn(J, b, (v) => { y = v; }); return { J, y }; };
  for (const fn of [polePose, gogoPose]) {
    let prev = null;
    for (let b = 1000; b < 1160; b += step) {
      const cur = read(fn, b);
      for (const n in cur.J) for (const v of cur.J[n]) assert.ok(Number.isFinite(v), `${n} no es un número en ${b}`);
      if (prev) {
        for (const n in cur.J) for (let i = 0; i < 3; i++) assert.ok(Math.abs(cur.J[n][i] - prev.J[n][i]) < 0.2, `${fn.name}: ${n} salta en el tiempo ${b.toFixed(2)}`);
        assert.ok(Math.abs(cur.y - prev.y) < 0.03, `${fn.name}: la altura salta en ${b.toFixed(2)}`);
      }
      prev = cur;
    }
  }
  let p = null;
  for (let b = 1000; b < 1160; b += step) {
    const c = polePlace(b);
    if (p) {
      assert.ok(Math.abs(c.ang - p.ang) < 0.08, `da un salto alrededor del caño en ${b.toFixed(2)}`);
      assert.ok(Math.abs(Math.atan2(Math.sin(c.face - p.face), Math.cos(c.face - p.face))) < 0.08, `gira de golpe en ${b.toFixed(2)}`);
      assert.ok(Math.abs(c.up - p.up) < 0.02 && Math.abs(c.pl - p.pl) < 0.1 && Math.abs(c.pr - p.pr) < 0.1, `cambia de agarre de golpe en ${b.toFixed(2)}`);
    }
    p = c;
  }
});
