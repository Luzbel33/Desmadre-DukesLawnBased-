import test from 'node:test';
import assert from 'node:assert/strict';
import { Physics, RAPIER, GR, groups } from '../public/js/core/physics.js';
import { buildTowerInterior, castleStair, UPPER_FLOOR, UPPER_ROOMS } from '../public/js/world/castle-expansion.js';

async function fixture() {
  const phys = new Physics(); await phys.init(); phys.ground();
  const c = { phys, room() {}, mask: { circle() {} }, geo() {}, deco() {}, light() {}, flame() {} };
  c.box = (key, x, y, z, w, h, depth, opts = {}) => {
    assert.ok(w > 0 && h > 0 && depth > 0, `positive collider dimensions: ${key}`);
    if (opts.collide !== false) phys.box(x, y, z, w / 2, h / 2, depth / 2, opts.yaw || 0, { mat: opts.pmat });
  };
  c.cyl = (key, x, y, z, rt, rb, h, n, opts = {}) => { if (opts.collide) phys.cylinder(x, y, z, h / 2, Math.max(rt, rb)); };
  return c;
}

function walker(phys, x, feetY, z) {
  const center = 0.90;
  const body = phys.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, feetY + center, z));
  const collider = phys.world.createCollider(RAPIER.ColliderDesc.capsule(0.56, 0.34).setCollisionGroups(groups(GR.ME, GR.WORLD)), body);
  const controller = phys.world.createCharacterController(0.02);
  controller.enableAutostep(0.35, 0.18, true); controller.enableSnapToGround(0.22);
  controller.setMaxSlopeClimbAngle(50 * Math.PI / 180); controller.setMinSlopeSlideAngle(55 * Math.PI / 180);
  phys.world.step();
  function step(dx, dz) {
    controller.computeColliderMovement(collider, { x: dx, y: -0.045, z: dz }, undefined, groups(GR.ME, GR.WORLD));
    const p = body.translation(), m = controller.computedMovement();
    body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z }); phys.world.step();
  }
  return {
    get pos() { const p = body.translation(); return { x: p.x, y: p.y - center, z: p.z }; },
    go(x, z, max = 160) {
      for (let i = 0; i < max; i++) { const p = this.pos, dx = x - p.x, dz = z - p.z, dist = Math.hypot(dx, dz); if (dist < 0.04) return true; const s = Math.min(0.055, dist) / dist; step(dx * s, dz * s); }
      return false;
    },
  };
}

test('upper-storey ramp climbs smoothly from the original balcony with the real character controller', async () => {
  const c = await fixture();
  c.phys.box(-4.7, 7.85, -114.8, 1.5, 0.15, 0.8);
  c.phys.box(-4.7, UPPER_FLOOR - 0.15, -122, 1.5, 0.15, 0.9);
  castleStair(c, -4.7, -115.25, -121.25, 8, UPPER_FLOOR, 2.45);
  const w = walker(c.phys, -4.7, 8.05, -114.7);
  assert.ok(w.go(-4.7, -122, 220), JSON.stringify(w.pos));
  assert.ok(Math.abs(w.pos.y - UPPER_FLOOR) < 0.09, JSON.stringify(w.pos));
  c.phys.world.free();
});

test('each curtain tower has a capsule-wide ground entrance and a climbable spiral to the wall walk', async () => {
  for (const [x, z] of [[-45, -79], [45, -79], [-45, -131], [45, -131]]) {
    const c = await fixture(); buildTowerInterior(c, x, z, 5.2, 17);
    const tower = c.towerRooms[0], { start, radius, floor, steps } = tower.stair;
    const entrance = walker(c.phys, x + Math.sin(tower.inward) * 6, floor + 0.04, z + Math.cos(tower.inward) * 6);
    assert.ok(entrance.go(x + Math.sin(tower.inward) * 1.35, z + Math.cos(tower.inward) * 1.35), `entrance ${x},${z}: ${JSON.stringify(entrance.pos)}`);
    const w = walker(c.phys, x + Math.sin(start - 0.10) * radius, floor + 0.04, z + Math.cos(start - 0.10) * radius);
    for (let i = 0; i < steps; i++) {
      const a = start + (i + 0.5) * Math.PI * 4 / steps;
      assert.ok(w.go(x + Math.sin(a) * radius, z + Math.cos(a) * radius, 80), `tower ${x},${z}, tread ${i}: ${JSON.stringify(w.pos)}`);
    }
    assert.ok(w.pos.y > 10.8, `tower ${x},${z}: ${JSON.stringify(w.pos)}`);
    c.phys.world.free();
  }
});

test('all upper rooms are inside the existing keep and have distinct interior volumes', () => {
  assert.equal(UPPER_ROOMS.length, 5);
  for (const room of UPPER_ROOMS) {
    assert.ok(room.x0 >= -23.8 && room.x1 <= 23.8 && room.z0 >= -125.8 && room.z1 <= -104.2, room.name);
    assert.ok(room.x1 - room.x0 > 5 && room.z1 - room.z0 > 5, room.name);
  }
  for (let i = 0; i < UPPER_ROOMS.length; i++) for (let j = i + 1; j < UPPER_ROOMS.length; j++) {
    const a = UPPER_ROOMS[i], b = UPPER_ROOMS[j];
    assert.ok(Math.min(a.x1, b.x1) <= Math.max(a.x0, b.x0) || Math.min(a.z1, b.z1) <= Math.max(a.z0, b.z0), `${a.name} / ${b.name}`);
  }
});
