import test from 'node:test';
import assert from 'node:assert/strict';
import { CIRCUIT, circuitSamples, circuitDist, VEHICLES, MAP_BOUNDS, grassAllowed, GRASSMAP, zoneAt } from '../public/js/shared/mapdata.js';
import { TRAPS, MINES, axeBlade, crusherY, sawX, ballPos } from '../public/js/shared/circuit-traps.js';

test('el circuito es una pista cerrada adentro del mapa que no se pisa a sí misma', () => {
  const S = circuitSamples();
  assert.ok(S.length > 200 && CIRCUIT.length > 250);
  for (const [x, z] of S) assert.ok(x > MAP_BOUNDS.x0 + CIRCUIT.width / 2 + 2 && x < MAP_BOUNDS.x1 - 2 && z < MAP_BOUNDS.z1 - CIRCUIT.width / 2 - 1, `se sale del mapa en ${x},${z}`);
  // tramos que no son vecinos quedan lejos (dos carriles nunca se superponen)
  for (let i = 0; i < S.length; i += 3) for (let j = i + 40; j < S.length - 40 + i && j < S.length; j += 3) {
    assert.ok(Math.hypot(S[i][0] - S[j][0], S[i][1] - S[j][1]) > CIRCUIT.width + 4, `la pista se pisa cerca de ${S[i][0].toFixed(0)},${S[i][1].toFixed(0)}`);
  }
  assert.equal(zoneAt(CIRCUIT.start.x, CIRCUIT.start.z), 'circuito');
});

test('en el asfalto no crece pasto y los vehículos esperan afuera de la pista', () => {
  const allowed = grassAllowed();
  for (const [x, z] of circuitSamples()) {
    const i = Math.floor((x - GRASSMAP.x0) / GRASSMAP.cell), j = Math.floor((z - GRASSMAP.z0) / GRASSMAP.cell);
    assert.equal(allowed[j * GRASSMAP.w + i], 0, `hay pasto en la pista en ${x.toFixed(1)},${z.toFixed(1)}`);
  }
  for (const v of VEHICLES.filter((v) => v.type === 'racecar' || v.type === 'moto')) {
    assert.ok(circuitDist(v.p[0], v.p[2]) > CIRCUIT.width / 2 + 2, `${v.type} ${v.id} estacionado arriba de la pista`);
  }
});

test('las trampas están sobre la pista, se mueven y no hay huecos imposibles', () => {
  for (const [name, x, z] of [['hacha', TRAPS.axe.x, TRAPS.axe.z], ['sierras', TRAPS.saws.x, TRAPS.saws.z], ['prensa', TRAPS.crusher.x, TRAPS.crusher.z], ['bola', TRAPS.ball.x, TRAPS.ball.z]]) {
    assert.ok(circuitDist(x, z) < 1, `${name} fuera de la pista`);
  }
  for (const m of MINES) assert.ok(circuitDist(m.x, m.z) < CIRCUIT.width / 2 - 0.5, 'mina fuera del asfalto');
  // el hacha barre de lado a lado y baja a la altura de un auto; la prensa baja hasta casi el piso y vuelve a subir
  let minY = 9, maxX = -1e9, minX = 1e9, lowC = 9, highC = 0;
  for (let t = 0; t < 8; t += 0.02) { const a = axeBlade(t); minY = Math.min(minY, a.y); maxX = Math.max(maxX, a.x); minX = Math.min(minX, a.x); const c = crusherY(t); lowC = Math.min(lowC, c); highC = Math.max(highC, c); }
  assert.ok(minY < 2.2 && maxX - minX > CIRCUIT.width * 0.8);
  assert.ok(lowC < 1 && highC > 4);
  assert.notEqual(sawX(0.3, 0), sawX(0.3, 1));
  assert.ok(ballPos(1).y > 1);
});
