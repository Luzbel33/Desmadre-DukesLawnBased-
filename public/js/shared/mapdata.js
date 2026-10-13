// Datos del mapa compartidos entre servidor y cliente (sin dependencias de three.js).
// Convenciones: metros, Y arriba. yaw = 0 mira hacia +Z (sur). forward = (sin(yaw), 0, cos(yaw)).

export const PROTOCOL = 5;

// ---------------------------------------------------------------- El Gran Pasto
export const LAWN = { x0: -70, z0: -50, x1: 70, z1: 60, cell: 0.25 };
LAWN.w = Math.round((LAWN.x1 - LAWN.x0) / LAWN.cell); // 560
LAWN.h = Math.round((LAWN.z1 - LAWN.z0) / LAWN.cell); // 440

export const GRASS = {
  growTickMs: 3000, // cada cuánto crece un pasito
  growPerTick: 2, // 0..255 => ~6 minutos para volver a crecer del todo
  cutHeight: 14, // altura que deja la cuchilla (0..255)
  shortThreshold: 70, // por debajo de esto cuenta como "cortado" para el %
};

// ---------------------------------------------------------------- Cancha de fútbol (en el Gran Pasto)
export const FIELD = { cx: 0, cz: 35, hx: 27, hz: 16, goalHalfW: 3.1, goalH: 2.25, goalDepth: 1.7, boardX: 30.5, boardZ: 19, boardH: 0.85, gapHalf: 3 };

// ---------------------------------------------------------------- Zonas
export const ZONES = {
  bar: { x0: 95, z0: -42, x1: 123, z1: -20, pvp: true, name: 'Bar El Cortacésped' },
  cine: { x0: 95, z0: -12, x1: 123, z1: 16, name: 'Cine Gran Desmadre' },
  callejon: { x0: 95, z0: -20, x1: 123, z1: -12, name: 'Callejón del Aerosol' },
  estacionamiento: { x0: 95, z0: 18, x1: 123, z1: 44, name: 'Estacionamiento' },
  galpon: { x0: -102, z0: -22, x1: -86, z1: -6, name: 'El Galpón' },
  circuito: { x0: -132, z0: 8, x1: -88, z1: 132, name: 'Circuito del Desmadre' },
  circuito_sur: { x0: -88, z0: 62, x1: -28, z1: 132, name: 'Circuito del Desmadre' },
  torreon: { x0: -25, z0: -127, x1: 25, z1: -103, name: 'Castillo del Terror' },
  fogon: { x0: -40, z0: -101, x1: -14, z1: -84, name: 'El Fogón' },
  cementerio: { x0: 25, z0: -130, x1: 43, z1: -103, name: 'Cementerio' },
  huerta: { x0: -43, z0: -130, x1: -25, z1: -103, name: 'La Huerta Muerta' },
  castillo: { x0: -46, z0: -132, x1: 46, z1: -75, name: 'Patio del Castillo' },
  cancha: { x0: -31, z0: 15, x1: 31, z1: 55, name: 'La Cancha' },
  pasto: { x0: LAWN.x0, z0: LAWN.z0, x1: LAWN.x1, z1: LAWN.z1, name: 'El Gran Pasto' },
  autocine: { x0: -20, z0: 60, x1: 20, z1: 78, name: 'Autocine' },
};

export const MAP_BOUNDS = { x0: -135, z0: -135, x1: 135, z1: 135 };

// ---------------------------------------------------------------- Circuito del Desmadre (ex pista de saltos)
// Pista cerrada de 9 m de ancho en el rincón suroeste: largada en la recta del sur (hacia el este), curvas por el
// sur y el este, y al norte el tramo "Guts and Glory" (dos rectas paralelas con trampas mortales, ver
// world/circuit.js y game/race.js). pts: puntos de control (x, z) de una curva cerrada (Catmull-Rom).
export const CIRCUIT = {
  width: 9,
  pts: [[-100, 122], [-62, 124], [-43, 116], [-36, 98], [-40, 80], [-54, 72], [-70, 78], [-86, 71], [-100, 60], [-103.5, 42],
    [-104.5, 26], [-110, 16], [-120, 15], [-125, 24], [-125, 46], [-124.5, 70], [-126, 96], [-121, 115]],
  start: { x: -96, z: 122 }, // la línea de largada (se cruza hacia +X)
  laps: 3,
  // el tramo Guts and Glory: rectas al norte (x de cada carril) y dónde está cada trampa (z)
  gg: { east: -103.9, west: -125, axe: 55, ramp: 45, spikes: [40.5, 34], saws: 26, crusher: 30, mines: [42, 52], ball: 63 },
};
// Muestras de la línea del medio cada ~`step` m: [x, z, tx, tz, s] (tangente unitaria y distancia recorrida)
let _circuitSamples = null;
export function circuitSamples() {
  if (_circuitSamples) return _circuitSamples;
  const P = CIRCUIT.pts, n = P.length, out = [];
  const at = (i) => P[((i % n) + n) % n];
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), k = Math.max(2, Math.ceil(seg));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  let s = 0;
  _circuitSamples = out.map((p, i) => {
    const q = out[(i + 1) % out.length], r = out[(i - 1 + out.length) % out.length];
    const tx = q[0] - r[0], tz = q[1] - r[1], l = Math.hypot(tx, tz) || 1;
    const row = [p[0], p[1], tx / l, tz / l, s];
    s += Math.hypot(q[0] - p[0], q[1] - p[1]);
    return row;
  });
  CIRCUIT.length = s;
  return _circuitSamples;
}
// distancia (aproximada) de un punto a la línea del medio (para el pasto, los árboles y saber si estás en la pista)
export function circuitDist(x, z) {
  let best = Infinity;
  for (const [px, pz] of circuitSamples()) { const d = (px - x) ** 2 + (pz - z) ** 2; if (d < best) best = d; }
  return Math.sqrt(best);
}

// ---------------------------------------------------------------- Castillo del Terror (ex mansión)
// Muralla con torres, portón al sur, patio con el fogón y un torreón elevado (la casa del terror) con cripta abajo.
export const CASTLE = {
  x0: -46, x1: 46, z0: -132, z1: -78, // cara exterior de la muralla
  wallT: 2.4, wallH: 11,
  keep: { x0: -25, x1: 25, z0: -127, z1: -103, floor: 3.5, top: 16.5 },
  fire: [-27, -92.5], // fogón del patio (bajo el galpón de madera)
};
// ---------------------------------------------------------------- El Búnker (club secreto del Diablo)
// "Bajo tierra" no se puede de verdad (el piso físico es un plano infinito en y = 0): el complejo está lejos, al
// norte, cerrado y a oscuras (sin sol ni luna). Se llega por una tumba de la cripta (escalera + ascensor que "baja")
// o, el Diablo, por el pentagrama del cuarto secreto. De sur a norte: escalera, pasillo, ascensor, antesala (el
// portero y la puerta blindada) y el club. Metros absolutos; yaw 0 mira al sur (+Z).
export const CLUB = {
  x0: -60, x1: 50, z0: -526, z1: -406, // todo el complejo (se puede caminar adentro aunque esté fuera del mapa)
  name: 'El Búnker',
  password: 'tracatraca',
  // escalera: arriba (llegada desde la tumba) en z -410 a 6.3 m; baja hacia el norte hasta el pasillo en y 0
  stairTop: { x: 0, y: 6.3, z: -409.4, yaw: Math.PI },
  stairs: { x0: -1.6, x1: 1.6, zTop: -410.4, zBot: -421.6, rise: 6.3 },
  lobby: { x0: -3.2, x1: 3.2, z0: -429.8, z1: -421.6 }, // pasillo del ascensor
  lift: { x0: -1.6, x1: 1.6, z0: -433.4, z1: -429.8, h: 3.0 }, // cabina: puerta sur (pasillo) y norte (antesala)
  ante: { x0: -7, x1: 7, z0: -444, z1: -433.4, h: 4.2 }, // antesala: el portero y la puerta blindada
  door: { x: 0, z: -444, w: 2.6, h: 3.1 }, // puerta blindada (antesala -> club)
  doorman: { x: 2.3, z: -441.2, yaw: -Math.PI / 2 - 0.35 },
  hall: { x0: -24, x1: 24, z0: -478, z1: -444, h: 7.5 }, // el club
  // las alas (world/club-wings.js): x0..x1, z0 (norte)..z1 (sur), alto. Puertas desde el club: al norte en x = ±14.5
  // (coffeeshop y VIP), al este en z -475 (arsenal) y al oeste en z -471 (sala psicodélica).
  wings: {
    cafe: { x0: -36, x1: -12, z0: -500, z1: -478.4, h: 4.4 }, // el coffeeshop "Ámsterdam"
    grow: { x0: -56, x1: -36, z0: -500, z1: -478.4, h: 4.4 }, // la sala de cultivo (se ve desde el coffeeshop)
    hell: { x0: -12, x1: 12, z0: -522, z1: -478.4, h: 12, deck: 4.5 }, // El Infierno: dos pisos (balcón en U a 4.5 m)
    vip: { x0: 12, x1: 36, z0: -500, z1: -478.4, h: 5 }, // la sala VIP de los caños
    arsenal: { x0: 24.4, x1: 46, z0: -478, z1: -456, h: 4.2 }, // búnker militar: pistolas y granadas
    psico: { x0: -48, x1: -24.4, z0: -478, z1: -450, h: 5 }, // sala psicodélica (con los espejos deformantes al sur)
    maze: { x0: -58, x1: -26, z0: -449.8, z1: -420, h: 3.2 }, // el laberinto del terror (se entra por la psicodélica)
  },
  throne: { x: 17.6, z: -449.8, y: 0.62, yaw: -Math.PI / 2 - 0.55 }, // el trono del Diablo (sobre la tarima)
  // el pentagrama del Búnker (en el piso del club, a la vista del trono): adonde llega el ritual y desde donde el
  // Diablo se vuelve al castillo con los que elija. Antes se llegaba al borde de la tarima del trono y los que
  // venían con él quedaban metidos adentro de la tarima.
  pentagram2: { x: 9.8, z: -456.6, r: 1.7 },
  arrive: { x: 9.8, z: -456.6, yaw: 0.85 }, // mirando al trono
  // pentagrama del cuarto secreto (castillo, piso F0): parado adentro, el Diablo abre el ritual
  pentagram: { x: 13, z: -120.3, r: 1.85, yaw: 0.58 }, // yaw: al volver del Búnker, mirando a la puerta secreta
  // la tumba de la cripta que tiene la escalera (y adónde volvés al subir)
  tomb: { x: 10.5, z: -119.5, back: { x: 11.9, z: -119.5, yaw: -Math.PI / 2 } },
};
// el búnker es zona PvP (hay jaula de peleas, armas y granadas); "secret": no aparece en la lista de actividades
ZONES.bunker = { x0: CLUB.x0, z0: CLUB.z0, x1: CLUB.x1, z1: CLUB.z1, pvp: true, name: 'El Búnker', secret: true };
export function inClub(x, z, pad = 0) {
  return x >= CLUB.x0 - pad && x <= CLUB.x1 + pad && z >= CLUB.z0 - pad && z <= CLUB.z1 + pad;
}
// ¿se puede estar acá? (el mapa, o adentro del búnker)
export function playableAt(x, z) {
  return (x >= MAP_BOUNDS.x0 && x <= MAP_BOUNDS.x1 && z >= MAP_BOUNDS.z0 && z <= MAP_BOUNDS.z1) || inClub(x, z);
}

// Tormenta local: adentro del rectángulo es de noche, llueve y truena; hacia afuera se desvanece en `fade` metros.
export const STORM = { x0: -62, z0: -142, x1: 62, z1: -74, fade: 18 };
// de dónde llega la luz de la luna (desplazamiento desde el punto iluminado): alta, desde el sudoeste
export const MOON = [-70, 150, 109.2];
export function stormAt(x, z) {
  const dx = Math.max(STORM.x0 - x, 0, x - STORM.x1), dz = Math.max(STORM.z0 - z, 0, z - STORM.z1);
  const t = Math.min(1, Math.hypot(dx, dz) / STORM.fade);
  return 1 - t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- Pasto cortable en todo el mapa
// Una sola grilla (celdas de 30 cm) para todo el pasto: el Gran Pasto y todo lo verde de afuera.
export const GRASSMAP = { x0: MAP_BOUNDS.x0, z0: MAP_BOUNDS.z0, x1: MAP_BOUNDS.x1, z1: MAP_BOUNDS.z1, cell: 0.3 };
GRASSMAP.w = Math.round((GRASSMAP.x1 - GRASSMAP.x0) / GRASSMAP.cell);
GRASSMAP.h = Math.round((GRASSMAP.z1 - GRASSMAP.z0) / GRASSMAP.cell);
// Piso duro sin pasto (x0, z0, x1, z1): calles, veredas, edificios, explanadas, estacionamiento, pista
export const NO_GRASS = [
  [95, -42, 123, 16], [95, -20, 123, -12], [95, 18, 123, 44], [82, -125, 95, 125],
  [-40, -77, 40, -52], [-62, -135, 62, -74], [40, -56, 82, -52], [-82, -56, -40, -52],
  [-84, -56, -80, -4], [-102, -22, -86, -6], [-86, -25, -74, 7], [-20, 60, 20, 78],
];
// 1 = puede haber pasto, 0 = piso duro (se calcula una vez; lo usan servidor y cliente)
let _grassAllowed = null;
export function grassAllowed() {
  if (_grassAllowed) return _grassAllowed;
  const G = GRASSMAP, m = new Uint8Array(G.w * G.h);
  for (let j = 0; j < G.h; j++) {
    const z = G.z0 + (j + 0.5) * G.cell;
    for (let i = 0; i < G.w; i++) {
      const x = G.x0 + (i + 0.5) * G.cell;
      let ok = x > G.x0 + 1.2 && x < G.x1 - 1.2 && z > G.z0 + 1.2 && z < G.z1 - 1.2;
      if (ok) for (const r of NO_GRASS) if (x > r[0] && x < r[2] && z > r[1] && z < r[3]) { ok = false; break; }
      m[j * G.w + i] = ok ? 1 : 0;
    }
  }
  // el asfalto del circuito (con su banquina): se estampa a lo largo de la línea del medio
  const R = CIRCUIT.width / 2 + 1.2, rc = Math.ceil(R / G.cell);
  for (const [cx, cz] of circuitSamples()) {
    const ci = Math.floor((cx - G.x0) / G.cell), cj = Math.floor((cz - G.z0) / G.cell);
    for (let dj = -rc; dj <= rc; dj++) for (let di = -rc; di <= rc; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= G.w || j >= G.h || (di * di + dj * dj) * G.cell * G.cell > R * R) continue;
      m[j * G.w + i] = 0;
    }
  }
  _grassAllowed = m;
  return m;
}

export function zoneAt(x, z) {
  for (const k in ZONES) {
    const r = ZONES[k];
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return k;
  }
  return null;
}
export function isPvpAt(x, z) {
  const k = zoneAt(x, z);
  return !!(k && ZONES[k].pvp);
}

// ---------------------------------------------------------------- Pintura libre
// Cualquier plano pintable del mundo se divide en parches de 2 x 2 m que se crean al pintarlos.
// El id describe el parche entero (normal en milésimas, distancia al origen en cm, celda i/j),
// así el servidor y todos los clientes reconstruyen la misma geometría sin registrar nada.
export const PAINT = { cell: 2, ppm: 36, maxPatches: 900 };
PAINT.px = Math.round(PAINT.cell * PAINT.ppm);

function normQ(qx, qy, qz) {
  const l = Math.hypot(qx, qy, qz) || 1;
  return [qx / l, qy / l, qz / l];
}
export function patchBasis(n) {
  // pisos/techos: u = X proyectado; paredes: u = horizontal (arriba × n), v = n × u (hacia arriba)
  let u = Math.abs(n[1]) > 0.7 ? [1 - n[0] * n[0], -n[0] * n[1], -n[0] * n[2]] : [n[2], 0, -n[0]];
  const l = Math.hypot(u[0], u[1], u[2]) || 1;
  u = [u[0] / l, u[1] / l, u[2] / l];
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return { u, v };
}
// Punto sobre un plano -> plano cuantizado y coordenadas (a, b) en metros dentro del plano
export function patchAt(nx, ny, nz, x, y, z) {
  const qx = Math.round(nx * 1000), qy = Math.round(ny * 1000), qz = Math.round(nz * 1000);
  const n = normQ(qx, qy, qz);
  const qd = Math.round((n[0] * x + n[1] * y + n[2] * z) * 100);
  const { u, v } = patchBasis(n);
  return { q: [qx, qy, qz, qd], a: u[0] * x + u[1] * y + u[2] * z, b: v[0] * x + v[1] * y + v[2] * z };
}
export function patchId(q, i, j) {
  return 'p' + q[0] + ',' + q[1] + ',' + q[2] + ',' + q[3] + ',' + i + ',' + j;
}
export function parsePatch(id) {
  if (typeof id !== 'string' || id[0] !== 'p' || id.length > 64) return null;
  const nums = id.slice(1).split(',').map(Number);
  if (nums.length !== 6 || !nums.every(Number.isInteger)) return null;
  const [qx, qy, qz, qd, i, j] = nums;
  const ql = Math.hypot(qx, qy, qz);
  if (ql < 900 || ql > 1100) return null;
  const n = normQ(qx, qy, qz);
  const { u, v } = patchBasis(n);
  const d = qd / 100, C = PAINT.cell;
  const c = [0, 1, 2].map((k) => n[k] * d + u[k] * (i + 0.5) * C + v[k] * (j + 0.5) * C);
  if ((c[0] < MAP_BOUNDS.x0 - 5 || c[0] > MAP_BOUNDS.x1 + 5 || c[2] < MAP_BOUNDS.z0 - 5 || c[2] > MAP_BOUNDS.z1 + 5) && !inClub(c[0], c[2], 5)) return null;
  if (c[1] < -2 || c[1] > 80) return null;
  return { id, patch: true, n, u, v, d, i, j, c, w: C, h: C, ppm: PAINT.ppm, pw: PAINT.px, ph: PAINT.px, horizontal: Math.abs(n[1]) > 0.7 };
}

// ---------------------------------------------------------------- Spawns
export const SPAWN = { x: 0, z: -60, r: 7, yaw: 0 };

// ---------------------------------------------------------------- Superficies para graffiti
// c: centro, yaw: hacia dónde mira la cara pintable, w/h en metros, ppm = pixeles por metro.
// horizontal: true => plano en el piso (w en X, h en Z).
export const SURFACES = [
  { id: 'callejon_bar', c: [109, 2.5, -19.84], yaw: 0, w: 28, h: 5, ppm: 44 },
  { id: 'callejon_cine', c: [109, 3.0, -12.16], yaw: Math.PI, w: 28, h: 6, ppm: 44 },
  { id: 'callejon_fondo', c: [122.84, 2.5, -16], yaw: -Math.PI / 2, w: 8, h: 5, ppm: 44 },
  { id: 'bar_frente_n', c: [94.84, 1.9, -37.1], yaw: -Math.PI / 2, w: 9.6, h: 3.8, ppm: 44 },
  { id: 'bar_frente_s', c: [94.84, 1.9, -24.9], yaw: -Math.PI / 2, w: 9.6, h: 3.8, ppm: 44 },
  { id: 'cine_frente_n', c: [94.84, 2.0, -5.6], yaw: -Math.PI / 2, w: 12.4, h: 4, ppm: 40 },
  { id: 'cine_frente_s', c: [94.84, 2.0, 9.6], yaw: -Math.PI / 2, w: 12.4, h: 4, ppm: 40 },
  { id: 'bar_ring_pared', c: [122.84, 2.2, -31], yaw: -Math.PI / 2, w: 16, h: 4.4, ppm: 40 },
  { id: 'galpon', c: [-94, 2.5, -22.16], yaw: Math.PI, w: 16, h: 5, ppm: 40 },
  { id: 'cartel', c: [122.43, 6.0, 31], yaw: -Math.PI / 2, w: 14, h: 5, ppm: 44 },
  { id: 'paredon_n', c: [109, 1.7, 39.83], yaw: Math.PI, w: 16, h: 3.4, ppm: 44 },
  { id: 'paredon_s', c: [109, 1.7, 40.17], yaw: 0, w: 16, h: 3.4, ppm: 44 },
  { id: 'estacionamiento', c: [109, 0.02, 29], w: 28, h: 20, ppm: 22, horizontal: true },
  { id: 'ring', c: [117.5, 0.025, -31], w: 9, h: 9, ppm: 30, horizontal: true },
];
for (const s of SURFACES) {
  s.pw = Math.round(s.w * s.ppm);
  s.ph = Math.round(s.h * s.ppm);
}
export const SURFACE_BY_ID = Object.fromEntries(SURFACES.map((s) => [s.id, s]));

// ---------------------------------------------------------------- Pantallas (YouTube)
// ---------------------------------------------------------------- Ajedrez (game/chess.js, reglas en shared/chess.js)
// c: el centro de la cara de juego del tablero; yaw: las blancas quedan del lado -z local del tablero. seats: dónde se
// sienta cada color (x, z, yaw mirando a la mesa; y = el almohadón). El piso de arriba del castillo está en 10.3
// (world/castle-expansion.js UPPER_FLOOR).
export const CHESS_BOARDS = [
  {
    id: 'condes', name: 'Ajedrez del cuarto de los condes', c: [-14, 10.3 + 0.768, -118.1], yaw: Math.PI / 2,
    seats: { w: { x: -15.3, y: 10.3 + 0.46, z: -118.1, yaw: Math.PI / 2 }, b: { x: -12.7, y: 10.3 + 0.46, z: -118.1, yaw: -Math.PI / 2 } },
  },
  {
    id: 'biblioteca', name: 'Ajedrez de la biblioteca', c: [12.3, CASTLE.keep.floor + 0.768, -108.4], yaw: 0,
    seats: { w: { x: 12.3, y: CASTLE.keep.floor + 0.46, z: -109.35, yaw: 0 }, b: { x: 12.3, y: CASTLE.keep.floor + 0.46, z: -107.45, yaw: Math.PI } },
  },
];

// ---------------------------------------------------------------- Cámaras de seguridad (game/cctv.js)
// eye: ojo del castillo (si no, cámara común). p: dónde está; look: adónde apunta de reposo. Cada una tiene un altavoz:
// se habla por ahí desde la sala de monitores y suena la música de YouTube de 'cctv_pa' (ver SCREENS).
export const CCTV_CAMS = [
  { id: 'porton', name: 'PORTÓN', p: [5.6, 5.2, -74.4], look: [0, 0.5, -60] },
  { id: 'feria', name: 'LA FERIA', p: [-7.6, 5.2, -74.4], look: [-22, 0.5, -62] },
  { id: 'taberna', name: 'LA TABERNA', p: [31, 4.6, -77.7], look: [22, 0.8, -62] },
  { id: 'fogon', name: 'EL FOGÓN', p: [-14.3, 4.2, -102.6], look: [-27, 0.6, -91], eye: true },
  { id: 'cementerio', name: 'CEMENTERIO', p: [26.4, 4.2, -129.3], look: [35, 0.6, -115], eye: true },
  { id: 'huerta', name: 'LA HUERTA', p: [-26.4, 4.2, -129.3], look: [-36, 0.6, -114], eye: true },
  { id: 'patio', name: 'PATIO', p: [25.7, 5, -102.5], look: [28, 0.6, -88], eye: true },
  { id: 'cripta', name: 'LA CRIPTA', p: [22.9, 2.3, -124.2], look: [13, 0.4, -112], eye: true },
  { id: 'bar', name: 'BAR CORTACÉSPED', p: [96.2, 3.6, -41.3], look: [106, 0.6, -30] },
  { id: 'cancha', name: 'LA CANCHA', p: [-31.5, 6.5, 17.5], look: [0, 0, 35], pole: true },
  { id: 'galpon', name: 'EL GALPÓN', p: [-86.5, 4.5, -21.5], look: [-94, 0.5, -14] },
  { id: 'pista', name: 'BÚNKER · PISTA', p: [-22.5, 6.2, -476.5], look: [0, 0.5, -460] },
];

export const SCREENS = [
  {
    id: 'cine', name: 'Cine Gran Desmadre', c: [122.6, 4.3, 2], yaw: -Math.PI / 2, w: 13, h: 7.3125,
    zone: 'cine', hearFull: 0, hearMax: 6, // se escucha adentro del cine (y un poco afuera de la puerta)
  },
  {
    id: 'rockola', name: 'Rockola del Bar', c: [99.6, 2.75, -20.26], yaw: Math.PI, w: 1.9, h: 1.069,
    zone: 'bar', hearFull: 0, hearMax: 14,
  },
  {
    id: 'autocine', name: 'Autocine', c: [0, 7.2, 71.6], yaw: Math.PI, w: 21, h: 11.8125,
    zone: null, hearFull: 35, hearMax: 110,
  },
  {
    id: 'fogon', name: 'Pantalla del Fogón', c: [-38.35, 3.2, -92.5], yaw: Math.PI / 2, w: 7, h: 3.9375,
    zone: null, hearFull: 9, hearMax: 32, // se escucha alrededor del fuego (y un poco en el patio)
  },
  // El Búnker: una pantalla por pista (se elige desde la cabina de cada sala). Se oye en su sala (box) y poquito al
  // lado; si pasa algo, la música sintetizada de esa sala se calla (no se pisan). idle: sin video se ve el
  // visualizador propio de la sala (world/club-screens.js) en vez del cartel de YouTube.
  {
    id: 'bunker', name: 'Pantalla del Búnker', c: [0, 4.2, -477.6], yaw: 0, w: 8, h: 4.5,
    box: CLUB.hall, hearFull: 0, hearMax: 9, idle: true,
  },
  {
    id: 'bunker_cafe', name: 'Tele del Coffeeshop', c: [-25.2, 2.62, -478.5], yaw: Math.PI, w: 2.8, h: 1.575,
    box: CLUB.wings.cafe, hearFull: 0, hearMax: 7, idle: true,
  },
  {
    id: 'bunker_vip', name: 'Pantalla de la VIP', c: [35.86, 3.85, -488], yaw: -Math.PI / 2, w: 2.88, h: 1.62,
    box: CLUB.wings.vip, hearFull: 0, hearMax: 7, idle: true,
  },
  {
    id: 'bunker_hell', name: 'Pantalla del Infierno', c: [-11.74, 7.6, -500], yaw: Math.PI / 2, w: 5.6, h: 3.15,
    box: CLUB.wings.hell, hearFull: 0, hearMax: 8, idle: true,
  },
  {
    id: 'bunker_psico', name: 'Pantalla de La Mente', c: [-41.8, 3.0, -477.9], yaw: 0, w: 3.2, h: 1.8,
    box: CLUB.wings.psico, hearFull: 0, hearMax: 7, idle: true,
  },
  // los parlantes de las cámaras: no tiene pantalla (hidden); se elige desde la sala de monitores y se oye cerca de
  // cualquier cámara (pa: dónde están los altavoces)
  {
    id: 'cctv_pa', name: 'Altavoces de las cámaras', c: [-20.1, 1.0, -448.5], yaw: -Math.PI / 2, w: 1.6, h: 0.9,
    hidden: true, pa: CCTV_CAMS.map((c) => c.p), hearFull: 2.5, hearMax: 15,
  },
];
export const SCREEN_BY_ID = Object.fromEntries(SCREENS.map((s) => [s.id, s]));

// ---------------------------------------------------------------- Vehículos
export const VEHICLES = [
  { id: 1, type: 'mower', color: 0xc8312b, p: [-79, 0, -19], yaw: Math.PI / 2 },
  { id: 2, type: 'mower', color: 0x2f8f3a, p: [-79, 0, -15], yaw: Math.PI / 2 },
  { id: 3, type: 'mower', color: 0xe0b020, p: [-79, 0, -11], yaw: Math.PI / 2 },
  { id: 4, type: 'mower', color: 0x2a5bd7, p: [-79, 0, -7], yaw: Math.PI / 2 },
  { id: 5, type: 'tractor', color: 0x2d5a3c, p: [-78, 0, 2], yaw: Math.PI / 2 },
  { id: 6, type: 'mower', color: 0xd96a1b, p: [-30, 0, -55], yaw: 0 },
  { id: 7, type: 'tractor', color: 0x7a1f2b, p: [30, 0, -55], yaw: 0 },
  { id: 8, type: 'mower', color: 0x8e44ad, p: [60, 0, -55], yaw: 0 },
  { id: 9, type: 'cart', color: 0xf2f2ee, p: [86, 0, -8], yaw: 0 },
  // Circuito del Desmadre: los autos en la calle de boxes (al sur, afuera de la pista, mirando al este: se sale a la
  // recta antes de la tribuna) y las motos en el pasto de adentro de la largada
  { id: 10, type: 'racecar', color: 0xd81e1e, p: [-103, 0, 130.2], yaw: Math.PI / 2 },
  { id: 11, type: 'racecar', color: 0x1e5ad8, p: [-108.5, 0, 130.2], yaw: Math.PI / 2 },
  { id: 12, type: 'racecar', color: 0xf2c21b, p: [-114, 0, 130.2], yaw: Math.PI / 2 },
  { id: 13, type: 'racecar', color: 0x1b9a3a, p: [-119.5, 0, 130.2], yaw: Math.PI / 2 },
  { id: 14, type: 'moto', color: 0xff7a10, p: [-88, 0, 113.4], yaw: Math.PI / 2 },
  { id: 15, type: 'moto', color: 0x8a2be2, p: [-85.5, 0, 113.4], yaw: Math.PI / 2 },
  { id: 16, type: 'moto', color: 0x111111, p: [-83, 0, 113.4], yaw: Math.PI / 2 },
];

// ---------------------------------------------------------------- Muebles estáticos (render + colliders + asientos)
// k: tipo, p: posición (piso), r: yaw
export const FURNITURE = [];
function F(k, x, y, z, r = 0, extra = {}) { FURNITURE.push({ k, p: [x, y, z], r, ...extra }); }

// --- Bar
F('counter', 104, 0, -40.4, 0, { len: 13 });
F('shelf', 104, 0, -41.7, 0, { len: 12 });
F('bartable', 99.5, 0, -34.5);
F('bartable', 104, 0, -34.5);
F('bartable', 99.5, 0, -28.5);
F('pokertable', 106, 0, -26.5, 0, { id: 'poker_bar' });
F('pooltable', 115.3, 0, -38.7, Math.PI / 2, { id: 'pool_bar' }); // la juega game/pool.js (POOL_TABLE)
F('jukebox', 99.6, 0, -20.6, Math.PI);
F('bong', 96.3, 0, -22, Math.PI / 2, { id: 'bong_bar' });
F('couch', 96.1, 0, -25.2, Math.PI / 2, { seats: 3 });
F('weaponrack', 122.5, 0, -39.3, -Math.PI / 2);
F('ringposts', 117.5, 0, -31, 0, { size: 9 });
F('bench', 112, 0, -31, Math.PI / 2, { len: 6, seats: 4 });
F('bench', 117.5, 0, -24.6, Math.PI, { len: 6, seats: 4 });
// lámparas colgantes (la luz la ponen las luces interiores del bar, alineadas con estas)
for (const [x, z] of [[100, -36], [117.5, -31], [102, -39], [107, -39]]) F('lamp_bar', x, 5, z, 0, { nolight: true });
F('decor', 108, 1.505, -20.16, Math.PI, { m: 'd_dartboard' });
F('decor', 110.2, 1.12, -40.55, 0, { m: 'd_register' });
F('decor', 96.2, 0, -40.8, 0, { m: 'd_plant' });
F('decor', 96.2, 0, -21.2, 0, { m: 'd_plant' });
F('neon', 95.05, 3.7, -31, -Math.PI / 2, { text: 'BAR', color: '#ff3b6b' });

// --- Cine: filas de butacas mirando a la pantalla (+X)
for (let row = 0; row < 7; row++) {
  const x = 104 + row * 2.2;
  for (const side of [-1, 1]) {
    for (let s = 0; s < 6; s++) {
      const z = 2 + side * (1.6 + s * 0.85);
      F('cineseat', x, row * 0.0, z, Math.PI / 2, { seats: 1 });
    }
  }
}
F('candybar', 98, 0, -8.8, 0, { len: 5 });
F('neon', 95.05, 5.3, 2, -Math.PI / 2, { text: 'CINE', color: '#ffd23b' });

// --- Callejón
F('dumpster', 120.5, 0, -18.4, 0);
F('couch', 106, 0, -18.9, 0, { seats: 3, dirty: true });
F('barrel_fire', 112, 0, -16, 0);

// --- Estacionamiento
F('car', 99, 0, 22, Math.PI / 2, { color: 0x3a6ea5 });
F('car', 99, 0, 26.5, Math.PI / 2, { color: 0xa33b3b });
F('paredon', 109, 0, 40, 0, { len: 16, h: 3.4 });
F('billboard', 122.6, 0, 31, -Math.PI / 2, { w: 14, h: 5 });

// --- Explanada y fogón del castillo (el resto del castillo lo arma world/castle.js)
F('grill', -17.2, 0, -98.4, 0, { id: 'parrilla' });
F('cooler', -20.2, 0, -99.0, 0, { id: 'cooler_fogon' });
F('bong', -16.4, 0, -86.4, 0, { id: 'bong_fogon' });
F('bench', -12, 0, -60, 0, { len: 3, seats: 2 });
F('bench', 12, 0, -60, 0, { len: 3, seats: 2 });

// --- Decoración (modelos CC0 de Poly Haven; si no cargan, no se dibujan)
// faroles en la vereda del pueblo, en la explanada y en los senderos
for (const [x, z] of [[-36, -53.2], [-12, -53.2], [12, -53.2], [36, -53.2],
  [50, -56.3], [66, -56.3], [77, -53.2], [-50, -56.3], [-66, -56.3], [-84.3, -40], [-84.3, -24]]) {
  F('decor', x, 0, z, Math.abs(x)>70 ? Math.PI/2 : x<0 ? .35 : -.35,
    { m: 'd_streetlamp', col: { r: 0.12, h: 4 }, light: {at:[0,3.54,0],color:0xffce89,i:3,d:8} });
}
// mesas de picnic en la explanada este
F('decor', 27, 0, -63, Math.PI / 2, { m: 'd_picnic', col: [1.1, 0.36, 1.45] });
F('decor', 33.5, 0, -67, Math.PI / 2, { m: 'd_picnic', col: [1.1, 0.36, 1.45] });
// pueblo: hidrantes y barreras de hormigón
F('decor', 93.3, 0.09, -47.5, -Math.PI / 2, { m: 'd_hydrant', col: { r: 0.14, h: 0.8 } });
F('decor', 93.3, 0.09, 47.5, -Math.PI / 2, { m: 'd_hydrant', col: { r: 0.14, h: 0.8 } });
F('decor', 121.2, 0, 42.3, 0.1, { m: 'd_barrier', col: [0.78, 0.42, 0.3] });
F('decor', 118.9, 0, 42.6, -0.05, { m: 'd_barrier', col: [0.78, 0.42, 0.3] });
// callejón: luces de pared
F('decor', 104, 3.1, -19.85, 0, { m: 'd_wall_lamp', light: { at: [0, 0.2, 0.4], color: 0xffd9a0, i: 5, d: 9 } });
F('decor', 114, 3.1, -12.15, Math.PI, { m: 'd_security_light' });

// --- Autocine
F('autocine', 0, 0, 71.6, Math.PI);

// --- Galpón
F('fuelpump', -84.5, 0, -24.5, Math.PI / 2);
F('workbench', -100.5, 0, -14, Math.PI / 2, { len: 5 });

// --- Pista de saltos
F('ramp', -103.3, 0, 45, Math.PI, { w: 7.6, l: 5, h: 1.7 }); // Circuito: el salto sobre la cama de pinchos

// Puntos de interacción (se completan en el cliente con los muebles que tienen id)
// la mesa de pool del bar (game/pool.js, física y reglas en shared/pool.js): c = centro del paño (arriba), yaw como
// la mesa del FURNITURE (el largo de la mesa va por el z local)
export const POOL_TABLE = { c: [115.3, 0.9, -38.7], yaw: Math.PI / 2 };

export const INTERACT = [
  { id: 'pool', k: 'pool', p: [115.3, 1.0, -38.7], r: 2.3, label: 'Jugar al pool' },
  { id: 'apuestas_bar', k: 'bets', ring: 'bar', p: [113.2, 1.0, -26.3], r: 2.2, label: 'Apostar a la pelea' }, // al lado del ring del bar
  { id: 'apuestas_jaula', k: 'bets', ring: 'jaula', p: [8.6, 1.0, -468], r: 2.4, label: 'Apostar a la pelea' }, // al lado de la jaula del Búnker
  { id: 'rockola', k: 'media', screen: 'rockola', p: [99.6, 1.0, -21.2], r: 1.8, label: 'Elegir música en la rockola' },
  { id: 'cine_pochoclos', k: 'npc', shop: 'cinema', p: [98,1,-7.8], r: 2, label: 'Pedir pochoclos o una bebida' },
  { id: 'cine_cabina', k: 'media', screen: 'cine', p: [97.5, 1.0, 2], r: 2.2, label: 'Elegir película / video' },
  { id: 'cine_cabina2', k: 'media', screen: 'cine', p: [103, 1.0, 2], r: 2.0, label: 'Elegir película / video' },
  { id: 'autocine_poste', k: 'media', screen: 'autocine', p: [0, 1.0, 64], r: 2.4, label: 'Elegir video del autocine' },
  { id: 'bong_bar', k: 'bong', p: [96.3, 1.0, -22], r: 1.6, label: 'Pegarle al bong' },
  { id: 'bong_fogon', k: 'bong', p: [-16.4, 1.0, -86.4], r: 1.6, label: 'Pegarle al bong' },
  { id: 'cooler_fogon', k: 'cooler', p: [-20.2, 1.0, -99.0], r: 1.6, label: 'Sacar una birra de la heladerita' },
  { id: 'barra', k: 'cooler', p: [104, 1.0, -39.2], r: 6.5, label: 'Pedir un trago en la barra' },
  { id: 'parrilla', k: 'grill', p: [-17.2, 1.0, -98.4], r: 2.0, label: 'Comerse un choripán' },
  { id: 'fogon_proyector', k: 'media', screen: 'fogon', p: [-17.4, 1.0, -91.3], r: 2.0, label: 'Elegir video o historia de terror' },
  { id: 'futbol', k: 'football', p: [0, 1.0, 15.4], r: 2.6, label: 'Iniciar / reiniciar el partido de fútbol' },
  { id: 'bunker_dj', k: 'media', screen: 'bunker', p: [-7.2, 1.5, -470.4], r: 2.6, label: 'Pasar música o un video en el Búnker' },
  // las cabinas de las otras pistas del Búnker (world/club-wings.js): cada una maneja la pantalla de su sala
  { id: 'cafe_dj', k: 'media', screen: 'bunker_cafe', p: [-25.2, 1.0, -479.6], r: 1.7, label: 'Poner música en el equipo del coffeeshop' },
  { id: 'vip_dj', k: 'media', screen: 'bunker_vip', p: [24, 1.0, -497.5], r: 2.0, label: 'Pasar música o un video en la VIP' },
  { id: 'hell_dj', k: 'media', screen: 'bunker_hell', p: [0, 2.2, -518.3], r: 2.3, label: 'Pasar música o un video en el Infierno' },
  { id: 'psico_dj', k: 'media', screen: 'bunker_psico', p: [-41.8, 1.0, -475.4], r: 2.0, label: 'Pasar música o un video en La Mente' },
];

// Botiquines: curan, cortan el sangrado y devuelven sangre (cada uno se repone solo). yaw: hacia dónde mira
export const MEDKITS = [
  { id: 'medkit_bar', p: [114, 1.45, -20.35], yaw: Math.PI, wall: true },
  { id: 'medkit_fogon', p: [-14.4, 0, -92.5], yaw: Math.PI / 2, wall: false },
  { id: 'medkit_galpon', p: [-101.8, 1.45, -10], yaw: Math.PI / 2, wall: true },
  { id: 'medkit_cancha', p: [3.2, 0, 15.2], yaw: Math.PI, wall: false },
  { id: 'medkit_plaza', p: [-6, 0, -56.6], yaw: 0, wall: false },
];
for (const m of MEDKITS) {
  const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
  INTERACT.push({ id: m.id, k: 'medkit', p: [m.p[0] + fx * 0.6, 1.0, m.p[2] + fz * 0.6], r: 1.8, label: 'Usar el botiquín (vida, venda, sangre)' });
}

// ---------------------------------------------------------------- Props agarrables
// Tipos: definidos en props.js del cliente. Acá solo posiciones iniciales.
export const PROPS = [];
let _pid = 1;
function P(type, x, y, z, yaw = 0) { PROPS.push({ id: _pid++, type, p: [x, y, z], yaw }); }

// Barra: botellas y banquetas
for (let i = 0; i < 7; i++) P('bottle', 99 + i * 1.7, 1.24, -40.2, i);
for (let i = 0; i < 6; i++) P('stool', 99.8 + i * 1.9, 0.0, -38.9);
// Mesas del bar: sillas alrededor + botellas encima
for (const [tx, tz] of [[99.5, -34.5], [104, -34.5], [99.5, -28.5]]) {
  P('chair', tx - 1.0, 0, tz, Math.PI / 2);
  P('chair', tx + 1.0, 0, tz, -Math.PI / 2);
  P('chair', tx, 0, tz - 1.0, 0);
  P('chair', tx, 0, tz + 1.0, Math.PI);
  P('bottle', tx + 0.2, 0.825, tz + 0.1);
  P('bottle', tx - 0.25, 0.825, tz - 0.15);
}
// Latas en la barra y pochoclos en el cine (se agarran, se toman, se revolean)
for (let i = 0; i < 4; i++) P('can', 100.2 + i * 2.9, 1.18, -40.35, i);
for (let i = 0; i < 6; i++) P('popcorn', 96.4 + i * 0.6, 1.08, -8.8, i);
// Armería del ring
const rack = ['bat', 'sword', 'axe', 'machete', 'sledge', 'knife', 'pan', 'bat', 'sword', 'guitar'];
rack.forEach((t, i) => P(t, 121.9, 1.0, -41.2 + i * 0.42, 0));
// Ring: unas sillas para revolear
P('chair', 114, 0, -35, 0.4);
P('chair', 121, 0, -27, 2.2);
P('trashcan', 113.5, 0, -22.5);
P('crate', 121.8, 0, -23.2);

// Bar: cartel de piso mojado y barreta en el ring
P('wetsign', 101.8, 0, -36.9, 0.5);
P('crowbar', 121.9, 1.0, -37, 0);
P('box', 121.5, 0, -24.4, 0.3);

// Callejón
P('barrel', 121.4, 0, -14.2);
P('box', 119.6, 0, -18.6, 0.2);
P('box', 119.8, 0.35, -18.5, -0.3);
P('trashcan', 97, 0, -13.4);
P('trashcan', 98.2, 0, -13.4);
P('crate', 118, 0, -13.2);
P('crate', 118, 0.5, -13.2);
P('cone', 100, 0, -16);
P('bottle', 106.4, 0.0, -18.4);

// Estacionamiento
for (let i = 0; i < 6; i++) P('cone', 104 + i * 2.4, 0, 33);
P('trashcan', 96.5, 0, 42.5);

// Fogón del castillo (antes en la terraza de la mansión)
P('bottle', -20.3, 0.9, -86.8);
P('bottle', -20.7, 0.9, -87.1);
P('bottle', -20.4, 0.9, -87.3);
P('watermelon', -15.6, 0, -97.4); // en el piso, al lado de la parrilla (a 0.4 m flotaban)
P('watermelon', -15.3, 0, -98.1);
P('gnome', -18, 0, -71.5, 0.5);
P('gnome', 18, 0, -71.5, -0.5);
P('chair', -22.2, 0, -87.6, 1.9);
P('chair', -18.8, 0, -87.8, -1.6);

// Pasto: pelotas y enanitos de jardín (que se pueden picar con la cortadora...)
P('gnome', -40, 0, -20, 1);
P('gnome', 35, 0, 22, -2);
P('gnome', 5, 0, 45, 3);
P('gnome', -55, 0, 40, 0.3);
P('frisbee', 10, 0.2, -45);

// Galpón
P('crate', -100.5, 0, -18.5);
P('crate', -100.5, 0, -9.5);
P('trashcan', -87, 0, -21);
P('cone', -84, 0, -3);
P('cone', -84, 0, -1);

export const FIRST_DYNAMIC_PROP_ID = 10000;
