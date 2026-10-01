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
