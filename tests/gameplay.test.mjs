// Pruebas del cuerpo y los controles: brazos con peso, piñas, golpes justos, sentado, vida, carteles.
// Rapier y three.js reales; solo se reemplaza lo que dibuja en canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { Physics } from '../public/js/core/physics.js';
import { G } from '../public/js/core/G.js';
import { LocalPlayer, ARMED_PART } from '../public/js/game/player.js';
import { Arm, ARM, stepArm, startScript, startControl, moveControl, chamberLocal } from '../public/js/game/arms.js';
import { PropManager } from '../public/js/game/props.js';
import { World } from '../public/js/world/world.js';
import { TEX } from '../public/js/world/textures.js';
import { PART } from '../public/js/game/ragdoll.js';
import { PokerView } from '../public/js/game/poker.js';
import { fakeMeta } from './ragdoll-bench.mjs';

TEX.grass = () => new THREE.Texture();

test('póker conserva el reparto privado que llega antes del estado público', () => {
  const view = Object.assign(Object.create(PokerView.prototype), {
    st: { handNo: 1 }, mySeat: -1, myCards: [], _syncBots() {}, _render() {},
  });
  view.setCards({ hand: 2, cards: ['As', 'Kh'] });
  view.applyState({ handNo: 2, seats: [], phase: 'preflop' });
  assert.deepEqual(view.myCards, ['As', 'Kh']);
  view.setCards({ hand: 1, cards: ['2c', '3d'] });
  assert.deepEqual(view.myCards, ['As', 'Kh']);
  view.applyState({ handNo: 3, seats: [], phase: 'preflop' });
  assert.deepEqual(view.myCards, []);
});

function stubCharacter() {
  const target = { root: new THREE.Group(), meta: fakeMeta(), grip: { l: 0, r: 0 }, expr: {}, handR: new THREE.Object3D(), handL: new THREE.Object3D() };
  return new Proxy(target, { get: (o, k) => (k in o ? o[k] : () => null) });
}
async function fixture(keys = new Set()) {
  const ph = new Physics(); await ph.init();
  G.phys = ph; G.scene = new THREE.Scene(); G.inGame = true; G.time = 0; G.myId = 1;
  G.players = new Map(); G.settings = { desmadre: false }; G.props = null;
  G.input = { enabled: true, locked: true, key: (k) => keys.has(k), hit: () => false, btn: () => false };
  G.camera = new THREE.PerspectiveCamera();
  new World(G.scene, ph)._ground();
  const p = new LocalPlayer({}, { character: stubCharacter() });
  p.teleport(new THREE.Vector3(0, 0.02, 0), 0);
  return { p, ph };
}
function frame(p, ph, dt = 1 / 60, yaw = 0) { ph.step(dt, (d) => p.physicsStep(d, yaw), () => p.afterPhysics()); G.time += dt; p.update(dt); }

// ------------------------------------------------------------------ brazos (arms.js)
function armCtx(mass = 0) { return { L: 0.6, mass, mouth: new THREE.Vector3(0.15, 0.2, 0.12), wheel: null, guard: false }; }

test('una piña llega estirada rápido y a velocidad de piña real (no teletransporta)', () => {
  const a = new Arm('r');
  a.idle.set(-0.02, -0.56, 0.05);
  stepArm(a, 1 / 60, armCtx());
  startScript(a, 'punch', 0.34, new THREE.Vector3(0.1, 0.05, 0.56));
  let peak = 0, reached = -1, firstJump = 0;
  for (let i = 0; i < 24; i++) {
    const before = a.p.clone();
    stepArm(a, 1 / 60, armCtx());
    firstJump = Math.max(firstJump, before.distanceTo(a.p));
    peak = Math.max(peak, a.speed);
    if (reached < 0 && a.p.z > 0.5) reached = i;
  }
  assert.ok(reached > 0 && reached <= 10, `la piña tardó ${reached} pasos en estirarse`);
  assert.ok(peak > 7 && peak < 14, `velocidad pico ${peak.toFixed(1)} m/s`);
  assert.ok(firstJump < 0.25, `la mano saltó ${firstJump.toFixed(2)} m en un paso`);
});

test('con algo pesado en la mano el brazo es más lento y se pasa de largo', () => {
  const swing = (mass) => {
    const a = new Arm('r');
    a.idle.set(0, -0.5, 0.1);
    stepArm(a, 1 / 60, armCtx(mass));
    a.p.set(-0.3, 0, 0.45); a.pp.copy(a.p); a.v.set(0, 0, 0);
    startControl(a, 0.6);
    a.yaw = 1.2; a.pitch = 0; a.reachWant = 0.92; moveControl(a, 0, 0);
    let t = 0;
    for (let i = 0; i < 120; i++) { stepArm(a, 1 / 60, armCtx(mass)); if (!t && a.p.x < -0.4) t = i; }
    return t;
  };
  const light = swing(0), heavy = swing(5);
  assert.ok(light > 0 && heavy > light * 1.3, `sin carga ${light} pasos, con 5 kg ${heavy}`);
});

test('la mano nunca sale del alcance del brazo ni atraviesa el pecho', () => {
  const a = new Arm('l');
  a.idle.set(0, -0.5, 0.05);
  stepArm(a, 1 / 60, armCtx());
  startControl(a, 0.6);
  for (let i = 0; i < 400; i++) {
    moveControl(a, Math.sin(i * 0.3) * 80, Math.cos(i * 0.21) * 60);
    stepArm(a, 1 / 60, armCtx(2));
    assert.ok(a.p.length() <= 0.6 * 0.99, `fuera de alcance: ${a.p.length()}`);
    const inChest = Math.abs(a.p.x + 0.18) < 0.17 && a.p.y > -0.58 && a.p.y < 0.12 && a.p.z < 0.13 - 1e-6;
    assert.ok(!inChest, 'la mano quedó adentro del pecho');
  }
});

test('mover el mouse más allá del tope del brazo devuelve lo que sobra (gira el cuerpo)', () => {
  const a = new Arm('r');
  a.ready = true; a.w = 1; a.p.set(-0.1, 0, 0.5);
  startControl(a, 0.6);
  a.yaw = ARM.yawMax - 0.01;
  const [ox] = moveControl(a, 200, 0);
  assert.ok(ox > 150, `sobrante ${ox}`);
  const [ox2] = moveControl(a, -10, 0);
  assert.equal(Math.round(ox2), 0);
});

test('la guardia deja los puños adelante de la cara, sin tapar el centro', () => {
  const g = chamberLocal(new Arm('r'), new THREE.Vector3(), 1);
  assert.ok(g.z >= 0.28 && g.y > 0.05 && g.y < 0.2, JSON.stringify(g));
});

// ------------------------------------------------------------------ golpes justos
test('chocarse con alguien que no está pegando no lastima (solo pegan las partes que atacan)', async () => {
  const { p, ph } = await fixture();
  const idle = { proxy: {}, isArmedPart: () => false };
  const armed = { proxy: {}, isArmedPart: (part) => ARMED_PART[part] === 2 };
  assert.equal(p._threat({ kind: 'remote', id: 7, part: PART.TORSO, ref: idle }), null);
  assert.equal(p._threat({ kind: 'remote', id: 7, part: PART.FARM_R, ref: idle }), null);
  const t = p._threat({ kind: 'remote', id: 7, part: PART.FARM_R, ref: armed });
  assert.ok(t && t.src === 'remote' && t.by === 7);
  ph.world.free();
});

test('lo que revoleo yo no me lastima al salir de la mano; lo de otro sí', async () => {
  const { p, ph } = await fixture();
  const pm = Object.create(PropManager.prototype);
  pm.local = p; pm.items = new Map();
  G.props = pm;
  const mine = { type: 'bottle', mass: 0.45, vel: new THREE.Vector3(8, 0, 0), heldBy: 0, thrownAt: performance.now(), thrownBy: 1 };
  const theirs = { ...mine, thrownBy: 9 };
  const resting = { type: 'chair', mass: 2.6, vel: new THREE.Vector3(0.5, 0, 0), heldBy: 0 };
  assert.equal(pm.dangerOf(mine), null, 'mi botella recién soltada no cuenta');
  assert.equal(pm.dangerOf(theirs)?.by, 9);
  assert.equal(pm.dangerOf(resting), null, 'una silla que empujo no es un golpe');
  assert.equal(p._threat({ kind: 'prop', ref: mine }), null);
  G.props = null;
  ph.world.free();
});

test('revolear no rompe la botella al soltarla; un golpe de verdad contra una pared sí', async () => {
  const { p, ph } = await fixture();
  const sent = [];
  const pm = new PropManager({ send: (m) => sent.push(m) }, p);
  G.props = pm;
  ph.box(4, 1.5, 6, 1.5, 1.5, 0.2); // pared a 6 m (lejos del cuerpo del jugador)
  const step = () => ph.step(1 / 60, (d) => pm.physicsStep(d), null);
  // revoleada con G: la velocidad salta de 0 a 14 m/s de golpe (antes eso contaba como impacto)
  const b = pm.addRow([900001, 'bottle', 4, 1.5, 0, 0, 0, 0, 1, 1, 0]);
  assert.ok(b?.dynamic, 'la botella no quedó simulada por mí');
  pm.setVelocity(b, { x: 0, y: 1.5, z: 14 });
  for (let i = 0; i < 12; i++) step();
  assert.ok(pm.items.has(900001), 'se rompió en el aire al revolearla');
  for (let i = 0; i < 40 && pm.items.has(900001); i++) step();
  assert.ok(!pm.items.has(900001), 'no se rompió contra la pared');
  assert.ok(sent.some((m) => m.t === 'pd' && m.id === 900001));
  // consumible revoleado (birra con G): nace con velocidad y no se rompe al salir
  const t = pm.spawnThrow('bottle', new THREE.Vector3(-4, 1.4, -1), new THREE.Vector3(0, 2, -14));
  for (let i = 0; i < 10; i++) step();
  assert.ok(pm.items.has(t.id), 'la birra revoleada se rompió al salir de la mano');
  G.props = null;
  ph.world.free();
});

test('las armas quedan firmes en la mano: a la vista en guardia, con dos manos y sueltan con envión', async () => {
  const { p, ph } = await fixture();
  const pm = new PropManager({ send: () => {} }, p);
  G.props = pm;
  for (let n = 0; n < 20; n++) frame(p, ph);
  const s = pm.addRow([900010, 'sword', 0.05, 0.85, 0.42, 0, 0, 0, 1, 0, 0]);
  G.camera.position.set(0, 1.6, 0.05);
  G.camera.lookAt(0.05, 0.95, 0.42);
  assert.equal(p.toggleGrab('r'), true, 'no agarró la katana');
  for (let n = 0; n < 45; n++) frame(p, ph);
  assert.ok(s.kin, 'no quedó firme en la mano (cinemática)');
  const hand = p.handPos('r', new THREE.Vector3());
  const grip = new THREE.Vector3(0, 0.12, 0).applyQuaternion(s.group.quaternion).add(s.group.position);
  assert.ok(grip.distanceTo(hand) < 0.06, `el mango quedó a ${grip.distanceTo(hand).toFixed(3)} m de la mano`);
  const tip = new THREE.Vector3(0, 1, 0).applyQuaternion(s.group.quaternion);
  assert.ok(tip.y > 0.3 && tip.z > 0.05, `en guardia la hoja no queda arriba y adelante: ${tip.toArray().map((v) => v.toFixed(2))}`);
  // con las dos manos: la izquierda va al mango
  assert.equal(p.toggleGrab('l'), true, 'no la tomó con las dos manos');
  for (let n = 0; n < 45; n++) frame(p, ph);
  const handL = p.handPos('l', new THREE.Vector3());
  const g2 = new THREE.Vector3(0, 0.12 - 0.1, 0).applyQuaternion(s.group.quaternion).add(s.group.position);
  assert.ok(handL.distanceTo(g2) < 0.12, `la mano izquierda quedó a ${handL.distanceTo(g2).toFixed(3)} m del mango`);
  // suelto la izquierda: sigue en la derecha
  p.release('l', false);
  assert.ok(s.kin && p.hands.r.prop === s.id, 'se cayó al soltar una sola mano');
  // revoleo moviendo el brazo: sale con la velocidad de la mano
  p.armControl('r', true);
  for (let n = 0; n < 8; n++) { p.moveArms(-160, -40); frame(p, ph); }
  p.release('r', true);
  const v = s.body.linvel();
  assert.ok(!s.kin && Math.hypot(v.x, v.y, v.z) > 2, `salió a ${Math.hypot(v.x, v.y, v.z).toFixed(2)} m/s`);
  G.props = null;
  ph.world.free();
});

test('afuera de la zona PvP una piña empuja pero no saca vida; adentro sí', async () => {
  const { p, ph } = await fixture();
  const n = new THREE.Vector3(0, 0, 1);
  p._impact(PART.TORSO, 1, { src: 'remote', by: 5, kind: 'blunt' }, new THREE.Vector3(0, 1.2, 0), n);
  assert.equal(p.hp, 100);
  G.settings.desmadre = true;
  p._impact(PART.TORSO, 1, { src: 'remote', by: 5, kind: 'blunt' }, new THREE.Vector3(0, 1.2, 0), n);
  assert.ok(p.hp < 100 && p.hp > 80, `vida ${p.hp}`);
  ph.world.free();
});

test('la guardia de frente frena casi toda la piña', async () => {
  const hit = async (guard) => {
    const { p, ph } = await fixture();
    G.settings.desmadre = true;
    p.guard = guard;
    // golpe de frente: la normal va del atacante (adelante, +z) hacia mí (-z)
    p._impact(PART.HEAD, 1.2, { src: 'remote', by: 5, kind: 'blunt' }, new THREE.Vector3(0, 1.6, 0.1), new THREE.Vector3(0, 0, -1));
    const lost = 100 - p.hp;
    ph.world.free();
    return lost;
  };
  const open = await hit(false), guarded = await hit(true);
  assert.ok(guarded < open * 0.45, `sin guardia ${open.toFixed(1)}, con guardia ${guarded.toFixed(1)}`);
});

// ------------------------------------------------------------------ piña real (cuerpo completo)
test('click corto = piña: la mano derecha sale hacia adelante y queda armada', async () => {
  const { p, ph } = await fixture();
  for (let n = 0; n < 30; n++) frame(p, ph);
  assert.equal(p.tap('r'), 'punch');
  let maxZ = -9, armed = false;
  for (let n = 0; n < 16; n++) {
    frame(p, ph);
    maxZ = Math.max(maxZ, p.arm.r.p.z);
    armed = armed || p.attackFlags() & 2;
  }
  assert.ok(maxZ > 0.45, `alcance ${maxZ.toFixed(2)}`);
  assert.ok(armed, 'la piña no quedó armada para pegar');
  for (let n = 0; n < 40; n++) frame(p, ph);
  assert.equal(p.attackFlags() & 2, 0, 'sigue armada después de la piña');
  ph.world.free();
});

// ------------------------------------------------------------------ sentado
test('sentarse no suelta lo que tenés en la mano y los brazos siguen andando', async () => {
  const { p, ph } = await fixture();
  p.giveItem('beer');
  p.sitAt({ x: 2, y: 0.5, z: 2, yaw: 0 });
  assert.equal(p.state, 'seated');
  assert.equal(p.hands.r.item, 'beer', 'se le cayó la birra al sentarse');
  for (let n = 0; n < 10; n++) frame(p, ph);
  assert.equal(p.tap('r'), 'drink', 'sentado no puede tomar');
  p.armControl('l', true);
  assert.ok(p.arm.l.on, 'sentado no puede mover el brazo');
  ph.world.free();
});

// ------------------------------------------------------------------ vida
test('la vida y la sangre se recuperan solas si nadie te pega', async () => {
  const { p, ph } = await fixture();
  p.hp = 50; p.blood = 60; p.lastHurtT = -100;
  for (let n = 0; n < 60 * 5; n++) frame(p, ph);
  assert.ok(p.hp > 55, `vida ${p.hp.toFixed(1)}`);
  assert.ok(p.blood > 62, `sangre ${p.blood.toFixed(1)}`);
  p.hp = 50; p.damage(1);
  const hp = p.hp;
  for (let n = 0; n < 60 * 2; n++) frame(p, ph);
  assert.ok(Math.abs(p.hp - hp) < 0.01, 'se curó enseguida después de un golpe');
  p.heal(30, { stopBleed: true });
  assert.ok(p.hp > hp + 29);
  ph.world.free();
});

// ------------------------------------------------------------------ controles
test('E y Q solo agarran/sueltan; X es la única tecla de usar el mundo', () => {
  const src = fs.readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');
  const input = src.slice(src.indexOf('function updateInput(dt)'), src.indexOf('function updateCamera(dt)'));
  assert.match(input, /inp\.hit\('KeyX'\)\) interact\(\)/);
  assert.doesNotMatch(input, /inp\.hit\('KeyE'\)\) interact\(\)/);
  const eLine = input.split('\n').find((l) => l.includes("inp.hit('KeyE')"));
  assert.match(eLine, /toggleGrab\('r'\)/);
  const inter = src.slice(src.indexOf('function interact()'), src.indexOf('function nearestSeat()'));
  assert.doesNotMatch(inter, /toggleGrab|release\(/, 'X no debe agarrar ni soltar');
  const ent = fs.readFileSync(new URL('../public/js/game/entities.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ent, /key\('KeyX'\)/, 'en el vehículo X es bajarse, no frenar');
});

// ------------------------------------------------------------------ carteles flotantes
test('los carteles de actividades se esconden detrás de las paredes', async () => {
  const ctx2d = new Proxy({}, { get: (o, k) => (k === 'measureText' ? () => ({ width: 100 }) : () => {}), set: () => true });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
  const { ActivityMarkers } = await import('../public/js/ui/activities.js');
  const m = new ActivityMarkers(new THREE.Scene());
  const cam = new THREE.PerspectiveCamera();
  const ring = m.items.find((i) => i.a.id === 'ring');
  cam.position.set(ring.a.p[0] - 40, 1.7, ring.a.p[2]);
  for (let n = 0; n < 30; n++) m.update(cam, true, () => ({ dist: 5 }));
  assert.equal(ring.s.visible, false, 'se ve a través de la pared');
  for (const it of m.items) it.t = 0; // que vuelva a mirar ya (en el juego lo hace cada ~90 ms)
  for (let n = 0; n < 30; n++) m.update(cam, true, () => null);
  assert.equal(ring.s.visible, true);
  delete globalThis.document;
});

// ------------------------------------------------------------------ vehículos
test('los vehículos tienen volante que gira, ruedas que doblan y pocas mallas', async () => {
  const { buildVehicleModel } = await import('../public/js/game/vehicle-models.js');
  for (const type of ['mower', 'tractor', 'cart']) {
    const g = buildVehicleModel(type, 0x2f8f3a);
    let meshes = 0;
    g.traverse((o) => { if (o.isMesh) meshes++; });
    assert.ok(meshes <= 32, `${type}: ${meshes} mallas`);
    assert.ok(g.userData.steer?.userData.R > 0.1, `${type} sin volante`);
    assert.equal(g.userData.pivots.length, 2, `${type} sin ruedas que doblan`);
  }
});
