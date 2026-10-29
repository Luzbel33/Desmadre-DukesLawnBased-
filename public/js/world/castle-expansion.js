// A walkable upper storey and hollow curtain towers. Static detail uses the castle's
// merged builders; only the armillary and the archive shutter need their own nodes.
import * as THREE from 'three';
import { getMat } from './builder.js';

export const UPPER_FLOOR = 10.3;
export const TOWER_DECK = 11;
export const UPPER_ROOMS = [
  { id: 121, name: 'Aposentos del Conde', x0: -23.8, x1: -8.3, z0: -125.8, z1: -115.25 },
  { id: 122, name: 'Gabinete de Cartografía', x0: -23.8, x1: -8.3, z0: -114.75, z1: -104.2 },
  { id: 123, name: 'Botica de Medianoche', x0: 8.3, x1: 23.8, z0: -125.8, z1: -115.25 },
  { id: 124, name: 'Armería del Conde', x0: 8.3, x1: 23.8, z0: -114.75, z1: -104.2 },
  { id: 125, name: 'Archivo del Campanario', x0: -7.7, x1: 7.7, z0: -125.8, z1: -117.1 },
];

const TAU = Math.PI * 2;
const distanceAngle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

function rail(c, ax, ay, az, bx, by, bz, key = 'blackWood') {
  const from = new THREE.Vector3(ax, ay, az), to = new THREE.Vector3(bx, by, bz);
  const d = to.clone().sub(from), center = to.add(from).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const g = new THREE.CylinderGeometry(0.046, 0.046, d.length(), 6);
  g.applyQuaternion(q); g.translate(center.x, center.y, center.z); c.geo(key, g);
}

// A solid collision ramp underneath discrete treads makes the existing character
// controller climb smoothly and lets loose physical props roll down naturally.
export function castleStair(c, x, za, zb, low, high, width) {
  const run = za - zb, rise = high - low, length = Math.hypot(run, rise), angle = Math.atan2(rise, run);
  const n = Math.ceil(rise / 0.17);
  for (let i = 0; i < n; i++) {
    const y = low + rise * (i + 1) / n;
    c.deco('oldWood', x, y - 0.085, za - run * (i + 0.5) / n, width, 0.17, run / n + 0.015, { mask: false });
    c.deco('blackWood', x, y - 0.025, za - run * i / n, width, 0.05, 0.045, { mask: false });
  }
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0));
  c.phys.box(x, (low + high) / 2 - 0.10, (za + zb) / 2, width / 2, 0.1, length / 2, 0, { rot: q, mat: 'wood' });
  for (const side of [-1, 1]) {
    const rx = x + side * (width / 2 + 0.02);
    c.deco('blackWood', rx, (low + high) / 2 - 0.18, (za + zb) / 2, 0.12, 0.35, length, { rx: angle, mask: false });
    rail(c, rx, low + 1.05, za, rx, high + 1.05, zb);
    for (let i = 0; i <= n; i += 2) c.deco('blackWood', rx, low + rise * i / n + 0.5, za - run * i / n, 0.06, 1.0, 0.06, { mask: false });
    c.phys.box(rx, (low + high) / 2 + 0.48, (za + zb) / 2, 0.04, 0.52, length / 2, 0, { rot: q, paint: false });
  }
}

function upperTrim(c, room) {
  const y = UPPER_FLOOR;
  const { x0, x1, z0, z1 } = room;
  c.deco('oldWood', (x0 + x1) / 2, y + 0.015, (z0 + z1) / 2, x1 - x0, 0.03, z1 - z0, { mask: false, noShadow: true });
  c.box('woodDark', (x0 + x1) / 2, 16.05, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, { mask: false, noShadow: true });
  for (let z = z0 + 1.7; z < z1; z += 2.7) {
    c.deco('blackWood', (x0 + x1) / 2, 15.73, z, x1 - x0, 0.34, 0.24, { mask: false });
  }
  // Timbers break up the wall scale without covering the upper windows.
  for (const x of [x0 + 0.09, x1 - 0.09]) {
    c.deco('blackWood', x, y + 0.14, (z0 + z1) / 2, 0.14, 0.28, z1 - z0, { mask: false });
    c.deco('blackWood', x, 14.95, (z0 + z1) / 2, 0.15, 0.18, z1 - z0, { mask: false });
  }
}

export function buildUpperCastle(c) {
  const y = UPPER_FLOOR;
  for (const room of UPPER_ROOMS) {
    c.room(room.x0, y - 0.05, room.z0, room.x1, 16, room.z1, room.id);
    if (room.id !== 125) upperTrim(c, room);
  }
  // The archive floor surrounds the opening; never cap the stairwell with detail.
  for (const [x0, x1, z0, z1] of [[-7.7, -6, -125.8, -117.1], [-3.4, 7.7, -125.8, -117.1], [-6, -3.4, -125.8, -121.2]]) {
    c.deco('oldWood', (x0 + x1) / 2, y + 0.015, (z0 + z1) / 2, x1 - x0, 0.03, z1 - z0, { mask: false });
  }
  c.box('woodDark', 0, 16.05, -121.45, 15.4, 0.3, 8.7, { mask: false });
  castleStair(c, -4.7, -115.25, -121.25, 8, y, 2.45);
  // The open landing is protected on either side, with a clear 2.4m exit north.
  for (const x of [-6.05, -3.35]) {
    c.box('blackWood', x, y + 0.52, -119.15, 0.08, 1.04, 4.1, { mask: false, collide: false });
    rail(c, x, y + 1.05, -117.15, x, y + 1.05, -121.2);
  }
  for (const side of [-1, 1]) {
    const a = side < 0 ? -23.8 : 8.3, b = side < 0 ? -8.3 : 23.8;
    const doorX = side * 11.5;
    c.wall('moldy', a, -115, b, -115, 5.6, 0.5, [{ a: doorX - 1.2, b: doorX + 1.2, y0: y, y1: y + 3.2 }], { y0: y });
    for (const x of [doorX - 1.26, doorX + 1.26]) c.deco('blackWood', x, y + 1.65, -115, 0.16, 3.3, 0.62, { mask: false });
    c.deco('blackWood', doorX, y + 3.3, -115, 2.68, 0.2, 0.62, { mask: false });
    c.deco('blackWood', side * 8, y + 3.4, -121.5, 0.76, 0.18, 2.45, { mask: false });
    for (const z of [-120.31, -122.69]) c.deco('blackWood', side * 8, y + 1.65, z, 0.76, 3.3, 0.14, { mask: false });
  }
  c.anchors.upperArchive = new THREE.Vector3(3.8, y + 1, -122.7);
  c.anchors.armillary = new THREE.Vector3(-17.2, y + 1.2, -109.4);
  c.anchors.apothecary = new THREE.Vector3(18.1, y + 1, -123.1);
  c.interact.push(
    { id: 'h_armillary', k: 'haunt', ev: 'armillary', p: [-17.2, y + 1.25, -109.4], r: 2.3, label: 'Girar la esfera celeste' },
    { id: 'h_archive', k: 'haunt', ev: 'archive', p: [4.8, y + 1.1, -123.75], r: 1.8, label: 'Abrir el archivo del campanario' },
    { id: 'h_bell_upper', k: 'haunt', ev: 'bell', p: [-0.7, y + 1, -119.1], r: 1.3, label: 'Tocar la campana desde el archivo' },
  );
  // A continuous bell rope gives the upper interaction a visible physical object.
  c.cyl('hemp', -0.7, 13.2, -119.1, 0.02, 0.02, 4.6, 6, { mask: false });
  c.deco('woodDark', -0.7, y + 0.85, -119.1, 0.35, 0.07, 0.07, { mask: false });
  for (const [x, z, color] of [[-17, -121, 0xffb46d], [-17.2, -109.4, 0xffbf7d], [17.8, -122, 0x94cbb1], [16, -109.5, 0xffb975], [1.6, -122.2, 0xffc48a]]) {
    c.light(x, y + 2.7, z, color, 18, 12, { flicker: true, priority: 2 });
  }
  // Cold upper-window spill complements small warm practical lamps.
  for (const x of [-17.3, 17.3]) c.light(x, 13.1, -105, 0x7e9bcf, 2.8, 7, { priority: 0.9 });
  buildArmillary(c);
  buildArchiveCabinet(c);
}

function buildArmillary(c) {
  const p = c.anchors.armillary;
  c.cyl('blackWood', p.x, UPPER_FLOOR + 0.48, p.z, 0.14, 0.35, 0.88, 12, { collide: true, mask: false });
  c.cyl('bronze', p.x, UPPER_FLOOR + 0.95, p.z, 0.38, 0.3, 0.12, 20, { mask: false });
  const root = new THREE.Group(); root.position.set(p.x, UPPER_FLOOR + 1.7, p.z);
  for (const [radius, rx, rz] of [[0.69, Math.PI / 2, 0], [0.74, 0, 0.35], [0.62, 1.07, 0.65]]) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 6, 56), getMat('bronze'));
    m.rotation.set(rx, 0, rz); root.add(m);
  }
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10), getMat('gold')); root.add(globe);
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.72, 6), getMat('bronze'));
  axis.rotation.z = 0.35; root.add(axis);
  root.userData.castleRoom = 122;
  c.scene.add(root); c.armillary = { root, until: -1, phase: 0 };
}

function buildArchiveCabinet(c) {
  const y = UPPER_FLOOR, x = 4.8, z = -124.55;
  c.box('blackWood', x, y + 0.92, z - 0.32, 2.4, 1.84, 0.08, { mask: false });
  for (const dx of [-1.16, 1.16]) c.box('blackWood', x + dx, y + 0.92, z + 0.04, 0.08, 1.84, 0.8, { mask: false });
  for (const dy of [0.04, 1.8]) c.box('blackWood', x, y + dy, z + 0.04, 2.4, 0.08, 0.8, { mask: false });
  // A recessed shelf revealed by a hinged panel; the cabinet never blocks a route.
  c.deco('oldWood', x, y + 1.36, z + 0.13, 2.05, 0.08, 0.55, { mask: false });
  const pivot = new THREE.Group(); pivot.position.set(x - 1.16, y + 0.97, z + 0.41);
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.5, 0.08), getMat('doorWood'));
  door.position.x = 1.15; pivot.add(door);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.016, 6, 16), getMat('bronze'));
  handle.position.set(2.13, 0, 0.07); pivot.add(handle);
  pivot.userData.castleRoom = 125;
  c.scene.add(pivot); c.archiveCabinet = { pivot, open: 0, target: 0 };
}

export function buildTowerInterior(c, x, z, radius, height) {
  const corner = radius > 4, floor = 0.10, shell = 0.72, n = 32;
  const inward = corner ? Math.atan2(-Math.sign(x), z < -100 ? 1 : -1) : -Math.sign(x) * Math.PI / 2;
  const topDoors = corner ? [Math.sign(x) * -Math.PI / 2, z < -100 ? 0 : Math.PI] : [];
  const id = corner ? 400 + (x > 0 ? 2 : 0) + (z < -100 ? 1 : 0) : 410 + (x > 0 ? 2 : 1);
  const mid = radius - shell / 2, chord = 2 * mid * Math.tan(Math.PI / n) + 0.035;
  const piece = (angle, bottom, top, thickness = shell, r = mid, key = 'castleStone') => {
    if (top <= bottom) return;
    c.box(key, x + Math.sin(angle) * r, (bottom + top) / 2, z + Math.cos(angle) * r, chord, top - bottom, thickness, { yaw: angle, mask: false });
  };
  for (let i = 0; i < n; i++) {
    const a = i * TAU / n;
    const door = distanceAngle(a, inward) < (corner ? 0.29 : 0.39);
    const upperDoor = topDoors.some(b => distanceAngle(a, b) < 0.31);
    piece(a, door ? 3.25 : 0, upperDoor ? TOWER_DECK : height);
    if (upperDoor) piece(a, TOWER_DECK + 3, height);
    if (!door) piece(a, 0.08, 0.64, 0.94, mid, 'keepStone');
    if (!upperDoor) piece(a, height * 0.62 - 0.17, height * 0.62 + 0.17, 0.9, mid, 'keepStone');
  }
  c.cyl('flagstone', x, floor - 0.08, z, radius - shell, radius - shell, 0.16, 32, { collide: true, mask: false });
  c.room(x - radius + shell, floor - 0.2, z - radius + shell, x + radius - shell, height, z + radius - shell, id);
  c.mask.circle(x, z, radius, height);
  c.towerRooms ||= [];
  const tower = { x, z, radius, inward, floor, id, corner };
  c.towerRooms.push(tower);
  if (corner) spiral(c, tower);
  else c.cyl('woodDark', x, 3.45, z, radius - shell, radius - shell, 0.2, 32, { mask: false });
  for (const dy of corner ? [2.3, 6.8, 13] : [2.3]) {
    const a = inward + 1.45, lx = x + Math.sin(a) * (radius - 0.95), lz = z + Math.cos(a) * (radius - 0.95);
    c.deco('iron', lx, dy - 0.3, lz, 0.15, 0.4, 0.15, { mask: false });
    c.flame(lx, dy, lz, 0.10, 0.3, {});
    c.light(lx, dy + 0.2, lz, 0xffad62, 7, 9, { flicker: true, priority: 1.3 });
  }
}

function spiral(c, tower) {
  const { x, z, inward, radius, floor } = tower;
  const n = 80, turns = 2, start = inward + 1.2, stepAngle = TAU * turns / n;
  const r = 2.9, width = 1.9, rise = (TOWER_DECK - floor) / n;
  for (let i = 0; i < n; i++) {
    const a = start + (i + 0.5) * stepAngle, y = floor + (i + 1) * rise;
    // Tangential tread depth overlaps its neighbours even on the outside edge.
    c.box('oldWood', x + Math.sin(a) * r, y - 0.09, z + Math.cos(a) * r, 0.75, 0.18, width, { yaw: a, mask: false, pmat: 'wood' });
    if (i % 2 === 0) {
      const inner = r - width / 2 + 0.06;
      c.deco('iron', x + Math.sin(a) * inner, y + 0.48, z + Math.cos(a) * inner, 0.035, 1, 0.035, { mask: false });
    }
    const a0 = start + i * stepAngle, a1 = a0 + stepAngle, inner = r - width / 2 + 0.06;
    rail(c, x + Math.sin(a0) * inner, y + 0.97, z + Math.cos(a0) * inner, x + Math.sin(a1) * inner, y + 0.97 + rise, z + Math.cos(a1) * inner, 'iron');
  }
  c.cyl('keepStone', x, TOWER_DECK / 2, z, 0.48, 0.6, TOWER_DECK, 12, { collide: true, mask: false });
  // The last 2.6m of ascent has headroom through a generous wedge in the deck.
  const finish = start + TAU * turns;
  for (let i = 0; i < 48; i++) {
    const a = i * TAU / 48;
    const beforeExit = ((finish - a) % TAU + TAU) % TAU;
    const stairwell = beforeExit < 3.25;
    if (!stairwell) c.box('oldWood', x + Math.sin(a) * 2.65, TOWER_DECK - 0.10, z + Math.cos(a) * 2.65, 0.61, 0.2, 3.0, { yaw: a, mask: false, pmat: 'wood' });
    else c.box('oldWood', x + Math.sin(a) * 3.96, TOWER_DECK - 0.1, z + Math.cos(a) * 3.96, 0.63, 0.2, 1.08, { yaw: a, mask: false, pmat: 'wood' });
  }
  c.cyl('oldWood', x, TOWER_DECK - 0.1, z, 1.25, 1.25, 0.2, 24, { collide: true, mask: false });
  // Finish on a radial landing so the route reaches both curtain-wall exits.
  const a = finish + 0.15;
  c.box('oldWood', x + Math.sin(a) * 2.7, TOWER_DECK - 0.10, z + Math.cos(a) * 2.7, 1.2, 0.2, 3, { yaw: a, mask: false });
  tower.stair = { start, finish, radius: r, floor, top: TOWER_DECK, steps: n, rise };
}
