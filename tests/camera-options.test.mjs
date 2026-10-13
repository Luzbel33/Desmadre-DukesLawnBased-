import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { CameraBoom } from '../public/js/core/camera-boom.js';
import { Physics } from '../public/js/core/physics.js';

// Exercise the actual monolithic camera function rather than a copy of its math.
const source = fs.readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const start = source.indexOf('function updateCamera(dt) {');
const end = source.indexOf('// Sacudón de la cámara:', start);
assert.ok(start > 0 && end > start, 'camera function boundary changed');
function pose(shoulder, mode = 0, yaw = 0, wall = false) {
  let headVisible = true, rays = 0;
  const char = { meta: { height: 1.8 }, headWorld: out => out.set(0, 1.6, 0), setVisibleHead: v => { headVisible = v; } };
  const state = { mode: 'game', local: { state: 'active', char, pos: new THREE.Vector3(), renderPos: new THREE.Vector3() }, viewPitch: 0, viewYaw: yaw, cameraMode: mode };
  const G = { camera: new THREE.PerspectiveCamera(72), opts: { cameraShoulder: shoulder }, phys: { world: { castShape: () => { rays++; return wall !== false ? { time_of_impact: wall === true ? .32 : wall } : null; } } }, time: 0 };
  const update = new Function('THREE', 'G', 'state', 'tmpV', 'tmpV2', 'groups', 'GR', 'stepCamKick', 'camKick', 'cameraBoom', source.slice(start, end) + '\nreturn updateCamera;')(THREE, G, state, new THREE.Vector3(), new THREE.Vector3(), () => 0, { WORLD: 1 }, () => {}, { a: new THREE.Vector3() }, new CameraBoom());
  update(1);
  return { camera: G.camera, headVisible, rays };
}

test('both third-person distances select left, center and right relative to view yaw', () => {
  for (const mode of [0, 1]) for (const yaw of [0, Math.PI / 2, Math.PI, -.6]) {
    const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    const left = pose('left', mode, yaw).camera.position.dot(right);
    const center = pose('center', mode, yaw).camera.position.dot(right);
    const shoulder = pose('right', mode, yaw).camera.position.dot(right);
    assert.ok(left < -.2, 'left shoulder must be on the camera-left side');
    assert.ok(Math.abs(center) < 1e-5, 'center selection still has a shoulder offset');
    assert.ok(shoulder > .2, 'right shoulder must mirror the left, not rotate aim');
    assert.ok(Math.abs(left + shoulder) < 1e-5);
  }
});

test('shoulder selection never displaces first-person or frontal inspection cameras', () => {
  for (const mode of [2, 3]) {
    const left = pose('left', mode), right = pose('right', mode);
    assert.ok(left.camera.position.distanceTo(right.camera.position) < 1e-6);
    assert.equal(left.headVisible, mode !== 2);
  }
});

test('wall obstruction checks still constrain every third-person shoulder', () => {
  for (const side of ['left', 'center', 'right']) {
    const result = pose(side, 0, 0, true);
    assert.equal(result.rays, 2, 'resolve the desired boom and close-body eye view');
    assert.ok(result.camera.position.distanceTo(new THREE.Vector3(0, 1.62, 0)) < .51);
  }
});

test('a compressed shoulder camera keeps facing forward, including zero wall clearance', () => {
  for (const side of ['left', 'center', 'right']) for (const distance of [.32, 0]) {
    const result = pose(side, 0, 0, distance);
    assert.ok(result.camera.getWorldDirection(new THREE.Vector3()).z > .999, 'the shoulder offset cannot rotate the view sideways in narrow rooms');
    assert.equal(result.headVisible, false, 'the head must not fill the compressed camera');
  }
});

test('camera preference persists locally and malformed or unavailable storage preserves legacy framing', async () => {
  const { readCameraShoulder, setupCameraShoulder } = await import('../public/js/ui/camera-options.js');
  const values = new Map(); const storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) };
  assert.equal(readCameraShoulder(storage), 'left');
  const control = new EventTarget(), options = {};
  setupCameraShoulder(control, options, storage);
  for (const side of ['right', 'center', 'left']) {
    control.value = side; control.dispatchEvent(new Event('change'));
    assert.equal(options.cameraShoulder, side); assert.equal(readCameraShoulder(storage), side);
  }
  control.value = '__proto__'; control.dispatchEvent(new Event('change'));
  assert.equal(control.value, 'left'); assert.equal(options.cameraShoulder, 'left');
  values.set('dukes.camera.shoulder', 'corrupt'); assert.equal(readCameraShoulder(storage), 'left');
  const unavailable = { getItem() { throw Error('Storage disabled'); }, setItem() { throw Error('Storage disabled'); } };
  assert.equal(readCameraShoulder(unavailable), 'left');
  const input = new EventTarget(), opts = {};
  setupCameraShoulder(input, opts, unavailable); input.value = 'right'; input.dispatchEvent(new Event('change'));
  assert.equal(opts.cameraShoulder, 'right');
});

test('front view aims where the body looks, not back at the player (shots, fire breath, throws)', () => {
  const s = source.indexOf('function syncAim() {'), e = source.indexOf('\n}\n', s) + 3;
  assert.ok(s > 0 && e > s, 'syncAim boundary changed');
  for (const yaw of [0, Math.PI / 2, 2.4]) {
    const char = { meta: { height: 1.8 }, headWorld: out => out.set(0, 1.6, 0), setVisibleHead() {} };
    const state = { mode: 'game', local: { state: 'active', char, pos: new THREE.Vector3(), renderPos: new THREE.Vector3() }, viewPitch: 0.2, viewYaw: yaw, cameraMode: 3 };
    const G = { camera: new THREE.PerspectiveCamera(72), aimCam: new THREE.PerspectiveCamera(72), opts: { cameraShoulder: 'left' }, phys: { world: { castShape: () => null } }, time: 0 };
    const update = new Function('THREE', 'G', 'state', 'tmpV', 'tmpV2', 'groups', 'GR', 'stepCamKick', 'camKick', '$', 'cameraBoom', source.slice(start, end) + source.slice(s, e) + '\nreturn [updateCamera, syncAim];')(THREE, G, state, new THREE.Vector3(), new THREE.Vector3(), () => 0, { WORLD: 1 }, () => {}, { a: new THREE.Vector3() }, () => null, new CameraBoom());
    for (let i = 0; i < 40; i++) update[0](1 / 60);
    update[1]();
    const want = new THREE.Vector3(Math.sin(yaw) * Math.cos(0.2), Math.sin(0.2), Math.cos(yaw) * Math.cos(0.2));
    const cam = G.camera.getWorldDirection(new THREE.Vector3()), aim = G.aimCam.getWorldDirection(new THREE.Vector3());
    assert.ok(cam.dot(want) < -0.5, 'the front camera looks back at the player');
    assert.ok(aim.dot(want) > 0.999, 'aim must follow the body view direction');
    assert.ok(G.aimCam.position.distanceTo(new THREE.Vector3(0, 1.6, 0)) < 0.2, 'aim starts at the head');
    state.cameraMode = 0; update[0](1 / 60); update[1]();
    assert.ok(G.aimCam.position.distanceTo(G.camera.position) < 1e-9 && G.aimCam.quaternion.angleTo(G.camera.quaternion) < 1e-6, 'other views aim with the camera');
  }
});

test('the view wheel stores the shoulder exactly like the pause option', async () => {
  const { readCameraShoulder, setCameraShoulder } = await import('../public/js/ui/camera-options.js');
  const values = new Map(); const storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) };
  const control = { value: 'left' }, options = { cameraShoulder: 'left' };
  assert.equal(setCameraShoulder('right', control, options, storage), true);
  assert.equal(control.value, 'right'); assert.equal(options.cameraShoulder, 'right'); assert.equal(readCameraShoulder(storage), 'right');
  assert.equal(setCameraShoulder('__proto__', control, options, storage), false);
  assert.equal(options.cameraShoulder, 'right');
});

test('camera volume stops before a nearby thin wall instead of forcing a minimum boom through it', async () => {
  const physics = new Physics(); await physics.init();
  try {
    physics.box(0, 1.62, -0.3, 2, 2, 0.025); physics.world.step();
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05);
    const pivot = new THREE.Vector3(0, 1.62, 0), boom = new CameraBoom();
    boom.update(camera, pivot, new THREE.Vector3(0, 1.62, -4), physics, 1 / 60, 0);
    assert.ok(camera.position.z > -0.1 && camera.position.z <= 0, 'the near plane must stay on the player side of the wall');
  } finally { physics.world.free(); }
});

test('camera volume catches door edges missed by a center ray', async () => {
  const physics = new Physics(); await physics.init();
  try {
    physics.box(0.2, 1.62, -1, 0.08, 1, 0.08); physics.world.step();
    assert.equal(physics.raycast(0, 1.62, 0, 0, 0, -1, 4), null);
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05), boom = new CameraBoom();
    boom.update(camera, new THREE.Vector3(0, 1.62, 0), new THREE.Vector3(0, 1.62, -4), physics, 1 / 60, 0);
    assert.ok(camera.position.z > -1 && camera.position.z < -0.5, 'door edge should shorten the boom even though the center ray is clear');
  } finally { physics.world.free(); }
});

test('smoothing between clear camera positions cannot sweep through a corner', async () => {
  const physics = new Physics(); await physics.init();
  try {
    physics.box(0, 1.62, -1.5, 0.3, 1, 0.3); physics.world.step();
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05), boom = new CameraBoom();
    const pivot = new THREE.Vector3(0, 1.62, 0);
    boom.mode = 0; boom.previousPivot.copy(pivot); camera.position.set(-2, 1.62, -2);
    boom.position.copy(camera.position);
    boom.update(camera, pivot, new THREE.Vector3(2, 1.62, -2), physics, Math.log(2) / 16, 0);
    assert.ok(camera.position.z > -1.02, 'the interpolated camera must not end behind the corner');
    assert.ok(Math.abs(camera.position.x) < 0.01);
  } finally { physics.world.free(); }
});

test('camera compression releases smoothly and teleports never retain the old camera position', async () => {
  const physics = new Physics(); await physics.init();
  try {
    const wall = physics.box(0, 1.62, -1.5, 2, 2, 0.1); physics.world.step();
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05), boom = new CameraBoom();
    const pivot = new THREE.Vector3(0, 1.62, 0), desired = new THREE.Vector3(0, 1.62, -4);
    boom.update(camera, pivot, desired, physics, 1 / 60, 0);
    const compressed = camera.position.z;
    physics.world.removeCollider(wall, false); physics.world.step();
    boom.update(camera, pivot, desired, physics, 1 / 60, 0);
    assert.ok(camera.position.z < compressed && camera.position.z > -3, 'recovery should ease outward');
    pivot.x += 100; desired.x += 100;
    boom.update(camera, pivot, desired, physics, 1 / 60, 0);
    assert.ok(camera.position.distanceTo(desired) < 1e-6, 'teleport must clear camera lag immediately');
  } finally { physics.world.free(); }
});

test('tight walls move the camera into the eyes and clearing them restores the full boom', async () => {
  const physics = new Physics(); await physics.init();
  try {
    const wall = physics.box(0, 1.62, -0.6, 2, 2, 0.05); physics.world.step();
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05), boom = new CameraBoom();
    const pivot = new THREE.Vector3(0, 1.62, 0), eyes = new THREE.Vector3(0, 1.63, 0.1), desired = new THREE.Vector3(0, 1.62, -4);
    for (let frame = 0; frame < 30; frame++) {
      boom.update(camera, pivot, desired, physics, 1 / 60, 0);
      assert.equal(boom.focusAtEyes(camera, pivot, eyes, physics), 1);
      assert.ok(camera.position.distanceTo(eyes) < 1e-6, 'the compressed view cannot remain inside the back');
    }
    physics.world.removeCollider(wall, false); physics.world.step();
    let blend;
    for (let frame = 0; frame < 40; frame++) {
      boom.update(camera, pivot, desired, physics, 1 / 60, 0);
      blend = boom.focusAtEyes(camera, pivot, eyes, physics);
    }
    assert.equal(blend, 0, 'the eye transition cannot latch permanently');
    assert.ok(camera.position.distanceTo(desired) < 0.001, 'full third-person framing must return');
  } finally { physics.world.free(); }
});

test('the close-body eye transition cannot pass through a low ceiling', async () => {
  const physics = new Physics(); await physics.init();
  try {
    physics.box(0, 1.62, -0.6, 2, 2, 0.05);
    physics.box(0, 2, 0, 2, 0.1, 2); physics.world.step();
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05), boom = new CameraBoom();
    const pivot = new THREE.Vector3(0, 1.62, 0);
    boom.update(camera, pivot, new THREE.Vector3(0, 1.62, -4), physics, 1 / 60, 0);
    boom.focusAtEyes(camera, pivot, new THREE.Vector3(0, 2.3, 0.1), physics);
    assert.ok(camera.position.y < 1.72, 'the camera sphere must remain below the ceiling');
    assert.ok(camera.position.y >= pivot.y);
  } finally { physics.world.free(); }
});

test('camera motion follows live system changes, preserves explicit choices and removes listeners', async () => {
  const { setupCameraMotion, readCameraMotion } = await import('../public/js/ui/camera-options.js');
  const values = new Map(), storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) };
  const control = new EventTarget(), media = new EventTarget(), options = {}, root = { dataset: {} };
  media.matches = false;
  const dispose = setupCameraMotion(control, options, storage, media, root);
  assert.equal(options.reducedCameraMotion, false);
  media.matches = true; media.dispatchEvent(new Event('change'));
  assert.equal(options.reducedCameraMotion, true);
  assert.equal(root.dataset.cameraMotion, 'reduced');
  control.value = 'full'; control.dispatchEvent(new Event('change'));
  assert.equal(options.reducedCameraMotion, false);
  assert.equal(readCameraMotion(storage), 'full');
  media.dispatchEvent(new Event('change')); assert.equal(options.reducedCameraMotion, false);
  control.value = 'reduced'; control.dispatchEvent(new Event('change')); assert.equal(options.reducedCameraMotion, true);
  control.value = 'invalid'; control.dispatchEvent(new Event('change')); assert.equal(control.value, 'reduced');
  dispose(); control.value = 'full'; control.dispatchEvent(new Event('change')); assert.equal(options.cameraMotion, 'reduced');
  assert.equal(readCameraMotion({ getItem() { throw Error('blocked'); } }), 'auto');
});

test('reduced camera motion keeps gameplay recoil while removing cosmetic shake and roll', () => {
  const results = [];
  for (const reduced of [false, true]) {
    const char = { headWorld: out => out.set(0, 1.6, 0), setVisibleHead() {} };
    const state = { mode: 'game', local: { state: 'active', char, pos: new THREE.Vector3(), renderPos: new THREE.Vector3() }, viewPitch: 0, viewYaw: 0, cameraMode: 2, shake: 1 };
    const G = { camera: new THREE.PerspectiveCamera(72), opts: { reducedCameraMotion: reduced }, time: 1 };
    const update = new Function('THREE', 'G', 'state', 'tmpV', 'tmpV2', 'stepCamKick', 'camKick', 'cameraBoom', source.slice(start, end) + '\nreturn updateCamera;')(THREE, G, state, new THREE.Vector3(), new THREE.Vector3(), () => {}, { a: new THREE.Vector3(0.04, 0.01, 0.03) }, new CameraBoom());
    update(0);
    const direction = G.camera.getWorldDirection(new THREE.Vector3());
    assert.ok(direction.y > 0.03, 'accessibility settings must not eliminate pitch recoil');
    results.push(G.camera);
  }
  assert.ok(results[1].position.distanceTo(new THREE.Vector3(0, 1.63, 0.1)) < 1e-6, 'reduced camera keeps a stable eye position');
  assert.ok(results[0].position.distanceTo(results[1].position) > 0.005, 'full motion retains impact vibration');
  const roll = camera => {
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const right = direction.cross(new THREE.Vector3(0, 1, 0)).normalize();
    return Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).dot(right));
  };
  assert.ok(roll(results[1]) < roll(results[0]), 'cosmetic roll is reduced');
});
