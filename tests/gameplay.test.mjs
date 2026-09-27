// Pruebas del cuerpo y los controles: brazos con peso, piñas, golpes justos, sentado, vida, carteles.
// Rapier y three.js reales; solo se reemplaza lo que dibuja en canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { Physics, RAPIER, GR, groups } from '../public/js/core/physics.js';
import { G } from '../public/js/core/G.js';
import { LocalPlayer, RemotePlayer, ARMED_PART } from '../public/js/game/player.js';
import { Arm, ARM, stepArm, startScript, startControl, moveControl, chamberLocal } from '../public/js/game/arms.js';
import { PropManager } from '../public/js/game/props.js';
import { World } from '../public/js/world/world.js';
import { TEX } from '../public/js/world/textures.js';
import { PART, Ragdoll } from '../public/js/game/ragdoll.js';
import { PoseRig } from '../public/js/char/rig.js';
import { HitReact } from '../public/js/game/react.js';
import { PokerView } from '../public/js/game/poker.js';
import { fakeMeta } from './ragdoll-bench.mjs';

TEX.grass = () => new THREE.Texture();

test('póker conserva el reparto privado que llega antes del estado público', () => {
  const view = Object.assign(Object.create(PokerView.prototype), {
    st: { handNo: 1 }, mySeat: -1, myCards: [], _syncBots() {}, _layout() {}, _hud() {}, _chipFlow() {}, look: {},
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
test('chocarse con alguien no lastima: los golpes de otros llegan solo por su aviso (una sola fuente)', async () => {
  const { p, ph } = await fixture();
  const idle = { proxy: {}, isArmedPart: () => false };
  const armed = { proxy: {}, isArmedPart: (part) => ARMED_PART[part] === 2 };
  assert.equal(p._threat({ kind: 'remote', id: 7, part: PART.TORSO, ref: idle }), null);
  assert.equal(p._threat({ kind: 'remote', id: 7, part: PART.FARM_R, ref: armed }), null, 'el contacto local no debe sumar otro golpe');
  ph.world.free();
});

test('balance de golpes: la patada pega más que la piña, la piña sola no noquea y lo revoleado lastima', async () => {
  const hitWith = async (claim) => {
    const { p, ph } = await fixture();
    G.settings.desmadre = true;
    G.players = new Map([[5, { pos: new THREE.Vector3(0, 0.02, 1.2) }]]);
    p.hitClaim({ id: 5, p: PART.TORSO, x: 0, y: 1.2, z: 0.1, ...claim });
    const out = { lost: 100 - p.hp, state: p.state, push: Math.hypot(p.push.x, p.push.y) };
    G.players = new Map();
    ph.world.free();
    return out;
  };
  const punch = await hitWith({ s: 9, a: 'p' });
  const kick = await hitWith({ s: 7, a: 'k' });
  const head = await hitWith({ s: 3, a: 'h', p: PART.HEAD });
  const bottle = await hitWith({ s: 14, a: 't', w: 'bottle' });
  const chair = await hitWith({ s: 10, a: 't', w: 'chair' });
  const punchHead = await hitWith({ s: 10, a: 'p', p: PART.HEAD });
  assert.ok(kick.lost > punch.lost * 1.3, `patada ${kick.lost.toFixed(1)} vs piña ${punch.lost.toFixed(1)}`);
  assert.ok(kick.push > punch.push, 'la patada empuja más que la piña');
  assert.ok(head.lost > 5, `cabezazo ${head.lost.toFixed(1)}`);
  assert.notEqual(punchHead.state, 'ko', 'una sola piña a la cabeza no debería noquear');
  assert.ok(bottle.lost > 20, `botella revoleada ${bottle.lost.toFixed(1)}`);
  assert.ok(chair.lost > 30 || chair.state === 'ko', `silla revoleada ${chair.lost.toFixed(1)}`);
  G.settings.desmadre = false;
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

test('los jugadores no se atraviesan y un empujón entre cuerpos es suave (nadie sale volando)', async () => {
  const keys = new Set(['KeyW']);
  const { p, ph } = await fixture(keys);
  // otro jugador parado 2 m adelante (su cápsula, como la crea RemotePlayer)
  const other = { standing: true, pos: new THREE.Vector3(0, 0.02, 2), vel: new THREE.Vector3() };
  const body = ph.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.82, 2));
  ph.world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.26).setCollisionGroups(groups(GR.PAWN, GR.ME)), body);
  G.players = new Map([[7, other]]);
  for (let n = 0; n < 150; n++) frame(p, ph);
  assert.ok(p.pos.z < 2 - 0.45, `lo atravesó: z=${p.pos.z.toFixed(2)}`);
  // ahora el otro viene hacia mí a 3 m/s: me corre, pero suave
  keys.clear();
  let maxV = 0;
  for (let n = 0; n < 60; n++) {
    other.pos.z -= 3 / 60; other.vel.set(0, 0, -3);
    body.setNextKinematicTranslation({ x: 0, y: 0.82, z: other.pos.z });
    const z0 = p.pos.z;
    frame(p, ph);
    maxV = Math.max(maxV, Math.abs(p.pos.z - z0) * 60);
  }
  assert.ok(p.pos.z < other.pos.z - 0.4, 'me pasó por encima');
  assert.ok(maxV < 6, `salí volando a ${maxV.toFixed(1)} m/s`);
  G.players = new Map();
  ph.world.free();
});

test('si otro aparece encimado (la red llegó tarde), nos separamos enseguida', async () => {
  const { p, ph } = await fixture();
  // el otro "cae" casi encima de mí (0.12 m): su cápsula está donde se dibuja su cuerpo
  const other = { standing: true, pos: new THREE.Vector3(0.12, 0.02, 0), bodyPos: new THREE.Vector3(0.12, 0.02, 0), vel: new THREE.Vector3() };
  const body = ph.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0.12, 0.82, 0));
  ph.world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.26).setCollisionGroups(groups(GR.PAWN, GR.ME)), body);
  G.players = new Map([[7, other]]);
  let t = 0;
  while (t < 1 && Math.hypot(p.pos.x - 0.12, p.pos.z) < 0.5) { frame(p, ph); t += 1 / 60; }
  assert.ok(t < 0.3, `tardó ${t.toFixed(2)} s en separarse`);
  const d0 = Math.hypot(p.pos.x - 0.12, p.pos.z);
  for (let n = 0; n < 30; n++) frame(p, ph);
  const d1 = Math.hypot(p.pos.x - 0.12, p.pos.z);
  assert.ok(d1 < 1.2, `salió disparado a ${d1.toFixed(2)} m`);
  assert.ok(d1 >= d0 - 0.02, 'se volvió a meter');
  G.players = new Map();
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

// ------------------------------------------------------------------ reacciones a los golpes
// Pose de pie armada con el esqueleto de prueba, mirando a +z (yaw 0)
function standingPose() {
  const rig = new PoseRig(fakeMeta().jointRest);
  rig.place(new THREE.Vector3(0, 0, 0), 0);
  rig.animate({ speed: 0, grounded: true }, 1 / 60);
  return rig.transforms();
}
// punta de la cabeza / del pecho (un punto arriba de la articulación, en mundo)
const tip = (pose, i, up = 0.25) => new THREE.Vector3(0, up, 0).applyQuaternion(new THREE.Quaternion(pose[i][3], pose[i][4], pose[i][5], pose[i][6])).add(new THREE.Vector3(pose[i][0], pose[i][1], pose[i][2]));
function reactAfter(fn, secs) {
  const r = new HitReact();
  fn(r);
  for (let t = 0; t < secs; t += 1 / 60) r.update(1 / 60);
  const pose = standingPose();
  r.apply(pose);
  return { r, pose };
}

test('reacción: una piña de frente a la cara tira la cabeza para atrás y después se acomoda sola', () => {
  const base = standingPose();
  // lo empujan hacia -z (le pegaron de frente)
  const { pose } = reactAfter((r) => r.hit(PART.HEAD, 0, -1, 1, 0, 0.1, 0), 0.08);
  const back = tip(base, PART.HEAD).z - tip(pose, PART.HEAD).z;
  assert.ok(back > 0.04, `la cabeza se fue ${back.toFixed(3)} m para atrás`);
  const { r } = reactAfter((q) => q.hit(PART.HEAD, 0, -1, 1, 0, 0.1, 0), 2.5);
  assert.equal(r.active, false, 'la reacción no se apagó');
});

test('reacción: empujado hacia su izquierda, el torso se va a la izquierda; un golpe en el hombro derecho lo gira', () => {
  const base = standingPose();
  // empujado hacia +x (su izquierda mirando a +z)
  const { pose } = reactAfter((r) => r.hit(PART.TORSO, 1, 0, 1, 0, 0, 0), 0.1);
  assert.ok(tip(pose, PART.TORSO, 0.4).x - tip(base, PART.TORSO, 0.4).x > 0.03, 'el torso no se inclinó hacia donde lo empujaron');
  // piña de frente en el hombro derecho (x < 0): ese hombro va para atrás => el pecho mira a la derecha (-x)
  const { pose: tw } = reactAfter((r) => r.hit(PART.TORSO, 0, -1, 1, -0.2, 0.1, 0), 0.12);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(tw[1][3], tw[1][4], tw[1][5], tw[1][6]));
  assert.ok(fwd.x < -0.05, `el torso no giró a la derecha (fwd.x ${fwd.x.toFixed(3)})`);
});

test('reacción: una patada baja dobla la rodilla de ese lado', () => {
  const base = standingPose();
  const { pose } = reactAfter((r) => r.hit(PART.SHIN_L, 0, -1, 1, 0.09, 0.1, 0), 0.1);
  const q0 = new THREE.Quaternion(base[8][3], base[8][4], base[8][5], base[8][6]);
  const q1 = new THREE.Quaternion(pose[8][3], pose[8][4], pose[8][5], pose[8][6]);
  assert.ok(q0.angleTo(q1) > 0.15, `la rodilla izquierda casi no se movió (${q0.angleTo(q1).toFixed(3)} rad)`);
  const q2 = new THREE.Quaternion(base[10][3], base[10][4], base[10][5], base[10][6]);
  const q3 = new THREE.Quaternion(pose[10][3], pose[10][4], pose[10][5], pose[10][6]);
  assert.ok(q2.angleTo(q3) < q0.angleTo(q1) * 0.5, 'la otra pierna se dobló igual');
});

// ------------------------------------------------------------------ agarrar a otro jugador
async function grabFixture(keys) {
  const { p, ph } = await fixture(keys);
  const meta = fakeMeta();
  const rig = new PoseRig(meta.jointRest);
  // el que agarra, parado adelante mirándome (yaw π)
  const place = (z) => { rig.place(new THREE.Vector3(0, 0.02, z), Math.PI); rig.animate({ speed: 0, grounded: true }, 1 / 60); return rig.transforms(); };
  const proxy = new Ragdoll(ph, meta, { kinematic: true, member: GR.REMOTE, filter: GR.RAGDOLL });
  proxy.build(place(0.75));
  const rp = { id: 5, pos: new THREE.Vector3(0, 0.02, 0.75), yaw: Math.PI, proxy, char: { meta }, standing: true, vel: new THREE.Vector3() };
  G.players = new Map([[5, rp]]);
  const move = (z) => { proxy.teleport(place(z)); rp.pos.z = z; };
  // moverlo como se mueve de verdad (cinemático: tiene velocidad, así se miden los tirones)
  const slide = (z, arm = 0) => {
    const tr = place(z);
    if (arm) { tr[6][2] += arm; tr[5][2] += arm * 0.6; } // su brazo derecho (el que agarra) se va para atrás
    proxy.follow(tr, 1 / 60); rp.pos.z = z;
  };
  // su mano derecha en mi pecho: el ancla es ese punto en el marco de mi torso
  const t = p.rag.bodies[PART.TORSO].translation(), r = p.rag.bodies[PART.TORSO].rotation();
  const inv = new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion(r.x, r.y, r.z, r.w), new THREE.Vector3(1, 1, 1)).invert();
  const a = new THREE.Vector3(0, t.y + 0.15, 0.2).applyMatrix4(inv);
  const events = [];
  p.onEvent = (type, d) => events.push({ type, d });
  p.grabbedByRemote(5, 'r', PART.TORSO, [a.x, a.y, a.z], true);
  return { p, ph, rp, move, slide, events };
}

test('agarrar a otro no lo apaga: sigue de pie y en control, y el tirón lo lleva', async () => {
  const keys = new Set();
  const { p, ph, move } = await grabFixture(keys);
  for (let n = 0; n < 20; n++) frame(p, ph);
  assert.equal(p.state, 'active', 'agarrado no debe quedar KO');
  assert.equal(p.physMode, 'anim', 'agarrado no debe pasar a ragdoll');
  // el que me tiene retrocede: me lleva
  const z0 = p.pos.z;
  for (let n = 0; n < 45; n++) { move(0.75 + n * 0.02); frame(p, ph); }
  assert.ok(p.pos.z > z0 + 0.35, `el tirón no me movió (${(p.pos.z - z0).toFixed(2)} m)`);
  assert.equal(p.state, 'active', 'afuera de la pelea el tirón no derriba');
  G.players = new Map();
  ph.world.free();
});

test('agarrado se puede zafar corriendo para el otro lado', async () => {
  const keys = new Set();
  const { p, ph, events } = await grabFixture(keys);
  for (let n = 0; n < 10; n++) frame(p, ph);
  keys.add('KeyS'); keys.add('ShiftLeft');
  for (let n = 0; n < 90 && p.grabbedBy.size; n++) frame(p, ph);
  assert.equal(p.grabbedBy.size, 0, 'no se zafó');
  assert.ok(events.some((e) => e.type === 'gripbreak' && e.d.to === 5), 'no le avisó al que lo tenía');
  G.players = new Map();
  ph.world.free();
});

test('agarrado: que te arrastren no te tira; unos tirones secos sí (y tirado te sigue arrastrando)', async () => {
  const keys = new Set();
  const { p, ph, slide } = await grabFixture(keys);
  G.settings.desmadre = true;
  for (let n = 0; n < 10; n++) frame(p, ph);
  // lo arrastra caminando para atrás a 2 m/s durante 3 s: sigue de pie (y lo sigue)
  let z = 0.75;
  for (let n = 0; n < 180; n++) { z += 2 / 60; slide(z); frame(p, ph); }
  assert.equal(p.state, 'active', `arrastrarlo lo tiró (equilibrio ${p.balance.toFixed(0)})`);
  assert.ok(p.pos.z > 4, `no lo arrastró (${p.pos.z.toFixed(2)} m)`);
  // tirones secos: SU BRAZO sale disparado para atrás (el cuerpo quieto) y vuelve
  for (let k = 0; k < 8 && p.state === 'active'; k++) {
    for (let n = 0; n < 16; n++) {
      const off = n < 6 ? n * 0.15 : Math.max(0, 0.9 - (n - 6) * 0.09); // un tirón de brazo a ~9 m/s
      slide(z, off); frame(p, ph);
    }
  }
  assert.equal(p.state, 'ko', `los tirones no lo tiraron (equilibrio ${p.balance.toFixed(0)})`);
  // tirado: el agarre sigue (resorte a su mano) y se lo lleva
  assert.equal(p.grabbedBy.size, 1, 'tirado lo soltó');
  const px = () => p.rag.pelvis().translation().z;
  const z1 = px();
  for (let n = 0; n < 60; n++) { z += 2 / 60; slide(z); frame(p, ph); }
  assert.ok(px() > z1 + 0.5, `no lo arrastra tirado (${(px() - z1).toFixed(2)} m)`);
  G.settings.desmadre = false;
  G.players = new Map();
  ph.world.free();
});

test('la mano no se mete en el cuerpo de otro aunque la muevas despacio', async () => {
  const { p, ph } = await fixture();
  const meta = fakeMeta();
  const rig = new PoseRig(meta.jointRest);
  rig.place(new THREE.Vector3(0, 0.02, 0.62), Math.PI);
  rig.animate({ speed: 0, grounded: true }, 1 / 60);
  const proxy = new Ragdoll(ph, meta, { kinematic: true, member: GR.REMOTE, filter: GR.RAGDOLL, tag: { kind: 'remote', id: 5 } });
  proxy.build(rig.transforms());
  for (let n = 0; n < 5; n++) frame(p, ph);
  // brazo derecho controlado, a la altura del pecho, estirándose de a poco hacia el otro
  p.armControl('r', true);
  const a = p.arm.r;
  a.pitch = -0.1; a.yaw = 0.25; a.reachWant = 0.45; a.reach = 0.45;
  let deepest = 0, closest = 9;
  for (let n = 0; n < 150; n++) {
    a.reachWant = Math.min(0.97, a.reachWant + 0.004); a.reach = a.reachWant;
    frame(p, ph);
    const h = p._armWorld('r', new THREE.Vector3());
    if (!h) continue;
    const pr = ph.nearest(h.x, h.y, h.z, groups(0xffff, GR.REMOTE));
    const dd = pr ? Math.hypot(h.x - pr.x, h.y - pr.y, h.z - pr.z) : 9;
    if (pr?.inside) deepest = Math.max(deepest, dd); else closest = Math.min(closest, dd);
  }
  assert.ok(closest < 0.09 || deepest > 0, `la mano ni llegó al otro (${closest.toFixed(2)} m)`);
  assert.ok(deepest < 0.01, `la mano entró ${deepest.toFixed(3)} m en el otro cuerpo`);
  ph.world.free();
});

test('agarrar (mi pantalla): la parte agarrada queda pegada a mi mano al instante y el cuerpo la acompaña', () => {
  const pose = standingPose(); // el otro, mirando a +z en el origen
  const anchor = new THREE.Vector3(0, 0.1, 0.06); // cabeza, adelante
  // mi mano tiró 0.5 m para adelante y un poco abajo
  const t = pose[PART.HEAD];
  const A0 = anchor.clone().applyQuaternion(new THREE.Quaternion(t[3], t[4], t[5], t[6])).add(new THREE.Vector3(t[0], t[1], t[2]));
  const hand = A0.clone().add(new THREE.Vector3(0, -0.25, 0.5));
  const rp = { standing: true, gripViews: [{ part: PART.HEAD, anchor, hand }] };
  RemotePlayer.prototype._gripView.call(rp, pose);
  const t2 = pose[PART.HEAD];
  const A1 = anchor.clone().applyQuaternion(new THREE.Quaternion(t2[3], t2[4], t2[5], t2[6])).add(new THREE.Vector3(t2[0], t2[1], t2[2]));
  assert.ok(A1.distanceTo(hand) < 0.12, `la cabeza quedó a ${A1.distanceTo(hand).toFixed(2)} m de mi mano`);
  assert.ok(pose[PART.PELVIS][2] > 0.1, 'el cuerpo no acompañó el tirón');
});

test('agarrado de una pierna y levantada: la pierna sube hacia la mano y en la pelea lo tira al piso rápido', async () => {
  const keys = new Set();
  const { p, ph, rp, events } = await grabFixture(keys);
  void events;
  G.settings.desmadre = true;
  // lo agarran de la pantorrilla izquierda: ancla en la pantorrilla, mano del otro que sube
  p._clearGrips(false);
  const t = p.rag.bodies[PART.SHIN_L].translation(), r = p.rag.bodies[PART.SHIN_L].rotation();
  const inv = new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion(r.x, r.y, r.z, r.w), new THREE.Vector3(1, 1, 1)).invert();
  const a = new THREE.Vector3(t.x, t.y - 0.1, t.z + 0.07).applyMatrix4(inv);
  p.grabbedByRemote(5, 'r', PART.SHIN_L, [a.x, a.y, a.z], true);
  // la mano del otro (su antebrazo derecho) sube: muevo su proxy hacia arriba de a poco
  const shin0 = p.rag.bodies[PART.SHIN_L].translation().y;
  let lifted = 0, t0 = -1;
  for (let n = 0; n < 120 && p.state === 'active'; n++) {
    const tr = rp.proxy.read();
    for (const o of tr) o[1] += 0.005;
    rp.proxy.teleport(tr);
    frame(p, ph);
    lifted = Math.max(lifted, p.rag.bodies[PART.SHIN_L].translation().y - shin0);
    if (p.state === 'ko' && t0 < 0) t0 = n / 60;
  }
  assert.ok(lifted > 0.04, `la pierna no subió (${lifted.toFixed(3)} m)`);
  assert.equal(p.state, 'ko', `levantarle la pierna no lo tiró (equilibrio ${p.balance.toFixed(0)})`);
  G.settings.desmadre = false;
  G.players = new Map();
  ph.world.free();
});

test('soltar a alguien tironeando lo revolea (en la pelea, al piso)', async () => {
  const keys = new Set();
  const { p, ph } = await grabFixture(keys);
  G.settings.desmadre = true;
  for (let n = 0; n < 5; n++) frame(p, ph);
  p.grabbedByRemote(5, 'r', PART.TORSO, [0, 0, 0], false, [0, 1, 7]);
  assert.equal(p.state, 'ko');
  G.settings.desmadre = false;
  G.players = new Map();
  ph.world.free();
});

test('cortar un miembro no mata en el acto, y el cadáver con miembros cortados cae al piso (no vuela ni queda parado)', async () => {
  const { goreRun } = await import('./gore-bench.mjs');
  const alive = await goreRun(PART.UARM_L, 'none');
  assert.ok(alive.alive, 'sin un brazo se murió en el acto');
  for (const part of [PART.UARM_L, PART.FARM_R, PART.THIGH_L, PART.SHIN_R, PART.HEAD]) {
    const r = await goreRun(part, part === PART.HEAD ? 'none' : 'die');
    assert.ok(r.pelvis[1] < 0.5, `parte ${part}: el cadáver quedó parado (pelvis a ${r.pelvis[1]} m)`);
    assert.ok(Math.hypot(r.pelvis[0], r.pelvis[2]) < 3, `parte ${part}: el cadáver se fue a ${JSON.stringify(r.pelvis)}`);
  }
});
