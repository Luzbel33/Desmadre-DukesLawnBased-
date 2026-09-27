// Edificios: mansión, bar, cine, galpón, pueblo, autocine.
import * as THREE from 'three';
import { placeModel } from '../game/assets.js';
import { getMat } from './builder.js';
import { textTexture } from './textures.js';

function signMesh(text, w, h, opts) {
  const tex = textTexture(text, { w: 1024, h: Math.round(1024 * (h / w)), ...opts });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: tex, transparent: !opts.bg, emissive: opts.emissive ? 0xffffff : 0, emissiveMap: opts.emissive ? tex : null,
      emissiveIntensity: opts.emissive || 0, roughness: 0.6,
    }),
  );
  return m;
}

export function buildBar(b, scene, lights) {
  const X0 = 95, X1 = 123, Z0 = -42, Z1 = -20, H = 5, T = 0.3;
  // piso de madera
  b.box('wood', (X0 + X1) / 2, -0.05, (Z0 + Z1) / 2, X1 - X0, 0.12, Z1 - Z0, { pmat: 'wood' });
  // paredes (ladrillo afuera; mismo material adentro)
  b.wall('brick', X0, Z0, X0, Z1, H, T, [{ from: 9.8, to: 12.2, bottom: 0, top: 2.8 }]); // oeste con puerta
  b.wall('brick', X1, Z0, X1, Z1, H, T);
  b.wall('brick', X0 - T / 2, Z0, X1 + T / 2, Z0, H, T);
  b.wall('brick', X0 - T / 2, Z1, X1 + T / 2, Z1, H, T);
  // techo + parapeto
  b.box('concrete', (X0 + X1) / 2, H + 0.15, (Z0 + Z1) / 2, X1 - X0 + 0.6, 0.3, Z1 - Z0 + 0.6);
  b.box('darkgray', (X0 + X1) / 2, H + 0.5, Z0 - 0.15, X1 - X0 + 0.6, 0.5, 0.3, { collide: false });
  b.box('darkgray', (X0 + X1) / 2, H + 0.5, Z1 + 0.15, X1 - X0 + 0.6, 0.5, 0.3, { collide: false });
  b.box('darkgray', X0 - 0.15, H + 0.5, (Z0 + Z1) / 2, 0.3, 0.5, Z1 - Z0 + 0.6, { collide: false });
  b.box('darkgray', X1 + 0.15, H + 0.5, (Z0 + Z1) / 2, 0.3, 0.5, Z1 - Z0 + 0.6, { collide: false });
  // cielorraso oscuro con vigas
  b.box('woodDark', (X0 + X1) / 2, H - 0.05, (Z0 + Z1) / 2, X1 - X0 - 0.3, 0.1, Z1 - Z0 - 0.3, { collide: false, noShadow: true });
  for (let x = X0 + 3; x < X1; x += 4) b.box('woodDark', x, H - 0.3, (Z0 + Z1) / 2, 0.25, 0.4, Z1 - Z0 - 0.3, { collide: false, noShadow: true });
  // marco de puerta + toldo
  b.box('woodDark', X0 - 0.2, 2.9, -31, 0.2, 0.2, 2.8, { collide: false });
  b.box('red', X0 - 1.1, 3.3, -31, 1.8, 0.08, 3.6, { rz: 0.25, collide: false });
  // cartel grande sobre la puerta
  const sign = signMesh('EL CORTACÉSPED', 7, 1.2, { color: '#ffe9b0', stroke: '#3a1a0a', strokeW: 10, size: 150, bg: '#5a1a14' });
  sign.position.set(X0 - 0.2, 4.2, -31);
  sign.rotation.y = -Math.PI / 2;
  scene.add(sign);
  // luces interiores (cálidas)
  for (const [x, z] of [[100, -36], [104, -26], [117.5, -31]]) {
    const l = new THREE.PointLight(0xffb070, 18, 16, 1.6);
    l.position.set(x, 3.62, z);
    scene.add(l);
    lights.push(l);
  }
  // piso del ring un poco más alto no; el ring es superficie pintable (graffiti.js)
}

export function buildCinema(b, scene, lights) {
  const X0 = 95, X1 = 123, Z0 = -12, Z1 = 16, H = 8, T = 0.3;
  b.box('carpet', (X0 + X1) / 2, -0.05, (Z0 + Z1) / 2, X1 - X0, 0.12, Z1 - Z0, { pmat: 'carpet' });
  b.wall('plaster', X0, Z0, X0, Z1, H, T, [{ from: 12.8, to: 15.2, bottom: 0, top: 3 }]);
  b.wall('plaster', X1, Z0, X1, Z1, H, T);
  b.wall('plaster', X0 - T / 2, Z0, X1 + T / 2, Z0, H, T);
  b.wall('plaster', X0 - T / 2, Z1, X1 + T / 2, Z1, H, T);
  b.box('concrete', (X0 + X1) / 2, H + 0.15, (Z0 + Z1) / 2, X1 - X0 + 0.6, 0.3, Z1 - Z0 + 0.6);
  b.box('black', (X0 + X1) / 2, H - 0.05, (Z0 + Z1) / 2, X1 - X0 - 0.3, 0.1, Z1 - Z0 - 0.3, { collide: false, noShadow: true });
  // paneles acústicos rojos en las paredes laterales
  for (let x = 104; x < 121; x += 3) {
    b.box('leatherRed', x, 3.5, Z0 + 0.2, 2.2, 4, 0.1, { collide: false, noShadow: true });
    b.box('leatherRed', x, 3.5, Z1 - 0.2, 2.2, 4, 0.1, { collide: false, noShadow: true });
  }
  // marco negro de la pantalla + escenario
  const sx = 122.75, sz = 2, sw = 13, sh = 7.3125, sy = 4.3;
  b.box('black', sx, sy + sh / 2 + 0.25, sz, 0.1, 0.5, sw + 1, { collide: false });
  b.box('black', sx, sy - sh / 2 - 0.25, sz, 0.1, 0.5, sw + 1, { collide: false });
  b.box('black', sx, sy, sz - sw / 2 - 0.25, 0.1, sh, 0.5, { collide: false });
  b.box('black', sx, sy, sz + sw / 2 + 0.25, 0.1, sh, 0.5, { collide: false });
  b.box('woodDark', 121.6, 0.3, sz, 2.2, 0.6, sw + 2);
  // cortinas
  for (const side of [-1, 1]) b.box('leatherRed', 122.3, 4.1, sz + side * (sw / 2 + 1.2), 0.3, 8, 1.6, { collide: false });
  // marquesina exterior
  b.box('black', X0 - 0.9, 4.2, 2, 1.6, 1.4, 9, { collide: false });
  const m1 = signMesh('HOY: LO QUE PONGAS', 8.6, 1.1, { color: '#111', size: 120, bg: '#f5ecd0', weight: 800 });
  m1.position.set(X0 - 1.71, 4.2, 2);
  m1.rotation.y = -Math.PI / 2;
  scene.add(m1);
  // bombitas de la marquesina
  for (let z = -2.3; z <= 6.3; z += 0.6) {
    b.box('bulb', X0 - 1.72, 4.95, z, 0.06, 0.1, 0.1, { collide: false, noShadow: true });
    b.box('bulb', X0 - 1.72, 3.45, z, 0.06, 0.1, 0.1, { collide: false, noShadow: true });
  }
  for (const [x, z, c] of [[101, 2, 0xff9a60], [112, -8, 0x6070ff], [112, 12, 0x6070ff]]) {
    const l = new THREE.PointLight(c, 6, 14, 1.8);
    l.position.set(x, 6.5, z);
    scene.add(l);
    lights.push(l);
  }
}

export function buildAlley(b) {
  // muro del fondo del callejón
  b.wall('brick', 123, -20, 123, -12, 5, 0.3);
  b.box('concrete', 109, 0.005, -16, 28, 0.03, 7.7, { collide: false, noShadow: true });
}

export function buildMansion(b, scene) {
  const X0 = -35, X1 = 35, Z0 = -112, Z1 = -86, H = 14;
  // bloque principal con fachada
  b.box('facade', 0, H / 2, (Z0 + Z1) / 2, X1 - X0, H, Z1 - Z0);
  // techo y balaustrada
  b.box('roof', 0, H + 0.2, (Z0 + Z1) / 2, X1 - X0 + 0.8, 0.4, Z1 - Z0 + 0.8);
  for (let x = X0; x <= X1; x += 1.0) {
    b.box('cream', x, H + 0.8, Z1 + 0.3, 0.18, 0.8, 0.18, { collide: false });
    b.box('cream', x, H + 0.8, Z0 - 0.3, 0.18, 0.8, 0.18, { collide: false });
  }
  b.box('cream', 0, H + 1.25, Z1 + 0.3, X1 - X0 + 0.6, 0.18, 0.4, { collide: false });
  b.box('cream', 0, H + 1.25, Z0 - 0.3, X1 - X0 + 0.6, 0.18, 0.4, { collide: false });
  // alas laterales
  for (const s of [-1, 1]) {
    const cx = s * 41.5;
    b.box('facade', cx, 5, -100, 13, 10, 16);
    b.box('roof', cx, 10.2, -100, 13.6, 0.4, 16.6);
    // chimeneas
    b.box('stone', cx + s * 3, 11.5, -104, 1.2, 2.6, 1.2);
    b.box('stone', s * 20, 15.8, -95, 1.4, 3.2, 1.4);
  }
  // pórtico con columnas y frontón
  for (let i = 0; i < 6; i++) {
    const x = -7.5 + i * 3;
    b.cylinder('cream', x, 5.2, -84.4, 0.55, 0.62, 10.4, 16, { collide: true });
    b.box('cream', x, 0.2, -84.4, 1.5, 0.4, 1.5, { collide: false });
    b.box('cream', x, 10.5, -84.4, 1.4, 0.3, 1.4, { collide: false });
  }
  b.box('cream', 0, 11.1, -84.6, 18.6, 0.9, 3.4, { collide: false });
  // frontón (prisma triangular)
  const shape = new THREE.Shape();
  shape.moveTo(-9.6, 0);
  shape.lineTo(9.6, 0);
  shape.lineTo(0, 3.2);
  shape.lineTo(-9.6, 0);
  const pg = new THREE.ExtrudeGeometry(shape, { depth: 3.2, bevelEnabled: false });
  pg.translate(0, 11.55, -86.2);
  b.geo('cream', pg);
  // puerta principal
  b.box('woodDark', 0, 2.3, Z1 + 0.05, 3, 4.6, 0.2, { collide: false });
  b.box('gold', 0.6, 2.2, Z1 + 0.18, 0.12, 0.12, 0.06, { collide: false });
  // cúpula
  b.cylinder('cream', 0, H + 2.2, -99, 7.2, 7.2, 4.4, 32, { collide: false });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.box('glass', Math.sin(a) * 7.22, H + 2.3, -99 + Math.cos(a) * 7.22, 1.1, 2.4, 0.1, { yaw: a, collide: false, noShadow: true });
  }
  const dome = new THREE.SphereGeometry(7.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.translate(0, H + 4.4, -99);
  b.geo('roof', dome);
  b.cylinder('cream', 0, H + 12.4, -99, 0.9, 1.1, 1.8, 12);
  const cone = new THREE.ConeGeometry(1.2, 2.2, 12);
  cone.translate(0, H + 14.4, -99);
  b.geo('gold', cone);
  // colliders del bloque (la caja visual ya genera collider)
}

export function buildTerrace(b) {
  // piso de piedra de la terraza
  b.box('paving', 0, 0.02, -81.5, 48, 0.1, 9.2, { collide: false, noShadow: true });
  // balaustrada con entrada al medio
  for (const [x0, x1] of [[-24, -4], [4, 24]]) {
    const cx = (x0 + x1) / 2, len = x1 - x0;
    b.box('cream', cx, 0.95, -76.9, len, 0.14, 0.4);
    for (let x = x0 + 0.3; x < x1; x += 0.55) b.cylinder('cream', x, 0.47, -76.9, 0.09, 0.12, 0.8, 8);
    b.box('cream', cx, 0.06, -76.9, len, 0.12, 0.45, { collide: false });
  }
  for (const x of [-24, -4, 4, 24]) {
    b.box('cream', x, 0.6, -76.9, 0.6, 1.2, 0.6);
    b.box('terracotta', x, 1.45, -76.9, 0.5, 0.5, 0.5, { collide: false });
  }
  // laterales de la terraza
  b.box('cream', -24, 0.5, -81.5, 0.4, 1.0, 9);
  b.box('cream', 24, 0.5, -81.5, 0.4, 1.0, 9);
  // guirnalda de lamparitas
  for (let x = -20; x <= 20; x += 1.4) {
    const y = 3.2 - Math.cos((x / 20) * Math.PI) * 0.3;
    b.box('bulb', x, y, -78, 0.09, 0.12, 0.09, { collide: false, noShadow: true });
  }
  for (const x of [-21, 21]) b.cylinder('woodDark', x, 1.7, -78, 0.07, 0.07, 3.4, 6, { collide: true });
}

export function buildForecourt(b) {
  b.box('gravel', 0, 0.01, -64.5, 80, 0.06, 25, { collide: false, noShadow: true });
  // senderos hacia el pueblo y el galpón
  b.box('gravel', 61, 0.012, -54, 42, 0.06, 4, { collide: false, noShadow: true });
  b.box('gravel', -61, 0.012, -54, 42, 0.06, 4, { collide: false, noShadow: true });
  b.box('gravel', -82, 0.012, -30, 4, 0.06, 52, { collide: false, noShadow: true });
  // borde de piedra del Gran Pasto
  const L = { x0: -70, z0: -50, x1: 70, z1: 60 };
  b.box('stone', 0, 0.04, L.z0 - 0.2, L.x1 - L.x0 + 0.8, 0.1, 0.4, { collide: false, noShadow: true });
  b.box('stone', 0, 0.04, L.z1 + 0.2, L.x1 - L.x0 + 0.8, 0.1, 0.4, { collide: false, noShadow: true });
  b.box('stone', L.x0 - 0.2, 0.04, (L.z0 + L.z1) / 2, 0.4, 0.1, L.z1 - L.z0, { collide: false, noShadow: true });
  b.box('stone', L.x1 + 0.2, 0.04, (L.z0 + L.z1) / 2, 0.4, 0.1, L.z1 - L.z0, { collide: false, noShadow: true });
}

export function buildGarage(b, scene) {
  const X0 = -102, X1 = -86, Z0 = -22, Z1 = -6, H = 5;
  b.box('concrete', (X0 + X1) / 2, 0.0, (Z0 + Z1) / 2, X1 - X0, 0.1, Z1 - Z0, { collide: false, noShadow: true });
  b.box('concrete', -80, 0.005, -9, 12, 0.08, 32, { collide: false, noShadow: true });
  b.wall('metal', X0, Z0, X1, Z0, H, 0.3);
  b.wall('metal', X0, Z1, X1, Z1, H, 0.3);
  b.wall('metal', X0, Z0, X0, Z1, H, 0.3);
  // techo a dos aguas
  b.box('metal', (X0 + X1) / 2, H + 0.9, (Z0 + Z1) / 2 - 4.2, X1 - X0 + 1, 0.15, 9, { rx: -0.22 });
  b.box('metal', (X0 + X1) / 2, H + 0.9, (Z0 + Z1) / 2 + 4.2, X1 - X0 + 1, 0.15, 9, { rx: 0.22 });
  // hastiales (triángulos) en los extremos oeste y este
  for (const x of [X0 - 0.15, X1 - 0.15]) {
    const shape = new THREE.Shape();
    shape.moveTo(-8, 0); shape.lineTo(8, 0); shape.lineTo(0, 1.9); shape.lineTo(-8, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    g.translate(x, H, (Z0 + Z1) / 2);
    b.geo('metal', g);
  }
  // postes de la entrada
  b.box('darkgray', X1, H / 2, Z0 + 0.2, 0.3, H, 0.3);
  b.box('darkgray', X1, H / 2, Z1 - 0.2, 0.3, H, 0.3);
  b.box('darkgray', X1, H - 0.2, (Z0 + Z1) / 2, 0.3, 0.4, Z1 - Z0);
  const sign = signMesh('GALPÓN DEL DUQUE', 8, 1, { color: '#ffd23b', stroke: '#222', strokeW: 10, size: 120, bg: '#2a2a2a' });
  sign.position.set(X1 + 0.2, H + 0.6, (Z0 + Z1) / 2);
  sign.rotation.y = Math.PI / 2;
  scene.add(sign);
}

export function buildTown(b, scene) {
  // ruta
  b.box('asphalt', 86, 0.015, 0, 8, 0.05, 250, { collide: false, noShadow: true });
  for (let z = -122; z < 124; z += 6) b.box('white', 86, 0.045, z, 0.18, 0.01, 3, { collide: false, noShadow: true });
  // vereda
  b.box('concrete', 92.5, 0.04, 0, 5, 0.1, 250, { collide: false, noShadow: true });
  // estacionamiento
  b.box('asphalt', 109, 0.012, 31, 28, 0.05, 26, { collide: false, noShadow: true });
  // postes de luz sobre la vereda
  for (let z = -110; z <= 110; z += 22) {
    if (placeModel(scene, 'd_streetlamp', 91, 0.09, z, -Math.PI / 2)) {
      b.phys.cylinder(91, 2.1, z, 2, 0.12);
      continue;
    }
    b.cylinder('darkgray', 91, 3, z, 0.08, 0.12, 6, 8, { collide: true });
    b.box('darkgray', 90.2, 5.95, z, 1.6, 0.1, 0.12, { collide: false });
    b.box('lamp', 89.5, 5.85, z, 0.5, 0.1, 0.25, { collide: false, noShadow: true });
  }
  // cartel de ruta
  const s = signMesh('RUTA 3 · EL PUEBLO →', 5, 0.8, { color: '#fff', size: 110, bg: '#1c5a2c' });
  s.position.set(80.5, 2.6, -56);
  s.rotation.y = -Math.PI / 2;
  scene.add(s);
  b.box('darkgray', 80.6, 1.3, -57.8, 0.1, 2.6, 0.1);
  b.box('darkgray', 80.6, 1.3, -54.2, 0.1, 2.6, 0.1);
}

export function buildAutocine(b, scene) {
  const cz = 71.6;
  // pantalla gigante: postes, panel trasero y marco
  b.box('darkgray', -11.4, 7, cz + 0.6, 0.6, 14, 0.6);
  b.box('darkgray', 11.4, 7, cz + 0.6, 0.6, 14, 0.6);
  b.box('darkgray', 0, 7.2, cz + 0.45, 22.4, 12.8, 0.3);
  b.box('black', 0, 13.3, cz - 0.05, 22, 0.6, 0.3, { collide: false });
  b.box('black', 0, 1.1, cz - 0.05, 22, 0.6, 0.3, { collide: false });
  for (const x of [-7, 0, 7]) b.box('darkgray', x, 3.5, cz + 2.2, 0.3, 7, 0.3, { rx: -0.35, collide: false });
  b.box('gravel', 0, 0.011, 69, 40, 0.05, 18, { collide: false, noShadow: true });
  // poste con parlante
  b.cylinder('darkgray', 0, 0.8, 64, 0.08, 0.08, 1.6, 8, { collide: true });
  b.box('red', 0, 1.7, 64, 0.5, 0.35, 0.3, { collide: false });
  const s = signMesh('AUTOCINE DEL DUQUE', 10, 1.4, { color: '#ffd23b', stroke: '#300', strokeW: 10, size: 130, bg: '#6a0f18' });
  s.position.set(0, 14.4, cz - 0.1);
  s.rotation.y = Math.PI;
  scene.add(s);
}

export function buildStuntPark(b) {
  b.box('dirt', -108, 0.008, 38, 40, 0.05, 48, { collide: false, noShadow: true });
}

export function buildPerimeter(b) {
  const B = 135, H = 2.2;
  b.box('stone', 0, H / 2, -B, 2 * B + 1, H, 1);
  b.box('stone', 0, H / 2, B, 2 * B + 1, H, 1);
  b.box('stone', -B, H / 2, 0, 1, H, 2 * B + 1);
  b.box('stone', B, H / 2, 0, 1, H, 2 * B + 1);
  // topes altos invisibles para que nadie salga volando del mapa
  for (const [x, z, sx, sz] of [[0, -B - 1, 2 * B, 1], [0, B + 1, 2 * B, 1], [-B - 1, 0, 1, 2 * B], [B + 1, 0, 1, 2 * B]]) {
    b.phys && b.phys.box(x, 25, z, sx, 25, sz, 0, { paint: false });
  }
}
