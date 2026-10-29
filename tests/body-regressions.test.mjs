import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LocalPlayer } from '../public/js/game/player.js';
import { Npc } from '../public/js/game/npc.js';
import { Villagers } from '../public/js/game/villagers.js';
import { G } from '../public/js/core/G.js';
import { alarmPeds, aimedAt } from '../public/js/game/ped-react.js';

test('sprinting into a standing player shoves the runner by momentum, once per contact', async () => {
  const { Balance } = await import('../public/js/game/balance.js');
  G.time = 2; G.settings = { desmadre: false };
  const rp = { id: 2, standing: true, pos: new THREE.Vector3(0, 0, .6), vel: new THREE.Vector3(), capsuleRadius: .28 };
  G.players = new Map([[2, rp]]); G.allNpcs = () => [];
  const p = Object.assign(Object.create(LocalPlayer.prototype), { pos: new THREE.Vector3(), velocity: new THREE.Vector2(0, 7), push: new THREE.Vector2(), capsuleRadius: .28, yaw: 0, state: 'active', bal: new Balance(), hands: { l: {}, r: {} }, onEvent() {}, react: { hit() {} } });
  p._crowd(1 / 60);
  const v1 = p.bal.speed;
  assert.ok(v1 > 1.5, `el que corre tiene que sentir el choque (${v1})`);
  assert.ok(p.bal.vz < 0, 'el choque frena al que corre (hacia atrás)');
  p._crowd(1 / 60);
  assert.equal(p.bal.speed, v1, 'el mismo contacto no se cuenta dos veces');
  G.allNpcs = null;
});

test('grip reach is measured from the body in first and third person', async () => {
  const { gripCandidate } = await import('../public/js/game/grip-target.js');
  const shoulder = new THREE.Vector3(0, 1.4, 0), hand = new THREE.Vector3(0, 1.3, .6);
  const body = { translation: () => ({ x: 0, y: 1.25, z: 1 }), rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }), isValid: () => true };
  const cap = { a: new THREE.Vector3(0, -.2, 0), b: new THREE.Vector3(0, .2, 0), r: .15 };
  for (const camera of [new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(0, 1.4, -5)]) {
    const candidate = gripCandidate(body, cap, hand, shoulder, camera, new THREE.Vector3(0, 0, 1), 1.5, () => true);
    assert.ok(candidate, 'visible reachable limb not selectable');
    assert.ok(candidate.anchor.length() < .5);
  }
  assert.equal(gripCandidate(body, cap, hand, shoulder, new THREE.Vector3(0, 1.4, -5), new THREE.Vector3(0, 0, 1), 1.5, () => false), null, 'must not grab through walls');
  assert.equal(gripCandidate(body, cap, hand, new THREE.Vector3(0, 1, -10), hand, new THREE.Vector3(0, 0, 1), 1.5, () => true), null, 'camera reach must not allow distant grabs');
});

test('ragdoll visibility follows the actual fallen body rather than its old spawn', () => {
  const npc = Object.assign(Object.create(Npc.prototype), { pos: new THREE.Vector3(90, 0, 90), down: 5, dead: false, rag: { alive: true, bodies: [{ translation: () => ({ x: 2, y: .5, z: 3 }) }] } });
  npc.syncRagdollPosition();
  assert.equal(npc.pos.x, 2); assert.equal(npc.pos.z, 3);
});

test('guard patrol and pursuit never move the same character twice per frame', () => {
  G.time = 0;
  const v = Object.assign(Object.create(Villagers.prototype), { _giveLantern() {}, _near: () => null, _brawl(n, dt) { n.pos.z += dt * 3; n.speed = 3; } });
  const n = { pos: new THREE.Vector3(4, 0, -73), data: { aggro: 10 }, speed: 0 };
  const role = v._guard(n, true); role(n, 1 / 30);
  assert.equal(n.pos.x, 4, 'patrol movement was applied on top of pursuit');
  assert.ok(Math.abs(n.pos.z + 72.9) < 1e-9);
});

test('guard patrol speed reflects displacement and does not walk in place at the endpoint', () => {
  G.time = 0;
  const v = Object.assign(Object.create(Villagers.prototype), { _giveLantern() {}, _near: () => null });
  const n = { pos: new THREE.Vector3(4, 0, -73), data: {}, speed: 0, say() {} };
  const role = v._guard(n, true);
  for (let i = 0; i < 2000; i++) {
    const old = n.pos.clone(); role(n, 1 / 60);
    const actual = old.distanceTo(n.pos) * 60;
    assert.ok(Math.abs(actual - n.speed) < .06, 'animation speed differs from guard displacement');
    assert.ok(actual <= 1.11, 'patrol exceeds its speed limit');
  }
});


test('scripted performers keep their routines while ordinary pedestrians react to danger', () => {
  const oldNpcs = G.allNpcs;
  const actor = { name: 'DJ', scripted: true, char: {}, pos: new THREE.Vector3(), emote: 'dj' };
  const pedestrian = { name: 'Vecino', char: {}, pos: new THREE.Vector3(1, 0, 0), _brave: .5 };
  G.allNpcs = () => [actor, pedestrian];
  try {
    alarmPeds(new THREE.Vector3(), 'shot');
    assert.equal(actor.react, undefined); assert.equal(actor.emote, 'dj');
    assert.ok(pedestrian.react && ['flee', 'cower'].includes(pedestrian.react.mode));
    aimedAt(actor, new THREE.Vector3());
    assert.equal(actor.react, undefined);
  } finally { G.allNpcs = oldNpcs; }
});
