import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GRAPHICS, TIERS, classifyGpu, AutoTuner, applyGraphics, applyShadows, readGraphics } from '../public/js/core/graphics.js';
import { LightPool } from '../public/js/world/lightpool.js';

test('la placa de video elige el preset de arranque', () => {
  const cases = [
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'minimo', true],
    ['ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)', 'minimo', true],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'minimo', false],
    ['ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'minimo', false],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'rendimiento', false],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'rendimiento', false],
    ['ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'rendimiento', false],
    ['ANGLE (NVIDIA, NVIDIA GeForce MX250 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'rendimiento', false],
    ['ANGLE (NVIDIA, NVIDIA GeForce GT 730 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'rendimiento', false],
    ['ANGLE (NVIDIA, NVIDIA GeForce 940MX Direct3D11 vs_5_0 ps_5_0, D3D11)', 'rendimiento', false],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'equilibrado', false],
    ['ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'equilibrado', false],
    ['ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'equilibrado', false],
    ['ANGLE (Intel, Intel(R) Arc(TM) A750 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'equilibrado', false],
    ['Mali-G57 MC2', 'minimo', false],
  ];
  for (const [name, tier, software] of cases) {
    const info = classifyGpu(name);
    assert.equal(info.tier, tier, name);
    assert.equal(info.software, software, name);
  }
  // el contexto de prueba sin aceleración manda aunque el nombre no lo diga; dos núcleos tampoco dan
  assert.equal(classifyGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)', { software: true }).tier, 'minimo');
  assert.equal(classifyGpu('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)', { cores: 2 }).tier, 'minimo');
});

test('el automático baja solo cuando el juego no llega y la resolución ya no puede bajar más', () => {
  const t = new AutoTuner();
  const run = (ms, secs, opts) => { let v = 0; for (let s = 0; s < secs; s += ms / 1000) v = t.sample(ms, ms / 1000, opts) || v; return v; };
  t.reset(0);
  assert.equal(run(60, 5, { canShrink: true }), 0, 'primero baja la resolución dinámica');
  t.reset(0);
  assert.equal(run(60, 5, { canShrink: false }), -1);
  t.reset(0);
  assert.equal(run(400, 5, { canShrink: true }), -1, 'a 2 FPS no espera a la resolución');
  t.reset(6);
  assert.equal(run(400, 5, { canShrink: false }), 0, 'la gracia tras un cambio (shaders compilando) no cuenta');
  t.reset(0);
  assert.equal(run(16, 9, { canGrow: false }), 0, 'a 60 FPS no sube');
  t.reset(0);
  assert.equal(run(8, 13, { canGrow: false }), 1, 'sobra mucho tres ventanas seguidas: sube');
  t.reset(0);
  assert.equal(run(8, 13, { canGrow: true }), 0, 'primero sube la resolución');
  // un tirón aislado no baja nada: manda la mediana
  t.reset(0);
  let v = 0;
  for (let i = 0; i < 300; i++) v = t.sample(i === 100 ? 2000 : 16, i === 100 ? 2 : 0.016, {}) || v;
  assert.equal(v, 0);
});

test('los presets sacan luces, sombras y pases de verdad', () => {
  assert.deepEqual(TIERS, ['minimo', 'rendimiento', 'equilibrado', 'calidad', 'ultra']);
  for (let i = 1; i < TIERS.length; i++) {
    const a = GRAPHICS[TIERS[i - 1]], b = GRAPHICS[TIERS[i]];
    assert.ok(a.lights <= b.lights && a.maxDpr <= b.maxDpr && a.aoSamples <= b.aoSamples, TIERS[i]);
  }
  assert.equal(GRAPHICS.minimo.shadows, 'off');
  assert.equal(readGraphics({ getItem: () => null }), 'auto');
  assert.equal(readGraphics({ getItem: () => 'rendimiento' }), 'rendimiento');

  const scene = new THREE.Scene();
  const pool = new LightPool(scene, 10, { shadow: true });
  const mat = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));
  const sun = new THREE.DirectionalLight(); sun.castShadow = true;
  const farSun = new THREE.DirectionalLight(0xffffff, 0); farSun.castShadow = true; farSun.shadow.mapSize.set(4096, 4096);
  const renderer = { shadowMap: { enabled: true }, setPixelRatio() {}, getPixelRatio: () => 1 };
  const G = { opts: {}, renderer, scene, world: { pool, sun, farSun, flames: { set() {} }, fireFallback: [] } };
  const version = mat.version;
  applyGraphics(G, 'minimo');
  assert.equal(pool.live.length, 2);
  assert.equal(pool.slots.filter((s) => s.light.visible).length, 2);
  assert.equal(pool.hero.light.castShadow, false);
  assert.equal(renderer.shadowMap.enabled, false);
  assert.equal(farSun.visible, false);
  assert.ok(mat.version > version, 'sin sombras los materiales se recompilan (three.js no lo hace solo)');
  assert.equal(G.perf.npcLod, 3);
  assert.equal(G.world.quality, 'baja');

  // el pool reparte solo entre las luces activas
  for (let i = 0; i < 6; i++) pool.add({ position: new THREE.Vector3(i, 1, -3), color: new THREE.Color(1, 1, 1), intensity: 5, distance: 10 });
  const cam = new THREE.PerspectiveCamera(); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  for (let i = 0; i < 60; i++) pool.update(1 / 30, cam);
  assert.equal(pool.slots.slice(2).every((s) => s.light.intensity === 0 && !s.src), true);
  assert.equal(pool.live.every((s) => s.src && s.light.intensity > 0), true);

  applyGraphics(G, 'rendimiento');
  assert.equal(pool.live.length, 4);
  assert.equal(renderer.shadowMap.enabled, true);
  assert.equal(farSun.visible, true);
  assert.equal(farSun.shadow.mapSize.x, 2048, 'sombra lejana a la mitad de lado con sombras bajas');
  assert.equal(sun.shadow.needsUpdate, true, 'al volver las sombras cada luz pide su mapa');
  assert.equal(G.perf.shadowEvery, 2);

  applyGraphics(G, 'equilibrado');
  assert.equal(pool.live.length, 10);
  assert.equal(pool.hero.light.castShadow, true);
  applyShadows(G, 'ultra');
  assert.equal(sun.shadow.mapSize.x, 4096);
  assert.equal(farSun.shadow.mapSize.x, 4096);
});
