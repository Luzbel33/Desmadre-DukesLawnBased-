// Pool (bola 8): la física de las bolas y las reglas. La usan el servidor (simula cada tiro: es la verdad) y los
// clientes (repiten la misma simulación para animarla; al final se corrigen con lo que dijo el servidor).
// Todo en coordenadas de la mesa: x a lo ancho (±W), z a lo largo (±L), en metros; paso fijo de 1/240 s y sin
// funciones que cambien entre motores (solo + - * / y sqrt), así la jugada da igual en todos lados.
// Bolas: 0 la blanca, 1-7 lisas, 8 la negra, 9-15 rayadas.

export const R = 0.03; // radio de bola
export const TABLE = { W: 0.62, L: 1.22 }; // hasta dónde llega el centro de una bola (bandas)
// troneras: [x, z, radio de captura del centro de la bola]
export const POCKETS = [[-0.63, -1.23, 0.08], [0.63, -1.23, 0.08], [-0.645, 0, 0.075], [0.645, 0, 0.075], [-0.63, 1.23, 0.08], [0.63, 1.23, 0.08]];
export const HEAD = [0, -0.61]; // donde va la blanca
export const FOOT = [0, 0.61]; // el vértice del triángulo
const H = 1 / 240, DEC = 0.42, E_BALL = 0.94, E_RAIL = 0.76, MAX_T = 25;
export const MAX_SPEED = 6.8;

// el triángulo: la 8 al medio, una lisa y una rayada en las esquinas de atrás; el resto mezclado con la semilla
export function rack(seed = 1) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const rest = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  // esquinas de atrás: una de cada grupo
  const cornerS = rest.splice(rest.findIndex((n) => n < 8), 1)[0], cornerT = rest.splice(rest.findIndex((n) => n > 8), 1)[0];
  const balls = Array.from({ length: 16 }, (_, n) => ({ n, x: 0, z: 0, vx: 0, vz: 0, on: true }));
  balls[0].x = HEAD[0]; balls[0].z = HEAD[1];
  const d = R * 2 + 0.0018, row = d * 0.8660254;
  const slots = [];
  for (let r = 0; r < 5; r++) for (let k = 0; k <= r; k++) slots.push([(k - r / 2) * d, FOOT[1] + r * row]);
  // 0..14: el orden de las posiciones; la 8 en la del medio de la tercera fila (índice 4)
  const order = [];
  for (let i = 0; i < 15; i++) {
    if (i === 4) order.push(8);
    else if (i === 10) order.push(cornerS);
    else if (i === 14) order.push(cornerT);
    else order.push(rest.shift());
  }
  // un triángulo real nunca queda perfecto: micro-separaciones al azar (con la semilla) que abren el saque
  order.forEach((n, i) => { balls[n].x = slots[i][0] + (rnd() - 0.5) * 0.0016; balls[n].z = slots[i][1] + rnd() * 0.0012 + i * 0.0003; });
  return balls;
}

export const moving = (balls) => balls.some((b) => b.on && (b.vx !== 0 || b.vz !== 0));

// un paso de física; devuelve los eventos de este paso (choques, bandas, troneras)
export function step(balls, ev = [], t = 0) {
  // mover y frenar (el paño)
  for (const b of balls) {
    if (!b.on || (b.vx === 0 && b.vz === 0)) continue;
    b.x += b.vx * H; b.z += b.vz * H;
    const sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz), ns = sp - DEC * H;
    if (ns <= 0.004) { b.vx = 0; b.vz = 0; } else { b.vx *= ns / sp; b.vz *= ns / sp; }
  }
  // troneras
  for (const b of balls) {
    if (!b.on) continue;
    for (let p = 0; p < POCKETS.length; p++) {
      const [px, pz, cap] = POCKETS[p], dx = b.x - px, dz = b.z - pz;
      if (dx * dx + dz * dz < cap * cap) { b.on = false; b.vx = b.vz = 0; b.x = px; b.z = pz; ev.push({ k: 'pocket', i: b.n, p, t }); break; }
    }
  }
  // bolas entre sí
  for (let i = 0; i < 16; i++) {
    const a = balls[i];
    if (!a.on) continue;
    for (let j = i + 1; j < 16; j++) {
      const b = balls[j];
      if (!b.on) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
      if (d2 >= 4 * R * R || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      // separarlas (mitad cada una)
      const push = (2 * R - d) / 2;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      if (rel <= 0) continue;
      const imp = rel * (1 + E_BALL) / 2;
      a.vx -= imp * nx; a.vz -= imp * nz; b.vx += imp * nx; b.vz += imp * nz;
      ev.push({ k: 'hit', a: a.n, b: b.n, s: rel, t });
    }
  }
  // bandas
  const { W, L } = TABLE;
  for (const b of balls) {
    if (!b.on) continue;
    let hit = 0;
    if (b.x > W) { b.x = W; if (b.vx > 0) { hit = b.vx; b.vx = -b.vx * E_RAIL; } }
    else if (b.x < -W) { b.x = -W; if (b.vx < 0) { hit = -b.vx; b.vx = -b.vx * E_RAIL; } }
    if (b.z > L) { b.z = L; if (b.vz > 0) { hit = Math.max(hit, b.vz); b.vz = -b.vz * E_RAIL; } }
    else if (b.z < -L) { b.z = -L; if (b.vz < 0) { hit = Math.max(hit, -b.vz); b.vz = -b.vz * E_RAIL; } }
    if (hit > 0.05) ev.push({ k: 'rail', i: b.n, s: hit, t });
  }
  return ev;
}

// el tiro: la blanca sale con ángulo `ang` (0 = hacia +z) y fuerza `pow` (0..1)
export function strike(balls, ang, pow) {
  // la fuerza crece más arriba de la barra (abajo hay control fino; a fondo, el saque)
  const p = Math.max(0, Math.min(1, pow)), c = balls[0], sp = 0.25 + p * p * 0.55 * (MAX_SPEED - 0.25) + p * 0.45 * (MAX_SPEED - 0.25);
  c.vx = Math.sin(ang) * sp; c.vz = Math.cos(ang) * sp;
}
// simula hasta que se paran todas (o MAX_T segundos): devuelve los eventos con su tiempo
export function simulate(balls, ang, pow) {
  strike(balls, ang, pow);
  const ev = [];
  let t = 0;
  while (moving(balls) && t < MAX_T) { step(balls, ev, t); t += H; }
  for (const b of balls) { b.vx = 0; b.vz = 0; }
  return { ev, t };
}
export const STEP = H;

// la blanca de vuelta a la mesa después de meterla (en la cabecera; si está ocupada, se corre)
export function respot(balls, n, at = HEAD) {
  const b = balls[n];
  for (let k = 0; k < 40; k++) {
    const x = at[0] + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * R * 2.2 * (k > 20 ? 0 : 1), z = at[1] + (k > 20 ? (k - 20) * R * 2.2 : 0);
    if (balls.every((o) => o === b || !o.on || (o.x - x) ** 2 + (o.z - z) ** 2 > 4 * R * R * 1.1)) { b.x = x; b.z = z; b.on = true; b.vx = b.vz = 0; return; }
  }
  b.x = at[0]; b.z = at[1]; b.on = true;
}

// ---------------------------------------------------------------- reglas (bola 8, simplificadas)
// g: { cur: 0|1 (a quién le toca), grp: [null|'s'|'t', ...] (lisas/rayadas), solo, win: null|0|1, msg }
const kind = (n) => (n === 8 ? '8' : n < 8 ? 's' : 't');
export const GROUP_NAME = { s: 'lisas', t: 'rayadas' };
export function judge(g, balls, ev) {
  const potted = ev.filter((e) => e.k === 'pocket').map((e) => e.i);
  const firstHit = ev.find((e) => e.k === 'hit' && (e.a === 0 || e.b === 0));
  const first = firstHit ? (firstHit.a === 0 ? firstHit.b : firstHit.a) : null;
  const scratch = potted.includes(0), me = g.cur, other = 1 - me;
  const left = (grp) => balls.some((b) => b.on && kind(b.n) === grp);
  let mine = g.grp[me];
  g.msg = '';
  if (g.solo) { // práctica: nada de faltas, la 8 vuelve si queda algo; mesa limpia = se arma de nuevo
    if (scratch) respot(balls, 0);
    if (potted.includes(8) && balls.some((b) => b.on && b.n !== 0 && b.n !== 8)) { respot(balls, 8, FOOT); g.msg = 'La 8 vuelve (todavía quedan bolas)'; }
    if (!balls.some((b) => b.on && b.n !== 0)) { g.win = me; g.msg = '¡Mesa limpia!'; }
    return g;
  }
  let foul = scratch ? 'metiste la blanca' : first === null ? 'no tocaste ninguna' : null;
  if (!foul && mine && first !== null && kind(first) !== mine && !(first === 8 && !left(mine))) foul = 'tocaste primero una que no es tuya';
  if (!foul && !mine && first === 8) foul = 'tocaste primero la 8';
  if (potted.includes(8)) {
    // la 8 adentro: ganás si ya habías limpiado tu grupo (antes de este tiro) y sin falta; si no, perdés
    const clearedBefore = !!mine && balls.every((b) => kind(b.n) !== mine || (!b.on && !potted.includes(b.n)));
    g.win = clearedBefore && !foul ? me : other;
    g.msg = g.win === me ? '¡Metió la 8!' : foul ? `La 8 con falta (${foul})` : 'Metió la 8 antes de tiempo';
    return g;
  }
  if (!mine && !foul) { // mesa abierta: el primer grupo que mete es el suyo
    const p = potted.find((n) => n !== 0);
    if (p) { g.grp[me] = kind(p); g.grp[other] = kind(p) === 's' ? 't' : 's'; mine = g.grp[me]; g.msg = `Juega con las ${GROUP_NAME[mine]}`; }
  }
  if (scratch) respot(balls, 0);
  const keep = !foul && potted.some((n) => n !== 0 && kind(n) === mine);
  if (foul) g.msg = `Falta: ${foul}`;
  if (!keep) g.cur = other;
  return g;
}
