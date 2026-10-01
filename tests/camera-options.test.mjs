import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';

// Exercise the actual monolithic camera function rather than a copy of its math.
const source = fs.readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const start = source.indexOf('function updateCamera(dt) {');
const end = source.indexOf('// Sacudón de la cámara:', start);
assert.ok(start > 0 && end > start, 'camera function boundary changed');
function pose(shoulder, mode = 0, yaw = 0, wall = false) {
  let headVisible = true, rays = 0;
  const char = { meta: { height: 1.8 }, headWorld: out => out.set(0, 1.6, 0), setVisibleHead: v => { headVisible = v; } };
  const state = { mode: 'game', local: { state: 'active', char, pos: new THREE.Vector3(), renderPos: new THREE.Vector3() }, viewPitch: 0, viewYaw: yaw, cameraMode: mode };
  const G = { camera: new THREE.PerspectiveCamera(72), opts: { cameraShoulder: shoulder }, phys: { raycast: () => { rays++; return wall ? { dist: .5 } : null; } }, time: 0 };
  const update = new Function('THREE', 'G', 'state', 'tmpV', 'tmpV2', 'groups', 'GR', 'stepCamKick', 'camKick', source.slice(start, end) + '\nreturn updateCamera;')(THREE, G, state, new THREE.Vector3(), new THREE.Vector3(), () => 0, { WORLD: 1 }, () => {}, { a: new THREE.Vector3() });
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
    assert.equal(result.rays, 1);
    assert.ok(result.camera.position.distanceTo(new THREE.Vector3(0, 1.62, 0)) < .51);
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
